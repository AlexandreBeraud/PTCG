// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/ventes-achats.js
//  Ventes / Achats / Acheteurs / Vendeurs / Bilan / sélecteurs de carte
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  VENTES / ACHETEURS / DÉPENSES / VENDEURS
// ═══════════════════════════════════════════════════════════════════════════

var CARD_CONDITIONS = ['Mint','Near Mint','Excellent','Good','Light Played','Poor'];
var VENTE_TYPES = [
  { id:'normale',      label:'Normale' },
  { id:'reverse',      label:'Reverse' },
  { id:'holo_cosmos',  label:'Holo Cosmos' },
  { id:'1ere_edition', label:'1ère édition' },
];
var TCG_LANGUES = ['Français','Anglais','Japonais','Allemand','Italien','Espagnol','Portugais','Néerlandais','Coréen','Chinois'];

var ACHETEUR_STATUTS = [
  { id:'a_envoyer', label:'À envoyer', cls:'status-a-envoyer', color:'#f97316' },
  { id:'envoye',    label:'Envoyé',    cls:'status-envoye',    color:'#4a9eff' },
  { id:'arrive',    label:'Arrivé',    cls:'status-arrive',    color:'#22c55e' },
];
var VENDEUR_STATUTS = [
  { id:'a_payer', label:'À payer', cls:'status-a-payer', color:'#f97316' },
  { id:'paye',    label:'Payé',    cls:'status-paye',    color:'#4a9eff' },
  { id:'arrive',  label:'Arrivé',  cls:'status-arrive',  color:'#22c55e' },
];
// Statut d'une vente : 'a_mettre' (à préparer/lister sur Cardmarket), 'en_vente'
// (déjà en ligne) ou 'vendue' (choisi explicitement ; révèle alors la sélection
// acheteur/commande dans le formulaire).
var VENTE_STATUTS = [
  { id:'a_mettre', label:'À mettre en vente', cls:'status-a-mettre',       color:'#8a93b0' },
  { id:'en_vente', label:'En vente',          cls:'status-en-vente-actif', color:'#4a9eff' },
  { id:'vendue',   label:'Vendue',            cls:'status-vendue',        color:'#22c55e' },
];
function venteStatusInfo(v) {
  return VENTE_STATUTS.find(s => s.id === (v.statut||'a_mettre')) || VENTE_STATUTS[0];
}

// Petites icônes sélectionnables pour distinguer les acheteurs/vendeurs d'un
// coup d'œil dans les listes.
var PERSON_ICONS = ['👤','🏷️','🛒','📦','💳','🏪','🧑\u200d💼','👔','💼','🤝','📮','✉️','🏦','🎯','⭐','🔥','🌟','💎'];
function _buildIconPicker(containerId, selected) {
  const el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = PERSON_ICONS.map(ic =>
    `<button type="button" class="icon-pick-btn ${ic===selected?'active':''}" data-icon="${ic}" onclick="_selectIcon('${containerId}', this)">${ic}</button>`
  ).join('');
}
function _selectIcon(containerId, btn) {
  document.querySelectorAll('#'+containerId+' .icon-pick-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}
function _getSelectedIcon(containerId, fallback) {
  const active = document.querySelector('#'+containerId+' .icon-pick-btn.active');
  return active ? active.dataset.icon : fallback;
}

var ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
var ICON_DELETE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
var ICON_LINK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07l1.5-1.5"/></svg>';

function _venteId()    { return 'vt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _acheteurId() { return 'ac_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _depenseId()  { return 'dp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _vendeurId()  { return 'vd_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _acheteurCommandeId() { return 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _vendeurCommandeId()  { return 'vcc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

function _jsEscape(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function _fmtDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y,m,d] = parts;
  return `${d}/${m}/${y}`;
}

// ── Agrégats ─────────────────────────────────────────────────────────────
// Prix total d'une ligne (vente ou dépense) = prix unitaire × quantité.
function _lineTotal(item) { return (parseFloat(item.prix)||0) * (parseInt(item.qty,10)||1); }

// ── Acheteur → commandes → ventes ───────────────────────────────────────
function acheteurCommandes(acheteurId) {
  return (_D.acheteur_commandes||[]).filter(c => c.acheteur_id === acheteurId)
    .sort((a,b) => (b.date_achat||'').localeCompare(a.date_achat||'') || (b.created_at||0)-(a.created_at||0));
}
function commandeVentes(commandeId)  { return (_D.ventes||[]).filter(v => v.commande_id === commandeId); }
function commandeVenteTotal(commandeId) { return commandeVentes(commandeId).reduce((s,v)=>s+_lineTotal(v),0); }
function acheteurVentes(acheteurId) {
  const ids = new Set(acheteurCommandes(acheteurId).map(c=>c.id));
  return (_D.ventes||[]).filter(v => v.commande_id && ids.has(v.commande_id));
}
function acheteurTotal(acheteurId) { return acheteurVentes(acheteurId).reduce((s,v)=>s+_lineTotal(v),0); }

// ── Vendeur → commandes → dépenses ──────────────────────────────────────
function vendeurCommandes(vendeurId) {
  return (_D.vendeur_commandes||[]).filter(c => c.vendeur_id === vendeurId)
    .sort((a,b) => (b.date_achat||'').localeCompare(a.date_achat||'') || (b.created_at||0)-(a.created_at||0));
}
function commandeDepenses(commandeId) { return (_D.depenses||[]).filter(d => d.commande_id === commandeId); }
function commandeDepenseTotal(commandeId) { return commandeDepenses(commandeId).reduce((s,d)=>s+_lineTotal(d),0); }
function vendeurDepenses(vendeurId) {
  const ids = new Set(vendeurCommandes(vendeurId).map(c=>c.id));
  return (_D.depenses||[]).filter(d => d.commande_id && ids.has(d.commande_id));
}
function vendeurTotal(vendeurId) { return vendeurDepenses(vendeurId).reduce((s,d)=>s+_lineTotal(d),0); }

// ── État des filtres/recherche ──────────────────────────────────────────
var _venteFilter = 'all', _depenseFilter = 'all', _acheteurFilter = 'all', _vendeurFilter = 'all';
var _venteQuery = '', _depenseQuery = '', _acheteurQuery = '', _vendeurQuery = '';
var _acheteurReturnTo = null, _vendeurReturnTo = null;
var _lastCreatedAcheteurId = null, _lastCreatedVendeurId = null;
var _acheteurCommandeReturnTo = null, _vendeurCommandeReturnTo = null;
var _lastCreatedAcheteurCommandeId = null, _lastCreatedVendeurCommandeId = null;
// Ids d'acheteurs/vendeurs actuellement "dépliés" (liste des commandes visible),
// et ids de commandes individuellement dépliées (liste de leurs cartes visible).
var _orderExpandedAcheteurs = new Set();
var _orderExpandedVendeurs  = new Set();
var _orderExpandedCommandes = new Set();
function _toggleOrderExpand(kind, id) {
  const set = kind === 'acheteur' ? _orderExpandedAcheteurs : _orderExpandedVendeurs;
  if (set.has(id)) set.delete(id); else set.add(id);
  if (kind === 'acheteur') renderAcheteurs(); else renderVendeurs();
}
function _toggleCommandeExpand(kind, id) {
  if (_orderExpandedCommandes.has(id)) _orderExpandedCommandes.delete(id); else _orderExpandedCommandes.add(id);
  if (kind === 'acheteur') renderAcheteurs(); else renderVendeurs();
}

// ── Item row (utilisé dans les cartes Acheteur/Vendeur) ─────────────────
function _orderItemRowHtml(item, kind) {
  const editFn = kind === 'vente' ? 'editVente' : 'editDepense';
  const delFn  = kind === 'vente' ? 'deleteVente' : 'deleteDepense';
  const qty = parseInt(item.qty,10) || 1;
  return `<div class="order-item-row">
    <div class="order-item-thumb">${item.card_image ? `<img src="${item.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="order-item-info">
      <div class="order-item-name">${item.card_name || item.pokemon_name || '—'}${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</div>
      <div class="order-item-meta">${item.set_name||''}${item.number?' · N°'+item.number:''} · ${item.etat||''}</div>
    </div>
    <div class="order-item-price">${_lineTotal(item).toFixed(2)} €</div>
    <div class="order-item-actions">
      <button class="btn btn-icon btn-sm" title="Modifier" onclick="${editFn}('${item.id}')">${ICON_EDIT}</button>
      <button class="btn btn-icon btn-sm btn-danger" title="Retirer" onclick="${delFn}('${item.id}')">${ICON_DELETE}</button>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VENTES
// ═══════════════════════════════════════════════════════════════════════════
function renderVentes() {
  const grid = document.getElementById('ventes-grid');
  if (!grid) return;
  const addBtn = grid.querySelector('.add-new-card');
  if (addBtn) addBtn.remove();
  grid.innerHTML = '';
  const mode = _tabViewModes['ventes'] || 'grid';
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid-wide';

  let items = [...(_D.ventes||[])];
  if (_venteFilter !== 'all') items = items.filter(v => venteStatusInfo(v).id === _venteFilter);
  if (_venteQuery) {
    const q = _normalizeStr(_venteQuery);
    items = items.filter(v => _normalizeStr(v.card_name||'').includes(q) || _normalizeStr(v.pokemon_name||'').includes(q));
  }
  items.sort((a,b) => (b.created_at||0) - (a.created_at||0));

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucune vente${(_venteQuery||_venteFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    items.forEach(v => grid.appendChild(mode === 'list' ? buildVenteRow(v) : buildVenteCard(v)));
  }
  if (addBtn) grid.appendChild(addBtn);
  renderVentesStats();
}

// La valeur (€) par statut est l'information la plus importante ici : elle
// occupe la place principale de chaque carte, le nombre de cartes passe en
// sous-texte (au lieu de l'inverse précédemment).
function renderVentesStats() {
  const el = document.getElementById('ventes-stats'); if (!el) return;
  const all = _D.ventes||[];
  const aMettre = all.filter(v => venteStatusInfo(v).id === 'a_mettre');
  const enVente = all.filter(v => venteStatusInfo(v).id === 'en_vente');
  const vendues = all.filter(v => venteStatusInfo(v).id === 'vendue');
  const sum = arr => arr.reduce((s,v)=>s+_lineTotal(v),0);
  el.innerHTML = `
    <div class="stat-card stat-card-money" style="--accent-color:#8a93b0">
      <div class="val">${sum(aMettre).toFixed(2)} €</div><div class="lbl">À mettre en vente</div><div class="sub">${aMettre.length} carte${aMettre.length>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--blue)">
      <div class="val">${sum(enVente).toFixed(2)} €</div><div class="lbl">En vente</div><div class="sub">${enVente.length} carte${enVente.length>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--green)">
      <div class="val">${sum(vendues).toFixed(2)} €</div><div class="lbl">Vendues</div><div class="sub">${vendues.length} carte${vendues.length>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--gold)">
      <div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Valeur totale</div><div class="sub">${all.length} carte${all.length>1?'s':''}</div></div>`;
}

function _venteAcheteurInfoHtml(v) {
  if (!v.commande_id) return '';
  const c = (_D.acheteur_commandes||[]).find(x=>x.id===v.commande_id);
  if (!c) return '';
  const a = (_D.acheteurs||[]).find(x=>x.id===c.acheteur_id);
  if (!a) return '';
  return `<span class="sale-person-link" onclick="_goToAcheteur('${a.id}')">${a.icon||'👤'} ${_escHtml(a.pseudo)}</span>${c.date_achat ? ' · '+_fmtDate(c.date_achat) : ''}`;
}

// Bascule sur l'onglet Acheteurs, déplie la fiche demandée et la met en
// surbrillance un instant pour la retrouver facilement dans la liste.
function _goToAcheteur(acheteurId) {
  const navBtn = [...document.querySelectorAll('.nav-btn')].find(b => (b.getAttribute('onclick')||'').includes("switchView('acheteurs'"));
  switchView('acheteurs', navBtn);
  _orderExpandedAcheteurs.add(acheteurId);
  renderAcheteurs();
  setTimeout(() => {
    const el = document.querySelector(`#acheteurs-grid [data-acheteur-id="${acheteurId}"]`);
    if (!el) return;
    try { el.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_) {}
    el.classList.add('flash-highlight');
    setTimeout(() => el.classList.remove('flash-highlight'), 1600);
  }, 60);
}

// En-tête "bannière" d'une carte Vente/Dépense — même traitement visuel que
// .classeur-card-top : l'image de la carte TCG sert de fond (avec dégradé
// sombre pour la lisibilité), le nom/l'extension/le statut sont superposés.
// Donne à "la carte" une vraie présence visuelle, et le texte a toute la
// largeur disponible avant d'être tronqué (fini les noms coupés au milieu).
function _saleCardTopHtml(opts) {
  const pos = _cropPosition(opts.crop);
  const bg = opts.image
    ? `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.72)),url('${opts.image}') ${pos}/cover no-repeat`
    : `background:linear-gradient(135deg,var(--bg3),var(--bg2))`;
  return `
    <div class="sale-card-top" style="${bg}">
      ${opts.sigle ? `<img src="${opts.sigle}" class="sale-card-sigle" alt="" onerror="this.style.display='none'">` : ''}
      <div class="sale-top-info">
        <div class="sale-card-name">${opts.name}${opts.qty>1?` <span class="qty-badge">×${opts.qty}</span>`:''}</div>
        <div class="sale-card-meta">${opts.meta}</div>
        ${opts.statusLabel ? `<div class="status-badge ${opts.statusCls}">${opts.statusLabel}</div>` : ''}
      </div>
      <div class="sale-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="${opts.editFn}('${opts.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="${opts.delFn}('${opts.id}')">${ICON_DELETE}</button>
      </div>
    </div>`;
}

function buildVenteCard(v) {
  const st = venteStatusInfo(v);
  const acheteurInfo = _venteAcheteurInfoHtml(v);
  const qty = parseInt(v.qty,10) || 1;
  const typesHtml = (v.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip">${info.label}</span>` : ''; }).join('');
  const card = document.createElement('div');
  card.className = 'sale-card';
  card.innerHTML =
    _saleCardTopHtml({
      image: v.card_image, qty, sigle: v.ext_sigle, crop: v.crop,
      name: v.card_name || v.pokemon_name || '—',
      meta: `${v.set_name||''}${v.number?' · N°'+v.number:''}`,
      statusCls: st.cls, statusLabel: st.label,
      editFn: 'editVente', delFn: 'deleteVente', id: v.id,
    }) + `
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${v.etat||'—'}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${_lineTotal(v).toFixed(2)} €${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</span></div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${v.langue||'—'}</span></div>
      ${acheteurInfo ? `<div class="sale-acheteur">${acheteurInfo}</div>` : ''}
    </div>`;
  return card;
}

function buildVenteRow(v) {
  const st = venteStatusInfo(v);
  const acheteurInfo = _venteAcheteurInfoHtml(v);
  const qty = parseInt(v.qty,10) || 1;
  const typesHtml = (v.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip sm">${info.label}</span>` : ''; }).join('');
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  row.innerHTML = `
    <div class="sale-list-thumb">${v.card_image ? `<img src="${v.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="sale-list-main">
      <div class="sale-list-name">${v.card_name || v.pokemon_name || '—'}${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</div>
      <div class="sale-list-meta">${v.set_name||''}${v.number?' · N°'+v.number:''} · ${v.etat||'—'} · ${v.langue||'—'}</div>
      <div class="status-badge ${st.cls}">${st.label}</div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
    </div>
    <div class="sale-list-price">${_lineTotal(v).toFixed(2)} €</div>
    <div class="sale-list-acheteur ${acheteurInfo ? '' : 'unlinked'}">${acheteurInfo || '— Non vendu —'}</div>
    <div class="sale-list-actions">
      <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVente('${v.id}')">${ICON_EDIT}</button>
      <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVente('${v.id}')">${ICON_DELETE}</button>
    </div>`;
  return row;
}

function setVenteFilter(f, btn) {
  _venteFilter = f;
  document.querySelectorAll('#ventes-filter-bar .booster-filter-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderVentes();
}
function filterVentes(q) { _venteQuery = q; renderVentes(); }

function populateAcheteurSelect(selected) {
  const sel = document.getElementById('vente-acheteur-select'); if (!sel) return;
  const opts = (_D.acheteurs||[]).slice().sort((a,b)=>(a.pseudo||'').localeCompare(b.pseudo||'','fr'))
    .map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${a.pseudo}</option>`).join('');
  sel.innerHTML = '<option value="">— Choisir —</option>' + opts;
}

// Remplit le choix de commande en fonction de l'acheteur sélectionné (chaque
// acheteur peut avoir plusieurs commandes, à des dates différentes) et permet
// d'en créer une nouvelle à la volée.
function populateVenteCommandeSelect(acheteurId, selected) {
  const sel = document.getElementById('vente-commande-select'); if (!sel) return;
  if (!acheteurId) { sel.innerHTML = '<option value="">— Choisis d\'abord un acheteur —</option>'; _renderVenteCommandePreview(''); return; }
  const commandes = acheteurCommandes(acheteurId);
  const opts = commandes.map(c => {
    const st = ACHETEUR_STATUTS.find(s=>s.id===(c.etat||'a_envoyer')) || ACHETEUR_STATUTS[0];
    const label = `${c.date_achat?_fmtDate(c.date_achat):'Sans date'} · ${st.label}`;
    return `<option value="${c.id}" ${c.id===selected?'selected':''}>${label}</option>`;
  }).join('');
  sel.innerHTML = (opts || '<option value="">— Aucune commande existante —</option>') + '<option value="__new__">+ Nouvelle commande…</option>';
  if (selected) sel.value = selected;
  _renderVenteCommandePreview(sel.value);
}

function _renderVenteCommandePreview(commandeId) {
  const preview = document.getElementById('vente-commande-preview'); if (!preview) return;
  const c = (_D.acheteur_commandes||[]).find(x=>x.id===commandeId);
  if (!c) { preview.innerHTML = ''; return; }
  preview.innerHTML = c.lien_vente
    ? `<p class="form-hint">🔗 <a href="${c.lien_vente}" target="_blank" rel="noopener">${c.lien_vente}</a></p>`
    : `<p class="form-hint">Aucun lien enregistré pour cette commande.</p>`;
}

function _onVenteAcheteurSelectChange() {
  const acheteurId = document.getElementById('vente-acheteur-select').value;
  populateVenteCommandeSelect(acheteurId, null);
}

function _onVenteCommandeSelectChange() {
  const sel = document.getElementById('vente-commande-select');
  if (sel.value === '__new__') {
    const acheteurId = document.getElementById('vente-acheteur-select').value;
    if (!acheteurId) { toast("Choisis d'abord un acheteur.",'error'); sel.value=''; return; }
    _acheteurCommandeReturnTo = 'vente';
    _lastCreatedAcheteurCommandeId = null;
    document.getElementById('modal-vente').classList.remove('open');
    openAddAcheteurCommandeModal(acheteurId);
    return;
  }
  _renderVenteCommandePreview(sel.value);
}

// Le bloc Acheteur/Commande n'a de sens que pour une vente au statut "Vendue" :
// masqué sinon, pour ne pas demander une info qui n'existe pas encore.
function setVenteStatusInput(status) {
  document.getElementById('vente-statut-input').value = status;
  document.querySelectorAll('#vente-statut-select .classeur-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status===status));
  const section = document.getElementById('vente-vendue-section');
  if (section) section.style.display = status === 'vendue' ? '' : 'none';
}

function openAddVenteModal(prefillAcheteurId, prefillCommandeId) {
  const modal = document.getElementById('modal-vente');
  delete modal.dataset.editId;
  document.getElementById('modal-vente-title').textContent = 'Nouvelle vente';
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name','ext-sigle'].forEach(f => {
    const el = document.getElementById('vente-'+f); if (el) el.value = '';
  });
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = 'Near Mint';
  document.getElementById('vente-prix-input').value = '';
  document.getElementById('vente-qty-input').value = 1;
  document.getElementById('vente-langue-select').value = 'Français';
  _setChipGroup('vente-type-chips', []);
  setCropInput('vente', 'center');
  populateAcheteurSelect(prefillAcheteurId || '');
  populateVenteCommandeSelect(prefillAcheteurId || '', prefillCommandeId || null);
  setVenteStatusInput(prefillCommandeId ? 'vendue' : 'a_mettre');
  modal.classList.add('open');
}

// Ouvre le formulaire de vente directement pré-rempli pour une commande
// existante (bouton "+ Ajouter une carte" dans le détail d'une commande).
function openAddVenteModalForAcheteurCommande(commandeId) {
  const c = (_D.acheteur_commandes||[]).find(x=>x.id===commandeId); if (!c) return;
  openAddVenteModal(c.acheteur_id, commandeId);
}

function editVente(id) {
  const v = (_D.ventes||[]).find(x=>x.id===id); if (!v) return;
  const modal = document.getElementById('modal-vente');
  modal.dataset.editId = id;
  document.getElementById('modal-vente-title').textContent = 'Modifier la vente';
  document.getElementById('vente-card-id').value = v.card_id||'';
  document.getElementById('vente-card-name').value = v.card_name||'';
  document.getElementById('vente-card-image').value = v.card_image||'';
  document.getElementById('vente-set-id').value = v.set_id||'';
  document.getElementById('vente-set-name').value = v.set_name||'';
  document.getElementById('vente-set-logo').value = v.set_logo||'';
  document.getElementById('vente-number').value = v.number||'';
  document.getElementById('vente-rarity').value = v.rarity||'';
  document.getElementById('vente-pokemon-name').value = v.pokemon_name||'';
  document.getElementById('vente-ext-sigle').value = v.ext_sigle||'';
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = v.etat||'Near Mint';
  document.getElementById('vente-prix-input').value = v.prix||'';
  document.getElementById('vente-qty-input').value = parseInt(v.qty,10) || 1;
  document.getElementById('vente-langue-select').value = v.langue||'Français';
  _setChipGroup('vente-type-chips', v.types||[]);
  setCropInput('vente', v.crop||'center');
  const existingCommande = v.commande_id ? (_D.acheteur_commandes||[]).find(c=>c.id===v.commande_id) : null;
  populateAcheteurSelect(existingCommande ? existingCommande.acheteur_id : '');
  populateVenteCommandeSelect(existingCommande ? existingCommande.acheteur_id : '', v.commande_id || null);
  setVenteStatusInput(v.statut||'a_mettre');
  modal.classList.add('open');
}

function saveVente() {
  const modal = document.getElementById('modal-vente');
  const cardName = document.getElementById('vente-card-name').value;
  if (!cardName) { toast('Veuillez choisir une carte.','error'); return; }
  const statut = document.getElementById('vente-statut-input').value || 'a_mettre';
  let commandeId = null;
  if (statut === 'vendue') {
    const sel = document.getElementById('vente-commande-select').value;
    if (!sel || sel === '__new__') { toast('Choisis une commande (ou crée-en une) pour marquer la vente comme vendue.','error'); return; }
    commandeId = sel;
  }
  const data = {
    card_id:      document.getElementById('vente-card-id').value,
    card_name:    cardName,
    card_image:   document.getElementById('vente-card-image').value,
    set_id:       document.getElementById('vente-set-id').value,
    set_name:     document.getElementById('vente-set-name').value,
    set_logo:     document.getElementById('vente-set-logo').value,
    ext_sigle:    document.getElementById('vente-ext-sigle').value,
    crop:         document.getElementById('vente-crop-input').value || 'center',
    number:       document.getElementById('vente-number').value,
    rarity:       document.getElementById('vente-rarity').value,
    pokemon_name: document.getElementById('vente-pokemon-name').value || cardName,
    etat:         document.getElementById('vente-etat-select').value,
    prix:         parseFloat(document.getElementById('vente-prix-input').value) || 0,
    qty:          Math.max(1, parseInt(document.getElementById('vente-qty-input').value,10) || 1),
    types:        _getChipGroup('vente-type-chips'),
    langue:       document.getElementById('vente-langue-select').value,
    statut,
    commande_id:  commandeId,
  };
  const editId = modal.dataset.editId;
  if (editId) {
    const v = _D.ventes.find(x=>x.id===editId);
    if (v) { Object.assign(v, data); v.updated_at = Date.now(); }
    toast('Vente mise à jour !','success');
  } else {
    _D.ventes.push({ id:_venteId(), ...data, created_at:Date.now(), updated_at:Date.now() });
    toast('Vente enregistrée !','success');
  }
  saveData(); renderAll(); closeModal('modal-vente');
}

function deleteVente(id) {
  if (!confirm('Supprimer cette vente ?')) return;
  _D.ventes = _D.ventes.filter(v=>v.id!==id);
  saveData(); renderAll(); toast('Vente supprimée.','success');
}

function _openAcheteurFromVente() {
  _acheteurReturnTo = 'vente';
  _lastCreatedAcheteurId = null;
  document.getElementById('modal-vente').classList.remove('open');
  openAddAcheteurModal();
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÉPENSES
// ═══════════════════════════════════════════════════════════════════════════
function renderDepenses() {
  const grid = document.getElementById('depenses-grid');
  if (!grid) return;
  const addBtn = grid.querySelector('.add-new-card');
  if (addBtn) addBtn.remove();
  grid.innerHTML = '';
  const mode = _tabViewModes['depenses'] || 'grid';
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid-wide';

  let items = [...(_D.depenses||[])];
  if (_depenseFilter === 'unlinked') items = items.filter(d => !d.commande_id);
  if (_depenseFilter === 'linked')   items = items.filter(d => !!d.commande_id);
  if (_depenseQuery) {
    const q = _normalizeStr(_depenseQuery);
    items = items.filter(d => _normalizeStr(d.card_name||'').includes(q) || _normalizeStr(d.pokemon_name||'').includes(q));
  }
  items.sort((a,b) => (b.created_at||0) - (a.created_at||0));

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucun achat${(_depenseQuery||_depenseFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    items.forEach(d => grid.appendChild(mode === 'list' ? buildDepenseRow(d) : buildDepenseCard(d)));
  }
  if (addBtn) grid.appendChild(addBtn);
  renderDepensesStats();
}

function renderDepensesStats() {
  const el = document.getElementById('depenses-stats'); if (!el) return;
  const all = _D.depenses||[];
  const linked   = all.filter(d => d.commande_id);
  const unlinked = all.filter(d => !d.commande_id);
  const sum = arr => arr.reduce((s,d)=>s+_lineTotal(d),0);
  el.innerHTML = `
    <div class="stat-card stat-card-money" style="--accent-color:var(--accent)"><div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Dépensé au total</div><div class="sub">${all.length} carte${all.length>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--blue)"><div class="val">${sum(unlinked).toFixed(2)} €</div><div class="lbl">Sans vendeur</div><div class="sub">${unlinked.length} carte${unlinked.length>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--green)"><div class="val">${sum(linked).toFixed(2)} €</div><div class="lbl">Avec vendeur</div><div class="sub">${linked.length} carte${linked.length>1?'s':''}</div></div>`;
}

function _depenseVendeurInfoHtml(d) {
  if (!d.commande_id) return '';
  const c = (_D.vendeur_commandes||[]).find(x=>x.id===d.commande_id);
  if (!c) return '';
  const v = (_D.vendeurs||[]).find(x=>x.id===c.vendeur_id);
  if (!v) return '';
  return `<span class="sale-person-link" onclick="_goToVendeur('${v.id}')">${v.icon||'🏷️'} ${_escHtml(v.pseudo)}</span>${c.date_achat ? ' · '+_fmtDate(c.date_achat) : ''}`;
}

function _goToVendeur(vendeurId) {
  const navBtn = [...document.querySelectorAll('.nav-btn')].find(b => (b.getAttribute('onclick')||'').includes("switchView('vendeurs'"));
  switchView('vendeurs', navBtn);
  _orderExpandedVendeurs.add(vendeurId);
  renderVendeurs();
  setTimeout(() => {
    const el = document.querySelector(`#vendeurs-grid [data-vendeur-id="${vendeurId}"]`);
    if (!el) return;
    try { el.scrollIntoView({ behavior:'smooth', block:'center' }); } catch(_) {}
    el.classList.add('flash-highlight');
    setTimeout(() => el.classList.remove('flash-highlight'), 1600);
  }, 60);
}

function buildDepenseCard(d) {
  const vendeurInfo = _depenseVendeurInfoHtml(d);
  const qty = parseInt(d.qty,10) || 1;
  const typesHtml = (d.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip">${info.label}</span>` : ''; }).join('');
  const card = document.createElement('div');
  card.className = 'sale-card';
  card.innerHTML =
    _saleCardTopHtml({
      image: d.card_image, qty, sigle: d.ext_sigle, crop: d.crop,
      name: d.card_name || d.pokemon_name || '—',
      meta: `${d.set_name||''}${d.number?' · N°'+d.number:''}`,
      statusCls: '', statusLabel: '',
      editFn: 'editDepense', delFn: 'deleteDepense', id: d.id,
    }) + `
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${d.etat||'—'}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${_lineTotal(d).toFixed(2)} €</span></div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${d.langue||'—'}</span></div>
      <div class="sale-acheteur ${vendeurInfo ? '' : 'unlinked'}">${vendeurInfo || '— Aucun vendeur —'}</div>
    </div>`;
  return card;
}

function buildDepenseRow(d) {
  const vendeurInfo = _depenseVendeurInfoHtml(d);
  const qty = parseInt(d.qty,10) || 1;
  const typesHtml = (d.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip sm">${info.label}</span>` : ''; }).join('');
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  row.innerHTML = `
    <div class="sale-list-thumb">${d.card_image ? `<img src="${d.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="sale-list-main">
      <div class="sale-list-name">${d.card_name || d.pokemon_name || '—'}${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</div>
      <div class="sale-list-meta">${d.set_name||''}${d.number?' · N°'+d.number:''} · ${d.etat||'—'} · ${d.langue||'—'}</div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
    </div>
    <div class="sale-list-price">${_lineTotal(d).toFixed(2)} €</div>
    <div class="sale-list-acheteur ${vendeurInfo ? '' : 'unlinked'}">${vendeurInfo || '— Aucun vendeur —'}</div>
    <div class="sale-list-actions">
      <button class="btn btn-icon btn-sm" title="Modifier" onclick="editDepense('${d.id}')">${ICON_EDIT}</button>
      <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteDepense('${d.id}')">${ICON_DELETE}</button>
    </div>`;
  return row;
}

function setDepenseFilter(f, btn) {
  _depenseFilter = f;
  document.querySelectorAll('#depenses-filter-bar .booster-filter-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDepenses();
}
function filterDepenses(q) { _depenseQuery = q; renderDepenses(); }

function populateVendeurSelect(selected) {
  const sel = document.getElementById('depense-vendeur-select'); if (!sel) return;
  const opts = (_D.vendeurs||[]).slice().sort((a,b)=>(a.pseudo||'').localeCompare(b.pseudo||'','fr'))
    .map(v => `<option value="${v.id}" ${v.id===selected?'selected':''}>${v.pseudo}</option>`).join('');
  sel.innerHTML = '<option value="">— Aucun vendeur —</option>' + opts;
}

// Remplit le choix de commande en fonction du vendeur sélectionné (chaque
// vendeur peut avoir plusieurs commandes, à des dates différentes) et permet
// d'en créer une nouvelle à la volée.
function populateDepenseCommandeSelect(vendeurId, selected) {
  const sel = document.getElementById('depense-commande-select'); if (!sel) return;
  if (!vendeurId) { sel.innerHTML = '<option value="">— Aucun —</option>'; _renderDepenseCommandePreview(''); return; }
  const commandes = vendeurCommandes(vendeurId);
  const opts = commandes.map(c => {
    const st = VENDEUR_STATUTS.find(s=>s.id===(c.etat||'a_payer')) || VENDEUR_STATUTS[0];
    const label = `${c.date_achat?_fmtDate(c.date_achat):'Sans date'} · ${st.label}`;
    return `<option value="${c.id}" ${c.id===selected?'selected':''}>${label}</option>`;
  }).join('');
  sel.innerHTML = '<option value="">— Aucune —</option>' + opts + '<option value="__new__">+ Nouvelle commande…</option>';
  if (selected) sel.value = selected;
  _renderDepenseCommandePreview(sel.value);
}

function _renderDepenseCommandePreview(commandeId) {
  const preview = document.getElementById('depense-commande-preview'); if (!preview) return;
  const c = (_D.vendeur_commandes||[]).find(x=>x.id===commandeId);
  if (!c) { preview.innerHTML = ''; return; }
  preview.innerHTML = c.lien_achat
    ? `<p class="form-hint">🔗 <a href="${c.lien_achat}" target="_blank" rel="noopener">${c.lien_achat}</a></p>`
    : `<p class="form-hint">Aucun lien enregistré pour cette commande.</p>`;
}

function _onDepenseVendeurSelectChange() {
  const vendeurId = document.getElementById('depense-vendeur-select').value;
  populateDepenseCommandeSelect(vendeurId, null);
}

function _onDepenseCommandeSelectChange() {
  const sel = document.getElementById('depense-commande-select');
  if (sel.value === '__new__') {
    const vendeurId = document.getElementById('depense-vendeur-select').value;
    if (!vendeurId) { toast("Choisis d'abord un vendeur.",'error'); sel.value=''; return; }
    _vendeurCommandeReturnTo = 'depense';
    _lastCreatedVendeurCommandeId = null;
    document.getElementById('modal-depense').classList.remove('open');
    openAddVendeurCommandeModal(vendeurId);
    return;
  }
  _renderDepenseCommandePreview(sel.value);
}

function openAddDepenseModal(prefillVendeurId, prefillCommandeId) {
  const modal = document.getElementById('modal-depense');
  delete modal.dataset.editId;
  document.getElementById('modal-depense-title').textContent = 'Nouvel achat';
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name','ext-sigle'].forEach(f => {
    const el = document.getElementById('depense-'+f); if (el) el.value = '';
  });
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = 'Near Mint';
  document.getElementById('depense-prix-input').value = '';
  document.getElementById('depense-qty-input').value = 1;
  document.getElementById('depense-langue-select').value = 'Français';
  _setChipGroup('depense-type-chips', []);
  setCropInput('depense', 'center');
  populateVendeurSelect(prefillVendeurId || '');
  populateDepenseCommandeSelect(prefillVendeurId || '', prefillCommandeId || null);
  modal.classList.add('open');
}

// Ouvre le formulaire d'achat directement pré-rempli pour une commande
// existante (bouton "+ Ajouter une carte" dans le détail d'une commande).
function openAddDepenseModalForVendeurCommande(commandeId) {
  const c = (_D.vendeur_commandes||[]).find(x=>x.id===commandeId); if (!c) return;
  openAddDepenseModal(c.vendeur_id, commandeId);
}

function editDepense(id) {
  const d = (_D.depenses||[]).find(x=>x.id===id); if (!d) return;
  const modal = document.getElementById('modal-depense');
  modal.dataset.editId = id;
  document.getElementById('modal-depense-title').textContent = "Modifier l'achat";
  document.getElementById('depense-card-id').value = d.card_id||'';
  document.getElementById('depense-card-name').value = d.card_name||'';
  document.getElementById('depense-card-image').value = d.card_image||'';
  document.getElementById('depense-set-id').value = d.set_id||'';
  document.getElementById('depense-set-name').value = d.set_name||'';
  document.getElementById('depense-set-logo').value = d.set_logo||'';
  document.getElementById('depense-number').value = d.number||'';
  document.getElementById('depense-rarity').value = d.rarity||'';
  document.getElementById('depense-pokemon-name').value = d.pokemon_name||'';
  document.getElementById('depense-ext-sigle').value = d.ext_sigle||'';
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = d.etat||'Near Mint';
  document.getElementById('depense-prix-input').value = d.prix||'';
  document.getElementById('depense-qty-input').value = parseInt(d.qty,10) || 1;
  document.getElementById('depense-langue-select').value = d.langue||'Français';
  _setChipGroup('depense-type-chips', d.types||[]);
  setCropInput('depense', d.crop||'center');
  const existingCommande = d.commande_id ? (_D.vendeur_commandes||[]).find(c=>c.id===d.commande_id) : null;
  populateVendeurSelect(existingCommande ? existingCommande.vendeur_id : '');
  populateDepenseCommandeSelect(existingCommande ? existingCommande.vendeur_id : '', d.commande_id || null);
  modal.classList.add('open');
}

function saveDepense() {
  const modal = document.getElementById('modal-depense');
  const cardName = document.getElementById('depense-card-name').value;
  if (!cardName) { toast('Veuillez choisir une carte.','error'); return; }
  const commandeSel = document.getElementById('depense-commande-select').value;
  const data = {
    card_id:      document.getElementById('depense-card-id').value,
    card_name:    cardName,
    card_image:   document.getElementById('depense-card-image').value,
    set_id:       document.getElementById('depense-set-id').value,
    set_name:     document.getElementById('depense-set-name').value,
    set_logo:     document.getElementById('depense-set-logo').value,
    ext_sigle:    document.getElementById('depense-ext-sigle').value,
    crop:         document.getElementById('depense-crop-input').value || 'center',
    number:       document.getElementById('depense-number').value,
    rarity:       document.getElementById('depense-rarity').value,
    pokemon_name: document.getElementById('depense-pokemon-name').value || cardName,
    etat:         document.getElementById('depense-etat-select').value,
    prix:         parseFloat(document.getElementById('depense-prix-input').value) || 0,
    qty:          Math.max(1, parseInt(document.getElementById('depense-qty-input').value,10) || 1),
    types:        _getChipGroup('depense-type-chips'),
    langue:       document.getElementById('depense-langue-select').value,
    commande_id:  (commandeSel && commandeSel !== '__new__') ? commandeSel : null,
  };
  const editId = modal.dataset.editId;
  if (editId) {
    const d = _D.depenses.find(x=>x.id===editId);
    if (d) { Object.assign(d, data); d.updated_at = Date.now(); }
    toast('Achat mis à jour !','success');
  } else {
    _D.depenses.push({ id:_depenseId(), ...data, created_at:Date.now(), updated_at:Date.now() });
    toast('Achat enregistré !','success');
  }
  saveData(); renderAll(); closeModal('modal-depense');
}

function deleteDepense(id) {
  if (!confirm('Supprimer cet achat ?')) return;
  _D.depenses = _D.depenses.filter(d=>d.id!==id);
  saveData(); renderAll(); toast('Achat supprimé.','success');
}

function _openVendeurFromDepense() {
  _vendeurReturnTo = 'depense';
  _lastCreatedVendeurId = null;
  document.getElementById('modal-depense').classList.remove('open');
  openAddVendeurModal();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACHETEURS
// ═══════════════════════════════════════════════════════════════════════════
function renderAcheteurs() {
  const grid = document.getElementById('acheteurs-grid');
  if (!grid) return;
  const addBtn = grid.querySelector('.add-new-card');
  if (addBtn) addBtn.remove();
  grid.innerHTML = '';
  const mode = _tabViewModes['acheteurs'] || 'grid';
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid-wide';

  let items = [...(_D.acheteurs||[])];
  if (_acheteurFilter !== 'all') {
    items = items.filter(a => acheteurCommandes(a.id).some(c => (c.etat||'a_envoyer') === _acheteurFilter));
  }
  if (_acheteurQuery) { const q = _normalizeStr(_acheteurQuery); items = items.filter(a => _normalizeStr(a.pseudo||'').includes(q)); }
  items.sort((a,b) => (a.pseudo||'').localeCompare(b.pseudo||'','fr'));

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucun acheteur${(_acheteurQuery||_acheteurFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    items.forEach(a => grid.appendChild(mode === 'list' ? buildAcheteurRow(a) : buildAcheteurCard(a)));
  }
  if (addBtn) grid.appendChild(addBtn);
  renderAcheteursStats();
}

function renderAcheteursStats() {
  const el = document.getElementById('acheteurs-stats'); if (!el) return;
  const all = _D.acheteurs||[];
  const totalVal = all.reduce((s,a)=>s+acheteurTotal(a.id),0);
  const nbCards = (_D.ventes||[]).filter(v=>v.commande_id).length;
  const nbCommandes = (_D.acheteur_commandes||[]).length;
  const enCours = (_D.acheteur_commandes||[]).filter(c => (c.etat||'a_envoyer') !== 'arrive').length;
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Acheteurs</div><div class="sub">${nbCommandes} commande${nbCommandes>1?'s':''}</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${nbCards}</div><div class="lbl">Cartes vendues</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--gold)"><div class="val">${totalVal.toFixed(2)} €</div><div class="lbl">Total encaissé</div></div>
    <div class="stat-card" style="--accent-color:var(--orange,#f97316)"><div class="val">${enCours}</div><div class="lbl">Commandes en cours</div></div>`;
}

// Ligne compacte représentant UNE commande à l'intérieur de la carte d'un
// acheteur — se déplie à son tour pour révéler les cartes qu'elle contient.
function _acheteurCommandeRowHtml(c) {
  const ventes = commandeVentes(c.id);
  const total = commandeVenteTotal(c.id);
  const st = ACHETEUR_STATUTS.find(s=>s.id===(c.etat||'a_envoyer')) || ACHETEUR_STATUTS[0];
  const expanded = _orderExpandedCommandes.has(c.id);
  return `<div class="commande-row">
    <div class="commande-row-header" onclick="_toggleCommandeExpand('acheteur','${c.id}')">
      <div class="commande-date">${c.date_achat?_fmtDate(c.date_achat):'—'}${c.date_arrivee?' → '+_fmtDate(c.date_arrivee):''}</div>
      <div class="status-badge ${st.cls}">${st.label}</div>
      <div class="commande-count">${ventes.length} carte${ventes.length>1?'s':''}</div>
      <div class="commande-total">${total.toFixed(2)} €</div>
      <div class="commande-actions" onclick="event.stopPropagation()">
        ${c.lien_vente ? `<a href="${c.lien_vente}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien de la vente">${ICON_LINK}</a>` : ''}
        <button class="btn btn-icon btn-sm" title="Modifier la commande" onclick="editAcheteurCommandeModal('${c.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer la commande" onclick="deleteAcheteurCommande('${c.id}')">${ICON_DELETE}</button>
        <div class="order-chevron ${expanded?'open':''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    ${expanded ? `
      <div class="order-items-list">${ventes.map(v=>_orderItemRowHtml(v,'vente')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddVenteModalForAcheteurCommande('${c.id}')">+ Ajouter une carte</button>
    ` : ''}
  </div>`;
}

function buildAcheteurCard(a) {
  const commandes = acheteurCommandes(a.id);
  const total  = acheteurTotal(a.id);
  const nbCartes = acheteurVentes(a.id).length;
  const expanded = _orderExpandedAcheteurs.has(a.id);
  const card = document.createElement('div');
  card.className = 'order-card';
  card.dataset.acheteurId = a.id;
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">${a.icon||'👤'}</div>
      <div class="order-card-info">
        <div class="order-card-name">${a.pseudo}</div>
        <div class="order-card-meta">${commandes.length} commande${commandes.length>1?'s':''}</div>
      </div>
      <div class="order-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editAcheteur('${a.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteAcheteur('${a.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="order-card-body">
      <div class="order-toggle-row" onclick="_toggleOrderExpand('acheteur','${a.id}')">
        <span>${nbCartes} carte${nbCartes>1?'s':''}</span>
        <span class="order-total">${total.toFixed(2)} €</span>
        <span class="order-chevron ${expanded?'open':''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
      </div>
      ${expanded ? `
        <div class="commandes-list">${commandes.map(c=>_acheteurCommandeRowHtml(c)).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune commande pour le moment.</div>'}</div>
        <button class="order-add-btn" onclick="openAddAcheteurCommandeModal('${a.id}')">+ Nouvelle commande</button>
      ` : ''}
    </div>`;
  return card;
}

function buildAcheteurRow(a) {
  const commandes = acheteurCommandes(a.id);
  const total  = acheteurTotal(a.id);
  const nbCartes = acheteurVentes(a.id).length;
  const expanded = _orderExpandedAcheteurs.has(a.id);
  const row = document.createElement('div');
  row.className = 'classeur-list-row';
  row.dataset.acheteurId = a.id;
  row.innerHTML = `
    <div class="clr-header" onclick="_toggleOrderExpand('acheteur','${a.id}')">
      <div class="clr-thumb" style="background:linear-gradient(135deg,#4a9eff33,#4a9eff55)"><span style="font-size:1.1rem">${a.icon||'👤'}</span></div>
      <div class="clr-accent-bar" style="background:#4a9eff"></div>
      <div class="clr-info">
        <div class="clr-name">${a.pseudo}</div>
        <div class="clr-meta">${commandes.length} commande${commandes.length>1?'s':''} · ${nbCartes} carte${nbCartes>1?'s':''}</div>
      </div>
      <div class="clr-right"><div class="order-total" style="font-size:.92rem">${total.toFixed(2)} €</div></div>
      <div class="clr-actions" onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editAcheteur('${a.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteAcheteur('${a.id}')">${ICON_DELETE}</button>
        <div class="clr-chevron ${expanded?'open':''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    <div class="clr-body ${expanded?'open':''}">
      <div class="commandes-list">${commandes.map(c=>_acheteurCommandeRowHtml(c)).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune commande pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddAcheteurCommandeModal('${a.id}')">+ Nouvelle commande</button>
    </div>`;
  return row;
}

function setAcheteurFilter(f, btn) {
  _acheteurFilter = f;
  document.querySelectorAll('#acheteurs-filter-bar .booster-filter-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAcheteurs();
}
function filterAcheteurs(q) { _acheteurQuery = q; renderAcheteurs(); }

// ── Acheteur (personne : juste un pseudo) ───────────────────────────────
function openAddAcheteurModal() {
  const modal = document.getElementById('modal-acheteur');
  delete modal.dataset.editId;
  document.getElementById('modal-acheteur-title').textContent = 'Nouvel acheteur';
  document.getElementById('acheteur-pseudo-input').value = '';
  _buildIconPicker('acheteur-icon-picker', '👤');
  modal.classList.add('open');
}

function editAcheteur(id) {
  const a = (_D.acheteurs||[]).find(x=>x.id===id); if (!a) return;
  const modal = document.getElementById('modal-acheteur');
  modal.dataset.editId = id;
  document.getElementById('modal-acheteur-title').textContent = "Modifier l'acheteur";
  document.getElementById('acheteur-pseudo-input').value = a.pseudo||'';
  _buildIconPicker('acheteur-icon-picker', a.icon||'👤');
  modal.classList.add('open');
}

function saveAcheteur() {
  const modal = document.getElementById('modal-acheteur');
  const pseudo = document.getElementById('acheteur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const icon = _getSelectedIcon('acheteur-icon-picker', '👤');
  const editId = modal.dataset.editId;
  if (editId) {
    const a = _D.acheteurs.find(x=>x.id===editId);
    if (a) { a.pseudo = pseudo; a.icon = icon; a.updated_at = Date.now(); }
    toast('Acheteur mis à jour !','success');
  } else {
    const newId = _acheteurId();
    _D.acheteurs.push({ id:newId, pseudo, icon, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedAcheteurId = newId;
    toast('Acheteur ajouté !','success');
  }
  saveData(); renderAll(); closeModal('modal-acheteur');
}

function deleteAcheteur(id) {
  const commandes = acheteurCommandes(id);
  const nbCartes = acheteurVentes(id).length;
  const msg = commandes.length
    ? `Supprimer cet acheteur ? ${commandes.length} commande(s) et ${nbCartes} vente(s) liée(s) seront supprimées/détachées.`
    : 'Supprimer cet acheteur ?';
  if (!confirm(msg)) return;
  const commandeIds = new Set(commandes.map(c=>c.id));
  _D.acheteurs = _D.acheteurs.filter(a=>a.id!==id);
  _D.acheteur_commandes = (_D.acheteur_commandes||[]).filter(c=>c.acheteur_id!==id);
  (_D.ventes||[]).forEach(v => { if (v.commande_id && commandeIds.has(v.commande_id)) { v.commande_id = null; v.statut = 'en_vente'; } });
  saveData(); renderAll(); toast('Acheteur supprimé.','success');
}

// ── Commande acheteur (une date d'achat = un lien = un statut d'envoi) ──
function setAcCmdStatusInput(status) {
  document.getElementById('ac-cmd-status-input').value = status;
  document.querySelectorAll('#ac-cmd-status-select .classeur-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status===status));
}

function openAddAcheteurCommandeModal(acheteurId) {
  const modal = document.getElementById('modal-acheteur-commande');
  delete modal.dataset.editId;
  modal.dataset.acheteurId = acheteurId;
  document.getElementById('modal-acheteur-commande-title').textContent = 'Nouvelle commande';
  document.getElementById('ac-cmd-date-achat').value = new Date().toISOString().slice(0,10);
  document.getElementById('ac-cmd-date-arrivee').value = '';
  document.getElementById('ac-cmd-lien').value = '';
  setAcCmdStatusInput('a_envoyer');
  modal.classList.add('open');
}

function editAcheteurCommandeModal(id) {
  const c = (_D.acheteur_commandes||[]).find(x=>x.id===id); if (!c) return;
  const modal = document.getElementById('modal-acheteur-commande');
  modal.dataset.editId = id;
  modal.dataset.acheteurId = c.acheteur_id;
  document.getElementById('modal-acheteur-commande-title').textContent = 'Modifier la commande';
  document.getElementById('ac-cmd-date-achat').value = c.date_achat||'';
  document.getElementById('ac-cmd-date-arrivee').value = c.date_arrivee||'';
  document.getElementById('ac-cmd-lien').value = c.lien_vente||'';
  setAcCmdStatusInput(c.etat||'a_envoyer');
  modal.classList.add('open');
}

function saveAcheteurCommande() {
  const modal = document.getElementById('modal-acheteur-commande');
  const acheteurId = modal.dataset.acheteurId;
  if (!acheteurId) { toast('Acheteur introuvable.','error'); return; }
  const data = {
    acheteur_id:  acheteurId,
    date_achat:   document.getElementById('ac-cmd-date-achat').value || '',
    date_arrivee: document.getElementById('ac-cmd-date-arrivee').value || '',
    lien_vente:   document.getElementById('ac-cmd-lien').value.trim(),
    etat:         document.getElementById('ac-cmd-status-input').value || 'a_envoyer',
  };
  const editId = modal.dataset.editId;
  let commandeId = editId;
  if (editId) {
    const c = _D.acheteur_commandes.find(x=>x.id===editId);
    if (c) { Object.assign(c, data); c.updated_at = Date.now(); }
    toast('Commande mise à jour !','success');
  } else {
    commandeId = _acheteurCommandeId();
    _D.acheteur_commandes.push({ id:commandeId, ...data, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedAcheteurCommandeId = commandeId;
    toast('Commande créée !','success');
  }
  _orderExpandedAcheteurs.add(acheteurId);
  saveData(); renderAll(); closeModal('modal-acheteur-commande');
  return commandeId;
}

function deleteAcheteurCommande(id) {
  const nb = commandeVentes(id).length;
  const msg = nb ? `Supprimer cette commande ? ${nb} vente(s) liée(s) seront détachées (repassent "En vente").` : 'Supprimer cette commande ?';
  if (!confirm(msg)) return;
  _D.acheteur_commandes = (_D.acheteur_commandes||[]).filter(c=>c.id!==id);
  (_D.ventes||[]).forEach(v => { if (v.commande_id===id) { v.commande_id = null; v.statut = 'en_vente'; } });
  saveData(); renderAll(); toast('Commande supprimée.','success');
}

// ═══════════════════════════════════════════════════════════════════════════
//  VENDEURS
// ═══════════════════════════════════════════════════════════════════════════
function renderVendeurs() {
  const grid = document.getElementById('vendeurs-grid');
  if (!grid) return;
  const addBtn = grid.querySelector('.add-new-card');
  if (addBtn) addBtn.remove();
  grid.innerHTML = '';
  const mode = _tabViewModes['vendeurs'] || 'grid';
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid-wide';

  let items = [...(_D.vendeurs||[])];
  if (_vendeurFilter !== 'all') {
    items = items.filter(v => vendeurCommandes(v.id).some(c => (c.etat||'a_payer') === _vendeurFilter));
  }
  if (_vendeurQuery) { const q = _normalizeStr(_vendeurQuery); items = items.filter(v => _normalizeStr(v.pseudo||'').includes(q)); }
  items.sort((a,b) => (a.pseudo||'').localeCompare(b.pseudo||'','fr'));

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucun vendeur${(_vendeurQuery||_vendeurFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    items.forEach(v => grid.appendChild(mode === 'list' ? buildVendeurRow(v) : buildVendeurCard(v)));
  }
  if (addBtn) grid.appendChild(addBtn);
  renderVendeursStats();
}

function renderVendeursStats() {
  const el = document.getElementById('vendeurs-stats'); if (!el) return;
  const all = _D.vendeurs||[];
  const totalVal = all.reduce((s,v)=>s+vendeurTotal(v.id),0);
  const nbCards = (_D.depenses||[]).filter(d=>d.commande_id).length;
  const nbCommandes = (_D.vendeur_commandes||[]).length;
  const enCours = (_D.vendeur_commandes||[]).filter(c => (c.etat||'a_payer') !== 'arrive').length;
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Vendeurs</div><div class="sub">${nbCommandes} commande${nbCommandes>1?'s':''}</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${nbCards}</div><div class="lbl">Cartes achetées</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--gold)"><div class="val">${totalVal.toFixed(2)} €</div><div class="lbl">Total dépensé</div></div>
    <div class="stat-card" style="--accent-color:var(--orange,#f97316)"><div class="val">${enCours}</div><div class="lbl">Commandes en cours</div></div>`;
}

// Ligne compacte représentant UNE commande à l'intérieur de la carte d'un
// vendeur — se déplie à son tour pour révéler les cartes qu'elle contient.
function _vendeurCommandeRowHtml(c) {
  const depenses = commandeDepenses(c.id);
  const total = commandeDepenseTotal(c.id);
  const st = VENDEUR_STATUTS.find(s=>s.id===(c.etat||'a_payer')) || VENDEUR_STATUTS[0];
  const expanded = _orderExpandedCommandes.has(c.id);
  return `<div class="commande-row">
    <div class="commande-row-header" onclick="_toggleCommandeExpand('vendeur','${c.id}')">
      <div class="commande-date">${c.date_achat?_fmtDate(c.date_achat):'—'}${c.date_arrivee?' → '+_fmtDate(c.date_arrivee):''}</div>
      <div class="status-badge ${st.cls}">${st.label}</div>
      <div class="commande-count">${depenses.length} carte${depenses.length>1?'s':''}</div>
      <div class="commande-total">${total.toFixed(2)} €</div>
      <div class="commande-actions" onclick="event.stopPropagation()">
        ${c.lien_achat ? `<a href="${c.lien_achat}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien de l'achat">${ICON_LINK}</a>` : ''}
        <button class="btn btn-icon btn-sm" title="Modifier la commande" onclick="editVendeurCommandeModal('${c.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer la commande" onclick="deleteVendeurCommande('${c.id}')">${ICON_DELETE}</button>
        <div class="order-chevron ${expanded?'open':''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    ${expanded ? `
      <div class="order-items-list">${depenses.map(d=>_orderItemRowHtml(d,'depense')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddDepenseModalForVendeurCommande('${c.id}')">+ Ajouter une carte</button>
    ` : ''}
  </div>`;
}

function buildVendeurCard(v) {
  const commandes = vendeurCommandes(v.id);
  const total    = vendeurTotal(v.id);
  const nbCartes = vendeurDepenses(v.id).length;
  const expanded = _orderExpandedVendeurs.has(v.id);
  const card = document.createElement('div');
  card.className = 'order-card';
  card.dataset.vendeurId = v.id;
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">${v.icon||'🏷️'}</div>
      <div class="order-card-info">
        <div class="order-card-name">${v.pseudo}</div>
        <div class="order-card-meta">${commandes.length} commande${commandes.length>1?'s':''}</div>
      </div>
      <div class="order-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVendeur('${v.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVendeur('${v.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="order-card-body">
      <div class="order-toggle-row" onclick="_toggleOrderExpand('vendeur','${v.id}')">
        <span>${nbCartes} carte${nbCartes>1?'s':''}</span>
        <span class="order-total">${total.toFixed(2)} €</span>
        <span class="order-chevron ${expanded?'open':''}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></span>
      </div>
      ${expanded ? `
        <div class="commandes-list">${commandes.map(c=>_vendeurCommandeRowHtml(c)).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune commande pour le moment.</div>'}</div>
        <button class="order-add-btn" onclick="openAddVendeurCommandeModal('${v.id}')">+ Nouvelle commande</button>
      ` : ''}
    </div>`;
  return card;
}

function buildVendeurRow(v) {
  const commandes = vendeurCommandes(v.id);
  const total    = vendeurTotal(v.id);
  const nbCartes = vendeurDepenses(v.id).length;
  const expanded = _orderExpandedVendeurs.has(v.id);
  const row = document.createElement('div');
  row.className = 'classeur-list-row';
  row.dataset.vendeurId = v.id;
  row.innerHTML = `
    <div class="clr-header" onclick="_toggleOrderExpand('vendeur','${v.id}')">
      <div class="clr-thumb" style="background:linear-gradient(135deg,#f9731633,#f9731655)"><span style="font-size:1.1rem">${v.icon||'🏷️'}</span></div>
      <div class="clr-accent-bar" style="background:#f97316"></div>
      <div class="clr-info">
        <div class="clr-name">${v.pseudo}</div>
        <div class="clr-meta">${commandes.length} commande${commandes.length>1?'s':''} · ${nbCartes} carte${nbCartes>1?'s':''}</div>
      </div>
      <div class="clr-right"><div class="order-total" style="font-size:.92rem">${total.toFixed(2)} €</div></div>
      <div class="clr-actions" onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVendeur('${v.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVendeur('${v.id}')">${ICON_DELETE}</button>
        <div class="clr-chevron ${expanded?'open':''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    <div class="clr-body ${expanded?'open':''}">
      <div class="commandes-list">${commandes.map(c=>_vendeurCommandeRowHtml(c)).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune commande pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddVendeurCommandeModal('${v.id}')">+ Nouvelle commande</button>
    </div>`;
  return row;
}

function setVendeurFilter(f, btn) {
  _vendeurFilter = f;
  document.querySelectorAll('#vendeurs-filter-bar .booster-filter-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderVendeurs();
}
function filterVendeurs(q) { _vendeurQuery = q; renderVendeurs(); }

// ── Vendeur (personne : juste un pseudo) ────────────────────────────────
function openAddVendeurModal() {
  const modal = document.getElementById('modal-vendeur');
  delete modal.dataset.editId;
  document.getElementById('modal-vendeur-title').textContent = 'Nouveau vendeur';
  document.getElementById('vendeur-pseudo-input').value = '';
  _buildIconPicker('vendeur-icon-picker', '🏷️');
  modal.classList.add('open');
}

function editVendeur(id) {
  const v = (_D.vendeurs||[]).find(x=>x.id===id); if (!v) return;
  const modal = document.getElementById('modal-vendeur');
  modal.dataset.editId = id;
  document.getElementById('modal-vendeur-title').textContent = 'Modifier le vendeur';
  document.getElementById('vendeur-pseudo-input').value = v.pseudo||'';
  _buildIconPicker('vendeur-icon-picker', v.icon||'🏷️');
  modal.classList.add('open');
}

function saveVendeur() {
  const modal = document.getElementById('modal-vendeur');
  const pseudo = document.getElementById('vendeur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const icon = _getSelectedIcon('vendeur-icon-picker', '🏷️');
  const editId = modal.dataset.editId;
  if (editId) {
    const v = _D.vendeurs.find(x=>x.id===editId);
    if (v) { v.pseudo = pseudo; v.icon = icon; v.updated_at = Date.now(); }
    toast('Vendeur mis à jour !','success');
  } else {
    const newId = _vendeurId();
    _D.vendeurs.push({ id:newId, pseudo, icon, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedVendeurId = newId;
    toast('Vendeur ajouté !','success');
  }
  saveData(); renderAll(); closeModal('modal-vendeur');
}

function deleteVendeur(id) {
  const commandes = vendeurCommandes(id);
  const nbCartes = vendeurDepenses(id).length;
  const msg = commandes.length
    ? `Supprimer ce vendeur ? ${commandes.length} commande(s) et ${nbCartes} achat(s) lié(s) seront supprimés/détachés.`
    : 'Supprimer ce vendeur ?';
  if (!confirm(msg)) return;
  const commandeIds = new Set(commandes.map(c=>c.id));
  _D.vendeurs = _D.vendeurs.filter(v=>v.id!==id);
  _D.vendeur_commandes = (_D.vendeur_commandes||[]).filter(c=>c.vendeur_id!==id);
  (_D.depenses||[]).forEach(d => { if (d.commande_id && commandeIds.has(d.commande_id)) d.commande_id = null; });
  saveData(); renderAll(); toast('Vendeur supprimé.','success');
}

// ── Commande vendeur (une date d'achat = un lien = un statut de paiement) ─
function setVdCmdStatusInput(status) {
  document.getElementById('vd-cmd-status-input').value = status;
  document.querySelectorAll('#vd-cmd-status-select .classeur-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status===status));
}

function openAddVendeurCommandeModal(vendeurId) {
  const modal = document.getElementById('modal-vendeur-commande');
  delete modal.dataset.editId;
  modal.dataset.vendeurId = vendeurId;
  document.getElementById('modal-vendeur-commande-title').textContent = 'Nouvelle commande';
  document.getElementById('vd-cmd-date-achat').value = new Date().toISOString().slice(0,10);
  document.getElementById('vd-cmd-date-arrivee').value = '';
  document.getElementById('vd-cmd-lien').value = '';
  setVdCmdStatusInput('a_payer');
  modal.classList.add('open');
}

function editVendeurCommandeModal(id) {
  const c = (_D.vendeur_commandes||[]).find(x=>x.id===id); if (!c) return;
  const modal = document.getElementById('modal-vendeur-commande');
  modal.dataset.editId = id;
  modal.dataset.vendeurId = c.vendeur_id;
  document.getElementById('modal-vendeur-commande-title').textContent = 'Modifier la commande';
  document.getElementById('vd-cmd-date-achat').value = c.date_achat||'';
  document.getElementById('vd-cmd-date-arrivee').value = c.date_arrivee||'';
  document.getElementById('vd-cmd-lien').value = c.lien_achat||'';
  setVdCmdStatusInput(c.etat||'a_payer');
  modal.classList.add('open');
}

function saveVendeurCommande() {
  const modal = document.getElementById('modal-vendeur-commande');
  const vendeurId = modal.dataset.vendeurId;
  if (!vendeurId) { toast('Vendeur introuvable.','error'); return; }
  const data = {
    vendeur_id:   vendeurId,
    date_achat:   document.getElementById('vd-cmd-date-achat').value || '',
    date_arrivee: document.getElementById('vd-cmd-date-arrivee').value || '',
    lien_achat:   document.getElementById('vd-cmd-lien').value.trim(),
    etat:         document.getElementById('vd-cmd-status-input').value || 'a_payer',
  };
  const editId = modal.dataset.editId;
  let commandeId = editId;
  if (editId) {
    const c = _D.vendeur_commandes.find(x=>x.id===editId);
    if (c) { Object.assign(c, data); c.updated_at = Date.now(); }
    toast('Commande mise à jour !','success');
  } else {
    commandeId = _vendeurCommandeId();
    _D.vendeur_commandes.push({ id:commandeId, ...data, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedVendeurCommandeId = commandeId;
    toast('Commande créée !','success');
  }
  _orderExpandedVendeurs.add(vendeurId);
  saveData(); renderAll(); closeModal('modal-vendeur-commande');
  return commandeId;
}

function deleteVendeurCommande(id) {
  const nb = commandeDepenses(id).length;
  const msg = nb ? `Supprimer cette commande ? ${nb} achat(s) lié(s) seront détachés.` : 'Supprimer cette commande ?';
  if (!confirm(msg)) return;
  _D.vendeur_commandes = (_D.vendeur_commandes||[]).filter(c=>c.id!==id);
  (_D.depenses||[]).forEach(d => { if (d.commande_id===id) d.commande_id = null; });
  saveData(); renderAll(); toast('Commande supprimée.','success');
}

// ═══════════════════════════════════════════════════════════════════════════
//  BILAN — résumé mensuel ventes / dépenses
// ═══════════════════════════════════════════════════════════════════════════
var _BILAN_MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// Clé "YYYY-MM" à partir d'une date 'YYYY-MM-DD' (champ <input type=date>) ou
// d'un timestamp numérique (created_at, utilisé en repli).
function _monthKey(dateOrTs) {
  if (!dateOrTs) return null;
  const d = typeof dateOrTs === 'number' ? new Date(dateOrTs) : new Date(dateOrTs + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function _monthLabel(key) {
  const [y,m] = key.split('-').map(Number);
  return (_BILAN_MOIS[m-1]||'?') + ' ' + y;
}

// Mois d'une vente : date d'achat de la commande si elle est vendue et liée,
// sinon date de création de la ligne (repli).
function _venteMonthKey(v) {
  if (v.commande_id) {
    const c = (_D.acheteur_commandes||[]).find(x=>x.id===v.commande_id);
    if (c && c.date_achat) return _monthKey(c.date_achat);
  }
  return _monthKey(v.created_at);
}
function _depenseMonthKey(d) {
  if (d.commande_id) {
    const c = (_D.vendeur_commandes||[]).find(x=>x.id===d.commande_id);
    if (c && c.date_achat) return _monthKey(c.date_achat);
  }
  return _monthKey(d.created_at);
}

function renderBilan() {
  const statsEl = document.getElementById('bilan-stats');
  const el      = document.getElementById('bilan-content');
  if (!statsEl || !el) return;

  const ventesByMonth = {}, ventesCountByMonth = {};
  (_D.ventes||[]).filter(v => venteStatusInfo(v).id === 'vendue').forEach(v => {
    const key = _venteMonthKey(v); if (!key) return;
    ventesByMonth[key] = (ventesByMonth[key]||0) + _lineTotal(v);
    ventesCountByMonth[key] = (ventesCountByMonth[key]||0) + (parseInt(v.qty,10)||1);
  });

  const depensesByMonth = {}, depensesCountByMonth = {};
  (_D.depenses||[]).forEach(d => {
    const key = _depenseMonthKey(d); if (!key) return;
    depensesByMonth[key] = (depensesByMonth[key]||0) + _lineTotal(d);
    depensesCountByMonth[key] = (depensesCountByMonth[key]||0) + (parseInt(d.qty,10)||1);
  });

  const allMonths = [...new Set([...Object.keys(ventesByMonth), ...Object.keys(depensesByMonth)])].sort().reverse();

  const totalVentes   = Object.values(ventesByMonth).reduce((a,b)=>a+b,0);
  const totalDepenses = Object.values(depensesByMonth).reduce((a,b)=>a+b,0);
  const solde = totalVentes - totalDepenses;

  statsEl.innerHTML = `
    <div class="stat-card stat-card-money" style="--accent-color:var(--green)"><div class="val">${totalVentes.toFixed(2)} €</div><div class="lbl">Total ventes</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--accent2)"><div class="val">${totalDepenses.toFixed(2)} €</div><div class="lbl">Total dépenses</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:${solde>=0?'var(--green)':'var(--accent2)'}"><div class="val">${solde>=0?'+':''}${solde.toFixed(2)} €</div><div class="lbl">Solde net</div></div>`;

  if (!allMonths.length) {
    el.innerHTML = '<div class="sales-empty">Aucune vente vendue ni dépense enregistrée pour le moment.</div>';
    return;
  }

  el.innerHTML = `
    <div class="bilan-table">
      <div class="bilan-row bilan-header-row">
        <div class="bilan-month">Mois</div>
        <div class="bilan-ventes">Ventes</div>
        <div class="bilan-depenses">Dépenses</div>
        <div class="bilan-solde">Solde</div>
      </div>
      ${allMonths.map(key => {
        const v = ventesByMonth[key]||0, d = depensesByMonth[key]||0, s = v-d;
        const nv = ventesCountByMonth[key]||0, nd = depensesCountByMonth[key]||0;
        return `<div class="bilan-row">
          <div class="bilan-month">${_monthLabel(key)}</div>
          <div class="bilan-ventes">${v.toFixed(2)} €<span class="bilan-sub">${nv} carte${nv>1?'s':''}</span></div>
          <div class="bilan-depenses">${d.toFixed(2)} €<span class="bilan-sub">${nd} carte${nd>1?'s':''}</span></div>
          <div class="bilan-solde ${s>=0?'positive':'negative'}">${s>=0?'+':''}${s.toFixed(2)} €</div>
        </div>`;
      }).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  SÉLECTEUR "TYPE" (multi-sélection : Normale / Reverse / Holo Cosmos / 1ère édition)
// ═══════════════════════════════════════════════════════════════════════════
function _buildChipGroup(containerId, options, selected) {
  const el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = options.map(o => `<button type="button" class="chip-toggle-btn ${selected.includes(o.id)?'active':''}" data-value="${o.id}" onclick="_toggleChip(this)">${o.label}</button>`).join('');
}
function _toggleChip(btn) { btn.classList.toggle('active'); }
function _setChipGroup(containerId, selected) { _buildChipGroup(containerId, VENTE_TYPES, selected||[]); }
function _getChipGroup(containerId) {
  return [...document.querySelectorAll(`#${containerId} .chip-toggle-btn.active`)].map(b=>b.dataset.value);
}

// ═══════════════════════════════════════════════════════════════════════════
//  SÉLECTEUR DE CARTE (Choix du Pokémon → Choix de la carte)
//  Réutilise les données déjà chargées par l'onglet Pokédex :
//   • Étape 1 = liste des Pokémon (+ formes), avec recherche, sprite et nom FR
//     hydratés à la volée comme dans la grille du Pokédex (mêmes caches
//     _fetchPokemon/_fetchSpecies), sans toucher à l'état de l'onglet Pokédex.
//   • Étape 2 = cartes TCG de ce Pokémon, groupées par extension et triées
//     dans le même ordre bloc+code que partout ailleurs dans l'appli.
// ═══════════════════════════════════════════════════════════════════════════
var _cardPickerTarget = null;       // 'vente' | 'depense'
var _cardPickerTimer = null;
var _cardPickerPokeList = [];       // sous-ensemble courant de _pkdx.all (résultats de recherche)
var _cardPickerSelectedPoke = null; // entrée _pkdx choisie à l'étape 1
var _cardPickerGroups = [];         // groupes {ext, set_name, cards[]} de l'étape 2
var _cardPickerCards = [];          // liste à plat des cartes affichées (pour la sélection par index)
var CARD_PICKER_MAX_RESULTS = 200;

async function openCardPicker(target) {
  _cardPickerTarget = target;
  _cardPickerSelectedPoke = null;
  _cardPickerGroups = [];
  _cardPickerCards = [];
  _restoreCardPickerPokeSearch();
  document.getElementById('cardpicker-step1').innerHTML = '<div class="sales-empty">Chargement du Pokédex…</div>';
  document.getElementById('cardpicker-step1').style.display = '';
  document.getElementById('cardpicker-step2').style.display = 'none';
  document.getElementById('modal-card-picker').classList.add('open');
  if (!_pkdx.initialized) {
    try { await initPokedex(); } catch(_) {}
  }
  _cardPickerRenderPokeList('');
  setTimeout(() => document.getElementById('cardpicker-search').focus(), 60);
}

function _cardPickerSearch(q) {
  clearTimeout(_cardPickerTimer);
  _cardPickerTimer = setTimeout(() => _cardPickerRenderPokeList(q.trim()), 200);
}

// Construit la liste des Pokémon correspondant à la recherche à partir des
// données déjà chargées par le Pokédex (_pkdx.all), sans jamais modifier
// l'état/filtre de l'onglet Pokédex lui-même.
function _cardPickerRenderPokeList(query) {
  const el = document.getElementById('cardpicker-step1');
  if (!el) return;
  if (!_pkdx.all || !_pkdx.all.length) { el.innerHTML = '<div class="sales-empty">Pokédex indisponible pour le moment.</div>'; return; }

  const q = _normalizeStr(query||'');
  let list;
  if (q) {
    list = _pkdx.all.filter(p =>
      _normalizeStr(p.name).includes(q) ||
      _normalizeStr(p.frName||'').includes(q) ||
      String(p.isForm ? p.baseId : p.id).startsWith(q)
    );
    list = list.slice().sort((a,b) => {
      const ida = a.isForm ? a.baseId : a.id, idb = b.isForm ? b.baseId : b.id;
      return ida - idb || (a.isForm?1:0) - (b.isForm?1:0);
    });
  } else {
    // Même construction que la liste principale de l'onglet Pokédex : chaque
    // forme apparaît juste après son Pokémon de base (_buildPoolWithForms).
    list = _buildPoolWithForms();
  }
  _cardPickerPokeList = list.slice(0, CARD_PICKER_MAX_RESULTS);

  if (!_cardPickerPokeList.length) { el.innerHTML = '<div class="sales-empty">Aucun Pokémon trouvé.</div>'; return; }

  el.innerHTML = _cardPickerPokeList.map((p, i) => {
    const displayId = p.isForm ? p.baseId : p.id;
    const label = p.frName || _capitalize(p.name.replace(/-/g,' '));
    return `<div class="cardpicker-poke-item${p.isForm?' is-form':''}" onclick="_cardPickerSelectPokemon(${i})">
      <div class="cardpicker-poke-sprite" id="cpk-sprite-${i}"></div>
      <div class="cardpicker-poke-name" id="cpk-name-${i}">${label}</div>
      <div class="cardpicker-poke-num">#${String(displayId).padStart(4,'0')}</div>
    </div>`;
  }).join('');

  const hasMore = list.length > _cardPickerPokeList.length;
  if (hasMore) {
    el.innerHTML += `<div class="sales-empty" style="padding:8px">Affine ta recherche pour voir plus de résultats…</div>`;
  }

  // Hydrate sprite + nom FR à la volée (mêmes caches que l'onglet Pokédex).
  _cardPickerPokeList.forEach((p, i) => _cardPickerHydratePoke(p, i));
}

async function _cardPickerHydratePoke(p, i) {
  const nameEl   = document.getElementById(`cpk-name-${i}`);
  const spriteEl = document.getElementById(`cpk-sprite-${i}`);
  if (!nameEl && !spriteEl) return;
  try {
    const fetchId = p.isForm ? p.name : p.id;
    const poke = await _fetchPokemon(fetchId);
    const sprite = poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '';
    if (spriteEl) spriteEl.innerHTML = sprite ? `<img src="${sprite}" alt="" loading="lazy">` : '';
    if (!p.frName) {
      const spec = await _fetchSpecies(poke.species.url);
      if (spec) {
        if (p.isForm) {
          const baseEntry = _pkdx.all.find(e => e.id === p.baseId && !e.isForm);
          let baseFr = baseEntry?.frName || '';
          if (!baseFr) {
            const fr2 = spec.names?.find(n => n.language.name === 'fr');
            if (fr2) { baseFr = fr2.name; if (baseEntry) baseEntry.frName = fr2.name; }
          }
          p.frName = _buildFormFrName(baseFr, p.formType, p.name);
        } else {
          const fr = spec.names?.find(n => n.language.name === 'fr');
          if (fr) p.frName = fr.name;
        }
      }
    }
    if (nameEl && p.frName) nameEl.textContent = p.frName;
  } catch(_) { /* on garde le nom anglais de repli déjà affiché */ }
}

async function _cardPickerSelectPokemon(i) {
  const p = _cardPickerPokeList[i]; if (!p) return;
  _cardPickerSelectedPoke = p;
  document.getElementById('cardpicker-step1').style.display = 'none';
  document.getElementById('cardpicker-step2').style.display = '';
  document.getElementById('cardpicker-pokemon-label').textContent = p.frName || _capitalize(p.name.replace(/-/g,' '));
  _cardPickerExtFilter = null;
  const grid = document.getElementById('cardpicker-cards');
  grid.innerHTML = '<div class="sales-empty">Chargement des cartes…</div>';
  try {
    const frName = p.frName || _capitalize(p.name.replace(/-/g,' '));
    // Résolution du type de forme identique aux fiches Pokédex (assignation
    // manuelle prioritaire, sinon détection automatique) — garantit que le
    // sélecteur trouve exactement les mêmes cartes que la fiche du Pokémon
    // (Gigamax, Méga "M"/"M-", label posé sur une forme de base, etc.).
    const formType = await _resolveFormTypeForPkdxEntry(p);
    const { groups } = await _fetchCardsGroupedByExtension(frName, formType);
    _cardPickerGroups = groups;
    _buildCardPickerExtSearch();
    _cardPickerRenderCardGroups();
  } catch(e) {
    grid.innerHTML = `<div class="sales-empty">Erreur : ${e.message}</div>`;
  }
}

// Une fois entré dans un Pokémon, la recherche de l'étape 1 (par nom de
// Pokémon) n'a plus lieu d'être : on la remplace par un filtre par extension
// dans la même barre de recherche.
var _cardPickerExtFilter = '';
function _buildCardPickerExtSearch() {
  const search = document.getElementById('cardpicker-search');
  if (!search) return;
  search.value = '';
  search.placeholder = 'Filtrer par extension…';
  search.oninput = (e) => { _cardPickerExtFilter = e.target.value; _cardPickerRenderCardGroups(); };
}
function _restoreCardPickerPokeSearch() {
  const search = document.getElementById('cardpicker-search');
  if (!search) return;
  search.value = '';
  search.placeholder = 'Rechercher un Pokémon…';
  search.oninput = (e) => _cardPickerSearch(e.target.value);
  _cardPickerExtFilter = '';
}

function _cardPickerRenderCardGroups() {
  const grid = document.getElementById('cardpicker-cards'); if (!grid) return;
  let groups = _cardPickerGroups || [];
  if (_cardPickerExtFilter) {
    const q = _normalizeStr(_cardPickerExtFilter);
    groups = groups.filter(g => _normalizeStr(g.ext.name||'').includes(q) || _normalizeStr(g.ext.code||'').includes(q));
  }
  if (!groups.length) { grid.innerHTML = `<div class="sales-empty">${_cardPickerExtFilter ? 'Aucune extension ne correspond.' : 'Aucune carte trouvée pour ce Pokémon.'}</div>`; return; }
  _cardPickerCards = [];
  grid.innerHTML = _renderTcgCardGroupsHtml(groups, c => {
    _cardPickerCards.push(c);
    return '_cardPickerSelectCard(' + (_cardPickerCards.length - 1) + ')';
  });
}

function _cardPickerBackToStep1() {
  document.getElementById('cardpicker-step1').style.display = '';
  document.getElementById('cardpicker-step2').style.display = 'none';
  _restoreCardPickerPokeSearch();
}

function _cardPickerSelectCard(idx) {
  const c = _cardPickerCards[idx]; if (!c) return;
  const p = _cardPickerTarget; if (!p) return;
  const pokeName = (_cardPickerSelectedPoke && (_cardPickerSelectedPoke.frName || _capitalize(_cardPickerSelectedPoke.name.replace(/-/g,' ')))) || c.name || '';
  document.getElementById(`${p}-card-id`).value = c.id||'';
  document.getElementById(`${p}-card-name`).value = c.name||'';
  document.getElementById(`${p}-card-image`).value = c.image_url||'';
  document.getElementById(`${p}-set-id`).value = c.set_id||'';
  document.getElementById(`${p}-set-name`).value = c.set_name||'';
  document.getElementById(`${p}-set-logo`).value = c.set_logo||'';
  document.getElementById(`${p}-number`).value = c.number||'';
  document.getElementById(`${p}-rarity`).value = c.rarity||'';
  document.getElementById(`${p}-pokemon-name`).value = pokeName;
  const sigleField = document.getElementById(`${p}-ext-sigle`);
  if (sigleField) sigleField.value = (c._ext && c._ext.sigle) || '';
  _renderCardPreview(p);
  closeModal('modal-card-picker');
}

function _renderCardPreview(prefix) {
  const wrap = document.getElementById(`${prefix}-card-preview`); if (!wrap) return;
  const name = document.getElementById(`${prefix}-card-name`).value;
  if (!name) { wrap.innerHTML = '<div class="sales-empty" style="padding:8px 0">Aucune carte sélectionnée.</div>'; return; }
  const img = document.getElementById(`${prefix}-card-image`).value;
  const setName = document.getElementById(`${prefix}-set-name`).value;
  const number = document.getElementById(`${prefix}-number`).value;
  const sigleField = document.getElementById(`${prefix}-ext-sigle`);
  const sigle = sigleField ? sigleField.value : '';
  wrap.innerHTML = `
    <div class="cardpicker-selected-preview">
      <div class="cardpicker-preview-thumb">${img ? `<img src="${img}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
      <div class="cardpicker-preview-info">
        <div class="cardpicker-preview-name">${sigle ? `<img src="${sigle}" class="cardpicker-preview-sigle" alt="">` : ''}${_escHtml(name)}</div>
        <div class="cardpicker-preview-meta">${_escHtml(setName||'')}${number?' · N°'+_escHtml(number):''}</div>
      </div>
    </div>`;
}

// ── Rognage de l'image d'en-tête (haut / centre / bas) ──────────────────
var CARD_CROP_OPTIONS = [
  { id:'top',    label:'Haut',   pos:'center top' },
  { id:'center', label:'Centre', pos:'center center' },
  { id:'bottom', label:'Bas',    pos:'center bottom' },
];
function _cropPosition(crop) {
  return (CARD_CROP_OPTIONS.find(o => o.id === crop) || CARD_CROP_OPTIONS[1]).pos;
}
function setCropInput(prefix, crop) {
  document.getElementById(`${prefix}-crop-input`).value = crop;
  document.querySelectorAll(`#${prefix}-crop-select .classeur-status-btn`).forEach(b => b.classList.toggle('active', b.dataset.status===crop));
}


