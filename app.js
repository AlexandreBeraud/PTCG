// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — app.js
// ═══════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'ptcg_collection';
let _D = null;

// ── UI state ───────────────────────────────────────────────────────────────
let _currentExt      = null;
let _showNonSorti    = false;
let _searchQuery     = '';
// Per-tab view modes
const _tabViewModes = { extensions:'grid', classeurs:'grid', boosters:'grid', edition:'grid' };
let _currentView = 'extensions';
// Backward compat helper
function _viewMode() { return _tabViewModes[_currentView] || 'grid'; }
let _extSortDir      = 'asc';    // 'asc' | 'desc' — shared across all ext views

// Edition
let _editionTab      = 'blocs';
let _editingBlocId   = null;
let _editingExtId    = null;
let _editingIsCustom = false;

// Classeur drag & drop
// dragKey format: "classeurId::extIdx" (index within classeur extensions array)
let _dragKey             = null;
let _dragOverClasseurId  = null;
let _dragOverIdx         = null;
// Drag classeur reorder
let _dragClasseurId      = null;

// Booster
let _illusExtId      = null;
let _illusEditId     = null;
let _boosterDetail   = null;
let _boosterFilter   = 'all';

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  initCloud();
  setDefaultDate();
  // Always hide loading screen even if renderAll threw
  const hideLoading = () => {
    const l = document.getElementById('loading');
    if (l) { l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 300); }
  };
  setTimeout(hideLoading, 100);
  document.querySelectorAll('.modal-backdrop').forEach(el =>
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); })
  );
  // Delegated handlers — avoids apostrophe/escaping issues in onclick
  document.addEventListener('click', e => {
    // bea-add-btn
    const addBtn = e.target.closest('.bea-add-btn[data-ext-id]');
    if (addBtn) {
      const extId = addBtn.dataset.extId;
      const ext   = getExt(extId);
      if (ext) openAddIllus(extId, ext.nom);
      return;
    }
    // illus panel action buttons
    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      const extId  = actionBtn.dataset.extId;
      const ilId   = actionBtn.dataset.ilId;
      if (action === 'toggle-illus') {
        toggleIllusObtained(extId, ilId);
        // Re-open detail with refreshed data
        const bd = _D.boosters_data || {};
        const il = (bd[extId]||[]).find(i=>i.id===ilId);
        if (il) openIllusDetail(il, extId);
      } else if (action === 'edit-illus') {
        openEditIllus(extId, ilId);
      } else if (action === 'delete-illus') {
        deleteIllus(extId, ilId);
      }
      return;
    }
  });
});

// ── Persistence ────────────────────────────────────────────────────────────
function loadData() {
  const fresh = () => {
    _D = {
      _v: 1, _ts: 0,
      _tpl_blocs:    [],
      collection:    {},
      classeurs:     [],
      boosters_data: {},
      custom_exts:   [],
      ext_overrides: {},
      bloc_overrides:{},
      custom_blocs:  [],
      settings:      { display_mode: 'logo' }
    };
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate: if old data had built-in blocs saved, discard them (template is now empty)
      _D = parsed;
      delete _D.blocs; // never store built-in blocs
      _D._tpl_blocs    = window.__PC_DATA__.blocs; // always []
      if (!_D.custom_blocs)   _D.custom_blocs   = [];
      if (!_D.collection)     _D.collection     = {};
      if (!_D.classeurs)      _D.classeurs      = [];
      if (!_D.boosters_data)  _D.boosters_data  = {};
      if (!_D.custom_exts)    _D.custom_exts    = [];
      if (!_D.ext_overrides)  _D.ext_overrides  = {};
      if (!_D.bloc_overrides) _D.bloc_overrides = {};
      if (!_D.settings)       _D.settings       = { display_mode: 'logo' };
      // Discard old ext_overrides and bloc_overrides that referenced built-in IDs
      // (they're meaningless now that template is empty)
    } else {
      fresh();
    }
  } catch (e) {
    fresh();
  }
  try {
    renderAll();
  } catch(err) {
    console.error('[PTCG] renderAll crashed:', err);
  }
}

function saveData() {
  _D._ts = Date.now();
  const s = { ..._D };
  delete s._tpl_blocs; delete s.blocs;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function renderAll() {
  const safe = (fn, name) => { try { fn(); } catch(e) { console.error('[PTCG] '+name+' crashed:', e.message, e.stack?.split('\n')[1]); } };
  safe(renderExtensions,    'renderExtensions');
  safe(renderClasseurs,     'renderClasseurs');
  safe(renderBoosters,      'renderBoosters');
  safe(renderEdition,       'renderEdition');
  safe(renderStats,         'renderStats');
  safe(updateGlobalProgress,'updateGlobalProgress');
  safe(updateBadges,        'updateBadges');
  setTimeout(applyRainbow, 0);
}

function applyRainbow() {
  // Bars at 100%
  document.querySelectorAll('.ext-card-bar-fill, .ext-row-bar-fill, .bloc-progress-fill, .detail-prog-fill, .cer-bar-fill, .classeur-global-fill, .clr-bar-fill, .booster-pct-fill, .stats-bloc-fill, .stats-top-fill, .sbc-fill, .topbar-progress-fill').forEach(el => {
    const w = parseFloat(el.style.width) || 0;
    el.classList.toggle('rainbow-bar', w >= 100);
    if (w >= 100) el.style.background = '';
  });
  // Text at 100%
  document.querySelectorAll('.ext-card-pct, .ext-row-pct, .cer-pct, .clr-pct, .bloc-progress-txt, .booster-pct-txt, .bea-pct-txt, .stats-bloc-pct, .stats-top-pct, [id="d-pct"], [id="global-pct"]').forEach(el => {
    el.classList.toggle('rainbow-txt', parseFloat(el.textContent) >= 100);
  });
  // Ext card border at 100%
  document.querySelectorAll('.ext-card').forEach(card => {
    const fill = card.querySelector('.ext-card-bar-fill');
    card.classList.toggle('rainbow-border', fill && parseFloat(fill.style.width) >= 100);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getBlocs() {
  const tpl = (_D._tpl_blocs || window.__PC_DATA__.blocs).map(b => {
    const ov = (_D.bloc_overrides || {})[b.id] || {};
    return { ...b, ...ov, _builtin: true };
  }).filter(b => !b._hidden);
  const custom = (_D.custom_blocs || []).map(b => ({ ...b, _custom_bloc: true }));
  const all = [...tpl, ...custom];
  const order = _D.settings?.bloc_order || [];
  if (order.length) {
    all.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return all;
}

function getAllExtensions() {
  const builtIn = getBlocs().filter(b => b._builtin).flatMap(b =>
    (b.extensions || []).map(e => {
      const ov = (_D.ext_overrides || {})[e.id] || {};
      return { ...e, ...ov, _builtin: true };
    }).filter(e => !e._hidden)
  );
  const custom = (_D.custom_exts || []).map(e => ({ ...e, _custom: true }));
  return [...builtIn, ...custom];
}

function getExt(id) { return getAllExtensions().find(e => e.id === id); }

function getBlocForExt(extId) {
  // Check if a bloc override exists for this built-in ext
  const ov = (_D.ext_overrides || {})[extId];
  if (ov && ov.bloc_id_override) {
    const overrideBloc = getBlocs().find(b => b.id === ov.bloc_id_override);
    if (overrideBloc) return overrideBloc;
  }
  for (const b of getBlocs()) {
    if ((b.extensions || []).find(e => e.id === extId)) return b;
  }
  const ce = (_D.custom_exts || []).find(e => e.id === extId);
  if (ce) {
    const b = getBlocs().find(b => b.id === ce.bloc_id);
    return b || { id:'cx', couleur: ce.couleur||'#888', nom:'Custom', short:'CX', logo:'' };
  }
  return { id:'?', couleur:'#888', nom:'—', short:'—', logo:'' };
}

function extColor(ext) {
  if (ext.couleur) return ext.couleur;
  return getBlocForExt(ext.id)?.couleur || '#888';
}

function ownedCount(extId) {
  return Object.values(_D.collection[extId] || {}).filter(c => c?.owned).length;
}

// Progress colour only (for bars/text) — NOT used on card border
function pctColor(pct) {
  if (pct >= 100) return 'rainbow';
  if (pct >= 75)  return 'hsl(140,70%,48%)';
  if (pct >= 40)  return `hsl(${50 + pct},80%,50%)`;
  if (pct >= 10)  return `hsl(${pct * 1.2},75%,50%)`;
  return '#555e80';
}
function pctBg(pct)  { const c=pctColor(pct); return c==='rainbow'?'#a855f7':c; }
function pctTxt(pct) { const c=pctColor(pct); return c==='rainbow'?'#a855f7':c; }

// Count visible extensions for a bloc (excl hidden, incl custom)
function extCountForBloc(bloc) {
  const builtIn = (bloc.extensions||[]).filter(e => {
    const ov = (_D.ext_overrides||{})[e.id]||{};
    return !ov._hidden && (!ov.bloc_id_override || ov.bloc_id_override === bloc.id);
  }).length;
  const moved = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).reduce((a,b)=>{
    return a + (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return !ov._hidden&&ov.bloc_id_override===bloc.id;}).length;
  }, 0);
  const custom = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id).length;
  return builtIn + moved + custom;
}

function sortExts(arr) {
  return [...arr].sort((a, b) => {
    const cmp = (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true });
    return _extSortDir === 'asc' ? cmp : -cmp;
  });
}

// extBadgeHtml: shows sigle image (ext.sigle) if available, else logo, else code text
// Used everywhere an ext identifier is shown inline
function extBadgeHtml(ext, bloc, sizeClass = '') {
  const sigleSrc = ext.sigle || bloc?.sigle || '';
  const color    = extColor(ext);
  const code     = ext.code || '';
  if (sigleSrc) {
    return `<img src="${sigleSrc}" alt="${code}" class="ext-inline-logo ${sizeClass}"
      onerror="this.style.display='none';this.nextSibling&&(this.nextSibling.style.display='inline')">
      <span class="ext-inline-code" style="color:${color};display:none">${code}</span>`;
  }
  return `<span class="ext-inline-code ${sizeClass}" style="color:${color}">${code}</span>`;
}

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
      ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="this.style.display='none'">`
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
      ${logoSrc ? `<img src="${logoSrc}" alt="${ext.nom}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
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
      ${ext.logo||bloc.logo ? `<img src="${ext.logo||bloc.logo}" alt="${ext.nom}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">` : ''}
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
  document.getElementById('sort-icon').textContent = _extSortDir === 'asc' ? '↑' : '↓';
  if(!_D.settings) _D.settings={};
  _D.settings.sort_dir = _extSortDir;
  saveData();
  renderAll();
}

function setViewMode(mode, btn) {
  _tabViewModes[_currentView] = mode;
  document.querySelectorAll('.view-toggle button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  if(!_D.settings) _D.settings={};
  if(!_D.settings.tab_view_modes) _D.settings.tab_view_modes={};
  _D.settings.tab_view_modes[_currentView] = mode;
  saveData();
  renderAll();
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
  document.getElementById('nb-boosters').textContent  = Object.values(bd).reduce((a,arr)=>a+(arr?arr.length:0),0);
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
          ? `<img class="detail-logo-img" src="${logoSrc}" alt="${ext.code}" onerror="this.style.display='none'">`
          : `<div class="detail-logo-placeholder" style="color:${color}">${ext.code}</div>`}
        ${sigleSrcDetail
          ? `<div class="detail-sigle-badge"><img src="${sigleSrcDetail}" alt="sigle" onerror="this.style.display='none'"></div>`
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
  const sigleDisplayHtml = sigleSrc2 ? `<strong><img src="${sigleSrc2}" class="detail-info-sigle" onerror="this.style.display='none'"></strong>` : '<strong>—</strong>';
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
      ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="this.style.display='none'">`
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

function classeurStats(cl) {
  const spp = cl.slots_par_page || 18;
  const totalSlots = cl.pages * spp;
  let filled = 0;
  (cl.extensions || []).forEach(ce => filled += Math.min(ce.filled||0, (ce.pages||0)*spp));
  const rawPct = totalSlots > 0 ? Math.round(filled/totalSlots*100) : 0;
  const pct = cl.complete ? 100 : rawPct;
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

  card.innerHTML = `
    <div class="classeur-card-top" style="${topBg}">
      ${!cl.image ? '<span class="classeur-card-icon">📗</span>' : ''}
      <div class="classeur-drag-handle" title="Réorganiser">⠿</div>
      <div class="classeur-top-info">
        <div class="classeur-card-name">${cl.nom}</div>
        <div class="classeur-card-meta">${cl.pages} p · ${spp} slots/p${bloc?' · '+bloc.short:''}</div>
        ${cl.complete ? '<div class="classeur-complete-badge">✓ Complet</div>' : ''}
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
        <div class="classeur-global-txt"><span>${filled}/${totalSlots} slots</span><span style="color:${pctTxt(pct)}">${pct}%</span></div>
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
  const completeBadge = cl.complete ? '<span class="clr-complete-badge">✓ Complet</span>' : '';
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
  document.getElementById('classeur-complete').checked    = false;
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
  const complete = document.getElementById('classeur-complete').checked;
  if (!nom) { toast('Veuillez saisir un nom.','error'); return; }
  const editId = modal.dataset.editId;
  if (editId) {
    const cl = _D.classeurs.find(c=>c.id===editId);
    if (cl) { cl.nom=nom; cl.pages=pages; cl.slots_par_page=slots; cl.image=image; cl.bloc_id=bloc_id; cl.complete=complete; }
    toast('Classeur mis à jour !','success');
  } else {
    _D.classeurs.push({ id:'cl_'+Date.now(), nom, pages, slots_par_page:slots, image, bloc_id, complete:false, extensions:[] });
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
  document.getElementById('classeur-complete').checked   = cl.complete||false;
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
  const existingIds = (cl.extensions||[]).map(e=>e.ext_id);
  const sel = document.getElementById('add-ext-classeur-select');
  sel.innerHTML = '<option value="">— Choisir —</option>';
  let lastBloc = '';
  getAllExtensions().filter(e=>(e.sorti||e._custom)&&!existingIds.includes(e.id)).forEach(e=>{
    const b=getBlocForExt(e.id); const bName=b?b.nom:'Custom';
    if (bName!==lastBloc) { sel.appendChild(Object.assign(document.createElement('optgroup'),{label:bName})); lastBloc=bName; }
    sel.lastChild.appendChild(Object.assign(document.createElement('option'),{value:e.id,textContent:`${e.code} – ${e.nom}`}));
  });
  document.getElementById('add-ext-classeur-pages').value  = 10;
  document.getElementById('add-ext-classeur-cartes').value = 10*(cl.slots_par_page||18);
  document.getElementById('modal-add-ext-classeur').classList.add('open');
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
  cl.extensions.push({ ext_id:extId, pages, filled:0 });
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
function openBoosterDetail(el, extId) {
  const ext = getExt(extId); if (!ext) return;
  const bloc = getBlocForExt(extId);
  _boosterDetail = { ext, bloc };

  document.querySelectorAll('.bea-hcard-left.active').forEach(e=>e.classList.remove('active'));
  if (el) el.classList.add('active');

  const panel = document.getElementById('booster-detail-panel');
  const color    = extColor(ext);
  const logoSrc  = ext.logo  || bloc.logo  || '';
  const sigleSrc = ext.sigle || bloc?.sigle || '';
  const bd = _D.boosters_data || {};
  const illus = bd[ext.id] || [];
  const obtained = illus.filter(il=>il.obtained!==false).length;
  const pct = illus.length>0?Math.round(obtained/illus.length*100):0;

  // Logo zone: large logo + sigle badge bottom-right
  const logoZoneHtml = `
    <div class="bpd-logo-zone" style="border-color:${color}">
      ${logoSrc
        ? `<img class="bpd-logo-main" src="${logoSrc}" alt="${ext.code}" onerror="this.style.display='none'">`
        : `<div class="bpd-logo-placeholder" style="color:${color}">${ext.code}</div>`}
      ${sigleSrc
        ? `<div class="bpd-sigle-badge"><img src="${sigleSrc}" alt="sigle" onerror="this.style.display='none'"></div>`
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
      <button class="bea-add-btn" onclick="openAddIllus('${ext.id}','${ext.nom}')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Ajouter une illustration
      </button>
    </div>`;
  panel.classList.add('open');
}

const PRODUCT_TYPE_LABELS = {booster:'Boosters',deck:'Decks',etb:'ETB',premium:'Premium'};

function setBoosterFilter(val, btn) {
  _boosterFilter = val;
  document.querySelectorAll('.booster-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderBoosters();
}

function buildGroupedIllus(container, illus, extId) {
  if (illus.length === 0) return;
  const groups = {};
  illus.forEach(il => {
    const t = il.product_type || 'booster';
    if (!groups[t]) groups[t] = [];
    groups[t].push(il);
  });
  const typeOrder = ['booster', 'deck', 'etb', 'premium'];
  const presentTypes = typeOrder.filter(t => groups[t] && groups[t].length > 0);
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

function renderBoosters() {
  const main = document.getElementById('boosters-main');
  const openUIDs = [...main.querySelectorAll('.bea-body.open')].map(e=>e.id);
  main.innerHTML = '';
  const bd = _D.boosters_data || {};

  let gT=0, gO=0;
  Object.values(bd).forEach(arr=>{ if(!arr)return; gT+=arr.length; gO+=arr.filter(il=>il.obtained!==false).length; });
  const gPct = gT>0?Math.round(gO/gT*100):0;
  document.getElementById('bs-global-pct').textContent           = gPct+'%';
  document.getElementById('bs-global-bar-fill').style.width      = gPct+'%';
  document.getElementById('bs-global-bar-fill').style.background = pctBg(gPct);

  getBlocs().forEach(bloc => {
    const extsToShow = [
      ...(bloc.extensions||[]).map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true};}).filter(e=>e.sorti&&!e._hidden&&(e.stat_mode||'all')!=='cards_only'),
      ...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id&&(e.stat_mode||'all')!=='cards_only').map(e=>({...e,_custom:true}))
    ];
    if (extsToShow.length===0) return;

    let bT=0,bO=0;
    extsToShow.forEach(e=>{ const arr=bd[e.id]||[]; bT+=arr.length; bO+=arr.filter(il=>il.obtained!==false).length; });
    const bPct=bT>0?Math.round(bO/bT*100):0;

    const blocUid = 'booster_bloc_' + bloc.id;
    const section=document.createElement('div');
    section.className='booster-bloc';
    const blocLogoHtml=bloc.logo?`<img src="${bloc.logo}" class="bloc-logo-sm" alt="${bloc.short}" onerror="this.style.display='none'">`:'';
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
        <div class="${_tabViewModes['boosters']==='grid'?'bea-grid':'bea-list'}" id="bea-${bloc.id}"></div>
      </div>`;
    main.appendChild(section);

    const list=section.querySelector(`#bea-${bloc.id}`);
    sortExts(extsToShow).forEach(ext=>{
      const allIllus=bd[ext.id]||[];
      const illus=_boosterFilter==='all'?allIllus:allIllus.filter(il=>(il.product_type||'booster')===_boosterFilter);
      const obtained=illus.filter(il=>il.obtained!==false).length;
      const uid=('bea_'+ext.id).replace(/[^a-z0-9_]/gi,'_');
      const accentColor=extColor(ext);
      const extPct=illus.length>0?Math.round(obtained/illus.length*100):0;
      const logoSrc=ext.logo||bloc.logo||'';

      const boosterMode = _tabViewModes['boosters'] || 'grid';
      if (boosterMode === 'grid') {
        // Horizontal card: thumb left, illus grid right
        const card=document.createElement('div');
        card.className='bea-hcard';
        card.innerHTML=`
          <div class="bea-hcard-left" onclick="openBoosterDetail(this,'${ext.id}')" style="cursor:pointer">
            <div class="bea-hcard-thumb">
              ${logoSrc?`<img src="${logoSrc}" alt="${ext.nom}" onerror="this.style.display='none'">`:
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
              <button class="bea-add-btn" data-ext-id="${ext.id}">
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
        if (igEl) buildGroupedIllus(igEl, illus, ext.id);
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
            <button class="bea-add-btn" data-ext-id="${ext.id}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Ajouter une illustration
            </button>
          </div>`;
        list.appendChild(row);
      }

      // List mode: populate now (grid mode already populated above)
      if (boosterMode !== 'grid') {
        const ig=section.querySelector(`#ig-${uid}`);
        if (ig) buildGroupedIllus(ig, illus, ext.id);
      }
    });
  });

  openUIDs.forEach(uid=>{
    const b=document.getElementById(uid),c=document.getElementById('bchev-'+uid);
    if(b)b.classList.add('open'); if(c)c.classList.add('open');
  });

  let totalIllus=0,lastDate='',extCounts={};
  Object.entries(bd).forEach(([extId,arr])=>{
    if(!arr)return; totalIllus+=arr.length;
    if(arr.length>0)extCounts[extId]=arr.length;
    arr.forEach(il=>{ if((il.date||'')>lastDate)lastDate=il.date; });
  });
  document.getElementById('bs-total').textContent=totalIllus;
  document.getElementById('bs-exts').textContent=Object.keys(extCounts).length;
  document.getElementById('bs-last').textContent=lastDate||'—';
  const favId=Object.keys(extCounts).sort((a,b)=>extCounts[b]-extCounts[a])[0];
  document.getElementById('bs-fav').textContent=favId?(getExt(favId)?.code||favId):'—';
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
  const imgHtml=il.img?`<img src="${il.img}" alt="${il.desc||''}" onerror="this.style.display='none'">`:''
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
  const panel = document.getElementById('booster-detail-panel');

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
        ? `<div class="bpd-illus-img-wrap"><img src="${il.img}" alt="${il.desc||''}"></div>`
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
           onclick="openBoosterDetail(null,'${extId}')">
        <div class="panel-logo-zone bpd-ext-logo" style="border-color:${color};width:48px;height:48px">
          ${logoSrc?`<img class="panel-logo-main" src="${logoSrc}" alt="${ext.code}" onerror="this.style.display='none'">`:
            `<div class="panel-logo-placeholder" style="color:${color};font-size:.8rem">${ext.code}</div>`}
          ${sigleSrc?`<div class="panel-sigle-badge"><img src="${sigleSrc}" alt="sigle" onerror="this.style.display='none'"></div>`:''}
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
      ${il.img?`<img src="${il.img}" alt="">`:
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
  toggleIllusDate(false);
  document.getElementById('modal-add-illus').classList.add('open');
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

// ── Édition ────────────────────────────────────────────────────────────────
function renderEdition() {
  populateBlocSelect();
  renderEditionList();
}

function renderEditionList() {
  const list=document.getElementById('edition-list');
  list.innerHTML='';

  if (_editionTab==='blocs') {
    const items = sortExts(getBlocs().map(b=>({type:'bloc',...b})));
    if (items.length===0){list.innerHTML='<div class="empty-state"><p>Aucun bloc.</p></div>';return;}
    const edMode = _tabViewModes['edition'] || 'grid';
    if (edMode==='grid') {
      const grid=document.createElement('div'); grid.className='edition-grid';
      items.forEach(b=>{
        const el=buildEditionBlocCard(b);
        el.draggable=true; el.dataset.blocId=b.id;
        el.addEventListener('dragstart',onBlocDragStart);
        el.addEventListener('dragover',onBlocDragOver);
        el.addEventListener('drop',onBlocDrop);
        grid.appendChild(el);
      });
      list.appendChild(grid);
    } else {
      items.forEach(b=>{
        const el=buildEditionBlocRow(b);
        el.draggable=true; el.dataset.blocId=b.id;
        el.addEventListener('dragstart',onBlocDragStart);
        el.addEventListener('dragover',onBlocDragOver);
        el.addEventListener('drop',onBlocDrop);
        list.appendChild(el);
      });
    }
    return;
  }

  // Extensions tab — grouped by bloc, each bloc collapsible
  getBlocs().forEach(bloc => {
    // Include built-in exts (with their current bloc via override check)
    const builtInExts = (bloc.extensions||[]).filter(e => {
      const ov = (_D.ext_overrides||{})[e.id]||{};
      return !ov.bloc_id_override || ov.bloc_id_override === bloc.id;
    }).map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true,_bloc:bloc};});
    // Include built-in exts from other blocs moved here
    const movedHere = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).flatMap(b=>
      (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return ov.bloc_id_override===bloc.id;})
        .map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true,_bloc:bloc};})
    );
    const customExts = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id).map(e=>({...e,_custom:true,_bloc:bloc}));
    const allExts = sortExts([...builtInExts, ...movedHere, ...customExts]);
    if (allExts.length===0) return;

    const uid = 'edext_' + bloc.id;
    const section = document.createElement('div');
    section.className = 'edition-bloc-section';
    const logoHtml = bloc.logo ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="this.style.display='none'">` : '';
    section.innerHTML = `
      <div class="edition-bloc-header collapsible" onclick="toggleAccordion('${uid}')">
        ${logoHtml}
        <div class="bloc-color-dot" style="background:${bloc.couleur}"></div>
        <span class="edition-bloc-title">${bloc.nom}</span>
        <span class="edition-bloc-short">${bloc.short}</span>
        <span class="edition-bloc-count">${allExts.length} ext.</span>
        <div class="cer-chevron open" id="chev-${uid}" style="margin-left:auto">▼</div>
      </div>
      <div id="${uid}" class="${_viewMode()==='grid'?'edition-bloc-items open edition-grid':'edition-bloc-items open'}"></div>`;
    list.appendChild(section);

    const cont = section.querySelector(`#${uid}`);
    allExts.forEach(e => cont.appendChild(_viewMode()==='grid' ? buildEditionExtCard(e) : buildEditionExtRow(e)));
  });

  if (!list.children.length) list.innerHTML='<div class="empty-state"><p>Aucune extension.</p></div>';
}

// ── Edition card builders ──────────────────────────────────────────────────
function buildEditionBlocCard(b) {
  const el=document.createElement('div');
  el.className='edition-item-card';
  const logoSrc=b.logo||'';
  const _bid=b.id, _bcustom=!!b._custom_bloc;
  el.innerHTML=`
    <div class="edition-card-thumb" style="background:${b.couleur}22;border-bottom:3px solid ${b.couleur}">
      ${logoSrc?`<img src="${logoSrc}" alt="${b.short}" onerror="this.style.display='none'">`:
        `<span style="color:${b.couleur};font-size:1.1rem;font-weight:900">${b.short}</span>`}
    </div>
    <div class="edition-card-body">
      <div class="edition-card-code" style="color:${b.couleur}">${b.short}</div>
      <div class="edition-card-name">${b.nom}</div>
      <div class="edition-card-meta">${extCountForBloc(b)} ext · Bloc</div>
    </div>
    <div class="edition-card-actions">
      <button class="btn btn-icon btn-sm btn-danger" title="${b._custom_bloc?'Supprimer':'Masquer'}" onclick="event.stopPropagation();deleteAnyBloc('${b.id}',${!!b._custom_bloc})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', e => { if(!e.target.closest('.edition-card-actions')) editBloc(_bid); });
  return el;
}

function buildEditionBlocRow(b) {
  const el=document.createElement('div');
  el.className='edition-ext-row';
  const logoSrc=b.logo||'';
  const _bid=b.id, _bcustom=!!b._custom_bloc;
  el.innerHTML=`
    <div class="edition-ext-thumb" style="background:${b.couleur}22;border:1px solid ${b.couleur}44">
      ${logoSrc?`<img src="${logoSrc}" alt="${b.short}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:``}
      <div class="edition-ext-thumb-code" style="color:${b.couleur};${logoSrc?'display:none':''}">${b.short}</div>
    </div>
    <div class="edition-ext-info">
      <div class="edition-ext-code" style="color:${b.couleur}">${b.short}</div>
      <div class="edition-ext-name">${b.nom}</div>
      <div class="edition-ext-meta">${extCountForBloc(b)} ext · Bloc</div>
    </div>
    <div class="edition-ext-actions">
      <button class="btn btn-icon btn-sm btn-danger" title="${b._custom_bloc?'Supprimer':'Masquer'}" onclick="event.stopPropagation();deleteAnyBloc('${b.id}',${!!b._custom_bloc})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', e => { if(!e.target.closest('.edition-ext-actions')) editBloc(_bid); });
  return el;
}

function buildEditionExtCard(e) {
  const color=extColor(e);
  const pct=e.nb_cartes>0?Math.round(ownedCount(e.id)/e.nb_cartes*100):0;
  const logoSrc=e.logo||e._bloc?.logo||'';
  const el=document.createElement('div');
  el.className='edition-item-card';
  const _eid=e.id, _ecustom=!!e._custom;
  el.innerHTML=`
    <div class="edition-card-thumb" style="border-bottom:3px solid ${color}">
      ${logoSrc?`<img src="${logoSrc}" alt="${e.code}" onerror="this.style.display='none'">`:
        `<span style="color:${color};font-size:.9rem;font-weight:900">${e.code}</span>`}
    </div>
    <div class="edition-card-body">
      <div class="edition-card-code" style="color:${color}">${e.code}</div>
      <div class="edition-card-name">${e.nom}</div>
      <div class="edition-card-meta">${e.nb_cartes||0} cartes</div>
      <div class="edition-card-pct-bar"><div style="width:${pct}%;background:${pctBg(pct)}"></div></div>
    </div>
    <div class="edition-card-actions">
      <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation();deleteAnyExt('${e.id}',${!!e._custom})" title="${e._custom?'Supprimer':'Masquer'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', ev => { if(!ev.target.closest('.edition-card-actions')) editExt(_eid,_ecustom); });
  return el;
}

function buildEditionExtRow(e) {
  const color=extColor(e); const logoSrc=e.logo||e._bloc?.logo||'';
  const el=document.createElement('div'); el.className='edition-ext-row';
  const _eid=e.id, _ecustom=!!e._custom;
  el.innerHTML=`
    <div class="edition-ext-thumb" style="border:1px solid ${color}33">
      ${logoSrc?`<img src="${logoSrc}" alt="${e.nom}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:``}
      <div class="edition-ext-thumb-code" style="color:${color};${logoSrc?'display:none':''}">${e.code}</div>
    </div>
    <div class="edition-ext-info">
      <div class="edition-ext-code" style="color:${color}">${e.code}</div>
      <div class="edition-ext-name">${e.nom}</div>
      <div class="edition-ext-meta">${e._bloc?e._bloc.nom:'—'} · ${e.nb_cartes||0} cartes</div>
    </div>
    <div class="edition-ext-actions">
      <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation();deleteAnyExt('${e.id}',${!!e._custom})" title="${e._custom?'Supprimer':'Masquer'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', ev => { if(!ev.target.closest('.edition-ext-actions')) editExt(_eid,_ecustom); });
  return el;
}

let _blocDragId = null;
function onBlocDragStart(e) { _blocDragId = e.currentTarget.dataset.blocId; e.dataTransfer.effectAllowed='move'; }
function onBlocDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-target'); }
function onBlocDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.edition-item-card.drag-target, .edition-ext-row.drag-target').forEach(el=>el.classList.remove('drag-target'));
  const toId = e.currentTarget.dataset.blocId;
  if (!_blocDragId || _blocDragId === toId) { _blocDragId=null; return; }
  const blocs = getBlocs();
  const order = blocs.map(b=>b.id);
  const fromIdx = order.indexOf(_blocDragId), toIdx = order.indexOf(toId);
  if (fromIdx<0||toIdx<0) { _blocDragId=null; return; }
  order.splice(fromIdx, 1); order.splice(toIdx, 0, _blocDragId);
  if(!_D.settings) _D.settings={};
  _D.settings.bloc_order = order;
  saveData(); renderAll();
  toast('Ordre des blocs sauvegardé.','success');
  _blocDragId = null;
}

function switchEditionTab(tab) {
  _editionTab=tab;
  document.querySelectorAll('.edition-tab').forEach(t=>t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  resetEditionForm();
  renderEditionList();
  const newBtn=document.getElementById('edition-new-btn');
  newBtn.textContent=tab==='blocs'?'+ Nouveau bloc':'+ Nouvelle extension';
  document.getElementById('edit-form-hint').textContent=tab==='blocs'
    ?'Blocs intégrés : surcharge nom/sigle/couleur. Blocs custom : création libre.'
    :'Extensions intégrées : surcharge. Extensions custom : création libre.';
}

function editBloc(blocId) {
  _editingBlocId=blocId; _editingExtId=null; _editingIsCustom=false;
  const b=getBlocs().find(b=>b.id===blocId); if(!b)return;
  document.getElementById('edit-code').value    = b.short  || '';
  document.getElementById('edit-nom').value     = b.nom    || '';
  document.getElementById('edit-nb').value      = '';
  document.getElementById('edit-logo').value    = b.logo   || '';
  const sBl = document.getElementById('edit-sigle'); if(sBl) sBl.value = b.sigle||'';
  document.getElementById('edit-couleur').value = b.couleur|| '#888888';
  previewEditionImg(b.logo||'');
  document.getElementById('edit-save-lbl').textContent     = 'Enregistrer';
  document.getElementById('edit-cancel-btn').style.display = '';
  document.getElementById('edition-form-title').textContent= 'Modifier le bloc';
  document.getElementById('edit-nb-field').style.display   = 'none';
  document.getElementById('edit-bloc-field').style.display = 'none';
  const smB = document.getElementById('edit-stat-mode-field'); if(smB) smB.style.display='none';
}

function editExt(id,isCustom) {
  _editingExtId=id; _editingIsCustom=isCustom; _editingBlocId=null;
  let e=isCustom?(_D.custom_exts||[]).find(ex=>ex.id===id):getAllExtensions().find(ex=>ex.id===id&&ex._builtin);
  if(!e)return;
  document.getElementById('edit-code').value    = e.code    ||'';
  document.getElementById('edit-nom').value     = e.nom     ||'';
  document.getElementById('edit-nb').value      = e.nb_cartes||'';
  document.getElementById('edit-logo').value    = e.logo    ||'';
  const sigleEl = document.getElementById('edit-sigle'); if(sigleEl) sigleEl.value = e.sigle||'';
  document.getElementById('edit-couleur').value = e.couleur || (e._bloc?e._bloc.couleur:getBlocForExt(id)?.couleur||'#e63946');
  const smEl = document.getElementById('edit-stat-mode'); if(smEl) smEl.value = e.stat_mode||'all';
  const bloc=e._bloc||getBlocForExt(id);
  document.getElementById('edit-bloc').value=e.bloc_id||bloc?.id||'';
  previewEditionImg(e.logo||'');
  document.getElementById('edit-save-lbl').textContent     = 'Enregistrer';
  document.getElementById('edit-cancel-btn').style.display = '';
  document.getElementById('edition-form-title').textContent= 'Modifier l\'extension';
  document.getElementById('edit-nb-field').style.display   = '';
  document.getElementById('edit-logo-field').style.display = '';
  document.getElementById('edit-bloc-field').style.display = '';
  const smF = document.getElementById('edit-stat-mode-field'); if(smF) smF.style.display='block';
}

function saveEditionItem() {
  if (_editingBlocId) {
    const short=document.getElementById('edit-code').value.trim().toUpperCase();
    const nom=document.getElementById('edit-nom').value.trim();
    const couleur=document.getElementById('edit-couleur').value;
    const logo=document.getElementById('edit-logo').value.trim();
    const sigleEl2=document.getElementById('edit-sigle'); const sigle=sigleEl2?sigleEl2.value.trim():'';
    if(!short||!nom){toast('Nom et sigle obligatoires.','error');return;}
    const cb=(_D.custom_blocs||[]).find(b=>b.id===_editingBlocId);
    if(cb){Object.assign(cb,{short,nom,couleur,logo,sigle});}
    else {if(!_D.bloc_overrides)_D.bloc_overrides={};_D.bloc_overrides[_editingBlocId]={short,nom,couleur,logo,sigle};}
    toast('Bloc mis à jour !','success');
    saveData();renderAll();resetEditionForm();return;
  }

  const code=document.getElementById('edit-code').value.trim().toUpperCase();
  const nom=document.getElementById('edit-nom').value.trim();
  const nb=parseInt(document.getElementById('edit-nb').value)||0;
  const blocId=document.getElementById('edit-bloc').value;
  const logo=document.getElementById('edit-logo').value.trim();
  const sigleEl=document.getElementById('edit-sigle'); const sigle=sigleEl?sigleEl.value.trim():'';
  const couleur=document.getElementById('edit-couleur').value;
  const statModeSel=document.getElementById('edit-stat-mode');
  const stat_mode = statModeSel ? statModeSel.value : 'all';
  if(!code||!nom){toast('Code et nom obligatoires.','error');return;}

  if(_editingExtId){
    if(_editingIsCustom){
      const ex=(_D.custom_exts||[]).find(e=>e.id===_editingExtId);
      if(ex)Object.assign(ex,{code,nom,nb_cartes:nb,bloc_id:blocId,logo,sigle,couleur,stat_mode,sorti:true});
    } else {
      if(!_D.ext_overrides)_D.ext_overrides={};
      _D.ext_overrides[_editingExtId]={code,nom,nb_cartes:nb,logo,sigle,couleur,stat_mode};
      if(blocId) _D.ext_overrides[_editingExtId].bloc_id_override = blocId;
    }
    toast('Extension mise à jour !','success');
  } else {
    if(_editionTab==='blocs'){
      if(!_D.custom_blocs)_D.custom_blocs=[];
      _D.custom_blocs.push({id:'cb_'+Date.now(),short:code,nom,couleur,logo,extensions:[],_custom_bloc:true});
      toast('Bloc créé !','success');
    } else {
      if(!blocId){toast('Choisissez un bloc.','error');return;}
      if(!_D.custom_exts)_D.custom_exts=[];
      _D.custom_exts.push({id:'cx_'+Date.now(),code,nom,nb_cartes:nb,bloc_id:blocId,logo,sigle,couleur,stat_mode,sorti:true,_custom:true});
      toast('Extension ajoutée !','success');
    }
  }
  saveData();renderAll();resetEditionForm();
}

function deleteCustomExt(id){
  if(!confirm('Supprimer cette extension ?'))return;
  _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.id!==id);
  saveData();renderAll();toast('Extension supprimée.','success');
}

// Delete any ext — custom: remove from array; built-in: mark as hidden via override
function deleteAnyExt(id, isCustom){
  if(!confirm('Supprimer cette extension ? Les données de collection associées seront perdues.'))return;
  if(isCustom){
    _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.id!==id);
  } else {
    if(!_D.ext_overrides)_D.ext_overrides={};
    if(!_D.ext_overrides[id])_D.ext_overrides[id]={};
    _D.ext_overrides[id]._hidden=true;
  }
  delete (_D.collection||{})[id];
  saveData();renderAll();toast('Extension supprimée.','success');
}

function deleteCustomBloc(id){
  if(!confirm('Supprimer ce bloc ? Les extensions custom de ce bloc seront aussi supprimées.'))return;
  _D.custom_blocs=(_D.custom_blocs||[]).filter(b=>b.id!==id);
  _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.bloc_id!==id);
  saveData();renderAll();toast('Bloc supprimé.','success');
}

// Delete any bloc — custom: remove; built-in: mark hidden
function deleteAnyBloc(id, isCustom){
  if(!confirm('Masquer ce bloc et toutes ses extensions ?'))return;
  if(isCustom){
    _D.custom_blocs=(_D.custom_blocs||[]).filter(b=>b.id!==id);
    _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.bloc_id!==id);
  } else {
    if(!_D.bloc_overrides)_D.bloc_overrides={};
    if(!_D.bloc_overrides[id])_D.bloc_overrides[id]={};
    _D.bloc_overrides[id]._hidden=true;
    // Hide all built-in exts in that bloc
    const tplBloc=(_D._tpl_blocs||window.__PC_DATA__.blocs).find(b=>b.id===id);
    if(tplBloc){
      (tplBloc.extensions||[]).forEach(e=>{
        if(!_D.ext_overrides)_D.ext_overrides={};
        if(!_D.ext_overrides[e.id])_D.ext_overrides[e.id]={};
        _D.ext_overrides[e.id]._hidden=true;
      });
    }
  }
  saveData();renderAll();toast('Bloc masqué.','success');
}

function resetEditionForm(){
  _editingBlocId=null;_editingExtId=null;_editingIsCustom=false;
  ['edit-code','edit-nom','edit-nb','edit-logo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  const c=document.getElementById('edit-couleur');if(c)c.value='#e63946';
  const p=document.getElementById('edition-preview');if(p)p.innerHTML='<span>Aperçu</span>';
  document.getElementById('edit-save-lbl').textContent     = _editionTab==='blocs'?'Créer':'Ajouter';
  document.getElementById('edit-cancel-btn').style.display = 'none';
  document.getElementById('edition-form-title').textContent= _editionTab==='blocs'?'Nouveau bloc':'Nouvelle extension';
  document.getElementById('edit-nb-field').style.display   = _editionTab!=='blocs'?'':'none';
  document.getElementById('edit-logo-field').style.display = '';
  document.getElementById('edit-bloc-field').style.display = _editionTab==='exts'?'':'none';
  const smR=document.getElementById('edit-stat-mode-field');if(smR)smR.style.display=_editionTab!=='blocs'?'block':'none';
  const smSel=document.getElementById('edit-stat-mode');if(smSel)smSel.value='all';
  const bs=document.getElementById('edit-bloc');if(bs)bs.disabled=false;
}

function previewEditionImg(url){
  const p=document.getElementById('edition-preview');if(!p)return;
  p.innerHTML=url?`<img src="${url}" onerror="this.parentNode.innerHTML='<span>Image non accessible</span>'">`:'<span>Aperçu</span>';
}

function populateBlocSelect(){
  const sel=document.getElementById('edit-bloc');if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Choisir un bloc —</option>';
  getBlocs().forEach(b=>{
    const opt=document.createElement('option');
    opt.value=b.id;opt.textContent=`${b.short} – ${b.nom}`;
    opt.dataset.couleur=b.couleur||'';
    sel.appendChild(opt);
  });
  if(cur)sel.value=cur;
  // Auto-fill color on change — only if user hasn't manually set a color
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const couleurInput = document.getElementById('edit-couleur');
    // Only auto-fill if editing a NEW item (not editing existing) or color unchanged from last auto-fill
    if (couleurInput && opt && opt.dataset.couleur && !_editingExtId && !_editingBlocId) {
      couleurInput.value = opt.dataset.couleur;
    }
  };
}

// ── Statistics ──────────────────────────────────────────────────────────────
function renderStats(){
  const c=document.getElementById('stats-container');if(!c)return;
  c.innerHTML='';
  let tC=0,tO=0;
  const byBloc=[];
  getBlocs().forEach(bloc=>{
    let bT=0,bO=0;
    const exts=[
      ...(bloc.extensions||[]).map(e=>({...e,...((_D.ext_overrides||{})[e.id]||{})})).filter(e=>e.sorti&&(e.stat_mode||'all')!=='boosters_only'),
      ...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id&&(e.stat_mode||'all')!=='boosters_only')
    ];
    exts.forEach(e=>{bT+=e.nb_cartes||0;bO+=ownedCount(e.id);});
    tC+=bT;tO+=bO;
    byBloc.push({nom:bloc.nom,short:bloc.short,couleur:bloc.couleur,bT,bO,pct:bT>0?Math.round(bO/bT*100):0});
  });
  const bd=_D.boosters_data||{};
  let ilT=0,ilO=0;
  const ilByBloc=[];
  getBlocs().forEach(bloc=>{
    let bT=0,bO=0;
    const exts=[...(bloc.extensions||[]).filter(e=>e.sorti),...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id)];
    exts.forEach(e=>{const arr=bd[e.id]||[];bT+=arr.length;bO+=arr.filter(il=>il.obtained!==false).length;});
    ilT+=bT;ilO+=bO;
    if(bT>0)ilByBloc.push({nom:bloc.nom,short:bloc.short,couleur:bloc.couleur,bT,bO,pct:bT>0?Math.round(bO/bT*100):0});
  });
  const gC=tC>0?Math.round(tO/tC*100):0,gI=ilT>0?Math.round(ilO/ilT*100):0;
  c.innerHTML=`
    <div class="stats-overview">
      <div class="stat-big-card" style="--accent-color:${pctTxt(gC)}">
        <div class="sbc-label">Complétion cartes</div>
        <div class="sbc-val" style="color:${pctTxt(gC)}">${gC}%</div>
        <div class="sbc-sub">${tO.toLocaleString('fr')} / ${tC.toLocaleString('fr')}</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:${gC}%;background:${pctBg(gC)}"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:${pctTxt(gI)}">
        <div class="sbc-label">Illustrations obtenues</div>
        <div class="sbc-val" style="color:${pctTxt(gI)}">${gI}%</div>
        <div class="sbc-sub">${ilO} / ${ilT}</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:${gI}%;background:${pctBg(gI)}"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:var(--green)">
        <div class="sbc-label">Classeurs</div>
        <div class="sbc-val">${_D.classeurs.length}</div>
        <div class="sbc-sub">${_D.classeurs.reduce((a,cl)=>{const s=cl.slots_par_page||18;let f=0;(cl.extensions||[]).forEach(ce=>f+=Math.min(ce.filled||0,(ce.pages||0)*s));return a+f;},0)} slots remplis</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:100%;background:var(--green)"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:var(--gold)">
        <div class="sbc-label">Blocs</div>
        <div class="sbc-val">${getBlocs().length}</div>
        <div class="sbc-sub">${getAllExtensions().filter(e=>e.sorti||e._custom).length} extensions actives</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:100%;background:var(--gold)"></div></div>
      </div>
    </div>
    <div class="stats-two-col">
      <div class="stats-panel">
        <div class="stats-panel-title">Complétion par bloc — Cartes</div>
        <div class="stats-bloc-list">
          ${byBloc.filter(b=>b.bT>0).sort((a,b)=>b.pct-a.pct).map(b=>`
            <div class="stats-bloc-row">
              <div class="stats-bloc-dot" style="background:${b.couleur}"></div>
              <div class="stats-bloc-name">${b.short}</div>
              <div class="stats-bloc-bar-wrap"><div class="stats-bloc-bar">
                <div class="stats-bloc-fill" style="width:${b.pct}%;background:${pctBg(b.pct)}"></div>
              </div></div>
              <div class="stats-bloc-pct" style="color:${pctTxt(b.pct)}">${b.pct}%</div>
              <div class="stats-bloc-detail">${b.bO}/${b.bT}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="stats-panel">
        <div class="stats-panel-title">Illustrations obtenues par bloc</div>
        ${ilByBloc.length===0?'<div class="empty-state" style="padding:24px 0"><p>Aucune illustration.</p></div>':`
          <div class="stats-bloc-list">${ilByBloc.sort((a,b)=>b.pct-a.pct).map(b=>`
            <div class="stats-bloc-row">
              <div class="stats-bloc-dot" style="background:${b.couleur}"></div>
              <div class="stats-bloc-name">${b.short}</div>
              <div class="stats-bloc-bar-wrap"><div class="stats-bloc-bar">
                <div class="stats-bloc-fill" style="width:${b.pct}%;background:${pctBg(b.pct)}"></div>
              </div></div>
              <div class="stats-bloc-pct" style="color:${pctTxt(b.pct)}">${b.pct}%</div>
              <div class="stats-bloc-detail">${b.bO}/${b.bT}</div>
            </div>`).join('')}</div>`}
      </div>
    </div>
    <div class="stats-panel" style="margin-top:16px">
      <div class="stats-panel-title">Top 10 extensions les mieux complétées</div>
      <div class="stats-top-list">
        ${getAllExtensions().filter(e=>(e.sorti||e._custom)&&(e.nb_cartes||0)>0)
          .map(e=>({e,pct:Math.round(ownedCount(e.id)/e.nb_cartes*100)}))
          .sort((a,b)=>b.pct-a.pct).slice(0,10)
          .map(({e,pct})=>`<div class="stats-top-row">
            <div class="stats-top-color" style="background:${extColor(e)}"></div>
            <div class="stats-top-code" style="color:${extColor(e)}">${e.code}</div>
            <div class="stats-top-name">${e.nom}</div>
            <div class="stats-top-bar-wrap"><div class="stats-top-bar">
              <div class="stats-top-fill" style="width:${pct}%;background:${pctBg(pct)}"></div>
            </div></div>
            <div class="stats-top-pct" style="color:${pctTxt(pct)}">${pct}%</div>
          </div>`).join('')||'<div class="empty-state" style="padding:20px 0"><p>Aucune donnée.</p></div>'}
      </div>
    </div>`;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function switchView(view,btn){
  _currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  if(btn)btn.classList.add('active');
  const titles={extensions:'Extensions',classeurs:'Classeurs',boosters:'Boosters / Illustrations',statistiques:'Statistiques',edition:'Édition',parametres:'Paramètres'};
  document.getElementById('topbar-title').textContent=titles[view]||view;
  const showSearch=view==='extensions';
  const showToggle=['extensions','classeurs','boosters','edition'].includes(view);
  document.getElementById('topbar-search-wrap').style.display  =showSearch?'flex':'none';
  document.getElementById('topbar-sort-btn').style.display     ='flex';  // always visible
  document.getElementById('topbar-view-toggle').style.display  =showToggle?'flex':'none';
  document.getElementById('global-progress-wrap').style.display=showSearch?'flex':'none';
  closeDetail();
  if(view==='edition'){populateBlocSelect();renderEditionList();}
  if(view==='statistiques')renderStats();
  if(view==='parametres')initSettingsView();
}

// ── Modals ─────────────────────────────────────────────────────────────────
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  if(id==='modal-classeur')delete document.getElementById('modal-classeur').dataset.editId;
}

// ── Paramètres ─────────────────────────────────────────────────────────────
function initCloud(){
  const cfg=window.__PC_CLOUD_CONFIG__||{};
  const u=document.getElementById('cfg-url');if(u)u.value=cfg.url||'';
  const k=document.getElementById('cfg-key');if(k)k.value=cfg.key||'';
}
function initSettingsView(){
  const inp=document.getElementById('settings-ui-scale');
  if(inp)inp.value=_D.settings?.ui_scale||1;
  if(_D.settings?.ui_scale) applyUiScale(_D.settings.ui_scale);
}
function saveDisplayMode(){
  const sel=document.getElementById('settings-display-mode');
  if(!sel)return;
  if(!_D.settings)_D.settings={};
  _D.settings.display_mode=sel.value;
  saveData();renderAll();toast('Préférence sauvegardée.','success');
}

function applyUiScale(val){
  const scale=parseFloat(val)||1;
  document.documentElement.style.fontSize=`${14*scale}px`;
  if(!_D.settings)_D.settings={};
  _D.settings.ui_scale=scale;
  saveData();
}

function saveUiScale(){
  const inp=document.getElementById('settings-ui-scale');
  if(!inp)return;
  applyUiScale(inp.value);
  toast('Taille appliquée.','success');
}
function exportData(){
  const s={..._D};delete s._tpl_blocs;delete s.blocs;
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'})),
    download:`ptcg_collection_${new Date().toISOString().slice(0,10)}.json`
  });
  a.click();toast('Export téléchargé.','success');
}
function importData(){
  try{
    const parsed=JSON.parse(document.getElementById('import-json').value.trim());
    _D={...parsed,_tpl_blocs:window.__PC_DATA__.blocs};
    ['boosters_data','custom_exts','ext_overrides','bloc_overrides','custom_blocs'].forEach(k=>{if(!_D[k])_D[k]=k==='boosters_data'?{}:[];});
    if(!_D.settings)_D.settings={display_mode:'logo'};
    saveData();renderAll();
    document.getElementById('import-json').value='';
    toast('Import réussi !','success');
  }catch(e){toast('JSON invalide : '+e.message,'error');}
}
function saveCloudConfig(){toast('Config sauvegardée.','success');}
function resetData(){
  if(!confirm('Supprimer TOUTES vos données ?'))return;
  localStorage.removeItem(STORAGE_KEY);
  _D={
    _v:1,_ts:0,_tpl_blocs:[],
    collection:{},classeurs:[],boosters_data:{},
    custom_exts:[],ext_overrides:{},bloc_overrides:{},custom_blocs:[],
    settings:{display_mode:'logo'}
  };
  renderAll();toast('Données réinitialisées.','success');
}
async function syncCloud(){
  const cfg=window.__PC_CLOUD_CONFIG__;
  if(!cfg?.url||!cfg?.key){toast('Configurez Supabase.','error');return;}
  try{
    const rows=await(await fetch(`${cfg.url}/rest/v1/${cfg.table}?user_id=eq.${cfg.user_id}`,
      {headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`}})).json();
    if(rows.length>0&&rows[0].data._ts>(_D._ts||0)){
      _D={...rows[0].data,_tpl_blocs:window.__PC_DATA__.blocs};
      saveData();renderAll();toast('Données importées du cloud.','success');return;
    }
    await fetch(`${cfg.url}/rest/v1/${cfg.table}`,{method:'POST',
      headers:{apikey:cfg.key,Authorization:`Bearer ${cfg.key}`,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
      body:JSON.stringify({user_id:cfg.user_id,data:_D})});
    toast('Collection synchronisée !','success');
  }catch(e){toast('Erreur sync : '+e.message,'error');}
}

// ── Misc ───────────────────────────────────────────────────────────────────
function setDefaultDate(){
  const f=document.getElementById('illus-date');if(f)f.value=new Date().toISOString().slice(0,10);
}
function toast(msg,type=''){
  const el=Object.assign(document.createElement('div'),{className:'toast '+type,textContent:msg});
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>el.remove(),3200);
}
