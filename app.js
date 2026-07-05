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
const _tabViewModes = { extensions:'grid', classeurs:'grid', boosters:'grid', edition:'grid',
  ventes:'grid', acheteurs:'grid', depenses:'grid', vendeurs:'grid' };
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
      form_label_overrides: {},
      custom_labels: {},
      deleted_labels: [],
      pokemon_label_assignments: {},
      label_local_ts: {},
      label_settings_ts: 0,
      ventes:        [],
      acheteurs:     [],
      depenses:      [],
      vendeurs:      [],
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
      if (!_D.form_label_overrides) _D.form_label_overrides = {};
      if (!_D.custom_labels) _D.custom_labels = {};
      if (!_D.deleted_labels) _D.deleted_labels = [];
      if (!_D.pokemon_label_assignments) _D.pokemon_label_assignments = {};
      if (!_D.label_local_ts) _D.label_local_ts = {};
      if (!_D.ventes)         _D.ventes         = [];
      if (!_D.acheteurs)      _D.acheteurs      = [];
      if (!_D.depenses)       _D.depenses       = [];
      if (!_D.vendeurs)       _D.vendeurs       = [];
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
  _pullLabelOverridesFromCloud().then(() => {
    renderLabelsList();
    _refreshPokedexAfterLabelChange();
  }).catch(() => {});
  _pullLabelSettingsFromCloud().then(() => {
    renderLabelsList();
    _refreshPokedexAfterLabelChange();
  }).catch(() => {});
}

function saveData() {
  _D._ts = Date.now();
  const s = { ..._D };
  delete s._tpl_blocs; delete s.blocs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch(e) {
    // Une erreur ici (quota dépassé, storage désactivé…) était jusqu'ici
    // totalement silencieuse : la donnée semblait enregistrée en mémoire mais
    // ne survivait à aucune actualisation. On la rend visible.
    console.error('[PTCG] saveData a échoué :', e);
    toast('Échec de la sauvegarde locale : ' + e.message, 'error');
  }
}

function renderAll() {
  const safe = (fn, name) => { try { fn(); } catch(e) { console.error('[PTCG] '+name+' crashed:', e.message, e.stack?.split('\n')[1]); } };
  safe(renderExtensions,    'renderExtensions');
  safe(renderClasseurs,     'renderClasseurs');
  safe(renderBoosters,      'renderBoosters');
  safe(renderEdition,       'renderEdition');
  safe(renderStats,         'renderStats');
  safe(renderVentes,        'renderVentes');
  safe(renderAcheteurs,     'renderAcheteurs');
  safe(renderDepenses,      'renderDepenses');
  safe(renderVendeurs,      'renderVendeurs');
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
  document.querySelectorAll('.ext-card-pct, .ext-row-pct, .cer-pct, .clr-pct, .classeur-global-pct, .bloc-progress-txt, .booster-pct-txt, .bea-pct-txt, .stats-bloc-pct, .stats-top-pct, [id="d-pct"], [id="global-pct"]').forEach(el => {
    el.classList.toggle('rainbow-txt', parseFloat(el.textContent) >= 100);
  });
  // Ext card border at 100%
  document.querySelectorAll('.ext-card').forEach(card => {
    const fill = card.querySelector('.ext-card-bar-fill');
    card.classList.toggle('rainbow-border', fill && parseFloat(fill.style.width) >= 100);
  });
  // Classeur border at 100% — autour du classeur entier, pas seulement sa jauge
  document.querySelectorAll('.classeur-card').forEach(card => {
    const fill = card.querySelector('.classeur-global-fill');
    card.classList.toggle('rainbow-border', fill && parseFloat(fill.style.width) >= 100);
  });
  document.querySelectorAll('.classeur-list-row').forEach(row => {
    const fill = row.querySelector('.clr-bar-fill');
    row.classList.toggle('rainbow-border', fill && parseFloat(fill.style.width) >= 100);
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

// Canonical display order of extensions: bloc order (getBlocs), then sorted by
// code within each bloc (sortExts) — the same grouping used by the Pokédex
// extension filter and the Extensions tab. Used to insert newly-added
// extensions into a classeur at the right spot instead of always appending
// at the end (which broke sorting and made new entries hard to find).
function extCanonicalOrder() {
  const order = [];
  const all = getAllExtensions();
  getBlocs().forEach(bloc => {
    sortExts(all.filter(e => getBlocForExt(e.id)?.id === bloc.id)).forEach(e => order.push(e.id));
  });
  all.forEach(e => { if (!order.includes(e.id)) order.push(e.id); });
  return order;
}

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
  getBlocs().forEach(bloc => {
    const inBloc = sortExts(available.filter(e => getBlocForExt(e.id)?.id === bloc.id));
    if (!inBloc.length) return;
    html += `<div class="pkdx-ext-filter-bloc-label">${bloc.nom||'—'}</div>`;
    html += inBloc.map(e => {
      const sigleSrc = e.sigle || bloc.sigle || '';
      return `<div class="pkdx-ext-filter-item" onclick="selectAddExtClasseurItem('${e.id}')">
        ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="pkdx-ext-filter-sigle" onerror="this.style.display='none'">` : `<span class="pkdx-ext-filter-code">${e.code||''}</span>`}
        <span>${e.nom}</span>
      </div>`;
    }).join('');
  });
  // Extensions with no matching bloc (shouldn't normally happen) still show up, grouped at the end.
  const noBloc = available.filter(e => !getBlocForExt(e.id));
  if (noBloc.length) {
    html += `<div class="pkdx-ext-filter-bloc-label">Custom</div>`;
    html += sortExts(noBloc).map(e => `<div class="pkdx-ext-filter-item" onclick="selectAddExtClasseurItem('${e.id}')">
      <span class="pkdx-ext-filter-code">${e.code||''}</span><span>${e.nom}</span>
    </div>`).join('');
  }
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
  const labelsPanel  = document.getElementById('edition-labels-panel');
  const newBtn       = document.getElementById('edition-new-btn');
  const tabsRow      = document.getElementById('edition-tabs-row');

  if (tab === 'mapping') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = '';
    if (labelsPanel)  labelsPanel.style.display  = 'none';
    if (newBtn)       newBtn.style.display       = 'none';
    initMappingView();
    return;
  }

  if (tab === 'labels') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = 'none';
    if (labelsPanel)  labelsPanel.style.display  = '';
    if (newBtn)       newBtn.style.display       = 'none';
    renderLabelsList();
    _pullLabelOverridesFromCloud().then(renderLabelsList);
    return;
  }

  if (mainLayout)   mainLayout.style.display  = '';
  if (mappingPanel) mappingPanel.style.display = 'none';
  if (labelsPanel)  labelsPanel.style.display  = 'none';
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
  const titles={extensions:'Extensions',classeurs:'Classeurs',boosters:'Boosters / Illustrations',statistiques:'Statistiques',edition:'Édition',parametres:'Paramètres',pokedex:'Pokédex',ventes:'Ventes',acheteurs:'Acheteurs',depenses:'Dépenses',vendeurs:'Vendeurs'};
  document.getElementById('topbar-title').textContent=titles[view]||view;
  const showSearch=view==='extensions';
  const showToggle=['extensions','classeurs','boosters','edition','ventes','acheteurs','depenses','vendeurs'].includes(view);
  const showSortBtn=!['ventes','acheteurs','depenses','vendeurs'].includes(view);
  document.getElementById('topbar-search-wrap').style.display  =showSearch?'flex':'none';
  document.getElementById('topbar-sort-btn').style.display     =showSortBtn?'flex':'none';
  document.getElementById('topbar-view-toggle').style.display  =showToggle?'flex':'none';
  if (showToggle) {
    const mode = _tabViewModes[view] || 'grid';
    const toggleBtns = document.querySelectorAll('#topbar-view-toggle button');
    toggleBtns.forEach((b,i) => b.classList.toggle('active', (i===0) === (mode==='grid')));
  }
  document.getElementById('global-progress-wrap').style.display=showSearch?'flex':'none';
  closeDetail();
  if(view==='edition'){populateBlocSelect();renderEditionList();}
  if(view==='statistiques')renderStats();
  if(view==='parametres')initSettingsView();
  if(view==='pokedex')initPokedex();
  if(view==='ventes')renderVentes();
  if(view==='acheteurs')renderAcheteurs();
  if(view==='depenses')renderDepenses();
  if(view==='vendeurs')renderVendeurs();
}

// ── Modals ─────────────────────────────────────────────────────────────────
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  if(id==='modal-classeur')delete document.getElementById('modal-classeur').dataset.editId;
  if(id==='modal-acheteur' && _acheteurReturnTo==='vente'){
    document.getElementById('modal-vente').classList.add('open');
    if (_lastCreatedAcheteurId) populateAcheteurSelect(_lastCreatedAcheteurId);
    _acheteurReturnTo = null; _lastCreatedAcheteurId = null;
  }
  if(id==='modal-vendeur' && _vendeurReturnTo==='depense'){
    document.getElementById('modal-depense').classList.add('open');
    if (_lastCreatedVendeurId) populateVendeurSelect(_lastCreatedVendeurId);
    _vendeurReturnTo = null; _lastCreatedVendeurId = null;
  }
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

// ── Labels de formes spéciales (Édition › Labels) ───────────────────────────
let _labelsQuery = '';

function filterLabelsList(q) { _labelsQuery = q; renderLabelsList(); }

function renderLabelsList() {
  const el = document.getElementById('labels-list');
  if (!el) return;
  const q = _nnLbl(_labelsQuery||'');
  const deletedSet = new Set(_D.deleted_labels||[]);
  let html = '', totalShown = 0;

  const colsHtml = `<div class="lbl-group-cols">
    <span>Label</span><span>Nom affiché</span><span>Badge</span><span>Couleur</span><span>Afficher</span><span>Préfixes carte</span><span>Suffixes carte</span><span>Catégorie</span><span></span>
  </div>`;

  const allTypes = [
    ...Object.keys(FORM_LABELS).filter(t => !deletedSet.has(t)),
    ...Object.keys(_D.custom_labels||{}),
  ];

  const rowsForTypes = types => types.map(type => {
    const cfg = getFormLabelConfig(type);
    if (q && !_nnLbl(type + ' ' + cfg.fr).includes(q)) return '';
    totalShown++;
    return _renderLabelRow(type, cfg);
  }).filter(Boolean).join('');

  getLabelCategories().forEach(cat => {
    const typesInCat = allTypes.filter(t => _labelCategoryOf(t) === cat.id);
    const rows = rowsForTypes(typesInCat);
    if (!rows) {
      // Catégorie vide (ou entièrement filtrée par la recherche) : on ne la
      // garde visible que si elle est personnalisée et qu'aucune recherche
      // n'est active, pour pouvoir toujours la réorganiser/renommer/supprimer
      // ou y glisser des labels par la suite.
      if (!cat._custom || q) return;
      html += `<div class="lbl-group">
        ${_labelCategoryHeaderHtml(cat)}
        <p style="color:var(--text3);font-size:.74rem;padding:2px 10px 10px">Catégorie vide — assigne-lui des labels via le menu « Catégorie » ci-dessous.</p>
      </div>`;
      return;
    }
    html += `<div class="lbl-group">
      ${_labelCategoryHeaderHtml(cat)}
      ${colsHtml}
      ${rows}
    </div>`;
  });

  // Non classés (aucune catégorie par défaut ni assignée)
  const unclassified = allTypes.filter(t => _labelCategoryOf(t) === null);
  const unclassifiedRows = rowsForTypes(unclassified);
  if (unclassifiedRows) {
    html += `<div class="lbl-group">
      <div class="lbl-group-header lbl-group-header-static">Non classés</div>
      ${colsHtml}
      ${unclassifiedRows}
    </div>`;
  }

  // Labels supprimés définitivement (repliable, avec restauration possible)
  const deletedTypes = [...deletedSet].filter(t => FORM_LABELS[t]);
  if (deletedTypes.length) {
    html += `<details class="lbl-deleted-group">
      <summary>Labels supprimés (${deletedTypes.length})</summary>
      ${deletedTypes.map(type => {
        const base = FORM_LABELS[type];
        return `<div class="lbl-deleted-row">
          <span class="pkdx-forms-type-badge" style="background:${base.color};opacity:.5">${base.badge}</span>
          <span>${base.fr}</span>
          <button class="btn btn-secondary" style="padding:3px 10px;font-size:.72rem" onclick="restoreDeletedLabel('${type.replace(/'/g,"\\'")}')">Restaurer</button>
        </div>`;
      }).join('')}
    </details>`;
  }

  // Catégories intégrées masquées (repliable, avec restauration possible)
  const hiddenCats = FORM_LABEL_GROUPS.filter(g => (_D.label_category_overrides||{})[g.id]?._hidden);
  if (hiddenCats.length) {
    html += `<details class="lbl-deleted-group">
      <summary>Catégories masquées (${hiddenCats.length})</summary>
      ${hiddenCats.map(g => {
        const name = (_D.label_category_overrides||{})[g.id]?.name ?? g.label;
        return `<div class="lbl-deleted-row">
          <span>${_escHtml(name)}</span>
          <button class="btn btn-secondary" style="padding:3px 10px;font-size:.72rem" onclick="restoreLabelCategory('${_escJs(g.id)}')">Restaurer</button>
        </div>`;
      }).join('')}
    </details>`;
  }

  const counter = document.getElementById('labels-counter');
  if (counter) counter.textContent = `${totalShown} label${totalShown>1?'s':''}`;
  el.innerHTML = html || `<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucun résultat.</p>`;
}

// En-tête de catégorie : glisser-déposer pour réorganiser, renommer et
// supprimer/masquer — disponible pour toutes les catégories, intégrées comme
// personnalisées (une catégorie intégrée est masquée plutôt que supprimée,
// et reste restaurable).
function _labelCategoryHeaderHtml(cat) {
  const safe = _escJs(cat.id);
  return `<div class="lbl-group-header" draggable="true" data-cat-id="${_escHtml(cat.id)}"
      ondragstart="onLabelCatDragStart(event)" ondragover="onLabelCatDragOver(event)"
      ondragleave="this.classList.remove('drag-target')" ondrop="onLabelCatDrop(event)">
    <span class="lbl-cat-handle" title="Glisser pour réorganiser">⠿</span>
    <span class="lbl-cat-name">${_escHtml(cat.name)}</span>
    <span class="lbl-cat-actions">
      <button class="mbadge-clear" title="Renommer" onclick="renameLabelCategory('${safe}')">✎</button>
      <button class="mbadge-clear" title="${cat._custom ? 'Supprimer la catégorie' : 'Masquer la catégorie'}" onclick="deleteLabelCategory('${safe}')">🗑</button>
    </span>
  </div>`;
}

function _renderLabelRow(type, cfg) {
  const safe    = type.replace(/'/g,"\\'");
  const isCustom = cfg.isCustom;
  const base    = FORM_LABELS[type] || { fr: type, badge: cfg.badge, color: cfg.color };
  const esc     = s => (s||'').replace(/"/g,'&quot;');
  const isOv    = !isCustom && !!(_D.form_label_overrides||{})[type];
  const currentCat = _labelCategoryOf(type);
  const catOptions = `<option value="" ${!currentCat?'selected':''}>Non classé</option>`
    + getLabelCategories().map(cat => `<option value="${_escHtml(cat.id)}" ${currentCat===cat.id?'selected':''}>${_escHtml(cat.name)}</option>`).join('');
  const deleteBtn = isCustom
    ? `<button class="mbadge-clear" title="Supprimer" onclick="deleteLabelPermanently('${safe}')">🗑</button>`
    : `<button class="mbadge-clear" title="Supprimer définitivement" onclick="deleteLabelPermanently('${safe}')">🗑</button>`;
  return `<div class="lbl-row" id="lblrow-${type}">
    <div class="lbl-badge-cell"><span class="pkdx-forms-type-badge" style="background:${cfg.color}">${cfg.badge}</span></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc(cfg.fr)}" placeholder="${esc(base.fr)}"
      oninput="_setLabelOverrideValue('${safe}','fr',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc(cfg.badge)}" placeholder="${esc(base.badge)}" maxlength="10"
      oninput="_setLabelOverrideValue('${safe}','badge',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-color-cell"><input type="color" class="lbl-color" value="${(cfg.color||'#888888').slice(0,7)}"
      onchange="_setLabelOverrideValue('${safe}','color',this.value);commitLabelEdit('${safe}')"></div>
    <div class="lbl-toggle-cell"><label class="lbl-switch">
      <input type="checkbox" ${cfg.enabled!==false?'checked':''} onchange="updateLabelToggle('${safe}',this.checked)">
      <span class="lbl-switch-track"></span></label></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc((cfg.prefixes||[]).join(', '))}" placeholder="ex : Méga-, M "
      oninput="_setLabelOverrideValue('${safe}','prefixes',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc((cfg.suffixes||[]).join(', '))}" placeholder="ex : VMAX, X"
      oninput="_setLabelOverrideValue('${safe}','suffixes',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><select class="lbl-input" onchange="setLabelCategory('${safe}',this.value)">${catOptions}</select></div>
    <div class="lbl-reset-cell">
      ${isOv ? `<button class="mbadge-clear" title="Réinitialiser" onclick="resetLabelOverride('${safe}')">↺</button>` : ''}
      ${deleteBtn}
    </div>
  </div>`;
}

function _refreshPokedexAfterLabelChange() {
  if (typeof _pkdx === 'undefined' || !_pkdx.formsLoaded) return;
  try { _applyPokedexFilter(); } catch(_) {}
  const fp = document.getElementById('pkdx-forms-panel');
  if (fp && fp.style.display !== 'none') { try { _buildFormTypeFilterList(); } catch(_) {} }
}

// Sauvegarde immédiate à chaque frappe (aucun re-rendu de la liste ici, pour ne
// pas faire perdre le focus du champ en cours d'édition). C'est cette fonction
// qui garantit qu'une actualisation de page ne perd jamais la saisie, même si
// l'utilisateur n'a pas encore quitté le champ (onblur).
function _setLabelOverrideValue(type, field, value) {
  if (_isCustomLabelType(type)) {
    // Un label personnalisé n'a pas de "défaut" : on édite directement sa définition.
    const c = _D.custom_labels[type];
    if (field === 'prefixes' || field === 'suffixes') {
      c[field] = value.split(',').map(s=>s.trim()).filter(Boolean);
    } else if (field === 'fr' || field === 'badge' || field === 'color') {
      c[field] = value;
    }
    saveData();
    return;
  }
  if (!_D.form_label_overrides) _D.form_label_overrides = {};
  const ov = { ...(_D.form_label_overrides[type] || {}) };
  if (field === 'fr' || field === 'badge') {
    const base = FORM_LABELS[type];
    if (!value.trim() || value.trim() === base[field]) delete ov[field]; else ov[field] = value;
  } else if (field === 'color') {
    const base = FORM_LABELS[type];
    if (!value || value === base.color) delete ov.color; else ov.color = value;
  } else if (field === 'prefixes' || field === 'suffixes') {
    const list = value.split(',').map(s=>s.trim()).filter(Boolean);
    const dflt = (DEFAULT_FORM_CARD_PATTERNS[type]||{})[field] || [];
    const same = list.length === dflt.length && list.every((v,i)=>v===dflt[i]);
    if (same) delete ov[field]; else ov[field] = list;
  }
  if (Object.keys(ov).length === 0) delete _D.form_label_overrides[type];
  else _D.form_label_overrides[type] = ov;
  saveData();
}

// Appelé en quittant un champ texte : pousse la valeur vers Supabase, rafraîchit
// le Pokédex (si déjà ouvert) et redessine la liste (bouton "réinitialiser").
function commitLabelEdit(type) {
  _pushLabelOverrideToCloud(type);
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
}

function updateLabelToggle(type, checked) {
  if (_isCustomLabelType(type)) {
    _D.custom_labels[type].enabled = checked;
  } else {
    if (!_D.form_label_overrides) _D.form_label_overrides = {};
    const ov = { ...(_D.form_label_overrides[type] || {}) };
    if (checked === true) delete ov.enabled; else ov.enabled = false;
    if (Object.keys(ov).length === 0) delete _D.form_label_overrides[type];
    else _D.form_label_overrides[type] = ov;
  }
  saveData();
  _pushLabelOverrideToCloud(type);
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label mis à jour.', 'success');
}

function resetLabelOverride(type) {
  if (_D.form_label_overrides) delete _D.form_label_overrides[type];
  saveData();
  _pushLabelOverrideToCloud(type);
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label réinitialisé.', 'success');
}

// Suppression définitive : pour un label personnalisé, il est effacé ; pour un
// label intégré, il est marqué "supprimé" (restaurable via la section dédiée)
// et disparaît de toute l'application (badges, filtres, rattachement carte).
function deleteLabelPermanently(type) {
  if (!confirm(`Supprimer définitivement le label "${getFormLabelConfig(type)?.fr || type}" ?`)) return;
  if (_isCustomLabelType(type)) {
    delete _D.custom_labels[type];
  } else {
    if (!_D.deleted_labels) _D.deleted_labels = [];
    if (!_D.deleted_labels.includes(type)) _D.deleted_labels.push(type);
  }
  if (_D.form_label_overrides) delete _D.form_label_overrides[type];
  saveData();
  _pushLabelOverrideToCloud(type);
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label supprimé définitivement.', 'success');
}

function restoreDeletedLabel(type) {
  _D.deleted_labels = (_D.deleted_labels||[]).filter(t => t !== type);
  saveData();
  _pushLabelOverrideToCloud(type);
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label restauré.', 'success');
}

// Crée un nouveau label personnalisé (aucun équivalent hardcodé).
function addCustomLabel() {
  const frInput    = document.getElementById('new-label-fr');
  const badgeInput = document.getElementById('new-label-badge');
  const colorInput = document.getElementById('new-label-color');
  const fr = (frInput?.value||'').trim();
  if (!fr) { toast('Indique un nom pour le nouveau label.', 'error'); return; }
  const badge = (badgeInput?.value||'').trim().toUpperCase() || fr.toUpperCase().slice(0, 8);
  const color = colorInput?.value || '#7038F8';

  let slug = _nnLbl(fr).replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  if (!slug) slug = 'label';
  let type = 'custom-' + slug, i = 2;
  while (FORM_LABELS[type] || (_D.custom_labels||{})[type]) { type = `custom-${slug}-${i++}`; }

  if (!_D.custom_labels) _D.custom_labels = {};
  _D.custom_labels[type] = { fr, badge, color, prefixes: [], suffixes: [] };
  saveData();
  _pushLabelOverrideToCloud(type);
  if (frInput) frInput.value = '';
  if (badgeInput) badgeInput.value = '';
  renderLabelsList();
  toast('Label créé.', 'success');
}

// ── Assignation manuelle d'un label à un Pokémon précis ─────────────────────
// Construit les <option> du sélecteur d'assignation, en marquant l'option
// actuellement sélectionnée pour ce Pokémon (slug PokéAPI).
function _buildLabelAssignOptions(slug) {
  const assigned = (_D.pokemon_label_assignments||{})[slug];
  const autoSel    = assigned === undefined ? 'selected' : '';
  const noneSel    = assigned === '' ? 'selected' : '';
  let opts = `<option value="" ${autoSel}>Auto (détection)</option>
    <option value="__clear__" ${noneSel}>Aucun label</option>`;
  _allLabelTypes().forEach(type => {
    const cfg = getFormLabelConfig(type);
    if (!cfg) return;
    const sel = assigned === type ? 'selected' : '';
    opts += `<option value="${type}" ${sel}>${(cfg.fr||type)}</option>`;
  });
  return opts;
}

// value: '' → retour à l'auto-détection, '__clear__' → forcer "aucun label",
// sinon → type de label assigné. reopenType/A/B permettent de rouvrir la même
// fiche juste après pour refléter le changement immédiatement.
async function assignPokemonLabel(slug, value, reopenType, reopenA, reopenB) {
  if (!_D.pokemon_label_assignments) _D.pokemon_label_assignments = {};
  if (value === '') delete _D.pokemon_label_assignments[slug];
  else if (value === '__clear__') _D.pokemon_label_assignments[slug] = '';
  else _D.pokemon_label_assignments[slug] = value;
  saveData();
  _pushLabelSettingsToCloud();
  toast('Label du Pokémon mis à jour.', 'success');
  try { await _loadFormsList(); } catch(_) {}
  if (reopenType === 'base') openPokedexModal(reopenA);
  else if (reopenType === 'form') openPokedexFormModal(reopenA, reopenB);
}

// ── Sync cloud des labels (table Supabase dédiée form_label_overrides) ─────
// Chaque ligne = un couple (user_id, form_type) : surcharge d'un label
// intégré, définition d'un label personnalisé, ou marqueur de suppression
// définitive. Contrairement au blob JSON complet de "Synchroniser"
// (Paramètres), ce sync est automatique : chaque modification est poussée
// immédiatement, et les données cloud sont récupérées une fois au chargement.
let _labelCloudPulled = false;

function _labelUserId() {
  return (window.__PC_CLOUD_CONFIG__ && window.__PC_CLOUD_CONFIG__.user_id) || 'default';
}

async function _pullLabelOverridesFromCloud() {
  if (_labelCloudPulled) return;
  _labelCloudPulled = true;
  try {
    // Tri explicite par date de mise à jour décroissante : sans lui, l'ordre
    // renvoyé par PostgREST n'est pas garanti, et une éventuelle ligne en
    // double pour le même form_type (le POST d'upsert ne dédoublonne que s'il
    // existe une contrainte d'unicité côté base) pouvait gagner au hasard.
    const res = await fetch(`${SB_URL}/rest/v1/form_label_overrides?user_id=eq.${encodeURIComponent(_labelUserId())}&order=updated_at.desc`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) return; // table absente ou policy manquante : on reste en local
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;
    if (!_D.form_label_overrides)  _D.form_label_overrides  = {};
    if (!_D.custom_labels)         _D.custom_labels         = {};
    if (!_D.deleted_labels)        _D.deleted_labels        = [];
    if (!_D.label_local_ts)        _D.label_local_ts        = {};

    const seen = new Set();
    let changed = false;
    rows.forEach(r => {
      if (seen.has(r.form_type)) return; // doublon plus ancien pour ce type (tri desc) : ignoré
      seen.add(r.form_type);

      // Rempart anti-perte de données : si CE navigateur a modifié ce label
      // localement et que le cloud ne s'est pas (encore, ou jamais, en cas
      // d'échec silencieux du push) mis à jour avec une date plus récente, on
      // garde la version locale. Sans ce garde-fou, un simple F5 juste après
      // une modification pouvait ramener l'ancienne valeur cloud et l'écrire
      // par-dessus l'édition qu'on venait de faire.
      const localTs = _D.label_local_ts[r.form_type] || 0;
      const cloudTs = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      if (localTs && cloudTs <= localTs) return;

      changed = true;
      if (r.is_deleted) {
        if (!_D.deleted_labels.includes(r.form_type)) _D.deleted_labels.push(r.form_type);
        return;
      }
      if (r.is_custom) {
        _D.custom_labels[r.form_type] = {
          fr: r.fr || r.form_type, badge: r.badge || '?', color: r.color || '#888',
          prefixes: Array.isArray(r.prefixes) ? r.prefixes : [],
          suffixes: Array.isArray(r.suffixes) ? r.suffixes : [],
          enabled: r.enabled !== false,
        };
        return;
      }
      const ov = {};
      if (r.fr)    ov.fr    = r.fr;
      if (r.badge) ov.badge = r.badge;
      if (r.color) ov.color = r.color;
      if (r.enabled === false) ov.enabled = false;
      if (Array.isArray(r.prefixes) && r.prefixes.length) ov.prefixes = r.prefixes;
      if (Array.isArray(r.suffixes) && r.suffixes.length) ov.suffixes = r.suffixes;
      if (Object.keys(ov).length) _D.form_label_overrides[r.form_type] = ov;
      else delete _D.form_label_overrides[r.form_type];
    });
    if (changed) saveData();
  } catch(e) { console.warn('[PTCG] pull labels cloud error:', e.message); }
}

async function _pushLabelOverrideToCloud(type) {
  // On mémorise l'horodatage de cette modification locale AVANT toute requête
  // réseau : même si le push échoue, est interrompu (page rechargée juste
  // après) ou que la table cloud contient des doublons mal triés, la
  // prochaine synchronisation ne pourra plus jamais écraser ce label avec une
  // valeur cloud plus ancienne que ce que l'on vient de faire ici.
  if (!_D.label_local_ts) _D.label_local_ts = {};
  _D.label_local_ts[type] = Date.now();
  saveData();
  try {
    const isCustom  = _isCustomLabelType(type);
    const isDeleted = (_D.deleted_labels||[]).includes(type);
    const custom    = isCustom ? _D.custom_labels[type] : null;
    const ov        = (_D.form_label_overrides||{})[type];

    if (isCustom && !custom) {
      // Label personnalisé supprimé → ligne cloud supprimée
      await fetch(`${SB_URL}/rest/v1/form_label_overrides?user_id=eq.${encodeURIComponent(_labelUserId())}&form_type=eq.${encodeURIComponent(type)}`,
        { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      return;
    }
    if (!isCustom && !isDeleted && !ov) {
      // Label intégré revenu à sa valeur par défaut → ligne cloud supprimée
      await fetch(`${SB_URL}/rest/v1/form_label_overrides?user_id=eq.${encodeURIComponent(_labelUserId())}&form_type=eq.${encodeURIComponent(type)}`,
        { method: 'DELETE', headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      return;
    }
    const payload = isCustom ? {
      user_id: _labelUserId(), form_type: type, is_custom: true, is_deleted: false,
      fr: custom.fr || null, badge: custom.badge || null, color: custom.color || null,
      enabled: custom.enabled === false ? false : null,
      prefixes: custom.prefixes?.length ? custom.prefixes : null,
      suffixes: custom.suffixes?.length ? custom.suffixes : null,
      updated_at: new Date().toISOString(),
    } : isDeleted ? {
      user_id: _labelUserId(), form_type: type, is_custom: false, is_deleted: true,
      fr: null, badge: null, color: null, enabled: null, prefixes: null, suffixes: null,
      updated_at: new Date().toISOString(),
    } : {
      user_id: _labelUserId(), form_type: type, is_custom: false, is_deleted: false,
      fr: ov.fr || null, badge: ov.badge || null, color: ov.color || null,
      enabled: ov.enabled === false ? false : null,
      prefixes: ov.prefixes || null, suffixes: ov.suffixes || null,
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${SB_URL}/rest/v1/form_label_overrides`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(()=>'');
      console.warn('[PTCG] push label cloud HTTP', res.status, body);
      toast(`Supabase (label) : échec HTTP ${res.status}`, 'error');
    }
  } catch(e) {
    console.warn('[PTCG] push label cloud error:', e.message);
    toast('Supabase (label) : ' + e.message, 'error');
  }
}

// ── Sync cloud des réglages annexes (assignations par Pokémon + catégories) ─
// Contrairement aux labels (une ligne par form_type), ce sont ici de simples
// réglages qu'on stocke comme UN SEUL blob JSON par utilisateur, dans la
// table Supabase dédiée label_settings (SQL de création plus bas).
let _labelSettingsPulled = false;

async function _pushLabelSettingsToCloud() {
  _D.label_settings_ts = Date.now();
  saveData();
  try {
    const payload = {
      user_id: _labelUserId(),
      pokemon_label_assignments:  _D.pokemon_label_assignments || {},
      custom_label_categories:    _D.custom_label_categories || [],
      label_category_order:       _D.label_category_order || [],
      label_category_assignments: _D.label_category_assignments || {},
      label_category_overrides:   _D.label_category_overrides || {},
      updated_at: new Date().toISOString(),
    };
    const res = await fetch(`${SB_URL}/rest/v1/label_settings`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(()=>'');
      console.warn('[PTCG] push label settings HTTP', res.status, body);
      toast(`Supabase (catégories/labels Pokémon) : échec HTTP ${res.status}`, 'error');
    }
  } catch(e) {
    console.warn('[PTCG] push label settings error:', e.message);
    toast('Supabase (catégories/labels Pokémon) : ' + e.message, 'error');
  }
}

async function _pullLabelSettingsFromCloud() {
  if (_labelSettingsPulled) return;
  _labelSettingsPulled = true;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/label_settings?user_id=eq.${encodeURIComponent(_labelUserId())}`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) return; // table absente ou policy manquante : on reste en local
    const rows = await res.json();
    if (!Array.isArray(rows) || !rows.length) return;
    const r = rows[0];
    const cloudTs = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    const localTs = _D.label_settings_ts || 0;
    if (localTs && cloudTs <= localTs) return; // notre version locale est au moins aussi récente
    _D.pokemon_label_assignments  = r.pokemon_label_assignments  || {};
    _D.custom_label_categories    = r.custom_label_categories    || [];
    _D.label_category_order       = r.label_category_order       || [];
    _D.label_category_assignments = r.label_category_assignments || {};
    _D.label_category_overrides   = r.label_category_overrides   || {};
    _D.label_settings_ts = cloudTs;
    saveData();
  } catch(e) { console.warn('[PTCG] pull label settings error:', e.message); }
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
  if (!e.target.closest('#pkdx-forms-panel') && !e.target.closest('#pkdx-forms-toggle'))
    _closePkdxFormsPanel();
  if (!e.target.closest('#pkdx-tcg-ext-panel') && !e.target.closest('#pkdx-tcg-ext-toggle'))
    _closeModalExtPanel();
  if (!e.target.closest('#add-ext-classeur-panel') && !e.target.closest('#add-ext-classeur-toggle')) {
    const p = document.getElementById('add-ext-classeur-panel');
    if (p) p.style.display = 'none';
  }
});

// ── Pokédex extension filter (multi-sélection) ──────────────────────────────
// null = pas de filtre, sinon Map<extId, {setId, name}> — plusieurs
// extensions peuvent être choisies simultanément.
let _pkdxExtFilter = null;

function _closePkdxExtPanel() {
  const panel = document.getElementById('pkdx-ext-panel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('pkdx-ext-toggle');
  if (btn) btn.classList.toggle('active', !!_pkdxExtFilter);
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

// Liste groupée par bloc (ordre des blocs) puis triée par code au sein de
// chaque bloc (sortExts, comme partout ailleurs dans l'appli), avec l'image
// sigle de chaque extension affichée à côté de son nom.
function _buildExtFilterList() {
  const el = document.getElementById('pkdx-ext-list');
  if (!el) return;
  const mappedExts = getAllExtensions().filter(e => _mapping.mappings[e.id]);
  if (!mappedExts.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.8rem;padding:8px 12px">Aucune extension mappée.</div>';
    return;
  }
  let html = `<div class="pkdx-ext-filter-item pkdx-ext-filter-all ${!_pkdxExtFilter?'active':''}" onclick="setPokedexExtFilterAll()">Toutes les extensions</div>`;
  getBlocs().forEach(bloc => {
    const inBloc = sortExts(mappedExts.filter(e => getBlocForExt(e.id)?.id === bloc.id));
    if (!inBloc.length) return;
    html += `<div class="pkdx-ext-filter-bloc-label">${_escHtml(bloc.nom || bloc.name || bloc.id)}</div>`;
    html += inBloc.map(e => {
      const setId    = _mapping.mappings[e.id].set_id;
      const name     = e.nom || e.name || e.id;
      const active   = _pkdxExtFilter && _pkdxExtFilter.has(e.id) ? 'active' : '';
      const sigleSrc = e.sigle || bloc.sigle || '';
      return `<div class="pkdx-ext-filter-item ${active}" onclick="togglePokedexExtFilterItem('${_escJs(e.id)}','${_escJs(setId)}','${_escJs(name)}')">
        ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="pkdx-ext-filter-sigle" onerror="this.style.display='none'">` : `<span class="pkdx-ext-filter-code">${_escHtml(e.code||'')}</span>`}
        <span>${_escHtml(name)}</span>
      </div>`;
    }).join('');
  });
  el.innerHTML = html;
}

function togglePokedexExtFilterItem(extId, setId, name) {
  if (!_pkdxExtFilter) _pkdxExtFilter = new Map();
  if (_pkdxExtFilter.has(extId)) _pkdxExtFilter.delete(extId);
  else _pkdxExtFilter.set(extId, { setId, name });
  if (_pkdxExtFilter.size === 0) _pkdxExtFilter = null;
  _buildExtFilterList();
  _refreshPokedexExtLabelAndClear();
  _applyPokedexExtFilterAsync();
}

function setPokedexExtFilterAll() {
  _pkdxExtFilter = null;
  _buildExtFilterList();
  _refreshPokedexExtLabelAndClear();
  _applyPokedexExtFilterAsync();
}

function _refreshPokedexExtLabelAndClear() {
  const labelEl  = document.getElementById('pkdx-ext-label');
  const clearBtn = document.getElementById('pkdx-ext-clear');
  if (!_pkdxExtFilter) {
    if (labelEl)  labelEl.textContent = 'Extension';
    if (clearBtn) clearBtn.style.display = 'none';
  } else {
    const names = [..._pkdxExtFilter.values()].map(v => v.name);
    if (labelEl)  labelEl.textContent = names.length === 1 ? names[0] : names.length + ' extensions';
    if (clearBtn) clearBtn.style.display = '';
  }
}

// Recalcule la liste des noms de cartes correspondant à TOUTES les extensions
// sélectionnées (union), pour filtrer la grille principale du Pokédex.
async function _applyPokedexExtFilterAsync() {
  if (!_pkdxExtFilter) {
    _pkdx.extFilterNames = null;
  } else {
    try {
      const baseEntries = new Set();
      const formEntries = new Set();
      await Promise.all([..._pkdxExtFilter.values()].map(async v => {
        const res = await fetch(`${SB_URL}/rest/v1/cards?set_id=eq.${encodeURIComponent(v.setId)}&select=name`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range': '0-999' } });
        const cards = await res.json();
        const parsed = _parseTcgCardNames(cards.map(c => c.name || ''));
        parsed.baseEntries.forEach(n => baseEntries.add(n));
        parsed.formEntries.forEach(n => formEntries.add(n));
      }));
      _pkdx.extFilterNames = { baseEntries, formEntries };
    } catch(e) { _pkdx.extFilterNames = null; }
  }

  // Force load forms and all frNames
  const prevShowForms = _pkdx.showForms;
  _pkdx.showForms = true;
  if (!_pkdx.formsLoaded) await _loadFormsList();
  await _hydrateAllFrNames();
  _pkdx.showForms = prevShowForms;
  _closePkdxFormsPanel();

  _applyPokedexFilter();
}

// Bouton "×" du topbar : annule complètement le filtre d'extension du
// Pokédex, y compris — puisqu'il n'aurait plus de sens sans lui — le filtre
// local d'une fiche Pokémon actuellement ouverte.
function clearPokedexExtFilter() {
  _pkdxExtFilter = null;
  _pkdx.extFilterNames = null;
  _refreshPokedexExtLabelAndClear();
  if (document.getElementById('pkdx-ext-list')) _buildExtFilterList();
  if (_pkdx.initialized) _applyPokedexFilter();
  if (_pkdxModalTcg) {
    _pkdxModalTcg.filterExtIds = null;
    _renderPkdxTcgGroups();
    _buildModalExtFilterList();
  }
}

// Analyse les noms de cartes TCG d'une extension et détermine, pour chacune,
// à quel Pokémon PRÉCIS elle correspond : soit le Pokémon de base, soit une
// forme spéciale précise (jamais les deux). Réutilise les mêmes motifs
// préfixe/suffixe que le reste de l'appli (Édition › Labels / getFormLabelConfig)
// au lieu d'une liste de regex séparée — celle-ci ne reconnaissait ni les
// accents français ("Méga"), ni les abréviations TCGdex ("M "), ce qui
// empêchait la plupart des formes de ressortir dans le filtre par extension.
// Retour : { baseEntries: Set<string>, formEntries: Set<"baseName|formType"> }
function _parseTcgCardNames(cardNames) {
  const suffixRe = /\b(ex|v|vmax|vstar|gx|lv ?x|radieux|obscur|brillant|delta|turbo|break|prime|legend|origine|couronne)\b/g;

  // Types les plus "spécifiques" (ayant un suffixe requis, ex. mega-x/mega-y/gmax)
  // testés avant les types plus permissifs (ex. mega, qui n'exige aucun
  // suffixe) — sinon une carte "Méga-Dracaufeu X" serait classée "mega" avant
  // d'avoir eu la chance d'être reconnue comme "mega-x".
  const linkedTypes = _allLinkedFormTypes().sort((a, b) => {
    const sa = (getFormLabelConfig(a).suffixes||[]).length ? 1 : 0;
    const sb = (getFormLabelConfig(b).suffixes||[]).length ? 1 : 0;
    return sb - sa;
  });

  const baseEntries = new Set();
  const formEntries = new Set();

  cardNames.forEach(raw => {
    const cardName = (raw || '').trim();
    if (!cardName) return;

    let matchedType = null;
    for (const type of linkedTypes) {
      if (_cardMatchesFormType(cardName, type)) { matchedType = type; break; }
    }

    // Nom normalisé (accents/casse retirés), duquel on retire le motif de
    // forme détecté (préfixe et/ou suffixe) pour ne garder que le nom du
    // Pokémon lui-même.
    let residual = _nnLbl(cardName);
    if (matchedType) {
      const cfg = getFormLabelConfig(matchedType);
      [...(cfg.prefixes||[]), ...(cfg.suffixes||[])].forEach(pat => {
        const np = _nnLbl(pat);
        if (!np) return;
        residual = residual.replace(new RegExp('\\b'+_escRe(np)+'\\b', 'g'), ' ');
      });
    }
    residual = residual.replace(suffixRe, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if (!residual) return;

    if (matchedType) formEntries.add(residual + '|' + matchedType);
    else             baseEntries.add(residual);
  });

  return { baseEntries, formEntries };
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
    ventes:[],acheteurs:[],depenses:[],vendeurs:[],
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
//  VENTES / ACHETEURS / DÉPENSES / VENDEURS
// ═══════════════════════════════════════════════════════════════════════════

const CARD_CONDITIONS = ['Mint','Near Mint','Excellent','Good','Light Played','Poor'];
const VENTE_TYPES = [
  { id:'normale',      label:'Normale' },
  { id:'reverse',      label:'Reverse' },
  { id:'holo_cosmos',  label:'Holo Cosmos' },
  { id:'1ere_edition', label:'1ère édition' },
];
const TCG_LANGUES = ['Français','Anglais','Japonais','Allemand','Italien','Espagnol','Portugais','Néerlandais','Coréen','Chinois'];

const ACHETEUR_STATUTS = [
  { id:'a_envoyer', label:'À envoyer', cls:'status-a-envoyer', color:'#f97316' },
  { id:'envoye',    label:'Envoyé',    cls:'status-envoye',    color:'#4a9eff' },
  { id:'arrive',    label:'Arrivé',    cls:'status-arrive',    color:'#22c55e' },
];
const VENDEUR_STATUTS = [
  { id:'a_payer', label:'À payer', cls:'status-a-payer', color:'#f97316' },
  { id:'paye',    label:'Payé',    cls:'status-paye',    color:'#4a9eff' },
  { id:'arrive',  label:'Arrivé',  cls:'status-arrive',  color:'#22c55e' },
];

const ICON_EDIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
const ICON_DELETE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>';
const ICON_LINK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.07 0l2.83-2.83a5 5 0 00-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 00-7.07 0L4.1 13.83a5 5 0 007.07 7.07l1.5-1.5"/></svg>';

function _venteId()    { return 'vt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _acheteurId() { return 'ac_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _depenseId()  { return 'dp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _vendeurId()  { return 'vd_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

function _jsEscape(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

function _fmtDate(iso) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y,m,d] = parts;
  return `${d}/${m}/${y}`;
}

// ── Agrégats ─────────────────────────────────────────────────────────────
function acheteurVentes(acheteurId) { return (_D.ventes||[]).filter(v => v.acheteur_id === acheteurId); }
function acheteurTotal(acheteurId)  { return acheteurVentes(acheteurId).reduce((s,v)=>s+(parseFloat(v.prix)||0),0); }
function vendeurDepenses(vendeurId) { return (_D.depenses||[]).filter(d => d.vendeur_id === vendeurId); }
function vendeurTotal(vendeurId)    { return vendeurDepenses(vendeurId).reduce((s,d)=>s+(parseFloat(d.prix)||0),0); }

// ── État des filtres/recherche ──────────────────────────────────────────
let _venteFilter = 'all', _depenseFilter = 'all', _acheteurFilter = 'all', _vendeurFilter = 'all';
let _venteQuery = '', _depenseQuery = '', _acheteurQuery = '', _vendeurQuery = '';
let _acheteurReturnTo = null, _vendeurReturnTo = null;
let _lastCreatedAcheteurId = null, _lastCreatedVendeurId = null;

// ── Item row (utilisé dans les cartes Acheteur/Vendeur) ─────────────────
function _orderItemRowHtml(item, kind) {
  const editFn = kind === 'vente' ? 'editVente' : 'editDepense';
  const delFn  = kind === 'vente' ? 'deleteVente' : 'deleteDepense';
  return `<div class="order-item-row">
    <div class="order-item-thumb">${item.card_image ? `<img src="${item.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="order-item-info">
      <div class="order-item-name">${item.card_name || item.pokemon_name || '—'}</div>
      <div class="order-item-meta">${item.set_name||''}${item.number?' · N°'+item.number:''} · ${item.etat||''}</div>
    </div>
    <div class="order-item-price">${(parseFloat(item.prix)||0).toFixed(2)} €</div>
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid';

  let items = [...(_D.ventes||[])];
  if (_venteFilter === 'unlinked') items = items.filter(v => !v.acheteur_id);
  if (_venteFilter === 'linked')   items = items.filter(v => !!v.acheteur_id);
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

function renderVentesStats() {
  const el = document.getElementById('ventes-stats'); if (!el) return;
  const all = _D.ventes||[];
  const linked   = all.filter(v => v.acheteur_id);
  const unlinked = all.filter(v => !v.acheteur_id);
  const sum = arr => arr.reduce((s,v)=>s+(parseFloat(v.prix)||0),0);
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Cartes au total</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${unlinked.length}</div><div class="lbl">En vente</div><div class="sub">${sum(unlinked).toFixed(2)} €</div></div>
    <div class="stat-card" style="--accent-color:var(--green)"><div class="val">${linked.length}</div><div class="lbl">Vendues</div><div class="sub">${sum(linked).toFixed(2)} €</div></div>
    <div class="stat-card" style="--accent-color:var(--gold)"><div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Valeur totale</div></div>`;
}

function buildVenteCard(v) {
  const acheteur = v.acheteur_id ? (_D.acheteurs||[]).find(a=>a.id===v.acheteur_id) : null;
  const typesHtml = (v.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip">${info.label}</span>` : ''; }).join('');
  const card = document.createElement('div');
  card.className = 'sale-card';
  card.innerHTML = `
    <div class="sale-card-top">
      <div class="sale-card-thumb">${v.card_image ? `<img src="${v.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
      <div class="sale-card-info">
        <div class="sale-card-name">${v.card_name || v.pokemon_name || '—'}</div>
        <div class="sale-card-meta">${v.set_name||''}${v.number?' · N°'+v.number:''}</div>
      </div>
      <div class="sale-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVente('${v.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVente('${v.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${v.etat||'—'}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${(parseFloat(v.prix)||0).toFixed(2)} €</span></div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${v.langue||'—'}</span></div>
      <div class="sale-acheteur ${acheteur ? '' : 'unlinked'}">${acheteur ? '👤 '+acheteur.pseudo : '— Pas encore vendu —'}</div>
      ${v.lien_vente ? `<a href="${v.lien_vente}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de la vente</a>` : ''}
    </div>`;
  return card;
}

function buildVenteRow(v) {
  const acheteur = v.acheteur_id ? (_D.acheteurs||[]).find(a=>a.id===v.acheteur_id) : null;
  const typesHtml = (v.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip sm">${info.label}</span>` : ''; }).join('');
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  row.innerHTML = `
    <div class="sale-list-thumb">${v.card_image ? `<img src="${v.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="sale-list-main">
      <div class="sale-list-name">${v.card_name || v.pokemon_name || '—'}</div>
      <div class="sale-list-meta">${v.set_name||''}${v.number?' · N°'+v.number:''} · ${v.etat||'—'} · ${v.langue||'—'}</div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
    </div>
    <div class="sale-list-price">${(parseFloat(v.prix)||0).toFixed(2)} €</div>
    <div class="sale-list-acheteur ${acheteur ? '' : 'unlinked'}">${acheteur ? '👤 '+acheteur.pseudo : '— Non vendu —'}</div>
    <div class="sale-list-actions">
      ${v.lien_vente ? `<a href="${v.lien_vente}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien">${ICON_LINK}</a>` : ''}
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
  sel.innerHTML = '<option value="">— Pas encore vendu —</option>' + opts;
}

function openAddVenteModal(acheteurId) {
  const modal = document.getElementById('modal-vente');
  delete modal.dataset.editId;
  document.getElementById('modal-vente-title').textContent = 'Nouvelle vente';
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name'].forEach(f => {
    const el = document.getElementById('vente-'+f); if (el) el.value = '';
  });
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = 'Near Mint';
  document.getElementById('vente-prix-input').value = '';
  document.getElementById('vente-langue-select').value = 'Français';
  document.getElementById('vente-lien-input').value = '';
  _setChipGroup('vente-type-chips', []);
  populateAcheteurSelect(acheteurId || '');
  modal.classList.add('open');
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
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = v.etat||'Near Mint';
  document.getElementById('vente-prix-input').value = v.prix||'';
  document.getElementById('vente-langue-select').value = v.langue||'Français';
  document.getElementById('vente-lien-input').value = v.lien_vente||'';
  _setChipGroup('vente-type-chips', v.types||[]);
  populateAcheteurSelect(v.acheteur_id||'');
  modal.classList.add('open');
}

function saveVente() {
  const modal = document.getElementById('modal-vente');
  const cardName = document.getElementById('vente-card-name').value;
  if (!cardName) { toast('Veuillez choisir une carte.','error'); return; }
  const data = {
    card_id:      document.getElementById('vente-card-id').value,
    card_name:    cardName,
    card_image:   document.getElementById('vente-card-image').value,
    set_id:       document.getElementById('vente-set-id').value,
    set_name:     document.getElementById('vente-set-name').value,
    set_logo:     document.getElementById('vente-set-logo').value,
    number:       document.getElementById('vente-number').value,
    rarity:       document.getElementById('vente-rarity').value,
    pokemon_name: document.getElementById('vente-pokemon-name').value || cardName,
    etat:         document.getElementById('vente-etat-select').value,
    prix:         parseFloat(document.getElementById('vente-prix-input').value) || 0,
    types:        _getChipGroup('vente-type-chips'),
    langue:       document.getElementById('vente-langue-select').value,
    lien_vente:   document.getElementById('vente-lien-input').value.trim(),
    acheteur_id:  document.getElementById('vente-acheteur-select').value || null,
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid';

  let items = [...(_D.depenses||[])];
  if (_depenseFilter === 'unlinked') items = items.filter(d => !d.vendeur_id);
  if (_depenseFilter === 'linked')   items = items.filter(d => !!d.vendeur_id);
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
  const linked   = all.filter(d => d.vendeur_id);
  const unlinked = all.filter(d => !d.vendeur_id);
  const sum = arr => arr.reduce((s,d)=>s+(parseFloat(d.prix)||0),0);
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Cartes au total</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${unlinked.length}</div><div class="lbl">Sans vendeur</div><div class="sub">${sum(unlinked).toFixed(2)} €</div></div>
    <div class="stat-card" style="--accent-color:var(--green)"><div class="val">${linked.length}</div><div class="lbl">Avec vendeur</div><div class="sub">${sum(linked).toFixed(2)} €</div></div>
    <div class="stat-card" style="--accent-color:var(--gold)"><div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Dépensé au total</div></div>`;
}

function buildDepenseCard(d) {
  const vendeur = d.vendeur_id ? (_D.vendeurs||[]).find(x=>x.id===d.vendeur_id) : null;
  const typesHtml = (d.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip">${info.label}</span>` : ''; }).join('');
  const card = document.createElement('div');
  card.className = 'sale-card';
  card.innerHTML = `
    <div class="sale-card-top">
      <div class="sale-card-thumb">${d.card_image ? `<img src="${d.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
      <div class="sale-card-info">
        <div class="sale-card-name">${d.card_name || d.pokemon_name || '—'}</div>
        <div class="sale-card-meta">${d.set_name||''}${d.number?' · N°'+d.number:''}</div>
      </div>
      <div class="sale-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editDepense('${d.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteDepense('${d.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${d.etat||'—'}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${(parseFloat(d.prix)||0).toFixed(2)} €</span></div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${d.langue||'—'}</span></div>
      <div class="sale-acheteur ${vendeur ? '' : 'unlinked'}">${vendeur ? '🏷️ '+vendeur.pseudo : '— Aucun vendeur —'}</div>
      ${d.lien_achat ? `<a href="${d.lien_achat}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de l'achat</a>` : ''}
    </div>`;
  return card;
}

function buildDepenseRow(d) {
  const vendeur = d.vendeur_id ? (_D.vendeurs||[]).find(x=>x.id===d.vendeur_id) : null;
  const typesHtml = (d.types||[]).map(t => { const info = VENTE_TYPES.find(x=>x.id===t); return info ? `<span class="type-chip sm">${info.label}</span>` : ''; }).join('');
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  row.innerHTML = `
    <div class="sale-list-thumb">${d.card_image ? `<img src="${d.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="sale-list-main">
      <div class="sale-list-name">${d.card_name || d.pokemon_name || '—'}</div>
      <div class="sale-list-meta">${d.set_name||''}${d.number?' · N°'+d.number:''} · ${d.etat||'—'} · ${d.langue||'—'}</div>
      ${typesHtml ? `<div class="sale-types">${typesHtml}</div>` : ''}
    </div>
    <div class="sale-list-price">${(parseFloat(d.prix)||0).toFixed(2)} €</div>
    <div class="sale-list-acheteur ${vendeur ? '' : 'unlinked'}">${vendeur ? '🏷️ '+vendeur.pseudo : '— Aucun vendeur —'}</div>
    <div class="sale-list-actions">
      ${d.lien_achat ? `<a href="${d.lien_achat}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien">${ICON_LINK}</a>` : ''}
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

function openAddDepenseModal(vendeurId) {
  const modal = document.getElementById('modal-depense');
  delete modal.dataset.editId;
  document.getElementById('modal-depense-title').textContent = 'Nouvel achat';
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name'].forEach(f => {
    const el = document.getElementById('depense-'+f); if (el) el.value = '';
  });
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = 'Near Mint';
  document.getElementById('depense-prix-input').value = '';
  document.getElementById('depense-langue-select').value = 'Français';
  document.getElementById('depense-lien-input').value = '';
  _setChipGroup('depense-type-chips', []);
  populateVendeurSelect(vendeurId || '');
  modal.classList.add('open');
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
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = d.etat||'Near Mint';
  document.getElementById('depense-prix-input').value = d.prix||'';
  document.getElementById('depense-langue-select').value = d.langue||'Français';
  document.getElementById('depense-lien-input').value = d.lien_achat||'';
  _setChipGroup('depense-type-chips', d.types||[]);
  populateVendeurSelect(d.vendeur_id||'');
  modal.classList.add('open');
}

function saveDepense() {
  const modal = document.getElementById('modal-depense');
  const cardName = document.getElementById('depense-card-name').value;
  if (!cardName) { toast('Veuillez choisir une carte.','error'); return; }
  const data = {
    card_id:      document.getElementById('depense-card-id').value,
    card_name:    cardName,
    card_image:   document.getElementById('depense-card-image').value,
    set_id:       document.getElementById('depense-set-id').value,
    set_name:     document.getElementById('depense-set-name').value,
    set_logo:     document.getElementById('depense-set-logo').value,
    number:       document.getElementById('depense-number').value,
    rarity:       document.getElementById('depense-rarity').value,
    pokemon_name: document.getElementById('depense-pokemon-name').value || cardName,
    etat:         document.getElementById('depense-etat-select').value,
    prix:         parseFloat(document.getElementById('depense-prix-input').value) || 0,
    types:        _getChipGroup('depense-type-chips'),
    langue:       document.getElementById('depense-langue-select').value,
    lien_achat:   document.getElementById('depense-lien-input').value.trim(),
    vendeur_id:   document.getElementById('depense-vendeur-select').value || null,
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid';

  let items = [...(_D.acheteurs||[])];
  if (_acheteurFilter !== 'all') items = items.filter(a => (a.etat||'a_envoyer') === _acheteurFilter);
  if (_acheteurQuery) { const q = _normalizeStr(_acheteurQuery); items = items.filter(a => _normalizeStr(a.pseudo||'').includes(q)); }
  items.sort((a,b) => (b.date_achat||'').localeCompare(a.date_achat||''));

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
  const nbCards = (_D.ventes||[]).filter(v=>v.acheteur_id).length;
  const enCours = all.filter(a => (a.etat||'a_envoyer') !== 'arrive').length;
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Acheteurs</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${nbCards}</div><div class="lbl">Cartes vendues</div></div>
    <div class="stat-card" style="--accent-color:var(--gold)"><div class="val">${totalVal.toFixed(2)} €</div><div class="lbl">Total encaissé</div></div>
    <div class="stat-card" style="--accent-color:var(--green)"><div class="val">${enCours}</div><div class="lbl">En cours d'envoi</div></div>`;
}

function buildAcheteurCard(a) {
  const ventes = acheteurVentes(a.id);
  const total  = acheteurTotal(a.id);
  const st = ACHETEUR_STATUTS.find(s=>s.id===(a.etat||'a_envoyer')) || ACHETEUR_STATUTS[0];
  const card = document.createElement('div');
  card.className = 'order-card';
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">👤</div>
      <div class="order-card-info">
        <div class="order-card-name">${a.pseudo}</div>
        <div class="order-card-meta">${a.date_achat?_fmtDate(a.date_achat):'—'}${a.date_arrivee?' → '+_fmtDate(a.date_arrivee):''}</div>
        <div class="status-badge ${st.cls}">${st.label}</div>
      </div>
      <div class="order-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editAcheteur('${a.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteAcheteur('${a.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="order-card-body">
      <div class="order-stat-row"><span>${ventes.length} carte${ventes.length>1?'s':''}</span><span class="order-total">${total.toFixed(2)} €</span></div>
      ${a.lien_vente ? `<a href="${a.lien_vente}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de la vente</a>` : ''}
      <div class="order-items-list">${ventes.map(v=>_orderItemRowHtml(v,'vente')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddVenteModal('${a.id}')">+ Ajouter une carte</button>
    </div>`;
  return card;
}

function buildAcheteurRow(a) {
  const ventes = acheteurVentes(a.id);
  const total  = acheteurTotal(a.id);
  const st = ACHETEUR_STATUTS.find(s=>s.id===(a.etat||'a_envoyer')) || ACHETEUR_STATUTS[0];
  const uid = `acc-ach-${a.id}`;
  const row = document.createElement('div');
  row.className = 'classeur-list-row';
  row.innerHTML = `
    <div class="clr-header" onclick="toggleClrAccordion('${uid}', this)">
      <div class="clr-thumb" style="background:linear-gradient(135deg,${st.color}33,${st.color}55)"><span style="font-size:1.1rem">👤</span></div>
      <div class="clr-accent-bar" style="background:${st.color}"></div>
      <div class="clr-info">
        <div class="clr-name">${a.pseudo} <span class="status-badge ${st.cls}">${st.label}</span></div>
        <div class="clr-meta">${a.date_achat?_fmtDate(a.date_achat):'—'}${a.date_arrivee?' → '+_fmtDate(a.date_arrivee):''} · ${ventes.length} carte${ventes.length>1?'s':''}</div>
      </div>
      <div class="clr-right"><div class="order-total" style="font-size:.92rem">${total.toFixed(2)} €</div></div>
      <div class="clr-actions" onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editAcheteur('${a.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteAcheteur('${a.id}')">${ICON_DELETE}</button>
        <div class="clr-chevron" id="chev-${uid}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    <div class="clr-body" id="${uid}">
      ${a.lien_vente ? `<a href="${a.lien_vente}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de la vente</a>` : ''}
      <div class="order-items-list">${ventes.map(v=>_orderItemRowHtml(v,'vente')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddVenteModal('${a.id}')">+ Ajouter une carte</button>
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

function setAcheteurStatusInput(status) {
  document.getElementById('acheteur-status-input').value = status;
  document.querySelectorAll('#acheteur-status-select .classeur-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status===status));
}

function openAddAcheteurModal() {
  const modal = document.getElementById('modal-acheteur');
  delete modal.dataset.editId;
  document.getElementById('modal-acheteur-title').textContent = 'Nouvel acheteur';
  document.getElementById('acheteur-pseudo-input').value = '';
  document.getElementById('acheteur-date-achat-input').value = new Date().toISOString().slice(0,10);
  document.getElementById('acheteur-date-arrivee-input').value = '';
  document.getElementById('acheteur-lien-input').value = '';
  setAcheteurStatusInput('a_envoyer');
  modal.classList.add('open');
}

function editAcheteur(id) {
  const a = (_D.acheteurs||[]).find(x=>x.id===id); if (!a) return;
  const modal = document.getElementById('modal-acheteur');
  modal.dataset.editId = id;
  document.getElementById('modal-acheteur-title').textContent = "Modifier l'acheteur";
  document.getElementById('acheteur-pseudo-input').value = a.pseudo||'';
  document.getElementById('acheteur-date-achat-input').value = a.date_achat||'';
  document.getElementById('acheteur-date-arrivee-input').value = a.date_arrivee||'';
  document.getElementById('acheteur-lien-input').value = a.lien_vente||'';
  setAcheteurStatusInput(a.etat||'a_envoyer');
  modal.classList.add('open');
}

function saveAcheteur() {
  const modal = document.getElementById('modal-acheteur');
  const pseudo = document.getElementById('acheteur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const data = {
    pseudo,
    date_achat:   document.getElementById('acheteur-date-achat-input').value || '',
    date_arrivee: document.getElementById('acheteur-date-arrivee-input').value || '',
    lien_vente:   document.getElementById('acheteur-lien-input').value.trim(),
    etat:         document.getElementById('acheteur-status-input').value || 'a_envoyer',
  };
  const editId = modal.dataset.editId;
  if (editId) {
    const a = _D.acheteurs.find(x=>x.id===editId);
    if (a) { Object.assign(a, data); a.updated_at = Date.now(); }
    toast('Acheteur mis à jour !','success');
  } else {
    const newId = _acheteurId();
    _D.acheteurs.push({ id:newId, ...data, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedAcheteurId = newId;
    toast('Acheteur ajouté !','success');
  }
  saveData(); renderAll(); closeModal('modal-acheteur');
}

function deleteAcheteur(id) {
  const linked = acheteurVentes(id).length;
  const msg = linked ? `Supprimer cet acheteur ? ${linked} vente(s) liée(s) seront détachées (pas supprimées).` : 'Supprimer cet acheteur ?';
  if (!confirm(msg)) return;
  _D.acheteurs = _D.acheteurs.filter(a=>a.id!==id);
  (_D.ventes||[]).forEach(v => { if (v.acheteur_id===id) v.acheteur_id = null; });
  saveData(); renderAll(); toast('Acheteur supprimé.','success');
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'sales-grid';

  let items = [...(_D.vendeurs||[])];
  if (_vendeurFilter !== 'all') items = items.filter(v => (v.etat||'a_payer') === _vendeurFilter);
  if (_vendeurQuery) { const q = _normalizeStr(_vendeurQuery); items = items.filter(v => _normalizeStr(v.pseudo||'').includes(q)); }
  items.sort((a,b) => (b.date_achat||'').localeCompare(a.date_achat||''));

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
  const nbCards = (_D.depenses||[]).filter(d=>d.vendeur_id).length;
  const enCours = all.filter(v => (v.etat||'a_payer') !== 'arrive').length;
  el.innerHTML = `
    <div class="stat-card" style="--accent-color:var(--accent)"><div class="val">${all.length}</div><div class="lbl">Vendeurs</div></div>
    <div class="stat-card" style="--accent-color:var(--blue)"><div class="val">${nbCards}</div><div class="lbl">Cartes achetées</div></div>
    <div class="stat-card" style="--accent-color:var(--gold)"><div class="val">${totalVal.toFixed(2)} €</div><div class="lbl">Total dépensé</div></div>
    <div class="stat-card" style="--accent-color:var(--green)"><div class="val">${enCours}</div><div class="lbl">En cours</div></div>`;
}

function buildVendeurCard(v) {
  const depenses = vendeurDepenses(v.id);
  const total    = vendeurTotal(v.id);
  const st = VENDEUR_STATUTS.find(s=>s.id===(v.etat||'a_payer')) || VENDEUR_STATUTS[0];
  const card = document.createElement('div');
  card.className = 'order-card';
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">🏷️</div>
      <div class="order-card-info">
        <div class="order-card-name">${v.pseudo}</div>
        <div class="order-card-meta">${v.date_achat?_fmtDate(v.date_achat):'—'}${v.date_arrivee?' → '+_fmtDate(v.date_arrivee):''}</div>
        <div class="status-badge ${st.cls}">${st.label}</div>
      </div>
      <div class="order-card-actions">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVendeur('${v.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVendeur('${v.id}')">${ICON_DELETE}</button>
      </div>
    </div>
    <div class="order-card-body">
      <div class="order-stat-row"><span>${depenses.length} carte${depenses.length>1?'s':''}</span><span class="order-total">${total.toFixed(2)} €</span></div>
      ${v.lien_vente ? `<a href="${v.lien_vente}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de l'achat</a>` : ''}
      <div class="order-items-list">${depenses.map(d=>_orderItemRowHtml(d,'depense')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddDepenseModal('${v.id}')">+ Ajouter une carte</button>
    </div>`;
  return card;
}

function buildVendeurRow(v) {
  const depenses = vendeurDepenses(v.id);
  const total    = vendeurTotal(v.id);
  const st = VENDEUR_STATUTS.find(s=>s.id===(v.etat||'a_payer')) || VENDEUR_STATUTS[0];
  const uid = `acc-vd-${v.id}`;
  const row = document.createElement('div');
  row.className = 'classeur-list-row';
  row.innerHTML = `
    <div class="clr-header" onclick="toggleClrAccordion('${uid}', this)">
      <div class="clr-thumb" style="background:linear-gradient(135deg,${st.color}33,${st.color}55)"><span style="font-size:1.1rem">🏷️</span></div>
      <div class="clr-accent-bar" style="background:${st.color}"></div>
      <div class="clr-info">
        <div class="clr-name">${v.pseudo} <span class="status-badge ${st.cls}">${st.label}</span></div>
        <div class="clr-meta">${v.date_achat?_fmtDate(v.date_achat):'—'}${v.date_arrivee?' → '+_fmtDate(v.date_arrivee):''} · ${depenses.length} carte${depenses.length>1?'s':''}</div>
      </div>
      <div class="clr-right"><div class="order-total" style="font-size:.92rem">${total.toFixed(2)} €</div></div>
      <div class="clr-actions" onclick="event.stopPropagation()">
        <button class="btn btn-icon btn-sm" title="Modifier" onclick="editVendeur('${v.id}')">${ICON_EDIT}</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="deleteVendeur('${v.id}')">${ICON_DELETE}</button>
        <div class="clr-chevron" id="chev-${uid}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
      </div>
    </div>
    <div class="clr-body" id="${uid}">
      ${v.lien_vente ? `<a href="${v.lien_vente}" target="_blank" rel="noopener" class="sale-link">${ICON_LINK} Lien de l'achat</a>` : ''}
      <div class="order-items-list">${depenses.map(d=>_orderItemRowHtml(d,'depense')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddDepenseModal('${v.id}')">+ Ajouter une carte</button>
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

function setVendeurStatusInput(status) {
  document.getElementById('vendeur-status-input').value = status;
  document.querySelectorAll('#vendeur-status-select .classeur-status-btn').forEach(b => b.classList.toggle('active', b.dataset.status===status));
}

function openAddVendeurModal() {
  const modal = document.getElementById('modal-vendeur');
  delete modal.dataset.editId;
  document.getElementById('modal-vendeur-title').textContent = 'Nouveau vendeur';
  document.getElementById('vendeur-pseudo-input').value = '';
  document.getElementById('vendeur-date-achat-input').value = new Date().toISOString().slice(0,10);
  document.getElementById('vendeur-date-arrivee-input').value = '';
  document.getElementById('vendeur-lien-input').value = '';
  setVendeurStatusInput('a_payer');
  modal.classList.add('open');
}

function editVendeur(id) {
  const v = (_D.vendeurs||[]).find(x=>x.id===id); if (!v) return;
  const modal = document.getElementById('modal-vendeur');
  modal.dataset.editId = id;
  document.getElementById('modal-vendeur-title').textContent = 'Modifier le vendeur';
  document.getElementById('vendeur-pseudo-input').value = v.pseudo||'';
  document.getElementById('vendeur-date-achat-input').value = v.date_achat||'';
  document.getElementById('vendeur-date-arrivee-input').value = v.date_arrivee||'';
  document.getElementById('vendeur-lien-input').value = v.lien_vente||'';
  setVendeurStatusInput(v.etat||'a_payer');
  modal.classList.add('open');
}

function saveVendeur() {
  const modal = document.getElementById('modal-vendeur');
  const pseudo = document.getElementById('vendeur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const data = {
    pseudo,
    date_achat:   document.getElementById('vendeur-date-achat-input').value || '',
    date_arrivee: document.getElementById('vendeur-date-arrivee-input').value || '',
    lien_vente:   document.getElementById('vendeur-lien-input').value.trim(),
    etat:         document.getElementById('vendeur-status-input').value || 'a_payer',
  };
  const editId = modal.dataset.editId;
  if (editId) {
    const v = _D.vendeurs.find(x=>x.id===editId);
    if (v) { Object.assign(v, data); v.updated_at = Date.now(); }
    toast('Vendeur mis à jour !','success');
  } else {
    const newId = _vendeurId();
    _D.vendeurs.push({ id:newId, ...data, created_at:Date.now(), updated_at:Date.now() });
    _lastCreatedVendeurId = newId;
    toast('Vendeur ajouté !','success');
  }
  saveData(); renderAll(); closeModal('modal-vendeur');
}

function deleteVendeur(id) {
  const linked = vendeurDepenses(id).length;
  const msg = linked ? `Supprimer ce vendeur ? ${linked} achat(s) lié(s) seront détachés (pas supprimés).` : 'Supprimer ce vendeur ?';
  if (!confirm(msg)) return;
  _D.vendeurs = _D.vendeurs.filter(v=>v.id!==id);
  (_D.depenses||[]).forEach(d => { if (d.vendeur_id===id) d.vendeur_id = null; });
  saveData(); renderAll(); toast('Vendeur supprimé.','success');
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
//  Recherche directement dans la table Supabase "cards" (déjà utilisée par
//  le Pokédex) : étape 1 = noms distincts correspondant à la recherche,
//  étape 2 = toutes les cartes portant ce nom exact (une par édition/set).
// ═══════════════════════════════════════════════════════════════════════════
let _cardPickerTarget = null;      // 'vente' | 'depense'
let _cardPickerTimer = null;
let _cardPickerPokemonName = null;
let _cardPickerCards = [];

function openCardPicker(target) {
  _cardPickerTarget = target;
  _cardPickerPokemonName = null;
  _cardPickerCards = [];
  const search = document.getElementById('cardpicker-search');
  search.value = '';
  document.getElementById('cardpicker-step1').innerHTML = '<div class="sales-empty">Tapez au moins 2 lettres pour rechercher…</div>';
  document.getElementById('cardpicker-step1').style.display = '';
  document.getElementById('cardpicker-step2').style.display = 'none';
  document.getElementById('modal-card-picker').classList.add('open');
  setTimeout(() => search.focus(), 60);
}

function _cardPickerSearch(q) {
  clearTimeout(_cardPickerTimer);
  const query = q.trim();
  if (query.length < 2) {
    document.getElementById('cardpicker-step1').innerHTML = '<div class="sales-empty">Tapez au moins 2 lettres pour rechercher…</div>';
    return;
  }
  _cardPickerTimer = setTimeout(() => _doCardPickerSearch(query), 300);
}

async function _doCardPickerSearch(query) {
  const el = document.getElementById('cardpicker-step1');
  el.innerHTML = '<div class="sales-empty">Recherche…</div>';
  try {
    const url = `${SB_URL}/rest/v1/cards?name=ilike.*${encodeURIComponent(query)}*&select=name&order=name.asc&limit=300`;
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const names = [...new Set(rows.map(r=>r.name))].sort((a,b)=>a.localeCompare(b,'fr'));
    if (!names.length) { el.innerHTML = '<div class="sales-empty">Aucun résultat.</div>'; return; }
    el.innerHTML = names.map(n => `<div class="cardpicker-pokemon-item" onclick="_cardPickerSelectPokemon('${_jsEscape(n)}')">${n}</div>`).join('');
  } catch(e) {
    el.innerHTML = `<div class="sales-empty">Erreur : ${e.message}</div>`;
  }
}

async function _cardPickerSelectPokemon(name) {
  _cardPickerPokemonName = name;
  document.getElementById('cardpicker-step1').style.display = 'none';
  document.getElementById('cardpicker-step2').style.display = '';
  document.getElementById('cardpicker-pokemon-label').textContent = name;
  const grid = document.getElementById('cardpicker-cards');
  grid.innerHTML = '<div class="sales-empty">Chargement…</div>';
  try {
    const url = `${SB_URL}/rest/v1/cards?name=eq.${encodeURIComponent(name)}&order=set_id.asc,number.asc&limit=300`;
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const cards = await res.json();
    _cardPickerCards = cards;
    if (!cards.length) { grid.innerHTML = '<div class="sales-empty">Aucune carte trouvée.</div>'; return; }
    grid.innerHTML = cards.map((c,i) => `
      <div class="cardpicker-card-item" onclick="_cardPickerSelectCard(${i})">
        <div class="cardpicker-card-thumb">${c.image_url ? `<img src="${c.image_url}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
        <div class="cardpicker-card-info">
          <div class="cardpicker-card-set">${c.set_name||c.set_id||''}</div>
          <div class="cardpicker-card-num">N° ${c.number||'?'}${c.rarity?' · '+c.rarity:''}</div>
        </div>
      </div>`).join('');
  } catch(e) {
    grid.innerHTML = `<div class="sales-empty">Erreur : ${e.message}</div>`;
  }
}

function _cardPickerBackToStep1() {
  document.getElementById('cardpicker-step1').style.display = '';
  document.getElementById('cardpicker-step2').style.display = 'none';
}

function _cardPickerSelectCard(idx) {
  const c = _cardPickerCards[idx]; if (!c) return;
  const p = _cardPickerTarget; if (!p) return;
  document.getElementById(`${p}-card-id`).value = c.id||'';
  document.getElementById(`${p}-card-name`).value = c.name||'';
  document.getElementById(`${p}-card-image`).value = c.image_url||'';
  document.getElementById(`${p}-set-id`).value = c.set_id||'';
  document.getElementById(`${p}-set-name`).value = c.set_name||'';
  document.getElementById(`${p}-set-logo`).value = c.set_logo||'';
  document.getElementById(`${p}-number`).value = c.number||'';
  document.getElementById(`${p}-rarity`).value = c.rarity||'';
  document.getElementById(`${p}-pokemon-name`).value = _cardPickerPokemonName || c.name || '';
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
  wrap.innerHTML = `
    <div class="cardpicker-selected-preview">
      <div class="sale-card-thumb">${img ? `<img src="${img}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
      <div class="sale-card-info">
        <div class="sale-card-name">${name}</div>
        <div class="sale-card-meta">${setName||''}${number?' · N°'+number:''}</div>
      </div>
    </div>`;
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
  // Méga
  mega:            { fr:'Méga',              badge:'MÉGA',      color:'#7038F8' },
  'mega-x':        { fr:'Méga X',            badge:'MÉGA X',    color:'#5A28C8' },
  'mega-y':        { fr:'Méga Y',            badge:'MÉGA Y',    color:'#C03028' },
  'mega-z':        { fr:'Méga Z',            badge:'MÉGA Z',    color:'#2563EB' },
  // Gigamax / Primo
  gmax:            { fr:'Gigamax',           badge:'GIGAMAX',   color:'#E63946' },
  primal:          { fr:'Primo',             badge:'PRIMO',     color:'#E8553D' },
  eternamax:       { fr:'Éternamax',         badge:'ÉTERNA.',   color:'#DC2626' },
  // Régionales
  alola:           { fr:'Alola',             badge:'ALOLA',     color:'#06D6A0' },
  galar:           { fr:'Galar',             badge:'GALAR',     color:'#4A9EFF' },
  hisui:           { fr:'Hisui',             badge:'HISUI',     color:'#C0984A' },
  paldea:          { fr:'Paldea',            badge:'PALDEA',    color:'#A855F7' },
  // Légendaires formes
  origin:          { fr:'Originel',          badge:'ORIGIN.',   color:'#64748B' },
  altered:         { fr:'Modifié',           badge:'MODIF.',    color:'#4B5563' },
  sky:             { fr:'Ciel',              badge:'CIEL',      color:'#38BDF8' },
  land:            { fr:'Terrestre',         badge:'TERR.',     color:'#84CC16' },
  incarnate:       { fr:'Incarné',           badge:'INCARNÉ',   color:'#6366F1' },
  therian:         { fr:'Totémique',         badge:'TOTÉM.',    color:'#78716C' },
  crowned:         { fr:'Couronné',          badge:'COURON.',   color:'#D4AF37' },
  black:           { fr:'Noir',              badge:'NOIR',      color:'#1C1917' },
  white:           { fr:'Blanc',             badge:'BLANC',     color:'#E2E8F0' },
  'dusk-mane':     { fr:'Crinière Couchant', badge:'CRIN.',     color:'#F59E0B' },
  'dawn-wings':    { fr:'Ailes Aurore',      badge:'AILES',     color:'#6366F1' },
  ultra:           { fr:'Ultra',             badge:'ULTRA',     color:'#F97316' },
  confined:        { fr:'Confiné',           badge:'CONF.',     color:'#7C3AED' },
  unbound:         { fr:'Déchaîné',          badge:'DÉCHAÎNÉ',  color:'#DC2626' },
  complete:        { fr:'Complet',           badge:'COMPLET',   color:'#10B981' },
  '10':            { fr:'10%',               badge:'10%',       color:'#EF4444' },
  '50':            { fr:'50%',               badge:'50%',       color:'#6B7280' },
  '100':           { fr:'100%',              badge:'100%',      color:'#DC2626' },
  'battle-bond':   { fr:'Résolution',        badge:'RÉSOL.',    color:'#2563EB' },
  ash:             { fr:'Sacha',             badge:'SACHA',     color:'#EF4444' },
  'teal-mask':     { fr:'Masque Turquoise',  badge:'TURQ.',     color:'#0D9488' },
  'wellspring-mask':{ fr:'Masque Source',    badge:'SOURCE',    color:'#0EA5E9' },
  'hearthflame-mask':{ fr:'Masque Foyer',    badge:'FOYER',     color:'#F97316' },
  'cornerstone-mask':{ fr:'Masque Socle',    badge:'SOCLE',     color:'#78716C' },
  stellar:         { fr:'Stellaire',         badge:'STELL.',    color:'#A855F7' },
  terastal:        { fr:'Téracristal',       badge:'TÉRA',      color:'#F59E0B' },
  original:        { fr:'Passé',             badge:'PASSÉ',     color:'#D97706' },
  'original-color':{ fr:'Couleur Passé',     badge:'PASSÉ',     color:'#D97706' },
  'ice-rider':     { fr:'Cavalier Glace',    badge:'GLACE',     color:'#93C5FD' },
  'shadow-rider':  { fr:'Cavalier Spectre',  badge:'SPECTRE',   color:'#8B5CF6' },
  // Combat / mécanique
  blade:           { fr:'Épée',              badge:'ÉPÉE',      color:'#EF4444' },
  shield:          { fr:'Bouclier',          badge:'BOUCLIER',  color:'#3B82F6' },
  zen:             { fr:'Mode Zen',          badge:'ZEN',       color:'#8B5CF6' },
  'galar-zen':     { fr:'Galar Mode Zen',    badge:'GAL.ZEN',   color:'#3B82F6' },
  pirouette:       { fr:'Pirouette',         badge:'PIROU.',    color:'#EC4899' },
  aria:            { fr:'Aria',              badge:'ARIA',      color:'#F472B6' },
  resolute:        { fr:'Résolu',            badge:'RÉSOLU',    color:'#EF4444' },
  ordinary:        { fr:'Ordinaire',         badge:'ORD.',      color:'#9CA3AF' },
  busted:          { fr:'Révélé',            badge:'RÉVÉLÉ',    color:'#7C3AED' },
  disguised:       { fr:'Déguisé',           badge:'DÉGUISÉ',   color:'#059669' },
  school:          { fr:'Banc',              badge:'BANC',      color:'#06B6D4' },
  solo:            { fr:'Solo',              badge:'SOLO',      color:'#84CC16' },
  hangry:          { fr:'Affamé',            badge:'AFFAMÉ',    color:'#DC2626' },
  'full-belly':    { fr:'Repu',              badge:'REPU',      color:'#16A34A' },
  hero:            { fr:'Héros',             badge:'HÉROS',     color:'#D97706' },
  noice:           { fr:'Glace',             badge:'GLACE',     color:'#93C5FD' },
  amped:           { fr:'Amplifié',          badge:'AMPLI.',    color:'#FBBF24' },
  'low-key':       { fr:'Discret',           badge:'DISCR.',    color:'#60A5FA' },
  'single-strike': { fr:'Style Brutal',      badge:'BRUTAL',    color:'#1E3A8A' },
  'rapid-strike':  { fr:'Style Rapide',      badge:'RAPIDE',    color:'#06A77D' },
  gulping:         { fr:'Glouton',           badge:'GLOUTON',   color:'#F97316' },
  gorging:         { fr:'Gavé',              badge:'GAVÉ',      color:'#DC2626' },
  neutral:         { fr:'Neutre',            badge:'NEUTRE',    color:'#6B7280' },
  zero:            { fr:'Zéro',              badge:'ZÉRO',      color:'#9CA3AF' },
  dada:            { fr:'Papa',              badge:'PAPA',      color:'#A78BFA' },
  'two-segment':   { fr:'Courbée (2 seg.)',        badge:'×2',        color:'#6B7280' },
  'three-family':  { fr:'Famille de 3',      badge:'FAM.3',     color:'#F9A8D4' },
  'three-segment': { fr:'3 Segments',        badge:'×3',        color:'#374151' },
  'full-power':    { fr:'Puissance Max',     badge:'MAX',       color:'#7C3AED' },
  own:             { fr:'Maître',            badge:'MAÎTRE',    color:'#D97706' },
  'east-sea':      { fr:'Mer Orient',        badge:'ORIENT',    color:'#0EA5E9' },
  'west-sea':      { fr:'Mer Occident',      badge:'OCCID.',    color:'#6366F1' },
  active:          { fr:'Actif',             badge:'ACTIF',     color:'#FBBF24' },
  chest:           { fr:'Coffre',            badge:'COFFRE',    color:'#D97706' },
  roaming:         { fr:'Errant',            badge:'ERRANT',    color:'#9CA3AF' },
  // Rotom
  heat:            { fr:'Chaleur',           badge:'CHAUD',     color:'#EF4444' },
  wash:            { fr:'Lavage',            badge:'LAVAGE',    color:'#3B82F6' },
  frost:           { fr:'Froid',             badge:'FROID',     color:'#BAE6FD' },
  fan:             { fr:'Ventilateur',       badge:'VENT.',     color:'#86EFAC' },
  mow:             { fr:'Tonte',             badge:'TONTE',     color:'#4ADE80' },
  // Plumeline (Oricorio)
  baile:           { fr:'Style Flamenco',     badge:'FLAMENCO',  color:'#EF4444' },
  'pom-pom':       { fr:'Style Pom-Pom',     badge:'POM-POM',   color:'#F59E0B' },
  pau:             { fr:"Style Pa'u",        badge:"PA'U",      color:'#EC4899' },
  sensu:           { fr:'Style Sensu',       badge:'SENSU',     color:'#8B5CF6' },
  // Météo / saisonnières
  overcast:        { fr:'Nuageux',           badge:'NUAGE',     color:'#94A3B8' },
  sunshine:        { fr:'Ensoleillé',        badge:'SOLEIL',    color:'#FCD34D' },
  rainy:           { fr:'Pluvieux',          badge:'PLUIE',     color:'#60A5FA' },
  snowy:           { fr:'Neigeux',           badge:'NEIGE',     color:'#E0F2FE' },
  midday:          { fr:'Diurne',            badge:'DIURNE',    color:'#FCD34D' },
  midnight:        { fr:'Nocturne',          badge:'NOCT.',     color:'#4F46E5' },
  dusk:            { fr:'Crépusculaire',     badge:'CRÉP.',     color:'#F97316' },
  dawn:            { fr:'Aube',              badge:'AUBE',      color:'#818CF8' },
  spring:          { fr:'Printemps',         badge:'PRINT.',    color:'#F9A8D4' },
  summer:          { fr:'Été',               badge:'ÉTÉ',       color:'#FCD34D' },
  autumn:          { fr:'Automne',           badge:'AUT.',      color:'#F97316' },
  winter:          { fr:'Hiver',             badge:'HIVER',     color:'#93C5FD' },
  // Cheniti / Cheniselle
  plant:           { fr:'Plante',            badge:'PLANTE',    color:'#22C55E' },
  sandy:           { fr:'Sable',             badge:'SABLE',     color:'#D97706' },
  trash:           { fr:'Déchet',            badge:'DÉCHET',    color:'#6B7280' },
  // Flabébé / Florges
  red:             { fr:'Rouge',             badge:'ROUGE',     color:'#EF4444' },
  yellow:          { fr:'Jaune',             badge:'JAUNE',     color:'#FCD34D' },
  orange:          { fr:'Orange',            badge:'ORANGE',    color:'#F97316' },
  blue:            { fr:'Bleu',              badge:'BLEU',      color:'#3B82F6' },
  'eternal-flower':{ fr:'Fleur Éternelle',   badge:'ÉTERN.',    color:'#A78BFA' },
  // Pikachu
  cap:             { fr:'Casquette',         badge:'CASQ.',     color:'#FFCB05' },
  cosplay:         { fr:'Cosplay',           badge:'COSPLAY',   color:'#EC4899' },
  'rock-star':     { fr:'Rock Star',         badge:'ROCK',      color:'#374151' },
  belle:           { fr:'Belle',             badge:'BELLE',     color:'#F472B6' },
  'pop-star':      { fr:'Pop Star',          badge:'POP',       color:'#E879F9' },
  phd:             { fr:'Chercheuse',        badge:'DR.',       color:'#2563EB' },
  libre:           { fr:'Catcheuse',         badge:'LIBRE',     color:'#16A34A' },
  // Tauros Paldea
  'aqua-breed':    { fr:'Race Aqua',         badge:'AQUA',      color:'#38BDF8' },
  'blaze-breed':   { fr:'Race Flamme',       badge:'FLAMME',    color:'#F97316' },
  'combat-breed':  { fr:'Race Combat',       badge:'COMBAT',    color:'#EF4444' },
  // Divers
  totem:           { fr:'Totem',             badge:'TOTEM',     color:'#FFD166' },
  attack:          { fr:'Attaque',           badge:'ATT.',      color:'#EF4444' },
  defense:         { fr:'Défense',           badge:'DÉF.',      color:'#3B82F6' },
  speed:           { fr:'Vitesse',           badge:'VIT.',      color:'#F59E0B' },
  small:           { fr:'Petite',            badge:'PETITE',    color:'#86EFAC' },
  large:           { fr:'Grande',            badge:'GRANDE',    color:'#4ADE80' },
  super:           { fr:'Géante',            badge:'GÉANTE',    color:'#166534' },
  average:         { fr:'Moyenne',           badge:'MOY.',      color:'#6B7280' },
  curly:           { fr:'Vert (Enroulé)',     badge:'ENROUL.',   color:'#22C55E' },
  droopy:          { fr:'Pendant',           badge:'PENDANT',   color:'#93C5FD' },
  stretchy:        { fr:'Allongé',           badge:'ALLONG.',   color:'#FCD34D' },
  phony:           { fr:'Contrefait',        badge:'CONTREF.',  color:'#9CA3AF' },
  antique:         { fr:'Authentique',       badge:'AUTH.',     color:'#D97706' },
  'red-striped':   { fr:'Rayé Rouge',        badge:'ROUGE',     color:'#EF4444' },
  'blue-striped':  { fr:'Rayé Bleu',         badge:'BLEU',      color:'#3B82F6' },
  'white-striped': { fr:'Rayé Blanc',        badge:'BLANC',     color:'#E2E8F0' },
  natural:         { fr:'Naturel',           badge:'NAT.',      color:'#84CC16' },
  heart:           { fr:'Cœur',              badge:'CŒUR',      color:'#EC4899' },
  star:            { fr:'Étoile',            badge:'ÉTOILE',    color:'#FBBF24' },
  diamond:         { fr:'Diamant',           badge:'DIAMANT',   color:'#60A5FA' },
  debutante:       { fr:'Demoiselle',        badge:'DEMOIS.',   color:'#F9A8D4' },
  matron:          { fr:'Madame',            badge:'MADAME',    color:'#A78BFA' },
  dandy:           { fr:'Monsieur',          badge:'MONSIEUR',  color:'#374151' },
  'la-reine':      { fr:'Reine',             badge:'REINE',     color:'#D4AF37' },
  kabuki:          { fr:'Kabuki',            badge:'KABUKI',    color:'#EF4444' },
  pharaoh:         { fr:'Pharaon',           badge:'PHARAON',   color:'#D97706' },
  bloodmoon:       { fr:'Lune Vermeille',    badge:'L.VERM.',   color:'#DC2626' },
  male:            { fr:'Mâle',              badge:'♂',         color:'#3B82F6' },
  female:          { fr:'Femelle',           badge:'♀',         color:'#EC4899' },
  standard:        { fr:'Standard',          badge:'STD.',      color:'#6B7280' },
  normal:          { fr:'Normal',            badge:'NORM.',     color:'#9CA3AF' },
  'normal-silvally': { fr:'Type Aigüe',       badge:'AIGÜE',     color:'#9CA3AF' },
};

// Groupes de labels (utilisés par le filtre Pokédex ET l'onglet Édition › Labels)
const FORM_LABEL_GROUPS = [
  { id:'regionales',      label: 'Régionales',          types: ['alola','galar','hisui','paldea'] },
  { id:'mega',            label: 'Méga',                types: ['mega','mega-x','mega-y','mega-z'] },
  { id:'gmax-primo',      label: 'Gigamax / Primo',     types: ['gmax','primal','eternamax'] },
  { id:'legendaires',     label: 'Légendaires',         types: ['origin','altered','sky','land','therian','incarnate','crowned','black','white','dusk-mane','dawn-wings','ultra','confined','unbound','complete','10','50','battle-bond','ash','teal-mask','wellspring-mask','hearthflame-mask','cornerstone-mask','stellar','terastal','original','original-color','ice-rider','shadow-rider'] },
  { id:'combat-mecanique',label: 'Combat / Mécanique',  types: ['blade','shield','zen','galar-zen','pirouette','aria','resolute','ordinary','busted','disguised','school','solo','hangry','full-belly','hero','noice','amped','low-key','single-strike','rapid-strike','gulping','gorging','neutral','zero','dada','two-segment','three-segment','three-family'] },
  { id:'rotom',           label: 'Rotom',               types: ['heat','wash','frost','fan','mow'] },
  { id:'morpheo',         label: 'Morphéo (Oricorio)',  types: ['baile','pom-pom','pau','sensu'] },
  { id:'formes-meteo',    label: 'Formes météo',        types: ['overcast','sunshine','rainy','snowy','midday','midnight','dusk','dawn'] },
  { id:'formes-saisons',  label: 'Formes saisonnières', types: ['spring','summer','autumn','winter'] },
  { id:'chenipoto',       label: 'Cheniti/Cheniselle',  types: ['plant','sandy','trash'] },
  { id:'flabebe',         label: 'Flabébé / Florges',   types: ['red','yellow','orange','blue','white','eternal-flower'] },
  { id:'pikachu-speciaux',label: 'Pikachu spéciaux',    types: ['cap','cosplay','rock-star','belle','pop-star','phd','libre'] },
  { id:'tauros-paldea',   label: 'Tauros Paldea',       types: ['aqua-breed','blaze-breed','combat-breed'] },
  { id:'couafarel',       label: 'Couafarel',           types: ['natural','heart','star','diamond','debutante','matron','dandy','la-reine','kabuki','pharaoh'] },
  { id:'autres',          label: 'Autres',              types: ['totem','attack','defense','speed','small','large','super','average','curly','droopy','stretchy','phony','antique','red-striped','blue-striped','white-striped','male','female','own','east-sea','west-sea','active','chest','roaming','full-power','bloodmoon','standard','normal'] },
];

// Motifs par défaut (préfixe / suffixe dans le nom de carte TCG) permettant de
// relier une forme spéciale à ses cartes. Seuls les types ayant un réel
// équivalent carte ont des motifs par défaut ; les autres labels restent
// éditables mais ne filtrent rien tant qu'aucun motif n'est renseigné.
const DEFAULT_FORM_CARD_PATTERNS = {
  mega:     { prefixes: ['Méga-', 'Méga ', 'M '], suffixes: [] },
  'mega-x': { prefixes: ['Méga-', 'Méga ', 'M '], suffixes: ['X'] },
  'mega-y': { prefixes: ['Méga-', 'Méga ', 'M '], suffixes: ['Y'] },
  'mega-z': { prefixes: ['Méga-', 'Méga ', 'M '], suffixes: ['Z'] },
  gmax:     { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  primal:   { prefixes: ['Primo-', 'Primo '], suffixes: [] },
  alola:    { prefixes: [], suffixes: ["d'Alola", 'de Alola', 'Alola'] },
  galar:    { prefixes: [], suffixes: ['de Galar'] },
  hisui:    { prefixes: [], suffixes: ['de Hisui', "d'Hisui"] },
  paldea:   { prefixes: [], suffixes: ['de Paldea'] },
};

// Fusionne la définition statique d'un label (ou sa version personnalisée)
// avec la surcharge utilisateur (nom, badge, couleur, visibilité, préfixes/
// suffixes). Si le label a été supprimé définitivement, il est neutralisé.
function getFormLabelConfig(type) {
  if (!type) return null;
  if ((_D.deleted_labels||[]).includes(type)) {
    return { fr:type, badge:'', color:'#555', enabled:false, prefixes:[], suffixes:[], isCustom:false, isDeleted:true };
  }
  const custom = (_D.custom_labels||{})[type];
  const base   = custom || FORM_LABELS[type] || { fr: type, badge: (type||'').toUpperCase(), color: '#888' };
  const ov     = (_D.form_label_overrides || {})[type] || {};
  const dflt   = DEFAULT_FORM_CARD_PATTERNS[type] || { prefixes: [], suffixes: [] };
  return {
    fr:       ov.fr       !== undefined ? ov.fr       : base.fr,
    badge:    ov.badge    !== undefined ? ov.badge    : base.badge,
    color:    ov.color    !== undefined ? ov.color    : base.color,
    enabled:  ov.enabled !== undefined ? ov.enabled : (custom && custom.enabled !== undefined ? custom.enabled : true),
    prefixes: Array.isArray(ov.prefixes) ? ov.prefixes.slice() : (custom ? (custom.prefixes||[]).slice() : dflt.prefixes.slice()),
    suffixes: Array.isArray(ov.suffixes) ? ov.suffixes.slice() : (custom ? (custom.suffixes||[]).slice() : dflt.suffixes.slice()),
    isCustom: !!custom,
    isDeleted:false,
  };
}

// Un type de label existe-t-il en tant que label personnalisé (créé par l'utilisateur) ?
function _isCustomLabelType(type) { return !!(_D.custom_labels||{})[type]; }

// Tous les types de labels actuellement disponibles (hors supprimés définitivement)
function _allLabelTypes() {
  const deleted = new Set(_D.deleted_labels||[]);
  const builtins = Object.keys(FORM_LABELS).filter(t => !deleted.has(t));
  const customs  = Object.keys(_D.custom_labels||{});
  return [...builtins, ...customs];
}

// ── Catégories de labels (Édition › Labels) ────────────────────────────────
// Les catégories intégrées (FORM_LABEL_GROUPS) et celles créées par
// l'utilisateur (_D.custom_label_categories) sont fusionnées et triées selon
// _D.label_category_order (même principe que getBlocs() / _D.settings.bloc_order).
// Une catégorie intégrée peut être renommée ou masquée via
// _D.label_category_overrides[id] = { name?, _hidden? } — elle n'est jamais
// supprimée du code, seulement masquée (restaurable).
function getLabelCategories() {
  const builtin = FORM_LABEL_GROUPS
    .filter(g => !(_D.label_category_overrides||{})[g.id]?._hidden)
    .map(g => {
      const ov = (_D.label_category_overrides||{})[g.id] || {};
      return { id: g.id, name: ov.name !== undefined ? ov.name : g.label, _builtin: true };
    });
  const custom  = (_D.custom_label_categories || []).map(c => ({ id: c.id, name: c.name, _custom: true }));
  const all = [...builtin, ...custom];
  const order = _D.label_category_order || [];
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

// Catégorie effective d'un label : une assignation manuelle prend le pas sur
// l'appartenance par défaut à un groupe intégré ; sans les deux, le label est
// "Non classé" (null). Si la catégorie par défaut a été masquée, le label
// retombe aussi sur "Non classé" plutôt que de disparaître silencieusement.
function _labelCategoryOf(type) {
  const ov = (_D.label_category_assignments || {})[type];
  if (ov !== undefined) return ov || null;
  const grp = FORM_LABEL_GROUPS.find(g => g.types.includes(type));
  if (!grp) return null;
  if ((_D.label_category_overrides||{})[grp.id]?._hidden) return null;
  return grp.id;
}

// Déplace un label vers une catégorie (categoryId='' ou null → Non classé).
// N'enregistre une surcharge que si elle diffère de la catégorie par défaut,
// pour rester cohérent avec le reste de l'appli (ext_overrides, etc.).
function setLabelCategory(type, categoryId) {
  if (!_D.label_category_assignments) _D.label_category_assignments = {};
  const defaultCat = (FORM_LABEL_GROUPS.find(g => g.types.includes(type)) || {}).id || null;
  const normalized = categoryId || null;
  if (normalized === defaultCat) delete _D.label_category_assignments[type];
  else _D.label_category_assignments[type] = normalized || '';
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie mise à jour.', 'success');
}

function addLabelCategory() {
  const input = document.getElementById('new-label-cat');
  const name = (input?.value || '').trim();
  if (!name) { toast('Indique un nom pour la nouvelle catégorie.', 'error'); return; }
  if (!_D.custom_label_categories) _D.custom_label_categories = [];
  const id = 'lblcat_' + Date.now();
  _D.custom_label_categories.push({ id, name });
  saveData();
  _pushLabelSettingsToCloud();
  if (input) input.value = '';
  renderLabelsList();
  toast('Catégorie créée.', 'success');
}

// Renomme une catégorie, personnalisée OU intégrée (via une surcharge de nom).
function renameLabelCategory(id) {
  const custom  = (_D.custom_label_categories || []).find(c => c.id === id);
  const builtin = FORM_LABEL_GROUPS.find(g => g.id === id);
  if (!custom && !builtin) return;
  const currentName = custom ? custom.name : ((_D.label_category_overrides||{})[id]?.name ?? builtin.label);
  const name = prompt('Renommer la catégorie :', currentName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { toast('Le nom ne peut pas être vide.', 'error'); return; }
  if (custom) {
    custom.name = trimmed;
  } else {
    if (!_D.label_category_overrides) _D.label_category_overrides = {};
    const ov = { ...(_D.label_category_overrides[id] || {}) };
    if (trimmed === builtin.label) delete ov.name; else ov.name = trimmed;
    if (Object.keys(ov).length) _D.label_category_overrides[id] = ov;
    else delete _D.label_category_overrides[id];
  }
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie renommée.', 'success');
}

// Supprime une catégorie personnalisée, ou masque une catégorie intégrée
// (restaurable ensuite). Dans les deux cas, les labels qu'elle contenait
// repassent en "Non classé" plutôt que de disparaître.
function deleteLabelCategory(id) {
  const custom  = (_D.custom_label_categories || []).find(c => c.id === id);
  const builtin = FORM_LABEL_GROUPS.find(g => g.id === id);
  if (!custom && !builtin) return;
  const name = custom ? custom.name : ((_D.label_category_overrides||{})[id]?.name ?? builtin.label);
  const msg = custom
    ? `Supprimer la catégorie "${name}" ? Les labels qu'elle contient repasseront en "Non classé".`
    : `Masquer la catégorie intégrée "${name}" ? Les labels qu'elle contient repasseront en "Non classé" (elle reste restaurable en bas de liste).`;
  if (!confirm(msg)) return;

  if (custom) {
    _D.custom_label_categories = (_D.custom_label_categories || []).filter(c => c.id !== id);
  } else {
    if (!_D.label_category_overrides) _D.label_category_overrides = {};
    _D.label_category_overrides[id] = { ...(_D.label_category_overrides[id]||{}), _hidden: true };
    if (!_D.label_category_assignments) _D.label_category_assignments = {};
    builtin.types.forEach(type => {
      if (!(type in (_D.label_category_assignments||{}))) _D.label_category_assignments[type] = '';
    });
  }
  if (_D.label_category_assignments) {
    Object.keys(_D.label_category_assignments).forEach(type => {
      if (_D.label_category_assignments[type] === id) delete _D.label_category_assignments[type];
    });
  }
  if (_D.label_category_order) _D.label_category_order = _D.label_category_order.filter(cid => cid !== id);
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast(custom ? 'Catégorie supprimée.' : 'Catégorie masquée.', 'success');
}

// Restaure une catégorie intégrée précédemment masquée.
function restoreLabelCategory(id) {
  if ((_D.label_category_overrides||{})[id]) {
    delete _D.label_category_overrides[id]._hidden;
    if (Object.keys(_D.label_category_overrides[id]).length === 0) delete _D.label_category_overrides[id];
  }
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie restaurée.', 'success');
}

// Réorganisation par glisser-déposer des catégories (même principe que
// onBlocDragStart/Over/Drop pour les blocs d'extensions).
let _labelCatDragId = null;
function onLabelCatDragStart(e) { _labelCatDragId = e.currentTarget.dataset.catId; e.dataTransfer.effectAllowed = 'move'; }
function onLabelCatDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-target'); }
function onLabelCatDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.lbl-group-header.drag-target').forEach(el => el.classList.remove('drag-target'));
  const toId = e.currentTarget.dataset.catId;
  if (!_labelCatDragId || _labelCatDragId === toId) { _labelCatDragId = null; return; }
  const order = getLabelCategories().map(c => c.id);
  const fromIdx = order.indexOf(_labelCatDragId), toIdx = order.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) { _labelCatDragId = null; return; }
  order.splice(fromIdx, 1); order.splice(toIdx, 0, _labelCatDragId);
  _D.label_category_order = order;
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Ordre des catégories sauvegardé.', 'success');
  _labelCatDragId = null;
}

// Détermine le type de forme d'un Pokémon : une assignation manuelle prend
// toujours le pas sur la détection automatique par motif de nom PokéAPI.
// Une assignation à chaîne vide ('') force explicitement "aucun label".
function _resolveFormType(pokeApiSlug, baseName) {
  const assigned = (_D.pokemon_label_assignments||{})[pokeApiSlug];
  if (assigned !== undefined) return assigned || null;
  return _detectFormType(pokeApiSlug, baseName);
}

// Label assigné manuellement à un Pokémon de BASE via le sélecteur "Label" de
// sa fiche (indépendant de la détection de formes, qui ne concerne que les
// entrées "forme") — renvoie null si aucun label n'a été assigné/effacé.
function _pkdxBaseAssignedLabel(name) {
  const assigned = (_D.pokemon_label_assignments||{})[name];
  return assigned ? getFormLabelConfig(assigned) : null;
}

function _nnLbl(s) {
  return (s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // accents
    .replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'")       // apostrophes typographiques → apostrophe droite
    .trim();
}
function _escRe(s)  { return (s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
// HTML-escape for injecting arbitrary/user-edited text (card names, ext names…) into innerHTML.
function _escHtml(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Escape for safely embedding a string inside a single-quoted inline onclick="..." attribute.
function _escJs(s)   { return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// Un nom de carte TCG correspond-il au label `formType` (via ses préfixes/suffixes) ?
function _cardMatchesFormType(cardName, formType) {
  const cfg = getFormLabelConfig(formType);
  if (!cfg.enabled) return false;
  const n = _nnLbl(cardName);
  const prefixes = (cfg.prefixes||[]).map(_nnLbl).filter(Boolean);
  const suffixes = (cfg.suffixes||[]).map(_nnLbl).filter(Boolean);
  if (!prefixes.length && !suffixes.length) return false;
  const test = p => new RegExp('\\b'+_escRe(p)+'\\b').test(n);
  const prefixOk = !prefixes.length || prefixes.some(test);
  const suffixOk = !suffixes.length || suffixes.some(test);
  return prefixOk && suffixOk;
}

// Liste des types de forme ayant au moins un motif de carte configuré (actif)
function _allLinkedFormTypes() {
  return _allLabelTypes().filter(t => {
    const c = getFormLabelConfig(t);
    return c && c.enabled && ((c.prefixes||[]).length || (c.suffixes||[]).length);
  });
}

// Détecte le type de forme à partir du nom PokéAPI
function _detectFormType(pokeName, baseName) {
  // Exact overrides for PokéAPI names that need special handling
  const exact = {
    'necrozma-dusk':'dusk-mane','necrozma-dawn':'dawn-wings','necrozma-ultra':'ultra',
    'kyurem-black':'black','kyurem-white':'white',
    'oricorio-baile':'baile','oricorio-pom-pom':'pom-pom','oricorio-pau':'pau','oricorio-sensu':'sensu',
    'toxtricity-amped':'amped','toxtricity-low-key':'low-key',
    'darmanitan-galar-standard':'galar','darmanitan-galar-zen':'galar-zen',
    'darmanitan-standard':'standard','darmanitan-zen':'zen',
    'castform-rainy':'rainy','castform-snowy':'snowy','castform-sunny':'sunshine',
    'tauros-paldea-combat-breed':'combat-breed','tauros-paldea-blaze-breed':'blaze-breed','tauros-paldea-aqua-breed':'aqua-breed',
    'toxtricity-amped-gmax':'amped-gmax','toxtricity-low-key-gmax':'low-key-gmax',
    'urshifu-single-strike-gmax':'single-strike-gmax','urshifu-rapid-strike-gmax':'rapid-strike-gmax',
    'greninja-ash':'ash','greninja-battle-bond':'battle-bond',
    'calyrex-ice':'ice-rider','calyrex-shadow':'shadow-rider',
    'eiscue-ice':'ice','eiscue-noice':'noice',
    'basculegion-male':'male','basculegion-female':'female',
    'indeedee-male':'male','indeedee-female':'female',
    'zarude-dada':'dada','palafin-zero':'zero','palafin-hero':'hero',
    'dialga-origin':'origin','palkia-origin':'origin',
    'giratina-origin':'origin','giratina-altered':'altered',
    'shaymin-sky':'sky','shaymin-land':'land',
    'keldeo-ordinary':'ordinary','keldeo-resolute':'resolute',
    'meloetta-aria':'aria','meloetta-pirouette':'pirouette',
    'aegislash-shield':'shield','aegislash-blade':'blade',
    'morpeko-full-belly':'full-belly','morpeko-hangry':'hangry',
    'mimikyu-disguised':'disguised','mimikyu-busted':'busted',
    'xerneas-active':'active','xerneas-neutral':'neutral',
    'wishiwashi-solo':'solo','wishiwashi-school':'school',
    'cramorant-gulping':'gulping','cramorant-gorging':'gorging',
    'gimmighoul-chest':'chest','gimmighoul-roaming':'roaming',
    'terapagos-normal':'terapagos-normal','terapagos-terastal':'terastal','terapagos-stellar':'stellar',
    'rotom-heat':'heat','rotom-wash':'wash','rotom-frost':'frost','rotom-fan':'fan','rotom-mow':'mow',
    'deoxys-attack':'attack','deoxys-defense':'defense','deoxys-speed':'speed',
    'wormadam-plant':'plant','wormadam-sandy':'sandy','wormadam-trash':'trash',
    'tornadus-incarnate':'incarnate','tornadus-therian':'therian',
    'thundurus-incarnate':'incarnate','thundurus-therian':'therian',
    'landorus-incarnate':'incarnate','landorus-therian':'therian',
    'enamorus-incarnate':'incarnate','enamorus-therian':'therian',
    'flabebe-red':'red','flabebe-yellow':'yellow','flabebe-orange':'orange','flabebe-blue':'blue','flabebe-white':'white',
    'floette-red':'red','floette-yellow':'yellow','floette-orange':'orange','floette-blue':'blue','floette-white':'white','floette-eternal':'eternal-flower',
    'florges-red':'red','florges-yellow':'yellow','florges-orange':'orange','florges-blue':'blue','florges-white':'white',
    'pumpkaboo-small':'small','pumpkaboo-average':'average','pumpkaboo-large':'large','pumpkaboo-super':'super',
    'gourgeist-small':'small','gourgeist-average':'average','gourgeist-large':'large','gourgeist-super':'super',
    'zygarde-50':'50','zygarde-10':'10','zygarde-complete':'complete',
    'hoopa-confined':'confined','hoopa-unbound':'unbound',
    'lycanroc-midday':'midday','lycanroc-midnight':'midnight','lycanroc-dusk':'dusk',
    'silvally-normal':'normal-silvally',
    'mimikyu-disguised':'disguised','mimikyu-busted':'busted',
    'necrozma-dusk-mane':'dusk-mane','necrozma-dawn-wings':'dawn-wings',
    'sinistea-phony':'phony','sinistea-antique':'antique',
    'polteageist-phony':'phony','polteageist-antique':'antique',
    'basculin-red-striped':'red-striped','basculin-blue-striped':'blue-striped','basculin-white-striped':'white-striped',
    'dudunsparce-two-segment':'two-segment','dudunsparce-three-segment':'three-segment',
    'tatsugiri-curly':'curly','tatsugiri-droopy':'droopy','tatsugiri-stretchy':'stretchy',
    'ogerpon-teal-mask':'teal-mask','ogerpon-wellspring-mask':'wellspring-mask','ogerpon-hearthflame-mask':'hearthflame-mask','ogerpon-cornerstone-mask':'cornerstone-mask',
    'magearna-original':'original',
    'pikachu-original-cap':'cap','pikachu-hoenn-cap':'cap','pikachu-sinnoh-cap':'cap',
    'pikachu-unova-cap':'cap','pikachu-kalos-cap':'cap','pikachu-alola-cap':'cap',
    'pikachu-partner-cap':'cap','pikachu-world-cap':'cap',
    'pikachu-cosplay':'cosplay','pikachu-rock-star':'rock-star','pikachu-belle':'belle',
    'pikachu-pop-star':'pop-star','pikachu-phd':'phd','pikachu-libre':'libre',
    'furfrou-natural':'natural',
    'furfrou-heart':'heart','furfrou-star':'star','furfrou-diamond':'diamond',
    'furfrou-debutante':'debutante','furfrou-matron':'matron','furfrou-dandy':'dandy',
    'furfrou-la-reine':'la-reine','furfrou-kabuki':'kabuki','furfrou-pharaoh':'pharaoh',
    'ursaluna-bloodmoon':'bloodmoon',
    'maushold-family-of-three':'three-family',
  };
  if (exact[pokeName]) return exact[pokeName];

  // Ordered suffix checks (most specific first)
  if (pokeName.includes('-mega-x'))    return 'mega-x';
  if (pokeName.includes('-mega-y'))    return 'mega-y';
  if (pokeName.includes('-mega-z'))    return 'mega-z';
  if (pokeName.includes('-mega'))      return 'mega';
  if (pokeName.includes('-gmax'))      return 'gmax';
  if (pokeName.includes('-alola'))     return 'alola';
  if (pokeName.includes('-galar'))     return 'galar';
  if (pokeName.includes('-hisui'))     return 'hisui';
  if (pokeName.includes('-paldea'))    return 'paldea';
  if (pokeName.includes('-primal'))    return 'primal';
  if (pokeName.includes('-totem'))     return 'totem';
  if (pokeName.includes('-eternamax')) return 'eternamax';
  if (pokeName.includes('-single-strike')) return 'single-strike';
  if (pokeName.includes('-rapid-strike'))  return 'rapid-strike';
  if (pokeName.includes('-original-color')) return 'original-color';
  if (pokeName.includes('-original'))  return 'original';
  if (pokeName.includes('-cap'))       return 'cap';
  if (pokeName.includes('-crowned'))   return 'crowned';
  if (pokeName.includes('-amped'))     return 'amped';
  if (pokeName.includes('-low-key'))   return 'low-key';
  if (pokeName.includes('-aqua-breed')) return 'aqua-breed';
  if (pokeName.includes('-blaze-breed')) return 'blaze-breed';
  if (pokeName.includes('-combat-breed')) return 'combat-breed';
  if (pokeName.includes('-battle-bond')) return 'battle-bond';
  if (pokeName.includes('-full-power')) return 'full-power';
  if (pokeName.includes('-full-belly')) return 'full-belly';
  if (pokeName.includes('-teal-mask')) return 'teal-mask';
  if (pokeName.includes('-wellspring-mask')) return 'wellspring-mask';
  if (pokeName.includes('-hearthflame-mask')) return 'hearthflame-mask';
  if (pokeName.includes('-cornerstone-mask')) return 'cornerstone-mask';
  if (pokeName.includes('-red-striped')) return 'red-striped';
  if (pokeName.includes('-blue-striped')) return 'blue-striped';
  if (pokeName.includes('-white-striped')) return 'white-striped';
  if (pokeName.includes('-two-segment')) return 'two-segment';
  if (pokeName.includes('-family-of-three')) return 'three-family';
  if (pokeName.includes('-three-segment')) return 'three-segment';
  if (pokeName.includes('-dusk-mane')) return 'dusk-mane';
  if (pokeName.includes('-dawn-wings')) return 'dawn-wings';
  if (pokeName.includes('-eternal-flower')) return 'eternal-flower';
  if (pokeName.includes('-own-tempo')) return 'own';
  if (pokeName.includes('-rock-star')) return 'rock-star';
  if (pokeName.includes('-pop-star'))  return 'pop-star';
  if (pokeName.includes('-pom-pom'))   return 'pom-pom';
  if (pokeName.includes('-origin'))    return 'origin';
  if (pokeName.includes('-therian'))   return 'therian';
  if (pokeName.includes('-incarnate')) return 'incarnate';
  if (pokeName.includes('-stellar'))   return 'stellar';
  if (pokeName.includes('-terastal'))  return 'terastal';
  if (pokeName.includes('-complete'))  return 'complete';
  if (pokeName.includes('-unbound'))   return 'unbound';
  if (pokeName.includes('-confined'))  return 'confined';
  if (pokeName.includes('-pirouette')) return 'pirouette';
  if (pokeName.includes('-eternamax')) return 'eternamax';
  if (pokeName.includes('-ultra'))     return 'ultra';
  if (pokeName.includes('-altered'))   return 'altered';
  if (pokeName.includes('-resolute'))  return 'resolute';
  if (pokeName.includes('-ordinary'))  return 'ordinary';
  if (pokeName.includes('-disguised')) return 'disguised';
  if (pokeName.includes('-busted'))    return 'busted';
  if (pokeName.includes('-hangry'))    return 'hangry';
  if (pokeName.includes('-gorging'))   return 'gorging';
  if (pokeName.includes('-gulping'))   return 'gulping';
  if (pokeName.includes('-noice'))     return 'noice';
  if (pokeName.includes('-school'))    return 'school';
  if (pokeName.includes('-midday'))    return 'midday';
  if (pokeName.includes('-midnight'))  return 'midnight';
  if (pokeName.includes('-crowned'))   return 'crowned';
  if (pokeName.includes('-blade'))     return 'blade';
  if (pokeName.includes('-shield'))    return 'shield';
  if (pokeName.includes('-attack'))    return 'attack';
  if (pokeName.includes('-defense'))   return 'defense';
  if (pokeName.includes('-speed'))     return 'speed';
  if (pokeName.includes('-cosplay'))   return 'cosplay';
  if (pokeName.includes('-belle'))     return 'belle';
  if (pokeName.includes('-libre'))     return 'libre';
  if (pokeName.includes('-phd'))       return 'phd';
  if (pokeName.includes('-curly'))     return 'curly';
  if (pokeName.includes('-droopy'))    return 'droopy';
  if (pokeName.includes('-stretchy'))  return 'stretchy';
  if (pokeName.includes('-phony'))     return 'phony';
  if (pokeName.includes('-antique'))   return 'antique';
  if (pokeName.includes('-dusk'))      return 'dusk';
  if (pokeName.includes('-dawn'))      return 'dawn';
  if (pokeName.includes('-sky'))       return 'sky';
  if (pokeName.includes('-land'))      return 'land';
  if (pokeName.includes('-zen'))       return 'zen';
  if (pokeName.includes('-aria'))      return 'aria';
  if (pokeName.includes('-heat'))      return 'heat';
  if (pokeName.includes('-wash'))      return 'wash';
  if (pokeName.includes('-frost'))     return 'frost';
  if (pokeName.includes('-fan'))       return 'fan';
  if (pokeName.includes('-mow'))       return 'mow';
  if (pokeName.includes('-plant'))     return 'plant';
  if (pokeName.includes('-sandy'))     return 'sandy';
  if (pokeName.includes('-trash'))     return 'trash';
  if (pokeName.includes('-spring'))    return 'spring';
  if (pokeName.includes('-summer'))    return 'summer';
  if (pokeName.includes('-autumn'))    return 'autumn';
  if (pokeName.includes('-winter'))    return 'winter';
  if (pokeName.includes('-baile'))     return 'baile';
  if (pokeName.includes('-pau'))       return 'pau';
  if (pokeName.includes('-sensu'))     return 'sensu';
  if (pokeName.includes('-overcast'))  return 'overcast';
  if (pokeName.includes('-sunshine'))  return 'sunshine';
  if (pokeName.includes('-rainy'))     return 'rainy';
  if (pokeName.includes('-snowy'))     return 'snowy';
  if (pokeName.includes('-natural'))   return 'natural';
  if (pokeName.includes('-black'))     return 'black';
  if (pokeName.includes('-white'))     return 'white';
  if (pokeName.includes('-red'))       return 'red';
  if (pokeName.includes('-yellow'))    return 'yellow';
  if (pokeName.includes('-orange'))    return 'orange';
  if (pokeName.includes('-blue'))      return 'blue';
  if (pokeName.includes('-neutral'))   return 'neutral';
  if (pokeName.includes('-hero'))      return 'hero';
  if (pokeName.includes('-zero'))      return 'zero';
  if (pokeName.includes('-ash'))       return 'ash';
  if (pokeName.includes('-dada'))      return 'dada';
  if (pokeName.includes('-male'))      return 'male';
  if (pokeName.includes('-female'))    return 'female';
  if (pokeName.includes('-small'))     return 'small';
  if (pokeName.includes('-large'))     return 'large';
  if (pokeName.includes('-super'))     return 'super';
  if (pokeName.includes('-average'))   return 'average';
  if (pokeName.includes('-chest'))     return 'chest';
  if (pokeName.includes('-roaming'))   return 'roaming';
  if (pokeName.includes('-shadow'))    return 'shadow';
  if (pokeName.includes('-ice'))       return 'ice';
  if (pokeName.includes('-50'))        return '50';
  if (pokeName.includes('-10'))        return '10';
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
  showForms:      true,
  formsLoaded:    false,
  formMode:       'all',
  formTypeFilter: null,
  extFilterNames: null,
  loading:        false,
  initialized:    false,
};

// État des cartes TCG affichées dans la fiche Pokémon actuellement ouverte.
// Reconstruit à chaque ouverture de fiche (openPokedexModal / openPokedexFormModal).
// { frName, formType, groups:[{set_id,set_name,cards,ext}], cardsById:Map, filterExtIds:Set|null }
let _pkdxModalTcg = null;
// Mode de tri des groupes d'extension DANS une fiche Pokémon : 'default' (ordre
// bloc+code standard de l'appli), 'asc' ou 'desc' (tri code seul). Persiste
// d'une fiche à l'autre (préférence de session), contrairement à filterExtIds.
let _pkdxModalSortMode = 'default';

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
    document.getElementById('pokedex-subtitle').textContent = 'Chargement des formes…';
    await _loadFormsList();
    document.getElementById('pokedex-subtitle').textContent =
      `${_pkdx.all.filter(p=>!p.isForm).length} Pokémon + ${_pkdx.all.filter(p=>p.isForm).length} formes — PokéAPI`;
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

// mode ('all'|'none'|'only') et formTypeFilter (Set de types, ou null = tous)
// sont deux réglages INDÉPENDANTS qui se combinent (et non plus un seul état
// exclusif) : on peut par ex. choisir "Formes seules" ET un type précis, et
// n'afficher alors que les formes de ce type — les deux filtres s'additionnent.
function _applyPokedexFilter() {
  const bases = _pkdx.all.filter(p => !p.isForm);
  const forms = _pkdx.all.filter(p =>  p.isForm);
  const mode       = _pkdx.formMode || 'all';
  const typeFilter = _pkdx.formTypeFilter;

  const formsMatchingType = typeFilter ? forms.filter(p => typeFilter.has(p.formType)) : forms;

  let pool;
  if (mode === 'none') {
    pool = bases;
  } else if (mode === 'only') {
    // Tri croissant explicite par numéro de Pokédex (baseId), sinon par id de
    // forme en cas d'égalité — sans ce tri la liste "Formes seules" hérite de
    // l'ordre d'insertion de _loadFormsList(), pas de l'ordre du Pokédex.
    pool = [...formsMatchingType].sort((a, b) => (a.baseId - b.baseId) || (a.id - b.id));
  } else {
    pool = _pkdx.formsLoaded ? _buildPoolWithForms(formsMatchingType) : bases;
  }

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
    const enabledMatch = !p.isForm || !p.formType || getFormLabelConfig(p.formType).enabled;
    return genMatch && qMatch && extMatch && enabledMatch;
  });
  renderPokedexPage(true);
}

function _buildPoolWithForms(formsList) {
  const bases = _pkdx.all.filter(p => !p.isForm);
  const forms  = formsList || _pkdx.all.filter(p => p.isForm);
  const result = [];
  bases.forEach(base => {
    result.push(base);
    forms.filter(f => f.baseId === base.id).forEach(f => result.push(f));
  });
  return result;
}

// Une entrée du Pokédex (base ou forme) correspond-elle au filtre d'extension
// courant ? extFilterNames = { baseEntries: Set<name>, formEntries: Set<"name|type"> }.
function _matchPkdxExtEntry(p) {
  const data = _pkdx.extFilterNames;
  if (!data) return true;
  const nn = s => (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').trim();

  if (p.isForm) {
    const formType = p.formType || _resolveFormType(p.name, p.name.split('-')[0]) || null;
    if (!formType) return false;
    // Le nom à comparer est celui du Pokémon de BASE (ex. "Florizarre"), pas
    // le nom déjà composé de la forme (ex. "Méga-Florizarre", qui inclut le
    // préfixe et ne matcherait donc jamais le résidu extrait des cartes).
    const baseEntry = _pkdx.all.find(e => !e.isForm && e.id === p.baseId);
    const baseFr = nn(baseEntry?.frName || '');
    const baseEn = nn(baseEntry?.name  || p.name.split('-')[0] || '');
    return data.formEntries.has(baseFr + '|' + formType) || data.formEntries.has(baseEn + '|' + formType);
  } else {
    const nameFr = nn(p.frName || '');
    const nameEn = nn(p.name  || '').split(' ')[0];
    return data.baseEntries.has(nameFr) || data.baseEntries.has(nameEn);
  }
}

function togglePokedexForms(btn) {
  const panel = document.getElementById('pkdx-forms-panel');
  const open  = panel && panel.style.display !== 'none';
  if (open) { _closePkdxFormsPanel(); return; }
  btn.classList.add('active');
  if (!_pkdx.formsLoaded) {
    _loadFormsList().then(() => _buildFormTypeFilterList());
  } else {
    _buildFormTypeFilterList();
  }
  if (panel) panel.style.display = '';
}

function _closePkdxFormsPanel() {
  const panel = document.getElementById('pkdx-forms-panel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('pkdx-forms-toggle');
  if (btn) btn.classList.toggle('active', (_pkdx.formMode||'all') !== 'all' || !!_pkdx.formTypeFilter);
}

function _buildFormTypeFilterList() {
  const el = document.getElementById('pkdx-forms-list');
  if (!el) return;
  const typesPresent = new Set(_pkdx.all.filter(p => p.isForm && p.formType).map(p => p.formType));
  const countOf = type => _pkdx.all.filter(p => p.isForm && p.formType === type).length;
  const totalForms = _pkdx.all.filter(p => p.isForm && getFormLabelConfig(p.formType).enabled).length;
  const mode = _pkdx.formMode || 'all';
  // Le filtre de type est désormais indépendant du mode (all/none/only) : les
  // deux se combinent au lieu de s'exclure mutuellement.
  const filter = _pkdx.formTypeFilter;
  let html = '<div class="pkdx-forms-panel-inner">';
  html += '<div class="pkdx-forms-modes">';
  [{ m:'all', label:'Toutes' }, { m:'none', label:'Sans formes' }, { m:'only', label:'Formes seules' }].forEach(({m, label}) => {
    const active = mode === m ? 'active' : '';
    html += `<div class="pkdx-forms-mode-btn ${active}" onclick="_setFormMode('${m}')">${label}</div>`;
  });
  html += '</div><div class="pkdx-forms-sep"></div>';
  html += '<div class="pkdx-forms-group-label" style="margin-top:4px">Filtrer par type</div>';
  const allTypesActive = !filter ? 'active' : '';
  html += `<div class="pkdx-forms-type-item ${allTypesActive}" onclick="_setFormFilterAllTypes()">
    <span style="font-weight:600;font-size:.78rem">Tous les types</span>
    <span class="pkdx-forms-count">${totalForms}</span>
  </div>`;

  const typeRow = type => {
    const label = getFormLabelConfig(type);
    if (!label) return '';
    const active = filter?.has(type) ? 'active' : '';
    return `<div class="pkdx-forms-type-item ${active}" onclick="_toggleFormType('${type}',this)">
      <span class="pkdx-forms-type-badge" style="background:${label.color}">${label.badge}</span>
      <span>${_escHtml(label.fr)}</span>
      <span class="pkdx-forms-count">${countOf(type)}</span>
    </div>`;
  };

  // Regroupement par catégorie (intégrées + personnalisées), dans l'ordre
  // réorganisable défini dans Édition › Labels — même logique que renderLabelsList.
  getLabelCategories().forEach(cat => {
    const present = _allLabelTypes().filter(t => typesPresent.has(t) && _labelCategoryOf(t) === cat.id && getFormLabelConfig(t).enabled);
    if (!present.length) return;
    html += `<div class="pkdx-forms-group-label">${_escHtml(cat.name)}</div>`;
    present.forEach(type => { html += typeRow(type); });
  });

  // Types présents mais non classés dans une catégorie
  const unclassified = _allLabelTypes().filter(t => typesPresent.has(t) && _labelCategoryOf(t) === null && getFormLabelConfig(t)?.enabled);
  if (unclassified.length) {
    html += `<div class="pkdx-forms-group-label">Non classés</div>`;
    unclassified.forEach(type => { html += typeRow(type); });
  }
  html += '</div>';
  el.innerHTML = html;
}

// Change uniquement le mode d'affichage (all/none/only). Le filtre de type
// choisi n'est jamais réinitialisé ici : les deux réglages sont indépendants
// et peuvent désormais s'additionner (ex. "Formes seules" + type "Méga").
function _setFormMode(mode) {
  _pkdx.formMode = mode;
  _pkdx.showForms = mode !== 'none';
  _closePkdxFormsPanel();
  _applyPokedexFilter();
}

function _setFormFilterAllTypes() {
  _pkdx.formTypeFilter = null;
  // On reconstruit entièrement le panneau (plutôt que de patcher des classes
  // à la main) : c'est ce qui garantit que l'état affiché reflète toujours
  // l'état réel — l'ancien code, purement basé sur des manipulations DOM
  // ponctuelles, pouvait désynchroniser l'affichage du filtre réel.
  _buildFormTypeFilterList();
  _applyPokedexFilter();
}

function _toggleFormType(type, el) {
  let filter = _pkdx.formTypeFilter ? new Set(_pkdx.formTypeFilter) : new Set();
  if (filter.has(type)) filter.delete(type); else filter.add(type);
  _pkdx.formTypeFilter = filter.size > 0 ? filter : null;
  // Choisir un type alors que les formes sont masquées ("Sans formes") n'a
  // pas de sens : on repasse automatiquement sur "Toutes" pour que le choix
  // de l'utilisateur soit immédiatement visible.
  if ((_pkdx.formMode || 'all') === 'none') _pkdx.formMode = 'all';
  _buildFormTypeFilterList();
  _applyPokedexFilter();
}

async function _loadFormsList() {
  try {
    // Fetch ALL Pokémon entries (base + forms) from PokéAPI
    // Must use limit=20000 — form pokemon have IDs like 10001, 10168 etc.
    // limit=2000 only gets IDs 1-2000 and misses most alternate forms
    const res  = await fetch(`${POKEAPI}/pokemon?limit=20000&offset=0`);
    const data = await res.json();

    // Base Pokémon already loaded (PokéAPI English names)
    const bases      = _pkdx.all.filter(p => !p.isForm);
    // Fast lookup: english name → entry
    const baseByName = Object.fromEntries(bases.map(b => [b.name, b]));

    // Known forms whose PokéAPI name doesn't start with their base's name
    const exactParent = {
      'annihilape':          'primeape',
      'clodsire':            'wooper',
      'sneasler':            'sneasel',
      'overqwil':            'qwilfish',
      // Ursaluna-bloodmoon est une forme spéciale d'URSALUNA (Ursaking en FR),
      // pas d'Ursaring (qui est l'espèce PRÉ-évolution, distincte) : sinon son
      // nom FR et sa génération étaient calculés à partir d'Ursaring.
      'ursaluna-bloodmoon':  'ursaluna',
      'basculegion-male':    'basculin',
      'basculegion-female':  'basculin',
    };

    let added = 0;
    data.results.forEach(p => {
      const parts = p.url.split('/').filter(Boolean);
      const apiId = parseInt(parts[parts.length - 1], 10);

      // Find base: exactParent first, then longest prefix match, then species-root match
      let base = null;
      if (exactParent[p.name]) {
        base = baseByName[exactParent[p.name]] || null;
      }
      if (!base) {
        // Try all base names as prefix — longest match wins
        let bestLen = 0;
        for (const b of bases) {
          const prefix = b.name + '-';
          if (p.name.startsWith(prefix) && b.name.length > bestLen) {
            base    = b;
            bestLen = b.name.length;
          }
        }
      }
      if (!base) {
        // Some base Pokémon have a composite default name because PokéAPI's
        // "default" variety already carries a suffix (deoxys-normal,
        // keldeo-ordinary, meloetta-aria, wormadam-plant, giratina-altered,
        // shaymin-land, tornadus-incarnate, thundurus-incarnate,
        // landorus-incarnate, enamorus-incarnate...). In that case the form's
        // own name won't start with the full base name. Fall back to matching
        // on the species root (the part before the first hyphen), but only
        // when it points to exactly one base to avoid ambiguous matches.
        const formRoot = p.name.split('-')[0];
        const candidates = bases.filter(b => b.name.split('-')[0] === formRoot);
        if (candidates.length === 1) base = candidates[0];
      }
      if (!base) return;
      // Certains Pokémon ont un nom PokéAPI par défaut qui porte déjà un
      // suffixe de forme (aegislash-shield, meowstic-male, lycanroc-midday…) :
      // ce Pokémon EST sa propre base, il ne faut jamais le traiter comme une
      // forme de lui-même (sinon il disparaît de la grille principale).
      if (p.name === base.name) return;

      // Une assignation manuelle (Édition/fiche Pokémon) prend le pas sur la
      // détection automatique — elle peut aussi bien "récupérer" une forme non
      // reconnue que corriger une détection automatique erronée.
      const formType = _resolveFormType(p.name, base.name);

      const existing = _pkdx.all.find(e => e.name === p.name);
      if (existing) {
        // Ré-appliquer un éventuel changement d'assignation manuelle sur une
        // entrée déjà chargée, sans dupliquer la ligne, et sans jamais
        // reconvertir une base existante (isForm déjà false) en forme.
        if (formType && existing.isForm) { existing.formType = formType; existing.baseId = base.id; }
        return;
      }
      if (!formType) return; // toujours pas de label reconnu ni assigné manuellement

      _pkdx.all.push({
        id: apiId, baseId: base.id, name: p.name,
        frName: '', formType, isForm: true
      });
      added++;
    });

    _pkdx.formsLoaded = true;
    _pkdx.showForms   = true;
    _applyPokedexFilter();
    const fp = document.getElementById('pkdx-forms-panel');
    if (fp && fp.style.display !== 'none') _buildFormTypeFilterList();
  } catch(e) {
    console.warn('Forms load error:', e);
    _pkdx.formsLoaded = true;
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
    case 'mega-z':  return 'Méga-' + baseFr + ' Z';
    case 'mega':
      if (en.includes('-mega-x')) return 'Méga-' + baseFr + ' X';
      if (en.includes('-mega-y')) return 'Méga-' + baseFr + ' Y';
      if (en.includes('-mega-z')) return 'Méga-' + baseFr + ' Z';
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
    // Une forme affiche son label détecté/assigné ; un Pokémon de base peut
    // aussi se voir assigner un label manuellement (sélecteur "Label" de sa
    // fiche) — jusqu'ici sans aucun effet visuel, corrigé ici.
    const formMeta = isForm ? getFormLabelConfig(p.formType) : _pkdxBaseAssignedLabel(p.name);
    const color    = (formMeta && formMeta.enabled) ? formMeta.color : (TYPE_COLORS[types[0]] || '#888');

    card.className = 'pkdx-card' + (isForm ? ' pkdx-card-form' : '');
    card.style.setProperty('--pkdx-color', color);
    card.innerHTML = `
      <div class="pkdx-card-num">${numStr}</div>
      ${formMeta && formMeta.enabled ? `<span class="pkdx-card-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span>` : ''}
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
    // Un label peut être assigné manuellement à un Pokémon de base (sélecteur
    // "Label" plus bas) : il doit alors colorer le hero, afficher son badge,
    // ET restreindre les cartes TCG chargées à ce type précis (exactement
    // comme pour une forme) — voir l'appel à _loadTcgCardsInModal plus bas.
    const assignedLabelType = (_D.pokemon_label_assignments||{})[poke.name] || null;
    const formMeta = assignedLabelType ? getFormLabelConfig(assignedLabelType) : null;
    const color   = (formMeta && formMeta.enabled) ? formMeta.color : (TYPE_COLORS[types[0]] || '#888');
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
          const formType   = _resolveFormType(v.pokemon.name, poke.name);
          const formMeta   = formType ? getFormLabelConfig(formType) : null;
          if (formMeta && !formMeta.enabled) return '';

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
          ${formMeta && formMeta.enabled ? `<div class="pkdx-modal-genus"><span class="pkdx-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span></div>` : ''}
          <div class="pkdx-modal-types">
            ${types.map(t=>`<span class="pkdx-type pkdx-type-lg" style="background:${TYPE_COLORS[t]||'#888'}">${TYPE_FR[t]||t}</span>`).join('')}
          </div>
          <div class="pkdx-label-assign">
            <span>Label</span>
            <select onchange="assignPokemonLabel('${poke.name}',this.value,'base',${poke.id})">
              ${_buildLabelAssignOptions(poke.name)}
            </select>
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
        ${_pkdxTcgSectionHtml()}
      </div>
    `;
    _loadTcgCardsInModal(frName, assignedLabelType || undefined);
  } catch(err) {
    inner.innerHTML = `<p style="color:var(--accent2);padding:24px">Erreur : ${err.message}</p>`;
  }
}

// HTML de la section "Cartes TCG" d'une fiche Pokémon : titre + barre d'outils
// (tri par code, choix d'extension(s) à afficher) + zone des groupes. Partagé
// entre openPokedexModal et openPokedexFormModal.
function _pkdxTcgSectionHtml() {
  return `
    <div class="pkdx-modal-section pkdx-modal-full pkdx-tcg-section">
      <div class="pkdx-tcg-section-head">
        <h4>Cartes TCG <span id="pkdx-tcg-count" style="font-size:.72rem;font-weight:400;color:var(--text2)"></span></h4>
        <div class="pkdx-tcg-toolbar">
          <button id="pkdx-tcg-sort-btn" class="btn btn-secondary btn-sm ${_pkdxModalSortMode!=='default'?'active':''}"
            onclick="_toggleModalSortDir()" title="Trier les extensions par code">${_modalSortBtnLabel()}</button>
          <div style="position:relative">
            <button id="pkdx-tcg-ext-toggle" class="btn btn-secondary btn-sm" onclick="_toggleModalExtPanel(this)">Extensions ▾</button>
            <div id="pkdx-tcg-ext-panel" style="display:none" class="pkdx-ext-dropdown"></div>
          </div>
        </div>
      </div>
      <div id="pkdx-tcg-filter-chip" class="pkdx-tcg-filter-chip" style="display:none"></div>
      <div id="pkdx-tcg-grid" class="pkdx-tcg-groups">
        <div style="color:var(--text2);font-size:.82rem;padding:4px 0">Chargement…</div>
      </div>
    </div>`;
}

async function _loadTcgCardsInModal(frName, formType) {
  const grid  = document.getElementById('pkdx-tcg-grid');
  const chip  = document.getElementById('pkdx-tcg-filter-chip');
  if (!grid) return;

  _pkdxModalTcg = null;
  if (chip) chip.style.display = 'none';

  // Types de forme ayant un lien carte actif (préfixes/suffixes configurés dans
  // Édition › Labels), utilisés pour exclure ces cartes de la vue "forme de base".
  const linkedTypes = _allLinkedFormTypes();

  try {
    const url = `${SB_URL}/rest/v1/cards?name=ilike.*${encodeURIComponent(frName)}*&order=set_id.asc,number.asc&limit=500`;
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let cards = await res.json();

    if (formType && linkedTypes.includes(formType)) {
      cards = cards.filter(card => _cardMatchesFormType(card.name, formType));
      // Certaines cartes au format court ("M Dracaufeu") peuvent se trouver hors
      // de la fenêtre limit=500 de la requête principale. On détecte les
      // préfixes réduits à une seule lettre (ex. "M", "M ", "M-" désignent
      // tous la même lettre "M") et on refait une recherche dédiée pour
      // chacun, quelle que soit la façon dont l'utilisateur les a saisis.
      const cfg = getFormLabelConfig(formType);
      const shortLetters = [...new Set(
        (cfg.prefixes||[])
          .map(p => _nnLbl(p).replace(/[-\s]/g, ''))
          .filter(p => p.length === 1)
      )];
      for (const letter of shortLetters) {
        try {
          const r2 = await fetch(`${SB_URL}/rest/v1/cards?name=ilike.${encodeURIComponent(letter + ' ' + frName)}*&order=set_id.asc,number.asc&limit=200`,
            { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
          const extra = r2.ok ? await r2.json() : [];
          const seen = new Set(cards.map(c => c.id));
          extra.filter(c => _cardMatchesFormType(c.name, formType)).forEach(c => {
            if (!seen.has(c.id)) { cards.push(c); seen.add(c.id); }
          });
        } catch(_) {}
      }
    } else if (!formType) {
      // Base Pokémon : exclure les cartes qui appartiennent à une forme spéciale liée
      cards = cards.filter(c => !linkedTypes.some(t => _cardMatchesFormType(c.name, t)));
    }
    if (!document.getElementById('pkdx-tcg-grid')) return;
    if (!cards.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:.82rem">Aucune carte trouvée.</p>'; return; }

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

    // Attache à chaque groupe (et à chaque carte, pour la modale de détail) les
    // infos d'extension PTCG utiles à l'affichage/au tri : id, code, nom, logo, sigle.
    const groups = Array.from(groupMap.values()).map(group => {
      const ext = setIdToExt[group.set_id];
      const extInfo = {
        extId: ext ? ext.id : null,
        code:  ext ? (ext.code || '') : '',
        name:  ext ? (ext.nom || ext.name || group.set_name) : (group.set_name || group.set_id || '?'),
        logo:  ext ? (ext.logo  || '') : '',
        sigle: ext ? (ext.sigle || '') : '',
        order: ext && extOrder[ext.id] !== undefined ? extOrder[ext.id] : 9999,
      };
      group.cards.forEach(c => { c._ext = extInfo; });
      return { ...group, ext: extInfo };
    });

    const cardsById = new Map();
    cards.forEach(c => cardsById.set(String(c.id), c));

    // Le filtre d'extension global du Pokédex (choisi dans la barre du haut),
    // s'il y en a un, restreint dès l'ouverture la fiche à cette/ces extension(s)
    // — limité à celles réellement présentes sur ce Pokémon.
    let initialFilter = null;
    if (_pkdxExtFilter) {
      const present   = new Set(groups.map(g => g.ext.extId).filter(Boolean));
      const inherited = [..._pkdxExtFilter.keys()].filter(id => present.has(id));
      if (inherited.length) initialFilter = new Set(inherited);
    }

    _pkdxModalTcg = { frName, formType, groups, cardsById, filterExtIds: initialFilter };
    _renderPkdxTcgGroups();
  } catch(e) {
    if (grid) grid.innerHTML = '<p style="color:var(--accent2);font-size:.82rem">Erreur : ' + e.message + '</p>';
  }
}

// Redessine les groupes de cartes TCG de la fiche ouverte à partir de l'état
// déjà chargé (_pkdxModalTcg), en appliquant le tri et le filtre d'extension
// courants — sans jamais refaire d'appel réseau (tri/filtre instantanés).
function _renderPkdxTcgGroups() {
  const grid  = document.getElementById('pkdx-tcg-grid');
  const count = document.getElementById('pkdx-tcg-count');
  const chip  = document.getElementById('pkdx-tcg-filter-chip');
  const state = _pkdxModalTcg;
  if (!grid || !state) return;

  let groups = state.filterExtIds
    ? state.groups.filter(g => g.ext.extId && state.filterExtIds.has(g.ext.extId))
    : state.groups.slice();

  groups = _pkdxModalSortMode === 'default'
    ? [...groups].sort((a, b) => a.ext.order - b.ext.order || (a.set_name||'').localeCompare(b.set_name||''))
    : [...groups].sort((a, b) => {
        const cmp = (a.ext.code||'').localeCompare(b.ext.code||'', 'fr', { numeric: true });
        return _pkdxModalSortMode === 'asc' ? cmp : -cmp;
      });

  const totalCards = groups.reduce((s, g) => s + g.cards.length, 0);
  if (count) count.textContent = '— ' + totalCards + ' carte' + (totalCards > 1 ? 's' : '');

  if (chip) {
    if (state.filterExtIds) {
      const names = state.groups.filter(g => state.filterExtIds.has(g.ext.extId)).map(g => g.ext.name);
      chip.style.display = 'flex';
      chip.innerHTML = `<span>Filtré : ${_escHtml(names.join(', '))}</span>
        <button onclick="_setModalExtFilterAll()" title="Annuler le filtre d'extension">×</button>`;
    } else {
      chip.style.display = 'none';
      chip.innerHTML = '';
    }
  }

  if (!groups.length) {
    grid.innerHTML = '<p style="color:var(--text3);font-size:.82rem">Aucune carte trouvée.</p>';
    return;
  }

  let html = '';
  groups.forEach(group => {
    const ext = group.ext;
    html += '<div class="pkdx-tcg-ext-group">'
      + '<div class="pkdx-tcg-ext-header">'
      + (ext.logo  ? '<img src="' + ext.logo  + '" alt="" class="pkdx-tcg-ext-logo"  onerror="this.style.display=\'none\'">' : '')
      + (ext.sigle ? '<img src="' + ext.sigle + '" alt="" class="pkdx-tcg-ext-sigle" onerror="this.style.display=\'none\'">' : '')
      + '<span class="pkdx-tcg-ext-name">' + _escHtml(ext.name) + '</span>'
      + (ext.code  ? '<span class="pkdx-tcg-ext-code">' + _escHtml(ext.code) + '</span>' : '')
      + '<span class="pkdx-tcg-ext-badge">' + group.cards.length + '</span>'
      + '</div>'
      + '<div class="pkdx-tcg-grid">';

    group.cards.forEach(c => {
      html += '<div class="pkdx-tcg-card" onclick="openCardDetailModal(\'' + _escJs(String(c.id)) + '\')" title="'
        + _escHtml((c.set_name||'') + ' — ' + (c.number||'') + ' — ' + (c.rarity||'')) + '">';
      if (c.image_url) {
        html += '<img src="' + c.image_url + '" alt="' + _escHtml(c.name) + '" loading="lazy">';
      } else {
        html += '<div class="pkdx-tcg-placeholder">' + _escHtml(c.name) + '</div>';
      }
      html += '<div class="pkdx-tcg-card-info">'
        + '<span class="pkdx-tcg-num">' + _escHtml(c.number||'') + '</span>'
        + '<span class="pkdx-tcg-set">' + _escHtml(c.rarity||'') + '</span>'
        + '</div></div>';
    });

    html += '</div></div>';
  });

  grid.innerHTML = html;
}

// ── Barre d'outils "Cartes TCG" : tri par code ──────────────────────────────
function _modalSortBtnLabel() {
  return _pkdxModalSortMode === 'default' ? 'Trier par code' : (_pkdxModalSortMode === 'asc' ? '↑ Code' : '↓ Code');
}

function _toggleModalSortDir() {
  _pkdxModalSortMode = _pkdxModalSortMode === 'default' ? 'asc' : _pkdxModalSortMode === 'asc' ? 'desc' : 'default';
  const btn = document.getElementById('pkdx-tcg-sort-btn');
  if (btn) { btn.textContent = _modalSortBtnLabel(); btn.classList.toggle('active', _pkdxModalSortMode !== 'default'); }
  _renderPkdxTcgGroups();
}

// ── Barre d'outils "Cartes TCG" : choix d'une/des extension(s) à afficher ──
function _closeModalExtPanel() {
  const panel = document.getElementById('pkdx-tcg-ext-panel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('pkdx-tcg-ext-toggle');
  if (btn) btn.classList.toggle('active', !!(_pkdxModalTcg && _pkdxModalTcg.filterExtIds));
}

function _toggleModalExtPanel(btn) {
  const panel = document.getElementById('pkdx-tcg-ext-panel');
  if (!panel) return;
  const open = panel.style.display !== 'none';
  if (open) { _closeModalExtPanel(); return; }
  _buildModalExtFilterList();
  panel.style.display = '';
  btn.classList.add('active');
}

function _buildModalExtFilterList() {
  const el = document.getElementById('pkdx-tcg-ext-panel');
  if (!el) return;
  const state = _pkdxModalTcg;
  if (!state || !state.groups.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.8rem;padding:8px 12px">Aucune extension.</div>';
    return;
  }
  const items = state.groups.filter(g => g.ext.extId).map(g => g.ext).sort((a, b) => a.order - b.order);
  const filter = state.filterExtIds;
  let html = `<div class="pkdx-ext-filter-item ${!filter?'active':''}" onclick="_setModalExtFilterAll()">Toutes les extensions</div>`;
  html += items.map(ext => {
    const active = filter && filter.has(ext.extId) ? 'active' : '';
    return `<div class="pkdx-ext-filter-item ${active}" onclick="_toggleModalExtFilterItem('${_escJs(ext.extId)}')">
      ${ext.sigle ? `<img src="${ext.sigle}" alt="" class="pkdx-ext-filter-sigle" onerror="this.style.display='none'">` : `<span class="pkdx-ext-filter-code">${_escHtml(ext.code||'')}</span>`}
      <span>${_escHtml(ext.name)}</span>
    </div>`;
  }).join('');
  el.innerHTML = html;
}

function _toggleModalExtFilterItem(extId) {
  const state = _pkdxModalTcg;
  if (!state) return;
  let f = state.filterExtIds ? new Set(state.filterExtIds) : new Set();
  if (f.has(extId)) f.delete(extId); else f.add(extId);
  state.filterExtIds = f.size ? f : null;
  _buildModalExtFilterList();
  _renderPkdxTcgGroups();
}

// Réinitialise UNIQUEMENT le filtre local de la fiche ouverte (affiche à
// nouveau toutes les extensions de ce Pokémon), sans toucher au filtre
// global du Pokédex — utilisable "à tout moment" via le bouton × du chip.
function _setModalExtFilterAll() {
  const state = _pkdxModalTcg;
  if (!state) return;
  state.filterExtIds = null;
  _buildModalExtFilterList();
  _renderPkdxTcgGroups();
}

// ── Modale carte : zoom, infos, renommage et illustration (→ Supabase) ─────
function openCardDetailModal(cardId) {
  const card = _pkdxModalTcg?.cardsById?.get(String(cardId));
  if (!card) return;
  const modal = document.getElementById('modal-card-detail');
  const inner = document.getElementById('pkdx-card-modal-content');
  if (!modal || !inner) return;
  const ext = card._ext || {};

  inner.innerHTML = `
    <div class="pkdx-card-modal-layout">
      <div class="pkdx-card-modal-zoom">
        ${card.image_url
          ? `<img src="${card.image_url}" alt="${_escHtml(card.name)}" id="pkdx-card-zoom-img">`
          : `<div class="pkdx-tcg-placeholder" style="width:100%;aspect-ratio:63/88;border-radius:12px;background:var(--bg3)">${_escHtml(card.name)}</div>`}
      </div>
      <div class="pkdx-card-modal-info">
        <h3>${_escHtml(card.name)}</h3>
        <div class="pkdx-card-modal-meta">
          ${ext.sigle ? `<img src="${ext.sigle}" alt="" class="pkdx-card-modal-ext-sigle">` : ''}
          <span>${_escHtml(ext.name || card.set_name || '')}</span>
          ${ext.code ? `<span class="pkdx-tcg-ext-code">${_escHtml(ext.code)}</span>` : ''}
        </div>
        <div class="pkdx-card-modal-num">N° ${_escHtml(card.number || '?')}${card.rarity ? ' · ' + _escHtml(card.rarity) : ''}</div>

        <div class="settings-field" style="margin-top:18px">
          <label>Nom de la carte</label>
          <input type="text" id="pkdx-card-edit-name" value="${_escHtml(card.name)}">
        </div>
        <div class="settings-field">
          <label>URL de l'illustration</label>
          <input type="url" id="pkdx-card-edit-img" value="${_escHtml(card.image_url||'')}" placeholder="https://…">
        </div>
        <div class="modal-footer" style="justify-content:flex-start">
          <button class="btn btn-primary btn-sm" onclick="saveCardEdits('${_escJs(String(cardId))}')">Enregistrer dans Supabase</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

async function saveCardEdits(cardId) {
  const card = _pkdxModalTcg?.cardsById?.get(String(cardId));
  if (!card) return;
  const nameInp = document.getElementById('pkdx-card-edit-name');
  const imgInp  = document.getElementById('pkdx-card-edit-img');
  const newName = (nameInp?.value || '').trim();
  const newImg  = (imgInp?.value || '').trim();
  if (!newName) { toast('Le nom ne peut pas être vide.', 'error'); return; }

  try {
    const res = await fetch(`${SB_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: newName, image_url: newImg || null }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    // Reflète immédiatement le changement dans l'état déjà chargé (même objet
    // référencé par groups[].cards et cardsById → un seul endroit à mettre à jour).
    card.name = newName;
    card.image_url = newImg;
    _renderPkdxTcgGroups();
    closeModal('modal-card-detail');
    toast('Carte mise à jour dans Supabase !', 'success');
  } catch(e) {
    toast('Erreur Supabase : ' + e.message, 'error');
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

    const formType = _resolveFormType(pokeName, poke.species.name);
    const formMeta = formType ? getFormLabelConfig(formType) : null;
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
          ${formMeta && formMeta.enabled ? `<div class="pkdx-modal-genus"><span class="pkdx-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span></div>` : ''}
          <div class="pkdx-modal-types">
            ${types.map(t=>`<span class="pkdx-type pkdx-type-lg" style="background:${TYPE_COLORS[t]||'#888'}">${TYPE_FR[t]||t}</span>`).join('')}
          </div>
          <div class="pkdx-label-assign">
            <span>Label</span>
            <select onchange="assignPokemonLabel('${pokeName}',this.value,'form','${pokeName}','${(baseFrName||'').replace(/'/g,"\\'")}')">
              ${_buildLabelAssignOptions(pokeName)}
            </select>
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
        ${_pkdxTcgSectionHtml()}
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
