import { api } from '../api.js';
import { html, setHtml, on, eur } from '../ui/dom.js';
import { openModal, confirmModal } from '../ui/modal.js';
import { toast, toastError } from '../ui/toast.js';
import { store } from './store.js';
import {
  COMMANDE_STATUS, commandeStatus, thumbHtml, subtitle, variantLabel, conditionShort, fmtDate, today, inList,
} from './sales.js';

// Tri des articles d'une commande, gardé d'une commande à l'autre
const byNum = (a, b) => String(a.number ?? '').localeCompare(String(b.number ?? ''), 'fr', { numeric: true });
const LINE_SORTS = [
  { id: 'ajout', label: 'Ordre d’ajout', cmp: () => 0 },
  { id: 'nom', label: 'Nom', cmp: (a, b) => a.title.localeCompare(b.title, 'fr') || byNum(a, b) },
  { id: 'extension', label: 'Extension et numéro', cmp: (a, b) => String(a.set_name ?? '~').localeCompare(String(b.set_name ?? '~'), 'fr') || byNum(a, b) },
  { id: 'prix', label: 'Prix décroissant', cmp: (a, b) => Number(b.total) - Number(a.total) || a.title.localeCompare(b.title, 'fr') },
  { id: 'prix_asc', label: 'Prix croissant', cmp: (a, b) => Number(a.total) - Number(b.total) || a.title.localeCompare(b.title, 'fr') },
];
let lineSort = 'ajout';

// Fiche d'une commande : statut, dates, lien, articles. Chaque champ s'enregistre dès qu'il change.
export async function openCommande(id, { onChanged } = {}) {
  let changed = false;
  const touch = () => { changed = true; };
  let o, lines, settings, contacts;

  async function load() {
    [o, lines, settings, contacts] = await Promise.all([
      api.one('commande_list', { id: `eq.${id}` }),
      api.list('transaction_list', { commande_id: `eq.${id}`, order: 'created_at' }),
      store.settings(),
      store.contacts(),
    ]);
    if (!o) throw new Error('Commande introuvable');
  }
  await load();

  const m = openModal({
    title: o.contact ? `Commande de ${o.contact}` : 'Commande sans contact',
    width: 820,
    body: html`<div class="form-grid" id="cmd"></div>`,
    actions: [],
  });
  const root = m.el.querySelector('#cmd');
  const foot = document.createElement('div');
  foot.className = 'modal-foot';
  m.el.append(foot);

  const statuses = COMMANDE_STATUS[o.direction];

  function render() {
    const current = commandeStatus(o.direction, o.status);
    setHtml(root, html`
      <p class="muted" style="margin: -12px 0 0">${o.direction === 'vente' ? 'Vente' : 'Achat'} · commande du ${fmtDate(o.ordered_on || o.created_at)}</p>
      <div class="segmented" role="radiogroup" aria-label="Statut">
        ${statuses.map(s => html`<button type="button" role="radio" data-status="${s.id}" aria-checked="${s.id === o.status}" aria-pressed="${s.id === o.status}">${s.label}</button>`)}
      </div>
      <div class="form-row">
        <label class="field grow">${o.direction === 'vente' ? 'Acheteur' : 'Vendeur'}
          <select class="select" data-f="contact_id">
            <option value="">—</option>
            ${contacts.map(c => html`<option value="${c.id}" ${c.id === o.contact_id ? 'selected' : ''}>${c.pseudo}</option>`)}
          </select>
        </label>
        <label class="field">Date de la commande<input class="input" type="date" data-f="ordered_on" value="${o.ordered_on || ''}"></label>
        <label class="field">Date d’arrivée<input class="input" type="date" data-f="arrived_on" value="${o.arrived_on || ''}"></label>
      </div>
      <div class="form-row">
        <label class="field grow">Lien de la commande
          <span class="input-group">
            <input class="input" type="url" data-f="link" value="${o.link || ''}" placeholder="https://…">
            ${o.link ? html`<a class="btn btn-sm" href="${o.link}" target="_blank" rel="noopener">Ouvrir</a>` : ''}
          </span>
        </label>
        <label class="field">${o.direction === 'vente' ? 'Frais de port payés par l’acheteur' : 'Frais de port'}<input class="input" type="number" min="0" step="0.01" data-f="shipping" value="${o.shipping || ''}" placeholder="0,00"></label>
      </div>
      ${o.direction === 'vente' ? html`
        <label class="check-inline"><input type="checkbox" data-f="shipping_paid" ${o.shipping_paid ? 'checked' : ''}>
          J’ai payé l’envoi avec : le port ne compte pas dans le Bilan (sinon il compte dans les revenus)</label>` : ''}

      <div class="field">
        <div class="lines-head">
          <span>${lines.length} article${lines.length > 1 ? 's' : ''}</span>
          ${lines.length > 1 ? html`<select class="select select-auto select-sm" data-line-sort aria-label="Trier les articles">${LINE_SORTS.map(o => html`<option value="${o.id}" ${o.id === lineSort ? 'selected' : ''}>${o.label}</option>`)}</select>` : ''}
        </div>
        <div class="lines">
          ${[...lines].sort(LINE_SORTS.find(o => o.id === lineSort).cmp).map(l => html`
            <div class="line line-ro">
              ${thumbHtml(l, { lotImage: settings?.lot_image, size: 'xs' })}
              <div class="line-main">
                <strong>${l.title}</strong>
                <span class="muted small">${[subtitle(l), l.kind === 'carte' ? variantLabel(l.variant) : '', conditionShort(l.condition), l.lang, l.qty > 1 && l.kind !== 'lot' ? `×${l.qty}` : ''].filter(Boolean).join(' · ')}</span>
              </div>
              <span class="price">${eur(l.total)}</span>
              <button type="button" class="btn btn-sm btn-ghost" data-edit="${l.id}">Modifier</button>
              <button type="button" class="btn btn-sm btn-ghost" data-detach="${l.id}">${o.direction === 'vente' ? 'Détacher' : 'Retirer'}</button>
            </div>`)}
        </div>
      </div>
      <div class="row-actions">
        ${o.direction === 'vente' ? html`<button type="button" class="btn btn-sm" data-attach>+ Rattacher une vente</button>` : ''}
        <button type="button" class="btn btn-sm btn-ghost" data-add>${o.direction === 'vente' ? '+ Nouvelle vente dans cette commande' : '+ Ajouter un article'}</button>
        <span class="grow"></span>
        <strong data-total>${totalHtml()}</strong>
      </div>
    `);
    setHtml(foot, html`
      <button type="button" class="btn btn-danger" data-delete>Supprimer la commande</button>
      <span class="grow"></span>
      <button type="button" class="btn btn-ghost" data-close>Fermer</button>
      ${current.next ? html`<button type="button" class="btn btn-primary" data-next>${current.next}</button>` : ''}
    `);
  }

  const totalHtml = () => html`Total ${eur(o.total)}${Number(o.shipping) ? html` <span class="muted small">dont ${eur(o.shipping)} de port</span>` : ''}`;

  // quiet : un champ saisi au clavier, on ne réaffiche pas la fiche (le curseur reste où il est)
  async function patch(fields, { quiet = false } = {}) {
    try {
      await api.update('commandes', { id: `eq.${id}` }, fields);
      touch();
      await load();
      if (quiet) setHtml(root.querySelector('[data-total]'), totalHtml());
      else render();
    } catch (err) { toastError(err); }
  }

  async function setStatus(status) {
    if (o.direction === 'achat' && status === 'arrive' && o.status !== 'arrive') {
      const { openReception } = await import('../pages/ventes/achat-form.js');
      await openReception(id, { onSaved: async () => { touch(); await load(); render(); } });
      return;
    }
    const fields = { status };
    if (status === 'arrive' && !o.arrived_on) fields.arrived_on = today();
    await patch(fields);
    toast(`Commande : ${commandeStatus(o.direction, status).label}`);
  }

  // listes et case : enregistrées tout de suite ; dates, lien, port : quand on quitte le champ
  // (une date se valide à chaque chiffre tapé, l'enregistrer en pleine saisie faisait perdre le champ)
  root.addEventListener('change', e => {
    if (e.target.matches('[data-line-sort]')) { lineSort = e.target.value; return render(); }
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'shipping_paid') return patch({ shipping_paid: e.target.checked });
    if (e.target.tagName === 'SELECT') patch({ [f]: e.target.value || null });
  });
  root.addEventListener('focusout', e => {
    const f = e.target.dataset.f;
    if (!f || e.target.tagName !== 'INPUT' || e.target.type === 'checkbox') return;
    const v = e.target.value.trim();
    const value = f === 'shipping' ? Number(v.replace(',', '.')) || 0 : v || null;
    if (String(value ?? '') === String(o[f] ?? '') || (f === 'shipping' && Number(o[f]) === value)) return;
    patch({ [f]: value }, { quiet: true });
  });
  on(root, 'click', '[data-status]', (_, b) => { if (b.dataset.status !== o.status) setStatus(b.dataset.status); });
  on(foot, 'click', '[data-next]', () => {
    const i = statuses.findIndex(s => s.id === o.status);
    setStatus(statuses[i + 1].id);
  });
  on(foot, 'click', '[data-close]', () => m.close());

  on(root, 'click', '[data-edit]', async (_, b) => {
    const { openLineForm } = await import('../pages/ventes/line-form.js');
    openLineForm({ direction: o.direction, line: lines.find(l => l.id === b.dataset.edit), commande: o, onSaved: refresh });
  });
  on(root, 'click', '[data-add]', async () => {
    const { openLineForm } = await import('../pages/ventes/line-form.js');
    openLineForm({ direction: o.direction, commande: o, onSaved: refresh });
  });
  on(root, 'click', '[data-detach]', async (_, b) => {
    const l = lines.find(x => x.id === b.dataset.detach);
    try {
      if (o.direction === 'vente') {
        await api.update('transactions', { id: `eq.${l.id}` }, { commande_id: null, status: 'en_vente' });
        toast(`${l.title} est de nouveau en ligne`);
      } else {
        const ok = await confirmModal({ title: 'Retirer cet article ?', message: `${l.title} sera supprimé de l’achat.`, confirmLabel: 'Retirer', danger: true });
        if (!ok) return;
        await api.remove('transactions', { id: `eq.${l.id}` });
      }
      await refresh();
    } catch (err) { toastError(err); }
  });
  on(root, 'click', '[data-attach]', () => attachSales(o, refresh));

  on(foot, 'click', '[data-delete]', async () => {
    const ok = await confirmModal({
      title: 'Supprimer la commande ?',
      message: o.direction === 'vente'
        ? 'Ses ventes restent, elles repassent « En ligne » sans commande.'
        : 'Ses articles sont supprimés avec elle (les ventes déjà mises en stock restent).',
      confirmLabel: 'Supprimer', danger: true,
    });
    if (!ok) return;
    try {
      if (o.direction === 'vente') {
        if (lines.length) await api.update('transactions', { commande_id: `eq.${id}` }, { status: 'en_vente', commande_id: null });
      } else if (lines.length) await api.remove('transactions', { commande_id: `eq.${id}` });
      await api.remove('commandes', { id: `eq.${id}` });
      toast('Commande supprimée');
      touch();
      m.close();
    } catch (err) { toastError(err); }
  });

  async function refresh() {
    touch();
    await load();
    render();
  }

  // prévenir la page appelante quand la fiche se ferme
  new MutationObserver((_, obs) => {
    if (!m.el.isConnected) { obs.disconnect(); if (changed) onChanged?.(); }
  }).observe(document.body, { childList: true });

  render();
  return m;
}

// Choisir des ventes en stock à mettre dans cette commande
async function attachSales(o, done) {
  const rows = await api.list('transaction_list', {
    direction: 'eq.vente', commande_id: 'is.null', order: 'day.desc', limit: 200,
    select: 'id,title,set_name,number,variant,qty,total,status,kind,card_image,accessoire_image,crop,label,set_count',
  });
  if (!rows.length) return toast('Aucune vente sans commande à rattacher', { type: 'error' });
  openModal({
    title: 'Rattacher des ventes',
    width: 640,
    body: html`
      <label class="search"><input type="search" placeholder="Filtrer…" data-filter aria-label="Filtrer"></label>
      <div class="check-list">
        ${rows.map(r => html`
          <label class="check-row" data-name="${(r.title + ' ' + (r.set_name || '')).toLowerCase()}">
            <input type="checkbox" value="${r.id}">
            <span class="grow"><strong>${r.title}</strong> <span class="muted small">${[subtitle(r), variantLabel(r.variant), r.qty > 1 ? `×${r.qty}` : ''].filter(Boolean).join(' · ')}</span></span>
            <span class="price">${eur(r.total)}</span>
          </label>`)}
      </div>`,
    onOpen: el => el.querySelector('[data-filter]').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      el.querySelectorAll('.check-row').forEach(r => { r.hidden = !r.dataset.name.includes(q); });
    }),
    actions: [
      { label: 'Annuler' },
      { label: 'Rattacher', primary: true, run: async el => {
        const ids = [...el.querySelectorAll('.check-row input:checked')].map(i => i.value);
        if (!ids.length) return false;
        try {
          await api.update('transactions', { id: inList(ids) }, { commande_id: o.id, status: 'vendue' });
          toast(`${ids.length} vente${ids.length > 1 ? 's' : ''} rattachée${ids.length > 1 ? 's' : ''}`);
          await done();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
}
