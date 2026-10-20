import { api } from '../../api.js';
import { html, setHtml, on, errorHtml, reloadPage } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { spriteHtml, formBadge, cardImage, norm, setSymbolHtml } from '../../shared/sales.js';
import { cardTile, pokemonTile } from '../../shared/cards.js';

const SORTS = [
  { id: 'recent', label: 'Extensions récentes d’abord' },
  { id: 'old', label: 'Extensions anciennes d’abord' },
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => a.name.localeCompare(b.name, 'fr') },
  { id: 'stock', label: 'En stock d’abord', cmp: (a, b) => Number(b.en_stock) - Number(a.en_stock) },
];
let sortId = 'recent';

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
    return setHtml(main, errorHtml('Impossible de charger la fiche', err));
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

  // cartes groupées par extension (tri par date), sinon à plat
  function cardsHtml() {
    const sort = SORTS.find(o => o.id === sortId);
    if (!cards.length) return html`<div class="empty"><h2>Aucune carte sur cette fiche</h2></div>`;
    if (sort.cmp) return html`<div class="card-grid">${[...cards].sort(sort.cmp).map(c => cardTile(c, { showSet: true }))}</div>`;
    const groups = [];
    for (const c of sortId === 'old' ? [...cards].reverse() : cards) {
      let g = groups.find(x => x.id === c.set_id);
      if (!g) groups.push(g = { id: c.set_id, name: c.set_name, cards: [] });
      g.cards.push(c);
    }
    return html`${groups.map(g => html`
      <div class="serie-head"><h3><a href="#/extensions/${encodeURIComponent(g.id)}">${g.name}</a></h3><span class="muted small">${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span></div>
      <div class="card-grid">${g.cards.map(c => cardTile(c))}</div>`)}`;
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
      <div class="toolbar">
        <h2 class="section-title grow">Cartes</h2>
        <select class="select select-auto" id="fsort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === sortId ? 'selected' : ''}>${o.label}</option>`)}</select>
        <button type="button" class="btn btn-sm" data-ranger>Ranger des cartes ici</button>
      </div>
      <div id="fcards">${cardsHtml()}</div>
    </section>
  `);
  on(main, 'change', '#fsort', (_, el) => { sortId = el.value; setHtml(main.querySelector('#fcards'), cardsHtml()); });
  on(main, 'click', '[data-ranger]', () => rangerIci(p, cards));
}

// Envoyer à la main des cartes de l'espèce sur cette fiche (Méga X ou Y, Deoxys Attaque,
// Tauros de Paldea…), quand leur nom ne dit pas de quelle forme il s'agit
async function rangerIci(p, here) {
  let list;
  try {
    list = await api.list('card_list', {
      dex_ids: `cs.{${p.dex}}`, category: 'eq.pokemon',
      select: 'id,name,number,set_id,set_name,set_symbol,image,pokemon_key,pokemon_name,form_badge,form_color,release_date',
      order: 'release_date.desc.nullslast,set_id,number_sort.nullslast,number',
    });
  } catch (err) { return toastError(err); }
  const onHere = new Set(here.map(c => c.id));
  list = list.filter(c => !onHere.has(c.id));
  if (!list.length) return toast('Toutes les cartes de ce Pokémon sont déjà sur cette fiche');
  const picked = new Set();

  const m = openModal({
    title: `Ranger des cartes sur ${p.name_fr}`,
    width: 900,
    body: html`
      <p class="muted" style="margin: 0">Coche les cartes qui montrent ${p.name_fr}. Elles quittent leur fiche actuelle ; « Revenir au rangement automatique » sur la page d’une carte annule.</p>
      <label class="search"><input type="search" id="rg-q" placeholder="Filtrer : nom, extension, numéro…" aria-label="Filtrer"></label>
      <div class="pick-grid" id="rg-list">${list.map(c => html`
        <label class="pick-card" data-name="${norm(`${c.name} ${c.set_name} ${c.set_id} ${c.number}`)}">
          <input type="checkbox" value="${c.id}" class="pick-check">
          <span class="pick-img">${c.image ? html`<img src="${cardImage(c.image)}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="thumb-empty">${c.name}</span>`}</span>
          <span class="pick-meta">${setSymbolHtml(c)}<span class="small">${c.number || '—'}</span></span>
          <span class="pick-name small">${c.name}</span>
          <span class="muted small">sur ${c.pokemon_name || '—'} ${formBadge(c)}</span>
        </label>`)}</div>`,
    onOpen: el => {
      el.querySelector('#rg-q').addEventListener('input', e => {
        const words = norm(e.target.value).split(/\s+/).filter(Boolean);
        el.querySelectorAll('#rg-list .pick-card').forEach(c => { c.hidden = !words.every(w => c.dataset.name.includes(w)); });
      });
      el.addEventListener('change', e => {
        if (!e.target.matches('.pick-check')) return;
        e.target.checked ? picked.add(e.target.value) : picked.delete(e.target.value);
        e.target.closest('.pick-card').classList.toggle('is-picked', e.target.checked);
      });
    },
    actions: [
      { label: 'Annuler' },
      { label: 'Ranger ici', primary: true, run: async () => {
        if (!picked.size) { toastError(new Error('Coche au moins une carte')); return false; }
        try {
          await api.upsert('card_overrides', [...picked].map(id => ({ card_id: id, pokemon_key: p.key })), 'card_id');
          await api.rpc('refresh_card_forms');
          toast(`${picked.size} carte${picked.size > 1 ? 's' : ''} rangée${picked.size > 1 ? 's' : ''} sur ${p.name_fr}`);
          reloadPage();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
  return m;
}
