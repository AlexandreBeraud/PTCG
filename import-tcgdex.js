#!/usr/bin/env node
// PTCG Collection — import du catalogue TCGdex vers la table "cards".
//
// On importe en français. Quand une carte n'existe pas encore en FR sur
// TCGdex (extension récente pas encore traduite), on prend la version
// anglaise — nom des Pokémon traduit en FR — et on la marque lang='en'.
// Les ids TCGdex sont les mêmes dans toutes les langues : le jour où la
// version FR arrive, relancer le script remplace ces lignes en place, donc
// les ventes/dépenses déjà liées à ces cartes le restent.
//
// Jamais modifiés : les cartes FR déjà en base, les cartes manuelles
// (manual-…), le lien Cardmarket, card_category_overrides.
//
//   node import-tcgdex.js              nouvelles extensions + passage en FR des cartes EN
//   node import-tcgdex.js --dry-run    montre ce qui serait fait, sans rien écrire
//   node import-tcgdex.js --set=me05   ne traite que cette extension
//   node import-tcgdex.js --en=me05    accepte le repli anglais même pour une extension ancienne
//   node import-tcgdex.js --all        re-scanne toutes les extensions (long)
//
// Node 18+, et migration_cards_lang.sql appliquée avant le premier lancement.

const fs = require('fs');
const path = require('path');

const DB_URL = process.env.SB_URL || 'http://100.72.66.5:3003';
const DB_KEY = process.env.SB_KEY || 'self-hosted-no-jwt';
const TCGDEX = process.env.TCGDEX_URL || 'https://api.tcgdex.net/v2';

const args = process.argv.slice(2);
const argVal = name => ((args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1]) || null;
const ONLY_SET = argVal('set');
const FORCE_EN = new Set((argVal('en') || '').split(',').map(s => s.trim()).filter(Boolean));
const ALL = args.includes('--all');
const DRY_RUN = args.includes('--dry-run');

// Une extension qui n'existe qu'en anglais et plus vieille que ça est ignorée
// (promos US, sets jamais sortis en France…), sauf demande explicite --en=
const EN_FALLBACK_MAX_AGE_DAYS = 365;
const SET_CONCURRENCY = 3;
const CARD_CONCURRENCY = 6;
const BATCH_SIZE = 500;

const POKE_NAMES_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv';
const POKE_NAMES_CACHE = path.join(__dirname, '.pokemon-names-cache.json');

const TYPES_FR = {
  Grass: 'Plante', Fire: 'Feu', Water: 'Eau', Lightning: 'Électrique', Psychic: 'Psy',
  Fighting: 'Combat', Darkness: 'Obscurité', Metal: 'Métal', Dragon: 'Dragon',
  Fairy: 'Fée', Colorless: 'Incolore',
};

const cardImageUrl = base => base ? `${base}/high.png` : null;
const setLogoUrl = base => base ? `${base}.png` : null;

async function getJson(url, { allow404 = false } = {}) {
  const res = await fetch(url);
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── Base ────────────────────────────────────────────────────────────────

const dbHeaders = { apikey: DB_KEY, Authorization: `Bearer ${DB_KEY}` };

// set_id -> { ids, enIds } pour tout ce qui est déjà en base
async function loadDbCards() {
  const sets = new Map();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${DB_URL}/rest/v1/cards?select=id,set_id,lang&order=id.asc`, {
      headers: { ...dbHeaders, 'Range-Unit': 'items', Range: `${offset}-${offset + pageSize - 1}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      if (text.includes('lang')) throw new Error("la colonne cards.lang n'existe pas : applique d'abord migration_cards_lang.sql");
      throw new Error(`HTTP ${res.status} en lisant la table cards : ${text}`);
    }
    const rows = await res.json();
    for (const r of rows) {
      if (!r.set_id) continue;
      if (!sets.has(r.set_id)) sets.set(r.set_id, { ids: new Set(), enIds: new Set() });
      const s = sets.get(r.set_id);
      s.ids.add(r.id);
      if (r.lang === 'en') s.enIds.add(r.id);
    }
    if (rows.length < pageSize) break;
  }
  return sets;
}

// insert = ON CONFLICT DO NOTHING ; replace = met à jour les seules colonnes
// envoyées (cardmarket_url n'en fait pas partie, il est donc conservé)
async function writeCards(rows, mode) {
  const resolution = mode === 'replace' ? 'merge-duplicates' : 'ignore-duplicates';
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const res = await fetch(`${DB_URL}/rest/v1/cards`, {
      method: 'POST',
      headers: { ...dbHeaders, 'Content-Type': 'application/json', Prefer: `resolution=${resolution},return=minimal` },
      body: JSON.stringify(rows.slice(i, i + BATCH_SIZE)),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} en écrivant des cartes : ${await res.text().catch(() => '')}`);
  }
}

async function renameEnSet(setInfo) {
  const res = await fetch(`${DB_URL}/rest/v1/cards?set_id=eq.${encodeURIComponent(setInfo.id)}&lang=eq.en`, {
    method: 'PATCH',
    headers: { ...dbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ set_name: setInfo.name, set_logo: setLogoUrl(setInfo.logo) }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} en renommant l'extension : ${await res.text().catch(() => '')}`);
}

// ── Traduction des noms (cartes EN uniquement) ──────────────────────────

async function loadPokemonNames() {
  try {
    const cached = JSON.parse(fs.readFileSync(POKE_NAMES_CACHE, 'utf8'));
    if (Date.now() - cached.savedAt < 30 * 864e5) return cached.pairs;
  } catch (_) { /* pas encore de cache */ }

  const res = await fetch(POKE_NAMES_CSV);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur la liste des noms PokéAPI`);
  // pokemon_species_id,local_language_id,name,genus — 5 = fr, 9 = en
  const byId = {};
  for (const line of (await res.text()).split('\n').slice(1)) {
    const [id, lang, name] = line.split(',');
    if (!name || (lang !== '5' && lang !== '9')) continue;
    (byId[id] ||= {})[lang === '5' ? 'fr' : 'en'] = name.trim();
  }
  const pairs = Object.values(byId).filter(p => p.en && p.fr).map(p => [p.en, p.fr]);
  try { fs.writeFileSync(POKE_NAMES_CACHE, JSON.stringify({ savedAt: Date.now(), pairs })); } catch (_) {}
  return pairs;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildPokemonTranslator(pairs) {
  // les plus longs d'abord : "Mewtwo" avant "Mew", "Porygon-Z" avant "Porygon"
  const species = [...pairs]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([en, fr]) => ({
      fr,
      re: new RegExp(`(^|[\\s&(])${escapeRe(en).replace(/['’]/g, "['’]")}(?=$|[\\s\\-,)])`, 'g'),
    }));

  const P = '\u0000\\d+\u0000';
  const regions = { Alolan: "d'Alola", Galarian: 'de Galar', Hisuian: 'de Hisui', Paldean: 'de Paldea' };
  const adjectives = { Dark: 'obscur', Light: 'lumineux', Shining: 'brillant', Radiant: 'radieux' };

  // Renvoie null si aucun Pokémon n'est reconnu dans le nom
  return function translate(enName) {
    // un marqueur par Pokémon trouvé, remplacé à la fin : évite qu'un nom FR
    // déjà posé soit repris par une autre espèce
    const found = [];
    let s = enName;
    for (const sp of species) {
      s = s.replace(sp.re, (m, lead) => {
        found.push(sp.fr);
        return `${lead}\u0000${found.length - 1}\u0000`;
      });
    }
    if (!found.length) return null;

    // le nom du Pokémon doit venir en premier pour que le Pokédex retrouve la carte
    s = s.replace(/^(.+?)['’]s (.+)$/, (m, owner, rest) => {
      if (owner === 'Team Rocket') return `${rest} de la Team Rocket`;
      return /^[aeiouy]/i.test(owner) ? `${rest} d'${owner}` : `${rest} de ${owner}`;
    });
    s = s.replace(new RegExp(`\\bMega (${P})`, 'g'), 'Méga-$1');
    for (const [en, fr] of Object.entries(regions)) s = s.replace(new RegExp(`\\b${en} (${P})`, 'g'), `$1 ${fr}`);
    for (const [en, fr] of Object.entries(adjectives)) s = s.replace(new RegExp(`\\b${en} (${P})`, 'g'), `$1 ${fr}`);

    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => found[i]);
  };
}

function translateBasicEnergy(enName) {
  const m = enName.match(/^(?:Basic )?(\w+) Energy$/);
  return m && TYPES_FR[m[1]] ? `Énergie ${TYPES_FR[m[1]]} de base` : null;
}

let translatorPromise = null;
function getTranslator() {
  translatorPromise ||= loadPokemonNames()
    .then(buildPokemonTranslator)
    .catch(e => {
      console.warn(`⚠ Noms FR des Pokémon indisponibles (${e.message}) : les cartes EN gardent leur nom anglais.`);
      return () => null;
    });
  return translatorPromise;
}

// ── Import ──────────────────────────────────────────────────────────────

function isRecent(date) {
  if (!date) return false;
  return (Date.now() - new Date(date).getTime()) / 864e5 <= EN_FALLBACK_MAX_AGE_DAYS;
}

async function buildRows(briefCards, setInfo, lang) {
  if (!briefCards.length) return [];
  const translate = lang === 'en' ? await getTranslator() : null;

  return mapLimit(briefCards, CARD_CONCURRENCY, async c => {
    const full = await getJson(`${TCGDEX}/${lang}/cards/${encodeURIComponent(c.id)}`, { allow404: true }).catch(() => null);
    let name = (full && full.name) || c.name || '';
    let types = (full && full.types) || null;

    if (lang === 'en' && full) {
      const fr = full.category === 'Pokemon' ? translate(name)
        : full.category === 'Energy' && full.energyType === 'Basic' ? translateBasicEnergy(name)
        : null;
      if (fr) name = fr;
      if (types) types = types.map(t => TYPES_FR[t] || t);
    }

    return {
      id: c.id,
      name,
      image_url: cardImageUrl(c.image || (full && full.image)),
      set_id: setInfo.id,
      set_name: setInfo.name,
      set_logo: setLogoUrl(setInfo.logo),
      number: c.localId || (full && full.localId) || null,
      rarity: (full && full.rarity) || null,
      types,
      lang,
    };
  });
}

async function processSet(id, briefs, db, forceEn) {
  const inDb = db.get(id) || { ids: new Set(), enIds: new Set() };
  const label = (briefs.fr || briefs.en).name;

  const fr = briefs.fr ? await getJson(`${TCGDEX}/fr/sets/${encodeURIComponent(id)}`, { allow404: true }) : null;
  const frCards = (fr && fr.cards) || [];
  const frIds = new Set(frCards.map(c => c.id));

  const enTotal = (briefs.en && briefs.en.cardCount && briefs.en.cardCount.total) || 0;
  const wantEn = briefs.en && (!frCards.length || inDb.enIds.size > 0 || forceEn || enTotal > frCards.length);
  const en = wantEn ? await getJson(`${TCGDEX}/en/sets/${encodeURIComponent(id)}`, { allow404: true }) : null;

  if (!frCards.length && !inDb.ids.size && !forceEn && !(en && isRecent(en.releaseDate))) {
    return { id, label, skipped: true };
  }

  const frNew = frCards.filter(c => !inDb.ids.has(c.id));
  const frUpgrade = frCards.filter(c => inDb.enIds.has(c.id));
  const enNew = en ? (en.cards || []).filter(c => !frIds.has(c.id) && !inDb.ids.has(c.id)) : [];
  if (!frNew.length && !frUpgrade.length && !enNew.length) return { id, label };

  // les cartes EN d'une extension partiellement traduite prennent le nom FR de l'extension
  const frSet = fr && { id, name: fr.name || briefs.fr.name, logo: fr.logo || briefs.fr.logo };
  const enSet = frSet || { id, name: en.name || briefs.en.name, logo: en.logo || briefs.en.logo };

  const newRows = [...await buildRows(frNew, frSet, 'fr'), ...await buildRows(enNew, enSet, 'en')];
  const upgradeRows = await buildRows(frUpgrade, frSet, 'fr');

  if (!DRY_RUN) {
    await writeCards(newRows, 'insert');
    await writeCards(upgradeRows, 'replace');
    // cartes encore en anglais dans une extension maintenant traduite :
    // on aligne au moins le nom de l'extension
    if (frSet && [...inDb.enIds].some(cid => !frIds.has(cid))) await renameEnSet(frSet);
  }

  return {
    id, label,
    isNewSet: !inDb.ids.size,
    fr: frNew.length, en: enNew.length, upgraded: upgradeRows.length,
    samples: newRows.filter(r => r.lang === 'en').slice(0, 8).map(r => r.name),
  };
}

async function main() {
  console.log(`Import TCGdex${DRY_RUN ? ' (simulation, rien ne sera écrit)' : ''}\n`);

  const [db, frList, enList] = await Promise.all([
    loadDbCards(),
    getJson(`${TCGDEX}/fr/sets`),
    getJson(`${TCGDEX}/en/sets`),
  ]);

  const sets = new Map();
  for (const s of frList) sets.set(s.id, { fr: s, en: null });
  for (const s of enList) {
    if (sets.has(s.id)) sets.get(s.id).en = s;
    else sets.set(s.id, { fr: null, en: s });
  }

  for (const id of [ONLY_SET, ...FORCE_EN].filter(Boolean)) {
    if (!sets.has(id)) { console.error(`Extension "${id}" introuvable sur TCGdex (ni en FR, ni en EN).`); process.exit(1); }
  }

  let ids;
  if (ONLY_SET) ids = [ONLY_SET];
  else if (ALL) ids = [...sets.keys()];
  else ids = [...sets.keys()].filter(id => !db.has(id) || db.get(id).enIds.size > 0 || FORCE_EN.has(id));

  const results = await mapLimit(ids, SET_CONCURRENCY, async id => {
    try {
      const r = await processSet(id, sets.get(id), db, FORCE_EN.has(id) || id === ONLY_SET);
      if (r.fr || r.en || r.upgraded) {
        const parts = [];
        if (r.fr) parts.push(`${r.fr} FR`);
        if (r.en) parts.push(`${r.en} EN`);
        if (r.upgraded) parts.push(`${r.upgraded} passée(s) en FR`);
        console.log(`✓ ${r.id} (${r.label}) — ${parts.join(', ')}`);
        if (DRY_RUN && r.samples.length) console.log(`    ex. : ${r.samples.join(' · ')}`);
      }
      return r;
    } catch (e) {
      console.error(`✗ ${id} : ${e.message}`);
      return { id, error: true };
    }
  });

  const done = results.filter(r => r.fr || r.en || r.upgraded);
  const skipped = results.filter(r => r.skipped);
  const toMap = done.filter(r => r.isNewSet);

  if (!done.length) console.log('Rien de nouveau.');
  if (skipped.length) {
    const list = skipped.slice(0, 15).map(r => r.id).join(', ');
    console.log(`\n${skipped.length} extension(s) uniquement en anglais et anciennes, ignorée(s) : ${list}${skipped.length > 15 ? '…' : ''}`);
    console.log('  (--en=<id> pour en importer une quand même)');
  }
  if (toMap.length) {
    console.log('\nNouvelles extensions à associer dans Édition › Mapping TCG :');
    toMap.forEach(r => console.log(`  - ${r.label} (${r.id})`));
  }
}

main().catch(e => { console.error('Erreur :', e.message); process.exit(1); });
