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

const state = { type: '', got: '', q: '', sort: 'recent', view: 'list' };
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
        <div>
          <h1>Produits</h1><p id="sub">Boosters, ETB, coffrets et decks</p>
          <nav class="segmented" aria-label="Affichage" style="margin-top: 12px">
            <button type="button" data-view="list" aria-pressed="${state.view === 'list'}">Produits</button>
            <button type="button" data-view="stats" aria-pressed="${state.view === 'stats'}">Statistiques</button>
          </nav>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" data-fill>Compléter automatiquement</button>
          <button type="button" class="btn btn-primary" data-new>${icon('plus')}Ajouter un produit</button>
        </div>
      </header>
      <div class="chips" id="types" role="group" aria-label="Type"></div>
      <div class="toolbar" id="tools">
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
      $('#types').hidden = $('#tools').hidden = state.view === 'stats';
      if (state.view === 'stats') return renderStats();
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

    // Où j'en suis : par type, par bloc, et ce que j'ai obtenu chaque année
    function renderStats() {
      if (!items.length) return setHtml($('#list'), html`<div class="empty"><h2>Aucun produit pour l’instant</h2></div>`);
      const count = key => {
        const m = new Map();
        for (const p of items) {
          const k = key(p);
          const c = m.get(k) || { total: 0, got: 0 };
          c.total++;
          if (p.obtained) c.got++;
          m.set(k, c);
        }
        return [...m];
      };
      const bars = rows => html`<div class="bars">${rows.map(([label, c]) => html`
        <div class="bar-row">
          <span class="bar-label">${label}</span>
          <span class="bar"><span class="bar-fill bar-vente" style="--w: ${Math.round(c.got / c.total * 100)}%"></span></span>
          <span class="bar-value">${c.got} / ${c.total}</span>
        </div>`)}</div>`;
      const got = items.filter(p => p.obtained);
      const byYear = new Map();
      for (const p of got) { const y = p.obtained_on ? p.obtained_on.slice(0, 4) : 'Sans date'; byYear.set(y, (byYear.get(y) || 0) + 1); }
      const years = [...byYear].sort((a, b) => b[0].localeCompare(a[0]));
      const maxYear = Math.max(1, ...years.map(([, n]) => n));
      const blocs = count(p => p.serie_name || 'Sans extension').sort((a, b) => b[1].total - a[1].total);
      const types = count(p => typeLabel(p.type)).sort((a, b) => b[1].total - a[1].total);
      const sets = count(p => p.set_name || 'Sans extension').filter(([, c]) => c.got === c.total).length;

      setHtml($('#list'), html`<div class="stack">
        <div class="kpis">
          <div class="kpi"><span class="muted small">Produits</span><strong>${items.length}</strong></div>
          <div class="kpi"><span class="muted small">Obtenus</span><strong>${got.length}</strong><span class="muted small">${Math.round(got.length / items.length * 100)} %</span></div>
          <div class="kpi"><span class="muted small">À obtenir</span><strong>${items.length - got.length}</strong></div>
          <div class="kpi"><span class="muted small">Extensions complètes</span><strong>${sets}</strong><span class="muted small">tous leurs produits obtenus</span></div>
        </div>
        <div class="grid-auto" style="--min: 320px">
          <section class="panel"><div class="panel-head"><h2>Par type</h2><span class="muted small">obtenus / total</span></div>${bars(types)}</section>
          <section class="panel"><div class="panel-head"><h2>Obtenus par année</h2></div>
            <div class="bars">${years.map(([y, n]) => html`
              <div class="bar-row"><span class="bar-label">${y}</span><span class="bar"><span class="bar-fill bar-achat" style="--w: ${Math.round(n / maxYear * 100)}%"></span></span><span class="bar-value">${n}</span></div>`)}</div>
          </section>
        </div>
        <section class="panel"><div class="panel-head"><h2>Par bloc</h2><span class="muted small">obtenus / total</span></div>${bars(blocs)}</section>
      </div>`);
    }

    function productHtml(p, withSet = false) {
      return html`
        <article class="product ${p.obtained ? 'is-got' : ''}">
          <button type="button" class="product-img" data-edit="${p.id}" aria-label="Modifier ${p.description || typeLabel(p.type)}">
            ${p.image ? html`<img src="${imageUrl(p.image, 'thumb')}" alt="" loading="lazy" data-hide-on-error>`
              : p.set_logo ? html`<img class="product-logo" src="${p.set_logo}" alt="" loading="lazy" data-hide-on-error>` : html`<span>${icon('produits', 28)}</span>`}
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
    on(main, 'click', '[data-view]', (_, b) => {
      state.view = b.dataset.view;
      main.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
    on(main, 'click', '[data-fill]', () => fillProducts());
    on(main, 'click', '[data-new]', () => editProduct(null, state.type));
    on(main, 'click', '[data-edit]', (_, b) => editProduct(items.find(x => x.id === b.dataset.edit)));
    render();
  },
};

// Crée d'un coup les produits qui manquent (un par type et par extension sortie), « à obtenir »
async function fillProducts() {
  const sets = await setOptions().catch(() => []);
  const blocs = [...new Map(sets.filter(s => s.serie_id).map(s => [s.serie_id, s.serie_name])).entries()];
  openModal({
    title: 'Compléter automatiquement',
    width: 560,
    body: html`
      <p class="muted" style="margin: 0">Ajoute, pour chaque extension déjà sortie, les produits choisis qui n’existent pas encore, à cocher ensuite quand tu les as. Les sous-extensions (galeries…) sont ignorées.</p>
      <div class="field"><span>Produits</span>
        <div class="chips">${TYPES.filter(t => t.id !== 'autre').map(t => html`
          <label class="check-inline"><input type="checkbox" data-fill-type="${t.id}" ${t.id === 'booster' || t.id === 'etb' ? 'checked' : ''}> ${t.plural}</label>`)}</div>
      </div>
      <div class="form-row">
        <label class="field grow">Extensions
          <select class="select" id="fill-bloc"><option value="">Tous les blocs</option>${blocs.map(([id, name]) => html`<option value="${id}">${name}</option>`)}</select>
        </label>
        <label class="field">Sorties depuis<input class="input" type="date" id="fill-since"></label>
      </div>`,
    actions: [
      { label: 'Annuler' },
      { label: 'Compléter', primary: true, run: async el => {
        const types = [...el.querySelectorAll('[data-fill-type]:checked')].map(c => c.dataset.fillType);
        if (!types.length) { toastError(new Error('Choisis au moins un type de produit')); return false; }
        try {
          const n = await api.rpc('fill_produits', { types, serie: el.querySelector('#fill-bloc').value || null, depuis: el.querySelector('#fill-since').value || null });
          toast(n ? `${n} produit${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}` : 'Rien à ajouter : tout y est déjà');
          if (n) reloadPage();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
}

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
        <div class="form-grid">
          <div id="pf-photo"></div>
          <label class="field">ou l’adresse d’une image
            <input class="input" type="url" id="pf-url" value="${/^https?:/.test(st.image) ? st.image : ''}" placeholder="https://…">
            <span class="muted small">Clic droit sur la photo du produit (Cardmarket, boutique…) → « Copier l’adresse de l’image ». Sans photo, le logo de l’extension s’affiche.</span>
          </label>
        </div>
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
          image: el.querySelector('#pf-url').value.trim() || st.image || null,
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
  dropzone(m.el.querySelector('#pf-photo'), {
    value: /^https?:/.test(st.image) ? '' : st.image, folder: 'Produits', label: 'Photo du produit',
    onChange: v => { st.image = v; m.el.querySelector('#pf-url').value = ''; },
  });
}
