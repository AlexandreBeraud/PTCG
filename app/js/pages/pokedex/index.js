import { api } from '../../api.js';
import { html, setHtml, on, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { norm } from '../../shared/sales.js';
import { pokemonTile } from '../../shared/cards.js';

const PAGE = 120;
const GENS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];
const state = { q: '', gen: '', forms: true, withCards: false, sort: 'dex' };
const SORTS = [
  { id: 'dex', label: 'Numéro de Pokédex', order: 'sort_order,key' },
  { id: 'dex_desc', label: 'Numéro, décroissant', order: 'sort_order.desc,key' },
  { id: 'name', label: 'Nom (A → Z)', order: 'name_fr,sort_order' },
  { id: 'cartes', label: 'Nombre de cartes', order: 'cartes.desc,sort_order' },
  { id: 'stock', label: 'En stock d’abord', order: 'en_stock.desc,cartes.desc,sort_order' },
  { id: 'vendues', label: 'Les plus vendus', order: 'vendues.desc,sort_order' },
];

export default {
  title: 'Pokédex',

  async render(main, params) {
    if (params[0]) {
      const { renderPokemon } = await import('./fiche.js');
      return renderPokemon(main, params[0]);
    }

    let rows = [];
    let total = 0;
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Pokédex</h1><p>Chaque forme a sa propre fiche · tes labels décident dans quelle fiche va chaque carte</p></div>
        <div class="page-actions"><a class="btn" href="#/labels">Gérer les labels</a></div>
      </header>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" placeholder="Rechercher un Pokémon" value="${state.q}" aria-label="Rechercher un Pokémon"></label>
        <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === state.sort ? 'selected' : ''}>${o.label}</option>`)}</select>
        <label class="check-inline"><input type="checkbox" id="forms" ${state.forms ? 'checked' : ''}> Afficher les formes</label>
        <label class="check-inline"><input type="checkbox" id="withcards" ${state.withCards ? 'checked' : ''}> Avec des cartes</label>
      </div>
      <div class="chips" role="group" aria-label="Génération">
        <button type="button" class="chip" data-gen="" aria-pressed="${!state.gen}">Toutes</button>
        ${GENS.map((g, i) => html`<button type="button" class="chip" data-gen="${i + 1}" aria-pressed="${state.gen === String(i + 1)}">${g}</button>`)}
      </div>
      <section id="grid" aria-live="polite"></section>
    `);
    const $ = s => main.querySelector(s);

    async function load(append = false) {
      const p = {
        select: 'key,dex,name_fr,sprite,pokeapi_id,form_badge,form_color,cartes,en_stock,is_default',
        order: SORTS.find(o => o.id === state.sort).order,
      };
      if (state.gen) p.generation = `eq.${state.gen}`;
      if (!state.forms) p.is_default = 'eq.true';
      if (state.withCards) p.cartes = 'gt.0';
      if (state.q) p.search = `ilike.*${norm(state.q).replace(/[*(),]/g, '')}*`;
      try {
        const page = await api.page('pokedex', p, { offset: append ? rows.length : 0, limit: PAGE });
        rows = append ? rows.concat(page.rows) : page.rows;
        total = page.total;
      } catch (err) {
        return setHtml($('#grid'), errorHtml('Impossible de charger le Pokédex', err));
      }
      setHtml($('#grid'), rows.length ? html`
        <div class="poke-grid">${rows.map(r => pokemonTile(r))}</div>
        ${rows.length < total ? html`<div class="more"><button type="button" class="btn" data-more>Afficher plus (${total - rows.length} restants)</button></div>` : ''}`
        : html`<div class="empty"><h2>Aucun Pokémon${state.q ? ` pour « ${state.q} »` : ''}</h2></div>`);
    }

    let timer;
    $('#q').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250);
    });
    $('#forms').addEventListener('change', e => { state.forms = e.target.checked; load(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; load(); });
    $('#withcards').addEventListener('change', e => { state.withCards = e.target.checked; load(); });
    on(main, 'click', '[data-gen]', (_, b) => {
      state.gen = b.dataset.gen;
      main.querySelectorAll('[data-gen]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      load();
    });
    on(main, 'click', '[data-more]', () => load(true));
    load();
  },
};
