import { api } from '../../api.js';
import { html, setHtml, on, eur } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { store } from '../../shared/store.js';
import { contactAvatar, commandeStatusTag, commandeStatus, fmtDate, norm, today, COUNTRIES, flag, KINDS } from '../../shared/sales.js';

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

const countryName = code => COUNTRIES.find(([c]) => c === code)?.[1] || (code ? code.toUpperCase() : 'Sans pays');
const TYPE = { pokemon: 'Pokémon', trainer: 'Dresseurs', energy: 'Énergies' };
const typeOf = t => (t.kind === 'carte' ? TYPE[t.category] || 'Cartes' : KINDS[t.kind]);
const shortDate = d => (d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }) : '');

// Paniers d'une liste de commandes : montant des articles, hors port, commandes vides exclues
function baskets(orders) {
  const v = orders.filter(o => Number(o.lignes) > 0).map(o => Number(o.total) - Number(o.shipping || 0)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, moyen: 0, median: 0 };
  const mid = Math.floor(v.length / 2);
  return { n: v.length, moyen: v.reduce((a, b) => a + b, 0) / v.length, median: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2 };
}

// Classement en barres : les plus grosses parts seulement, rien de regroupé
function barsHtml(title, entries, { money = false, tone = 'vente', max = 10, unit = '' } = {}) {
  const sorted = [...entries].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, max);
  const hi = Math.max(1, ...top.map(([, v]) => v));
  const fmt = v => (money ? eur(v) : `${v}${unit}`);
  return html`
    <section class="stat-box">
      <h4>${title}</h4>
      ${top.length ? html`<div class="bars">${top.map(([label, v, note]) => html`
        <div class="bar-row">
          <span class="bar-label" title="${label}">${label}${note ? html` <span class="muted">${note}</span>` : ''}</span>
          <span class="bar"><span class="bar-fill bar-${tone}" style="--w: ${Math.round(v / hi * 100)}%"></span></span>
          <span class="bar-value">${fmt(v)}</span>
        </div>`)}</div>
        ${sorted.length > top.length ? html`<p class="muted small" style="margin: 8px 0 0">${sorted.length - top.length} de plus, non affiché${sorted.length - top.length > 1 ? 's' : ''}</p>` : ''}`
      : html`<p class="muted small" style="margin: 0">Rien pour l’instant.</p>`}
    </section>`;
}

const kpi = (label, value, sub = '') => html`<div class="kpi"><span class="muted small">${label}</span><strong>${value}</strong>${sub ? html`<span class="muted small">${sub}</span>` : ''}</div>`;

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
      if (!currentId && matchMedia('(min-width: 861px)').matches) currentId = 'stats';
      const overview = html`
        <a class="contact-item contact-overview" href="#/contacts/stats" ${currentId === 'stats' ? html`aria-current="true"` : ''}>
          <span class="avatar">${icon('bilan', 20)}</span>
          <span class="grow"><strong>Vue d’ensemble</strong><span class="muted small">Paniers, meilleurs acheteurs, pays</span></span>
        </a>`;
      // par nom : une lettre en tête de chaque groupe
      let letter = '';
      const head = c => {
        if (state.sort !== 'name') return '';
        const l = norm(c.pseudo).charAt(0).toUpperCase() || '#';
        const k = /[A-Z]/.test(l) ? l : '#';
        if (k === letter) return '';
        letter = k;
        return html`<div class="contact-letter">${k}</div>`;
      };
      const amount = c => {
        const v = Number(c.total_vente), a = Number(c.total_achat);
        if (state.role === 'achat' || state.sort === 'achete' || (!v && a)) return html`<span class="contact-amount"><strong>${eur(a)}</strong><span class="muted small">acheté</span></span>`;
        return html`<span class="contact-amount"><strong>${eur(v)}</strong><span class="muted small">vendu</span></span>`;
      };
      setHtml($('#clist'), list.length ? html`${overview}${list.map(c => html`
        ${head(c)}
        <a class="contact-item" href="#/contacts/${encodeURIComponent(c.id)}" ${c.id === currentId ? html`aria-current="true"` : ''} data-contact="${c.id}">
          ${contactAvatar(c, 36)}
          <span class="grow">
            <strong>${c.pseudo}${Number(c.en_attente) ? html` <span class="dot dot-warn" title="${c.en_attente} commande(s) en attente"></span>` : ''}</strong>
            <span class="muted small">${roleLabel(c)}${c.derniere ? ` · ${shortDate(c.derniere)}` : ''}</span>
          </span>
          ${amount(c)}
        </a>`)}` : html`${overview}<p class="muted small">Aucun contact.</p>`);
      renderDetail();
    }

    async function renderDetail() {
      const box = $('#detail');
      if (currentId === 'stats') {
        main.querySelector('.split').classList.add('has-detail');
        return renderOverview(box);
      }
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
        <div class="kpis kpis-contact" id="ckpis"></div>
        <div id="repartition"></div>
        <h3 class="section-title">Commandes</h3>
        <div id="orders"><p class="muted">Chargement…</p></div>
      `);
      const dir = Number(c.commandes_vente) >= Number(c.commandes_achat) ? 'vente' : 'achat';
      contactPies(c, dir, box.querySelector('#repartition'));

      try {
        const all = await api.list('commande_list', { contact_id: `eq.${c.id}`, order: 'ordered_on.desc.nullslast,created_at.desc' });
        if (currentId !== c.id) return;
        const b = baskets(all.filter(o => o.direction === dir));
        const vente = dir === 'vente';
        setHtml(box.querySelector('#ckpis'), html`
          ${kpi('Commandes', Number(c.commandes_vente) + Number(c.commandes_achat))}
          ${kpi(vente ? 'Cartes vendues' : 'Cartes achetées', vente ? c.cartes_vendues : all.filter(o => o.direction === 'achat').reduce((n, o) => n + Number(o.cartes), 0))}
          ${kpi(vente ? 'Total vendu' : 'Total acheté', eur(vente ? c.total_vente : c.total_achat), 'port compris')}
          ${kpi('Panier moyen', b.n ? eur(b.moyen) : '—', 'hors port')}
          ${kpi('Panier médian', b.n ? eur(b.median) : '—', 'hors port')}`);
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

    // Répartition de ce qu'il m'a acheté (ou vendu, si c'est un vendeur)
    async function contactPies(c, dir, box) {
      let lines;
      try {
        lines = await api.list('transaction_list', { contact_id: `eq.${c.id}`, direction: `eq.${dir}`, select: 'kind,category,total,qty,set_name,condition,day' });
      } catch (_) { return; }
      if (currentId !== c.id || !lines.length) return;
      const sum = (key, val = t => Number(t.total)) => {
        const m = new Map();
        for (const t of lines) { const k = key(t) || '—'; m.set(k, (m.get(k) || 0) + val(t)); }
        return [...m];
      };
      const tone = dir;
      setHtml(box, html`
        <h3 class="section-title">Répartition</h3>
        <div class="stat-grid">
          ${barsHtml(dir === 'vente' ? 'Ce qu’il t’a acheté, par extension' : 'Ce que tu lui as acheté, par extension', sum(t => t.set_name || 'Sans extension'), { money: true, tone, max: 8 })}
          ${barsHtml('Par type d’article', sum(typeOf), { money: true, tone })}
          ${barsHtml('Par état', sum(t => t.condition, t => t.qty), { tone, unit: ' ex.' })}
          ${barsHtml('Par année', sum(t => (t.day ? t.day.slice(0, 4) : '—')), { money: true, tone })}
        </div>`);
    }

    // Tous les contacts : paniers, à qui je vends, chez qui j'achète, d'où ils viennent
    async function renderOverview(box) {
      setHtml(box, html`<a class="btn btn-ghost btn-sm back-link" href="#/contacts">← Contacts</a><p class="muted">Chargement…</p>`);
      let orders = [];
      try { orders = await api.list('commande_list', { select: 'direction,status,total,shipping,lignes,contact_id' }); } catch (_) { /* facultatif */ }
      if (currentId !== 'stats') return;
      const ventes = orders.filter(o => o.direction === 'vente');
      const achats = orders.filter(o => o.direction === 'achat');
      const bv = baskets(ventes), ba = baskets(achats);
      const buyers = contacts.filter(c => Number(c.total_vente) > 0);
      const sellers = contacts.filter(c => Number(c.total_achat) > 0);
      const nCmd = n => html`· ${n} cmd`;
      const countries = new Map();
      for (const c of contacts.filter(x => Number(x.commandes_vente) + Number(x.commandes_achat) > 0)) {
        const k = countryName(c.icon && /^[a-z]{2}$/.test(c.icon) ? c.icon : '');
        countries.set(k, (countries.get(k) || 0) + 1);
      }
      const open = new Map();
      for (const o of orders.filter(x => x.status !== 'arrive')) {
        const k = `${o.direction === 'vente' ? 'Vente' : 'Achat'} · ${commandeStatus(o.direction, o.status).label}`;
        open.set(k, (open.get(k) || 0) + 1);
      }
      setHtml(box, html`
        <a class="btn btn-ghost btn-sm back-link" href="#/contacts">← Contacts</a>
        <div class="contact-head"><div class="grow"><h2>Vue d’ensemble</h2><p class="muted small" style="margin: 2px 0 0">${contacts.length} contacts · ${orders.length} commandes · paniers hors frais de port</p></div></div>
        <h3 class="section-title">Ventes</h3>
        <div class="kpis kpis-4">
          ${kpi('Acheteurs', buyers.length, `${ventes.length} commande${ventes.length > 1 ? 's' : ''}`)}
          ${kpi('Total vendu', eur(buyers.reduce((n, c) => n + Number(c.total_vente), 0)), 'port compris')}
          ${kpi('Panier moyen', bv.n ? eur(bv.moyen) : '—')}
          ${kpi('Panier médian', bv.n ? eur(bv.median) : '—')}
        </div>
        ${achats.length ? html`
          <h3 class="section-title">Achats</h3>
          <div class="kpis kpis-4">
            ${kpi('Vendeurs', sellers.length, `${achats.length} commande${achats.length > 1 ? 's' : ''}`)}
            ${kpi('Total acheté', eur(sellers.reduce((n, c) => n + Number(c.total_achat), 0)), 'port compris')}
            ${kpi('Panier moyen', ba.n ? eur(ba.moyen) : '—')}
            ${kpi('Panier médian', ba.n ? eur(ba.median) : '—')}
          </div>` : ''}
        <div class="stat-grid">
          ${barsHtml('Meilleurs acheteurs', buyers.map(c => [c.pseudo, Number(c.total_vente), nCmd(c.commandes_vente)]), { money: true })}
          ${sellers.length ? barsHtml('Principaux vendeurs', sellers.map(c => [c.pseudo, Number(c.total_achat), nCmd(c.commandes_achat)]), { money: true, tone: 'achat' }) : ''}
          ${barsHtml('Contacts par pays', [...countries], { tone: 'neutre' })}
          ${open.size ? barsHtml('Commandes en cours', [...open], { tone: 'neutre' }) : ''}
        </div>`);
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
