// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/core.js
//  Core — état _D, chargement/sauvegarde locale, init, helpers génériques (blocs/extensions)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — app.js
// ═══════════════════════════════════════════════════════════════════════════

var STORAGE_KEY = 'ptcg_collection';
var _D = null;

// STORAGE_KEY = clé localStorage. La synchronisation cloud (Supabase) est
// gérée séparément dans js/sync.js (moteur générique par table).

// ── UI state ───────────────────────────────────────────────────────────────
var _currentExt      = null;
var _showNonSorti    = false;
var _searchQuery     = '';
// Per-tab view modes
var _tabViewModes = { extensions:'grid', classeurs:'grid', boosters:'grid', edition:'grid',
  ventes:'grid', acheteurs:'grid', depenses:'grid', vendeurs:'grid' };
var _currentView = 'extensions';
// Backward compat helper
function _viewMode() { return _tabViewModes[_currentView] || 'grid'; }
var _extSortDir      = 'asc';    // 'asc' | 'desc' — shared across all ext views

// Edition
var _editionTab      = 'blocs';
var _editingBlocId   = null;
var _editingExtId    = null;
var _editingIsCustom = false;

// Classeur drag & drop
// dragKey format: "classeurId::extIdx" (index within classeur extensions array)
var _dragKey             = null;
var _dragOverClasseurId  = null;
var _dragOverIdx         = null;
// Drag classeur reorder
var _dragClasseurId      = null;

// Booster
var _illusExtId      = null;
var _illusEditId     = null;
var _boosterDetail   = null;
var _boosterFilter   = 'all';

// Goodies (même mécanisme que Boosters, mais product_type !== 'booster' —
// voir js/sync.js pour la répartition boosters/goodies côté cloud)
var _goodieDetail    = null;
var _goodieFilter    = 'all';

// ── Routage par URL (#/section) ─────────────────────────────────────────────
// Chaque section a sa propre URL (ex. index.html#/ventes), pour pouvoir la
// partager, la mettre en favori, ou naviguer avec Précédent/Suivant — sans
// rien changer au fonctionnement interne : tout reste une seule page, un
// seul _D en mémoire, aucun rechargement. On modifie juste le fragment
// (#...) de l'URL, jamais le chemin du fichier — ça marche donc pareil en
// local (file://) et une fois déployé sur Netlify.
var _VALID_VIEWS = ['extensions','classeurs','boosters','goodies','statistiques','edition','parametres','pokedex','ventes','acheteurs','depenses','vendeurs','bilan'];
var _lastSelfHash = null; // dernier hash qu'on a posé nous-mêmes (voir hashchange plus bas)

function _setHash(view, sub) {
  // Sous file:// (utilisation locale), Chrome traite même un changement de
  // simple fragment sur LA MÊME page comme une tentative de chargement
  // "unsafe" entre origines et le signale en console ("'file:' URLs are
  // treated as unique security origins"). On n'écrit donc le hash que sur
  // une vraie origine http(s) (ex. une fois déployé sur Netlify) ; en local,
  // la navigation par onglets marche exactement pareil, seule l'URL ne se
  // met pas à jour toute seule. La LECTURE du hash (ouvrir directement
  // #/ventes) continue de marcher partout, y compris en local.
  if (location.protocol === 'file:') return;
  const h = '#/' + view + (sub ? '/' + sub : '');
  if (location.hash === h) return;
  _lastSelfHash = h;
  location.hash = h;
}

function _viewFromHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [view, sub] = raw.split('/').filter(Boolean);
  return { view, sub };
}

function _applyHashRoute() {
  const { view, sub } = _viewFromHash();
  if (!view || !_VALID_VIEWS.includes(view)) return false;
  const btn = document.querySelector(`.nav-btn[data-view="${view}"]`);
  switchView(view, btn);
  if (view === 'edition' && sub) switchEditionTab(sub);
  return true;
}

window.addEventListener('hashchange', () => {
  // Si le hash correspond déjà à ce qu'on vient de poser nous-mêmes (via
  // _setHash, potentiellement en 2 écritures successives — switchView puis
  // switchEditionTab), on l'ignore : l'UI est déjà à jour, pas besoin de
  // rejouer la navigation. Ne réagit qu'aux vrais changements (retour
  // arrière/avant du navigateur, lien externe, saisie manuelle de l'URL).
  if (location.hash === _lastSelfHash) return;
  _applyHashRoute();
});

// ── Init ───────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  initCloud();
  setDefaultDate();
  if (!_applyHashRoute()) _setHash('extensions', null); // URL toujours renseignée, même à l'ouverture
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
    // bea-add-btn (Boosters ET Goodies partagent la même classe ; data-kind
    // distingue laquelle des deux modales/valeurs par défaut utiliser)
    const addBtn = e.target.closest('.bea-add-btn[data-ext-id]');
    if (addBtn) {
      const extId = addBtn.dataset.extId;
      const ext   = getExt(extId);
      if (ext) {
        if (addBtn.dataset.kind === 'goodie') openAddGoodie(extId, ext.nom);
        else openAddIllus(extId, ext.nom);
      }
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
      acheteur_commandes: [],
      depenses:      [],
      vendeurs:      [],
      vendeur_commandes:  [],
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
      _D._tpl_blocs    = (window.__PC_DATA__ && window.__PC_DATA__.blocs) || []; // always []
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
      if (!_D.acheteur_commandes) _D.acheteur_commandes = [];
      if (!_D.depenses)       _D.depenses       = [];
      if (!_D.vendeurs)       _D.vendeurs       = [];
      if (!_D.vendeur_commandes)  _D.vendeur_commandes  = [];
      if (!_D.settings)       _D.settings       = { display_mode: 'logo' };
      _migrateSalesToCommandes();
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
  // Toute la logique de restauration/synchronisation cloud (tables
  // normalisées + labels) est centralisée dans js/sync.js.
  _cloudInitialSync();
}

// Migre l'ancien modèle (un "acheteur"/"vendeur" = une commande unique avec
// sa propre date/lien/état) vers le nouveau modèle (un acheteur/vendeur =
// une personne, pouvant avoir PLUSIEURS commandes à des dates différentes).
// Ne s'exécute qu'une fois ; les commandes créées récupèrent les anciens
// champs pour qu'aucune donnée existante ne soit perdue.
function _migrateSalesToCommandes() {
  if (_D._sales_commandes_migrated) return;
  if (!_D.acheteur_commandes) _D.acheteur_commandes = [];
  if (!_D.vendeur_commandes)  _D.vendeur_commandes  = [];

  (_D.acheteurs||[]).forEach(a => {
    const legacy = a.date_achat !== undefined || a.date_arrivee !== undefined || a.lien_vente !== undefined || a.etat !== undefined;
    if (!legacy) return;
    const commandeId = _acheteurCommandeId();
    _D.acheteur_commandes.push({
      id: commandeId, acheteur_id: a.id,
      date_achat: a.date_achat || '', date_arrivee: a.date_arrivee || '',
      lien_vente: a.lien_vente || '', etat: a.etat || 'a_envoyer',
      created_at: a.created_at || Date.now(), updated_at: Date.now(),
    });
    (_D.ventes||[]).forEach(v => { if (v.acheteur_id === a.id && v.commande_id === undefined) v.commande_id = commandeId; });
    delete a.date_achat; delete a.date_arrivee; delete a.lien_vente; delete a.etat;
  });
  (_D.ventes||[]).forEach(v => { if ('acheteur_id' in v) delete v.acheteur_id; });

  (_D.vendeurs||[]).forEach(v => {
    const legacy = v.date_achat !== undefined || v.date_arrivee !== undefined || v.lien_vente !== undefined || v.etat !== undefined;
    if (!legacy) return;
    const commandeId = _vendeurCommandeId();
    _D.vendeur_commandes.push({
      id: commandeId, vendeur_id: v.id,
      date_achat: v.date_achat || '', date_arrivee: v.date_arrivee || '',
      lien_achat: v.lien_vente || '', etat: v.etat || 'a_payer',
      created_at: v.created_at || Date.now(), updated_at: Date.now(),
    });
    (_D.depenses||[]).forEach(d => { if (d.vendeur_id === v.id && d.commande_id === undefined) d.commande_id = commandeId; });
    delete v.date_achat; delete v.date_arrivee; delete v.lien_vente; delete v.etat;
  });
  (_D.depenses||[]).forEach(d => { if ('vendeur_id' in d) delete d.vendeur_id; });

  _D._sales_commandes_migrated = true;
}

// Persiste _D en local (localStorage) SANS déclencher de push cloud — utilisé
// juste après un pull réussi (chargement de page, bouton Synchroniser,
// Récupérer depuis le cloud, pull des labels) : on vient de RECEVOIR l'état
// depuis Supabase, il n'y a donc rien à renvoyer, et le renvoyer quand même
// est exactement ce qui provoquait la collection vidée sur une page neuve
// (le push, avec son DELETE-puis-INSERT par table, pouvait s'intercaler
// avant que le pull ait fini d'appliquer toutes les tables). saveData() reste
// la fonction à utiliser pour toute modification faite PAR l'utilisateur.
function _persistLocalOnly() {
  const s = { ..._D };
  delete s._tpl_blocs; delete s.blocs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch(e) {
    console.error('[PTCG] _persistLocalOnly a échoué :', e);
    toast('Échec de la sauvegarde locale : ' + e.message, 'error');
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar'); if (!sidebar) return;
  const collapsed = sidebar.classList.toggle('collapsed');
  if (!_D.settings) _D.settings = {};
  _D.settings.sidebar_collapsed = collapsed;
  saveData();
}

function saveData() {
  _D._ts = Date.now();
  _persistLocalOnly();
  // Chaque sauvegarde locale déclenche aussi une synchronisation cloud
  // (silencieuse, débouncée) : c'est ce qui manquait pour que les autres
  // appareils/navigateurs voient les mêmes données.
  _scheduleCloudPush();
}

function renderAll() {
  const safe = (fn, name) => { try { fn(); } catch(e) { console.error('[PTCG] '+name+' crashed:', e.message, e.stack?.split('\n')[1]); } };
  safe(renderExtensions,    'renderExtensions');
  safe(renderClasseurs,     'renderClasseurs');
  safe(renderBoosters,      'renderBoosters');
  safe(renderGoodies,       'renderGoodies');
  safe(renderEdition,       'renderEdition');
  safe(renderStats,         'renderStats');
  safe(renderVentes,        'renderVentes');
  safe(renderAcheteurs,     'renderAcheteurs');
  safe(renderDepenses,      'renderDepenses');
  safe(renderVendeurs,      'renderVendeurs');
  safe(renderBilan,         'renderBilan');
  safe(updateGlobalProgress,'updateGlobalProgress');
  safe(updateBadges,        'updateBadges');
  safe(() => {
    const saved = _D.settings?.sales_cards_per_row;
    const gridVal    = typeof saved === 'number' ? saved : (saved?.grid || 5);
    const compactVal = (saved && typeof saved === 'object') ? (saved.compact || 3) : 3;
    applyCardsPerRow('grid', gridVal);
    applyCardsPerRow('compact', compactVal);
  }, 'applyCardsPerRow');
  safe(() => {
    _extSortDir = _D.settings?.sort_dir === 'desc' ? 'desc' : 'asc';
    document.querySelectorAll('.sort-code-icon').forEach(el => el.textContent = _extSortDir === 'asc' ? '↑' : '↓');
  }, 'syncSortDirIcon');
  safe(() => {
    // _tabViewModes ne se remet à jour tout seul qu'en mémoire (setViewMode) :
    // sans ce réveil depuis _D.settings, le choix de grille/carte à
    // gauche/liste retombait toujours sur "grille" à chaque rechargement.
    if (_D.settings?.tab_view_modes) Object.assign(_tabViewModes, _D.settings.tab_view_modes);
  }, 'restoreTabViewModes');
  safe(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('collapsed', !!_D.settings?.sidebar_collapsed);
  }, 'restoreSidebarCollapsed');
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
  const tpl = (_D._tpl_blocs || (window.__PC_DATA__ && window.__PC_DATA__.blocs) || []).map(b => {
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

