import { api } from '../../api.js';
import { html, setHtml, on, errorHtml, autoMore } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { uploadAs } from '../../nas.js';
import { setSymbolHtml, norm } from '../../shared/sales.js';
import { bySortie, cardPicker } from '../../shared/picker.js';
import { cardTile } from '../../shared/cards.js';
import { KINDS, kindOf, ficheImg, ficheImagePath, loadFicheImages, forgetFicheImages } from '../../shared/fiches.js';

// Personnages, supporters, objets, lieux et énergies : regroupés automatiquement
// chaque nuit (v2.refresh_fiches), retouchables à la main depuis une fiche.
const state = { kind: 'personnage', q: '', stock: false };
const STEP = 120;

export default {
  title: 'Encyclopédie',

  async render(main, params) {
    if (params[0] && params[1]) return renderFiche(main, params[1]);
    if (KINDS.some(k => k.id === params[0])) state.kind = params[0];

    setHtml(main, html`
      <header class="page-header">
        <div>
          <h1>Encyclopédie</h1>
          <p>Personnages, supporters, objets, lieux et énergies, regroupés automatiquement chaque nuit</p>
        </div>
      </header>
      <nav class="segmented" aria-label="Catégorie">
        ${KINDS.map(k => html`<button type="button" data-kind="${k.id}" aria-pressed="${state.kind === k.id}">${k.label} <span class="muted" data-count="${k.id}"></span></button>`)}
      </nav>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" value="${state.q}" aria-label="Rechercher"></label>
        <label class="check-inline"><input type="checkbox" id="stock" ${state.stock ? 'checked' : ''}> Seulement mon stock</label>
      </div>
      <section id="grid" aria-live="polite"><p class="muted">Chargement…</p></section>
    `);
    const $ = s => main.querySelector(s);
    const kind = () => KINDS.find(k => k.id === state.kind);
    let rows = [];
    let shown = 0;
    let seq = 0;

    // nombre de fiches par onglet
    Promise.all(KINDS.map(k => api.count('fiches', { kind: `eq.${k.id}` }).then(n => [k.id, n]).catch(() => [k.id, null])))
      .then(list => list.forEach(([id, n]) => { const el = main.querySelector(`[data-count="${id}"]`); if (el && n != null) el.textContent = `· ${n}`; }));

    const tile = f => html`
      <a class="ent" href="#/encyclopedie/${f.kind}/${encodeURIComponent(f.key)}">
        ${ficheImg(f)}
        <span class="ent-name">${f.name}</span>
        <span class="muted small">${f.cartes} carte${f.cartes > 1 ? 's' : ''}${Number(f.en_stock) ? html` · <span class="pos">${f.en_stock} en stock</span>` : ''}</span>
      </a>`;

    function more() {
      const grid = $('#ent-grid');
      if (!grid) return;
      grid.querySelector('[data-more]')?.remove();
      const next = rows.slice(shown, shown + STEP);
      shown += next.length;
      grid.insertAdjacentHTML('beforeend', String(html`${next.map(tile)}${shown < rows.length ? html`<span data-more></span>` : ''}`));
    }

    async function load() {
      const mine = ++seq;
      $('#q').placeholder = kind().search;
      const nq = norm(state.q).replace(/[^a-z0-9]+/g, ' ').trim();
      const params = { kind: `eq.${state.kind}`, order: 'name', select: 'key,kind,name,cartes,en_stock,image' };
      if (nq) params.search = `like.* ${nq}*`;
      if (state.stock) params.en_stock = 'gt.0';
      try {
        [rows] = await Promise.all([api.list('fiche_list', params), loadFicheImages()]);
      } catch (err) {
        return setHtml($('#grid'), errorHtml('Impossible de charger l’Encyclopédie', err));
      }
      if (mine !== seq) return;
      // les énergies de base d'abord, puis par nom
      const base = f => f.key.startsWith('energie:type:') ? 0 : 1;
      rows.sort((a, b) => base(a) - base(b) || norm(a.name).localeCompare(norm(b.name)));
      shown = 0;
      if (!rows.length) {
        return setHtml($('#grid'), html`<div class="empty"><h2>${state.stock ? `Aucun ${kind().one} en stock` : `Aucun ${kind().one}`}${state.q ? ` pour « ${state.q} »` : ''}</h2>
          ${!state.q && !state.stock ? html`<p class="muted">Les fiches sont calculées chaque nuit, ou tout de suite depuis les Réglages.</p>` : ''}</div>`);
      }
      setHtml($('#grid'), html`<div class="ent-grid" id="ent-grid"></div>`);
      more();
    }

    let timer;
    $('#q').addEventListener('input', e => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); load(); }, 250); });
    $('#stock').addEventListener('change', e => { state.stock = e.target.checked; load(); });
    on(main, 'click', '[data-kind]', (_, b) => {
      state.kind = b.dataset.kind;
      main.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      history.replaceState(null, '', `#/encyclopedie/${state.kind}`);
      load();
    });
    autoMore(main, more);
    load();
  },
};

// ── Une fiche et toutes ses cartes, rangées par extension ──
async function renderFiche(page, key, editing = false) {
  // un conteneur neuf à chaque affichage : les écouteurs ne s'empilent pas
  const main = document.createElement('div');
  page.replaceChildren(main);
  setHtml(main, html`<p class="muted">Chargement…</p>`);
  let f, cards;
  try {
    [f, cards] = await Promise.all([
      api.one('fiche_list', { key: `eq.${key}` }),
      api.list('fiche_card_list', { fiche_key: `eq.${key}`, order: 'release_date.desc.nullslast,set_id,number_sort.nullslast,number', limit: 2000 }),
      loadFicheImages(),
    ]);
  } catch (err) {
    return setHtml(main, errorHtml('Impossible de charger la fiche', err));
  }
  const kind = kindOf(key) || KINDS[0];
  if (!f) {
    return setHtml(main, html`<div class="empty"><h2>Cette fiche n’existe plus</h2>
      <p class="muted">Elle a peut-être été fusionnée ou recalculée.</p><a href="#/encyclopedie/${kind.id}">← ${kind.label}</a></div>`);
  }
  document.title = `${f.name} · PTCG`;
  cards.sort(bySortie);
  const stock = cards.reduce((n, c) => n + Number(c.en_stock), 0);
  const names = [...new Set(cards.map(c => c.name))].sort((a, b) => a.localeCompare(b));
  const groups = [];
  for (const c of cards) {
    let g = groups[groups.length - 1];
    if (!g || g.id !== c.set_id) groups.push(g = { id: c.set_id, first: c, cards: [] });
    g.cards.push(c);
  }
  const nasPath = ficheImagePath(kind.id, f.name);

  setHtml(main, html`
    <a class="back-crumb" href="#/encyclopedie/${kind.id}">← ${kind.label}</a>
    <header class="poke-header">
      <span class="poke-sprite poke-sprite-lg">${ficheImg(f)}</span>
      <div class="grow">
        <p class="muted small" style="margin: 0">${kind.one[0].toUpperCase() + kind.one.slice(1)}${f.retouches ? ' · retouchée à la main' : ''}</p>
        <h1 class="card-title">${f.name}</h1>
        ${names.length > 1 ? html`<div class="chips-static">${names.map(n => html`<span class="tag">${n}</span>`)}</div>` : ''}
        <div class="row-actions">
          ${editing
            ? html`<button type="button" class="btn btn-sm btn-primary" data-done>Terminer</button>`
            : html`<button type="button" class="btn btn-sm btn-ghost" data-edit>Modifier</button>`}
          <button type="button" class="btn btn-sm btn-ghost" data-image>Changer l’image</button>
        </div>
      </div>
      <div class="kpis kpis-2">
        <div class="kpi"><span class="muted small">Cartes</span><strong>${cards.length}</strong></div>
        <div class="kpi"><span class="muted small">En stock</span><strong class="${stock ? 'pos' : ''}">${stock}</strong></div>
      </div>
    </header>
    ${editing ? html`
      <div class="edit-bar">
        <button type="button" class="btn btn-sm" data-rename>Renommer</button>
        <button type="button" class="btn btn-sm" data-merge>Fusionner avec…</button>
        <button type="button" class="btn btn-sm" data-move>Changer d’onglet</button>
        <button type="button" class="btn btn-sm" data-add>Ajouter des cartes…</button>
        ${f.retouches ? html`<button type="button" class="btn btn-sm btn-ghost" data-undo>Annuler mes retouches (${f.retouches})</button>` : ''}
        <span class="muted small">Gardées au recalcul de la nuit.</span>
      </div>` : ''}
    <section class="${editing ? 'editing' : ''}">
      ${groups.length ? html`${groups.map(g => html`
        <div class="serie-head">${setSymbolHtml(g.first)}<h3><a href="#/extensions/${encodeURIComponent(g.id)}">${g.first.set_name}</a></h3>
          <span class="muted small">${g.first.release_date ? g.first.release_date.slice(0, 4) : ''} · ${g.cards.length} carte${g.cards.length > 1 ? 's' : ''}</span></div>
        <div class="card-grid">${g.cards.map(c => html`
          <div class="card-tile-wrap">${cardTile(c)}${editing ? html`<button type="button" class="card-x" data-out="${c.id}" title="Retirer de la fiche" aria-label="Retirer ${c.name} de la fiche">✕</button>` : ''}</div>`)}</div>`)}`
      : html`<div class="empty"><h2>Plus aucune carte sur cette fiche</h2></div>`}
    </section>`);

  // une retouche, puis on réaffiche (la fiche peut avoir changé de clé)
  async function retouche(action, args = {}, { stay = true } = {}) {
    try {
      const next = await api.rpc('fiche_retouche', { action, fiche: key, valeur: null, carte: null, ...args }, { timeout: 60000 });
      if (next && next !== key) location.hash = `#/encyclopedie/${kindOf(next)?.id || kind.id}/${encodeURIComponent(next)}`;
      else if (stay) renderFiche(page, key, true);
      return true;
    } catch (err) {
      toastError(err);
      return false;
    }
  }

  on(main, 'click', '[data-edit]', () => renderFiche(page, key, true));
  on(main, 'click', '[data-done]', () => renderFiche(page, key, false));
  on(main, 'click', '[data-image]', () => changeImage(f, kind, nasPath, () => renderFiche(page, key, editing)));
  on(main, 'click', '[data-out]', (_, b) => retouche('retirer', { carte: b.dataset.out }));

  on(main, 'click', '[data-rename]', () => openModal({
    title: `Renommer « ${f.name} »`,
    width: 460,
    body: html`<label class="field">Nom<input class="input" id="fi-name" value="${f.name}"></label>
      <p class="muted small" style="margin: 0">Vide : le nom calculé revient.</p>`,
    actions: [
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: el => retouche('nom', { valeur: el.querySelector('#fi-name').value.trim() || null }) },
    ],
  }));

  on(main, 'click', '[data-move]', () => openModal({
    title: `Changer « ${f.name} » d’onglet`,
    width: 460,
    body: html`<div class="stack">${KINDS.filter(k => k.id !== kind.id).map((k, i) => html`
      <label class="check-inline"><input type="radio" name="fi-kind" value="${k.id}" ${i ? '' : 'checked'}> ${k.label}</label>`)}</div>`,
    actions: [
      { label: 'Annuler' },
      { label: 'Déplacer', primary: true, run: el => retouche('onglet', { valeur: el.querySelector('[name="fi-kind"]:checked').value }) },
    ],
  }));

  on(main, 'click', '[data-merge]', () => mergeModal(f, target => retouche('fusion', { valeur: target.key })));

  on(main, 'click', '[data-add]', () => {
    const m = openModal({
      title: `Ajouter des cartes à « ${f.name} »`,
      width: 760,
      body: html`<div data-picker></div>`,
      onOpen: el => cardPicker(el.querySelector('[data-picker]'), {
        onPick: async c => {
          if (cards.some(x => x.id === c.id)) return toast('Cette carte est déjà sur la fiche');
          if (await retouche('ajouter', { carte: c.id }, { stay: false })) {
            m.close();
            if (page.isConnected) renderFiche(page, key, true);
            toast(`${c.name} ajoutée`);
          }
        },
      }),
    });
  });

  on(main, 'click', '[data-undo]', async () => {
    if (!await confirmModal({ title: 'Annuler mes retouches ?', message: 'La fiche redevient telle que calculée automatiquement (nom, onglet, fusions, cartes ajoutées ou retirées).', confirmLabel: 'Annuler les retouches' })) return;
    try {
      const next = await api.rpc('fiche_retouche', { action: 'annuler', fiche: key, valeur: null, carte: null }, { timeout: 60000 });
      if (next && next !== key) location.hash = `#/encyclopedie/${kindOf(next)?.id || kind.id}/${encodeURIComponent(next)}`;
      else renderFiche(page, key, false);
    } catch (err) {
      toastError(err);
    }
  });
}

// Fusionner : choisir l'autre fiche, dans n'importe quel onglet
function mergeModal(f, done) {
  let found = [];
  let seq = 0;
  openModal({
    title: `Fusionner « ${f.name} » avec…`,
    width: 620,
    body: html`
      <label class="search">${icon('search')}<input type="search" data-merge-q placeholder="Nom de l’autre fiche" aria-label="Nom de l’autre fiche"></label>
      <p class="muted small">Toutes les cartes de « ${f.name} » iront sur la fiche choisie.</p>
      <div data-merge-list class="ent-grid"></div>`,
    onOpen(el) {
      const input = el.querySelector('[data-merge-q]');
      const list = el.querySelector('[data-merge-list]');
      let timer;
      input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const mine = ++seq;
          const nq = norm(input.value).replace(/[^a-z0-9]+/g, ' ').trim();
          if (nq.length < 2) { found = []; return setHtml(list, ''); }
          try {
            found = await api.list('fiche_list', { search: `like.* ${nq}*`, key: `neq.${f.key}`, order: 'cartes.desc', limit: 24, select: 'key,kind,name,cartes,image' });
          } catch (err) { return toastError(err); }
          if (mine !== seq) return;
          setHtml(list, found.length ? html`${found.map((x, i) => html`
            <button type="button" class="ent" data-pick="${i}">${ficheImg(x)}<span class="ent-name">${x.name}</span>
              <span class="muted small">${kindOf(x.key)?.label} · ${x.cartes} carte${x.cartes > 1 ? 's' : ''}</span></button>`)}`
            : html`<p class="muted small">Aucune fiche pour « ${input.value.trim()} »</p>`);
        }, 200);
      });
      on(list, 'click', '[data-pick]', async (_, b) => {
        const target = found[Number(b.dataset.pick)];
        if (!await confirmModal({ title: `Fusionner dans « ${target.name} » ?`, message: `« ${f.name} » disparaît, ses cartes vont sur « ${target.name} ». Annulable depuis « ${target.name} ».`, confirmLabel: 'Fusionner' })) return;
        el.closest('.modal-scrim')?.remove();
        done(target);
      });
      setTimeout(() => input.focus(), 0);
    },
  });
}

// L'image est rangée sur le NAS sous le nom de la fiche : Personnages/Cynthia.png
function changeImage(f, kind, current, done) {
  const base = f.name.replace(/[\\/:*?"<>|]+/g, '').trim();
  openModal({
    title: `Image de ${f.name}`,
    width: 520,
    body: html`<div data-drop></div>
      <p class="muted small">Enregistrée sur le NAS dans <code>${kind.folder}/${base}.png</code>${current ? ` (remplace ${current})` : ''}.</p>`,
    onOpen: el => dropzone(el.querySelector('[data-drop]'), {
      label: 'Glisse une image ici',
      send: async file => {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        // même nom de fichier qu'avant si possible, pour ne pas laisser de doublon
        const path = current && current.endsWith(`.${ext}`) ? current : `${kind.folder}/${base}.${ext}`;
        await uploadAs(file, path);
        forgetFicheImages();
        el.closest('.modal-scrim')?.remove();
        toast('Image enregistrée');
        done();
        return path;
      },
    }),
    actions: [{ label: 'Fermer' }],
  });
}
