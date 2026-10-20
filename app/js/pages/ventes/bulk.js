import { api } from '../../api.js';
import { html, on } from '../../ui/dom.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { store, ensureContact } from '../../shared/store.js';
import { CONDITIONS, ITEM_CONDITIONS, VARIANTS, LANGS, VENTE_STATUS, today, fmtDate, commandeStatus, inList } from '../../shared/sales.js';

// Modification en masse : seuls les champs cochés changent
export async function openBulkEdit({ direction, ids, onDone }) {
  const forAccounts = await store.forAccounts();
  const opt = (list, label = x => x.label ?? x.id) => list.map(x => html`<option value="${x.id}">${label(x)}</option>`);

  const fields = [
    { key: 'condition', label: 'État', input: html`<select class="select" data-v="condition">${opt([...CONDITIONS, ...ITEM_CONDITIONS], c => c.id)}</select>` },
    { key: 'price', label: 'Prix unitaire', input: html`<input class="input" type="number" min="0" step="0.01" data-v="price">` },
    { key: 'qty', label: 'Quantité', input: html`<input class="input" type="number" min="1" step="1" value="1" data-v="qty">` },
    { key: 'lang', label: 'Langue', input: html`<select class="select" data-v="lang">${opt(LANGS)}</select>` },
    { key: 'variant', label: 'Variante', input: html`<select class="select" data-v="variant">${opt(VARIANTS)}</select>` },
    ...(direction === 'vente' ? [
      { key: 'status', label: 'Statut', input: html`<select class="select" data-v="status">${opt(VENTE_STATUS.filter(s => s.id !== 'vendue'))}</select>` },
      { key: 'for_account', label: 'Pour le compte de', input: html`
        <span class="input-group">
          <select class="select" data-v="for_account"><option value="">Moi</option>${forAccounts.map(f => html`<option value="${f.name}">${f.name}</option>`)}</select>
          <input class="input" data-v-new="for_account" placeholder="ou un autre nom">
        </span>` },
    ] : []),
  ];

  openModal({
    title: `Modifier ${ids.length} ${direction === 'vente' ? 'vente' : 'achat'}${ids.length > 1 ? 's' : ''}`,
    width: 620,
    body: html`
      <p class="muted" style="margin: -10px 0 0">Coche les champs à changer ; les autres restent tels quels. Pour passer des ventes en « Vendue », rattache-les à une commande.</p>
      <div class="bulk-fields">
        ${fields.map(f => html`
          <label class="bulk-check"><input type="checkbox" data-on="${f.key}"> ${f.label}</label>
          <div class="bulk-input" data-for="${f.key}" aria-disabled="true">${f.input}</div>`)}
      </div>`,
    onOpen: el => {
      on(el, 'change', '[data-on]', (_, c) => el.querySelector(`[data-for="${c.dataset.on}"]`).setAttribute('aria-disabled', String(!c.checked)));
      on(el, 'focusin', '.bulk-input', (_, box) => {
        const c = el.querySelector(`[data-on="${box.dataset.for}"]`);
        if (!c.checked) { c.checked = true; box.setAttribute('aria-disabled', 'false'); }
      });
    },
    actions: [
      { label: 'Annuler' },
      { label: `Appliquer aux ${ids.length}`, primary: true, run: async el => {
        const patch = {};
        el.querySelectorAll('[data-on]:checked').forEach(c => {
          const k = c.dataset.on;
          let v = el.querySelector(`[data-v="${k}"]`).value;
          if (k === 'for_account') v = el.querySelector('[data-v-new="for_account"]').value.trim() || v || null;
          if (k === 'price') v = v === '' ? null : Number(v.replace(',', '.'));
          if (k === 'qty') v = Math.max(1, parseInt(v, 10) || 1);
          patch[k] = v;
        });
        if (!Object.keys(patch).length) { toastError(new Error('Coche au moins un champ')); return false; }
        try {
          // une vente remise en vente quitte sa commande
          if (patch.status) patch.commande_id = null;
          await api.update('transactions', { id: inList(ids) }, patch);
          if ('for_account' in patch) store.forget('forAccounts');
          toast(`${ids.length} ligne${ids.length > 1 ? 's' : ''} modifiée${ids.length > 1 ? 's' : ''}`);
          onDone?.();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
}

// Rattacher la sélection à une commande (existante ou nouvelle) : les ventes passent en « Vendue »
export async function openAttach({ direction, ids, onDone }) {
  const contacts = await store.contacts();
  let commandes = [];

  const m = openModal({
    title: `Rattacher ${ids.length} ligne${ids.length > 1 ? 's' : ''} à une commande`,
    width: 560,
    body: html`
      <label class="field">${direction === 'vente' ? 'Acheteur' : 'Vendeur'}
        <select class="select" data-contact>
          <option value="">Choisir…</option>
          ${contacts.map(c => html`<option value="${c.id}">${c.pseudo}</option>`)}
          <option value="__new">+ Nouveau contact…</option>
        </select>
      </label>
      <label class="field" hidden data-new-wrap>Pseudo<input class="input" data-new></label>
      <label class="field">Commande
        <select class="select" data-commande><option value="">Nouvelle commande (aujourd’hui)</option></select>
      </label>`,
    onOpen: el => {
      el.querySelector('[data-contact]').addEventListener('change', async e => {
        const v = e.target.value;
        el.querySelector('[data-new-wrap]').hidden = v !== '__new';
        commandes = v && v !== '__new'
          ? await api.list('commandes', { select: 'id,ordered_on,created_at,status', contact_id: `eq.${v}`, direction: `eq.${direction}`, order: 'created_at.desc', limit: 12 })
          : [];
        el.querySelector('[data-commande]').innerHTML = '<option value="">Nouvelle commande (aujourd’hui)</option>'
          + commandes.map(o => String(html`<option value="${o.id}">Commande du ${fmtDate(o.ordered_on || o.created_at)} · ${commandeStatus(direction, o.status).label}</option>`)).join('');
      });
    },
    actions: [
      { label: 'Annuler' },
      { label: 'Rattacher', primary: true, run: async el => {
        try {
          const v = el.querySelector('[data-contact]').value;
          const contactId = await ensureContact(v === '__new' ? { newPseudo: el.querySelector('[data-new]').value } : { contactId: v });
          if (!contactId) throw new Error('Choisis le contact');
          const commandeId = el.querySelector('[data-commande]').value || (await api.insert('commandes', {
            contact_id: contactId, direction, ordered_on: today(), status: direction === 'vente' ? 'a_envoyer' : 'a_payer',
          })).id;
          await api.update('transactions', { id: inList(ids) }, direction === 'vente' ? { commande_id: commandeId, status: 'vendue' } : { commande_id: commandeId });
          toast('Lignes rattachées à la commande');
          onDone?.(commandeId);
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
  return m;
}

export async function bulkDelete({ ids, onDone }) {
  const ok = await confirmModal({
    title: `Supprimer ${ids.length} ligne${ids.length > 1 ? 's' : ''} ?`,
    message: 'Cette suppression est définitive.',
    confirmLabel: 'Supprimer', danger: true,
  });
  if (!ok) return;
  try {
    await api.remove('transactions', { id: inList(ids) });
    toast(`${ids.length} ligne${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`);
    onDone?.();
  } catch (err) { toastError(err); }
}
