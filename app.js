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
  _editionTab = tab;
  document.querySelectorAll('.edition-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  const mainLayout   = document.getElementById('edition-layout-main');
  const mappingPanel = document.getElementById('edition-mapping-panel');
  const newBtn       = document.getElementById('edition-new-btn');
  const tabsRow      = document.getElementById('edition-tabs-row');

  if (tab === 'mapping') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = '';
    if (newBtn)       newBtn.style.display       = 'none';
    initMappingView();
    return;
  }

  if (mainLayout)   mainLayout.style.display  = '';
  if (mappingPanel) mappingPanel.style.display = 'none';
  if (newBtn)       newBtn.style.display       = '';

  resetEditionForm();
  renderEditionList();
  newBtn.textContent = tab === 'blocs' ? '+ Nouveau bloc' : '+ Nouvelle extension';
  document.getElementById('edit-form-hint').textContent = tab === 'blocs'
    ? 'Blocs intégrés : surcharge nom/sigle/couleur. Blocs custom : création libre.'
    : 'Extensions intégrées : surcharge. Extensions custom : création libre.';
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
  const titles={extensions:'Extensions',classeurs:'Classeurs',boosters:'Boosters / Illustrations',statistiques:'Statistiques',edition:'Édition',parametres:'Paramètres',pokedex:'Pokédex'};
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
  if(view==='pokedex')initPokedex();
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

// ── Mapping TCG ────────────────────────────────────────────────────────────
const SB_URL = 'https://kfyphcestbcgtkzurvas.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXBoY2VzdGJjZ3RrenVydmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTAwMzMsImV4cCI6MjA5ODIyNjAzM30.8sxe-_-uZdG4G0CGpUKViBMHE78RuReVaP_SsyLCaa8';
let _mapping = { sets:[], mappings:{}, query:'', filter:'all', initialized:false };

async function initMappingView() {
  if (_mapping.initialized) { renderMappingList(); return; }
  const el = document.getElementById('mapping-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2);font-size:.82rem">Chargement…</div>';
  try {
    let allRows = [], offset = 0, pageSize = 1000;
    while (true) {
      const res = await fetch(
        `${SB_URL}/rest/v1/cards?select=set_id,set_name,set_logo&order=set_name.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', 'Range': `${offset}-${offset+pageSize-1}` } }
      );
      const rows = await res.json();
      if (!rows.length) break;
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    const seen = new Set();
    _mapping.sets = allRows
      .filter(r => { if (seen.has(r.set_id)) return false; seen.add(r.set_id); return true; })
      .map(r => ({ id: r.set_id, name: r.set_name, logo: r.set_logo }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const mRes = await fetch(`${SB_URL}/rest/v1/set_mapping?select=ptcg_ext_id,tcgdex_set_id,tcgdex_set_name`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    const mRows = await mRes.json();
    _mapping.mappings = {};
    mRows.forEach(r => { _mapping.mappings[r.ptcg_ext_id] = { set_id: r.tcgdex_set_id, set_name: r.tcgdex_set_name }; });
    _mapping.initialized = true;
    renderMappingList();
  } catch(e) {
    if (el) el.innerHTML = `<p style="color:var(--accent2);font-size:.82rem;padding:16px">Erreur : ${e.message}</p>`;
  }
}

function renderMappingList() {
  const el = document.getElementById('mapping-list');
  if (!el) return;
  const q = (_mapping.query||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  let totalFiltered = 0, html = '';
  getBlocs().forEach(bloc => {
    const builtInExts = (bloc.extensions||[]).filter(e => {
      const ov = (_D.ext_overrides||{})[e.id]||{};
      return !ov._hidden && (!ov.bloc_id_override || ov.bloc_id_override === bloc.id);
    }).map(e => { const ov=(_D.ext_overrides||{})[e.id]||{}; return {...e,...ov,_builtin:true}; });
    const movedHere = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).flatMap(b=>
      (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return !ov._hidden&&ov.bloc_id_override===bloc.id;})
        .map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true};})
    );
    const customExts = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id);
    const allExts = sortExts([...builtInExts,...movedHere,...customExts]);
    if (!allExts.length) return;
    const rows = allExts.map(e => {
      const mapped   = _mapping.mappings[e.id];
      if (_mapping.filter === 'mapped'   && !mapped) return '';
      if (_mapping.filter === 'unmapped' &&  mapped) return '';
      const name     = e.nom || e.name || e.id;
      const code     = e.code || '';
      const logoSrc  = e.logo  || bloc.logo  || '';
      const sigleSrc = e.sigle || bloc.sigle || '';
      if (q) {
        const hay = (name+code).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
        if (!hay.includes(q)) return '';
      }
      totalFiltered++;
      const safeId = e.id.replace(/'/g,"\\'");
      return `<div class="mrow" id="mrow-${e.id}">
        <div class="mrow-ext">
          ${logoSrc  ? `<img src="${logoSrc}"  alt="" class="mrow-logo"      onerror="this.style.display='none'">` : ''}
          ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="mrow-sigle-img" onerror="this.style.display='none'">` : `<div class="mrow-sigle-ph">${code.slice(0,5)||'?'}</div>`}
          <div class="mrow-names">
            <span class="mrow-name">${name}</span>
            ${code ? `<span class="mrow-code">${code}</span>` : ''}
          </div>
        </div>
        <div class="mrow-set"><div class="mrow-set-wrap">
          <input type="text" class="mrow-input" id="mset-${e.id}"
            placeholder="Chercher un set TCGdex…"
            value="${mapped ? mapped.set_name+' ('+mapped.set_id+')' : ''}"
            oninput="showMappingDropdown('${safeId}',this.value)"
            onfocus="showMappingDropdown('${safeId}',this.value)"
            autocomplete="off">
          <div class="mrow-dropdown" id="mdrop-${e.id}" style="display:none"></div>
        </div></div>
        <div class="mrow-status" id="mstatus-${e.id}">
          ${mapped
            ? `<span class="mbadge mbadge-ok">✓</span><button class="mbadge-clear" onclick="clearMapping('${safeId}')" title="Supprimer">×</button>`
            : `<span class="mbadge mbadge-no">—</span>`}
        </div>
      </div>`;
    }).filter(Boolean).join('');
    if (!rows) return;
    const uid    = 'mbloc_' + bloc.id;
    const isOpen = !sessionStorage.getItem('mbloc_closed_' + bloc.id);
    html += `<div class="mbloc">
      <div class="mbloc-header collapsible" onclick="toggleMappingBloc('${bloc.id}')">
        ${bloc.logo  ? `<img src="${bloc.logo}"  alt="" class="mbloc-logo"  onerror="this.style.display='none'">` : ''}
        ${bloc.sigle ? `<img src="${bloc.sigle}" alt="" class="mbloc-sigle" onerror="this.style.display='none'">` : ''}
        <span class="mbloc-name">${bloc.nom||bloc.id}</span>
        <span class="mbloc-count">${allExts.length} ext.</span>
        <div class="cer-chevron ${isOpen?'open':''}" id="mchev-${bloc.id}" style="margin-left:auto">▼</div>
      </div>
      <div id="${uid}" style="${isOpen?'':'display:none'}">${rows}</div>
    </div>`;
  });
  const counter = document.getElementById('mapping-counter');
  if (counter) counter.textContent = `${totalFiltered} extension${totalFiltered>1?'s':''}`;
  el.innerHTML = html || `<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucune extension.</p>`;
}

function toggleMappingBloc(blocId) {
  const panel = document.getElementById('mbloc_' + blocId);
  const chev  = document.getElementById('mchev-' + blocId);
  if (!panel) return;
  const open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : '';
  if (chev) chev.classList.toggle('open', !open);
  if (open) sessionStorage.setItem('mbloc_closed_' + blocId, '1');
  else sessionStorage.removeItem('mbloc_closed_' + blocId);
}

function showMappingDropdown(extId, query) {
  const drop = document.getElementById(`mdrop-${extId}`);
  if (!drop) return;
  const q = (query||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const matches = q
    ? _mapping.sets.filter(s =>
        s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').includes(q) ||
        s.id.toLowerCase().includes(q)).slice(0,30)
    : _mapping.sets.slice(0,30);
  if (!matches.length) { drop.style.display='none'; return; }
  drop.innerHTML = matches.map(s => {
    const sn = s.name.replace(/'/g,"\\'");
    return `<div class="mrow-drop-item" onmousedown="selectMapping('${extId}','${s.id}','${sn}')">
      ${s.logo ? `<img src="${s.logo}" alt="" style="height:14px;object-fit:contain;margin-right:6px" onerror="this.style.display='none'">` : ''}
      <span>${s.name}</span><span style="color:var(--text3);font-size:.7rem;margin-left:6px">${s.id}</span>
    </div>`;
  }).join('');
  drop.style.display = 'block';
}

async function selectMapping(extId, setId, setName) {
  const drop = document.getElementById(`mdrop-${extId}`);
  const inp  = document.getElementById(`mset-${extId}`);
  if (drop) drop.style.display = 'none';
  if (inp)  inp.value = `${setName} (${setId})`;
  const ext = getAllExtensions().find(e => e.id === extId);
  if (!ext) return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/set_mapping`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ tcgdex_set_id: setId, tcgdex_set_name: setName, ptcg_ext_id: extId, ptcg_ext_name: ext.nom||ext.name||extId, ptcg_sigle: ext.sigle||'' })
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    _mapping.mappings[extId] = { set_id: setId, set_name: setName };
    const status = document.getElementById(`mstatus-${extId}`);
    if (status) status.innerHTML = `<span class="mbadge mbadge-ok">✓</span><button class="mbadge-clear" onclick="clearMapping('${extId.replace(/'/g,"\\'")}')">×</button>`;
    toast('Mapping sauvegardé.', 'success');
  } catch(e) { toast('Erreur : ' + e.message, 'error'); }
}

async function clearMapping(extId) {
  try {
    const res = await fetch(`${SB_URL}/rest/v1/set_mapping?ptcg_ext_id=eq.${encodeURIComponent(extId)}`,
      { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    delete _mapping.mappings[extId];
    const inp = document.getElementById(`mset-${extId}`);
    const status = document.getElementById(`mstatus-${extId}`);
    if (inp) inp.value = '';
    if (status) status.innerHTML = `<span class="mbadge mbadge-no">—</span>`;
    toast('Mapping supprimé.', 'success');
  } catch(e) { toast('Erreur : ' + e.message, 'error'); }
}

function filterMappingList(q) { _mapping.query = q; renderMappingList(); }
function setMappingFilter(filter, btn) {
  _mapping.filter = filter;
  document.querySelectorAll('.mapping-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMappingList();
}
document.addEventListener('click', e => {
  if (!e.target.closest('.mrow-set-wrap'))
    document.querySelectorAll('.mrow-dropdown').forEach(d => d.style.display = 'none');
  if (!e.target.closest('#pkdx-ext-panel') && !e.target.closest('#pkdx-ext-toggle'))
    _closePkdxExtPanel();
});

// ── Pokédex extension filter ───────────────────────────────────────────────
let _pkdxExtFilter = null;

function _closePkdxExtPanel() {
  const panel = document.getElementById('pkdx-ext-panel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('pkdx-ext-toggle');
  if (btn) btn.classList.remove('active');
}

async function togglePokedexExtFilter(btn) {
  const panel = document.getElementById('pkdx-ext-panel');
  const open  = panel && panel.style.display !== 'none';
  if (open) { _closePkdxExtPanel(); return; }
  if (!_mapping.initialized) await initMappingView();
  btn.classList.add('active');
  _buildExtFilterList();
  if (panel) panel.style.display = '';
}

function _buildExtFilterList() {
  const el = document.getElementById('pkdx-ext-list');
  if (!el) return;
  const exts = sortExts(getAllExtensions().filter(e => _mapping.mappings[e.id]));
  if (!exts.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.8rem;padding:8px 12px">Aucune extension mappée.</div>';
    return;
  }
  const allActive = _pkdxExtFilter === null ? 'active' : '';
  let html = `<div class="pkdx-ext-filter-item ${allActive}" onclick="setPokedexExtFilter(null,null,null,this)">Toutes les extensions</div>`;
  html += exts.map(e => {
    const setId  = _mapping.mappings[e.id].set_id;
    const name   = e.nom || e.name || e.id;
    const active = (_pkdxExtFilter && _pkdxExtFilter.setId === setId) ? 'active' : '';
    return `<div class="pkdx-ext-filter-item ${active}" onclick="setPokedexExtFilter('${setId}','${e.id.replace(/'/g,"\\'")}','${name.replace(/'/g,"\\'")}',this)">${name}</div>`;
  }).join('');
  el.innerHTML = html;
}

async function setPokedexExtFilter(setId, extId, name, el) {
  document.querySelectorAll('.pkdx-ext-filter-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  const labelEl = document.getElementById('pkdx-ext-label');

  if (!setId) {
    _pkdxExtFilter = null;
    _pkdx.extFilterNames = null;
    if (labelEl) labelEl.textContent = 'Extension';
    _closePkdxExtPanel();
    _applyPokedexFilter();
    return;
  }

  _pkdxExtFilter = { setId, extId, name };
  if (labelEl) labelEl.textContent = name;

  try {
    const res = await fetch(`${SB_URL}/rest/v1/cards?set_id=eq.${encodeURIComponent(setId)}&select=name`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range': '0-999' } });
    const cards = await res.json();
    // Parse card names to extract base name + form type
    _pkdx.extFilterNames = _parseTcgCardNames(cards.map(c => c.name || ''));
  } catch(e) { _pkdx.extFilterNames = null; }

  _closePkdxExtPanel();

  // Force load forms and all frNames
  const prevShowForms = _pkdx.showForms;
  _pkdx.showForms = true;
  if (!_pkdx.formsLoaded) await _loadFormsList();
  await _hydrateAllFrNames();
  _pkdx.showForms = prevShowForms;
  const formsBtn = document.getElementById('pkdx-forms-toggle');
  if (formsBtn) formsBtn.classList.toggle('active', _pkdx.showForms);

  _applyPokedexFilter();
}

// Parse TCGdex French card names → Set of "baseName" or "baseName|formType"
function _parseTcgCardNames(cardNames) {
  const nn = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

  const formParticles = [
    { re: /\bde hisui\b/i,   type: 'hisui'  },
    { re: /\bd['']hisui\b/i, type: 'hisui'  },
    { re: /\bde galar\b/i,   type: 'galar'  },
    { re: /\bd['']alola\b/i, type: 'alola'  },
    { re: /\bde alola\b/i,   type: 'alola'  },
    { re: /\bde paldea\b/i,  type: 'paldea' },
    { re: /\bd['']paldea\b/i,type: 'paldea' },
    { re: /^mega[- ]/i,      type: 'mega'   },
    { re: /\bmega[- ]/i,     type: 'mega'   },
    { re: /\bgigamax\b/i,    type: 'gmax'   },
    { re: /\bprimal\b/i,     type: 'primal' },
  ];

  const suffixRe = /\s*[-–]?\s*(ex|v|vmax|vstar|gx|lv\.?\s*x|radieux|obscur|brillant|delta|turbo|break|prime|legend|origine|couronné)\s*$/i;

  const entries = new Set();

  cardNames.forEach(raw => {
    let cardName = raw.trim();
    let formType = null;
    let baseName = cardName;

    for (const fp of formParticles) {
      if (fp.re.test(cardName)) {
        formType = fp.type;
        baseName = cardName
          .replace(/\bde hisui\b/gi, '').replace(/\bd['']hisui\b/gi, '')
          .replace(/\bde galar\b/gi, '').replace(/\bd['']alola\b/gi, '').replace(/\bde alola\b/gi, '')
          .replace(/\bde paldea\b/gi, '').replace(/\bd['']paldea\b/gi, '')
          .replace(/^mega[- ]/gi, '').replace(/\bmega[- ]/gi, '')
          .replace(/\bgigamax\b/gi, '').replace(/\bprimal\b/gi, '')
          .trim();
        break;
      }
    }

    const cleanBase = nn(baseName.replace(suffixRe, '').replace(/-/g, ' '));
    if (!cleanBase) return;

    if (formType) {
      entries.add(cleanBase + '|' + formType);
      // Also add base name so the base Pokémon appears alongside its form
      entries.add(cleanBase);
    } else {
      entries.add(cleanBase);
    }
  });

  return entries;
}

async function _hydrateAllFrNames() {
  const needed = _pkdx.all.filter(p => !p.isForm && !p.frName);
  if (!needed.length) return;
  const subtitle = document.getElementById('pokedex-subtitle');
  const BATCH = 20;
  for (let i = 0; i < needed.length; i += BATCH) {
    await Promise.allSettled(needed.slice(i, i+BATCH).map(async p => {
      try {
        const poke = await _fetchPokemon(p.id);
        const spec = await _fetchSpecies(poke.species.url);
        if (spec) { const fr = spec.names?.find(n => n.language.name === 'fr'); if (fr) p.frName = fr.name; }
      } catch(_) {}
    }));
    if (subtitle) subtitle.textContent = `⏳ Chargement : ${Math.min(i+BATCH, needed.length)} / ${needed.length}`;
  }
  if (subtitle) subtitle.textContent = `${_pkdx.all.filter(p=>!p.isForm).length} Pokémon — données via PokéAPI`;
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


// ═══════════════════════════════════════════════════════════════════════════
//  POKÉDEX — v2 (noms FR, talens FR, types FR, formes spéciales, séparateurs)
// ═══════════════════════════════════════════════════════════════════════════

const POKEAPI = 'https://pokeapi.co/api/v2';

// ── Générations & couleurs ─────────────────────────────────────────────────
const POKEDEX_GENS = [
  { id:1, label:'I',    name:'Kanto',   from:1,   to:151  },
  { id:2, label:'II',   name:'Johto',   from:152, to:251  },
  { id:3, label:'III',  name:'Hoenn',   from:252, to:386  },
  { id:4, label:'IV',   name:'Sinnoh',  from:387, to:493  },
  { id:5, label:'V',    name:'Unys',    from:494, to:649  },
  { id:6, label:'VI',   name:'Kalos',   from:650, to:721  },
  { id:7, label:'VII',  name:'Alola',   from:722, to:809  },
  { id:8, label:'VIII', name:'Galar',   from:810, to:905  },
  { id:9, label:'IX',   name:'Paldea',  from:906, to:1025 },
];

const TYPE_COLORS = {
  normal:'#9099A1',fire:'#E8553D',water:'#4F91D6',electric:'#F4C832',
  grass:'#5DB947',ice:'#74CEC0',fighting:'#CE4265',poison:'#9754C8',
  ground:'#D4A244',flying:'#8FA9DC',psychic:'#E8527E',bug:'#90C22D',
  rock:'#C5B789',ghost:'#5269AC',dragon:'#0A6DC4',dark:'#5A5165',
  steel:'#5B8EA1',fairy:'#E685A8',
};

// Traductions françaises des types
const TYPE_FR = {
  normal:'Normal',fire:'Feu',water:'Eau',electric:'Électrik',
  grass:'Plante',ice:'Glace',fighting:'Combat',poison:'Poison',
  ground:'Sol',flying:'Vol',psychic:'Psy',bug:'Insecte',
  rock:'Roche',ghost:'Spectre',dragon:'Dragon',dark:'Ténèbres',
  steel:'Acier',fairy:'Fée',
};

// Labels des formes spéciales
const FORM_LABELS = {
  mega:      { fr:'Méga',      badge:'MÉGA',     color:'#7038F8' },
  'mega-x':  { fr:'Méga X',    badge:'MÉGA X',   color:'#7038F8' },
  'mega-y':  { fr:'Méga Y',    badge:'MÉGA Y',   color:'#C03028' },
  gmax:      { fr:'Gigamax',   badge:'GIGAMAX',  color:'#E63946' },
  alola:     { fr:'Alola',     badge:'ALOLA',    color:'#06D6A0' },
  galar:     { fr:'Galar',     badge:'GALAR',    color:'#4A9EFF' },
  hisui:     { fr:'Hisui',     badge:'HISUI',    color:'#C0984A' },
  paldea:    { fr:'Paldea',    badge:'PALDEA',   color:'#A855F7' },
  totem:     { fr:'Totem',     badge:'TOTEM',    color:'#FFD166' },
  primal:    { fr:'Primo',     badge:'PRIMO',    color:'#E8553D' },
};

// Détecte le type de forme à partir du nom PokéAPI
function _detectFormType(pokeName, baseName) {
  const suffix = pokeName.replace(baseName + '-', '');
  if (pokeName.includes('-mega-x'))  return 'mega-x';
  if (pokeName.includes('-mega-y'))  return 'mega-y';
  if (pokeName.includes('-mega'))    return 'mega';
  if (pokeName.includes('-gmax'))    return 'gmax';
  if (pokeName.includes('-alola'))   return 'alola';
  if (pokeName.includes('-galar'))   return 'galar';
  if (pokeName.includes('-hisui'))   return 'hisui';
  if (pokeName.includes('-paldea'))  return 'paldea';
  if (pokeName.includes('-totem'))   return 'totem';
  if (pokeName.includes('-primal'))  return 'primal';
  return null;
}

// ── State ──────────────────────────────────────────────────────────────────
let _pkdx = {
  all:            [],
  filtered:       [],
  frNames:        {},
  specCache:      {},
  pokeCache:      {},
  page:           0,
  pageSize:       45,
  gen:            0,
  query:          '',
  showForms:      false,
  formsLoaded:    false,
  extFilterNames: null,
  loading:        false,
  initialized:    false,
};

function _pkdxGenForId(id) {
  const g = POKEDEX_GENS.find(g => id >= g.from && id <= g.to);
  return g ? g.id : 0;
}

// ── Fetch helpers (cached) ─────────────────────────────────────────────────
async function _fetchPokemon(nameOrId) {
  const key = String(nameOrId);
  if (_pkdx.pokeCache[key]) return _pkdx.pokeCache[key];
  const res  = await fetch(`${POKEAPI}/pokemon/${key}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  _pkdx.pokeCache[key] = data;
  _pkdx.pokeCache[String(data.id)] = data; // also cache by id
  return data;
}

async function _fetchSpecies(url) {
  if (_pkdx.specCache[url]) return _pkdx.specCache[url];
  const res  = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  _pkdx.specCache[url] = data;
  return data;
}

async function _fetchAbilityFr(abilityUrl) {
  try {
    const res  = await fetch(abilityUrl);
    const data = await res.json();
    const fr   = data.names?.find(n => n.language.name === 'fr');
    return fr ? fr.name : _capitalize(data.name.replace(/-/g,' '));
  } catch(_) { return '—'; }
}

// ── Init ───────────────────────────────────────────────────────────────────
async function initPokedex() {
  if (_pkdx.initialized) return;
  _pkdx.loading = true;
  document.getElementById('pokedex-loading').style.display = 'block';
  document.getElementById('pokedex-error').style.display   = 'none';

  try {
    const res  = await fetch(`${POKEAPI}/pokemon?limit=1025&offset=0`);
    const data = await res.json();

    _pkdx.all = data.results.map(p => {
      const parts = p.url.split('/').filter(Boolean);
      const id    = parseInt(parts[parts.length - 1], 10);
      return { id, name: p.name, frName: '' };
    }).filter(p => p.id >= 1 && p.id <= 1025)
      .sort((a, b) => a.id - b.id);

    _pkdx.filtered    = [..._pkdx.all];
    _pkdx.initialized = true;
    _pkdx.loading     = false;
    document.getElementById('pokedex-loading').style.display = 'none';
    document.getElementById('pokedex-subtitle').textContent  =
      `${_pkdx.all.length} Pokémon — données via PokéAPI`;

    _buildGenFilters();
    _pkdx.page = 0;
    await renderPokedexPage();
  } catch(err) {
    _pkdx.loading = false;
    document.getElementById('pokedex-loading').style.display = 'none';
    document.getElementById('pokedex-error').style.display   = 'block';
    document.getElementById('pokedex-error').textContent     = 'Erreur : ' + err.message;
  }
}

function _buildGenFilters() {
  const wrap = document.getElementById('pokedex-gen-filter');
  if (!wrap) return;
  let html = `<button class="pkdx-gen-btn active" data-gen="0" onclick="setPokedexGen(0,this)">Tous</button>`;
  POKEDEX_GENS.forEach(g => {
    html += `<button class="pkdx-gen-btn" data-gen="${g.id}" onclick="setPokedexGen(${g.id},this)">Gén. ${g.label} — ${g.name}</button>`;
  });
  wrap.innerHTML = html;
}

function setPokedexGen(gen, btn) {
  _pkdx.gen  = gen;
  _pkdx.page = 0;
  document.querySelectorAll('.pkdx-gen-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _applyPokedexFilter();
}

function filterPokedex(q) {
  _pkdx.query = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  _pkdx.page  = 0;
  _applyPokedexFilter();
}

function _normalizeStr(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}

function _applyPokedexFilter() {
  const pool = _pkdx.showForms ? _buildPoolWithForms() : _pkdx.all.filter(p => !p.isForm);
  _pkdx.filtered = pool.filter(p => {
    const baseId   = p.isForm ? p.baseId : p.id;
    const genMatch = _pkdx.gen === 0 || _pkdxGenForId(baseId) === _pkdx.gen;
    const qMatch   = !_pkdx.query ||
      _normalizeStr(p.name).includes(_pkdx.query) ||
      _normalizeStr(p.frName || '').includes(_pkdx.query) ||
      String(baseId).startsWith(_pkdx.query);
    const extMatch = !_pkdxExtFilter || !_pkdx.extFilterNames
      ? true
      : _matchPkdxExtEntry(p);
    return genMatch && qMatch && extMatch;
  });
  renderPokedexPage(true);
}

function _buildPoolWithForms() {
  const bases = _pkdx.all.filter(p => !p.isForm);
  const forms  = _pkdx.all.filter(p =>  p.isForm);
  const result = [];
  bases.forEach(base => {
    result.push(base);
    forms.filter(f => f.baseId === base.id).forEach(f => result.push(f));
  });
  return result;
}

// Match a Pokémon entry against extFilterNames (Set of "baseName" or "baseName|formType")
function _matchPkdxExtEntry(p) {
  const entries = _pkdx.extFilterNames;
  if (!entries) return true;
  const nn = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').trim();

  if (p.isForm) {
    const formType = p.formType || _detectFormType(p.name, p.name.split('-')[0]) || null;
    const baseFr = nn(p.frName || '').split(' ')[0];
    const baseEn = nn(p.name  || '').split(' ')[0];
    if (!formType) return false;
    if (entries.has(baseFr + '|' + formType)) return true;
    if (entries.has(baseEn + '|' + formType)) return true;
    return false;
  } else {
    const nameFr = nn(p.frName || '');
    const nameEn = nn(p.name  || '').split(' ')[0];
    if (entries.has(nameFr)) return true;
    if (entries.has(nameEn)) return true;
    return false;
  }
}

function togglePokedexForms(btn) {
  _pkdx.showForms = !_pkdx.showForms;
  btn.classList.toggle('active', _pkdx.showForms);
  if (_pkdx.showForms && !_pkdx.formsLoaded) {
    _loadFormsList();
  } else {
    _applyPokedexFilter();
  }
}

async function _loadFormsList() {
  try {
    const res  = await fetch(`${POKEAPI}/pokemon?limit=1500&offset=0`);
    const data = await res.json();
    const formKeywords = ['-mega','-gmax','-alola','-galar','-hisui','-paldea',
      '-origin','-crowned','-primal','-therian','-pirouette','-aria','-complete',
      '-eternamax','-sky','-blade','-zen','-dusk','-dawn','-midday','-midnight',
      '-heat','-wash','-frost','-fan','-mow','-altered','-land','-plant',
      '-sandy','-trash','-hero','-hangry','-gorging','-noice','-busted',
      '-school','-solo','-disguised','-black','-white','-50','-10'];
    const bases = _pkdx.all.filter(p => !p.isForm);
    data.results.forEach(p => {
      if (!formKeywords.some(k => p.name.includes(k))) return;
      const base = bases.find(b => p.name.startsWith(b.name + '-'));
      if (!base) return;
      if (_pkdx.all.find(e => e.name === p.name)) return; // no duplicates
      const parts    = p.url.split('/').filter(Boolean);
      const apiId    = parseInt(parts[parts.length - 1], 10);
      const formType = _detectFormType(p.name, base.name);
      const formMeta = formType ? FORM_LABELS[formType] : null;
      _pkdx.all.push({ id: apiId, baseId: base.id, name: p.name, frName: '', formType, formMeta, isForm: true });
    });
    _pkdx.formsLoaded = true;
    _applyPokedexFilter();
  } catch(e) {
    console.warn('Forms load error:', e);
    _applyPokedexFilter();
  }
}


async function renderPokedexPage(reset = false) {
  const grid = document.getElementById('pokedex-grid');
  if (!grid) return;
  if (reset) { grid.innerHTML = ''; _pkdx.page = 0; }

  const start = _pkdx.page * _pkdx.pageSize;
  const slice = _pkdx.filtered.slice(start, start + _pkdx.pageSize);

  if (slice.length === 0 && _pkdx.page === 0) {
    grid.innerHTML = '<p style="padding:24px;color:var(--text2);text-align:center;grid-column:1/-1">Aucun Pokémon trouvé.</p>';
    document.getElementById('pokedex-load-more').style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();

  // Determine if we need gen separators (only when showing all gens, no text search)
  const showSeparators = _pkdx.gen === 0 && !_pkdx.query;

  let lastGen = _pkdx.page === 0 ? -1 : _pkdxGenForId((_pkdx.filtered[start - 1] || {}).id);

  slice.forEach(p => {
    const displayId  = p.isForm ? p.baseId : p.id;
    const currentGen = _pkdxGenForId(displayId);
    const cardKey    = p.isForm ? `form-${p.name}` : String(p.id);

    // Gen separator (main Pokémon only)
    if (showSeparators && !p.isForm && currentGen !== lastGen) {
      const genInfo  = POKEDEX_GENS.find(g => g.id === currentGen);
      const sep      = document.createElement('div');
      sep.className  = 'pkdx-gen-separator';
      sep.innerHTML  = genInfo
        ? `<span class="pkdx-gen-sep-label">Génération ${genInfo.label} — ${genInfo.name}</span>`
        : '';
      frag.appendChild(sep);
      lastGen = currentGen;
    }

    const card     = document.createElement('div');
    card.className = 'pkdx-card pkdx-loading-card' + (p.isForm ? ' pkdx-card-form' : '');
    card.id        = `pkdx-card-${cardKey}`;
    card.innerHTML = `<div class="pkdx-placeholder"></div>`;
    card.onclick   = () => {
      if (p.isForm) {
        const baseE = _pkdx.all.find(e => !e.isForm && e.id === p.baseId);
        openPokedexFormModal(p.name, baseE?.frName || '');
      } else {
        openPokedexModal(p.id);
      }
    };
    frag.appendChild(card);
  });

  grid.appendChild(frag);
  _pkdx.page++;

  const promises = slice.map(p => _hydrateCard(p));
  await Promise.allSettled(promises);

  const hasMore = _pkdx.page * _pkdx.pageSize < _pkdx.filtered.length;
  document.getElementById('pokedex-load-more').style.display = hasMore ? 'block' : 'none';
}


// Build proper French name for a Pokémon form
function _buildFormFrName(baseFr, formType, pokeName) {
  if (!formType || !baseFr) return baseFr || '';
  const en = (pokeName || '').toLowerCase();
  switch (formType) {
    case 'alola':   return baseFr + " d’Alola";
    case 'galar':   return baseFr + ' de Galar';
    case 'hisui':   return baseFr + ' de Hisui';
    case 'paldea':  return baseFr + ' de Paldea';
    case 'gmax':    return 'Gigamax ' + baseFr;
    case 'primal':  return 'Primo-' + baseFr;
    case 'mega-x':  return 'Méga-' + baseFr + ' X';
    case 'mega-y':  return 'Méga-' + baseFr + ' Y';
    case 'mega':
      if (en.includes('-mega-x')) return 'Méga-' + baseFr + ' X';
      if (en.includes('-mega-y')) return 'Méga-' + baseFr + ' Y';
      return 'Méga-' + baseFr;
    default: return baseFr;
  }
}

async function _hydrateCard(p) {
  const isForm  = p.isForm || false;
  const fetchId = isForm ? p.name : p.id;
  const cardKey = isForm ? `form-${p.name}` : String(p.id);
  try {
    const poke = await _fetchPokemon(fetchId);
    const card = document.getElementById(`pkdx-card-${cardKey}`);
    if (!card) return;

    const displayId = isForm ? p.baseId : p.id;
    const numStr    = '#' + String(displayId).padStart(4, '0');

    let frName = _capitalize(poke.name.replace(/-/g, ' '));
    try {
      const spec = await _fetchSpecies(poke.species.url);
      if (spec) {
        if (isForm) {
          const baseEntry = _pkdx.all.find(e => e.id === p.baseId && !e.isForm);
          let baseFr = baseEntry?.frName || '';
          if (!baseFr) {
            // Base not hydrated yet — fetch its species
            try {
              const fr2 = spec.names?.find(n => n.language.name === 'fr');
              if (fr2) { baseFr = fr2.name; if (baseEntry) baseEntry.frName = fr2.name; }
            } catch(_) {}
          }
          frName = _buildFormFrName(baseFr, p.formType, p.name);
          p.frName = frName;
        } else {
          const fr = spec.names?.find(n => n.language.name === 'fr');
          if (fr) frName = fr.name;
          const entry = _pkdx.all.find(e => e.id === p.id && !e.isForm);
          if (entry) entry.frName = frName;
        }
      }
    } catch(_) {}

    const sprite   = poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '';
    const types    = poke.types.map(t => t.type.name);
    const formMeta = isForm ? p.formMeta : null;
    const color    = formMeta ? formMeta.color : (TYPE_COLORS[types[0]] || '#888');

    card.className = 'pkdx-card' + (isForm ? ' pkdx-card-form' : '');
    card.style.setProperty('--pkdx-color', color);
    card.innerHTML = `
      <div class="pkdx-card-num">${numStr}</div>
      ${formMeta ? `<span class="pkdx-card-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span>` : ''}
      <div class="pkdx-card-img-wrap">
        ${sprite ? `<img src="${sprite}" alt="${frName}" loading="lazy" class="pkdx-sprite">` : '<div class="pkdx-no-sprite">?</div>'}
      </div>
      <div class="pkdx-card-name">${frName}</div>
      <div class="pkdx-card-types">
        ${types.map(t => `<span class="pkdx-type" style="background:${TYPE_COLORS[t]||'#888'}">${TYPE_FR[t]||t}</span>`).join('')}
      </div>
    `;
  } catch(e) { /* keep placeholder */ }
}

async function pokedexLoadMore() {
  await renderPokedexPage(false);
}

// ── Detail Modal ───────────────────────────────────────────────────────────
async function openPokedexModal(id) {
  const modal = document.getElementById('modal-pokedex');
  const inner = document.getElementById('pkdx-modal-content');
  inner.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)"><div class="pokeball" style="width:36px;height:36px;margin:0 auto 10px;border-width:3px"></div>Chargement…</div>';
  modal.classList.add('open');

  try {
    const poke = await _fetchPokemon(id);

    // Species data (FR name, description, evos, varieties)
    let frName = _capitalize(poke.name.replace(/-/g,' '));
    let flavor = '', genus = '', evolutions = [], varieties = [];
    let specData = null;

    try {
      specData = await _fetchSpecies(poke.species.url);
      if (specData) {
        const fr = specData.names?.find(n => n.language.name === 'fr');
        if (fr) frName = fr.name;
        const frFl = specData.flavor_text_entries?.filter(e => e.language.name === 'fr').pop();
        if (frFl) flavor = frFl.flavor_text.replace(/[\n\f]/g,' ');
        const frGen = specData.genera?.find(g => g.language.name === 'fr');
        if (frGen) genus = frGen.genus;

        // Evolution chain
        if (specData.evolution_chain?.url) {
          try {
            const evoRes  = await fetch(specData.evolution_chain.url);
            const evoData = await evoRes.json();
            evolutions = await _buildEvoChain(evoData.chain);
          } catch(_) {}
        }

        // Special forms (méga, régionales, gigamax…)
        if (specData.varieties) {
          varieties = specData.varieties.filter(v => !v.is_default);
        }
      }
    } catch(_) {}

    const sprite  = poke.sprites?.other?.['official-artwork']?.front_default ||
                    poke.sprites?.front_default || '';
    const types   = poke.types.map(t => t.type.name);
    const color   = TYPE_COLORS[types[0]] || '#888';
    const numStr  = '#' + String(poke.id).padStart(4,'0');

    // French abilities (fetch in parallel)
    const abilitiesHtml = await Promise.all(poke.abilities.map(async a => {
      const frAbility = await _fetchAbilityFr(a.ability.url);
      return a.is_hidden
        ? `<span class="pkdx-ability pkdx-ability-hidden">${frAbility} <em>(cachée)</em></span>`
        : `<span class="pkdx-ability">${frAbility}</span>`;
    }));

    // Stats
    const statsHtml = poke.stats.map(s => {
      const val = s.base_stat;
      const pct = Math.min(100, Math.round(val / 255 * 100));
      const col = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--accent)';
      return `<div class="pkdx-stat-row">
        <span class="pkdx-stat-name">${_statLabel(s.stat.name)}</span>
        <span class="pkdx-stat-val">${val}</span>
        <div class="pkdx-stat-bar"><div class="pkdx-stat-fill" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('');

    // Evolution chain HTML
    let evoHtml = '';
    if (evolutions.length > 1) {
      evoHtml = `<div class="pkdx-modal-section pkdx-modal-full">
        <h4>Chaîne d'évolution</h4>
        <div class="pkdx-evo-chain">
          ${evolutions.map((e, i) => `
            ${i > 0 ? `<div class="pkdx-evo-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
              ${e.trigger ? `<span class="pkdx-evo-trigger">${e.trigger}</span>` : ''}
            </div>` : ''}
            <div class="pkdx-evo-item" onclick="closeModal('modal-pokedex');setTimeout(()=>openPokedexModal(${e.speciesId}),150)">
              <img src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${e.speciesId}.png"
                   alt="${e.frName}" onerror="this.style.display='none'" style="width:64px;height:64px;object-fit:contain">
              <span class="pkdx-evo-num">#${String(e.speciesId).padStart(3,'0')}</span>
              <span class="pkdx-evo-name">${e.frName}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    // Special forms HTML
    let formsHtml = '';
    if (varieties.length > 0) {
      const formCards = await Promise.all(varieties.map(async v => {
        try {
          const formPoke   = await _fetchPokemon(v.pokemon.name);
          const formSprite = formPoke.sprites?.other?.['official-artwork']?.front_default ||
                             formPoke.sprites?.front_default || '';
          const formTypes  = formPoke.types.map(t => t.type.name);
          const formColor  = TYPE_COLORS[formTypes[0]] || '#888';
          const formType   = _detectFormType(v.pokemon.name, poke.name);
          const formMeta   = formType ? FORM_LABELS[formType] : null;

          // Build display name
          let formLabel = v.pokemon.name.replace(poke.name + '-', '').replace(/-/g,' ');
          formLabel = formMeta ? formMeta.fr : _capitalize(formLabel);

          return `<div class="pkdx-form-card" style="--pkdx-color:${formMeta?.color || formColor}" onclick="openPokedexFormModal('${v.pokemon.name}','${frName}')">
            ${formMeta ? `<span class="pkdx-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span>` : ''}
            ${formSprite ? `<img src="${formSprite}" alt="${formLabel}" loading="lazy" style="width:72px;height:72px;object-fit:contain">` : '<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;color:var(--text3)">?</div>'}
            <span class="pkdx-form-label">${formLabel}</span>
            <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center">
              ${formTypes.map(t=>`<span class="pkdx-type" style="background:${TYPE_COLORS[t]||'#888'};font-size:.58rem;padding:1px 6px">${TYPE_FR[t]||t}</span>`).join('')}
            </div>
          </div>`;
        } catch(_) { return ''; }
      }));
      const validCards = formCards.filter(Boolean);
      if (validCards.length) {
        formsHtml = `<div class="pkdx-modal-section pkdx-modal-full">
          <h4>Formes spéciales</h4>
          <div class="pkdx-forms-grid">${validCards.join('')}</div>
        </div>`;
      }
    }

    inner.innerHTML = `
      <div class="pkdx-modal-hero" style="--pkdx-color:${color}">
        <div class="pkdx-modal-hero-bg"></div>
        ${sprite ? `<img src="${sprite}" alt="${frName}" class="pkdx-modal-sprite">` : ''}
        <div class="pkdx-modal-hero-info">
          <div class="pkdx-modal-num">${numStr}</div>
          <h2 class="pkdx-modal-name">${frName}</h2>
          ${genus ? `<div class="pkdx-modal-genus">${genus}</div>` : ''}
          <div class="pkdx-modal-types">
            ${types.map(t=>`<span class="pkdx-type pkdx-type-lg" style="background:${TYPE_COLORS[t]||'#888'}">${TYPE_FR[t]||t}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="pkdx-modal-body">
        ${flavor ? `<p class="pkdx-modal-flavor">"${flavor}"</p>` : ''}
        <div class="pkdx-modal-cols">
          <div class="pkdx-modal-section">
            <h4>Données</h4>
            <div class="pkdx-info-grid">
              <span class="pkdx-info-label">Taille</span><span>${(poke.height/10).toFixed(1)} m</span>
              <span class="pkdx-info-label">Poids</span><span>${(poke.weight/10).toFixed(1)} kg</span>
              <span class="pkdx-info-label">Talents</span>
              <span style="display:flex;flex-direction:column;gap:4px">${abilitiesHtml.join('')}</span>
            </div>
          </div>
          <div class="pkdx-modal-section">
            <h4>Statistiques de base</h4>
            ${statsHtml}
          </div>
        </div>
        ${evoHtml}
        ${formsHtml}
        <div class="pkdx-modal-section pkdx-modal-full pkdx-tcg-section">
          <h4>Cartes TCG <span id="pkdx-tcg-count" style="font-size:.72rem;font-weight:400;color:var(--text2)"></span></h4>
          <div id="pkdx-tcg-grid" class="pkdx-tcg-groups">
            <div style="color:var(--text2);font-size:.82rem;padding:4px 0">Chargement…</div>
          </div>
        </div>
      </div>
    `;
    _loadTcgCardsInModal(frName);
  } catch(err) {
    inner.innerHTML = `<p style="color:var(--accent2);padding:24px">Erreur : ${err.message}</p>`;
  }
}

async function _loadTcgCardsInModal(frName, formType) {
  const grid  = document.getElementById('pkdx-tcg-grid');
  const count = document.getElementById('pkdx-tcg-count');
  if (!grid) return;

  const sbUrl = 'https://kfyphcestbcgtkzurvas.supabase.co';
  const sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXBoY2VzdGJjZ3RrenVydmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTAwMzMsImV4cCI6MjA5ODIyNjAzM30.8sxe-_-uZdG4G0CGpUKViBMHE78RuReVaP_SsyLCaa8';

  const nn = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
  // Form card filters (on normalized card names)
  const formFilters = {
    alola:   [/\bd.alola\b/, /\bde alola\b/],
    galar:   [/\bde galar\b/],
    hisui:   [/\bde hisui\b/, /\bd.hisui\b/],
    paldea:  [/\bde paldea\b/],
    // mega-x/y: must have " x" or " y" suffix AND mega prefix, but NOT the other letter
    'mega-x': [c => /^m.ga[- ]/.test(nn(c.name)) && /\bx\b/.test(nn(c.name)) && !/\by\b/.test(nn(c.name))],
    'mega-y': [c => /^m.ga[- ]/.test(nn(c.name)) && /\by\b/.test(nn(c.name)) && !/\bx\b/.test(nn(c.name))],
    mega:    [/^m.ga[- ]/, /\bm.ga[- ]/],
    gmax:    [/\bgigamax\b/],
    primal:  [/\bprimal\b/],
  };
  // "M Pokémon", "M-Pokémon" short formats
  const megaShortPat = /^m[-\s][a-z]/;
  const allFormPats = [/\bd.alola\b/, /\bde alola\b/, /\bde galar\b/, /\bde hisui\b/, /\bd.hisui\b/, /\bde paldea\b/, /^m.ga[- ]/, /\bm.ga[- ]/, /\bgigamax\b/, /\bprimal\b/, /^m[-\s][a-z]/];

  try {
    const url = `${sbUrl}/rest/v1/cards?name=ilike.*${encodeURIComponent(frName)}*&order=set_id.asc,number.asc&limit=500`;
    const res = await fetch(url, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let cards = await res.json();

    if (formType && formFilters[formType]) {
      const filters = formFilters[formType];
      cards = cards.filter(card => {
        const n = nn(card.name);
        return filters.some(f => typeof f === 'function' ? f(card) : f.test(n));
      });
      // Also include "M Pokémon" and "M-Pokémon" short formats for mega forms
      if (formType === 'mega' || formType === 'mega-x' || formType === 'mega-y') {
        const [extraSpace, extraDash] = await Promise.all([
          (async () => { try { const r = await fetch(`${sbUrl}/rest/v1/cards?name=ilike.M ${encodeURIComponent(frName)}*&order=set_id.asc,number.asc&limit=200`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }); return r.ok ? r.json() : []; } catch(_) { return []; } })(),
          (async () => { try { const r = await fetch(`${sbUrl}/rest/v1/cards?name=ilike.M-${encodeURIComponent(frName)}*&order=set_id.asc,number.asc&limit=200`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }); return r.ok ? r.json() : []; } catch(_) { return []; } })(),
        ]);
        const extra = [...extraSpace, ...extraDash].filter(card => {
          const n = nn(card.name);
          if (!megaShortPat.test(n)) return false;
          if (formType === 'mega-x') return /\bx\b/.test(n) && !/\by\b/.test(n);
          if (formType === 'mega-y') return /\by\b/.test(n) && !/\bx\b/.test(n);
          return true;
        });
        const seen = new Set(cards.map(c => c.id));
        extra.forEach(c => { if (!seen.has(c.id)) cards.push(c); });
      }
    } else if (!formType) {
      // Base Pokémon: exclude all form cards
      cards = cards.filter(c => {
        const n = nn(c.name);
        return !allFormPats.some(p => p.test(n));
      });
    }
    if (!document.getElementById('pkdx-tcg-grid')) return;
    if (!cards.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:.82rem">Aucune carte trouvée.</p>'; return; }
    if (count) count.textContent = '— ' + cards.length + ' carte' + (cards.length > 1 ? 's' : '');

    // Ensure mapping loaded
    if (!_mapping.initialized) await initMappingView();

    // Build ordered list of PTCG extensions for sorting
    const allExts = getAllExtensions();
    // Assign a sort index to each extension based on PTCG bloc+code order
    const extOrder = {};
    let idx = 0;
    getBlocs().forEach(bloc => {
      const builtIn = (bloc.extensions||[]).filter(e => {
        const ov = (_D.ext_overrides||{})[e.id]||{};
        return !ov._hidden && (!ov.bloc_id_override || ov.bloc_id_override === bloc.id);
      }).map(e => { const ov=(_D.ext_overrides||{})[e.id]||{}; return {...e,...ov}; });
      const moved = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).flatMap(b=>
        (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return !ov._hidden&&ov.bloc_id_override===bloc.id;})
          .map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov};})
      );
      const custom = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id);
      sortExts([...builtIn,...moved,...custom]).forEach(e => { extOrder[e.id] = idx++; });
    });

    // Reverse mapping: tcgdex set_id → ptcg ext
    const setIdToExt = {};
    Object.entries(_mapping.mappings).forEach(([extId, m]) => {
      const ext = allExts.find(e => e.id === extId);
      if (ext) setIdToExt[m.set_id] = ext;
    });

    // Group by set_id
    const groupMap = new Map();
    cards.forEach(c => {
      const key = c.set_id || '?';
      if (!groupMap.has(key)) groupMap.set(key, { set_id: c.set_id, set_name: c.set_name, cards: [] });
      groupMap.get(key).cards.push(c);
    });

    // Sort groups by PTCG bloc+code order
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const ea = setIdToExt[a.set_id];
      const eb = setIdToExt[b.set_id];
      if (!ea && !eb) return (a.set_name||'').localeCompare(b.set_name||'');
      if (!ea) return 1;
      if (!eb) return -1;
      const oa = extOrder[ea.id] !== undefined ? extOrder[ea.id] : 9999;
      const ob = extOrder[eb.id] !== undefined ? extOrder[eb.id] : 9999;
      return oa - ob;
    });

    // Render: one full-width block per extension
    let html = '';
    groups.forEach(group => {
      const ext      = setIdToExt[group.set_id];
      const logoSrc  = ext ? (ext.logo  || '') : '';
      const sigleSrc = ext ? (ext.sigle || '') : '';
      const extName  = ext ? (ext.nom || ext.name || group.set_name) : (group.set_name || group.set_id || '?');
      const extCode  = ext ? (ext.code || '') : '';

      html += '<div class="pkdx-tcg-ext-group">'
        + '<div class="pkdx-tcg-ext-header">'
        + (logoSrc  ? '<img src="' + logoSrc  + '" alt="" class="pkdx-tcg-ext-logo"  onerror="this.style.display=\'none\'">' : '')
        + (sigleSrc ? '<img src="' + sigleSrc + '" alt="" class="pkdx-tcg-ext-sigle" onerror="this.style.display=\'none\'">' : '')
        + '<span class="pkdx-tcg-ext-name">' + extName + '</span>'
        + (extCode  ? '<span class="pkdx-tcg-ext-code">' + extCode + '</span>' : '')
        + '<span class="pkdx-tcg-ext-badge">' + group.cards.length + '</span>'
        + '</div>'
        + '<div class="pkdx-tcg-grid">';

      group.cards.forEach(c => {
        html += '<div class="pkdx-tcg-card" title="' + (c.set_name||'') + ' — ' + (c.number||'') + ' — ' + (c.rarity||'') + '">';
        if (c.image_url) {
          html += '<img src="' + c.image_url + '" alt="' + c.name + '" loading="lazy">';
        } else {
          html += '<div class="pkdx-tcg-placeholder">' + c.name + '</div>';
        }
        html += '<div class="pkdx-tcg-card-info">'
          + '<span class="pkdx-tcg-num">' + (c.number||'') + '</span>'
          + '<span class="pkdx-tcg-set">' + (c.rarity||'') + '</span>'
          + '</div></div>';
      });

      html += '</div></div>';
    });

    grid.innerHTML = html;
  } catch(e) {
    if (grid) grid.innerHTML = '<p style="color:var(--accent2);font-size:.82rem">Erreur : ' + e.message + '</p>';
  }
}

// Open modal for a special form (by pokemon name)
async function openPokedexFormModal(pokeName, baseFrName) {
  const modal = document.getElementById('modal-pokedex');
  const inner = document.getElementById('pkdx-modal-content');
  inner.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">Chargement de la forme…</div>';
  modal.classList.add('open');

  try {
    const poke    = await _fetchPokemon(pokeName);
    const sprite  = poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '';
    const types   = poke.types.map(t => t.type.name);
    const color   = TYPE_COLORS[types[0]] || '#888';

    const formType = _detectFormType(pokeName, poke.species.name);
    const formMeta = formType ? FORM_LABELS[formType] : null;
    // Ensure baseFrName is populated
    if (!baseFrName) {
      try {
        const spec2 = await _fetchSpecies(poke.species.url);
        const fr2 = spec2?.names?.find(n => n.language.name === 'fr');
        if (fr2) baseFrName = fr2.name;
      } catch(_) {}
    }
    const fullFrName = _buildFormFrName(baseFrName, formType, pokeName);

    const abilitiesHtml = await Promise.all(poke.abilities.map(async a => {
      const frAbility = await _fetchAbilityFr(a.ability.url);
      return a.is_hidden
        ? `<span class="pkdx-ability pkdx-ability-hidden">${frAbility} <em>(cachée)</em></span>`
        : `<span class="pkdx-ability">${frAbility}</span>`;
    }));

    const statsHtml = poke.stats.map(s => {
      const val = s.base_stat;
      const pct = Math.min(100, Math.round(val / 255 * 100));
      const col = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--accent)';
      return `<div class="pkdx-stat-row">
        <span class="pkdx-stat-name">${_statLabel(s.stat.name)}</span>
        <span class="pkdx-stat-val">${val}</span>
        <div class="pkdx-stat-bar"><div class="pkdx-stat-fill" style="width:${pct}%;background:${col}"></div></div>
      </div>`;
    }).join('');

    // Back button to base form
    const specParts = poke.species.url.split('/').filter(Boolean);
    const specId    = parseInt(specParts[specParts.length - 1], 10);

    inner.innerHTML = `
      <div class="pkdx-modal-hero" style="--pkdx-color:${formMeta?.color || color}">
        <div class="pkdx-modal-hero-bg"></div>
        ${sprite ? `<img src="${sprite}" alt="${fullFrName}" class="pkdx-modal-sprite">` : ''}
        <div class="pkdx-modal-hero-info">
          <button class="pkdx-back-btn" onclick="closeModal('modal-pokedex');setTimeout(()=>openPokedexModal(${specId}),150)">
            ← Forme de base
          </button>
          <div class="pkdx-modal-num">${baseFrName}</div>
          <h2 class="pkdx-modal-name">${fullFrName}</h2>
          ${formMeta ? `<div class="pkdx-modal-genus"><span class="pkdx-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span></div>` : ''}
          <div class="pkdx-modal-types">
            ${types.map(t=>`<span class="pkdx-type pkdx-type-lg" style="background:${TYPE_COLORS[t]||'#888'}">${TYPE_FR[t]||t}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="pkdx-modal-body">
        <div class="pkdx-modal-cols">
          <div class="pkdx-modal-section">
            <h4>Données</h4>
            <div class="pkdx-info-grid">
              <span class="pkdx-info-label">Taille</span><span>${(poke.height/10).toFixed(1)} m</span>
              <span class="pkdx-info-label">Poids</span><span>${(poke.weight/10).toFixed(1)} kg</span>
              <span class="pkdx-info-label">Talents</span>
              <span style="display:flex;flex-direction:column;gap:4px">${abilitiesHtml.join('')}</span>
            </div>
          </div>
          <div class="pkdx-modal-section">
            <h4>Statistiques de base</h4>
            ${statsHtml}
          </div>
        </div>
        <div class="pkdx-modal-section pkdx-modal-full pkdx-tcg-section">
          <h4>Cartes TCG <span id="pkdx-tcg-count" style="font-size:.72rem;font-weight:400;color:var(--text2)"></span></h4>
          <div id="pkdx-tcg-grid" class="pkdx-tcg-groups">
            <div style="color:var(--text2);font-size:.82rem;padding:4px 0">Chargement…</div>
          </div>
        </div>
      </div>
    `;
    _loadTcgCardsInModal(baseFrName, formType);
  } catch(err) {
    inner.innerHTML = `<p style="color:var(--accent2);padding:24px">Erreur : ${err.message}</p>`;
  }
}

// ── Evolution chain builder ────────────────────────────────────────────────
async function _buildEvoChain(chainNode, result = [], triggerLabel = '') {
  const parts     = chainNode.species.url.split('/').filter(Boolean);
  const speciesId = parseInt(parts[parts.length - 1], 10);
  let frName      = chainNode.species.name;

  try {
    const spec = await _fetchSpecies(chainNode.species.url);
    if (spec) {
      const fr = spec.names?.find(n => n.language.name === 'fr');
      if (fr) frName = fr.name;
    }
  } catch(_) {}

  result.push({ speciesId, frName: frName, trigger: triggerLabel });

  for (const evo of (chainNode.evolves_to || [])) {
    // Build trigger label
    const det = evo.evolution_details?.[0];
    let trig  = '';
    if (det) {
      if (det.trigger?.name === 'level-up' && det.min_level) trig = `Niv. ${det.min_level}`;
      else if (det.trigger?.name === 'use-item' && det.item) trig = _capitalize(det.item.name.replace(/-/g,' '));
      else if (det.trigger?.name === 'trade')                trig = 'Échange';
      else if (det.trigger?.name === 'level-up')             trig = 'Montée niv.';
    }
    await _buildEvoChain(evo, result, trig);
  }
  return result;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function _capitalize(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function _statLabel(s) {
  return {
    'hp':'PV', 'attack':'Attaque', 'defense':'Défense',
    'special-attack':'Att. Sp.', 'special-defense':'Déf. Sp.', 'speed':'Vitesse'
  }[s] || s;
}

function setDefaultDate(){
  const f=document.getElementById('illus-date');if(f)f.value=new Date().toISOString().slice(0,10);
}
function toast(msg,type=''){
  const el=Object.assign(document.createElement('div'),{className:'toast '+type,textContent:msg});
  document.getElementById('toast-container').appendChild(el);
  setTimeout(()=>el.remove(),3200);
}
