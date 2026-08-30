// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/collection.js
//  Extensions / Classeurs / Boosters — vues, CRUD, drag & drop
// ═══════════════════════════════════════════════════════════════════════════

// ── Extensions View ────────────────────────────────────────────────────────
function renderExtensions() {
  const container = document.getElementById('blocs-container');
  container.innerHTML = '';
  let totalSorties = 0, totalCartes = 0, totalOwned = 0, grandTotal = 0;

  getBlocs().forEach(bloc => {
    const custom = (_D.custom_exts || []).filter(e => e.bloc_id === bloc.id);
    let allExts = [
      ...(bloc.extensions || []).map(e => {
        const ov = (_D.ext_overrides || {})[e.id] || {};
        if (ov._hidden) return null;
        if ((ov.stat_mode||e.stat_mode||'all') === 'boosters_only') return null;
        if (ov.bloc_id_override && ov.bloc_id_override !== bloc.id) return null;
        return { ...e, ...ov, _builtin: true };
      }).filter(Boolean),
      // Add built-in exts that were moved TO this bloc
      ...getBlocs().filter(b => b._builtin && b.id !== bloc.id).flatMap(b =>
        (b.extensions || []).filter(e => {
          const ov = (_D.ext_overrides || {})[e.id] || {};
          return ov.bloc_id_override === bloc.id && !ov._hidden && (ov.stat_mode||e.stat_mode||'all') !== 'boosters_only';
        }).map(e => {
          const ov = (_D.ext_overrides || {})[e.id] || {};
          return { ...e, ...ov, _builtin: true };
        })
      ),
      ...custom.filter(e => (e.stat_mode||'all') !== 'boosters_only').map(e => ({ ...e, _custom: true }))
    ];

    let exts = allExts.filter(e => {
      if (_searchQuery) {
        const q = _searchQuery.toLowerCase();
        return e.nom.toLowerCase().includes(q) || e.code.toLowerCase().includes(q);
      }
      return true;
    });
    if (exts.length === 0) return;

    exts = sortExts(exts);

    grandTotal   += allExts.length;
    totalSorties += allExts.length;
    let bOwned = 0, bTotal = 0;
    allExts.forEach(e => {
      if (!e.sorti && !e._custom) return;
      if (e.stat_mode === 'boosters_only') return;
      bTotal += e.nb_cartes || 0; bOwned += ownedCount(e.id);
      totalOwned += ownedCount(e.id); totalCartes += e.nb_cartes || 0;
    });
    const pct   = bTotal > 0 ? Math.round(bOwned / bTotal * 100) : 0;
    const color = pctColor(pct);

    const section = document.createElement('div');
    section.className = 'bloc-section';
    const blocLogoHtml = bloc.logo
      ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`
      : '';
    section.innerHTML = `
      <div class="bloc-header">
        ${blocLogoHtml}
        <div class="bloc-color-dot" style="background:${bloc.couleur}"></div>
        <div class="bloc-title">${bloc.nom}</div>
        <div class="bloc-short">${bloc.short}</div>
        <div class="bloc-progress">
          <div class="bloc-progress-bar">
            <div class="bloc-progress-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="bloc-progress-txt" style="color:${color}">${pct}% · ${bOwned}/${bTotal}</div>
        </div>
      </div>
      <div id="extc-${bloc.id}" class="${(_tabViewModes['extensions']||'grid')==='grid'?'ext-grid':'ext-list'}"></div>`;
    container.appendChild(section);

    const cont = section.querySelector(`#extc-${bloc.id}`);
    const extMode = _tabViewModes['extensions'] || 'grid';
    exts.forEach(ext => cont.appendChild(extMode==='grid' ? buildExtCard(ext,bloc) : buildExtRow(ext,bloc)));
  });

  document.getElementById('stat-total-ext').textContent    = totalSorties;
  document.getElementById('stat-sorties-ext').textContent  = `${grandTotal} au total`;
  document.getElementById('stat-total-cartes').textContent = totalCartes.toLocaleString('fr');
  document.getElementById('stat-cartes-owned').textContent = totalOwned.toLocaleString('fr');
  const gPct = totalCartes > 0 ? Math.round(totalOwned / totalCartes * 100) : 0;
  document.getElementById('stat-pct-global').textContent   = gPct + '%';
  document.getElementById('ext-subtitle').textContent      = `${totalSorties} extensions sorties · ${totalCartes.toLocaleString('fr')} cartes`;
}

function buildExtCard(ext, bloc) {
  const total    = ext.nb_cartes || 0;
  const owned    = ownedCount(ext.id);
  const pct      = total > 0 ? Math.round(owned/total*100) : 0;
  const barColor = pctColor(pct);
  const released = ext.sorti || ext._custom;
  const accentColor = extColor(ext);

  const el = document.createElement('div');
  // Border always uses bloc/ext accent color, NOT pct
  el.className = 'ext-card' + (released ? '' : ' not-released');
  el.style.setProperty('--ext-color', accentColor);
  if (released) el.onclick = () => openDetail(ext, bloc);

  const logoSrc = ext.logo || bloc.logo || '';

  el.innerHTML = `
    <div class="ext-card-thumb">
      ${logoSrc ? `<img src="${logoSrc}" alt="${ext.nom}" onerror="_nasImgRetry(this,img=>{img.style.display='none';img.nextElementSibling.style.display='flex'})">` : ''}
      <div class="ext-card-thumb-placeholder" style="${logoSrc?'display:none':''}">
        <div class="ext-pcode" style="color:${accentColor}">${ext.code}</div>
      </div>
      ${!released ? '<div class="ext-badge ext-badge-coming">À venir</div>' : ''}
      <div class="ext-card-bar"><div class="ext-card-bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
    </div>
    <div class="ext-card-body">
      <div class="ext-card-code" style="color:${accentColor}">${ext.code}</div>
      <div class="ext-card-name">${ext.nom}</div>
      <div class="ext-card-foot">
        <div class="ext-card-count">${total>0 ? total+' cartes' : ''}</div>
        ${released ? `<div class="ext-card-pct" style="color:${barColor}">${pct}%</div>` : ''}
      </div>
    </div>`;
  return el;
}

function buildExtRow(ext, bloc) {
  const total    = ext.nb_cartes || 0;
  const owned    = ownedCount(ext.id);
  const pct      = total > 0 ? Math.round(owned/total*100) : 0;
  const barColor = pctColor(pct);
  const accentColor = extColor(ext);
  const released = ext.sorti || ext._custom;

  const el = document.createElement('div');
  el.className = 'ext-row' + (released ? '' : ' not-released');
  el.style.setProperty('--ext-color', accentColor);
  if (released) el.onclick = () => openDetail(ext, bloc);

  el.innerHTML = `
    <div class="ext-row-color" style="background:${accentColor}"></div>
    <div class="ext-row-thumb">
      ${ext.logo||bloc.logo ? `<img src="${ext.logo||bloc.logo}" alt="${ext.nom}" onerror="_nasImgRetry(this,img=>{img.style.display='none';img.nextElementSibling.style.display='flex'})">` : ''}
      <div class="ext-row-thumb-code" style="color:${accentColor};${ext.logo||bloc.logo?'display:none':''}">${ext.code}</div>
    </div>
    <div class="ext-row-info">
      <div class="ext-row-code" style="color:${accentColor}">${ext.code}${ext._custom?' · Custom':''}</div>
      <div class="ext-row-name">${ext.nom}</div>
    </div>
    <div class="ext-row-meta">
      <div class="ext-row-count">${total>0?total+' cartes':'—'}</div>
      ${released ? `
        <div class="ext-row-bar-wrap"><div class="ext-row-bar">
          <div class="ext-row-bar-fill" style="width:${pct}%;background:${barColor}"></div>
        </div></div>
        <div class="ext-row-pct" style="color:${barColor}">${pct}%</div>
      ` : '<div class="ext-row-pct" style="color:var(--text3)">—</div>'}
    </div>`;
  return el;
}

function filterExtensions(q) { _searchQuery = q; renderExtensions(); }

function toggleNonSorti() {
  _showNonSorti = !_showNonSorti;
  document.getElementById('toggle-ns-lbl').textContent = _showNonSorti ? 'Masquer à venir' : 'Afficher à venir';
  renderExtensions();
}

function toggleSortDir() {
  _extSortDir = _extSortDir === 'asc' ? 'desc' : 'asc';
  document.querySelectorAll('.sort-code-icon').forEach(el => el.textContent = _extSortDir === 'asc' ? '↑' : '↓');
  if(!_D.settings) _D.settings={};
  _D.settings.sort_dir = _extSortDir;
  saveData();
  renderAll();
}

function setViewMode(mode, btn) {
  const key = typeof _viewModeStorageKey === 'function' ? _viewModeStorageKey() : _currentView;
  _tabViewModes[key] = mode;
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if(!_D.settings) _D.settings={};
  if(!_D.settings.tab_view_modes) _D.settings.tab_view_modes={};
  _D.settings.tab_view_modes[key] = mode;
  saveData();
  if (key === 'labels' && typeof renderLabelsList === 'function') renderLabelsList();
  else if (key === 'mapping' && typeof renderMappingList === 'function') renderMappingList();
  else if (key === 'persoobjets' && typeof _pkoRenderEditionList === 'function') _pkoRenderEditionList();
  else renderAll();
}

// ── Global Progress ────────────────────────────────────────────────────────
function updateGlobalProgress() {
  let total = 0, owned = 0;
  getAllExtensions().forEach(e => {
    if (!e.sorti && !e._custom) return;
    if (e.stat_mode === 'boosters_only') return;
    total += e.nb_cartes || 0; owned += ownedCount(e.id);
  });
  const pct = total > 0 ? Math.round(owned/total*100) : 0;
  document.getElementById('global-pct').textContent        = pct + '%';
  document.getElementById('global-fill').style.width       = pct + '%';
  document.getElementById('global-fill').style.background  = pctBg(pct);
}

function updateBadges() {
  document.getElementById('nb-ext').textContent       = getAllExtensions().filter(e=>e.sorti||e._custom).length;
  document.getElementById('nb-classeurs').textContent = _D.classeurs.length;
  const bd = _D.boosters_data || {};
  let boosterCount = 0, goodieCount = 0;
  Object.values(bd).forEach(arr => (arr||[]).forEach(il => (il.product_type||'booster')==='booster' ? boosterCount++ : goodieCount++));
  document.getElementById('nb-boosters').textContent  = boosterCount;
  const nbGoodies = document.getElementById('nb-goodies'); if (nbGoodies) nbGoodies.textContent = goodieCount;
  const nbVentes = document.getElementById('nb-ventes');       if (nbVentes)    nbVentes.textContent    = (_D.ventes||[]).length;
  const nbAcheteurs = document.getElementById('nb-acheteurs'); if (nbAcheteurs) nbAcheteurs.textContent = (_D.acheteurs||[]).length;
  const nbDepenses = document.getElementById('nb-depenses');   if (nbDepenses)  nbDepenses.textContent  = (_D.depenses||[]).length;
  const nbVendeurs = document.getElementById('nb-vendeurs');   if (nbVendeurs)  nbVendeurs.textContent  = (_D.vendeurs||[]).length;
}

// ── Detail Panel ───────────────────────────────────────────────────────────
function openDetail(ext, bloc) {
  _currentExt = { ext, bloc };
  const total = ext.nb_cartes || 0;
  const owned = ownedCount(ext.id);
  const pct   = total > 0 ? Math.round(owned/total*100) : 0;
  const color = extColor(ext);
  const barColor = pctColor(pct);
  const logoSrc = ext.logo || bloc.logo || '';

  // Logo in big, sigle as bottom-right badge (same pattern as booster detail)
  const logoArea = document.getElementById('d-logo-area');
  const sigleSrcDetail = ext.sigle || bloc.sigle || '';
  if (logoArea) {
    logoArea.innerHTML = `
      <div class="detail-logo-banner" style="border-color:${color}">
        ${logoSrc
          ? `<img class="detail-logo-img" src="${logoSrc}" alt="${ext.code}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`
          : `<div class="detail-logo-placeholder" style="color:${color}">${ext.code}</div>`}
        ${sigleSrcDetail
          ? `<div class="detail-sigle-badge"><img src="${sigleSrcDetail}" alt="sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')"></div>`
          : ''}
      </div>`;
  }

  document.getElementById('d-code').textContent      = ext.code;
  document.getElementById('d-code').style.color      = color;
  document.getElementById('d-name').textContent      = ext.nom;
  document.getElementById('d-meta').textContent      = `${total} cartes · ${bloc.nom}`;
  document.getElementById('d-owned').textContent     = owned;
  document.getElementById('d-total').textContent     = total;
  document.getElementById('d-pct').textContent       = pct + '%';
  document.getElementById('d-pct').style.color       = barColor;
  document.getElementById('d-fill').style.width      = pct + '%';
  document.getElementById('d-fill').style.background = barColor;
  document.getElementById('d-manual-owned').value    = owned;
  document.getElementById('d-manual-total').textContent = `/ ${total}`;

  const sigleSrc2 = ext.sigle||bloc.sigle||'';
  const sigleDisplayHtml = sigleSrc2 ? `<strong><img src="${sigleSrc2}" class="detail-info-sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')"></strong>` : '<strong>—</strong>';
  document.getElementById('d-infos').innerHTML = `
    <div class="detail-info-row"><span>Code</span><strong>${ext.code}</strong></div>
    <div class="detail-info-row"><span>Sigle</span>${sigleDisplayHtml}</div>
    <div class="detail-info-row"><span>Série</span><strong>${bloc.nom}</strong></div>
    <div class="detail-info-row"><span>Total</span><strong>${total}</strong></div>
    <div class="detail-info-row"><span>Possédées</span><strong style="color:var(--green)">${owned}</strong></div>
    <div class="detail-info-row"><span>Manquantes</span><strong style="color:var(--accent)">${total-owned}</strong></div>
    <div class="detail-info-row"><span>Complétion</span><strong style="color:${barColor}">${pct}%</strong></div>`;

  document.getElementById('detail-panel').classList.add('open');
  document.getElementById('detail-backdrop').classList.add('open');
}

function closeDetail() {
  document.getElementById('detail-panel').classList.remove('open');
  document.getElementById('detail-backdrop').classList.remove('open');
  _currentExt = null;
}

function setManualOwned() {
  if (!_currentExt) return;
  const { ext } = _currentExt;
  const val     = parseInt(document.getElementById('d-manual-owned').value) || 0;
  const capped  = Math.min(val, ext.nb_cartes || 0);
  _D.collection[ext.id] = {};
  for (let i = 1; i <= capped; i++) _D.collection[ext.id][i] = { owned:true, foil:false, qte:1 };
  saveData(); renderAll();
  openDetail(_currentExt.ext, _currentExt.bloc);
  toast(`${capped} cartes enregistrées.`, 'success');
}

function markAllOwned() {
  if (!_currentExt) return;
  const { ext } = _currentExt;
  _D.collection[ext.id] = {};
  for (let i = 1; i <= (ext.nb_cartes||0); i++) _D.collection[ext.id][i] = { owned:true, foil:false, qte:1 };
  saveData(); renderAll();
  openDetail(_currentExt.ext, _currentExt.bloc);
  toast('Toutes les cartes marquées !', 'success');
}

function clearExtension() {
  if (!_currentExt || !confirm('Réinitialiser cette extension ?')) return;
  delete _D.collection[_currentExt.ext.id];
  saveData(); renderAll();
  openDetail(_currentExt.ext, _currentExt.bloc);
  toast('Extension réinitialisée.', 'success');
}

// ── Classeurs ──────────────────────────────────────────────────────────────
function renderClasseurs() {
  const container = document.getElementById('classeurs-grid');
  // Detach add-button BEFORE clearing so the node stays alive
  const addBtn = container.querySelector('.add-new-card');
  if (addBtn) addBtn.remove();
  container.innerHTML = '';

  const classeurMode = _tabViewModes['classeurs'] || 'grid';
  const blocs = getBlocs();
  const blocOrder = blocs.map(b => b.id);

  // Sort classeurs by bloc order, then original order within same bloc
  const sortedCl = [..._D.classeurs].sort((a, b) => {
    const ia = a.bloc_id ? blocOrder.indexOf(a.bloc_id) : 999;
    const ib = b.bloc_id ? blocOrder.indexOf(b.bloc_id) : 999;
    if (ia !== ib) return ia - ib;
    return _D.classeurs.findIndex(c => c.id === a.id) - _D.classeurs.findIndex(c => c.id === b.id);
  });

  // Group by bloc_id (null => 'none')
  const groups = [];
  const seen = new Map();
  sortedCl.forEach(cl => {
    const key = cl.bloc_id || '__none__';
    if (!seen.has(key)) { seen.set(key, []); groups.push(key); }
    seen.get(key).push(cl);
  });

  groups.forEach(key => {
    const cls = seen.get(key);
    const bloc = key !== '__none__' ? blocs.find(b => b.id === key) : null;

    // ── Bloc header (same markup as Extensions view) ──
    const section = document.createElement('div');
    section.className = 'bloc-section';

    // Compute aggregate stats for the header
    let totalSlots = 0, totalFilled = 0;
    cls.forEach(cl => {
      const st = classeurStats(cl);
      totalSlots  += st.totalSlots;
      totalFilled += st.filled;
    });
    const aggPct   = totalSlots > 0 ? Math.round(totalFilled / totalSlots * 100) : 0;
    const aggColor = pctColor(aggPct);
    const palette  = ['#e63946','#4a9eff','#06d6a0','#ffd166','#a855f7','#f97316','#ec4899'];
    const dotColor = bloc ? bloc.couleur : palette[groups.indexOf(key) % palette.length];
    const blocLogoHtml = bloc?.logo
      ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`
      : '';
    const blocName  = bloc ? bloc.nom  : 'Sans série';
    const blocShort = bloc ? bloc.short : '—';

    section.innerHTML = `
      <div class="bloc-header">
        ${blocLogoHtml}
        <div class="bloc-color-dot" style="background:${dotColor}"></div>
        <div class="bloc-title">${blocName}</div>
        <div class="bloc-short">${blocShort}</div>
        <div class="bloc-progress">
          <div class="bloc-progress-bar">
            <div class="bloc-progress-fill" style="width:${aggPct}%;background:${aggColor}"></div>
          </div>
          <div class="bloc-progress-txt" style="color:${aggColor}">${aggPct}% · ${totalFilled}/${totalSlots}</div>
        </div>
      </div>
      <div class="classeur-bloc-body ${classeurMode === 'list' ? 'classeurs-list-wrap' : 'classeurs-grid-inner'}"></div>`;

    const body = section.querySelector('.classeur-bloc-body');
    cls.forEach(cl => {
      body.appendChild(classeurMode === 'list' ? buildClasseurRow(cl) : buildClasseurCard(cl));
    });
    container.appendChild(section);
  });

  // Re-append add button at the end
  if (addBtn) container.appendChild(addBtn);
}

// Statut de complétion d'un classeur : 'to_buy' | 'in_progress' | 'complete'.
// Rétrocompatible avec l'ancien booléen cl.complete (→ 'complete' si true).
function _classeurStatus(cl) {
  if (cl.status === 'to_buy' || cl.status === 'in_progress' || cl.status === 'complete') return cl.status;
  return cl.complete ? 'complete' : 'in_progress';
}
function _classeurStatusInfo(cl) {
  const status = _classeurStatus(cl);
  if (status === 'to_buy')   return { status, label: '🛒 À acheter', cls: 'status-to-buy' };
  if (status === 'complete') return { status, label: '✓ Complet',    cls: 'status-complete' };
  return                            { status, label: 'À compléter',  cls: 'status-in-progress' };
}

function classeurStats(cl) {
  const spp = cl.slots_par_page || 18;
  const totalSlots = cl.pages * spp;
  let filled = 0;
  (cl.extensions || []).forEach(ce => filled += Math.min(ce.filled||0, (ce.pages||0)*spp));
  const rawPct = totalSlots > 0 ? Math.round(filled/totalSlots*100) : 0;
  const pct = _classeurStatus(cl) === 'complete' ? 100 : rawPct;
  const palette = ['#e63946','#4a9eff','#06d6a0','#ffd166','#a855f7','#f97316','#ec4899'];
  // Use cl.id-based index to avoid indexOf returning -1 when cl comes from a sorted copy
  const bloc = (_D && cl.bloc_id) ? (getBlocs().find(b=>b.id===cl.bloc_id) || null) : null;
  const clIdx = _D ? _D.classeurs.findIndex(c=>c.id===cl.id) : 0;
  const c = bloc ? bloc.couleur : palette[Math.max(0, clIdx) % palette.length];
  return { spp, totalSlots, filled, pct, rawPct, c, bloc };
}

function buildClasseurCard(cl) {
  const { spp, totalSlots, filled, pct, c, bloc } = classeurStats(cl);
  const topBg = cl.image
    ? `background:linear-gradient(rgba(0,0,0,.55),rgba(0,0,0,.72)),url('${cl.image}') center/cover no-repeat`
    : `background:linear-gradient(135deg,${c}1a,${c}40)`;
  const warn = cl.pages > 100
    ? `<div class="classeur-overload-warning">⚠️ Attention, le classeur sera surchargé au-dessus de 100 pages</div>` : '';

  const card = document.createElement('div');
  card.className = 'classeur-card' + (cl.complete ? ' is-complete' : '');
  card.dataset.classeurId = cl.id;
  card.draggable = true;
  card.addEventListener('dragstart', onClasseurDragStart);
  card.addEventListener('dragover',  onClasseurDragOver);
  card.addEventListener('dragleave', onClasseurDragLeave);
  card.addEventListener('drop',      onClasseurDrop);

  const statusInfo = _classeurStatusInfo(cl);
  card.innerHTML = `
    <div class="classeur-card-top" style="${topBg}">
      ${!cl.image ? '<span class="classeur-card-icon">📗</span>' : ''}
      <div class="classeur-drag-handle" title="Réorganiser">⠿</div>
      <div class="classeur-top-info">
        <div class="classeur-card-name">${cl.nom}</div>
        <div class="classeur-card-meta">${cl.pages} p · ${spp} slots/p${bloc?' · '+bloc.short:''}</div>
        <div class="classeur-status-badge ${statusInfo.cls}">${statusInfo.label}</div>
      </div>
      <div class="classeur-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="event.stopPropagation();editClasseur('${cl.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();deleteClasseur('${cl.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="classeur-card-body">
      ${warn}
      <div class="classeur-global-bar-wrap">
        <div class="classeur-global-txt"><span>${filled}/${totalSlots} slots</span><span class="classeur-global-pct" style="color:${pctTxt(pct)}">${pct}%</span></div>
        <div class="classeur-global-bar"><div class="classeur-global-fill" style="width:${pct}%;background:${pctBg(pct)}"></div></div>
      </div>
      <div class="classeur-ext-list" id="cel-${cl.id}"></div>
      <button class="classeur-add-ext-btn" onclick="openAddExtToClasseur('${cl.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter une extension
      </button>
    </div>`;

  buildCerList(card.querySelector(`#cel-${cl.id}`), cl, spp);
  return card;
}

function buildClasseurRow(cl) {
  const { spp, totalSlots, filled, pct, c, bloc } = classeurStats(cl);
  const uid = `clr-acc-${cl.id}`;
  const extCount = (cl.extensions || []).length;
  const warnBadge = cl.pages > 100 ? '<span class="clr-warn-badge">⚠️ >100p</span>' : '';
  const statusInfo = _classeurStatusInfo(cl);
  const completeBadge = `<span class="classeur-status-badge ${statusInfo.cls}">${statusInfo.label}</span>`;
  const thumbStyle = cl.image
    ? `background:url('${cl.image}') center/cover no-repeat`
    : `background:linear-gradient(135deg,${c}33,${c}55)`;

  const row = document.createElement('div');
  row.className = 'classeur-list-row';
  row.dataset.classeurId = cl.id;
  row.draggable = true;
  row.addEventListener('dragstart', onClasseurDragStart);
  row.addEventListener('dragover',  onClasseurDragOver);
  row.addEventListener('dragleave', onClasseurDragLeave);
  row.addEventListener('drop',      onClasseurDrop);

  row.innerHTML = `
    <div class="clr-header" onclick="toggleClrAccordion('${uid}', this)">
      <div class="clr-drag-handle" title="Réorganiser" onclick="event.stopPropagation()">⠿</div>
      <div class="clr-thumb" style="${thumbStyle}">
        ${!cl.image ? `<span style="color:${c};font-size:1.1rem">📗</span>` : ''}
      </div>
      <div class="clr-accent-bar" style="background:${c}"></div>
      <div class="clr-info">
        <div class="clr-name">${cl.nom} ${warnBadge} ${completeBadge}</div>
        <div class="clr-meta">${cl.pages}p · ${spp} sl/p · ${extCount} ext${bloc ? ' · ' + bloc.short : ''}</div>
      </div>
      <div class="clr-right">
        <div class="clr-bar-wrap">
          <div class="clr-bar"><div class="clr-bar-fill" style="width:${pct}%;background:${pctBg(pct)}"></div></div>
          <span class="clr-pct" style="color:${pctTxt(pct)}">${pct}%</span>
        </div>
        <div class="clr-slots">${filled}/${totalSlots} slots</div>
      </div>
      <div class="clr-actions" onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editClasseur('${cl.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteClasseur('${cl.id}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
        <div class="clr-chevron" id="chev-${uid}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="clr-body" id="${uid}">
      <div class="classeur-ext-list" id="cel-list-${cl.id}"></div>
      <button class="classeur-add-ext-btn" onclick="openAddExtToClasseur('${cl.id}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter une extension
      </button>
    </div>`;

  buildCerList(row.querySelector(`#cel-list-${cl.id}`), cl, spp);
  return row;
}

function toggleClrAccordion(uid, headerEl) {
  const body = document.getElementById(uid);
  const chev = document.getElementById('chev-' + uid);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', isOpen);
}

// Builds extension accordion rows within a classeur
function buildCerList(container, cl, spp) {
  (cl.extensions || []).forEach((ce, idx) => {
    const extObj = getExt(ce.ext_id);
    const bloc   = extObj ? getBlocForExt(ce.ext_id) : null;
    const color  = extObj ? extColor(extObj) : '#888';
    const slotsExt = (ce.pages||0) * spp;
    const filled   = Math.min(ce.filled||0, slotsExt);
    const pct      = slotsExt > 0 ? Math.round(filled/slotsExt*100) : 0;
    const uid      = `cer_${cl.id}_${idx}`;

    const row = document.createElement('div');
    row.className = 'cer-row';
    row.draggable = true;
    row.dataset.dragKey = `${cl.id}::${idx}`;
    row.addEventListener('dragstart', onDragStart);
    row.addEventListener('dragover', e => { e.preventDefault(); e.stopPropagation(); onDragOverRow(e, cl.id, idx); });
    row.addEventListener('dragleave', e => { e.stopPropagation(); row.classList.remove('drag-target'); });
    row.addEventListener('drop', e => { e.preventDefault(); e.stopPropagation(); onDropRow(cl.id, idx); });

    const logoHtml = extBadgeHtml(extObj || { code: ce.ext_id, id: ce.ext_id }, bloc, 'cer-logo-badge');

    row.innerHTML = `
      <div class="cer-header" onclick="toggleAccordion('${uid}')">
        <div class="cer-drag-handle" title="Glisser pour réorganiser ou changer de classeur">⠿</div>
        <div class="cer-logo-wrap">${logoHtml}</div>
        <div class="cer-accent" style="background:${color}"></div>
        <div class="cer-info">
          <div class="cer-code" style="color:${color}">${extObj?extObj.code:ce.ext_id}</div>
          <div class="cer-name">${extObj?extObj.nom:'—'}</div>
        </div>
        <div class="cer-mini-bar">
          <div class="cer-slots-txt">${filled}/${slotsExt}</div>
          <div class="cer-bar"><div class="cer-bar-fill" style="width:${pct}%;background:${pctBg(pct)}"></div></div>
          <div class="cer-pct" style="color:${pctTxt(pct)}">${pct}%</div>
        </div>
        <div class="cer-chevron" id="chev-${uid}">▼</div>
      </div>
      <div class="cer-body" id="${uid}">
        <div class="cer-body-controls">
          <label>Slots remplis :</label>
          <input type="number" value="${filled}" min="0" max="${slotsExt}"
            onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"
            onchange="updateFilledSlots('${cl.id}','${ce.ext_id}',this.value)">
          <span class="sep">/ ${slotsExt}</span>
        </div>
        <div class="cer-body-controls" style="margin-top:6px">
          <label>Pages allouées :</label>
          <input type="number" value="${ce.pages||0}" min="0" max="200"
            onclick="event.stopPropagation()" onkeydown="event.stopPropagation()"
            onchange="updateExtPages('${cl.id}','${ce.ext_id}',this.value)">
        </div>
        <button class="btn-remove-cer" onclick="removeExtFromClasseur('${cl.id}','${ce.ext_id}')">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          Retirer cette extension
        </button>
      </div>`;
    container.appendChild(row);
  });
}

function toggleAccordion(uid) {
  const body = document.getElementById(uid);
  const chev = document.getElementById('chev-' + uid);
  if (!body) return;
  body.classList.toggle('open');
  if (chev) chev.classList.toggle('open');
}

// ── Drag & Drop ────────────────────────────────────────────────────────────
// Supports: reorder within classeur + move to different classeur

function onDragStart(e) {
  _dragKey = e.currentTarget.dataset.dragKey;
  e.dataTransfer.effectAllowed = 'move';
}

// Called on a classeur card/row (for cross-classeur drop)
function onDragOver(e) {
  e.preventDefault();
  const id = e.currentTarget.dataset.classeurId;
  if (id !== _dragOverClasseurId) {
    clearDragHighlight();
    e.currentTarget.classList.add('drag-over');
    _dragOverClasseurId = id;
  }
}
function onDragLeave(e) {
  // Only clear if leaving the classeur entirely
  const related = e.relatedTarget;
  if (!e.currentTarget.contains(related)) {
    e.currentTarget.classList.remove('drag-over');
    if (_dragOverClasseurId === e.currentTarget.dataset.classeurId) _dragOverClasseurId = null;
  }
}
function onDrop(e) {
  e.preventDefault();
  clearDragHighlight();
  if (!_dragKey) return;
  const [fromId, fromIdxStr] = _dragKey.split('::');
  const fromIdx = parseInt(fromIdxStr);
  const toId = e.currentTarget.dataset.classeurId;
  if (!toId || toId === fromId) { _dragKey = null; return; } // same classeur: handled by row drop
  moveExtBetweenClasseurs(fromId, fromIdx, toId, null);
}

// Called on a cer-row (for same-classeur reorder)
function onDragOverRow(e, classeurId, toIdx) {
  document.querySelectorAll('.cer-row.drag-target').forEach(r => r.classList.remove('drag-target'));
  if (!_dragKey) return;
  const [fromId] = _dragKey.split('::');
  if (fromId !== classeurId) return; // cross-classeur: handled by classeur card dragover
  e.currentTarget.classList.add('drag-target');
  _dragOverIdx = toIdx;
}

function onDropRow(classeurId, toIdx) {
  document.querySelectorAll('.cer-row.drag-target').forEach(r => r.classList.remove('drag-target'));
  if (!_dragKey) return;
  const [fromId, fromIdxStr] = _dragKey.split('::');
  const fromIdx = parseInt(fromIdxStr);
  if (fromId === classeurId) {
    // Reorder within same classeur
    reorderExtInClasseur(classeurId, fromIdx, toIdx);
  } else {
    // Drop on a specific slot in another classeur
    moveExtBetweenClasseurs(fromId, fromIdx, classeurId, toIdx);
  }
  _dragKey = null;
}

function clearDragHighlight() {
  document.querySelectorAll('.classeur-card.drag-over, .classeur-list-row.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.cer-row.drag-target').forEach(el => el.classList.remove('drag-target'));
}

function reorderExtInClasseur(classeurId, fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  const cl = _D.classeurs.find(c => c.id === classeurId);
  if (!cl) return;
  const exts = cl.extensions || [];
  const [moved] = exts.splice(fromIdx, 1);
  exts.splice(toIdx, 0, moved);
  cl.extensions = exts;
  saveData(); renderClasseurs();
  toast('Extension réordonnée.', 'success');
}

function moveExtBetweenClasseurs(fromId, fromIdx, toId, toIdx) {
  const fromCl = _D.classeurs.find(c => c.id === fromId);
  const toCl   = _D.classeurs.find(c => c.id === toId);
  if (!fromCl || !toCl) return;
  const exts = fromCl.extensions || [];
  if (fromIdx < 0 || fromIdx >= exts.length) return;
  const ce = exts[fromIdx];
  if ((toCl.extensions || []).find(e => e.ext_id === ce.ext_id)) {
    toast('Cette extension est déjà dans ce classeur.', 'error'); return;
  }
  exts.splice(fromIdx, 1);
  if (!toCl.extensions) toCl.extensions = [];
  if (toIdx !== null && toIdx >= 0) {
    toCl.extensions.splice(toIdx, 0, { ...ce });
  } else {
    toCl.extensions.push({ ...ce });
  }
  saveData(); renderClasseurs();
  toast(`Extension déplacée vers "${toCl.nom}" !`, 'success');
}

// ── Classeur drag reorder ─────────────────────────────────────────────────
function onClasseurDragStart(e) {
  // Only start drag from the handle or top area, not from accordion buttons
  _dragClasseurId = e.currentTarget.dataset.classeurId;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.currentTarget.classList.add('cl-dragging'), 0);
}
function onClasseurDragOver(e) {
  // Also handles cross-classeur ext drop (legacy)
  const id = e.currentTarget.dataset.classeurId;
  if (_dragKey) {
    // ext drag — use old handler
    e.preventDefault();
    if (id !== _dragOverClasseurId) {
      document.querySelectorAll('.classeur-card.drag-over, .classeur-list-row.drag-over').forEach(c=>c.classList.remove('drag-over'));
      e.currentTarget.classList.add('drag-over');
      _dragOverClasseurId = id;
    }
  } else if (_dragClasseurId && _dragClasseurId !== id) {
    e.preventDefault();
    document.querySelectorAll('.classeur-card.cl-drop-target, .classeur-list-row.cl-drop-target').forEach(c=>c.classList.remove('cl-drop-target'));
    e.currentTarget.classList.add('cl-drop-target');
  }
}
function onClasseurDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over','cl-drop-target');
    if (_dragOverClasseurId === e.currentTarget.dataset.classeurId) _dragOverClasseurId = null;
  }
}
function onClasseurDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.classeur-card.drag-over,.classeur-list-row.drag-over,.classeur-card.cl-drop-target,.classeur-list-row.cl-drop-target,.classeur-card.cl-dragging,.classeur-list-row.cl-dragging')
    .forEach(c=>c.classList.remove('drag-over','cl-drop-target','cl-dragging'));
  const toId = e.currentTarget.dataset.classeurId;
  if (_dragKey) {
    // ext drag cross-classeur
    if (!toId || toId === _dragKey.split('::')[0]) { _dragKey=null; return; }
    const [fromId, fromIdxStr] = _dragKey.split('::');
    moveExtBetweenClasseurs(fromId, parseInt(fromIdxStr), toId, null);
    _dragKey = null;
  } else if (_dragClasseurId && _dragClasseurId !== toId) {
    // classeur reorder
    const fromIdx = _D.classeurs.findIndex(c=>c.id===_dragClasseurId);
    const toIdx   = _D.classeurs.findIndex(c=>c.id===toId);
    if (fromIdx>=0 && toIdx>=0) {
      const [moved] = _D.classeurs.splice(fromIdx,1);
      _D.classeurs.splice(toIdx,0,moved);
      saveData(); renderClasseurs();
      toast('Classeurs réorganisés.','success');
    }
    _dragClasseurId = null;
  }
}

// ── Classeur CRUD ──────────────────────────────────────────────────────────
function setClasseurStatusInput(status) {
  document.getElementById('classeur-status-input').value = status;
  document.querySelectorAll('#classeur-status-select .classeur-status-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.status === status);
  });
}

function openAddClasseurModal() {
  const modal = document.getElementById('modal-classeur');
  delete modal.dataset.editId;
  document.getElementById('modal-classeur-title').textContent = 'Nouveau classeur';
  document.getElementById('classeur-name-input').value    = '';
  document.getElementById('classeur-pages-input').value   = 40;
  document.getElementById('classeur-cartes-input').value  = 40*18;
  document.getElementById('classeur-slots-select').value  = '18';
  document.getElementById('classeur-image-input').value   = '';
  document.getElementById('classeur-bloc-select').value   = '';
  setClasseurStatusInput('in_progress');
  previewClasseurImage('');
  populateClasseurBlocSelect();
  modal.classList.add('open');
}

function syncClasseurInputs(changed) {
  const spp = parseInt(document.getElementById('classeur-slots-select').value) || 18;
  if (changed === 'pages') {
    const p = parseInt(document.getElementById('classeur-pages-input').value) || 0;
    document.getElementById('classeur-cartes-input').value = p * spp;
  } else if (changed === 'cartes') {
    const c = parseInt(document.getElementById('classeur-cartes-input').value) || 0;
    document.getElementById('classeur-pages-input').value = Math.ceil(c/spp) || 1;
  } else {
    const c = parseInt(document.getElementById('classeur-cartes-input').value) || 0;
    document.getElementById('classeur-pages-input').value = Math.ceil(c/spp) || 1;
  }
}

function saveClasseur() {
  const modal  = document.getElementById('modal-classeur');
  const nom      = document.getElementById('classeur-name-input').value.trim();
  const pages    = parseInt(document.getElementById('classeur-pages-input').value) || 40;
  const slots    = parseInt(document.getElementById('classeur-slots-select').value) || 18;
  const image    = document.getElementById('classeur-image-input').value.trim();
  const bloc_id  = document.getElementById('classeur-bloc-select').value || '';
  const status   = document.getElementById('classeur-status-input').value || 'in_progress';
  if (!nom) { toast('Veuillez saisir un nom.','error'); return; }
  const editId = modal.dataset.editId;
  if (editId) {
    const cl = _D.classeurs.find(c=>c.id===editId);
    if (cl) { cl.nom=nom; cl.pages=pages; cl.slots_par_page=slots; cl.image=image; cl.bloc_id=bloc_id; cl.status=status; cl.complete=(status==='complete'); }
    toast('Classeur mis à jour !','success');
  } else {
    _D.classeurs.push({ id:'cl_'+Date.now(), nom, pages, slots_par_page:slots, image, bloc_id, status, complete:(status==='complete'), extensions:[] });
    toast('Classeur créé !','success');
  }
  saveData(); renderAll(); closeModal('modal-classeur');
}

function editClasseur(id) {
  const cl = _D.classeurs.find(c=>c.id===id); if (!cl) return;
  const modal = document.getElementById('modal-classeur');
  modal.dataset.editId = id;
  document.getElementById('modal-classeur-title').textContent = 'Modifier le classeur';
  document.getElementById('classeur-name-input').value   = cl.nom;
  document.getElementById('classeur-pages-input').value  = cl.pages;
  document.getElementById('classeur-cartes-input').value = cl.pages * (cl.slots_par_page||18);
  document.getElementById('classeur-slots-select').value = cl.slots_par_page||18;
  document.getElementById('classeur-image-input').value  = cl.image||'';
  setClasseurStatusInput(_classeurStatus(cl));
  previewClasseurImage(cl.image||'');
  populateClasseurBlocSelect(cl.bloc_id||'');
  modal.classList.add('open');
}

function populateClasseurBlocSelect(selected='') {
  const sel = document.getElementById('classeur-bloc-select'); if(!sel) return;
  sel.innerHTML = '<option value="">— Aucun bloc —</option>';
  getBlocs().forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id; opt.textContent = `${b.short} – ${b.nom}`;
    if (b.id === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function previewClasseurImage(url) {
  const prev = document.getElementById('classeur-image-preview'); if (!prev) return;
  if (url) {
    prev.style.backgroundImage = `url('${url}')`;
    prev.style.backgroundSize  = 'cover';
    prev.style.backgroundPosition = 'center';
    prev.innerHTML = '';
  } else {
    prev.style.backgroundImage = '';
    prev.innerHTML = '<span style="font-size:.7rem;color:var(--text3)">Aperçu</span>';
  }
}

function deleteClasseur(id) {
  if (!confirm('Supprimer ce classeur ?')) return;
  _D.classeurs = _D.classeurs.filter(c=>c.id!==id);
  saveData(); renderAll(); toast('Classeur supprimé.','success');
}

function openAddExtToClasseur(classeurId) {
  _targetClasseurId = classeurId;
  const cl = _D.classeurs.find(c=>c.id===classeurId);
  document.getElementById('add-ext-classeur-select').value = '';
  document.getElementById('add-ext-classeur-label').textContent = '— Choisir —';
  document.getElementById('add-ext-classeur-panel').style.display = 'none';
  document.getElementById('add-ext-classeur-pages').value  = 10;
  document.getElementById('add-ext-classeur-cartes').value = 10*(cl.slots_par_page||18);
  document.getElementById('modal-add-ext-classeur').classList.add('open');
}

// Same grouped-by-bloc, sorted-by-code dropdown used by the Pokédex extension
// filter (button + panel), instead of a plain <select>. Building it this way
// (getBlocs() order, then sortExts within each bloc, de-duplicated by id)
// fixes the duplicate/badly-sorted entries the old <optgroup> select could show.
function toggleAddExtClasseurPanel(btn) {
  const panel = document.getElementById('add-ext-classeur-panel');
  const open  = panel && panel.style.display !== 'none';
  if (open) { panel.style.display = 'none'; return; }
  _buildAddExtClasseurList();
  panel.style.display = '';
}

function _buildAddExtClasseurList() {
  const el = document.getElementById('add-ext-classeur-list');
  if (!el) return;
  const cl = _D.classeurs.find(c=>c.id===_targetClasseurId);
  const existingIds = (cl?.extensions||[]).map(e=>e.ext_id);

  // De-duplicate by id defensively, then filter to released/custom exts not
  // already in this classeur.
  const seen = new Set();
  const available = getAllExtensions().filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return (e.sorti||e._custom) && !existingIds.includes(e.id);
  });

  if (!available.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.8rem;padding:8px 12px">Aucune extension disponible.</div>';
    return;
  }

  let html = '';
  const groups = new Map(); // nom du bloc affiché -> { bloc, exts:[] }
  available.forEach(e => {
    const bloc = getBlocForExt(e.id) || { id:'?', nom:'Autres', sigle:'' };
    const key = bloc.nom || 'Autres';
    if (!groups.has(key)) groups.set(key, { bloc, exts: [] });
    groups.get(key).exts.push(e);
  });
  const knownOrder = getBlocs().map(b => b.nom);
  const groupKeys = [...groups.keys()].sort((a, b) => {
    const ia = knownOrder.indexOf(a), ib = knownOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  groupKeys.forEach(key => {
    const { bloc, exts } = groups.get(key);
    html += `<div class="pkdx-ext-filter-bloc-label">${key}</div>`;
    html += sortExts(exts).map(e => {
      const sigleSrc = e.sigle || bloc.sigle || '';
      return `<div class="pkdx-ext-filter-item" onclick="selectAddExtClasseurItem('${e.id}')">
        ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="pkdx-ext-filter-sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : `<span class="pkdx-ext-filter-code">${e.code||''}</span>`}
        <span>${e.nom}</span>
      </div>`;
    }).join('');
  });
  el.innerHTML = html;
}

function selectAddExtClasseurItem(extId) {
  const ext = getExt(extId);
  document.getElementById('add-ext-classeur-select').value = extId;
  document.getElementById('add-ext-classeur-label').textContent = ext ? `${ext.code} – ${ext.nom}` : extId;
  document.getElementById('add-ext-classeur-panel').style.display = 'none';
}

function syncAddExtInputs(field) {
  const cl  = _D.classeurs.find(c=>c.id===_targetClasseurId);
  const spp = cl?(cl.slots_par_page||18):18;
  if (field==='pages') {
    const p = parseInt(document.getElementById('add-ext-classeur-pages').value)||0;
    document.getElementById('add-ext-classeur-cartes').value = p*spp;
  } else {
    const c = parseInt(document.getElementById('add-ext-classeur-cartes').value)||0;
    document.getElementById('add-ext-classeur-pages').value = Math.ceil(c/spp)||1;
  }
}

function confirmAddExtToClasseur() {
  const extId = document.getElementById('add-ext-classeur-select').value;
  const pages = parseInt(document.getElementById('add-ext-classeur-pages').value)||10;
  if (!extId) { toast('Choisissez une extension.','error'); return; }
  const cl = _D.classeurs.find(c=>c.id===_targetClasseurId); if (!cl) return;
  if (!cl.extensions) cl.extensions=[];

  // Insert at the correct sorted position (bloc order, then order within bloc)
  // instead of always appending at the end, so the new extension lands right
  // next to its neighbours instead of being buried at the bottom of the list.
  const order = extCanonicalOrder();
  const newPos = order.indexOf(extId);
  let insertAt = cl.extensions.length;
  if (newPos !== -1) {
    for (let i = 0; i < cl.extensions.length; i++) {
      const pos = order.indexOf(cl.extensions[i].ext_id);
      if (pos === -1 || pos > newPos) { insertAt = i; break; }
    }
  }
  cl.extensions.splice(insertAt, 0, { ext_id:extId, pages, filled:0 });

  saveData(); renderAll(); closeModal('modal-add-ext-classeur'); toast('Extension ajoutée !','success');
}

function removeExtFromClasseur(classeurId, extId) {
  if (!confirm('Retirer cette extension ?')) return;
  const cl = _D.classeurs.find(c=>c.id===classeurId);
  if (cl) cl.extensions=(cl.extensions||[]).filter(e=>e.ext_id!==extId);
  saveData(); renderAll(); toast('Extension retirée.','success');
}

function updateFilledSlots(classeurId, extId, value) {
  const cl = _D.classeurs.find(c=>c.id===classeurId); if (!cl) return;
  const ce = (cl.extensions||[]).find(e=>e.ext_id===extId); if (ce) ce.filled=parseInt(value)||0;
  saveData();
  const open=[...document.querySelectorAll('.cer-body.open')].map(e=>e.id);
  renderClasseurs();
  open.forEach(uid=>{ const b=document.getElementById(uid),c=document.getElementById('chev-'+uid); if(b)b.classList.add('open'); if(c)c.classList.add('open'); });
}

function updateExtPages(classeurId, extId, value) {
  const cl = _D.classeurs.find(c=>c.id===classeurId); if (!cl) return;
  const ce = (cl.extensions||[]).find(e=>e.ext_id===extId); if (ce) ce.pages=parseInt(value)||0;
  saveData();
  const open=[...document.querySelectorAll('.cer-body.open')].map(e=>e.id);
  renderClasseurs();
  open.forEach(uid=>{ const b=document.getElementById(uid),c=document.getElementById('chev-'+uid); if(b)b.classList.add('open'); if(c)c.classList.add('open'); });
}

// ── Boosters / Illustrations ───────────────────────────────────────────────
// Panneau de détail partagé par Boosters ET Goodies (même structure visuelle,
// seuls le conteneur ciblé et le sous-ensemble de product_type affiché changent).
function _renderIllusDetailPanel(panelId, ext, bloc, illus, addFn, addLabel) {
  const panel = document.getElementById(panelId); if (!panel) return;
  const color    = extColor(ext);
  const logoSrc  = ext.logo  || bloc.logo  || '';
  const sigleSrc = ext.sigle || bloc?.sigle || '';
  const obtained = illus.filter(il=>il.obtained!==false).length;
  const pct = illus.length>0?Math.round(obtained/illus.length*100):0;

  const logoZoneHtml = `
    <div class="bpd-logo-zone" style="border-color:${color}">
      ${logoSrc
        ? `<img class="bpd-logo-main" src="${logoSrc}" alt="${ext.code}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`
        : `<div class="bpd-logo-placeholder" style="color:${color}">${ext.code}</div>`}
      ${sigleSrc
        ? `<div class="bpd-sigle-badge"><img src="${sigleSrc}" alt="sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')"></div>`
        : ''}
    </div>`;

  panel.innerHTML = `
    <div class="bpd-header">
      ${logoZoneHtml}
      <div class="bpd-info">
        <div class="bpd-code" style="color:${color}">${ext.code}</div>
        <div class="bpd-name">${ext.nom}</div>
        <div class="bpd-bloc">${bloc.nom}</div>
      </div>
    </div>
    <div class="bpd-stats">
      <div class="bpd-stat-row"><span>Illustrations</span><strong>${illus.length}</strong></div>
      <div class="bpd-stat-row"><span>Obtenues</span><strong style="color:var(--green)">${obtained}</strong></div>
      <div class="bpd-stat-row"><span>Manquantes</span><strong style="color:var(--accent)">${illus.length-obtained}</strong></div>
      <div class="bpd-stat-row"><span>Obtention</span><strong style="color:${pctTxt(pct)}">${pct}%</strong></div>
    </div>
    <div class="bpd-bar"><div style="width:${pct}%;background:${pctBg(pct)}"></div></div>
    <div style="padding:0 16px 16px">
      <button class="bea-add-btn" onclick="${addFn}('${ext.id}','${(ext.nom||'').replace(/'/g,"\\'")}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        ${addLabel}
      </button>
    </div>`;
  panel.classList.add('open');
}

function openBoosterDetail(el, extId) {
  const ext = getExt(extId); if (!ext) return;
  const bloc = getBlocForExt(extId);
  _boosterDetail = { ext, bloc };
  document.querySelectorAll('.bea-hcard-left.active').forEach(e=>e.classList.remove('active'));
  if (el) el.classList.add('active');
  const illus = (_D.boosters_data?.[ext.id]||[]).filter(il=>(il.product_type||'booster')==='booster');
  _renderIllusDetailPanel('booster-detail-panel', ext, bloc, illus, 'openAddIllus', 'Ajouter une illustration');
}

function openGoodieDetail(el, extId) {
  const ext = getExt(extId); if (!ext) return;
  const bloc = getBlocForExt(extId);
  _goodieDetail = { ext, bloc };
  document.querySelectorAll('.bea-hcard-left.active').forEach(e=>e.classList.remove('active'));
  if (el) el.classList.add('active');
  const illus = (_D.boosters_data?.[ext.id]||[]).filter(il=>(il.product_type||'booster')!=='booster');
  _renderIllusDetailPanel('goodie-detail-panel', ext, bloc, illus, 'openAddGoodie', 'Ajouter un goodie');
}

var PRODUCT_TYPE_LABELS = {booster:'Boosters',deck:'Decks',etb:'ETB',premium:'Premium',portfolio:'Portfolios',autre:'Autres'};
// Types affichés dans l'onglet Goodies (tout sauf 'booster', qui reste dans
// l'onglet Boosters — voir renderGoodies ci-dessous).
var GOODIE_TYPE_ORDER = ['deck','etb','premium','portfolio','autre'];

function setBoosterFilter(val, btn) {
  _boosterFilter = val;
  document.querySelectorAll('#view-boosters .booster-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBoosters();
}

// Recherche d'extension dans l'onglet Boosters (même logique de correspondance
// que filterExtensions : nom OU code, insensible à la casse) — un bloc entier
// disparaît de l'affichage s'il n'a plus aucune extension correspondante.
function filterBoosters(q) { _boosterSearchQuery = q; renderBoosters(); }

// `typeOrder` : ordre + liste des product_type à afficher dans ce groupe de
// sections (par défaut celui des Boosters) — même fonction pour Boosters et
// Goodies plutôt que deux copies qui pourraient diverger.
function buildGroupedIllus(container, illus, extId, typeOrder) {
  if (illus.length === 0) return;
  const groups = {};
  illus.forEach(il => {
    const t = il.product_type || 'booster';
    if (!groups[t]) groups[t] = [];
    groups[t].push(il);
  });
  const order = typeOrder || ['booster', 'deck', 'etb', 'premium', 'portfolio', 'autre'];
  const presentTypes = order.filter(t => groups[t] && groups[t].length > 0);
  // Each type = one horizontal section (label + row of cards), stacked vertically
  presentTypes.forEach((t, tIdx) => {
    if (tIdx > 0) {
      const sep = document.createElement('div');
      sep.className = 'illus-type-row-sep';
      container.appendChild(sep);
    }
    const section = document.createElement('div');
    section.className = 'illus-type-section';
    const label = document.createElement('div');
    label.className = 'illus-type-label';
    label.textContent = PRODUCT_TYPE_LABELS[t] || t;
    section.appendChild(label);
    const row = document.createElement('div');
    row.className = 'illus-type-row';
    groups[t].forEach(il => row.appendChild(buildIllusCard(il, extId)));
    section.appendChild(row);
    container.appendChild(section);
  });
}

function setGoodieFilter(val, btn) {
  _goodieFilter = val;
  document.querySelectorAll('#view-goodies .booster-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderGoodies();
}

// Recherche d'extension dans l'onglet Goodies — voir filterBoosters ci-dessus.
function filterGoodies(q) { _goodieSearchQuery = q; renderGoodies(); }

// Rendu générique partagé par Boosters et Goodies : même structure de grille
// accordéon/hcard/liste, seuls le sous-ensemble de product_type affiché, le
// conteneur ciblé et les id de stats changent selon `opts`.
function _renderIllusTab(opts) {
  const main = document.getElementById(opts.containerId);
  if (!main) return;
  const openUIDs = [...main.querySelectorAll('.bea-body.open')].map(e=>e.id);
  main.innerHTML = '';
  const bd = _D.boosters_data || {};
  const forTab = arr => (arr||[]).filter(il => opts.typeFilter(il.product_type||'booster'));

  let gT=0, gO=0;
  Object.values(bd).forEach(arr=>{ const a=forTab(arr); gT+=a.length; gO+=a.filter(il=>il.obtained!==false).length; });
  const gPct = gT>0?Math.round(gO/gT*100):0;
  document.getElementById(opts.stat.globalPct).textContent           = gPct+'%';
  document.getElementById(opts.stat.globalBar).style.width      = gPct+'%';
  document.getElementById(opts.stat.globalBar).style.background = pctBg(gPct);

  getBlocs().forEach(bloc => {
    let extsToShow = [
      ...(bloc.extensions||[]).map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true};}).filter(e=>e.sorti&&!e._hidden&&(e.stat_mode||'all')!=='cards_only'),
      ...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id&&(e.stat_mode||'all')!=='cards_only').map(e=>({...e,_custom:true}))
    ];
    if (opts.searchQuery) {
      const q = opts.searchQuery.toLowerCase();
      extsToShow = extsToShow.filter(e => e.nom.toLowerCase().includes(q) || e.code.toLowerCase().includes(q));
    }
    if (extsToShow.length===0) return;

    let bT=0,bO=0;
    extsToShow.forEach(e=>{ const a=forTab(bd[e.id]); bT+=a.length; bO+=a.filter(il=>il.obtained!==false).length; });
    const bPct=bT>0?Math.round(bO/bT*100):0;

    const blocUid = opts.uidPrefix + '_bloc_' + bloc.id;
    const section=document.createElement('div');
    section.className='booster-bloc';
    const blocLogoHtml=bloc.logo?`<img src="${bloc.logo}" class="bloc-logo-sm" alt="${bloc.short}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`:'';
    section.innerHTML=`
      <div class="booster-bloc-header" onclick="toggleAccordion('${blocUid}')" style="cursor:pointer">
        ${blocLogoHtml}
        <div class="bloc-color-dot" style="background:${bloc.couleur}"></div>
        <div class="booster-bloc-title">${bloc.nom}</div>
        <div class="booster-bloc-short">${bloc.short}</div>
        <div class="booster-bloc-pct-wrap">
          <div class="booster-pct-bar"><div class="booster-pct-fill" style="width:${bPct}%;background:${pctBg(bPct)}"></div></div>
          <span class="booster-pct-txt" style="color:${pctTxt(bPct)}">${bPct}%</span>
        </div>
        <div class="cer-chevron" id="chev-${blocUid}">▼</div>
      </div>
      <div id="${blocUid}" class="bea-bloc-body open">
        <div class="${_tabViewModes[opts.viewModeKey]==='grid'?'bea-grid':'bea-list'}" id="${opts.uidPrefix}-${bloc.id}"></div>
      </div>`;
    main.appendChild(section);

    const list=section.querySelector(`#${opts.uidPrefix}-${bloc.id}`);
    sortExts(extsToShow).forEach(ext=>{
      const allIllus=forTab(bd[ext.id]);
      const illus=opts.activeFilter==='all'?allIllus:allIllus.filter(il=>(il.product_type||'booster')===opts.activeFilter);
      const obtained=illus.filter(il=>il.obtained!==false).length;
      const uid=(opts.uidPrefix+'_'+ext.id).replace(/[^a-z0-9_]/gi,'_');
      const accentColor=extColor(ext);
      const extPct=illus.length>0?Math.round(obtained/illus.length*100):0;
      const logoSrc=ext.logo||bloc.logo||'';
      const addBtnAttrs = `data-ext-id="${ext.id}"${opts.kind==='goodie'?' data-kind="goodie"':''}`;

      const mode = _tabViewModes[opts.viewModeKey] || 'grid';
      if (mode === 'grid') {
        // Horizontal card: thumb left, illus grid right
        const card=document.createElement('div');
        card.className='bea-hcard';
        card.innerHTML=`
          <div class="bea-hcard-left" onclick="${opts.detailFn}(this,'${ext.id}')" style="cursor:pointer">
            <div class="bea-hcard-thumb">
              ${logoSrc?`<img src="${logoSrc}" alt="${ext.nom}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`:
                `<div class="bea-hcard-code" style="color:${accentColor}">${ext.code}</div>`}
            </div>
            <div class="bea-hcard-info">
              <div class="bea-hcard-code-txt" style="color:${accentColor}">${ext.code}</div>
              <div class="bea-hcard-name">${ext.nom}</div>
              <div class="bea-hcard-pct" style="color:${pctTxt(extPct)}">${obtained}/${illus.length}</div>
              <div class="bea-card-bar" style="margin-top:4px"><div style="width:${extPct}%;background:${pctBg(extPct)}"></div></div>
            </div>
          </div>
          <div class="bea-hcard-right">
            <div class="bea-body bea-hcard-illus open" id="${uid}">
              <div class="illus-grouped" id="ig-${uid}"></div>
              <button class="bea-add-btn" ${addBtnAttrs}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Ajouter
              </button>
            </div>
          </div>`;
        list.appendChild(card);
        // Populate grouped illus by product type
        const igEl = card.querySelector(`#ig-${uid}`);
        if (igEl) buildGroupedIllus(igEl, illus, ext.id, opts.typeOrder);
      } else {
        const row=document.createElement('div');
        row.className='bea-row';
        row.innerHTML=`
          <div class="bea-header" onclick="toggleAccordion('${uid}')">
            <div class="bea-accent" style="background:${accentColor}"></div>
            <div class="bea-logo-wrap">${extBadgeHtml(ext,bloc,'bea-logo-badge')}</div>
            <div class="bea-info">
              <div class="bea-code" style="color:${accentColor}">${ext.code}</div>
              <div class="bea-name">${ext.nom}</div>
            </div>
            <div class="bea-right">
              <div class="bea-ext-pct-wrap">
                <div class="booster-pct-bar" style="width:64px"><div class="booster-pct-fill" style="width:${extPct}%;background:${pctBg(extPct)}"></div></div>
                <span class="bea-pct-txt" style="color:${pctTxt(extPct)}">${obtained}/${illus.length}</span>
              </div>
            </div>
            <div class="bea-chevron" id="bchev-${uid}">▼</div>
          </div>
          <div class="bea-body" id="${uid}">
            <div class="illus-grouped" id="ig-${uid}"></div>
            <button class="bea-add-btn" ${addBtnAttrs}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une illustration
            </button>
          </div>`;
        list.appendChild(row);
      }

      // List mode: populate now (grid mode already populated above)
      if (mode !== 'grid') {
        const ig=section.querySelector(`#ig-${uid}`);
        if (ig) buildGroupedIllus(ig, illus, ext.id, opts.typeOrder);
      }
    });
  });

  openUIDs.forEach(uid=>{
    const b=document.getElementById(uid),c=document.getElementById('bchev-'+uid);
    if(b)b.classList.add('open'); if(c)c.classList.add('open');
  });

  let totalIllus=0,lastDate='',extCounts={};
  Object.entries(bd).forEach(([extId,arr])=>{
    const a=forTab(arr); if(!a.length)return; totalIllus+=a.length;
    extCounts[extId]=a.length;
    a.forEach(il=>{ if((il.date||'')>lastDate)lastDate=il.date; });
  });
  document.getElementById(opts.stat.total).textContent=totalIllus;
  document.getElementById(opts.stat.exts).textContent=Object.keys(extCounts).length;
  document.getElementById(opts.stat.last).textContent=lastDate||'—';
  const favId=Object.keys(extCounts).sort((a,b)=>extCounts[b]-extCounts[a])[0];
  document.getElementById(opts.stat.fav).textContent=favId?(getExt(favId)?.code||favId):'—';
}

function renderBoosters() {
  _renderIllusTab({
    containerId: 'boosters-main', typeFilter: pt => pt === 'booster', viewModeKey: 'boosters',
    uidPrefix: 'bea', kind: 'booster', activeFilter: _boosterFilter, typeOrder: ['booster'],
    detailFn: 'openBoosterDetail', searchQuery: _boosterSearchQuery,
    stat: { globalPct:'bs-global-pct', globalBar:'bs-global-bar-fill', total:'bs-total', exts:'bs-exts', fav:'bs-fav', last:'bs-last' },
  });
}

// Goodies : tout ce qui n'est PAS un booster (decks, ETB, coffrets premium,
// portfolios…) — mêmes extensions, même structure de grille/accordéon, table
// cloud "goodies" déjà séparée côté sync.js.
function renderGoodies() {
  _renderIllusTab({
    containerId: 'goodies-main', typeFilter: pt => pt !== 'booster', viewModeKey: 'goodies',
    uidPrefix: 'goo', kind: 'goodie', activeFilter: _goodieFilter, typeOrder: GOODIE_TYPE_ORDER,
    detailFn: 'openGoodieDetail', searchQuery: _goodieSearchQuery,
    stat: { globalPct:'gs-global-pct', globalBar:'gs-global-bar-fill', total:'gs-total', exts:'gs-exts', fav:'gs-fav', last:'gs-last' },
  });
}

function buildIllusCard(il,extId) {
  const obtained=il.obtained!==false;
  const card=document.createElement('div');
  card.className='illus-card'+(obtained?'':' illus-missing');
  // Clicking the card body (not the overlay) opens illustration detail panel
  card.addEventListener('click', e => {
    if (!e.target.closest('.illus-card-overlay')) {
      openIllusDetail(il, extId);
    }
  });
  const imgHtml=il.img?`<img src="${il.img}" alt="${il.desc||''}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`:''
  const ph=!il.img?`<div class="illus-card-placeholder">${il.desc||'—'}</div>`:''
  card.innerHTML=`
    ${imgHtml}${ph}
    <div class="illus-card-overlay">
      <button class="illus-btn illus-btn-toggle ${obtained?'obtained':'missing'}"
        onclick="toggleIllusObtained('${extId}','${il.id}')" title="${obtained?'Non-obtenu':'Obtenu'}">
        ${obtained?'✓':'?'}
      </button>
      <button class="illus-btn illus-btn-edit" onclick="openEditIllus('${extId}','${il.id}')" title="Modifier">✏</button>
      <button class="illus-btn illus-btn-del" onclick="deleteIllus('${extId}','${il.id}')" title="Supprimer">✕</button>
    </div>
    <div class="illus-card-date">${il.date||''}</div>`;
  return card;
}

// Open detail for a specific illustration (image, desc, date, status + ext info)
function openIllusDetail(il, extId) {
  const ext   = getExt(extId); if (!ext) return;
  const bloc  = getBlocForExt(extId);
  const color  = extColor(ext);
  const logoSrc  = ext.logo  || bloc.logo  || '';
  const sigleSrc = ext.sigle || bloc?.sigle || '';
  const obtained = il.obtained !== false;
  // Une illustration "booster" vit dans le panneau Boosters, tout le reste
  // (deck/etb/premium/portfolio/autre) dans celui de Goodies.
  const isGoodie = (il.product_type||'booster') !== 'booster';
  const panelId  = isGoodie ? 'goodie-detail-panel' : 'booster-detail-panel';
  const backFn   = isGoodie ? 'openGoodieDetail' : 'openBoosterDetail';
  const panel = document.getElementById(panelId); if (!panel) return;

  // Highlight the clicked card
  document.querySelectorAll('.illus-card.active-detail').forEach(e=>e.classList.remove('active-detail'));
  // Find and highlight (best effort)
  document.querySelectorAll('.illus-card').forEach(c=>{
    const delBtn = c.querySelector(`.illus-btn-del[onclick*="${il.id}"]`);
    if(delBtn) c.classList.add('active-detail');
  });

  panel.innerHTML = `
    <div class="bpd-illus-header">
      ${il.img
        ? `<div class="bpd-illus-img-wrap"><img src="${il.img}" alt="${il.desc||''}" data-fallback-text="${_escHtml(il.desc||'—')}" onerror="_nasImgRetry(this,_illusDetailImgGiveUp)"></div>`
        : `<div class="bpd-illus-noimg">${il.desc||'—'}</div>`}
    </div>
    <div class="bpd-illus-meta">
      <div class="bpd-illus-desc">${il.desc||'—'}</div>
      <div class="bpd-illus-date" style="color:var(--text2)">${il.date||''}</div>
      <div class="bpd-illus-type-badge">${PRODUCT_TYPE_LABELS[il.product_type||'booster']||'Booster'}</div>
      <div class="bpd-illus-status" style="color:${obtained?'var(--green)':'var(--accent)'}">
        ${obtained?'✓ Obtenu':'? Non obtenu'}
      </div>
    </div>
    <div class="bpd-illus-actions">
      <button class="btn btn-sm ${obtained?'btn-success':'btn-secondary'}"
        data-action="toggle-illus" data-ext-id="${extId}" data-il-id="${il.id}">
        ${obtained?'Marquer non-obtenu':'Marquer obtenu'}
      </button>
      <button class="btn btn-sm btn-secondary"
        data-action="edit-illus" data-ext-id="${extId}" data-il-id="${il.id}">✏ Modifier</button>
      <button class="btn btn-sm btn-danger"
        data-action="delete-illus" data-ext-id="${extId}" data-il-id="${il.id}">✕ Supprimer</button>
    </div>
    <div class="bpd-illus-ext">
      <div class="bpd-header" style="padding:12px 16px;border-top:1px solid var(--border);cursor:pointer"
           onclick="${backFn}(null,'${extId}')">
        <div class="panel-logo-zone bpd-ext-logo" style="border-color:${color};width:48px;height:48px">
          ${logoSrc?`<img class="panel-logo-main" src="${logoSrc}" alt="${ext.code}" onerror="_nasImgRetry(this,img=>img.style.display='none')">`:
            `<div class="panel-logo-placeholder" style="color:${color};font-size:.8rem">${ext.code}</div>`}
          ${sigleSrc?`<div class="panel-sigle-badge"><img src="${sigleSrc}" alt="sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')"></div>`:''}
        </div>
        <div class="bpd-info" style="margin-left:8px">
          <div class="bpd-code" style="color:${color}">${ext.code}</div>
          <div class="bpd-name" style="font-size:.78rem">${ext.nom}</div>
          <div class="bpd-bloc" style="font-size:.68rem">${bloc.nom}</div>
        </div>
        <div style="margin-left:auto;font-size:.65rem;color:var(--text3)">Voir ext. ▶</div>
      </div>
    </div>`;
  panel.classList.add('open');
}

// Callback de repli pour la vignette d'illustration (mode liste, voir
// buildIllusRow) qui a définitivement échoué à charger après les tentatives
// de _nasImgRetry (core.js) — reproduit le même placeholder (première
// lettre de la description) que l'état "pas d'image", lu depuis l'attribut
// data- posé au rendu plutôt que reconstruit ici (évite d'imbriquer du HTML
// échappé dans l'attribut onerror lui-même).
function _illusImgGiveUp(img) {
  const letter = img.dataset.fallbackLetter || '?';
  img.outerHTML = `<div class="illus-row-noimg">${_escHtml(letter)}</div>`;
}

// Même principe pour le grand panneau détail d'une illustration
// (openIllusDetail) — remplace le wrapper entier par le même placeholder
// "pas d'image" (texte complet de la description, pas juste sa 1re lettre,
// puisque ce panneau a plus de place).
function _illusDetailImgGiveUp(img) {
  const text = img.dataset.fallbackText || '—';
  const wrap = img.closest('.bpd-illus-img-wrap');
  const target = wrap || img;
  target.outerHTML = `<div class="bpd-illus-noimg">${_escHtml(text)}</div>`;
}

function buildIllusRow(il,extId) {
  const obtained=il.obtained!==false;
  const row=document.createElement('div');
  row.className='illus-row'+(obtained?'':' illus-missing');
  row.addEventListener('click', e => {
    if (!e.target.closest('.illus-row-actions')) openIllusDetail(il, extId);
  });
  row.style.cursor='pointer';
  row.innerHTML=`
    <div class="illus-row-thumb">
      ${il.img?`<img src="${il.img}" alt="" data-fallback-letter="${_escHtml(il.desc?il.desc[0]:'?')}" onerror="_nasImgRetry(this,_illusImgGiveUp)">`:
        `<div class="illus-row-noimg">${il.desc?il.desc[0]:'?'}</div>`}
    </div>
    <div class="illus-row-info">
      <div class="illus-row-desc">${il.desc||'—'}</div>
      <div class="illus-row-date">${il.date||''}</div>
    </div>
    <div class="illus-row-actions">
      <button class="btn btn-sm ${obtained?'btn-success':'btn-secondary'}"
        onclick="toggleIllusObtained('${extId}','${il.id}')">
        ${obtained?'✓ Obtenu':'? Non obtenu'}
      </button>
      <button class="btn btn-icon btn-sm" onclick="openEditIllus('${extId}','${il.id}')" title="Modifier">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="btn btn-icon btn-sm btn-danger" onclick="deleteIllus('${extId}','${il.id}')">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>`;
  return row;
}

function toggleIllusObtained(extId,ilId) {
  const arr=(_D.boosters_data||{})[extId]; if(!arr)return;
  const il=arr.find(i=>i.id===ilId); if(!il)return;
  il.obtained=il.obtained===false?true:false;
  if(il.obtained&&!il.date) il.date=new Date().toISOString().slice(0,10);
  saveData(); renderBoosters(); renderStats();
}

function openAddIllus(extId,extNom) {
  _illusExtId=extId; _illusEditId=null;
  document.getElementById('modal-illus-title').textContent    = 'Ajouter une illustration';
  document.getElementById('modal-illus-ext-name').textContent = extNom;
  document.getElementById('illus-desc').value    = '';
  document.getElementById('illus-img').value     = '';
  document.getElementById('illus-date').value    = '';
  document.getElementById('illus-obtained').checked = false;
  const ptEl = document.getElementById('illus-product-type');
  if (ptEl) ptEl.value = 'booster';
  toggleIllusDate(false);
  document.getElementById('modal-add-illus').classList.add('open');
}

// Même modale que Boosters (réutilisation totale : champs, sauvegarde,
// suppression…), seul le type de produit par défaut change pour ne pas avoir
// à le resélectionner à chaque ajout depuis l'onglet Goodies.
function openAddGoodie(extId,extNom) {
  openAddIllus(extId, extNom);
  document.getElementById('modal-illus-title').textContent = 'Ajouter un goodie';
  const ptEl = document.getElementById('illus-product-type');
  if (ptEl) ptEl.value = 'deck';
}

function openEditIllus(extId,ilId) {
  const arr=(_D.boosters_data||{})[extId]; if(!arr)return;
  const il=arr.find(i=>i.id===ilId); if(!il)return;
  _illusExtId=extId; _illusEditId=ilId;
  const extObj=getExt(extId);
  document.getElementById('modal-illus-title').textContent    = 'Modifier l\'illustration';
  document.getElementById('modal-illus-ext-name').textContent = extObj?extObj.nom:extId;
  document.getElementById('illus-desc').value    = il.desc||'';
  document.getElementById('illus-img').value     = il.img||'';
  document.getElementById('illus-obtained').checked = il.obtained!==false;
  document.getElementById('illus-date').value    = il.date||'';
  const ptEdit=document.getElementById('illus-product-type'); if(ptEdit) ptEdit.value=il.product_type||'booster';
  toggleIllusDate(il.obtained!==false);
  document.getElementById('modal-add-illus').classList.add('open');
}

function toggleIllusDate(show) {
  document.getElementById('illus-date-field').style.display = show?'':'none';
}

function confirmAddIllus() {
  if(!_illusExtId)return;
  const desc=document.getElementById('illus-desc').value.trim();
  const img=document.getElementById('illus-img').value.trim();
  const obtained=document.getElementById('illus-obtained').checked;
  const date=obtained?document.getElementById('illus-date').value:'';
  if(!desc&&!img){toast('Ajoutez une description ou une image.','error');return;}
  if(!_D.boosters_data)_D.boosters_data={};
  if(!_D.boosters_data[_illusExtId])_D.boosters_data[_illusExtId]=[];
  const ptEl=document.getElementById('illus-product-type');
  const product_type=ptEl?ptEl.value:'booster';
  if(_illusEditId){
    const il=_D.boosters_data[_illusExtId].find(i=>i.id===_illusEditId);
    if(il)Object.assign(il,{desc,img,obtained,date,product_type});
    toast('Illustration mise à jour !','success');
  } else {
    _D.boosters_data[_illusExtId].push({id:'il_'+Date.now(),desc,img,obtained,date,product_type});
    toast('Illustration ajoutée !','success');
  }
  saveData(); renderAll(); closeModal('modal-add-illus');
}

function deleteIllus(extId,ilId) {
  if(!_D.boosters_data?.[extId])return;
  _D.boosters_data[extId]=_D.boosters_data[extId].filter(il=>il.id!==ilId);
  saveData(); renderAll(); toast('Illustration supprimée.','success');
}

