import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, eur } from '../../ui/dom.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { cardPicker } from '../../shared/picker.js';
import { store, ensureContact } from '../../shared/store.js';
import { setOptions, setOptionsHtml } from '../../shared/sets.js';
import {
  CONDITIONS, ITEM_CONDITIONS, VARIANTS, LANGS, VENTE_STATUS, KINDS,
  cardImage, today, fmtDate, commandeStatus,
} from '../../shared/sales.js';

// Formulaire d'une ligne de vente ou d'achat (création ou modification).
// openLineForm({ direction, line, commande, kinds, onSaved })
//   line     : ligne existante (vue transaction_list) à modifier
//   commande : commande imposée (ajout depuis une commande)
export async function openLineForm({ direction = 'vente', line = null, commande = null, kinds, preset = {}, onSaved } = {}) {
  const editing = !!line;
  const kindList = kinds || (direction === 'achat' ? ['carte', 'lot', 'accessoire', 'produit'] : ['carte', 'lot', 'accessoire']);
  const [contacts, accessoires, forAccounts, settings] = await Promise.all([
    store.contacts(), store.accessoires(), store.forAccounts(), store.settings(),
  ]);

  const st = {
    kind: line?.kind || preset.kind || 'carte',
    card: line?.card_id ? {
      id: line.card_id, name: line.title, set_name: line.set_name, number: line.number, image: line.card_image,
      variants: line.card_variants || [], price_low: line.price_low, price_low_holo: line.price_low_holo, cardmarket_url: line.cardmarket_url,
    } : preset.card || null,
    accessoireId: line?.accessoire_id || null,
    newAccessoire: null,
    variant: line?.variant || (preset.card?.variants?.length === 1 ? preset.card.variants[0] : null),
    condition: line?.condition || preset.condition || 'Near Mint',
    lang: line?.lang || preset.lang || 'FR',
    qty: line?.qty || 1,
    price: line?.price ?? '',
    label: line?.label || '',
    setId: line?.set_id || '',
    shipping: '',
    shippingPaid: false,
    status: line?.status || preset.status || 'a_mettre',
    forAccount: line?.for_account || preset.forAccount || '',
    contactId: line?.contact_id || preset.contactId || '',
    commandeId: line?.commande_id || commande?.id || preset.commandeId || '',
  };
  const fixedCommande = !!commande;
  if (fixedCommande && direction === 'vente') st.status = 'vendue';

  const title = editing
    ? (direction === 'vente' ? 'Modifier la vente' : 'Modifier l’article')
    : (direction === 'vente' ? 'Nouvelle vente' : 'Ajouter un article');

  const m = openModal({
    title,
    width: 780,
    body: html`<div class="form-grid" id="lf"></div>`,
    actions: [
      ...(editing ? [{ label: 'Supprimer', danger: true, run: remove }] : []),
      ...(editing && line.kind !== 'lot' && line.qty > 1 ? [{ label: 'Séparer', run: split }] : []),
      { label: 'Annuler' },
      ...(!editing && !fixedCommande ? [{ label: 'Enregistrer et en ajouter une autre', run: () => save(true) }] : []),
      { label: 'Enregistrer', primary: true, run: () => save(false) },
    ],
  });
  const root = m.el.querySelector('#lf');

  // ── rendu ──
  function render() {
    const conds = st.kind === 'carte' || st.kind === 'lot' ? CONDITIONS : ITEM_CONDITIONS;
    if (!conds.some(c => c.id === st.condition)) st.condition = conds[0].id;
    setHtml(root, html`
      ${!editing && kindList.length > 1 ? html`
        <div class="segmented" role="tablist" aria-label="Type d’article">
          ${kindList.map(k => html`<button type="button" role="tab" data-kind="${k}" aria-selected="${st.kind === k}">${KINDS[k]}</button>`)}
        </div>` : ''}
      <div id="lf-item">${itemHtml()}</div>
      ${detailsHtml(conds)}
      ${direction === 'vente' && !fixedCommande ? saleHtml() : ''}
    `);
    mountItem();
  }

  function itemHtml() {
    if (st.kind === 'carte') {
      if (!st.card) return html`<div id="lf-picker"></div>`;
      const c = st.card;
      const low = lowestPrice();
      return html`
        <div class="picked">
          <span class="thumb thumb-md">${c.image ? html`<img src="${cardImage(c.image)}" alt="" data-hide-on-error>` : ''}</span>
          <div class="grow">
            <strong>${c.name}</strong>
            <span class="muted small">${c.set_name} · ${c.number || '—'}</span>
            ${low.price != null ? html`
              <p class="small" style="margin: 6px 0 0">Prix le plus bas sur Cardmarket${low.holo ? ' (holo/reverse)' : ''} : <strong>${eur(low.price)}</strong></p>` : ''}
            <div class="row-actions">
              ${low.price != null ? html`<button type="button" class="btn btn-sm" data-take>Prendre ce prix</button>` : ''}
              ${c.cardmarket_url ? html`<a class="btn btn-sm btn-ghost" href="${c.cardmarket_url}" target="_blank" rel="noopener">Voir sur Cardmarket</a>` : ''}
              ${!editing ? html`<button type="button" class="btn btn-sm btn-ghost" data-change-card>Changer de carte</button>` : ''}
            </div>
          </div>
        </div>`;
    }
    if (st.kind === 'lot') {
      return html`
        <div class="note">${settings?.lot_image ? 'Image commune à tous les lots (Réglages). ' : ''}Le prix est celui du lot entier.</div>
        <div class="form-row">
          <label class="field grow">Description (facultatif)<input class="input" data-f="label" value="${st.label}" placeholder="25 communes et peu communes"></label>
          ${setField()}
        </div>`;
    }
    if (st.kind === 'produit') {
      return html`
        <div class="form-row">
          <label class="field grow">Produit<input class="input" data-f="label" value="${st.label}" placeholder="ETB, booster, coffret…"></label>
          ${setField()}
        </div>`;
    }
    // accessoire
    return html`
      <div class="acc-grid" role="radiogroup" aria-label="Accessoire">
        ${accessoires.map(a => html`
          <button type="button" class="acc" role="radio" aria-checked="${st.accessoireId === a.id}" data-acc="${a.id}">
            <span class="thumb thumb-sm">${a.image ? html`<img src="${imageUrl(a.image, 'thumb')}" alt="">` : ''}</span>
            <span class="small">${a.name}</span>
          </button>`)}
        <button type="button" class="acc acc-new" role="radio" aria-checked="${!!st.newAccessoire}" data-acc-new>+ Nouvel accessoire</button>
      </div>
      ${st.newAccessoire ? html`
        <div class="form-row">
          <label class="field grow">Nom de l’accessoire<input class="input" data-f="accName" value="${st.newAccessoire.name}"></label>
          <div class="field grow"><span>Photo</span><div id="lf-acc-photo"></div></div>
        </div>` : ''}`;
  }

  function setField() {
    return html`
      <label class="field grow">Extension (facultatif)
        <select class="select" data-f="setId">${setOptionsHtml(sets, st.setId, { empty: 'Aucune' })}</select>
      </label>`;
  }

  // prix holo/reverse quand la variante choisie l'est et que Cardmarket le donne
  function lowestPrice() {
    const c = st.card;
    if ((st.variant === 'holo' || st.variant === 'reverse') && c.price_low_holo != null) return { price: c.price_low_holo, holo: true };
    return { price: c.price_low ?? null, holo: false };
  }

  function detailsHtml(conds) {
    const variants = st.kind === 'carte'
      ? VARIANTS.filter(v => !st.card?.variants?.length || st.card.variants.includes(v.id) || v.id === st.variant)
      : [];
    if (st.kind === 'carte' && variants.length === 1 && !st.variant) st.variant = variants[0].id;
    return html`
      ${variants.length ? html`
        <div class="field"><span>Variante${st.card?.variants?.length ? ' · seules celles qui existent pour cette carte' : ''}</span>
          <div class="chips">${variants.map(v => html`<button type="button" class="chip" data-variant="${v.id}" aria-pressed="${st.variant === v.id}">${v.label}</button>`)}</div>
        </div>` : ''}
      <div class="form-row">
        <label class="field">État
          <select class="select" data-f="condition">${conds.map(c => html`<option value="${c.id}" ${c.id === st.condition ? 'selected' : ''}>${c.id}</option>`)}</select>
        </label>
        ${st.kind !== 'accessoire' && st.kind !== 'produit' ? html`
          <label class="field">Langue
            <select class="select" data-f="lang">${LANGS.map(l => html`<option value="${l.id}" ${l.id === st.lang ? 'selected' : ''}>${l.label}</option>`)}</select>
          </label>` : ''}
        <label class="field">${st.kind === 'lot' ? 'Nombre de cartes' : 'Quantité'}
          <input class="input" type="number" min="1" step="1" inputmode="numeric" data-f="qty" value="${st.qty}">
        </label>
        <label class="field">${st.kind === 'lot' ? 'Prix du lot' : direction === 'achat' ? 'Prix unitaire payé' : 'Prix unitaire'}
          <input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-f="price" value="${st.price}" placeholder="0,00">
        </label>
      </div>`;
  }

  function saleHtml() {
    const known = forAccounts.map(f => f.name);
    const contactCommandes = st.commandes || [];
    return html`
      <div class="field"><span>Statut</span>
        <div class="segmented" role="radiogroup" aria-label="Statut">
          ${VENTE_STATUS.map(s => html`<button type="button" role="radio" data-status="${s.id}" aria-checked="${st.status === s.id}" aria-pressed="${st.status === s.id}">${s.label}</button>`)}
        </div>
      </div>
      ${st.status === 'vendue' ? html`
        <div class="form-row">
          <label class="field grow">Acheteur
            <select class="select" data-f="contactId">
              <option value="">Aucun, à rattacher plus tard</option>
              ${contacts.map(c => html`<option value="${c.id}" ${c.id === st.contactId ? 'selected' : ''}>${c.pseudo}</option>`)}
              <option value="__new" ${st.contactId === '__new' ? 'selected' : ''}>+ Nouveau contact…</option>
            </select>
          </label>
          ${st.contactId === '__new' ? html`<label class="field grow">Pseudo<input class="input" data-f="newPseudo" value="${st.newPseudo || ''}"></label>` : ''}
          ${st.contactId ? html`
            <label class="field grow">Commande
              <select class="select" data-f="commandeId">
                <option value="">Nouvelle commande (aujourd’hui)</option>
                ${contactCommandes.map(o => html`<option value="${o.id}" ${o.id === st.commandeId ? 'selected' : ''}>Commande du ${fmtDate(o.ordered_on || o.created_at)} · ${commandeStatus('vente', o.status).label}</option>`)}
              </select>
            </label>` : ''}
        </div>
        ${st.contactId && !st.commandeId && !editing ? shippingHtml() : ''}` : ''}
      <label class="field">Pour le compte de
        <select class="select" data-f="forAccount">
          <option value="">Moi</option>
          ${[...new Set([...known, st.forAccount].filter(Boolean))].map(n => html`<option value="${n}" ${n === st.forAccount ? 'selected' : ''}>${n}</option>`)}
          <option value="__new">+ Quelqu’un d’autre…</option>
        </select>
      </label>
      ${st.forAccount === '__new' ? html`<label class="field">Nom<input class="input" data-f="newAccount" value="${st.newAccount || ''}"></label>` : ''}`;
  }

  function shippingHtml() {
    return html`
      <div class="form-row shipping-row">
        <label class="field">Frais de port payés par l’acheteur
          <input class="input" type="number" min="0" step="0.01" inputmode="decimal" data-f="shipping" value="${st.shipping}" placeholder="0,00">
        </label>
        <label class="check-inline"><input type="checkbox" data-f="shippingPaid" ${st.shippingPaid ? 'checked' : ''}> J’ai payé l’envoi avec (ne compte pas dans le Bilan)</label>
      </div>`;
  }

  async function mountItem() {
    if (st.kind === 'carte' && !st.card) {
      cardPicker(root.querySelector('#lf-picker'), {
        stockToggle: direction === 'vente',
        onManual: async name => {
          const { openManualCard } = await import('../cartes/manual.js');
          openManualCard({ name, onSaved: async id => {
            const [card] = await api.list('card_list', { id: `eq.${id}` });
            st.card = { ...card, set_name: card.set_name };
            st.variant = card.variants?.length === 1 ? card.variants[0] : null;
            render();
          } });
        },
        onPick: card => {
          st.card = card;
          st.variant = card.variants?.length === 1 ? card.variants[0] : null;
          render();
          root.querySelector('[data-f="price"]')?.focus();
        },
      });
    }
    if (st.newAccessoire) {
      dropzone(root.querySelector('#lf-acc-photo'), {
        value: st.newAccessoire.image, folder: 'Accessoires', label: 'Photo de l’accessoire',
        onChange: p => { st.newAccessoire.image = p; },
      });
    }
  }

  async function loadCommandes() {
    if (!st.contactId || st.contactId === '__new') { st.commandes = []; return; }
    const select = 'id,ordered_on,created_at,status';
    st.commandes = await api.list('commandes', {
      select, contact_id: `eq.${st.contactId}`, direction: 'eq.vente', order: 'created_at.desc', limit: 12,
    });
    // la commande actuelle de la ligne doit rester choisie, même ancienne
    if (st.commandeId && !st.commandes.some(o => o.id === st.commandeId)) {
      const current = await api.one('commandes', { select, id: `eq.${st.commandeId}` });
      if (current) st.commandes.unshift(current);
    }
  }

  // ── interactions ──
  on(root, 'click', '[data-kind]', (_, b) => { st.kind = b.dataset.kind; render(); });
  on(root, 'click', '[data-variant]', (_, b) => { st.variant = b.dataset.variant; render(); });
  on(root, 'click', '[data-status]', (_, b) => { st.status = b.dataset.status; render(); });
  on(root, 'click', '[data-change-card]', () => { st.card = null; render(); });
  on(root, 'click', '[data-acc]', (_, b) => { st.accessoireId = b.dataset.acc; st.newAccessoire = null; render(); });
  on(root, 'click', '[data-acc-new]', () => { st.accessoireId = null; st.newAccessoire = { name: '', image: '' }; render(); });
  on(root, 'click', '[data-take]', () => {
    st.price = lowestPrice().price;
    root.querySelector('[data-f="price"]').value = st.price;
  });
  root.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (!f) return;
    if (f === 'accName') st.newAccessoire.name = e.target.value;
    else if (f === 'shippingPaid') st.shippingPaid = e.target.checked;
    else st[f] = e.target.value;
  });
  root.addEventListener('change', async e => {
    const f = e.target.dataset.f;
    if (f === 'contactId') { st.commandeId = ''; await loadCommandes(); render(); }
    if (f === 'forAccount' || f === 'commandeId') render();
  });

  // ── enregistrement ──
  function readRow() {
    const qty = Math.max(1, parseInt(st.qty, 10) || 1);
    const price = st.price === '' || st.price == null ? null : Number(String(st.price).replace(',', '.'));
    if (price != null && !(price >= 0)) throw new Error('Prix invalide');
    const row = {
      kind: st.kind, qty, price,
      condition: st.condition || null,
      lang: st.kind === 'accessoire' || st.kind === 'produit' ? null : st.lang,
      variant: st.kind === 'carte' ? st.variant : null,
      card_id: st.kind === 'carte' ? st.card?.id : null,
      accessoire_id: st.kind === 'accessoire' ? st.accessoireId : null,
      label: st.kind === 'lot' || st.kind === 'produit' ? (st.label || '').trim() || null : null,
      set_id: st.kind === 'lot' || st.kind === 'produit' ? st.setId || null : null,
    };
    if (st.kind === 'carte' && !row.card_id) throw new Error('Choisis une carte');
    if (st.kind === 'carte' && !row.variant) throw new Error('Choisis la variante');
    if (st.kind === 'accessoire' && !row.accessoire_id && !st.newAccessoire?.name?.trim()) throw new Error('Choisis ou crée un accessoire');
    return row;
  }

  async function save(again) {
    try {
      const row = readRow();

      if (st.kind === 'accessoire' && !row.accessoire_id) {
        const acc = await api.insert('accessoires', { name: st.newAccessoire.name.trim(), image: st.newAccessoire.image || null });
        row.accessoire_id = acc.id;
        store.forget('accessoires');
      }

      if (direction === 'vente') {
        row.status = st.status;
        row.for_account = st.forAccount === '__new' ? (st.newAccount || '').trim() || null : st.forAccount || null;
        if (row.for_account) store.forget('forAccounts');
        if (fixedCommande) row.commande_id = commande.id;
        else if (st.status === 'vendue' && st.contactId) {
          const contactId = await ensureContact(st.contactId === '__new' ? { newPseudo: st.newPseudo } : { contactId: st.contactId });
          row.commande_id = st.commandeId || (await api.insert('commandes', {
            contact_id: contactId, direction: 'vente', ordered_on: today(), status: 'a_envoyer',
            shipping: Number(String(st.shipping || '').replace(',', '.')) || 0, shipping_paid: st.shippingPaid,
          })).id;
        } else if (st.status !== 'vendue') {
          // une vente remise en vente quitte sa commande
          row.commande_id = null;
        } else row.commande_id = line?.commande_id ?? null;
      } else {
        row.commande_id = commande?.id || line?.commande_id || null;
      }

      if (editing) await api.update('transactions', { id: `eq.${line.id}` }, row);
      else await api.insert('transactions', { direction, ...row });

      toast(editing ? 'Modification enregistrée' : direction === 'vente' ? 'Vente enregistrée' : 'Article ajouté');
      onSaved?.();
      if (again) {
        setTimeout(() => openLineForm({
          direction, kinds, onSaved,
          preset: { kind: st.kind, status: st.status, forAccount: row.for_account || '', condition: st.condition, lang: st.lang, contactId: st.contactId === '__new' ? '' : st.contactId, commandeId: row.commande_id || '' },
        }), 0);
      }
    } catch (err) {
      toastError(err);
      return false;
    }
  }

  async function remove() {
    const ok = await confirmModal({ title: 'Supprimer cette ligne ?', message: `${line.title} · ${eur(line.total)}. Cette suppression est définitive.`, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return false;
    try {
      await api.remove('transactions', { id: `eq.${line.id}` });
      toast('Ligne supprimée');
      onSaved?.();
    } catch (err) { toastError(err); return false; }
  }

  async function split() {
    const n = await askQty(line.qty);
    if (!n) return false;
    try {
      await api.rpc('split_transaction', { id: line.id, qty: n });
      toast(`${n} exemplaire${n > 1 ? 's' : ''} séparé${n > 1 ? 's' : ''} sur une nouvelle ligne`);
      onSaved?.();
    } catch (err) { toastError(err); return false; }
  }

  const sets = kindList.some(k => k === 'lot' || k === 'produit') ? await setOptions().catch(() => []) : [];
  if (st.contactId) await loadCommandes();
  render();
  return m;
}

// Combien d'exemplaires sortir sur une ligne à part (vente partielle)
function askQty(max) {
  return new Promise(resolve => {
    let value = null;
    const m = openModal({
      title: 'Séparer la ligne',
      width: 420,
      body: html`
        <p class="muted" style="margin: 0">La ligne compte ${max} exemplaires. Combien en mettre sur une ligne à part (pour les vendre séparément, par exemple) ?</p>
        <label class="field">Quantité à séparer<input class="input" type="number" min="1" max="${max - 1}" value="1" id="split-n"></label>`,
      actions: [
        { label: 'Annuler', run: () => resolve(null) },
        { label: 'Séparer', primary: true, run: el => {
          value = parseInt(el.querySelector('#split-n').value, 10);
          if (!(value >= 1 && value < max)) { toastError(new Error(`Entre 1 et ${max - 1}`)); return false; }
          resolve(value);
        } },
      ],
    });
    new MutationObserver((_, obs) => { if (!m.el.isConnected) { obs.disconnect(); resolve(value); } })
      .observe(document.body, { childList: true });
  });
}
