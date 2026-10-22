#!/usr/bin/env node
// PTCG v2 — référentiel Pokémon (une ligne par espèce ET par forme) depuis
// les CSV de PokéAPI. À relancer de temps en temps (cron du dimanche) pour
// récupérer les nouvelles formes.
//
//   node pokemon.js             met à jour v2.pokemon puis le rangement des cartes
//   node pokemon.js --dry-run   affiche ce qui serait écrit
//
// Les types de forme (mega-x, alola, gmax…) sont ceux de l'ancienne appli :
// ils relient chaque forme à son label. Un label posé à la main dans
// l'appli (v2.pokemon_labels) reste prioritaire, il n'est jamais touché ici.

const env = require('./lib/env');
const db = require('./lib/db');
const { getText } = require('./lib/http');
const { parseCsv } = require('./lib/csv');
const { detectFormType } = require('./lib/forms');
const runlog = require('./lib/runlog');

const FR = '5';
const EN = '9';

async function csv(name) {
  return parseCsv(await getText(`${env.POKEAPI_CSV_URL}/${name}.csv`));
}

function buildRows({ pokemon, species, speciesNames, forms, formNames, types, typeNames }) {
  const speciesById = new Map(species.map(s => [s.id, s]));

  const speciesName = new Map();
  for (const n of speciesNames) {
    if (n.local_language_id !== FR && n.local_language_id !== EN) continue;
    const e = speciesName.get(n.pokemon_species_id) || {};
    e[n.local_language_id === FR ? 'fr' : 'en'] = n.name;
    speciesName.set(n.pokemon_species_id, e);
  }

  // nom de la forme par défaut de chaque Pokémon ("Méga-Dracaufeu X", "Goupix d’Alola")
  const defaultForm = new Map(forms.filter(f => f.is_default === '1').map(f => [f.pokemon_id, f.id]));
  const formName = new Map();
  for (const n of formNames) {
    if (n.local_language_id !== FR && n.local_language_id !== EN) continue;
    const e = formName.get(n.pokemon_form_id) || {};
    e[n.local_language_id === FR ? 'fr' : 'en'] = { full: n.pokemon_name, form: n.form_name };
    formName.set(n.pokemon_form_id, e);
  }

  const typeFr = new Map(typeNames.filter(t => t.local_language_id === FR).map(t => [t.type_id, t.name]));
  const typesOf = new Map();
  for (const t of [...types].sort((a, b) => a.slot - b.slot)) {
    if (!typesOf.has(t.pokemon_id)) typesOf.set(t.pokemon_id, []);
    typesOf.get(t.pokemon_id).push(typeFr.get(t.type_id) || t.type_id);
  }

  // rang de chaque forme parmi les variétés non par défaut de l'espèce,
  // dans l'ordre PokéAPI : c'est le suffixe _01, _02… des sprites du NAS
  const formIndex = new Map();
  const bySpecies = new Map();
  for (const p of pokemon) {
    if (p.is_default === '1') continue;
    if (!bySpecies.has(p.species_id)) bySpecies.set(p.species_id, []);
    bySpecies.get(p.species_id).push(p);
  }
  for (const list of bySpecies.values()) {
    list.sort((a, b) => Number(a.id) - Number(b.id)).forEach((p, i) => formIndex.set(p.id, i + 1));
  }

  const speciesKey = new Map(species.map(s => [s.id, s.identifier]));

  return pokemon.map(p => {
    const sp = speciesById.get(p.species_id) || {};
    const isDefault = p.is_default === '1';
    const names = speciesName.get(p.species_id) || {};
    const fn = formName.get(defaultForm.get(p.id)) || {};
    const label = lang => {
      if (isDefault) return names[lang] || null;
      const f = fn[lang];
      if (f && f.full) return f.full;
      if (f && f.form && names[lang]) return `${names[lang]} (${f.form})`;
      return names[lang] || null;
    };
    const dex = Number(p.species_id);
    const gen = Number(sp.generation_id) || null;
    const idx = formIndex.get(p.id);

    return {
      key: p.identifier,
      pokeapi_id: Number(p.id),
      dex,
      species_key: speciesKey.get(p.species_id) || p.identifier,
      name_fr: label('fr') || label('en') || p.identifier,
      name_en: label('en'),
      form_type: isDefault ? null : detectFormType(p.identifier),
      is_default: isDefault,
      generation: gen,
      types: typesOf.get(p.id) || null,
      evolution_id: Number(sp.evolution_chain_id) || null,
      sort_order: dex * 100 + (idx || 0),
      sprite: gen ? `${gen}G/${String(dex).padStart(4, '0')}${idx ? `_${String(idx).padStart(2, '0')}` : ''}.png` : null,
    };
  });
}

runlog.run('pokemon', async () => {
  console.log(`Référentiel Pokémon${env.DRY_RUN ? ' (simulation)' : ''}\n`);

  const [pokemon, species, speciesNames, forms, formNames, types, typeNames] = await Promise.all([
    csv('pokemon'), csv('pokemon_species'), csv('pokemon_species_names'),
    csv('pokemon_forms'), csv('pokemon_form_names'), csv('pokemon_types'), csv('type_names'),
  ]);
  const rows = buildRows({ pokemon, species, speciesNames, forms, formNames, types, typeNames });

  const known = await db.select('pokemon', 'select=key,sprite_manual');
  const existing = new Set(known.map(r => r.key));
  // un sprite choisi à la main dans l'appli reste
  const manual = new Map(known.filter(r => r.sprite_manual).map(r => [r.key, r.sprite_manual]));
  for (const r of rows) if (manual.has(r.key)) r.sprite = manual.get(r.key);
  const added = rows.filter(r => !existing.has(r.key));
  const formsCount = rows.filter(r => !r.is_default).length;

  console.log(`${rows.length} Pokémon dont ${formsCount} formes, ${added.length} nouveau(x).`);
  if (added.length) console.log(`  ex. : ${added.slice(0, 10).map(r => r.name_fr).join(' · ')}`);
  if (env.DRY_RUN) {
    for (const key of ['charizard', 'charizard-mega-x', 'charizard-gmax', 'vulpix-alola', 'ogerpon-wellspring-mask']) {
      const r = rows.find(x => x.key === key);
      if (r) console.log(`  ${key} → ${r.name_fr} · ${r.form_type || '—'} · ${r.sprite}`);
    }
  }

  await db.upsert('pokemon', rows, { onConflict: 'key' });
  await db.rpc('refresh_card_forms');

  return { pokemon: rows.length, formes: formsCount, nouveaux: added.length };
});
