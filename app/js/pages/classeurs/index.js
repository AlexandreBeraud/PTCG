import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, reloadPage, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { setOptions, setOptionsHtml } from '../../shared/sets.js';
import { setSymbolHtml } from '../../shared/sales.js';

const SLOTS = [4, 9, 12, 16, 18];
const fill = b => (b.places ? b.remplies / b.places : 0);
const SORTS = [
  { id: 'order', label: 'Mon ordre', cmp: () => 0 },
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }) },
  { id: 'fill', label: 'Les plus remplis', cmp: (a, b) => fill(b) - fill(a) },
  { id: 'empty', label: 'Les moins remplis', cmp: (a, b) => fill(a) - fill(b) },
  { id: 'recent', label: 'Créés récemment', cmp: (a, b) => String(b.created_at).localeCompare(String(a.created_at)) },
];
let sortId = 'order';

// « p. 1 à 21 » pour chaque extension, dans l'ordre du classeur
function pageRanges(exts) {
  let page = 1;
  return exts.map(e => {
    const n = Number(e.pages) || 0;
    const range = n ? (n === 1 ? `p. ${page}` : `p. ${page} à ${page + n - 1}`) : 'pages non précisées';
    page += n;
    return { ...e, range };
  });
}

export default {
  title: 'Classeurs',

  async render(main) {
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Classeurs</h1><p id="sub">Tes classeurs physiques et ce qui est rangé dedans</p></div>
        <div class="page-actions">
          <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === sortId ? 'selected' : ''}>${o.label}</option>`)}</select>
          <button type="button" class="btn" data-new-sep>Nouveau séparateur</button>
          <button type="button" class="btn btn-primary" data-new>${icon('plus')}Nouveau classeur</button>
        </div>
      </header>
      <section id="list" aria-live="polite"><p class="muted">Chargement…</p></section>
    `);
    const $ = s => main.querySelector(s);

    let binders = [], groups = [];
    try {
      [binders, groups] = await Promise.all([
        api.list('classeur_list', { order: 'sort_order.asc.nullslast,created_at' }),
        api.list('classeur_groupes', { order: 'sort_order.asc.nullslast,name' }),
      ]);
    } catch (err) {
      return setHtml($('#list'), errorHtml('Impossible de charger les classeurs', err));
    }
    setHtml($('#sub'), `${binders.length} classeur${binders.length > 1 ? 's' : ''} · tes classeurs physiques et ce qui est rangé dedans`);

    const binderHtml = b => {
      const pct = b.places ? Math.min(100, Math.round(b.remplies / b.places * 100)) : 0;
      const done = b.status === 'complete';
      return html`
        <article class="binder">
          <button type="button" class="binder-cover" data-edit="${b.id}" aria-label="Modifier ${b.name}">
            ${b.image ? html`<img src="${imageUrl(b.image)}" alt="" loading="lazy" data-hide-on-error>` : html`<span>${icon('classeurs', 32)}</span>`}
          </button>
          <div class="binder-body">
            <div class="panel-head">
              <h2>${b.name}</h2>
              <span class="tag ${done ? 'tag-ok' : 'tag-warn'}">${done ? 'Complet' : 'En cours'}</span>
            </div>
            <span class="muted small">${b.pages || '?'} pages · ${b.slots_per_page || '?'} places par page</span>
            <div class="progress ${pct >= 100 ? 'is-full' : ''}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Remplissage"><span style="--w: ${pct}%"></span></div>
            <span class="small">${b.remplies} / ${b.places || '?'} places remplies</span>
            ${b.extensions.length ? html`<ul class="binder-sets">${pageRanges(b.extensions).map(e => html`
              <li>${setSymbolHtml({ set_id: e.set_id, set_symbol: e.symbol, set_name: e.name })}<a class="grow" href="#/extensions/${encodeURIComponent(e.set_id)}">${e.name}</a><span class="muted small">${e.range}</span></li>`)}</ul>` : ''}
            <div><button type="button" class="btn btn-sm" data-edit="${b.id}">Modifier</button></div>
          </div>
        </article>`;
    };

    // les classeurs rangés sous leurs séparateurs, ceux sans séparateur à la fin
    function draw() {
      if (!binders.length && !groups.length) {
        return setHtml($('#list'), html`<div class="empty"><h2>Aucun classeur</h2><button type="button" class="btn" data-new>Créer le premier</button></div>`);
      }
      const sorted = [...binders].sort(SORTS.find(o => o.id === sortId).cmp);
      const loose = sorted.filter(b => !groups.some(g => g.id === b.groupe_id));
      setHtml($('#list'), html`
        ${groups.map((g, i) => {
          const inside = sorted.filter(b => b.groupe_id === g.id);
          return html`
            <section class="binder-group">
              <div class="binder-sep">
                <h2>${g.name}</h2>
                <span class="binder-sep-line"></span>
                <span class="muted small">${inside.length} classeur${inside.length > 1 ? 's' : ''}</span>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-sep-move="${i}:-1" aria-label="Monter ${g.name}" ${i === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-sep-move="${i}:1" aria-label="Descendre ${g.name}" ${i === groups.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn btn-ghost btn-sm" data-sep-edit="${g.id}">Modifier</button>
              </div>
              ${inside.length ? html`<div class="binder-grid">${inside.map(binderHtml)}</div>`
                : html`<p class="muted small" style="margin: 0">Aucun classeur ici : choisis ce séparateur dans un classeur (Modifier).</p>`}
            </section>`;
        })}
        ${loose.length ? html`
          <section class="binder-group">
            ${groups.length ? html`<div class="binder-sep"><h2>Sans séparateur</h2><span class="binder-sep-line"></span></div>` : ''}
            <div class="binder-grid">${loose.map(binderHtml)}</div>
          </section>` : ''}`);
    }
    draw();

    async function moveGroup(i, d) {
      const list = [...groups];
      [list[i], list[i + d]] = [list[i + d], list[i]];
      try {
        await api.upsert('classeur_groupes', list.map((g, n) => ({ id: g.id, name: g.name, sort_order: n + 1 })), 'id');
        groups = list.map((g, n) => ({ ...g, sort_order: n + 1 }));
        draw();
      } catch (err) { toastError(err); }
    }

    function editGroup(g = null) {
      openModal({
        title: g ? 'Modifier le séparateur' : 'Nouveau séparateur',
        width: 460,
        body: html`<label class="field">Nom<input class="input" id="sep-name" value="${g?.name || ''}" placeholder="Méga-Évolution, DPP, Énergies…"></label>`,
        actions: [
          ...(g ? [{ label: 'Supprimer', danger: true, run: async () => {
            if (!await confirmModal({ title: `Supprimer « ${g.name} » ?`, message: 'Ses classeurs restent, sans séparateur.', confirmLabel: 'Supprimer', danger: true })) return false;
            try { await api.remove('classeur_groupes', { id: `eq.${g.id}` }); reloadPage(); } catch (err) { toastError(err); return false; }
          } }] : []),
          { label: 'Annuler' },
          { label: 'Enregistrer', primary: true, run: async el => {
            const name = el.querySelector('#sep-name').value.trim();
            if (!name) { toastError(new Error('Le nom est obligatoire')); return false; }
            try {
              if (g) await api.update('classeur_groupes', { id: `eq.${g.id}` }, { name });
              else await api.insert('classeur_groupes', { name, sort_order: groups.length + 1 });
              reloadPage();
            } catch (err) { toastError(err); return false; }
          } },
        ],
      });
    }

    $('#sort').addEventListener('change', e => { sortId = e.target.value; draw(); });
    on(main, 'click', '[data-new]', () => editBinder(null, groups));
    on(main, 'click', '[data-edit]', (_, b) => editBinder(binders.find(x => x.id === b.dataset.edit), groups));
    on(main, 'click', '[data-new-sep]', () => editGroup());
    on(main, 'click', '[data-sep-edit]', (_, b) => editGroup(groups.find(g => g.id === b.dataset.sepEdit)));
    on(main, 'click', '[data-sep-move]', (_, b) => { const [i, d] = b.dataset.sepMove.split(':').map(Number); moveGroup(i, d); });
  },
};

async function editBinder(b, groups = []) {
  const sets = await setOptions();
  const symbol = id => sets.find(s => s.id === id)?.symbol;
  const st = {
    groupe: b?.groupe_id || '',
    name: b?.name || '',
    pages: b?.pages ?? 40,
    slots: b?.slots_per_page ?? 9,
    image: b?.image || '',
    complete: b?.status === 'complete',
    rows: (b?.extensions || []).map(e => ({ set_id: e.set_id, name: e.name, symbol: e.symbol, pages: e.pages ?? '', filled: e.filled ?? 0 })),
  };

  const m = openModal({
    title: b ? 'Modifier un classeur' : 'Nouveau classeur',
    width: 760,
    body: html`<div class="manual-grid"><div id="bf-photo"></div><div class="form-grid" id="bf"></div></div>`,
    actions: [
      ...(b ? [{ label: 'Supprimer le classeur', danger: true, run: async () => {
        if (!await confirmModal({ title: `Supprimer « ${b.name} » ?`, message: 'Le classeur et la liste de ses extensions seront effacés.', confirmLabel: 'Supprimer', danger: true })) return false;
        try {
          await api.remove('classeurs', { id: `eq.${b.id}` });
          toast('Classeur supprimé');
          reloadPage();
        } catch (err) { toastError(err); return false; }
      } }] : []),
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: save },
    ],
  });
  const root = m.el.querySelector('#bf');
  dropzone(m.el.querySelector('#bf-photo'), { value: st.image, folder: 'Classeurs', label: 'Photo du classeur', onChange: p => { st.image = p; } });

  function render() {
    const used = st.rows.reduce((n, r) => n + (Number(r.pages) || 0), 0);
    const places = (Number(st.pages) || 0) * (Number(st.slots) || 0);
    const filled = st.rows.reduce((n, r) => n + (Number(r.filled) || 0), 0);
    setHtml(root, html`
      <div class="form-row">
        <label class="field grow">Nom<input class="input" data-f="name" value="${st.name}" required></label>
        ${groups.length ? html`<label class="field">Séparateur
          <select class="select" data-f="groupe"><option value="">Aucun</option>${groups.map(g => html`<option value="${g.id}" ${g.id === st.groupe ? 'selected' : ''}>${g.name}</option>`)}</select>
        </label>` : ''}
      </div>
      <div class="form-row">
        <label class="field">Pages<input class="input" type="number" min="1" data-f="pages" value="${st.pages}"></label>
        <div class="field grow"><span>Places par page</span>
          <div class="chips">
            ${SLOTS.map(n => html`<button type="button" class="chip" data-slots="${n}" aria-pressed="${Number(st.slots) === n}">${n}</button>`)}
            <input class="input input-sm input-narrow" type="number" min="1" data-f="slots" value="${st.slots}" aria-label="Autre nombre de places">
          </div>
        </div>
      </div>
      <label class="check-inline"><input type="checkbox" data-f="complete" ${st.complete ? 'checked' : ''}> Classeur complet</label>
      <div class="field"><span>Extensions rangées · ${used} page${used > 1 ? 's' : ''} sur ${st.pages || '?'} · ${filled} / ${places || '?'} places remplies</span>
        ${st.rows.length ? html`<div class="lines">${st.rows.map((r, i) => html`
          <div class="line line-binder">
            <span class="line-main line-set">${setSymbolHtml({ set_id: r.set_id, set_symbol: r.symbol, set_name: r.name })}<strong>${r.name}</strong></span>
            <label class="field small">Pages<input class="input input-sm" type="number" min="0" data-row="${i}" data-k="pages" value="${r.pages}"></label>
            <label class="field small">Places remplies<input class="input input-sm" type="number" min="0" data-row="${i}" data-k="filled" value="${r.filled}"></label>
            <span class="row-actions" style="margin: 0">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-move="${i}:-1" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-move="${i}:1" aria-label="Descendre" ${i === st.rows.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${i}" aria-label="Retirer ${r.name}">✕</button>
            </span>
          </div>`)}</div>` : html`<p class="muted small" style="margin: 0">Aucune extension rangée.</p>`}
      </div>
      <label class="field">Ranger une extension
        <select class="select" id="bf-add">${setOptionsHtml(sets.filter(s => !st.rows.some(r => r.set_id === s.id)), '', { empty: '+ Choisir l’extension à ajouter' })}</select>
      </label>
    `);
  }

  function addSet() {
    const s = sets.find(x => x.id === root.querySelector('#bf-add').value);
    if (!s) return;
    if (st.rows.some(r => r.set_id === s.id)) return toastError(new Error('Déjà rangée dans ce classeur'));
    // pages proposées d'après le nombre de cartes
    const pages = Number(st.slots) ? Math.ceil((s.card_count_total || s.card_count || 0) / Number(st.slots)) || '' : '';
    st.rows.push({ set_id: s.id, name: s.name, symbol: symbol(s.id), pages, filled: 0 });
    render();
    root.querySelector('#bf-add')?.focus();
  }

  root.addEventListener('input', e => {
    const { f, row, k } = e.target.dataset;
    if (f === 'complete') st.complete = e.target.checked;
    else if (f) st[f] = e.target.value;
    if (row != null) st.rows[Number(row)][k] = e.target.value;
    if (f === 'slots') root.querySelectorAll('[data-slots]').forEach(c => c.setAttribute('aria-pressed', String(Number(c.dataset.slots) === Number(st.slots))));
  });
  root.addEventListener('change', e => {
    if (e.target.id === 'bf-add') return addSet();
    if (e.target.dataset.row != null || e.target.dataset.f === 'pages') render();
  });
  on(root, 'click', '[data-slots]', (_, c) => { st.slots = Number(c.dataset.slots); render(); });
  on(root, 'click', '[data-del]', (_, c) => { st.rows.splice(Number(c.dataset.del), 1); render(); });
  on(root, 'click', '[data-move]', (_, c) => {
    const [i, d] = c.dataset.move.split(':').map(Number);
    [st.rows[i], st.rows[i + d]] = [st.rows[i + d], st.rows[i]];
    render();
  });

  async function save() {
    try {
      await api.rpc('save_classeur', {
        classeur: {
          id: b?.id || null, name: st.name.trim(), pages: Number(st.pages) || null, slots_per_page: Number(st.slots) || null,
          image: st.image || null, status: st.complete ? 'complete' : 'in_progress', sort_order: b?.sort_order ?? null,
          groupe_id: st.groupe || null,
        },
        rangees: st.rows.map(r => ({ set_id: r.set_id, pages: r.pages === '' ? null : Number(r.pages), filled: Number(r.filled) || 0 })),
      });
      toast('Classeur enregistré');
      reloadPage();
    } catch (err) { toastError(err); return false; }
  }

  render();
}
