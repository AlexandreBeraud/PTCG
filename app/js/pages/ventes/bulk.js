import { api } from '../../api.js';
import { html, on } from '/_shared/ui/dom.js';
import { ouvrirModale, confirmer } from '/_shared/ui/modale.js';
import { notifier, notifierErreur } from '/_shared/ui/notifications.js';
import { store, ensureContact } from '../../shared/store.js';
import { CONDITIONS, ITEM_CONDITIONS, VARIANTS, LANGS, VENTE_STATUS, today, fmtDate, commandeStatus, inList } from '../../shared/sales.js';

// Modification en masse : seuls les champs cochés changent
export async function openBulkEdit({ direction, ids, onDone }) {
  const forAccounts = await store.forAccounts();
  const opt = (list, label = x => x.label ?? x.id) => list.map(x => html`<option value="${x.id}">${label(x)}</option>`);

  const fields = [
    { key: 'condition', label: 'État', input: html`<select class="input" data-v="condition">${opt([...CONDITIONS, ...ITEM_CONDITIONS], c => c.id)}</select>` },
    { key: 'price', label: 'Prix unitaire', input: html`<input class="input" type="number" min="0" step="0.01" data-v="price">` },
    { key: 'qty', label: 'Quantité', input: html`<input class="input" type="number" min="1" step="1" value="1" data-v="qty">` },
    { key: 'lang', label: 'Langue', input: html`<select class="input" data-v="lang">${opt(LANGS)}</select>` },
    { key: 'variant', label: 'Variante', input: html`<select class="input" data-v="variant">${opt(VARIANTS)}</select>` },
    ...(direction === 'vente' ? [
      { key: 'status', label: 'Statut', input: html`<select class="input" data-v="status">${opt(VENTE_STATUS.filter(s => s.id !== 'vendue'))}</select>` },
      { key: 'for_account', label: 'Pour le compte de', input: html`
        <span class="input-group">
          <select class="input" data-v="for_account"><option value="">Moi</option>${forAccounts.map(f => html`<option value="${f.name}">${f.name}</option>`)}</select>
          <input class="input" data-v-new="for_account" placeholder="ou un autre nom">
        </span>` },
    ] : []),
  ];

  ouvrirModale({
    titre: `Modifier ${ids.length} ${direction === 'vente' ? 'vente' : 'achat'}${ids.length > 1 ? 's' : ''}`,
    largeur: 620,
    corps: html`
      <p class="muted" style="margin: -10px 0 0">Coche les champs à changer ; les autres restent tels quels. Pour passer des ventes en « Vendue », rattache-les à une commande.</p>
      <div class="bulk-fields">
        ${fields.map(f => html`
          <label class="bulk-check"><input type="checkbox" data-on="${f.key}"> ${f.label}</label>
          <div class="bulk-input" data-for="${f.key}" aria-disabled="true">${f.input}</div>`)}
      </div>`,
    aOuverture: el => {
      on(el, 'change', '[data-on]', (_, c) => el.querySelector(`[data-for="${c.dataset.on}"]`).setAttribute('aria-disabled', String(!c.checked)));
      on(el, 'focusin', '.bulk-input', (_, box) => {
        const c = el.querySelector(`[data-on="${box.dataset.for}"]`);
        if (!c.checked) { c.checked = true; box.setAttribute('aria-disabled', 'false'); }
      });
    },
    actions: [
      { libelle: 'Annuler' },
      { libelle: `Appliquer aux ${ids.length}`, principal: true, run: async el => {
        const patch = {};
        el.querySelectorAll('[data-on]:checked').forEach(c => {
          const k = c.dataset.on;
          let v = el.querySelector(`[data-v="${k}"]`).value;
          if (k === 'for_account') v = el.querySelector('[data-v-new="for_account"]').value.trim() || v || null;
          if (k === 'price') v = v === '' ? null : Number(v.replace(',', '.'));
          if (k === 'qty') v = Math.max(1, parseInt(v, 10) || 1);
          patch[k] = v;
        });
        if (!Object.keys(patch).length) { notifierErreur(new Error('Coche au moins un champ')); return false; }
        try {
          // une vente remise en vente quitte sa commande
          if (patch.status) patch.commande_id = null;
          await api.modifier('transactions', { id: inList(ids) }, patch);
          if ('for_account' in patch) store.forget('forAccounts');
          notifier(`${ids.length} ligne${ids.length > 1 ? 's' : ''} modifiée${ids.length > 1 ? 's' : ''}`);
          onDone?.();
        } catch (err) { notifierErreur(err); return false; }
      } },
    ],
  });
}

// Rattacher la sélection à une commande (existante ou nouvelle) : les ventes passent en « Vendue »
export async function openAttach({ direction, ids, onDone }) {
  const contacts = await store.contacts();
  let commandes = [];

  const m = ouvrirModale({
    titre: `Rattacher ${ids.length} ligne${ids.length > 1 ? 's' : ''} à une commande`,
    largeur: 560,
    corps: html`
      <label class="field">${direction === 'vente' ? 'Acheteur' : 'Vendeur'}
        <select class="input" data-contact>
          <option value="">Choisir…</option>
          ${contacts.map(c => html`<option value="${c.id}">${c.pseudo}</option>`)}
          <option value="__new">+ Nouveau contact…</option>
        </select>
      </label>
      <label class="field" hidden data-new-wrap>Pseudo<input class="input" data-new></label>
      <label class="field">Commande
        <select class="input" data-commande><option value="">Nouvelle commande (aujourd’hui)</option></select>
      </label>`,
    aOuverture: el => {
      el.querySelector('[data-contact]').addEventListener('change', async e => {
        const v = e.target.value;
        el.querySelector('[data-new-wrap]').hidden = v !== '__new';
        commandes = v && v !== '__new'
          ? await api.lire('commandes', { select: 'id,ordered_on,created_at,status', contact_id: `eq.${v}`, direction: `eq.${direction}`, order: 'created_at.desc', limit: 12 })
          : [];
        el.querySelector('[data-commande]').innerHTML = '<option value="">Nouvelle commande (aujourd’hui)</option>'
          + commandes.map(o => String(html`<option value="${o.id}">Commande du ${fmtDate(o.ordered_on || o.created_at)} · ${commandeStatus(direction, o.status).label}</option>`)).join('');
      });
    },
    actions: [
      { libelle: 'Annuler' },
      { libelle: 'Rattacher', principal: true, run: async el => {
        try {
          const v = el.querySelector('[data-contact]').value;
          const contactId = await ensureContact(v === '__new' ? { newPseudo: el.querySelector('[data-new]').value } : { contactId: v });
          if (!contactId) throw new Error('Choisis le contact');
          const commandeId = el.querySelector('[data-commande]').value || (await api.ajouter('commandes', {
            contact_id: contactId, direction, ordered_on: today(), status: direction === 'vente' ? 'a_envoyer' : 'a_payer',
          })).id;
          await api.modifier('transactions', { id: inList(ids) }, direction === 'vente' ? { commande_id: commandeId, status: 'vendue' } : { commande_id: commandeId });
          notifier('Lignes rattachées à la commande');
          onDone?.(commandeId);
        } catch (err) { notifierErreur(err); return false; }
      } },
    ],
  });
  return m;
}

export async function bulkDelete({ ids, onDone }) {
  const ok = await confirmer({
    titre: `Supprimer ${ids.length} ligne${ids.length > 1 ? 's' : ''} ?`,
    message: 'Cette suppression est définitive.',
    libelle: 'Supprimer', danger: true,
  });
  if (!ok) return;
  try {
    await api.supprimer('transactions', { id: inList(ids) });
    notifier(`${ids.length} ligne${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`);
    onDone?.();
  } catch (err) { notifierErreur(err); }
}
