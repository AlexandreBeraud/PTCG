import { api } from '../../api.js';
import { html, setHtml, on, eur } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { store } from '../../shared/store.js';
import { contactAvatar, commandeStatusTag, fmtDate, norm, today, COUNTRIES, flag } from '../../shared/sales.js';

const ROLE = { all: 'Tous', vente: 'Acheteurs', achat: 'Vendeurs' };
// statut d'au moins une de ses commandes
const STATUTS = [
  { id: '', label: 'Toutes les commandes' },
  { id: 'a_envoyer', label: 'À envoyer' },
  { id: 'envoye', label: 'Envoyées' },
  { id: 'a_payer', label: 'À payer' },
  { id: 'paye', label: 'Payées, en attente' },
  { id: 'arrive', label: 'Reçues' },
];
const SORTS = [
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => a.pseudo.localeCompare(b.pseudo, 'fr') },
  { id: 'recent', label: 'Dernière commande', cmp: (a, b) => String(b.derniere || '').localeCompare(String(a.derniere || '')) },
  { id: 'vendu', label: 'Total vendu', cmp: (a, b) => Number(b.total_vente) - Number(a.total_vente) },
  { id: 'achete', label: 'Total acheté', cmp: (a, b) => Number(b.total_achat) - Number(a.total_achat) },
  { id: 'commandes', label: 'Nombre de commandes', cmp: (a, b) => (Number(b.commandes_vente) + Number(b.commandes_achat)) - (Number(a.commandes_vente) + Number(a.commandes_achat)) },
];

const state = { q: '', role: 'all', statut: '', sort: 'name' };

function roleLabel(c) {
  const a = c.commandes_vente > 0, v = c.commandes_achat > 0;
  const n = c.commandes_vente + c.commandes_achat;
  const who = a && v ? 'Acheteur et vendeur' : a ? 'Acheteur' : v ? 'Vendeur' : 'Contact';
  return `${who} · ${n} commande${n > 1 ? 's' : ''}`;
}

export default {
  title: 'Contacts',

  async render(main, params) {
    let contacts = [];
    let currentId = params[0] || null;

    setHtml(main, html`
      <header class="page-header">
        <div>
          <h1>Contacts</h1>
          <p id="contacts-sub">Acheteurs et vendeurs au même endroit</p>
        </div>
        <div class="page-actions"><button type="button" class="btn" data-new-contact>${icon('plus')}Nouveau contact</button></div>
      </header>
      <div class="split">
        <aside class="split-list" aria-label="Contacts">
          <label class="search">${icon('search')}<input type="search" id="cq" placeholder="Rechercher un contact" value="${state.q}" aria-label="Rechercher un contact"></label>
          <div class="chips" id="roles"></div>
          <div class="form-row">
            <label class="field">Commandes<select class="select" id="cstatut" aria-label="Statut des commandes"></select></label>
            <label class="field">Tri<select class="select" id="csort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === state.sort ? 'selected' : ''}>${o.label}</option>`)}</select></label>
          </div>
          <div id="clist" class="contact-list"></div>
        </aside>
        <section class="split-detail" id="detail" aria-live="polite"></section>
      </div>
    `);
    const $ = s => main.querySelector(s);

    async function loadList() {
      try {
        contacts = await api.list('contact_list', { order: 'pseudo' });
      } catch (err) {
        return setHtml($('#clist'), html`<p class="muted">${err.message}</p>`);
      }
      const pending = contacts.reduce((n, c) => n + Number(c.en_attente), 0);
      setHtml($('#contacts-sub'), `Acheteurs et vendeurs au même endroit${pending ? ` · ${pending} commande${pending > 1 ? 's' : ''} en attente` : ''}`);
      renderList();
    }

    function renderList() {
      setHtml($('#roles'), html`${Object.entries(ROLE).map(([id, label]) => html`<button type="button" class="chip" data-role="${id}" aria-pressed="${state.role === id}">${label}</button>`)}`);
      const q = norm(state.q);
      const byRole = contacts.filter(c =>
        (!q || norm(c.pseudo).includes(q))
        && (state.role === 'all' || (state.role === 'vente' ? c.commandes_vente > 0 : c.commandes_achat > 0)));
      const n = id => byRole.filter(c => (c.statuts || []).includes(id)).length;
      setHtml($('#cstatut'), html`${STATUTS.map(o => html`<option value="${o.id}" ${o.id === state.statut ? 'selected' : ''}>${o.label}${o.id ? ` (${n(o.id)})` : ''}</option>`)}`);
      const list = byRole
        .filter(c => !state.statut || (c.statuts || []).includes(state.statut))
        .sort(SORTS.find(o => o.id === state.sort).cmp);
      if (!currentId && list.length && matchMedia('(min-width: 861px)').matches) currentId = list[0].id;
      setHtml($('#clist'), list.length ? html`${list.map(c => html`
        <a class="contact-item" href="#/contacts/${encodeURIComponent(c.id)}" ${c.id === currentId ? html`aria-current="true"` : ''} data-contact="${c.id}">
          ${contactAvatar(c)}
          <span class="grow"><strong>${c.pseudo}</strong><span class="muted small">${roleLabel(c)}</span></span>
          ${Number(c.en_attente) ? html`<span class="tag tag-warn">${c.en_attente} en attente</span>` : ''}
        </a>`)}` : html`<p class="muted small">Aucun contact.</p>`);
      renderDetail();
    }

    async function renderDetail() {
      const box = $('#detail');
      const c = contacts.find(x => x.id === currentId);
      main.querySelector('.split').classList.toggle('has-detail', !!c);
      if (!c) return setHtml(box, html`<div class="empty"><h2>Choisis un contact</h2></div>`);

      setHtml(box, html`
        <a class="btn btn-ghost btn-sm back-link" href="#/contacts">← Contacts</a>
        <div class="contact-head">
          ${contactAvatar(c, 56)}
          <div class="grow">
            <h2>${c.pseudo}</h2>
            <p class="muted small" style="margin: 2px 0 0">${roleLabel(c)}${c.premiere ? ` · depuis ${new Date(c.premiere).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}` : ''}</p>
          </div>
          <button type="button" class="btn btn-sm btn-ghost" data-edit-contact>Modifier</button>
          <button type="button" class="btn btn-sm btn-primary" data-new-order>${icon('plus', 16)}Nouvelle commande</button>
        </div>
        <div class="kpis kpis-3">
          <div class="kpi"><span class="muted small">Commandes</span><strong>${Number(c.commandes_vente) + Number(c.commandes_achat)}</strong></div>
          <div class="kpi"><span class="muted small">Cartes vendues</span><strong>${c.cartes_vendues}</strong></div>
          <div class="kpi"><span class="muted small">${Number(c.total_achat) && !Number(c.total_vente) ? 'Total acheté' : 'Total vendu'}</span><strong>${eur(Number(c.total_vente) || Number(c.total_achat))}</strong></div>
        </div>
        <h3 class="section-title">Commandes</h3>
        <div id="orders"><p class="muted">Chargement…</p></div>
      `);

      try {
        const all = await api.list('commande_list', { contact_id: `eq.${c.id}`, order: 'ordered_on.desc.nullslast,created_at.desc' });
        if (currentId !== c.id) return;
        const orders = state.statut ? all.filter(o => o.status === state.statut) : all;
        const filtre = state.statut && orders.length < all.length
          ? html`<p class="muted small" style="margin: 0">${orders.length} commande${orders.length > 1 ? 's' : ''} « ${STATUTS.find(o => o.id === state.statut).label} » sur ${all.length} · <button type="button" class="link" data-statut-all>Tout afficher</button></p>`
          : '';
        setHtml(box.querySelector('#orders'), orders.length ? html`${filtre}<div class="orders">${orders.map(o => html`
          <div class="order">
            <div class="grow">
              <strong>${o.direction === 'vente' ? 'Vente' : 'Achat'} du ${fmtDate(o.ordered_on || o.created_at)}</strong>
              <span class="muted small">${o.apercu || 'Aucun article'}</span>
            </div>
            <span class="price">${eur(o.total)}</span>
            ${commandeStatusTag(o.direction, o.status)}
            ${o.link ? html`<a class="btn btn-sm btn-ghost" href="${o.link}" target="_blank" rel="noopener">Lien de la commande</a>` : ''}
            <button type="button" class="btn btn-sm" data-order="${o.id}">Détails</button>
          </div>`)}</div>` : html`<p class="muted small">Aucune commande.</p>`);
      } catch (err) {
        setHtml(box.querySelector('#orders'), html`<p class="muted">${err.message}</p>`);
      }
    }

    function contactForm(c = null) {
      openModal({
        title: c ? 'Modifier le contact' : 'Nouveau contact',
        width: 540,
        body: html`
          <label class="field">Pseudo<input class="input" id="cf-pseudo" value="${c?.pseudo || ''}" required></label>
          <div class="field"><span>Pays</span>
            <input type="hidden" id="cf-icon" value="${c?.icon || ''}">
            <div class="flag-grid" role="radiogroup" aria-label="Pays">
              <button type="button" class="flag-btn flag-none" role="radio" data-flag="" aria-checked="${!c?.icon}" title="Aucun">—</button>
              ${COUNTRIES.map(([code, name]) => html`<button type="button" class="flag-btn" role="radio" data-flag="${code}" aria-checked="${c?.icon === code}" title="${name}" aria-label="${name}">${flag(code)}</button>`)}
              ${c?.icon && !COUNTRIES.some(([code]) => code === c.icon) ? html`<button type="button" class="flag-btn" role="radio" data-flag="${c.icon}" aria-checked="true" title="Icône actuelle">${flag(c.icon) || c.icon}</button>` : ''}
            </div>
          </div>`,
        onOpen: el => on(el, 'click', '[data-flag]', (_, b) => {
          el.querySelector('#cf-icon').value = b.dataset.flag;
          el.querySelectorAll('[data-flag]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        }),
        actions: [
          ...(c ? [{ label: 'Supprimer', danger: true, run: async () => {
            const ok = await confirmModal({ title: `Supprimer ${c.pseudo} ?`, message: 'Ses commandes restent, sans contact.', confirmLabel: 'Supprimer', danger: true });
            if (!ok) return false;
            try {
              await api.remove('contacts', { id: `eq.${c.id}` });
              store.forget('contacts');
              currentId = null;
              location.hash = '#/contacts';
              await loadList();
            } catch (err) { toastError(err); return false; }
          } }] : []),
          { label: 'Annuler' },
          { label: 'Enregistrer', primary: true, run: async el => {
            const row = { pseudo: el.querySelector('#cf-pseudo').value.trim(), icon: el.querySelector('#cf-icon').value.trim() || null };
            if (!row.pseudo) { toastError(new Error('Le pseudo est obligatoire')); return false; }
            try {
              if (c) await api.update('contacts', { id: `eq.${c.id}` }, row);
              else currentId = (await api.insert('contacts', row)).id;
              store.forget('contacts');
              toast('Contact enregistré');
              await loadList();
            } catch (err) {
              toastError(err.status === 409 ? new Error('Ce pseudo existe déjà') : err);
              return false;
            }
          } },
        ],
      });
    }

    function newOrder(c) {
      openModal({
        title: `Nouvelle commande · ${c.pseudo}`,
        width: 460,
        body: html`<p class="muted" style="margin: 0">Une vente à ${c.pseudo} ou un achat chez ${c.pseudo} ?</p>`,
        actions: [
          { label: 'Annuler' },
          { label: 'Achat', run: () => createOrder(c, 'achat') },
          { label: 'Vente', primary: true, run: () => createOrder(c, 'vente') },
        ],
      });
    }

    async function createOrder(c, direction) {
      try {
        const o = await api.insert('commandes', { contact_id: c.id, direction, ordered_on: today(), status: direction === 'vente' ? 'a_envoyer' : 'a_payer' });
        await openOrder(o.id);
        loadList();
      } catch (err) { toastError(err); return false; }
    }

    async function openOrder(id) {
      const { openCommande } = await import('../../shared/commande.js');
      openCommande(id, { onChanged: loadList }).catch(toastError);
    }

    $('#cq').addEventListener('input', e => { state.q = e.target.value; renderList(); });
    $('#cstatut').addEventListener('change', e => { state.statut = e.target.value; renderList(); });
    $('#csort').addEventListener('change', e => { state.sort = e.target.value; renderList(); });
    on(main, 'click', '[data-statut-all]', () => { state.statut = ''; renderList(); });
    on(main, 'click', '[data-role]', (_, b) => { state.role = b.dataset.role; renderList(); });
    on(main, 'click', '[data-new-contact]', () => contactForm());
    on(main, 'click', '[data-edit-contact]', () => contactForm(contacts.find(x => x.id === currentId)));
    on(main, 'click', '[data-new-order]', () => newOrder(contacts.find(x => x.id === currentId)));
    on(main, 'click', '[data-order]', (_, b) => openOrder(b.dataset.order));

    await loadList();
  },
};
