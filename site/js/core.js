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
  ventes:'grid', acheteurs:'grid', depenses:'grid', vendeurs:'grid', labels:'grid' };
var _currentView = 'extensions';
// Backward compat helper
function _viewMode() { return _tabViewModes[_currentView] || 'grid'; }
// Clé de stockage du mode grille/liste pour le contexte actuel : dans
// Édition, Mapping TCG et Labels ont chacun leur propre mode (indépendant
// l'un de l'autre et de celui des Blocs/Extensions), alors que _currentView
// vaut 'edition' pour tous ces sous-onglets — sans cette distinction, le
// bouton du header écraserait le même mode pour tout le monde.
function _viewModeStorageKey() {
  if (_currentView === 'edition') {
    if (typeof _editionTab !== 'undefined') {
      if (_editionTab === 'mapping') return 'mapping';
      if (_editionTab === 'labels') return 'labels';
      if (_editionTab === 'persoobjets') return 'persoobjets';
    }
    return 'edition';
  }
  return _currentView;
}
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
var _boosterSearchQuery = ''; // recherche d'extension, propre à l'onglet Boosters

// Goodies (même mécanisme que Boosters, mais product_type !== 'booster' —
// voir js/sync.js pour la répartition boosters/goodies côté cloud)
var _goodieDetail    = null;
var _goodieFilter    = 'all';
var _goodieSearchQuery = ''; // recherche d'extension, propre à l'onglet Goodies

// ── Routage par URL (#/section) ─────────────────────────────────────────────
// Chaque section a sa propre URL (ex. index.html#/ventes), pour pouvoir la
// partager, la mettre en favori, ou naviguer avec Précédent/Suivant — sans
// rien changer au fonctionnement interne : tout reste une seule page, un
// seul _D en mémoire, aucun rechargement. On modifie juste le fragment
// (#...) de l'URL, jamais le chemin du fichier — ça marche donc pareil en
// local (file://) et une fois déployé sur Netlify.
var _VALID_VIEWS = ['extensions','classeurs','boosters','goodies','statistiques','edition','parametres','pokedex','personnages','objets','lieux','energies','ventes','acheteurs','depenses','vendeurs','bilan'];
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
// L'écran de chargement ne disparaît QUE lorsque la synchro cloud initiale
// (_cloudInitialSync, js/sync.js) est terminée — pull récupéré ET appliqué à
// _D, plus le pull des labels. Avant, un simple setTimeout(100ms) le cachait
// sans attendre le pull réseau : l'app redevenait utilisable (donc capable
// de déclencher un saveData() -> push) alors que _D pouvait encore être
// l'état local "brut" (voire vide, sur un appareil neuf) pas encore
// remplacé par les données cloud. Tant que cet écran reste affiché, aucune
// interaction utilisateur n'est possible, donc aucun push ne peut partir
// avant que les données n'aient été chargées depuis le cloud — le push
// automatique (_scheduleCloudPush) ne se déclenche de toute façon que
// depuis saveData(), lui-même appelé uniquement par une action utilisateur
// (ajout d'une carte, changement d'édition, etc.), jamais pendant ce chargement.
window.addEventListener('DOMContentLoaded', async () => {
  loadData();
  initCloud();
  setDefaultDate();
  if (!_applyHashRoute()) _setHash('extensions', null); // URL toujours renseignée, même à l'ouverture
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

  // On attend ici la fin complète de la synchro cloud (pull + application à
  // _D, voir _cloudInitialSync dans js/sync.js) avant de retirer l'écran de
  // chargement. Le try/finally garantit que l'écran disparaît quoi qu'il
  // arrive : _cloudInitialSync gère déjà ses propres erreurs réseau/RLS en
  // interne (toast + console.warn) et ne les relance pas, mais on ne bloque
  // jamais l'appli indéfiniment pour autant en cas d'imprévu.
  try {
    await _cloudInitialSync();
  } catch (e) {
    console.error('[PTCG] init cloud a échoué de façon inattendue :', e);
  } finally {
    const l = document.getElementById('loading');
    if (l) { l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 300); }
  }
});

// Valeurs par défaut de TOUTES les clés de données de _D (une par domaine
// synchronisé, voir _SYNC_DOMAINS dans sync.js) — SOURCE UNIQUE réutilisée
// par loadData() (état neuf), resetData() (réinitialisation), exportData()
// et importDataFromFile() (js/labels.js) : ajouter un nouveau domaine de
// données ici suffit à le couvrir partout, sans risque d'oubli dans l'un
// des quatre (c'est ce genre d'oubli qui, par le passé, faisait qu'un champ
// existait bien dans _D mais pas dans la liste de secours de l'import — et
// donc plantait l'appli en réimportant un vieil export).
// Une FONCTION, pas un objet partagé : chaque appel renvoie des
// tableaux/objets fraîchement créés, jamais une référence commune qui
// finirait mutée par une partie de l'appli et polluerait toutes les autres.
function _emptyDataDomains() {
  return {
    collection:    {},
    classeurs:     [],
    boosters_data: {},
    custom_exts:   [],
    ext_overrides: {},
    bloc_overrides:{},
    custom_blocs:  [],
    labels:        [],
    label_categories: [],
    pokemon_label_assignments: {},
    perso_objets:  [],
    card_category_overrides: {},
    ventes:        [],
    acheteurs:     [],
    acheteur_commandes: [],
    depenses:      [],
    vendeurs:      [],
    vendeur_commandes:  [],
    settings:      { display_mode: 'logo' }
  };
}

// ── Persistence ────────────────────────────────────────────────────────────
function loadData() {
  const fresh = () => {
    _D = { _v: 1, _ts: 0, _tpl_blocs: [], ..._emptyDataDomains() };
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migrate: if old data had built-in blocs saved, discard them (template is now empty)
      _D = parsed;
      delete _D.blocs; // never store built-in blocs
      _D._tpl_blocs    = (window.__PC_DATA__ && window.__PC_DATA__.blocs) || []; // always []
      const _defaults = _emptyDataDomains();
      Object.keys(_defaults).forEach(k => { if (!_D[k]) _D[k] = _defaults[k]; });
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
  // normalisées + labels) est centralisée dans js/sync.js, dans
  // _cloudInitialSync(). Elle n'est PAS appelée ici : c'est le handler
  // DOMContentLoaded (plus bas dans ce fichier) qui l'appelle et l'attend
  // (await) avant de retirer l'écran de chargement — voir son commentaire
  // pour le pourquoi. loadData() ne fait que l'état local, rapide et
  // synchrone, pour un premier rendu (sous l'écran de chargement).
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
//
// BUG corrigé : un échec localStorage (quota dépassé, voir _importImageFile
// plus bas) affichait un toast d'erreur BLOQUANT à CHAQUE saveData() — y
// compris pour des actions n'ayant rien à voir avec une image — ce qui
// donnait l'impression que "rien ne marche" alors que la synchro cloud,
// elle, continuait de fonctionner (Supabase n'a pas cette limite de ~5-10
// Mo par origine que le navigateur impose à localStorage). Le cache local
// n'est qu'une AIDE au chargement à froid — la source de vérité reste le
// cloud — donc un échec ne doit ni bloquer l'action en cours ni spammer un
// toast à chaque fois : un seul avertissement, avec un vrai bouton d'action
// pour régler le problème (voir shrinkOversizedLocalImages plus bas).
var _localStorageQuotaWarned = false;
function _persistLocalOnly() {
  const s = { ..._D };
  delete s._tpl_blocs; delete s.blocs;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    _localStorageQuotaWarned = false; // un succès ultérieur réarme l'avertissement
  } catch(e) {
    console.error('[PTCG] _persistLocalOnly a échoué :', e);
    if (!_localStorageQuotaWarned) {
      _localStorageQuotaWarned = true;
      const isQuota = e.name === 'QuotaExceededError' || /quota/i.test(e.message || '');
      if (isQuota) {
        toast('Cache local plein (le cloud, lui, est à jour) — clique ici pour migrer les images encore stockées localement vers le cloud.', 'error', { onClick: () => shrinkOversizedLocalImages() });
      } else {
        toast('Échec de la sauvegarde locale : ' + e.message, 'error');
      }
    }
  }
}

// ── Retry générique pour une image (NAS FileBrowser en particulier) qui a
// échoué à charger ───────────────────────────────────────────────────────
// Le NAS (Raspberry Pi, 1 Go de RAM) génère les aperçus "big" à la volée
// (redimensionnement) — sous charge (beaucoup d'images demandées d'un coup,
// RAM serrée), il peut ponctuellement traîner ou timeout sans que l'image
// soit réellement manquante. Un échec de chargement n'est donc pas
// forcément définitif : on retente plusieurs fois, avec un délai croissant
// (+ un peu d'aléatoire pour ne pas relancer plein d'images pile au même
// instant) et un paramètre anti-cache, avant d'abandonner pour de bon.
// Généralisation de _spriteOnError (pokedex.js), qui reste spécifique aux
// sprites Pokémon (avec repli Official Art dédié) — celle-ci sert à TOUTE
// autre image de l'appli qui n'a pas d'équivalent de repli (cartes,
// Personnages/Objets/Lieux/Énergies/Accessoires, logos…), donc avec
// davantage de tentatives avant de laisser tomber.
// onGiveUp(img) : appelé après le dernier échec — par défaut, retire
// l'élément (comme le reste de l'appli fait déjà pour une image absente).
function _nasImgRetry(img, onGiveUp) {
  const MAX_RETRIES = 3;
  const tries = parseInt(img.dataset.nasTries || '0', 10);
  if (tries < MAX_RETRIES) {
    img.dataset.nasTries = String(tries + 1);
    const base = img.src.split('&_r=')[0].split('?_r=')[0];
    const sep  = base.includes('?') ? '&' : '?';
    const delay = 700 + tries * 900 + Math.random() * 500; // backoff croissant
    setTimeout(() => { img.src = `${base}${sep}_r=${Date.now()}`; }, delay);
    return;
  }
  if (onGiveUp) onGiveUp(img);
  else img.remove();
}

// ── Import d'image locale (fichier) pour n'importe quel champ "URL d'image"
// de l'appli ────────────────────────────────────────────────────────────
// PIVOT : les images ne sont plus stockées en base64 dans _D (donc plus
// dans localStorage, ni dans les colonnes texte Supabase) — un fichier
// importé est uploadé vers un vrai bucket Supabase Storage, et seule l'URL
// publique qui en résulte (une simple chaîne courte) est déposée dans le
// champ texte, exactement comme une URL saisie à la main. Nécessite le
// bucket "ptcg-images" (voir migration_perso_objets.sql) et la synchro
// cloud configurée (Paramètres) — sans backend, l'app n'a de toute façon
// aucun autre endroit où stocker durablement un fichier.
var PTCG_STORAGE_BUCKET = 'ptcg-images';

async function _importImageFile(fileInput, targetInputId) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Sélectionne un fichier image.', 'error'); fileInput.value=''; return; }
  const target = document.getElementById(targetInputId);
  if (!target) { fileInput.value = ''; return; }
  if (typeof _cloudReady !== 'function' || !_cloudReady()) {
    toast('Configure d\'abord la synchro cloud (Paramètres) : les images importées sont hébergées sur Supabase Storage, jamais stockées localement.', 'error');
    fileInput.value = '';
    return;
  }
  toast("Import de l'image en cours…", '');
  try {
    const { blob, mime, ext } = await _prepareImageBlob(file, 1200);
    const url = await _uploadImageBlob(blob, mime, ext);
    target.value = url;
    // Déclenche les aperçus déjà branchés en oninput (previewEditionImg,
    // previewClasseurImage…) exactement comme une saisie manuelle.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    toast('Image importée.', 'success');
  } catch (err) {
    toast("Erreur d'import de l'image : " + err.message, 'error');
  } finally {
    fileInput.value = ''; // permet de réimporter le même fichier une prochaine fois
  }
}

// Redimensionne (si besoin) et convertit en Blob prêt à uploader — accepte
// soit un File (nouvel import), soit une data URL déjà en mémoire (migration
// d'une image encore stockée localement depuis avant ce correctif, voir
// shrinkOversizedLocalImages).
//
// BUG corrigé : convertir systématiquement en JPEG (qui ne supporte pas la
// transparence) avec un fond BLANC forcé rendait moche tout logo/
// illustration à fond transparent (PNG), un carré blanc apparaissant autour
// du logo — particulièrement visible sur le thème sombre de l'appli. Le PNG
// (transparence intacte, sans remplissage) est maintenant préservé pour les
// sources PNG/GIF ; seules les photos déjà opaques basculent en JPEG
// qualité .85 (bien meilleure compression, sans perte visible pour ce cas).
function _prepareImageBlob(source, maxDim) {
  return new Promise((resolve, reject) => {
    const sourceMime = source instanceof File ? source.type : (String(source).match(/^data:([^;]+);/) || [])[1];
    const finish = dataUrl => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const preservePng = sourceMime === 'image/png' || sourceMime === 'image/gif';
        if (!preservePng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
        ctx.drawImage(img, 0, 0, width, height);
        const mime = preservePng ? 'image/png' : 'image/jpeg';
        const ext  = preservePng ? 'png' : 'jpg';
        canvas.toBlob(blob => {
          if (!blob) { reject(new Error('échec de la conversion en image')); return; }
          resolve({ blob, mime, ext });
        }, mime, preservePng ? undefined : 0.85);
      };
      img.onerror = () => reject(new Error('image illisible ou corrompue'));
      img.src = dataUrl;
    };
    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = () => finish(reader.result);
      reader.onerror = () => reject(new Error('erreur de lecture du fichier'));
      reader.readAsDataURL(source);
    } else {
      finish(source); // déjà une data URL
    }
  });
}

// Envoie un Blob vers le bucket Supabase Storage et renvoie son URL publique.
async function _uploadImageBlob(blob, mime, ext) {
  const path = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/${PTCG_STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': mime },
    body: blob,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}${errText ? ' — ' + errText.slice(0, 200) : ''}`);
  }
  return `${SB_URL}/storage/v1/object/public/${PTCG_STORAGE_BUCKET}/${path}`;
}

// ── Migration : déplace vers le stockage cloud toute image encore stockée
// en base64 localement (imports faits avant ce correctif) ─────────────────
// Parcourt tout _D à la recherche de data URLs "data:image/…", les uploade
// vers Supabase Storage, et remplace le champ par l'URL publique obtenue.
// Déclenchable depuis Paramètres, ou automatiquement proposé dès qu'un échec
// de sauvegarde locale par quota est détecté (voir _persistLocalOnly) —
// signe qu'une telle image traîne encore dans les données.
async function shrinkOversizedLocalImages() {
  if (typeof _cloudReady !== 'function' || !_cloudReady()) {
    toast('Configure la synchro cloud (Paramètres) avant de migrer ces images vers le stockage cloud.', 'error');
    return;
  }
  const THRESHOLD = 5 * 1024; // toute image encore en base64 doit migrer, pas seulement les plus grosses
  const found = [];
  const seen = new Set();
  const walk = obj => {
    if (!obj || typeof obj !== 'object' || seen.has(obj)) return;
    seen.add(obj);
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (typeof val === 'string' && val.length > THRESHOLD && /^data:image\//.test(val)) {
        found.push({ obj, key });
      } else if (val && typeof val === 'object') {
        walk(val);
      }
    });
  };
  walk(_D);

  if (!found.length) {
    toast('Aucune image encore stockée localement — rien à migrer.', 'success');
    return;
  }
  toast(`${found.length} image${found.length>1?'s':''} à migrer vers le stockage cloud…`, '');
  let okCount = 0;
  for (const f of found) {
    try {
      const { blob, mime, ext } = await _prepareImageBlob(f.obj[f.key], 1200);
      f.obj[f.key] = await _uploadImageBlob(blob, mime, ext);
      okCount++;
    } catch (e) {
      console.error('[PTCG] Échec migration image :', e);
    }
  }
  saveData();
  toast(`${okCount}/${found.length} image(s) migrée(s) vers le stockage cloud.`, okCount ? 'success' : 'error');
}

// Glisser-déposer un fichier directement sur le champ (au lieu du bouton
// 📁) : par défaut, un navigateur insère le CHEMIN LOCAL du fichier comme
// simple texte ("file:///C:/Users/…") — une "URL" qui ne se charge jamais,
// ni immédiatement (restriction de sécurité du navigateur) ni après
// synchronisation (chemin propre à cet ordinateur). On intercepte le dépôt
// et on le fait passer par le même chemin que le bouton d'import.
function _handleImageDrop(event, targetInputId) {
  event.preventDefault();
  const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
  if (!file) return;
  _importImageFile({ files: [file], value: '' }, targetInputId);
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
  safe(() => applyTheme(_D.settings?.theme || 'braise'), 'applyTheme');
  safe(() => applyRadius(_D.settings?.radius || 'normal'), 'applyRadius');
  safe(() => {
    const saved = _D.settings?.sales_cards_per_row;
    const gridVal    = typeof saved === 'number' ? saved : (saved?.grid || 5);
    const compactVal = (saved && typeof saved === 'object') ? (saved.compact || 3) : 3;
    const peopleVal  = (saved && typeof saved === 'object') ? (saved.people || 5) : 5;
    applyCardsPerRow('grid', gridVal);
    applyCardsPerRow('compact', compactVal);
    applyCardsPerRow('people', peopleVal);
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
      onerror="_nasImgRetry(this,img=>{img.style.display='none';img.nextSibling&&(img.nextSibling.style.display='inline')})">
      <span class="ext-inline-code" style="color:${color};display:none">${code}</span>`;
  }
  return `<span class="ext-inline-code ${sizeClass}" style="color:${color}">${code}</span>`;
}

