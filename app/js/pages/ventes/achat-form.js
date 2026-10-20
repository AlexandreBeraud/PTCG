import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, eur } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { cardPicker } from '../../shared/picker.js';
import { store, ensureContact } from '../../shared/store.js';
import { CONDITIONS, ITEM_CONDITIONS, VARIANTS, LANGS, COMMANDE_STATUS, cardImage, today, lineTotal, variantLabel, inList } from '../../shared/sales.js';

const num = v => Number(String(v ?? '').replace(',', '.')) || 0;

// Nouvel achat : une commande, plusieurs articles, des frais de port
export async function openAchatForm({ onSaved } = {}) {
  const [contacts, accessoires] = await Promise.all([store.contacts(), store.accessoires()]);
  const st = { contactId: '', newPseudo: '', ordered_on: today(), status: 'a_payer', link: '', shipping: '', lines: [], adding: null };

  const m = openModal({
    title: 'Nouvel achat',
    width: 960,
    body: html`<p class="muted" style="margin: -10px 0 0">Une commande, plusieurs articles · les cartes que tu coches à la réception rejoignent ton stock</p><div class="form-grid" id="af"></div>`,
    actions: [{ label: 'Annuler' }, { label: 'Enregistrer l’achat', primary: true, run: save }],
  });
  const root = m.el.querySelector('#af');

  function render() {
    const items = st.lines.reduce((n, l) => n + lineTotal(l), 0);
    setHtml(root, html`
      <div class="form-row">
        <label class="field grow">Vendeur
          <select class="select" data-f="contactId">
            <option value="">Choisir…</option>
            ${contacts.map(c => html`<option value="${c.id}" ${c.id === st.contactId ? 'selected' : ''}>${c.pseudo}</option>`)}
            <option value="__new" ${st.contactId === '__new' ? 'selected' : ''}>+ Nouveau contact…</option>
          </select>
        </label>
        ${st.contactId === '__new' ? html`<label class="field grow">Pseudo<input class="input" data-f="newPseudo" value="${st.newPseudo}"></label>` : ''}
        <label class="field">Date de la commande<input class="input" type="date" data-f="ordered_on" value="${st.ordered_on}"></label>
        <label class="field">Statut
          <select class="select" data-f="status">${COMMANDE_STATUS.achat.map(s => html`<option value="${s.id}" ${s.id === st.status ? 'selected' : ''}>${s.label}</option>`)}</select>
        </label>
      </div>
      <label class="field">Lien de la commande<input class="input" type="url" data-f="link" value="${st.link}" placeholder="https://www.cardmarket.com/fr/Pokemon/Orders/…"></label>

      <div class="field"><span>Articles</span>
        ${st.lines.length ? html`
          <div class="lines">
            ${st.lines.map((l, i) => lineRow(l, i))}
          </div>` : html`<p class="muted small" style="margin: 0">Aucun article pour l’instant.</p>`}
      </div>
      ${st.adding === 'carte' ? html`<div id="af-picker"></div>` : ''}
      <div class="row-actions">
        <button type="button" class="btn btn-sm" data-add="carte">Ajouter une carte</button>
        <button type="button" class="btn btn-sm btn-ghost" data-add="lot">+ Lot de cartes</button>
        <button type="button" class="btn btn-sm btn-ghost" data-add="accessoire">+ Accessoire</button>
        <button type="button" class="btn btn-sm btn-ghost" data-add="produit">+ Produit scellé</button>
      </div>

      <div class="totals">
        <label class="field">Frais de port<input class="input" type="number" min="0" step="0.01" data-f="shipping" value="${st.shipping}" placeholder="0,00"></label>
        <dl>
          <div><dt>Articles</dt><dd>${eur(items)}</dd></div>
          <div><dt>Port</dt><dd>${eur(num(st.shipping))}</dd></div>
          <div class="total"><dt>Total</dt><dd>${eur(items + num(st.shipping))}</dd></div>
        </dl>
      </div>
    `);
    if (st.adding === 'carte') {
      cardPicker(root.querySelector('#af-picker'), {
        onPick: c => {
          st.lines.push({
            kind: 'carte', card_id: c.id, title: c.name, sub: `${c.set_name} · ${c.number || '—'}`, image: cardImage(c.image),
            variants: c.variants || [], variant: c.variants?.length === 1 ? c.variants[0] : (c.variants?.[0] || 'normale'),
            condition: 'Near Mint', lang: c.lang === 'en' ? 'EN' : 'FR', qty: 1, price: '',
          });
          st.adding = null;
          render();
          root.querySelector(`[data-line="${st.lines.length - 1}"][data-k="price"]`)?.focus();
        },
      });
    }
  }

  function lineRow(l, i) {
    const conds = l.kind === 'accessoire' || l.kind === 'produit' ? ITEM_CONDITIONS : CONDITIONS;
    const variants = VARIANTS.filter(v => !l.variants?.length || l.variants.includes(v.id));
    return html`
      <div class="line">
        <span class="thumb thumb-xs">${l.image ? html`<img src="${l.image}" alt="" data-hide-on-error>` : ''}</span>
        <div class="line-main">
          ${l.kind === 'carte' ? html`<strong>${l.title}</strong><span class="muted small">${l.sub}</span>`
          : l.kind === 'accessoire' ? html`
            <select class="select select-sm" data-line="${i}" data-k="accessoire_id" aria-label="Accessoire">
              <option value="">Accessoire…</option>
              ${accessoires.map(a => html`<option value="${a.id}" ${a.id === l.accessoire_id ? 'selected' : ''}>${a.name}</option>`)}
            </select>`
          : html`<input class="input input-sm" data-line="${i}" data-k="label" value="${l.label || ''}" placeholder="${l.kind === 'lot' ? 'Lot de cartes (description)' : 'Produit (ETB, booster…)'}" aria-label="Description">`}
        </div>
        ${l.kind === 'carte' ? html`
          <select class="select select-sm" data-line="${i}" data-k="variant" aria-label="Variante">
            ${variants.map(v => html`<option value="${v.id}" ${v.id === l.variant ? 'selected' : ''}>${v.label}</option>`)}
          </select>` : html`<span class="muted small">—</span>`}
        <select class="select select-sm" data-line="${i}" data-k="condition" aria-label="État">
          ${conds.map(c => html`<option value="${c.id}" ${c.id === l.condition ? 'selected' : ''}>${c.short}</option>`)}
        </select>
        ${l.kind === 'carte' || l.kind === 'lot' ? html`
          <select class="select select-sm" data-line="${i}" data-k="lang" aria-label="Langue">
            ${LANGS.map(g => html`<option value="${g.id}" ${g.id === l.lang ? 'selected' : ''}>${g.id}</option>`)}
          </select>` : html`<span></span>`}
        <input class="input input-sm" type="number" min="1" data-line="${i}" data-k="qty" value="${l.qty}" aria-label="${l.kind === 'lot' ? 'Nombre de cartes' : 'Quantité'}">
        <input class="input input-sm" type="number" min="0" step="0.01" data-line="${i}" data-k="price" value="${l.price}" placeholder="${l.kind === 'lot' ? 'Prix du lot' : 'Prix'}" aria-label="Prix">
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-del="${i}" aria-label="Retirer">✕</button>
      </div>`;
  }

  on(root, 'click', '[data-add]', (_, b) => {
    const kind = b.dataset.add;
    if (kind === 'carte') { st.adding = st.adding === 'carte' ? null : 'carte'; return render(); }
    st.lines.push({ kind, label: '', condition: kind === 'lot' ? 'Near Mint' : 'Neuf', lang: 'FR', qty: 1, price: '', image: '' });
    render();
  });
  on(root, 'click', '[data-del]', (_, b) => { st.lines.splice(Number(b.dataset.del), 1); render(); });
  root.addEventListener('input', e => {
    const { f, line, k } = e.target.dataset;
    if (f) st[f] = e.target.value;
    if (line != null) {
      const l = st.lines[Number(line)];
      l[k] = e.target.value;
      if (k === 'accessoire_id') {
        const a = accessoires.find(x => x.id === l.accessoire_id);
        l.image = a?.image ? imageUrl(a.image, 'thumb') : '';
      }
    }
    if (f === 'shipping' || k === 'price' || k === 'qty') updateTotals();
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.f === 'contactId' || e.target.dataset.k === 'accessoire_id') render();
  });

  function updateTotals() {
    const items = st.lines.reduce((n, l) => n + lineTotal({ ...l, price: num(l.price), qty: parseInt(l.qty, 10) || 1 }), 0);
    const dds = root.querySelectorAll('.totals dd');
    dds[0].textContent = eur(items);
    dds[1].textContent = eur(num(st.shipping));
    dds[2].textContent = eur(items + num(st.shipping));
  }

  async function save() {
    try {
      if (!st.lines.length) throw new Error('Ajoute au moins un article');
      if (st.lines.some(l => l.kind === 'accessoire' && !l.accessoire_id)) throw new Error('Choisis l’accessoire de chaque ligne');
      const contactId = await ensureContact(st.contactId === '__new' ? { newPseudo: st.newPseudo } : { contactId: st.contactId });
      if (!contactId) throw new Error('Choisis le vendeur');
      const id = await api.rpc('save_commande', {
        commande: {
          contact_id: contactId, direction: 'achat', ordered_on: st.ordered_on || null,
          arrived_on: st.status === 'arrive' ? today() : null,
          status: st.status, link: st.link.trim() || null, shipping: num(st.shipping),
        },
        lignes: st.lines.map(l => ({
          kind: l.kind, card_id: l.card_id || null, accessoire_id: l.accessoire_id || null,
          label: (l.label || '').trim() || null, condition: l.condition, variant: l.kind === 'carte' ? l.variant : null,
          lang: l.kind === 'carte' || l.kind === 'lot' ? l.lang : null,
          qty: Math.max(1, parseInt(l.qty, 10) || 1), price: l.price === '' ? null : num(l.price),
        })),
      });
      toast('Achat enregistré');
      onSaved?.();
      if (st.status === 'arrive') setTimeout(() => openReception(id, { onSaved, alreadyReceived: true }), 0);
    } catch (err) {
      toastError(err);
      return false;
    }
  }

  render();
}

// Réception d'un achat : les lignes cochées deviennent des ventes « À mettre en vente »
export async function openReception(commandeId, { onSaved, alreadyReceived = false } = {}) {
  const lines = await api.list('transaction_list', { commande_id: `eq.${commandeId}`, direction: 'eq.achat', order: 'created_at' });
  const done = lines.length
    ? await api.list('transactions', { select: 'from_id', from_id: inList(lines.map(l => l.id)) })
    : [];
  const already = new Set(done.map(d => d.from_id));
  const todo = lines.filter(l => !already.has(l.id) && l.kind !== 'produit');

  if (!todo.length) {
    if (!alreadyReceived) {
      await api.rpc('receive_achat', { commande_id: commandeId, line_ids: [] });
      toast('Achat marqué comme reçu');
      onSaved?.();
    }
    return;
  }

  openModal({
    title: 'Achat reçu',
    width: 640,
    body: html`
      <p class="muted" style="margin: 0">Coche ce que tu comptes revendre : chaque ligne cochée devient une vente « À mettre en vente ». Le reste reste une simple dépense.</p>
      <div class="check-list">
        ${todo.map(l => html`
          <label class="check-row">
            <input type="checkbox" value="${l.id}" checked>
            <span class="grow"><strong>${l.title}</strong> <span class="muted small">${[l.set_name, l.number, variantLabel(l.variant), l.qty > 1 ? `×${l.qty}` : ''].filter(Boolean).join(' · ')}</span></span>
          </label>`)}
      </div>`,
    actions: [
      { label: alreadyReceived ? 'Plus tard' : 'Annuler' },
      { label: 'Valider la réception', primary: true, run: async el => {
        const ids = [...el.querySelectorAll('.check-row input:checked')].map(i => i.value);
        try {
          const n = await api.rpc('receive_achat', { commande_id: commandeId, line_ids: ids });
          toast(n ? `${n} ligne${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au stock` : 'Achat marqué comme reçu');
          onSaved?.();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
}
