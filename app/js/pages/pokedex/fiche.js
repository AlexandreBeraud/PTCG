import { api } from '../../api.js';
import { html, setHtml } from '../../ui/dom.js';
import { spriteHtml, formBadge } from '../../shared/sales.js';
import { cardTile, pokemonTile } from '../../shared/cards.js';

const GEN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const quote = list => list.map(x => `« ${x} »`).join(' ou ');

export async function renderPokemon(main, key) {
  setHtml(main, html`<p class="muted">Chargement…</p>`);
  let p, cards;
  try {
    [p, cards] = await Promise.all([
      api.one('pokedex', { key: `eq.${key}` }),
      api.list('fiche_cards', { fiche: `eq.${key}`, order: 'release_date.desc.nullslast,set_id,number' }),
    ]);
  } catch (err) {
    return setHtml(main, html`<div class="empty"><h2>Impossible de charger la fiche</h2><p>${err.message}</p></div>`);
  }
  if (!p) return setHtml(main, html`<div class="empty"><h2>Pokémon introuvable</h2><a href="#/pokedex">Retour au Pokédex</a></div>`);
  document.title = `${p.name_fr} · PTCG`;

  const select = 'key,dex,name_fr,sprite,pokeapi_id,form_badge,form_color,cartes,en_stock,is_default,sort_order';
  const [forms, evolutions, label] = await Promise.all([
    api.list('pokedex', { species_key: `eq.${p.species_key}`, select, order: 'sort_order' }).catch(() => []),
    p.evolution_id ? api.list('pokedex', { evolution_id: `eq.${p.evolution_id}`, is_default: 'eq.true', select, order: 'sort_order' }).catch(() => []) : [],
    p.label_type ? api.one('labels', { type: `eq.${p.label_type}` }).catch(() => null) : null,
  ]);
  const base = forms.find(f => f.is_default);
  const others = forms.filter(f => f.key !== p.key);
  const stock = cards.reduce((n, c) => n + Number(c.en_stock), 0);

  // cartes groupées par extension
  const groups = [];
  for (const c of cards) {
    let g = groups.find(x => x.id === c.set_id);
    if (!g) groups.push(g = { id: c.set_id, name: c.set_name, cards: [] });
    g.cards.push(c);
  }

  setHtml(main, html`
    <a class="back-crumb" href="#/pokedex">← Pokédex</a>
    <header class="poke-header">
      <span class="poke-sprite poke-sprite-lg">${spriteHtml(p, 'poke-img')}</span>
      <div class="grow">
        <p class="muted small" style="margin: 0">n°${String(p.dex).padStart(3, '0')}${p.generation ? ` · Génération ${GEN[p.generation]}` : ''} ·
          ${p.is_default ? 'forme de base' : html`forme de <a href="#/pokedex/${encodeURIComponent(base?.key || p.species_key)}">${base?.name_fr || p.species_key}</a>`}</p>
        <h1 class="card-title">${p.name_fr} ${formBadge(p)}</h1>
        <div class="chips-static">${(p.types || []).map(t => html`<span class="tag">${t}</span>`)}</div>
      </div>
      <div class="kpis kpis-2">
        <div class="kpi"><span class="muted small">Cartes de cette fiche</span><strong>${cards.length}</strong></div>
        <div class="kpi"><span class="muted small">En stock</span><strong class="${stock ? 'pos' : ''}">${stock}</strong></div>
      </div>
    </header>

    ${label && !p.is_default ? html`
      <div class="banner">
        <span class="small">Cartes rangées ici par le label <strong>${label.name_fr}</strong>${label.prefixes?.length || label.suffixes?.length
          ? html` : leur nom contient ${label.prefixes?.length ? quote(label.prefixes) : ''}${label.prefixes?.length && label.suffixes?.length ? ' et ' : ''}${label.suffixes?.length ? quote(label.suffixes) : ''}.`
          : html` — il n’a encore aucun préfixe ni suffixe : aucune carte ne peut y arriver.`}
          ${p.label_manuel ? ' Label posé à la main sur cette forme.' : ''}</span>
        <a class="btn btn-sm" href="#/labels/${encodeURIComponent(label.type)}">Voir le label</a>
      </div>` : ''}
    ${!p.is_default && !label ? html`<div class="banner banner-warn"><span class="small">Aucun label n’est relié à cette forme : ses cartes restent sur ${base?.name_fr || 'l’espèce'}.</span><a class="btn btn-sm" href="#/labels">Gérer les labels</a></div>` : ''}

    ${evolutions.length > 1 ? html`
      <section>
        <h2 class="section-title">Évolutions</h2>
        <div class="poke-row">${evolutions.map(e => pokemonTile(e, { compact: true }))}</div>
      </section>` : ''}
    ${others.length ? html`
      <section>
        <h2 class="section-title">${p.is_default ? 'Autres formes · chacune sa fiche' : `Les autres fiches de ${base?.name_fr || ''}`}</h2>
        <div class="poke-row">${others.map(f => pokemonTile(f, { compact: true }))}</div>
      </section>` : ''}

    <section>
      <h2 class="section-title">Cartes</h2>
      ${groups.length ? html`${groups.map(g => html`
        <div class="serie-head"><h3><a href="#/extensions/${encodeURIComponent(g.id)}">${g.name}</a></h3><span class="muted small">${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span></div>
        <div class="card-grid">${g.cards.map(c => cardTile(c))}</div>`)}`
      : html`<div class="empty"><h2>Aucune carte sur cette fiche</h2></div>`}
    </section>
  `);
}
