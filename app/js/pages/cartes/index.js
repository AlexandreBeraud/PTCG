import { api } from '../../api.js';
import { html, setHtml, on, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { norm } from '../../shared/sales.js';
import { FAMILLES, familleLabel, cardTile } from '../../shared/cards.js';

const PAGE = 60;
const NUM = 'number_sort.asc.nullslast,number';
const SORTS = [
  { id: 'recent', label: 'Date de sortie, récentes d’abord', order: `release_date.desc.nullslast,set_id,${NUM}` },
  { id: 'old', label: 'Date de sortie, anciennes d’abord', order: `release_date.asc.nullslast,set_id,${NUM}` },
  { id: 'name', label: 'Nom (A → Z)', order: `name,release_date.desc.nullslast,${NUM}` },
  { id: 'name_desc', label: 'Nom (Z → A)', order: `name.desc,release_date.desc.nullslast,${NUM}` },
  { id: 'stock', label: 'En stock d’abord', order: `a_du_stock.desc,release_date.desc.nullslast,set_id,${NUM}` },
  { id: 'vendues', label: 'Les plus vendues', order: `vendues.desc,release_date.desc.nullslast,${NUM}` },
  { id: 'price', label: 'Prix le plus bas, décroissant', order: `price_low.desc.nullslast,release_date.desc.nullslast,${NUM}` },
];

const state = { q: '', famille: '', stock: false, vendues: false, serie: '', sort: 'recent', group: true };

export default {
  title: 'Cartes',

  async render(main, params) {
    if (params[0]) {
      const { renderCard } = await import('./fiche.js');
      return renderCard(main, params[0]);
    }

    let rows = [];
    let total = 0;
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Cartes</h1><p>Tout le catalogue, classé automatiquement d’après TCGdex · rien à trier à la main</p></div>
        <div class="page-actions"><button type="button" class="btn" data-manual>${icon('plus')}Carte absente de TCGdex</button></div>
      </header>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" placeholder="Nom, nom anglais ou numéro : « dracaufeu 125 »" value="${state.q}" aria-label="Rechercher une carte"></label>
        <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(s => html`<option value="${s.id}" ${s.id === state.sort ? 'selected' : ''}>${s.label}</option>`)}</select>
        <label class="check-inline"><input type="checkbox" id="group" ${state.group ? 'checked' : ''}> Regrouper les versions d’une même carte</label>
      </div>
      <div class="facets" id="facets"></div>
      <p class="muted small" id="count" style="margin: 0"></p>
      <section id="results" aria-live="polite"></section>
    `);
    const $ = s => main.querySelector(s);

    function params_() {
      const p = { order: SORTS.find(s => s.id === state.sort).order };
      if (state.group && !p.order.startsWith('name')) p.order = `name,${p.order}`;
      const words = norm(state.q).split(/\s+/).filter(Boolean).map(w => w.replace(/[*(),]/g, ''));
      if (words.length) p.and = `(${words.map(w => `search.ilike.*${w}*`).join(',')})`;
      if (state.famille) p.famille = `eq.${state.famille}`;
      if (state.stock) p.en_stock = 'gt.0';
      if (state.vendues) p.vendues = 'gt.0';
      if (state.serie) p.serie_id = `eq.${state.serie}`;
      return p;
    }

    async function facets() {
      let f;
      try { f = await api.rpc('card_facets', { q: state.q || null, serie: state.serie || null }); } catch (_) { return; }
      setHtml($('#facets'), html`
        <div class="chips" role="group" aria-label="Catégorie">
          <button type="button" class="chip" data-famille="" aria-pressed="${!state.famille}">Toutes<span class="n">${f.total}</span></button>
          ${FAMILLES.filter(x => f.familles[x.id]).map(x => html`
            <button type="button" class="chip" data-famille="${x.id}" aria-pressed="${state.famille === x.id}">${x.label}<span class="n">${f.familles[x.id]}</span></button>`)}
        </div>
        <div class="chips" role="group" aria-label="Mes cartes">
          <button type="button" class="chip" data-mine="stock" aria-pressed="${state.stock}">En stock<span class="n">${f.en_stock}</span></button>
          <button type="button" class="chip" data-mine="vendues" aria-pressed="${state.vendues}">Déjà vendues<span class="n">${f.vendues}</span></button>
          <select class="select select-auto" id="serie" aria-label="Bloc">
            <option value="">Tous les blocs</option>
            ${f.series.filter(s => s.id).map(s => html`<option value="${s.id}" ${s.id === state.serie ? 'selected' : ''}>${s.name} (${s.n})</option>`)}
          </select>
        </div>`);
    }

    async function load(append = false) {
      if (!append) setHtml($('#results'), html`<p class="muted">Chargement…</p>`);
      try {
        const page = await api.page('card_list', params_(), { offset: append ? rows.length : 0, limit: PAGE });
        rows = append ? rows.concat(page.rows) : page.rows;
        total = page.total;
        render();
      } catch (err) {
        setHtml($('#results'), errorHtml('Impossible de charger les cartes', err));
      }
    }

    async function render() {
      const more = rows.length < total
        ? html`<div class="more"><button type="button" class="btn" data-more>Afficher plus (${total - rows.length} restantes)</button></div>` : '';
      if (!rows.length) {
        setHtml($('#count'), '');
        setHtml($('#results'), html`<div class="empty">
          <h2>Aucune carte${state.q ? ` pour « ${state.q} »` : ''}</h2>
          <p id="suggest"></p>
          <button type="button" class="btn" data-manual>Ajouter une carte absente de TCGdex</button>
        </div>`);
        if (state.q) {
          const sugg = await api.rpc('suggest_names', { q: state.q, lim: 3 }).catch(() => []);
          const box = $('#suggest');
          if (box && sugg.length) setHtml(box, html`Tu voulais dire ${sugg.map((s, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-suggest="${s.name}">${s.name}</button>`)} ?`);
        }
        return;
      }
      if (!state.group) {
        setHtml($('#count'), `${total.toLocaleString('fr-FR')} carte${total > 1 ? 's' : ''}`);
        return setHtml($('#results'), html`<div class="card-grid">${rows.map(c => cardTile(c, { showSet: true }))}</div>${more}`);
      }
      const groups = [];
      for (const c of rows) {
        const key = norm(c.name);
        let g = groups.find(x => x.key === key);
        if (!g) groups.push(g = { key, name: c.name, famille: c.famille, cards: [] });
        g.cards.push(c);
      }
      setHtml($('#count'), `${total.toLocaleString('fr-FR')} carte${total > 1 ? 's' : ''}${rows.length < total ? ` (${rows.length} affichées)` : ''} · ${groups.length} nom${groups.length > 1 ? 's' : ''}`);
      setHtml($('#results'), html`${groups.map(g => {
        const stock = g.cards.reduce((n, c) => n + Number(c.en_stock), 0);
        return html`
          <section class="card-group">
            <div class="serie-head">
              <h2>${g.name}</h2>
              <span class="muted small">${familleLabel(g.famille)} · ${g.cards.length} version${g.cards.length > 1 ? 's' : ''}${stock ? ` · ${stock} en stock` : ''}</span>
            </div>
            <div class="card-grid">${g.cards.map(c => cardTile(c, { showSet: true }))}</div>
          </section>`;
      })}${more}`);
    }

    const refresh = () => { facets(); load(); };
    let timer;
    $('#q').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => { state.q = e.target.value.trim(); refresh(); }, 300);
    });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; load(); });
    $('#group').addEventListener('change', e => { state.group = e.target.checked; load(); });
    on(main, 'click', '[data-famille]', (_, b) => { state.famille = b.dataset.famille; facets(); load(); });
    on(main, 'click', '[data-mine]', (_, b) => { state[b.dataset.mine] = !state[b.dataset.mine]; facets(); load(); });
    on(main, 'change', '#serie', (_, s) => { state.serie = s.value; refresh(); });
    on(main, 'click', '[data-more]', () => load(true));
    on(main, 'click', '[data-suggest]', (_, b) => { state.q = b.dataset.suggest; $('#q').value = state.q; refresh(); });
    on(main, 'click', '[data-manual]', async () => {
      const { openManualCard } = await import('./manual.js');
      openManualCard({ name: state.q, onSaved: id => { location.hash = `#/cartes/${encodeURIComponent(id)}`; } });
    });

    refresh();
  },
};
