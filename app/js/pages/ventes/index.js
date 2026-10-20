import { api } from '../../api.js';
import { html, setHtml, on, eur } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { toastError } from '../../ui/toast.js';
import { store } from '../../shared/store.js';
import {
  CONDITIONS, ITEM_CONDITIONS, LANGS, VENTE_STATUS, COMMANDE_STATUS,
  thumbHtml, spriteHtml, subtitle, formBadge, conditionTag, venteStatusTag, commandeStatusTag, variantLabel, fmtDate, norm, priceText,
} from '../../shared/sales.js';

const PAGE = 60;
const SORTS = [
  { id: 'date_desc', label: 'Plus récentes', order: 'day.desc,created_at.desc' },
  { id: 'date_asc', label: 'Plus anciennes', order: 'day.asc,created_at.asc' },
  { id: 'price_desc', label: 'Prix décroissant', order: 'total.desc,day.desc' },
  { id: 'price_asc', label: 'Prix croissant', order: 'total.asc,day.desc' },
  { id: 'name', label: 'Nom', order: 'title.asc,day.desc' },
  { id: 'set', label: 'Extension et numéro', order: 'set_name.asc.nullslast,number.asc,day.desc' },
];

// Filtres gardés le temps de la session, un jeu par onglet
const memory = { vente: { status: 'all', sort: 'date_desc' }, achat: { status: 'all', sort: 'date_desc' } };

export default {
  title: 'Ventes et achats',

  async render(main, params, { tab = 'vente' } = {}) {
    const dir = tab;
    const f = memory[dir];
    if (params[0]) f.status = params[0];
    let rows = [];
    let total = 0;
    let selected = new Set();
    let settings = await store.settings().catch(() => null);
    let view = settings?.view_modes?.[dir] || 'list';

    const statusChips = dir === 'vente'
      ? [{ id: 'all', label: 'Toutes' }, ...VENTE_STATUS.map(s => ({ id: s.id, label: s.id === 'vendue' ? 'Vendues' : s.label }))]
      : [{ id: 'all', label: 'Tous' }, ...COMMANDE_STATUS.achat.map(s => ({ id: s.id, label: s.id === 'paye' ? 'Payés' : s.id === 'arrive' ? 'Reçus' : s.label })), { id: 'sans', label: 'Sans commande' }];

    setHtml(main, html`
      <header class="page-header">
        <div>
          <h1>Ventes et achats</h1>
          <nav class="segmented" aria-label="Onglets" style="margin-top: 12px">
            <a href="#/ventes" aria-selected="${dir === 'vente'}">Ventes</a>
            <a href="#/achats" aria-selected="${dir === 'achat'}">Achats</a>
          </nav>
        </div>
        <div class="page-actions">
          <button type="button" class="btn btn-primary" data-new>${icon('plus')}${dir === 'vente' ? 'Nouvelle vente' : 'Nouvel achat'}</button>
        </div>
      </header>
      <div class="chips" id="status-chips" role="group" aria-label="Statut"></div>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" placeholder="Rechercher une carte, une extension, un contact…" value="${f.q || ''}" aria-label="Rechercher"></label>
        <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(s => html`<option value="${s.id}" ${s.id === f.sort ? 'selected' : ''}>${s.label}</option>`)}</select>
        <button type="button" class="btn" id="more-filters" aria-expanded="${!!f.open}">Filtres<span class="n" id="nb-filters"></span></button>
        <div class="segmented" role="group" aria-label="Affichage">
          <button type="button" data-view="list" aria-pressed="${view === 'list'}">Liste</button>
          <button type="button" data-view="grid" aria-pressed="${view === 'grid'}">Grille</button>
        </div>
      </div>
      <div class="filters" id="filters" ${f.open ? '' : 'hidden'}></div>
      <div class="selection-bar" id="selbar" hidden></div>
      <p class="muted small" id="summary" style="margin: 0"></p>
      <section id="results" aria-live="polite"></section>
    `);

    const $ = s => main.querySelector(s);

    // ── filtres ──
    async function renderFilters() {
      const [setsList, accounts] = await Promise.all([
        api.list('transaction_sets', { direction: `eq.${dir}`, order: 'set_name' }).catch(() => []),
        dir === 'vente' ? store.forAccounts().catch(() => []) : [],
      ]);
      const opt = (val, label, cur) => html`<option value="${val}" ${val === (cur || '') ? 'selected' : ''}>${label}</option>`;
      setHtml($('#filters'), html`
        <label class="field">État<select class="select" data-filter="condition">${opt('', 'Tous')}${[...CONDITIONS, ...ITEM_CONDITIONS].map(c => opt(c.id, c.id, f.condition))}</select></label>
        <label class="field">Langue<select class="select" data-filter="lang">${opt('', 'Toutes')}${LANGS.map(l => opt(l.id, l.label, f.lang))}</select></label>
        <label class="field">Extension<select class="select" data-filter="set">${opt('', 'Toutes')}${setsList.map(s => opt(s.set_key, `${s.set_name} (${s.lignes})`, f.set))}</select></label>
        ${dir === 'vente' ? html`<label class="field">Pour le compte de<select class="select" data-filter="account">${opt('', 'Tout le monde')}${opt('__moi', 'Moi', f.account)}${accounts.map(a => opt(a.name, a.name, f.account))}</select></label>` : ''}
        <label class="field">Du<input class="input" type="date" data-filter="from" value="${f.from || ''}"></label>
        <label class="field">Au<input class="input" type="date" data-filter="to" value="${f.to || ''}"></label>
        <label class="field">Prix min<input class="input" type="number" min="0" step="0.01" data-filter="pmin" value="${f.pmin || ''}"></label>
        <label class="field">Prix max<input class="input" type="number" min="0" step="0.01" data-filter="pmax" value="${f.pmax || ''}"></label>
        <button type="button" class="btn btn-ghost btn-sm" data-reset>Réinitialiser</button>
      `);
      updateFilterCount();
    }

    function updateFilterCount() {
      const n = ['condition', 'lang', 'set', 'account', 'from', 'to', 'pmin', 'pmax'].filter(k => f[k]).length;
      setHtml($('#nb-filters'), n ? ` · ${n}` : '');
    }

    async function renderChips() {
      let counts = {};
      try { counts = await api.rpc('transaction_counts', { dir }) || {}; } catch (_) { /* compteurs facultatifs */ }
      const n = id => id === 'all'
        ? Object.values(counts).reduce((s, c) => s + c.lignes, 0)
        : counts[id]?.lignes || 0;
      setHtml($('#status-chips'), html`${statusChips.map(s => html`
        <button type="button" class="chip" data-status="${s.id}" aria-pressed="${f.status === s.id}">${s.label}<span class="n">${n(s.id)}</span></button>`)}`);
      const c = f.status === 'all'
        ? Object.values(counts).reduce((a, x) => ({ cartes: a.cartes + Number(x.cartes), total: a.total + Number(x.total) }), { cartes: 0, total: 0 })
        : counts[f.status] || { cartes: 0, total: 0 };
      const what = dir === 'vente'
        ? { all: 'cartes au total', a_mettre: 'cartes à mettre en vente', en_vente: 'cartes en ligne', vendue: 'cartes vendues' }[f.status]
        : 'cartes achetées';
      setHtml($('#summary'), `${Number(c.cartes || 0).toLocaleString('fr-FR')} ${what} · ${eur(c.total || 0)}`);
    }

    function queryParams() {
      const p = { direction: `eq.${dir}`, order: SORTS.find(s => s.id === f.sort)?.order };
      if (f.status !== 'all') {
        if (dir === 'vente') p.status = `eq.${f.status}`;
        else if (f.status === 'sans') p.commande_id = 'is.null';
        else p.commande_status = `eq.${f.status}`;
      }
      if (f.q) p.search = `ilike.*${norm(f.q).replace(/[*(),]/g, ' ')}*`;
      if (f.condition) p.condition = `eq.${f.condition}`;
      if (f.lang) p.lang = `eq.${f.lang}`;
      if (f.set) p.set_key = `eq.${f.set}`;
      if (f.account) p.for_account = f.account === '__moi' ? 'is.null' : `eq.${f.account}`;
      const and = [];
      if (f.from) and.push(`day.gte.${f.from}`);
      if (f.to) and.push(`day.lte.${f.to}`);
      if (f.pmin) and.push(`price.gte.${f.pmin}`);
      if (f.pmax) and.push(`price.lte.${f.pmax}`);
      if (and.length) p.and = `(${and.join(',')})`;
      return p;
    }

    async function load(append = false) {
      const box = $('#results');
      if (!append) setHtml(box, html`<p class="muted">Chargement…</p>`);
      try {
        const page = await api.page('transaction_list', queryParams(), { offset: append ? rows.length : 0, limit: PAGE });
        rows = append ? rows.concat(page.rows) : page.rows;
        total = page.total;
        if (!append) selected = new Set([...selected].filter(id => rows.some(r => r.id === id)));
        renderResults();
      } catch (err) {
        setHtml(box, html`<div class="empty"><h2>Impossible de charger la liste</h2><p>${err.message}</p><button type="button" class="btn" data-retry>Réessayer</button></div>`);
      }
    }

    // ── résultats ──
    const lotImage = () => settings?.lot_image;

    function rowHtml(t) {
      const sel = selected.has(t.id);
      return html`
        <div class="tx-row ${sel ? 'is-selected' : ''}" data-id="${t.id}">
          <label class="tx-check"><input type="checkbox" data-select="${t.id}" ${sel ? 'checked' : ''} aria-label="Sélectionner ${t.title}"></label>
          <button type="button" class="tx-open" data-open="${t.id}">
            <span class="tx-media">${thumbHtml(t, { lotImage: lotImage() })}${spriteHtml(t)}</span>
            <span class="tx-name">
              <span class="tx-title">${t.title}${t.qty > 1 && t.kind !== 'lot' ? html` <span class="tag">×${t.qty}</span>` : ''} ${formBadge(t)}${t.for_account ? html` <span class="tag tag-owner">Pour ${t.for_account}</span>` : ''}</span>
              <span class="muted small">${subtitle(t)}</span>
              <span class="muted small mobile-only">${[t.kind === 'carte' ? variantLabel(t.variant) : '', t.condition, t.lang, t.contact].filter(Boolean).join(' · ')}</span>
            </span>
          </button>
          <span class="tx-variant small">${t.kind === 'carte' ? variantLabel(t.variant) : '—'}</span>
          <span class="tx-cond">${conditionTag(t.condition)}</span>
          <span class="tx-lang small">${t.lang || '—'}</span>
          <span class="tx-price">${priceText(t, eur)}</span>
          <span class="tx-order small">${t.commande_id ? html`<button type="button" class="link" data-commande="${t.commande_id}">${t.contact || 'Commande'}</button><span class="muted"> · ${fmtDate(t.day)}</span>` : html`<span class="muted">—</span>`}</span>
          <span class="tx-status">${dir === 'vente' ? venteStatusTag(t.status) : t.commande_id ? commandeStatusTag('achat', t.commande_status) : html`<span class="tag">Sans commande</span>`}</span>
        </div>`;
    }

    function cardHtml(t) {
      const sel = selected.has(t.id);
      return html`
        <article class="tx-card ${sel ? 'is-selected' : ''}" data-id="${t.id}">
          <label class="tx-card-check"><input type="checkbox" data-select="${t.id}" ${sel ? 'checked' : ''} aria-label="Sélectionner ${t.title}"></label>
          <button type="button" class="tx-card-open" data-open="${t.id}">
            <span class="tx-card-media">${thumbHtml(t, { lotImage: lotImage(), size: 'lg' })}${spriteHtml(t, 'sprite sprite-lg')}</span>
            <span class="tx-title">${t.title} ${formBadge(t)}</span>
            <span class="muted small">${subtitle(t)}</span>
          </button>
          <div class="tx-card-foot">
            <span class="tx-price">${priceText(t, eur)}${t.qty > 1 && t.kind !== 'lot' ? html` <span class="muted small">×${t.qty}</span>` : ''}</span>
            ${dir === 'vente' ? venteStatusTag(t.status) : t.commande_id ? commandeStatusTag('achat', t.commande_status) : ''}
          </div>
        </article>`;
    }

    function renderResults() {
      const box = $('#results');
      if (!rows.length) {
        const filtered = f.q || f.status !== 'all' || f.condition || f.lang || f.set || f.account || f.from || f.to || f.pmin || f.pmax;
        setHtml(box, html`<div class="empty">
          <h2>${filtered ? 'Rien ne correspond à ces filtres' : dir === 'vente' ? 'Aucune vente pour l’instant' : 'Aucun achat pour l’instant'}</h2>
          ${filtered ? html`<button type="button" class="btn" data-reset>Réinitialiser les filtres</button>` : ''}
        </div>`);
      } else if (view === 'grid') {
        setHtml(box, html`<div class="tx-grid">${rows.map(cardHtml)}</div>${moreHtml()}`);
      } else {
        setHtml(box, html`
          <div class="tx-list" role="table">
            <div class="tx-row tx-head" role="row">
              <label class="tx-check"><input type="checkbox" data-select-all ${rows.length && rows.every(r => selected.has(r.id)) ? 'checked' : ''} aria-label="Tout sélectionner"></label>
              <span>Article</span><span>Variante</span><span>État</span><span>Langue</span><span>Prix</span><span>Commande</span><span>Statut</span>
            </div>
            ${rows.map(rowHtml)}
          </div>${moreHtml()}`);
      }
      renderSelection();
    }

    const moreHtml = () => rows.length < total
      ? html`<div class="more"><button type="button" class="btn" data-more>Afficher plus (${total - rows.length} restantes)</button></div>`
      : '';

    function renderSelection() {
      const bar = $('#selbar');
      bar.hidden = !selected.size;
      if (!selected.size) return;
      setHtml(bar, html`
        <strong>${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}</strong>
        <button type="button" class="btn btn-sm" data-bulk="edit">Modifier en masse</button>
        <button type="button" class="btn btn-sm" data-bulk="attach">Rattacher à une commande</button>
        <button type="button" class="btn btn-sm btn-danger" data-bulk="delete">Supprimer</button>
        <span class="grow"></span>
        ${rows.length > selected.size ? html`<button type="button" class="btn btn-sm btn-ghost" data-bulk="all">Tout sélectionner (${rows.length})</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-bulk="none">Tout désélectionner</button>
      `);
    }

    async function refresh() {
      store.forget('forAccounts');
      await Promise.all([load(), renderChips()]);
      if (f.open) renderFilters();
    }

    // ── interactions ──
    let timer;
    $('#q').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => { f.q = e.target.value.trim(); load(); }, 250);
    });
    $('#sort').addEventListener('change', e => { f.sort = e.target.value; load(); });
    $('#more-filters').addEventListener('click', e => {
      f.open = !f.open;
      e.currentTarget.setAttribute('aria-expanded', String(f.open));
      $('#filters').hidden = !f.open;
      if (f.open) renderFilters();
    });
    on($('#filters'), 'change', '[data-filter]', (_, el) => { f[el.dataset.filter] = el.value; updateFilterCount(); load(); });
    on(main, 'click', '[data-reset]', () => {
      Object.assign(f, { q: '', status: 'all', condition: '', lang: '', set: '', account: '', from: '', to: '', pmin: '', pmax: '' });
      $('#q').value = '';
      refresh();
    });
    on(main, 'click', '[data-status]', (_, b) => {
      f.status = b.dataset.status;
      main.querySelectorAll('#status-chips .chip').forEach(c => c.setAttribute('aria-pressed', String(c === b)));
      renderChips();
      load();
    });
    on(main, 'click', '[data-view]', async (_, b) => {
      view = b.dataset.view;
      main.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      renderResults();
      try {
        const modes = { ...(settings?.view_modes || {}), [dir]: view };
        await api.update('settings', { id: 'eq.1' }, { view_modes: modes });
        settings = { ...settings, view_modes: modes };
        store.forget('settings');
      } catch (_) { /* le choix d'affichage n'est qu'une préférence */ }
    });
    on(main, 'click', '[data-more]', () => load(true));
    on(main, 'click', '[data-retry]', () => load());

    on(main, 'change', '[data-select]', (_, c) => {
      c.checked ? selected.add(c.dataset.select) : selected.delete(c.dataset.select);
      c.closest('[data-id]')?.classList.toggle('is-selected', c.checked);
      renderSelection();
    });
    on(main, 'change', '[data-select-all]', (_, c) => {
      rows.forEach(r => c.checked ? selected.add(r.id) : selected.delete(r.id));
      renderResults();
    });

    on(main, 'click', '[data-open]', async (_, b) => {
      const line = rows.find(r => r.id === b.dataset.open);
      const { openLineForm } = await import('./line-form.js');
      openLineForm({ direction: dir, line, onSaved: refresh }).catch(toastError);
    });
    on(main, 'click', '[data-commande]', async (_, b) => {
      const { openCommande } = await import('../../shared/commande.js');
      openCommande(b.dataset.commande, { onChanged: refresh }).catch(toastError);
    });
    on(main, 'click', '[data-new]', async () => {
      if (dir === 'vente') {
        const { openLineForm } = await import('./line-form.js');
        openLineForm({ direction: 'vente', onSaved: refresh }).catch(toastError);
      } else {
        const { openAchatForm } = await import('./achat-form.js');
        openAchatForm({ onSaved: refresh }).catch(toastError);
      }
    });
    on(main, 'click', '[data-bulk]', async (_, b) => {
      const ids = [...selected];
      const done = () => { selected.clear(); refresh(); };
      const bulk = await import('./bulk.js');
      if (b.dataset.bulk === 'edit') bulk.openBulkEdit({ direction: dir, ids, onDone: done });
      if (b.dataset.bulk === 'attach') bulk.openAttach({ direction: dir, ids, onDone: done });
      if (b.dataset.bulk === 'delete') bulk.bulkDelete({ ids, onDone: done });
      if (b.dataset.bulk === 'all') { rows.forEach(r => selected.add(r.id)); renderResults(); }
      if (b.dataset.bulk === 'none') { selected.clear(); renderResults(); }
    });

    if (f.open) renderFilters();
    await Promise.all([renderChips(), load()]);
  },
};
