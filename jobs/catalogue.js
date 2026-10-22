#!/usr/bin/env node
// PTCG v2 — catalogue TCGdex (séries, extensions, cartes), prix et liens Cardmarket.
// Lancé chaque nuit par cron ; le premier lancement importe tout (long, mais
// il peut être interrompu : le suivant reprend là où il s'est arrêté).
//
//   node catalogue.js               extensions nouvelles / incomplètes / récentes / encore en anglais
//   node catalogue.js --dry-run     affiche ce qui serait fait, sans rien écrire
//   node catalogue.js --set=me02    seulement ces extensions (séparées par des virgules)
//   node catalogue.js --en=me05     accepte le repli anglais pour une extension ancienne
//   node catalogue.js --all         passe en revue toutes les extensions
//   node catalogue.js --refresh     relit le détail de toutes les cartes des extensions traitées
//   node catalogue.js --no-prices   saute la mise à jour des prix
//   node catalogue.js --no-images   ne cherche pas d'image pour les cartes qui n'en ont pas
//
// FR d'abord. Une carte pas encore traduite est importée en anglais (nom du
// Pokémon traduit) avec lang='en', puis remplacée en place quand la version FR
// arrive : même id, donc les ventes/achats liés le restent.
// Jamais touchés : les cartes et extensions créées à la main (source='manual'),
// les liens Cardmarket corrigés à la main, le code Cardmarket d'une extension.

const env = require('./lib/env');
const db = require('./lib/db');
const { getJson, mapLimit, sleep } = require('./lib/http');
const runlog = require('./lib/runlog');

const TCGDEX = env.TCGDEX_URL;
const ONLY = env.list('set');
const FORCE_EN = new Set(env.list('en'));
const ALL = env.flag('all');
const REFRESH = env.flag('refresh');
const PRICES = !env.flag('no-prices');
const IMAGES = !env.flag('no-images');

const POCKET_SERIE = 'tcgp';          // TCG Pocket (jeu mobile) : jamais importé
const EN_ONLY_MAX_AGE_DAYS = 365;     // au-delà, une extension seulement en anglais est ignorée
const RECENT_DAYS = 45;               // extensions récentes revues chaque nuit (cartes ajoutées tard)
const SET_CONCURRENCY = 2;
const CARD_CONCURRENCY = 6;
const IMAGE_MAX = 60;                 // cartes sans image cherchées par nuit sur pokemontcg.io
const IMAGE_RETRY_DAYS = 7;           // une carte sans résultat est recherchée de nouveau une semaine plus tard

const CATEGORIES = { 'Pokémon': 'pokemon', Pokemon: 'pokemon', Dresseur: 'trainer', Trainer: 'trainer', 'Énergie': 'energy', Energy: 'energy' };
const VARIANTS = { normal: 'normale', reverse: 'reverse', holo: 'holo', firstEdition: '1ere_edition' };
const TYPES_FR = {
  Grass: 'Plante', Fire: 'Feu', Water: 'Eau', Lightning: 'Électrique', Psychic: 'Psy',
  Fighting: 'Combat', Darkness: 'Obscurité', Metal: 'Métal', Dragon: 'Dragon',
  Fairy: 'Fée', Colorless: 'Incolore',
};

const png = base => (base ? `${base}.png` : null);
const cardImage = base => (base ? `${base}/high.png` : null);
const daysSince = date => (date ? (Date.now() - new Date(date).getTime()) / 864e5 : Infinity);
const tcgdex = (lang, path) => getJson(`${TCGDEX}/${lang}/${path}`, { allow404: true });

// ── Traduction des noms des cartes encore en anglais ───────────────────────

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildTranslator(pokemon) {
  // les plus longs d'abord : "Mewtwo" avant "Mew", "Porygon-Z" avant "Porygon"
  const species = pokemon
    .filter(p => p.is_default && p.name_en && p.name_fr)
    .sort((a, b) => b.name_en.length - a.name_en.length)
    .map(p => ({
      fr: p.name_fr,
      re: new RegExp(`(^|[\\s&(])${escapeRe(p.name_en).replace(/['’]/g, "['’]")}(?=$|[\\s\\-,)])`, 'g'),
    }));

  const P = '\u0000\\d+\u0000';
  const regions = { Alolan: "d'Alola", Galarian: 'de Galar', Hisuian: 'de Hisui', Paldean: 'de Paldea' };
  const adjectives = { Dark: 'obscur', Light: 'lumineux', Shining: 'brillant', Radiant: 'radieux' };

  return function translate(enName) {
    // un marqueur par Pokémon trouvé, remplacé à la fin : un nom FR déjà posé
    // ne peut pas être repris par une autre espèce
    const found = [];
    let s = enName;
    for (const sp of species) {
      s = s.replace(sp.re, (m, lead) => {
        found.push(sp.fr);
        return `${lead}\u0000${found.length - 1}\u0000`;
      });
    }
    if (!found.length) return null;

    // le nom du Pokémon en premier, comme sur les cartes FR
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

// ── Lignes de la base ──────────────────────────────────────────────────────

function priceCols(full) {
  const cm = (full && full.pricing && full.pricing.cardmarket) || null;
  const num = v => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  return {
    price_trend: cm ? num(cm.trend) : null,
    price_low: cm ? num(cm.low) : null,
    price_avg30: cm ? num(cm.avg30) : null,
    price_trend_holo: cm ? num(cm['trend-holo']) : null,
    price_low_holo: cm ? num(cm['low-holo']) : null,
    price_avg30_holo: cm ? num(cm['avg30-holo']) : null,
    prices_updated_at: cm ? new Date().toISOString() : null,
  };
}

// full = détail TCGdex de la carte, ou null si on n'a pas pu le lire
// (la carte est alors gardée incomplète, category = null, et relue la nuit suivante)
function cardRow({ brief, full, setId, lang, nameEn, enImage, translate }) {
  let name = (full && full.name) || brief.name || '';
  const category = full ? CATEGORIES[full.category] || null : null;

  if (lang === 'en') {
    const fr = category === 'pokemon' ? translate(name)
      : category === 'energy' && full.energyType === 'Basic' ? translateBasicEnergy(name)
      : null;
    if (fr) name = fr;
  }

  const v = full && full.variants;
  const variants = v ? Object.entries(VARIANTS).filter(([k]) => v[k]).map(([, id]) => id) : [];

  return {
    id: brief.id,
    set_id: setId,
    number: brief.localId || (full && full.localId) || null,
    name,
    name_en: nameEn || (lang === 'en' ? (full && full.name) || brief.name : null) || null,
    category,
    subtype: full ? full.stage || full.trainerType || full.energyType || null : null,
    dex_ids: full && Array.isArray(full.dexId) && full.dexId.length ? full.dexId : null,
    rarity: (full && full.rarity) || null,
    variants: full ? (variants.length ? variants : ['normale']) : [],
    image: cardImage(brief.image || (full && full.image) || enImage),
    illustrator: (full && full.illustrator) || null,
    lang,
    ...priceCols(full),
    updated_at: new Date().toISOString(),
  };
}

// ── Une extension ──────────────────────────────────────────────────────────

async function processSet(id, briefs, ctx) {
  const inDb = ctx.dbSets.get(id);
  const known = ctx.cardsBySet.get(id) || [];
  const knownById = new Map(known.map(c => [c.id, c]));
  const forced = FORCE_EN.has(id) || ONLY.includes(id);
  const label = (briefs.fr || briefs.en).name;

  if (inDb && inDb.source === 'manual') return { id, label, skipped: 'manuelle' };

  const [fr, en] = await Promise.all([
    briefs.fr ? tcgdex('fr', `sets/${encodeURIComponent(id)}`) : null,
    briefs.en ? tcgdex('en', `sets/${encodeURIComponent(id)}`) : null,
  ]);
  const main = fr || en;
  if (!main) return { id, label, skipped: 'introuvable' };
  // filet de sécurité si la liste de la série Pocket n'a pas pu être lue
  if (main.serie && main.serie.id === POCKET_SERIE) return { id, label, skipped: 'pocket' };

  const frCards = (fr && fr.cards) || [];
  const enCards = (en && en.cards) || [];
  if (!frCards.length && !inDb && !forced && daysSince(en && en.releaseDate) > EN_ONLY_MAX_AGE_DAYS) {
    return { id, label, skipped: 'anglais' };
  }

  const frIds = new Set(frCards.map(c => c.id));
  const enById = new Map(enCards.map(c => [c.id, c]));
  const wanted = [
    ...frCards.map(c => ({ brief: c, lang: 'fr' })),
    ...enCards.filter(c => !frIds.has(c.id)).map(c => ({ brief: c, lang: 'en' })),
  ];

  // ne relire le détail que de ce qui en a besoin
  const todo = wanted.filter(({ brief, lang }) => {
    const k = knownById.get(brief.id);
    if (!k) return true;
    if (k.source === 'manual') return false;
    return REFRESH || k.category === null || (k.lang === 'en' && lang === 'fr');
  });
  // cartes déjà complètes dont il manque seulement le nom anglais
  const todoIds = new Set(todo.map(t => t.brief.id));
  const nameEnFixes = wanted
    .map(({ brief }) => knownById.get(brief.id))
    .filter(k => k && k.source !== 'manual' && !k.name_en && enById.has(k.id) && !todoIds.has(k.id))
    .map(k => ({ id: k.id, set_id: id, name: k.name, name_en: enById.get(k.id).name }));

  let failed = 0;
  const rows = (await mapLimit(todo, CARD_CONCURRENCY, async ({ brief, lang }) => {
    const full = await tcgdex(lang, `cards/${encodeURIComponent(brief.id)}`).catch(() => null);
    if (!full) {
      failed++;
      if (knownById.has(brief.id)) return null; // on ne dégrade pas une carte déjà en base
    }
    const enBrief = enById.get(brief.id);
    return cardRow({
      brief, full, setId: id, lang,
      nameEn: enBrief ? enBrief.name : null,
      enImage: enBrief ? enBrief.image : null,
      translate: ctx.translate,
    });
  })).filter(Boolean);

  const count = (fr && fr.cardCount) || (en && en.cardCount) || {};
  const setRow = {
    id,
    serie_id: (main.serie && ctx.seriesIds.has(main.serie.id)) ? main.serie.id : null,
    name: (fr && fr.name) || en.name,
    name_en: (en && en.name) || null,
    // une image corrigée à la main dans l'appli reste
    logo: (inDb && inDb.logo_manual) || png((fr && fr.logo) || (en && en.logo)),
    symbol: (inDb && inDb.symbol_manual)
      || symbolFor(ctx, id, inDb ? inDb.cardmarket_code : abbreviation(fr, en), (en && en.name) || null)
      || png((fr && fr.symbol) || (en && en.symbol)),
    card_count: count.official || null,
    card_count_total: Math.max(count.total || 0, wanted.length) || null,
    release_date: main.releaseDate || (en && en.releaseDate) || null,
    lang: frCards.length ? 'fr' : 'en',
    updated_at: new Date().toISOString(),
  };
  // code Cardmarket proposé à la création seulement : ensuite c'est le tien
  if (!inDb) {
    setRow.cardmarket_code = abbreviation(fr, en);
  }

  await db.upsert('sets', [setRow]);
  await db.upsert('cards', rows);
  await db.upsert('cards', nameEnFixes);

  // état à jour pour le calcul des liens Cardmarket
  ctx.dbSets.set(id, { ...(inDb || {}), ...setRow });
  const merged = new Map(known.map(c => [c.id, c]));
  for (const r of [...rows, ...nameEnFixes]) merged.set(r.id, { ...(merged.get(r.id) || {}), ...r });
  ctx.cardsBySet.set(id, [...merged.values()]);
  for (const r of rows) if (r.prices_updated_at) ctx.priced.add(r.id);

  const isNew = r => !knownById.has(r.id);
  return {
    id, label,
    newSet: !inDb,
    fr: rows.filter(r => isNew(r) && r.lang === 'fr').length,
    en: rows.filter(r => isNew(r) && r.lang === 'en').length,
    upgraded: rows.filter(r => !isNew(r) && r.lang === 'fr' && knownById.get(r.id).lang === 'en').length,
    completed: rows.filter(r => !isNew(r) && r.category && knownById.get(r.id).category === null).length,
    reread: REFRESH ? rows.filter(r => !isNew(r)).length : 0,
    failed,
    samples: rows.filter(r => isNew(r) && r.lang === 'en').slice(0, 6).map(r => r.name),
  };
}

// ── Sélection des extensions à traiter ─────────────────────────────────────

function selectSets(tcg, ctx) {
  if (ONLY.length) return ONLY;
  const ids = [...tcg.keys()];
  if (ALL) return ids;

  return ids.filter(id => {
    const b = tcg.get(id);
    const inDb = ctx.dbSets.get(id);
    const cards = ctx.cardsBySet.get(id) || [];
    if (FORCE_EN.has(id)) return true;
    if (!inDb) return true;                       // nouvelle (les vieilles anglaises sont filtrées ensuite)
    if (inDb.source === 'manual') return false;
    if (inDb.lang === 'en' || cards.some(c => c.lang === 'en' && c.source !== 'manual')) return true;  // attend sa traduction
    if (cards.some(c => c.category === null && c.source !== 'manual')) return true;                  // import interrompu
    const total = Math.max((b.fr && b.fr.cardCount && b.fr.cardCount.total) || 0, (b.en && b.en.cardCount && b.en.cardCount.total) || 0);
    if (total > cards.filter(c => c.source !== 'manual').length) return true;                        // cartes ajoutées sur TCGdex
    return daysSince(inDb.release_date) <= RECENT_DAYS;
  });
}

// ── Prix des cartes suivies (en stock, vendues, achetées) ──────────────────

async function refreshPrices(ctx) {
  const tracked = await db.select('transactions', 'select=card_id&card_id=not.is.null');
  const byId = new Map();
  for (const cards of ctx.cardsBySet.values()) for (const c of cards) byId.set(c.id, c);

  const ids = [...new Set(tracked.map(t => t.card_id))]
    .filter(cid => !ctx.priced.has(cid) && byId.has(cid) && byId.get(cid).source !== 'manual');

  const rows = (await mapLimit(ids, CARD_CONCURRENCY, async cid => {
    const c = byId.get(cid);
    const full = await tcgdex(c.lang || 'fr', `cards/${encodeURIComponent(cid)}`).catch(() => null);
    if (!full || !full.pricing || !full.pricing.cardmarket) return null;
    return { id: cid, set_id: c.set_id, name: c.name, ...priceCols(full) };
  })).filter(Boolean);

  await db.upsert('cards', rows);
  return { suivies: ids.length, maj: rows.length };
}

// ── Images manquantes ──────────────────────────────────────────────────────
// TCGdex n'a pas toujours l'image d'une carte, même en anglais. On la cherche
// sur pokemontcg.io (code de l'extension = code Cardmarket, sinon nom anglais)
// et on la garde à part (image_fallback) : TCGdex reprend la main dès qu'il
// en a une, et une image ajoutée à la main dans l'appli passe avant tout.

async function fillImages(ctx) {
  const since = new Date(Date.now() - IMAGE_RETRY_DAYS * 864e5).toISOString();
  const missing = await db.select('cards',
    `select=id,set_id,number,name,name_en&image=is.null&image_fallback=is.null&image_manual=is.null&source=eq.tcgdex`
    + `&or=(image_checked_at.is.null,image_checked_at.lt.${since})&order=id`);
  // d'abord les cartes de mes ventes et achats, puis les extensions récentes
  const mine = new Set((await db.select('transactions', 'select=card_id&card_id=not.is.null')).map(t => t.card_id));
  const released = c => (ctx.dbSets.get(c.set_id) || {}).release_date || '';
  missing.sort((a, b) => mine.has(b.id) - mine.has(a.id) || released(b).localeCompare(released(a)));
  const todo = missing.slice(0, IMAGE_MAX);
  const headers = env.POKEMONTCG_KEY ? { 'X-Api-Key': env.POKEMONTCG_KEY } : undefined;
  let found = 0;

  for (const c of todo) {
    const set = ctx.dbSets.get(c.set_id) || {};
    const where = set.cardmarket_code ? `set.ptcgoCode:${set.cardmarket_code}`
      : set.name_en || set.name ? `set.name:"${(set.name_en || set.name).replace(/"/g, '')}"` : null;
    const number = /^\d+$/.test(c.number || '') ? String(Number(c.number)) : c.number;
    let image = null;
    if (where && number) {
      const q = encodeURIComponent(`${where} number:${number}`);
      const res = await getJson(`${env.POKEMONTCG_URL}/cards?q=${q}&select=id,name,number,images`, { headers, retries: 1, timeout: 20000 })
        .catch(() => null);
      const hits = (res && res.data) || [];
      // même nom anglais si possible, sinon le seul résultat
      const same = hits.find(h => c.name_en && h.name && h.name.toLowerCase() === c.name_en.toLowerCase());
      const hit = same || (hits.length === 1 ? hits[0] : null);
      image = (hit && hit.images && (hit.images.large || hit.images.small)) || null;
    }
    if (image) found++;
    await db.patch('cards', `id=eq.${encodeURIComponent(c.id)}`, { image_fallback: image, image_checked_at: new Date().toISOString() });
    await sleep(2100);   // sans clé : 30 requêtes par minute au plus
  }
  if (todo.length) console.log(`Images : ${found} trouvée(s) sur pokemontcg.io pour ${todo.length} carte(s) sans image${missing.length > todo.length ? ` (${missing.length - todo.length} pour les nuits suivantes)` : ''}.`);
  return { cherchees: todo.length, trouvees: found, restantes: missing.length - todo.length };
}

// ── Sigles des extensions ──────────────────────────────────────────────────
// TCGdex n'a pas l'icône de beaucoup d'extensions : on prend celle de
// pokemontcg.io quand on y retrouve l'extension (même code, sinon même nom anglais).

const abbreviation = (fr, en) => {
  const abbr = (en && en.abbreviation) || (fr && fr.abbreviation) || {};
  return abbr.official || (en && en.tcgOnline) || null;
};
const simple = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function loadSymbols() {
  const headers = env.POKEMONTCG_KEY ? { 'X-Api-Key': env.POKEMONTCG_KEY } : undefined;
  const res = await getJson(`${env.POKEMONTCG_URL}/sets?select=id,name,ptcgoCode,images&pageSize=250`, { headers, retries: 1, timeout: 30000 })
    .catch(e => { console.warn(`⚠ Sigles pokemontcg.io indisponibles (${e.message})`); return null; });
  const byCode = new Map(), byName = new Map();
  for (const s of (res && res.data) || []) {
    const url = s.images && s.images.symbol;
    if (!url) continue;
    if (s.ptcgoCode && !byCode.has(s.ptcgoCode.toUpperCase())) byCode.set(s.ptcgoCode.toUpperCase(), url);
    if (!byName.has(simple(s.name))) byName.set(simple(s.name), url);
  }
  return { byCode, byName };
}

function symbolFor(ctx, id, code, nameEn) {
  const { byCode, byName } = ctx.symbols;
  return (code && byCode.get(code.toUpperCase())) || (nameEn && byName.get(simple(nameEn))) || null;
}

// extensions que cette nuit n'a pas relues : on leur met aussi le sigle pokemontcg.io
async function fixSymbols(ctx, done) {
  let n = 0;
  for (const [id, set] of ctx.dbSets) {
    if (done.has(id) || set.source === 'manual' || set.symbol_manual) continue;
    const url = symbolFor(ctx, id, set.cardmarket_code, set.name_en);
    if (!url || url === set.symbol) continue;
    await db.patch('sets', `id=eq.${encodeURIComponent(id)}`, { symbol: url });
    set.symbol = url;
    n++;
  }
  return n;
}

// ── Liens Cardmarket ───────────────────────────────────────────────────────
// Calculés par la base (v2.refresh_cardmarket_urls), comme quand on change
// le code Cardmarket d'une extension dans l'appli.

async function refreshCardmarket() {
  return (await db.rpc('refresh_cardmarket_urls', { only_set: null })) || 0;
}

// Sous-extensions TCGdex (galerie, Trainer Gallery…) : swsh9tg → swsh9
async function linkParents(ctx) {
  let n = 0;
  for (const [id, set] of ctx.dbSets) {
    const m = id.match(/^(.+?)(tg|gg|sv)$/i);
    if (set.parent_id || !m || !ctx.dbSets.has(m[1])) continue;
    await db.patch('sets', `id=eq.${encodeURIComponent(id)}`, { parent_id: m[1] });
    set.parent_id = m[1];
    n++;
  }
  return n;
}

// ── Lancement ──────────────────────────────────────────────────────────────

runlog.run('catalogue', async () => {
  console.log(`Catalogue TCGdex${env.DRY_RUN ? ' (simulation, rien ne sera écrit)' : ''}\n`);

  const [frSets, enSets, frSeries, enSeries, pocket, dbSets, dbCards, pokemon] = await Promise.all([
    getJson(`${TCGDEX}/fr/sets`),
    getJson(`${TCGDEX}/en/sets`),
    getJson(`${TCGDEX}/fr/series`),
    getJson(`${TCGDEX}/en/series`),
    tcgdex('en', `series/${POCKET_SERIE}`).catch(() => null),
    db.select('sets', 'select=id,name,name_en,lang,source,release_date,cardmarket_code,parent_id,symbol,logo_manual,symbol_manual'),
    db.select('cards', 'select=id,set_id,number,name,name_en,lang,category,source&order=id'),
    db.select('pokemon', 'select=name_fr,name_en,is_default'),
  ]);
  if (!pokemon.length) console.warn('⚠ v2.pokemon est vide : lance d\'abord pokemon.js, sinon les cartes anglaises gardent leur nom anglais.\n');

  const ctx = {
    dbSets: new Map(dbSets.map(s => [s.id, s])),
    cardsBySet: new Map(),
    seriesIds: new Set(),
    priced: new Set(),
    translate: buildTranslator(pokemon),
    symbols: await loadSymbols(),
  };
  for (const c of dbCards) {
    if (!ctx.cardsBySet.has(c.set_id)) ctx.cardsBySet.set(c.set_id, []);
    ctx.cardsBySet.get(c.set_id).push(c);
  }

  // séries (nom FR si possible)
  const series = new Map();
  for (const s of enSeries) if (s.id !== POCKET_SERIE) series.set(s.id, { id: s.id, name: s.name, logo: png(s.logo) });
  for (const s of frSeries) if (s.id !== POCKET_SERIE) series.set(s.id, { id: s.id, name: s.name, logo: png(s.logo) || (series.get(s.id) || {}).logo || null });
  const seriesRows = [...series.values()].map(s => ({ ...s, updated_at: new Date().toISOString() }));
  await db.upsert('series', seriesRows);
  ctx.seriesIds = new Set(series.keys());

  const pocketIds = new Set(((pocket && pocket.sets) || []).map(s => s.id));
  const tcg = new Map();
  for (const s of frSets) if (!pocketIds.has(s.id)) tcg.set(s.id, { fr: s, en: null });
  for (const s of enSets) {
    if (pocketIds.has(s.id)) continue;
    if (tcg.has(s.id)) tcg.get(s.id).en = s;
    else tcg.set(s.id, { fr: null, en: s });
  }
  for (const id of [...ONLY, ...FORCE_EN]) {
    if (!tcg.has(id)) throw new Error(`extension "${id}" introuvable sur TCGdex (ni en FR, ni en EN)`);
  }

  const ids = selectSets(tcg, ctx);
  console.log(`${tcg.size} extensions sur TCGdex, ${ids.length} à examiner.\n`);

  const results = await mapLimit(ids, SET_CONCURRENCY, async id => {
    try {
      const r = await processSet(id, tcg.get(id), ctx);
      const parts = [];
      if (r.fr) parts.push(`${r.fr} FR`);
      if (r.en) parts.push(`${r.en} EN`);
      if (r.upgraded) parts.push(`${r.upgraded} passée(s) en FR`);
      if (r.completed) parts.push(`${r.completed} complétée(s)`);
      if (r.reread) parts.push(`${r.reread} relue(s)`);
      if (r.failed) parts.push(`${r.failed} illisible(s), reprise la nuit prochaine`);
      if (parts.length) console.log(`✓ ${id} (${r.label})${r.newSet ? ' — nouvelle' : ''} — ${parts.join(', ')}`);
      if (env.DRY_RUN && r.samples && r.samples.length) console.log(`    ex. : ${r.samples.join(' · ')}`);
      return r;
    } catch (e) {
      console.error(`✗ ${id} : ${e.message}`);
      return { id, error: e.message };
    }
  });

  const parents = await linkParents(ctx);
  const sigles = env.DRY_RUN ? 0 : await fixSymbols(ctx, new Set(results.filter(r => !r.error && !r.skipped).map(r => r.id)));
  const prices = PRICES ? await refreshPrices(ctx) : null;
  const links = await refreshCardmarket();
  await db.rpc('refresh_card_forms');
  // Encyclopédie : fiches regroupées à partir des nouvelles cartes
  const fiches = env.DRY_RUN ? null : await db.rpc('refresh_fiches').catch(e => `erreur : ${e.message}`);
  const images = IMAGES && !env.DRY_RUN ? await fillImages(ctx).catch(e => ({ erreur: e.message })) : null;

  const sum = key => results.reduce((n, r) => n + (r[key] || 0), 0);
  const errors = results.filter(r => r.error);
  const skippedEn = results.filter(r => r.skipped === 'anglais').map(r => r.id);
  const summary = {
    extensions: ids.length,
    nouvelles: results.filter(r => r.newSet).map(r => r.id),
    cartes_fr: sum('fr'),
    cartes_en: sum('en'),
    passees_fr: sum('upgraded'),
    completees: sum('completed'),
    illisibles: sum('failed'),
    sous_extensions: parents,
    prix: prices,
    liens_cardmarket: links,
    sigles,
    images,
    fiches,
    erreurs: errors.map(r => `${r.id} : ${r.error}`),
  };

  console.log(`\n${summary.cartes_fr} carte(s) FR et ${summary.cartes_en} EN ajoutée(s), ${summary.passees_fr} passée(s) en FR, ${links} lien(s) Cardmarket mis à jour.`);
  if (prices) console.log(`Prix : ${prices.maj} carte(s) suivie(s) mise(s) à jour sur ${prices.suivies}.`);
  if (skippedEn.length) console.log(`${skippedEn.length} extension(s) seulement en anglais et ancienne(s), ignorée(s) (--en=<id> pour forcer) : ${skippedEn.slice(0, 12).join(', ')}${skippedEn.length > 12 ? '…' : ''}`);
  // le reste est enregistré : la nuit suivante ne reprendra que ces extensions
  if (errors.length) throw Object.assign(new Error(`${errors.length} extension(s) en erreur : ${summary.erreurs.slice(0, 5).join(' | ')}`), { summary });
  return summary;
});
