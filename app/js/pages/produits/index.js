import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, reloadPage, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { fmtDate, today, norm } from '../../shared/sales.js';
import { setOptions, setOptionsHtml } from '../../shared/sets.js';

export const TYPES = [
  { id: 'booster', label: 'Booster', plural: 'Boosters' },
  { id: 'etb', label: 'Coffret Dresseur d’élite', plural: 'ETB' },
  { id: 'coffret', label: 'Coffret', plural: 'Coffrets' },
  { id: 'deck', label: 'Deck', plural: 'Decks' },
  { id: 'premium', label: 'Collection premium', plural: 'Premium' },
  { id: 'portfolio', label: 'Portfolio', plural: 'Portfolios' },
  { id: 'autre', label: 'Autre', plural: 'Autres' },
];
const typeLabel = id => TYPES.find(t => t.id === id)?.label || id;

const state = { type: '', got: '', q: '', sort: 'recent' };
const SORTS = [
  { id: 'recent', label: 'Extensions récentes d’abord' },
  { id: 'old', label: 'Extensions anciennes d’abord' },
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => (a.description || '').localeCompare(b.description || '', 'fr') },
  { id: 'got', label: 'Obtenus récemment', cmp: (a, b) => String(b.obtained_on || '').localeCompare(String(a.obtained_on || '')) },
];

export default {
  title: 'Produits',

  async render(main) {
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Produits</h1><p id="sub">Boosters, ETB, coffrets et decks</p></div>
        <div class="page-actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}Ajouter un produit</button></div>
      </header>
      <div class="chips" id="types" role="group" aria-label="Type"></div>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" placeholder="Rechercher un produit ou une extension" value="${state.q}" aria-label="Rechercher un produit"></label>
        <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === state.sort ? 'selected' : ''}>${o.label}</option>`)}</select>
        <div class="segmented" role="group" aria-label="Obtenu">
          ${[['', 'Tous'], ['yes', 'Obtenus'], ['no', 'À obtenir']].map(([v, l]) => html`<button type="button" data-got="${v}" aria-pressed="${state.got === v}">${l}</button>`)}
        </div>
      </div>
      <section id="list" aria-live="polite"><p class="muted">Chargement…</p></section>
    `);
    const $ = s => main.querySelector(s);

    let items = [];
    try {
      items = await api.list('produit_list', { order: 'release_date.desc.nullslast,set_id,sort_order.asc.nullslast,created_at' });
    } catch (err) {
      return setHtml($('#list'), errorHtml('Impossible de charger les produits', err));
    }
    const got = items.filter(p => p.obtained).length;
    setHtml($('#sub'), `Boosters, ETB, coffrets et decks · ${items.length} produit${items.length > 1 ? 's' : ''}, ${got} obtenu${got > 1 ? 's' : ''}`);

    function render() {
      setHtml($('#types'), html`
        <button type="button" class="chip" data-type="" aria-pressed="${!state.type}">Tous<span class="n">${items.length}</span></button>
        ${TYPES.map(t => {
          const n = items.filter(p => p.type === t.id).length;
          return n ? html`<button type="button" class="chip" data-type="${t.id}" aria-pressed="${state.type === t.id}">${t.plural}<span class="n">${n}</span></button>` : '';
        })}`);
      const q = norm(state.q);
      const shown = items.filter(p => (!state.type || p.type === state.type)
        && (!state.got || p.obtained === (state.got === 'yes'))
        && (!q || norm(`${p.description || ''} ${p.set_name || ''} ${typeLabel(p.type)}`).includes(q)));
      const sort = SORTS.find(o => o.id === state.sort);
      if (sort.cmp) {
        return setHtml($('#list'), shown.length
          ? html`<div class="product-grid">${[...shown].sort(sort.cmp).map(p => productHtml(p, true))}</div>`
          : html`<div class="empty"><h2>Aucun produit${state.type || state.got || q ? ' pour ces filtres' : ''}</h2></div>`);
      }
      const groups = [];
      for (const p of state.sort === 'old' ? [...shown].reverse() : shown) {
        let g = groups.find(x => x.id === (p.set_id || ''));
        if (!g) groups.push(g = { id: p.set_id || '', name: p.set_name || 'Sans extension', items: [] });
        g.items.push(p);
      }
      setHtml($('#list'), groups.length ? html`${groups.map(g => html`
        <div class="serie-head"><h2>${g.id ? html`<a href="#/extensions/${encodeURIComponent(g.id)}">${g.name}</a>` : g.name}</h2>
          <span class="muted small">${g.items.filter(p => p.obtained).length} / ${g.items.length} obtenus</span></div>
        <div class="product-grid">${g.items.map(p => productHtml(p))}</div>`)}`
        : html`<div class="empty"><h2>Aucun produit${state.type || state.got || q ? ' pour ces filtres' : ''}</h2></div>`);
    }

    function productHtml(p, withSet = false) {
      return html`
        <article class="product ${p.obtained ? 'is-got' : ''}">
          <button type="button" class="product-img" data-edit="${p.id}" aria-label="Modifier ${p.description || typeLabel(p.type)}">
            ${p.image ? html`<img src="${imageUrl(p.image, 'thumb')}" alt="" loading="lazy" data-hide-on-error>` : html`<span>${icon('produits', 28)}</span>`}
          </button>
          <span class="muted small">${typeLabel(p.type)}${withSet && p.set_name ? ` · ${p.set_name}` : ''}</span>
          <strong>${p.description || typeLabel(p.type)}</strong>
          <label class="check-inline small">
            <input type="checkbox" data-got-id="${p.id}" ${p.obtained ? 'checked' : ''}>
            ${p.obtained ? (p.obtained_on ? `Obtenu le ${fmtDate(p.obtained_on)}` : 'Obtenu') : 'À obtenir'}
          </label>
        </article>`;
    }

    $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
    on(main, 'click', '[data-type]', (_, b) => { state.type = b.dataset.type; render(); });
    on(main, 'click', '[data-got]', (_, b) => {
      state.got = b.dataset.got;
      main.querySelectorAll('[data-got]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
    on(main, 'change', '[data-got-id]', async (_, c) => {
      const p = items.find(x => x.id === c.dataset.gotId);
      const patch = { obtained: c.checked, obtained_on: c.checked ? (p.obtained_on || today()) : null };
      try {
        await api.update('produits', { id: `eq.${p.id}` }, patch);
        Object.assign(p, patch);
        render();
      } catch (err) { toastError(err); c.checked = !c.checked; }
    });
    on(main, 'click', '[data-new]', () => editProduct(null, state.type));
    on(main, 'click', '[data-edit]', (_, b) => editProduct(items.find(x => x.id === b.dataset.edit)));
    render();
  },
};

async function editProduct(p, type = '') {
  const sets = await setOptions();
  const st = {
    type: p?.type || type || 'booster', description: p?.description || '', image: p?.image || '',
    setId: p?.set_id || '', obtained: p?.obtained ?? false, obtained_on: p?.obtained_on || '',
  };
  const m = openModal({
    title: p ? 'Modifier le produit' : 'Ajouter un produit',
    width: 720,
    body: html`
      <div class="manual-grid">
        <div id="pf-photo"></div>
        <div class="form-grid">
          <label class="field">Type<select class="select" id="pf-type">${TYPES.map(t => html`<option value="${t.id}" ${t.id === st.type ? 'selected' : ''}>${t.label}</option>`)}</select></label>
          <label class="field">Description<input class="input" id="pf-desc" value="${st.description}" placeholder="ETB Nuit Noire, booster illustration 2…"></label>
          <label class="field">Extension (facultatif)<select class="select" id="pf-set">${setOptionsHtml(sets, st.setId, { empty: 'Aucune' })}</select></label>
          <div class="form-row">
            <label class="check-inline"><input type="checkbox" id="pf-got" ${st.obtained ? 'checked' : ''}> Obtenu</label>
            <label class="field">Le<input class="input" type="date" id="pf-date" value="${st.obtained_on}"></label>
          </div>
        </div>
      </div>`,
    actions: [
      ...(p ? [{ label: 'Supprimer', danger: true, run: async () => {
        if (!await confirmModal({ title: 'Supprimer ce produit ?', message: p.description || typeLabel(p.type), confirmLabel: 'Supprimer', danger: true })) return false;
        try { await api.remove('produits', { id: `eq.${p.id}` }); toast('Produit supprimé'); reloadPage(); } catch (err) { toastError(err); return false; }
      } }] : []),
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: async el => {
        const obtained = el.querySelector('#pf-got').checked;
        const row = {
          type: el.querySelector('#pf-type').value,
          description: el.querySelector('#pf-desc').value.trim() || null,
          set_id: el.querySelector('#pf-set').value || null,
          image: st.image || null,
          obtained,
          obtained_on: obtained ? (el.querySelector('#pf-date').value || today()) : null,
        };
        try {
          if (p) await api.update('produits', { id: `eq.${p.id}` }, row);
          else await api.insert('produits', row);
          toast('Produit enregistré');
          reloadPage();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
  dropzone(m.el.querySelector('#pf-photo'), { value: st.image, folder: 'Produits', label: 'Photo du produit', onChange: v => { st.image = v; } });
}
