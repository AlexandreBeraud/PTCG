import { api } from '../../api.js';
import { html, setHtml, on, errorHtml, reloadPage } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { askImage } from '../../ui/upload.js';
import { inList, setSymbolHtml } from '../../shared/sales.js';
import { TABS, entityImg, bySortie } from '../../shared/picker.js';
import { cardTile } from '../../shared/cards.js';

// Personnages, objets, lieux et énergies : mes fiches (Cynthia, Poké Ball…) et
// les noms de cartes, avec toutes leurs cartes. Même source que le choix des cartes d'une vente.
const KINDS = TABS.filter(t => t.id !== 'pokemon' && t.id !== 'cartes');
const state = { kind: 'personnage', q: '' };

export default {
  title: 'Personnages et objets',

  async render(main, params) {
    if (params[0] && params[1]) return renderFiche(main, params[0], params[1]);
    if (params[0] && KINDS.some(k => k.id === params[0])) state.kind = params[0];

    setHtml(main, html`
      <header class="page-header">
        <div>
          <h1>Personnages et objets</h1>
          <p>Une fiche regroupe toutes les cartes dont le nom la contient : « Cynthia » → « Ambition de Cynthia », « Carchacrok de Cynthia ex »…</p>
        </div>
        <div class="page-actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}Nouvelle fiche</button></div>
      </header>
      <nav class="segmented" aria-label="Catégorie">
        ${KINDS.map(k => html`<button type="button" data-kind="${k.id}" aria-pressed="${state.kind === k.id}">${k.label}</button>`)}
      </nav>
      <label class="search">${icon('search')}<input type="search" id="q" value="${state.q}" aria-label="Rechercher"></label>
      <section id="grid" aria-live="polite"></section>
    `);
    const $ = s => main.querySelector(s);
    const kind = () => KINDS.find(k => k.id === state.kind);
    let rows = [];
    let seq = 0;

    async function load() {
      const mine = ++seq;
      $('#q').placeholder = kind().search;
      try {
        rows = await api.rpc('picker_entities', { kind: state.kind, q: state.q || null, lim: 2000 });
      } catch (err) {
        return setHtml($('#grid'), errorHtml('Impossible de charger les fiches', err));
      }
      if (mine !== seq) return;
      const fiches = rows.filter(e => e.type === 'entite');
      const noms = rows.filter(e => e.type !== 'entite');
      const tile = e => html`
        <a class="ent" href="#/fiches/${state.kind}/${encodeURIComponent(e.key)}">
          ${entityImg(e)}
          <span class="ent-name">${e.name}</span>
          <span class="muted small">${e.cartes} carte${e.cartes > 1 ? 's' : ''}${Number(e.en_stock) ? html` · <span class="pos">${e.en_stock} en stock</span>` : ''}</span>
        </a>`;
      setHtml($('#grid'), html`
        ${fiches.length ? html`<h2 class="section-title">Mes fiches · ${fiches.length}</h2><div class="ent-grid">${fiches.map(tile)}</div>` : ''}
        ${noms.length ? html`<h2 class="section-title">${state.q ? 'Cartes' : 'Cartes déjà vendues ou achetées'} · ${noms.length}</h2><div class="ent-grid">${noms.map(tile)}</div>` : ''}
        ${!rows.length ? html`<div class="empty"><h2>Rien${state.q ? ` pour « ${state.q} »` : ''}</h2></div>` : ''}
        ${!state.q && noms.length ? html`<p class="muted small">Tape un nom pour retrouver les autres cartes.</p>` : ''}`);
    }

    let timer;
    $('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
    on(main, 'click', '[data-kind]', (_, b) => {
      state.kind = b.dataset.kind;
      main.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      load();
    });
    on(main, 'click', '[data-new]', () => editFiche({ kind: state.kind, name: state.q }));
    load();
  },
};

// Une fiche (ou un nom de carte) et toutes ses cartes, rangées par extension
async function renderFiche(main, kindId, key) {
  const kind = KINDS.find(k => k.id === kindId) || KINDS[0];
  setHtml(main, html`<p class="muted">Chargement…</p>`);
  let e, row, cards;
  try {
    if (key.startsWith('e:')) {
      row = await api.one('entites', { id: `eq.${key.slice(2)}` });
      if (!row) return setHtml(main, html`<div class="empty"><h2>Fiche introuvable</h2><a href="#/fiches">Retour</a></div>`);
    }
    const found = await api.rpc('picker_entities', { kind: kind.id, q: row ? row.name : key.slice(2).trim(), lim: 2000 });
    e = (found || []).find(x => x.key === key) || { type: row ? 'entite' : 'nom', key, name: row?.name || key.slice(2).trim(), tokens: key.startsWith('n:') ? key.slice(2) : null, image: row?.image };
    const params = { order: 'release_date.desc.nullslast,set_id,number_sort.nullslast,number', limit: 1000 };
    params.name_tokens = e.type === 'entite' ? `like.*${e.tokens}*` : `eq.${e.tokens}`;
    if (kind.fam) params.famille = inList(kind.fam);
    else if (e.type === 'nom') params.famille = 'eq.supporter';
    cards = e.tokens ? (await api.list('card_list', params)).sort(bySortie) : [];
  } catch (err) {
    return setHtml(main, errorHtml('Impossible de charger la fiche', err));
  }
  document.title = `${e.name} · PTCG`;
  const stock = cards.reduce((n, c) => n + Number(c.en_stock), 0);
  const groups = [];
  for (const c of cards) {
    let g = groups[groups.length - 1];
    if (!g || g.id !== c.set_id) groups.push(g = { id: c.set_id, first: c, cards: [] });
    g.cards.push(c);
  }

  setHtml(main, html`
    <a class="back-crumb" href="#/fiches/${kind.id}">← ${kind.label}</a>
    <header class="poke-header">
      <span class="poke-sprite poke-sprite-lg">${entityImg(e)}</span>
      <div class="grow">
        <p class="muted small" style="margin: 0">${kind.one}${row ? ' · ma fiche' : ' · nom de carte'}</p>
        <h1 class="card-title">${e.name}</h1>
        ${row ? html`<div class="row-actions">
          <button type="button" class="btn btn-sm btn-ghost" data-image>Changer l’image</button>
          <button type="button" class="btn btn-sm btn-ghost" data-edit>Renommer ou supprimer</button>
        </div>` : html`<div class="row-actions"><button type="button" class="btn btn-sm btn-ghost" data-make>En faire une fiche</button></div>`}
      </div>
      <div class="kpis kpis-2">
        <div class="kpi"><span class="muted small">Cartes</span><strong>${cards.length}</strong></div>
        <div class="kpi"><span class="muted small">En stock</span><strong class="${stock ? 'pos' : ''}">${stock}</strong></div>
      </div>
    </header>
    <section>
      ${groups.length ? html`${groups.map(g => html`
        <div class="serie-head">${setSymbolHtml(g.first)}<h3><a href="#/extensions/${encodeURIComponent(g.id)}">${g.first.set_name}</a></h3>
          <span class="muted small">${g.first.release_date ? g.first.release_date.slice(0, 4) : ''} · ${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span></div>
        <div class="card-grid">${g.cards.map(c => cardTile(c))}</div>`)}`
      : html`<div class="empty"><h2>Aucune carte ne contient « ${e.name} »</h2></div>`}
    </section>`);

  on(main, 'click', '[data-image]', async () => {
    const v = await askImage({ title: `Image de ${row.name}`, value: row.image || '', folder: 'Fiches', removable: !!row.image });
    if (v === null) return;
    try { await api.update('entites', { id: `eq.${row.id}` }, { image: v || null }); reloadPage(); } catch (err) { toastError(err); }
  });
  on(main, 'click', '[data-edit]', () => editFiche(row));
  on(main, 'click', '[data-make]', () => editFiche({ kind: kind.id, name: e.name }));
}

// Créer, renommer ou supprimer une fiche
function editFiche(f) {
  const kind = KINDS.find(k => k.id === f.kind) || KINDS[0];
  openModal({
    title: f.id ? `Modifier « ${f.name} »` : `Nouvelle fiche ${kind.one}`,
    width: 480,
    body: html`
      <label class="field">Nom<input class="input" id="fi-name" value="${f.name || ''}" placeholder="${kind.id === 'personnage' ? 'Cynthia' : 'Poké Ball'}"></label>
      <p class="muted small" style="margin: 0">Toutes les cartes dont le nom contient ces mots (entiers) seront sur la fiche.</p>`,
    actions: [
      ...(f.id ? [{ label: 'Supprimer', danger: true, run: async () => {
        if (!await confirmModal({ title: `Supprimer « ${f.name} » ?`, message: 'Seule la fiche disparaît : les cartes restent.', confirmLabel: 'Supprimer', danger: true })) return false;
        try { await api.remove('entites', { id: `eq.${f.id}` }); location.hash = `#/fiches/${kind.id}`; } catch (err) { toastError(err); return false; }
      } }] : []),
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: async el => {
        const name = el.querySelector('#fi-name').value.trim();
        if (!name) { toastError(new Error('Le nom est obligatoire')); return false; }
        try {
          if (f.id) {
            await api.update('entites', { id: `eq.${f.id}` }, { name });
            reloadPage();
          } else {
            const row = await api.insert('entites', { kind: kind.id, name });
            toast('Fiche créée');
            location.hash = `#/fiches/${kind.id}/${encodeURIComponent(`e:${row.id}`)}`;
          }
        } catch (err) {
          toastError(err.status === 409 ? new Error(`La fiche « ${name} » existe déjà`) : err);
          return false;
        }
      } },
    ],
  });
}
