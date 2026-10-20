import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, reloadPage, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';

const SLOTS = [4, 9, 12, 16, 18];

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
        <div class="page-actions"><button type="button" class="btn btn-primary" data-new>${icon('plus')}Nouveau classeur</button></div>
      </header>
      <section id="list" aria-live="polite"><p class="muted">Chargement…</p></section>
    `);
    const $ = s => main.querySelector(s);

    let binders = [];
    try {
      binders = await api.list('classeur_list', { order: 'sort_order.asc.nullslast,created_at' });
    } catch (err) {
      return setHtml($('#list'), errorHtml('Impossible de charger les classeurs', err));
    }
    setHtml($('#sub'), `${binders.length} classeur${binders.length > 1 ? 's' : ''} · tes classeurs physiques et ce qui est rangé dedans`);

    setHtml($('#list'), binders.length ? html`<div class="binder-grid">${binders.map(b => {
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
              <li><a href="#/extensions/${encodeURIComponent(e.set_id)}">${e.name}</a><span class="muted small">${e.range}</span></li>`)}</ul>` : ''}
            <div><button type="button" class="btn btn-sm" data-edit="${b.id}">Modifier</button></div>
          </div>
        </article>`;
    })}</div>` : html`<div class="empty"><h2>Aucun classeur</h2><button type="button" class="btn" data-new>Créer le premier</button></div>`);

    on(main, 'click', '[data-new]', () => editBinder(null));
    on(main, 'click', '[data-edit]', (_, b) => editBinder(binders.find(x => x.id === b.dataset.edit)));
  },
};

async function editBinder(b) {
  const sets = await api.list('sets', { select: 'id,name,card_count_total,card_count', order: 'release_date.desc.nullslast' });
  const st = {
    name: b?.name || '',
    pages: b?.pages ?? 40,
    slots: b?.slots_per_page ?? 9,
    image: b?.image || '',
    complete: b?.status === 'complete',
    rows: (b?.extensions || []).map(e => ({ set_id: e.set_id, name: e.name, pages: e.pages ?? '', filled: e.filled ?? 0 })),
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
      <label class="field">Nom<input class="input" data-f="name" value="${st.name}" required></label>
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
            <span class="line-main"><strong>${r.name}</strong></span>
            <label class="field small">Pages<input class="input input-sm" type="number" min="0" data-row="${i}" data-k="pages" value="${r.pages}"></label>
            <label class="field small">Places remplies<input class="input input-sm" type="number" min="0" data-row="${i}" data-k="filled" value="${r.filled}"></label>
            <span class="row-actions" style="margin: 0">
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-move="${i}:-1" aria-label="Monter" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-move="${i}:1" aria-label="Descendre" ${i === st.rows.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${i}" aria-label="Retirer ${r.name}">✕</button>
            </span>
          </div>`)}</div>` : html`<p class="muted small" style="margin: 0">Aucune extension rangée.</p>`}
      </div>
      <div class="input-group">
        <input class="input" list="bf-sets" id="bf-add" placeholder="+ Ranger une extension (nom)" aria-label="Ranger une extension">
        <datalist id="bf-sets">${sets.map(s => html`<option value="${s.name}"></option>`)}</datalist>
        <button type="button" class="btn" data-add>Ajouter</button>
      </div>
    `);
  }

  function addSet() {
    const input = root.querySelector('#bf-add');
    const s = sets.find(x => x.name.toLowerCase() === input.value.trim().toLowerCase());
    if (!s) return toastError(new Error('Choisis une extension de la liste'));
    if (st.rows.some(r => r.set_id === s.id)) return toastError(new Error('Déjà rangée dans ce classeur'));
    // pages proposées d'après le nombre de cartes
    const pages = Number(st.slots) ? Math.ceil((s.card_count_total || s.card_count || 0) / Number(st.slots)) || '' : '';
    st.rows.push({ set_id: s.id, name: s.name, pages, filled: 0 });
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
  root.addEventListener('change', e => { if (e.target.dataset.row != null || e.target.dataset.f === 'pages') render(); });
  root.addEventListener('keydown', e => { if (e.target.id === 'bf-add' && e.key === 'Enter') { e.preventDefault(); addSet(); } });
  on(root, 'click', '[data-add]', addSet);
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
        },
        rangees: st.rows.map(r => ({ set_id: r.set_id, pages: r.pages === '' ? null : Number(r.pages), filled: Number(r.filled) || 0 })),
      });
      toast('Classeur enregistré');
      reloadPage();
    } catch (err) { toastError(err); return false; }
  }

  render();
}
