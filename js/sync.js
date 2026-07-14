// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/sync.js
//  Moteur de synchronisation cloud générique (Supabase / PostgREST)
// ═══════════════════════════════════════════════════════════════════════════
//
// Chaque "domaine" (classeurs, ventes, catégories de labels…) se synchronise
// ligne par ligne dans SA PROPRE table Supabase (voir supabase_schema.sql à
// la racine du projet). Convention de nommage : TOUTES les colonnes d'une
// table commencent par les 3 lettres de son nom (ex. blocs.blo_user_id),
// pour qu'on sache toujours d'où vient une colonne rien qu'en la lisant.
// Ce mapping colonne-préfixée <-> champ JS (non préfixé, inchangé) se fait
// uniquement ici, dans toRows()/apply() — le reste de l'appli ne voit que
// les noms de champs habituels (_D.classeurs[i].nom, etc.).
//
// "boosters_data" (un objet JS unique, par extension) est réparti à
// l'écriture entre deux tables cloud, boosters et goodies, selon
// product_type : 'booster' → boosters, tout le reste (deck/etb/premium/…)
// → goodies. Même structure des deux côtés. Ça prépare la séparation de la
// page en deux onglets sans rien changer côté JS pour l'instant.
//
// Principe général :
//  - PUSH (débouncé 1.2s après chaque saveData()) : pour chaque table, dans
//    un ordre qui respecte les clés étrangères, on supprime toutes les
//    lignes de cet utilisateur puis on réinsère l'état actuel (upsert en
//    masse, 1 requête par table).
//  - PULL AU CHARGEMENT (une fois, forcé) : le cloud est la source de vérité
//    à l'ouverture de l'appli — on récupère TOUJOURS l'intégralité des
//    tables depuis Supabase, sans se fier à une comparaison d'horodatage, et
//    l'écran de chargement (core.js) attend la fin complète de ce pull avant
//    de rendre l'appli accessible. Comparer les horodatages et parfois ne
//    récupérer QUE la table settings (sans les ~20 tables de données) est
//    ce qui, auparavant, donnait l'impression qu'aucune requête de
//    récupération n'était vraiment lancée au démarrage.
//  - PULL MANUEL (bouton "Synchroniser") : lui continue de comparer les
//    horodatages (voir syncCloud()) pour décider s'il doit récupérer ou au
//    contraire pousser le local.

var CLOUD_DEFAULT_URL = (window.__PC_CLOUD_CONFIG__ && window.__PC_CLOUD_CONFIG__.url) || '';
var CLOUD_DEFAULT_KEY = (window.__PC_CLOUD_CONFIG__ && window.__PC_CLOUD_CONFIG__.key) || '';
var CLOUD_CONFIG_KEY  = 'ptcg_cloud_cfg'; // override local (URL/clé perso), stocké en local uniquement
var CLOUD_USER_ID     = 'default';        // app mono-utilisateur : même id partout

var SB_URL = '';
var SB_KEY = '';

(function _initCloudConfig() {
  var stored = {};
  try { stored = JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY) || '{}'); } catch (e) { /* ignore */ }
  window.__PC_CLOUD_CONFIG__ = {
    url:     stored.url || CLOUD_DEFAULT_URL,
    key:     stored.key || CLOUD_DEFAULT_KEY,
    user_id: CLOUD_USER_ID,
  };
  SB_URL = window.__PC_CLOUD_CONFIG__.url;
  SB_KEY = window.__PC_CLOUD_CONFIG__.key;
})();

function _cloudUserId() { return (window.__PC_CLOUD_CONFIG__ && window.__PC_CLOUD_CONFIG__.user_id) || 'default'; }
function _cloudReady()  { return !!(SB_URL && SB_KEY); }
function _isoNow()      { return new Date().toISOString(); }
function _sbHeaders(extra) {
  var h = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}

// ── Log de statut dans l'écran de chargement (debug temps réel) ───────────
// Chaque étape de la récupération cloud initiale (connexion, puis une ligne
// par table) vient y ajouter/mettre à jour une ligne, pour voir en direct —
// sans avoir à ouvrir la console — ce qui est récupéré et surtout ce qui
// bloque ou échoue. `key` identifie la ligne : un appel avec la même clé
// met à jour la ligne existante (ex. "⏳ blocs…" -> "✓ blocs (12)") au lieu
// d'en empiler une nouvelle. `cls` est 'ok' | 'err' | 'warn' | undefined.
// `detail` (optionnel) s'affiche en plus petit à côté du libellé (nombre de
// lignes récupérées, code HTTP…).
function _loadingEscHtml(s) {
  return String(s).replace(/[&<>"]/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; });
}
function _loadingLog(key, icon, label, detail, cls) {
  var el = document.getElementById('loading-status');
  if (!el) return;
  // Une seule ligne visible à la fois — pas un historique qui s'accumule
  // (le défilement gardait tout l'historique visible en scrollant, mais la
  // demande est explicitement de n'avoir jamais qu'une ligne à l'écran).
  // `key` n'est plus utilisé pour retrouver une ligne existante : chaque
  // appel remplace entièrement le contenu.
  el.innerHTML = '';
  var line = document.createElement('div');
  line.className = 'loading-status-line' + (cls ? ' ' + cls : '');
  line.innerHTML = '<span class="lsl-icon">' + icon + '</span>' +
    '<span class="lsl-table">' + _loadingEscHtml(label) + '</span>' +
    (detail ? '<span class="lsl-detail">' + _loadingEscHtml(detail) + '</span>' : '');
  el.appendChild(line);
}

// Message principal, gros, au-dessus de la barre de progression et du log.
function _loadingTitle(text) {
  var t = document.getElementById('loading-title');
  if (t) t.textContent = text;
}

// Barre de progression : _loadingProgressStart(total) une fois qu'on connaît
// le nombre d'étapes (ex. nombre de tables à récupérer), puis un appel à
// _loadingProgressTick() par étape terminée (succès ou échec, peu importe —
// c'est une progression, pas un indicateur de réussite).
var _loadingTotalSteps = 0;
var _loadingDoneSteps  = 0;
function _loadingProgressStart(total) {
  _loadingTotalSteps = total || 0;
  _loadingDoneSteps  = 0;
  var bar = document.getElementById('loading-bar-fill');
  if (bar) bar.style.width = '0%';
}
function _loadingProgressTick() {
  if (!_loadingTotalSteps) return;
  _loadingDoneSteps++;
  var pct = Math.min(100, Math.round((_loadingDoneSteps / _loadingTotalSteps) * 100));
  var bar = document.getElementById('loading-bar-fill');
  if (bar) bar.style.width = pct + '%';
}

// Certaines actions plus anciennes (ex. "Supprimer cette extension" version
// courte) ne nettoyaient pas toujours _D.collection / _D.boosters_data pour
// cette extension. Avec l'ancien blob JSON ça restait juste des données
// mortes sans conséquence ; avec de vraies clés étrangères, pousser une
// ligne "collection"/"boosters"/"goodies" pointant vers une extension qui
// n'existe plus ferait échouer TOUT le push (erreur 409). On filtre donc ces
// entrées orphelines avant l'envoi plutôt que de bloquer toute la synchro.
function _validExtIds() {
  var s = {};
  (_D.custom_exts || []).forEach(function (e) { s[e.id] = true; });
  return s;
}

// ── Description de chaque domaine synchronisé ──────────────────────────────
// L'ORDRE compte : une table avec clé étrangère doit être poussée APRÈS la
// table qu'elle référence (ex. classeur_extensions après classeurs).
// "userCol" = nom de la colonne user_id DANS CETTE table (préfixée), utilisée
// pour filtrer/supprimer/trier — chaque table a la sienne.
var _SYNC_DOMAINS = [
  {
    table: 'blocs', keyCols: ['blo_id'], userCol: 'blo_user_id', orderBy: 'blo_sort_order.asc',
    // BUG corrigé : _D.bloc_overrides (masquer un bloc intégré, le renommer,
    // changer son logo/sigle…) n'était synchronisé nulle part — jamais
    // poussé ni relu, alors que les colonnes existent déjà côté Supabase
    // (blo_is_hidden notamment). Ces personnalisations restaient donc
    // uniquement locales, perdues sur un autre appareil ou après une
    // restauration cloud. On les pousse maintenant dans la même table que
    // les blocs personnalisés (même structure de ligne), distingués à la
    // lecture par leur id : un bloc personnalisé a toujours un id préfixé
    // "cb_" (généré via addBloc), un override de bloc intégré non.
    toRows: function () {
      var out = [];
      (_D.custom_blocs || []).forEach(function (b, i) {
        out.push({
          blo_user_id: _cloudUserId(), blo_id: b.id, blo_nom: b.nom || '', blo_short: b.short || '',
          blo_couleur: b.couleur || '', blo_logo: b.logo || '', blo_sigle: b.sigle || '', blo_is_hidden: false,
          blo_sort_order: i, blo_updated_at: _isoNow(),
        });
      });
      Object.keys(_D.bloc_overrides || {}).forEach(function (blocId) {
        var ov = _D.bloc_overrides[blocId] || {};
        out.push({
          blo_user_id: _cloudUserId(), blo_id: blocId, blo_nom: ov.nom || '', blo_short: ov.short || '',
          blo_couleur: ov.couleur || '', blo_logo: ov.logo || '', blo_sigle: ov.sigle || '', blo_is_hidden: !!ov._hidden,
          blo_sort_order: 9999, blo_updated_at: _isoNow(),
        });
      });
      return out;
    },
    apply: function (rows) {
      var customRows    = rows.filter(function (r) { return String(r.blo_id).indexOf('cb_') === 0; });
      var overrideRows   = rows.filter(function (r) { return String(r.blo_id).indexOf('cb_') !== 0; });
      customRows.sort(function (a, b) { return (a.blo_sort_order || 0) - (b.blo_sort_order || 0); });
      _D.custom_blocs = customRows.map(function (r) {
        return { id: r.blo_id, short: r.blo_short || '', nom: r.blo_nom || '', couleur: r.blo_couleur || '', logo: r.blo_logo || '', sigle: r.blo_sigle || '', extensions: [], _custom_bloc: true };
      });
      var overrides = {};
      overrideRows.forEach(function (r) {
        var ov = {};
        if (r.blo_short)   ov.short   = r.blo_short;
        if (r.blo_nom)     ov.nom     = r.blo_nom;
        if (r.blo_couleur) ov.couleur = r.blo_couleur;
        if (r.blo_logo)    ov.logo    = r.blo_logo;
        if (r.blo_sigle)   ov.sigle   = r.blo_sigle;
        if (r.blo_is_hidden) ov._hidden = true;
        overrides[r.blo_id] = ov;
      });
      _D.bloc_overrides = overrides;
    },
  },
  {
    table: 'extensions', keyCols: ['ext_id'], userCol: 'ext_user_id', orderBy: 'ext_sort_order.asc',
    // Même principe que pour "blocs" ci-dessus : _D.ext_overrides (masquer
    // une extension intégrée, la déplacer vers un autre bloc via
    // bloc_id_override, changer son stat_mode…) n'était pas synchronisé.
    // Même table que les extensions personnalisées ; distingué à la lecture
    // par le préfixe "cx_" de l'id (généré via addExtension).
    toRows: function () {
      var out = [];
      (_D.custom_exts || []).forEach(function (e, i) {
        out.push({
          ext_user_id: _cloudUserId(), ext_id: e.id, ext_bloc_id: e.bloc_id || '', ext_bloc_id_override: '',
          ext_code: e.code || '', ext_nom: e.nom || '', ext_nb_cartes: e.nb_cartes || 0,
          ext_logo: e.logo || '', ext_sigle: e.sigle || '', ext_couleur: e.couleur || '',
          ext_stat_mode: e.stat_mode || 'all', ext_sorti: e.sorti !== false, ext_is_hidden: false,
          ext_sort_order: i, ext_updated_at: _isoNow(),
        });
      });
      Object.keys(_D.ext_overrides || {}).forEach(function (extId) {
        var ov = _D.ext_overrides[extId] || {};
        out.push({
          ext_user_id: _cloudUserId(), ext_id: extId, ext_bloc_id: '', ext_bloc_id_override: ov.bloc_id_override || '',
          ext_code: ov.code || '', ext_nom: ov.nom || '', ext_nb_cartes: ov.nb_cartes || 0,
          ext_logo: ov.logo || '', ext_sigle: ov.sigle || '', ext_couleur: ov.couleur || '',
          ext_stat_mode: ov.stat_mode || '', ext_sorti: false, ext_is_hidden: !!ov._hidden,
          ext_sort_order: 9999, ext_updated_at: _isoNow(),
        });
      });
      return out;
    },
    apply: function (rows) {
      var customRows   = rows.filter(function (r) { return String(r.ext_id).indexOf('cx_') === 0; });
      var overrideRows = rows.filter(function (r) { return String(r.ext_id).indexOf('cx_') !== 0; });
      customRows.sort(function (a, b) { return (a.ext_sort_order || 0) - (b.ext_sort_order || 0); });
      _D.custom_exts = customRows.map(function (r) {
        return {
          id: r.ext_id, code: r.ext_code || '', nom: r.ext_nom || '', nb_cartes: r.ext_nb_cartes || 0,
          bloc_id: r.ext_bloc_id || '', logo: r.ext_logo || '', sigle: r.ext_sigle || '', couleur: r.ext_couleur || '',
          stat_mode: r.ext_stat_mode || 'all', sorti: r.ext_sorti !== false, _custom: true,
        };
      });
      var overrides = {};
      overrideRows.forEach(function (r) {
        var ov = {};
        if (r.ext_code)     ov.code     = r.ext_code;
        if (r.ext_nom)      ov.nom      = r.ext_nom;
        if (r.ext_nb_cartes) ov.nb_cartes = r.ext_nb_cartes;
        if (r.ext_logo)     ov.logo     = r.ext_logo;
        if (r.ext_sigle)    ov.sigle    = r.ext_sigle;
        if (r.ext_couleur)  ov.couleur  = r.ext_couleur;
        if (r.ext_stat_mode) ov.stat_mode = r.ext_stat_mode;
        if (r.ext_bloc_id_override) ov.bloc_id_override = r.ext_bloc_id_override;
        if (r.ext_is_hidden) ov._hidden = true;
        overrides[r.ext_id] = ov;
      });
      _D.ext_overrides = overrides;
    },
  },
  {
    table: 'classeurs', keyCols: ['cla_id'], userCol: 'cla_user_id', orderBy: 'cla_sort_order.asc',
    toRows: function () {
      return (_D.classeurs || []).map(function (c, i) {
        return {
          cla_user_id: _cloudUserId(), cla_id: c.id, cla_nom: c.nom || '', cla_pages: c.pages || 40,
          cla_slots_par_page: c.slots_par_page || 18, cla_image: c.image || '', cla_bloc_id: c.bloc_id || '',
          cla_status: c.status || 'in_progress', cla_sort_order: i, cla_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.cla_sort_order || 0) - (b.cla_sort_order || 0); });
      var existingExtsById = {};
      (_D.classeurs || []).forEach(function (c) { existingExtsById[c.id] = c.extensions || []; });
      _D.classeurs = rows.map(function (r) {
        return {
          id: r.cla_id, nom: r.cla_nom || '', pages: r.cla_pages || 40, slots_par_page: r.cla_slots_par_page || 18,
          image: r.cla_image || '', bloc_id: r.cla_bloc_id || '', status: r.cla_status || 'in_progress',
          complete: r.cla_status === 'complete', extensions: existingExtsById[r.cla_id] || [],
        };
      });
    },
  },
  {
    table: 'classeur_extensions', keyCols: ['cle_classeur_id','cle_ext_id'], userCol: 'cle_user_id', orderBy: 'cle_sort_order.asc',
    toRows: function () {
      var out = [];
      var valid = _validExtIds();
      (_D.classeurs || []).forEach(function (cl) {
        (cl.extensions || []).forEach(function (ce, i) {
          if (!valid[ce.ext_id]) return; // extension supprimée depuis : entrée orpheline ignorée
          out.push({
            cle_user_id: _cloudUserId(), cle_classeur_id: cl.id, cle_ext_id: ce.ext_id,
            cle_pages: ce.pages || 0, cle_filled: ce.filled || 0, cle_sort_order: i, cle_updated_at: _isoNow(),
          });
        });
      });
      return out;
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.cle_sort_order || 0) - (b.cle_sort_order || 0); });
      var byClasseur = {};
      rows.forEach(function (r) {
        if (!byClasseur[r.cle_classeur_id]) byClasseur[r.cle_classeur_id] = [];
        byClasseur[r.cle_classeur_id].push({ ext_id: r.cle_ext_id, pages: r.cle_pages || 0, filled: r.cle_filled || 0 });
      });
      (_D.classeurs || []).forEach(function (cl) { cl.extensions = byClasseur[cl.id] || []; });
    },
  },
  {
    table: 'collection', keyCols: ['col_ext_id','col_number'], userCol: 'col_user_id',
    toRows: function () {
      var out = [];
      var valid = _validExtIds();
      Object.keys(_D.collection || {}).forEach(function (extId) {
        if (!valid[extId]) return; // extension supprimée depuis : entrée orpheline ignorée
        var byNum = _D.collection[extId] || {};
        var seen = {}; // deux clés différentes ("8" et "08") peuvent redevenir le même
                        // nombre après parseInt : sans dédoublonnage, l'insertion en masse
                        // échoue avec une violation de contrainte unique (deux lignes avec
                        // la même clé primaire dans le même envoi).
        Object.keys(byNum).forEach(function (num) {
          var n = parseInt(num, 10);
          if (isNaN(n) || seen[n]) return;
          seen[n] = true;
          var c = byNum[num] || {};
          out.push({
            col_user_id: _cloudUserId(), col_ext_id: extId, col_number: n,
            col_owned: c.owned !== false, col_foil: !!c.foil, col_qte: c.qte || 1, col_updated_at: _isoNow(),
          });
        });
      });
      return out;
    },
    apply: function (rows) {
      var byExt = {};
      rows.forEach(function (r) {
        if (!byExt[r.col_ext_id]) byExt[r.col_ext_id] = {};
        byExt[r.col_ext_id][r.col_number] = { owned: r.col_owned !== false, foil: !!r.col_foil, qte: r.col_qte || 1 };
      });
      _D.collection = byExt;
    },
  },
  {
    // Uniquement product_type === 'booster'. Le reste part dans "goodies".
    table: 'boosters', keyCols: ['boo_id'], userCol: 'boo_user_id', orderBy: 'boo_sort_order.asc',
    toRows: function () {
      var out = [];
      var valid = _validExtIds();
      Object.keys(_D.boosters_data || {}).forEach(function (extId) {
        if (!valid[extId]) return; // extension supprimée depuis : entrée orpheline ignorée
        (_D.boosters_data[extId] || []).forEach(function (il, i) {
          if ((il.product_type || 'booster') !== 'booster') return;
          out.push({
            boo_user_id: _cloudUserId(), boo_id: il.id, boo_ext_id: extId, boo_product_type: 'booster',
            boo_description: il.desc || '', boo_img: il.img || '', boo_obtained: !!il.obtained, boo_date: il.date || '',
            boo_sort_order: i, boo_updated_at: _isoNow(),
          });
        });
      });
      return out;
    },
    apply: function (rows) {
      _applyBoosterLikeRows(rows, {
        idCol: 'boo_id', extCol: 'boo_ext_id', typeCol: 'boo_product_type', descCol: 'boo_description',
        imgCol: 'boo_img', obtainedCol: 'boo_obtained', dateCol: 'boo_date', sortCol: 'boo_sort_order', isBooster: true,
      });
    },
  },
  {
    // Tout ce qui n'est PAS product_type 'booster' (deck, etb, premium…).
    table: 'goodies', keyCols: ['goo_id'], userCol: 'goo_user_id', orderBy: 'goo_sort_order.asc',
    toRows: function () {
      var out = [];
      var valid = _validExtIds();
      Object.keys(_D.boosters_data || {}).forEach(function (extId) {
        if (!valid[extId]) return; // extension supprimée depuis : entrée orpheline ignorée
        (_D.boosters_data[extId] || []).forEach(function (il, i) {
          var pt = il.product_type || 'booster';
          if (pt === 'booster') return;
          out.push({
            goo_user_id: _cloudUserId(), goo_id: il.id, goo_ext_id: extId, goo_product_type: pt,
            goo_description: il.desc || '', goo_img: il.img || '', goo_obtained: !!il.obtained, goo_date: il.date || '',
            goo_sort_order: i, goo_updated_at: _isoNow(),
          });
        });
      });
      return out;
    },
    apply: function (rows) {
      _applyBoosterLikeRows(rows, {
        idCol: 'goo_id', extCol: 'goo_ext_id', typeCol: 'goo_product_type', descCol: 'goo_description',
        imgCol: 'goo_img', obtainedCol: 'goo_obtained', dateCol: 'goo_date', sortCol: 'goo_sort_order', isBooster: false,
      });
    },
  },
  {
    table: 'acheteurs', keyCols: ['ach_id'], userCol: 'ach_user_id',
    toRows: function () {
      return (_D.acheteurs || []).map(function (a) {
        return {
          ach_user_id: _cloudUserId(), ach_id: a.id, ach_pseudo: a.pseudo || '', ach_icon: a.icon || '',
          ach_created_at: new Date(a.created_at || Date.now()).toISOString(), ach_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.acheteurs = rows.map(function (r) {
        return {
          id: r.ach_id, pseudo: r.ach_pseudo || '', icon: r.ach_icon || '',
          created_at: r.ach_created_at ? new Date(r.ach_created_at).getTime() : Date.now(),
          updated_at: r.ach_updated_at ? new Date(r.ach_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    table: 'vendeurs', keyCols: ['vnd_id'], userCol: 'vnd_user_id',
    toRows: function () {
      return (_D.vendeurs || []).map(function (v) {
        return {
          vnd_user_id: _cloudUserId(), vnd_id: v.id, vnd_pseudo: v.pseudo || '', vnd_icon: v.icon || '',
          vnd_created_at: new Date(v.created_at || Date.now()).toISOString(), vnd_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.vendeurs = rows.map(function (r) {
        return {
          id: r.vnd_id, pseudo: r.vnd_pseudo || '', icon: r.vnd_icon || '',
          created_at: r.vnd_created_at ? new Date(r.vnd_created_at).getTime() : Date.now(),
          updated_at: r.vnd_updated_at ? new Date(r.vnd_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    // Doit être poussée APRÈS "acheteurs" (clé étrangère acc_acheteur_id).
    table: 'acheteur_commandes', keyCols: ['acc_id'], userCol: 'acc_user_id',
    toRows: function () {
      return (_D.acheteur_commandes || []).map(function (c) {
        return {
          acc_user_id: _cloudUserId(), acc_id: c.id, acc_acheteur_id: c.acheteur_id,
          acc_date_achat: c.date_achat || '', acc_date_arrivee: c.date_arrivee || '',
          acc_lien_vente: c.lien_vente || '', acc_etat: c.etat || 'a_envoyer',
          acc_created_at: new Date(c.created_at || Date.now()).toISOString(), acc_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.acheteur_commandes = rows.map(function (r) {
        return {
          id: r.acc_id, acheteur_id: r.acc_acheteur_id, date_achat: r.acc_date_achat || '', date_arrivee: r.acc_date_arrivee || '',
          lien_vente: r.acc_lien_vente || '', etat: r.acc_etat || 'a_envoyer',
          created_at: r.acc_created_at ? new Date(r.acc_created_at).getTime() : Date.now(),
          updated_at: r.acc_updated_at ? new Date(r.acc_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    // Doit être poussée APRÈS "vendeurs" (clé étrangère vco_vendeur_id).
    table: 'vendeur_commandes', keyCols: ['vco_id'], userCol: 'vco_user_id',
    toRows: function () {
      return (_D.vendeur_commandes || []).map(function (c) {
        return {
          vco_user_id: _cloudUserId(), vco_id: c.id, vco_vendeur_id: c.vendeur_id,
          vco_date_achat: c.date_achat || '', vco_date_arrivee: c.date_arrivee || '',
          vco_lien_achat: c.lien_achat || '', vco_etat: c.etat || 'a_payer',
          vco_created_at: new Date(c.created_at || Date.now()).toISOString(), vco_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.vendeur_commandes = rows.map(function (r) {
        return {
          id: r.vco_id, vendeur_id: r.vco_vendeur_id, date_achat: r.vco_date_achat || '', date_arrivee: r.vco_date_arrivee || '',
          lien_achat: r.vco_lien_achat || '', etat: r.vco_etat || 'a_payer',
          created_at: r.vco_created_at ? new Date(r.vco_created_at).getTime() : Date.now(),
          updated_at: r.vco_updated_at ? new Date(r.vco_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    // Doit être poussée APRÈS "acheteur_commandes" (clé étrangère ven_commande_id).
    table: 'ventes', keyCols: ['ven_id'], userCol: 'ven_user_id',
    toRows: function () {
      return (_D.ventes || []).map(function (v) {
        return {
          ven_user_id: _cloudUserId(), ven_id: v.id, ven_card_id: v.card_id || '', ven_card_name: v.card_name || '',
          ven_card_image: v.card_image || '', ven_set_id: v.set_id || '', ven_set_name: v.set_name || '', ven_set_logo: v.set_logo || '',
          ven_ext_sigle: v.ext_sigle || '', ven_crop: v.crop || 'center', ven_number: v.number || '', ven_rarity: v.rarity || '',
          ven_pokemon_name: v.pokemon_name || '', ven_etat: v.etat || 'Near Mint', ven_prix: v.prix || 0, ven_qty: v.qty || 1,
          ven_types: v.types || [], ven_langue: v.langue || 'Français', ven_statut: v.statut || 'a_mettre',
          ven_commande_id: v.commande_id || null, ven_cardmarket_url: v.cardmarket_url || '',
          ven_created_at: new Date(v.created_at || Date.now()).toISOString(), ven_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.ventes = rows.map(function (r) {
        return {
          id: r.ven_id, card_id: r.ven_card_id || '', card_name: r.ven_card_name || '', card_image: r.ven_card_image || '',
          set_id: r.ven_set_id || '', set_name: r.ven_set_name || '', set_logo: r.ven_set_logo || '', ext_sigle: r.ven_ext_sigle || '',
          crop: r.ven_crop || 'center', number: r.ven_number || '', rarity: r.ven_rarity || '', pokemon_name: r.ven_pokemon_name || '',
          etat: r.ven_etat || 'Near Mint', prix: r.ven_prix || 0, qty: r.ven_qty || 1, types: r.ven_types || [], langue: r.ven_langue || 'Français',
          statut: r.ven_statut || 'a_mettre', commande_id: r.ven_commande_id || null, cardmarket_url: r.ven_cardmarket_url || '',
          created_at: r.ven_created_at ? new Date(r.ven_created_at).getTime() : Date.now(),
          updated_at: r.ven_updated_at ? new Date(r.ven_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    // Doit être poussée APRÈS "vendeur_commandes" (clé étrangère dep_commande_id).
    table: 'depenses', keyCols: ['dep_id'], userCol: 'dep_user_id',
    toRows: function () {
      return (_D.depenses || []).map(function (d) {
        return {
          dep_user_id: _cloudUserId(), dep_id: d.id, dep_card_id: d.card_id || '', dep_card_name: d.card_name || '',
          dep_card_image: d.card_image || '', dep_set_id: d.set_id || '', dep_set_name: d.set_name || '', dep_set_logo: d.set_logo || '',
          dep_ext_sigle: d.ext_sigle || '', dep_crop: d.crop || 'center', dep_number: d.number || '', dep_rarity: d.rarity || '',
          dep_pokemon_name: d.pokemon_name || '', dep_etat: d.etat || 'Near Mint', dep_prix: d.prix || 0, dep_qty: d.qty || 1,
          dep_types: d.types || [], dep_langue: d.langue || 'Français', dep_commande_id: d.commande_id || null,
          dep_cardmarket_url: d.cardmarket_url || '',
          dep_created_at: new Date(d.created_at || Date.now()).toISOString(), dep_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      _D.depenses = rows.map(function (r) {
        return {
          id: r.dep_id, card_id: r.dep_card_id || '', card_name: r.dep_card_name || '', card_image: r.dep_card_image || '',
          set_id: r.dep_set_id || '', set_name: r.dep_set_name || '', set_logo: r.dep_set_logo || '', ext_sigle: r.dep_ext_sigle || '',
          crop: r.dep_crop || 'center', number: r.dep_number || '', rarity: r.dep_rarity || '', pokemon_name: r.dep_pokemon_name || '',
          etat: r.dep_etat || 'Near Mint', prix: r.dep_prix || 0, qty: r.dep_qty || 1, types: r.dep_types || [], langue: r.dep_langue || 'Français',
          commande_id: r.dep_commande_id || null, cardmarket_url: r.dep_cardmarket_url || '',
          created_at: r.dep_created_at ? new Date(r.dep_created_at).getTime() : Date.now(),
          updated_at: r.dep_updated_at ? new Date(r.dep_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    table: 'label_categories', keyCols: ['lab_id'], userCol: 'lab_user_id', orderBy: 'lab_sort_order.asc',
    toRows: function () {
      return (_D.label_categories || []).map(function (c, idx) {
        return {
          lab_user_id: _cloudUserId(), lab_id: c.id, lab_name: c.name || '',
          lab_is_hidden: !!c.hidden, lab_parent_id: c.parent_id || null,
          lab_sort_order: c.sort_order != null ? c.sort_order : idx, lab_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.lab_sort_order || 0) - (b.lab_sort_order || 0); });
      _D.label_categories = rows.map(function (r, idx) {
        return {
          id: r.lab_id, name: r.lab_name || '', hidden: !!r.lab_is_hidden,
          parent_id: r.lab_parent_id || null, sort_order: r.lab_sort_order != null ? r.lab_sort_order : idx,
        };
      });
    },
  },
  {
    table: 'labels', keyCols: ['lbl_type'], userCol: 'lbl_user_id', orderBy: 'lbl_sort_order.asc',
    toRows: function () {
      return (_D.labels || []).map(function (l, idx) {
        return {
          lbl_user_id: _cloudUserId(), lbl_type: l.type, lbl_fr: l.fr || '', lbl_badge: l.badge || '',
          lbl_color: l.color || '#888888', lbl_enabled: l.enabled !== false,
          lbl_prefixes: l.prefixes || [], lbl_suffixes: l.suffixes || [],
          lbl_category_id: l.category_id || null, lbl_sort_order: l.sort_order != null ? l.sort_order : idx,
          lbl_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.lbl_sort_order || 0) - (b.lbl_sort_order || 0); });
      var neededRepair = false;
      _D.labels = rows.map(function (r, idx) {
        var prefixes = typeof _cleanPatternList === 'function' ? _cleanPatternList(r.lbl_prefixes) : (Array.isArray(r.lbl_prefixes) ? r.lbl_prefixes : []);
        var suffixes = typeof _cleanPatternList === 'function' ? _cleanPatternList(r.lbl_suffixes) : (Array.isArray(r.lbl_suffixes) ? r.lbl_suffixes : []);
        if (JSON.stringify(prefixes) !== JSON.stringify(r.lbl_prefixes) || JSON.stringify(suffixes) !== JSON.stringify(r.lbl_suffixes)) neededRepair = true;
        return {
          type: r.lbl_type, fr: r.lbl_fr || r.lbl_type, badge: r.lbl_badge || '', color: r.lbl_color || '#888888',
          enabled: r.lbl_enabled !== false,
          prefixes: prefixes, suffixes: suffixes,
          category_id: r.lbl_category_id || null, sort_order: r.lbl_sort_order != null ? r.lbl_sort_order : idx,
        };
      });
      // Au moins une ligne avait un résidu d'encodage en base : on reprogramme
      // un envoi (avec les tableaux maintenant propres) pour corriger
      // définitivement Supabase, plutôt que de devoir re-nettoyer à chaque
      // chargement.
      if (neededRepair && typeof _scheduleCloudPush === 'function') _scheduleCloudPush();
    },
  },
  {
    table: 'pokemon_label_assignments', keyCols: ['pok_pokemon_key'], userCol: 'pok_user_id',
    toRows: function () {
      var map = _D.pokemon_label_assignments || {};
      return Object.keys(map).map(function (k) {
        return { pok_user_id: _cloudUserId(), pok_pokemon_key: k, pok_label_id: map[k], pok_updated_at: _isoNow() };
      });
    },
    apply: function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.pok_pokemon_key] = r.pok_label_id; });
      _D.pokemon_label_assignments = map;
    },
  },
  {
    // Corrections manuelles Personnages/Objets/Lieux/Énergies (voir
    // js/perso-objets.js) — SIMPLIFIÉ : chaque entrée n'est plus qu'un nom +
    // une image, créée à la main dans Édition (plus de catalogue TCGdex, ni
    // de cartes assignées une à une : tout est retrouvé automatiquement par
    // nom). pko_is_custom reste envoyé pour ne pas casser le schéma
    // existant, mais n'est plus utilisé par l'app — pko_is_deleted reste
    // filtré à la lecture par sécurité, pour qu'une ancienne entrée masquée
    // sous l'ancien système ne réapparaisse pas. pko_manual_card_ids n'est
    // PLUS envoyé du tout (colonne à supprimer, voir migration SQL).
    table: 'perso_objets', keyCols: ['pko_id'], userCol: 'pko_user_id',
    toRows: function () {
      return (_D.perso_objets || []).map(function (o, i) {
        return {
          pko_user_id: _cloudUserId(), pko_id: o.id, pko_kind: o.kind,
          pko_display_name: o.display_name || '', pko_image_url: o.image_url || '',
          pko_is_custom: true, pko_is_deleted: false,
          pko_sort_order: o.sort_order != null ? o.sort_order : i,
          pko_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.pko_sort_order || 0) - (b.pko_sort_order || 0); });
      _D.perso_objets = rows.filter(function (r) { return !r.pko_is_deleted; }).map(function (r) {
        return {
          id: r.pko_id, kind: r.pko_kind, display_name: r.pko_display_name || '', image_url: r.pko_image_url || '',
          sort_order: r.pko_sort_order || 0,
        };
      });
    },
  },
  {
    // Catégorie forcée d'une carte (pokemon/objet/personnage), voir
    // setCardCategoryOverride dans js/perso-objets.js — même forme minimale
    // clé -> valeur que pokemon_label_assignments ci-dessus.
    table: 'card_category_overrides', keyCols: ['cco_card_id'], userCol: 'cco_user_id',
    toRows: function () {
      var map = _D.card_category_overrides || {};
      return Object.keys(map).map(function (k) {
        return { cco_user_id: _cloudUserId(), cco_card_id: k, cco_category: map[k], cco_updated_at: _isoNow() };
      });
    },
    apply: function (rows) {
      var map = {};
      rows.forEach(function (r) { map[r.cco_card_id] = r.cco_category; });
      _D.card_category_overrides = map;
    },
  },
];

// Les deux tables "boosters" et "goodies" partagent la même forme de ligne
// et le même objet JS cible (_D.boosters_data) — factorisé ici pour éviter
// de dupliquer la logique deux fois.
//
// BUG corrigé : cette fonction faisait un simple .push() sur
// _D.boosters_data[extId] sans jamais le vider d'abord. Résultat : à chaque
// pull cloud (bouton Synchroniser, ou restauration automatique au chargement
// si le cloud est plus récent), les lignes fraîchement récupérées
// s'ajoutaient à celles déjà en mémoire au lieu de les remplacer → doublons
// visibles à l'écran qui grossissent à chaque sync. Comme chaque ligne
// rejouée garde l'id d'origine (boo_id/goo_id venant de Supabase), un push
// ultérieur vers le cloud fait un upsert sur le même id : la base elle-même
// ne se retrouve jamais dupliquée, seul l'état local (_D) l'est — exactement
// le symptôme observé.
//
// Le vrai piège : boosters et goodies écrivent dans LE MÊME objet
// _D.boosters_data[extId], juste filtré par product_type. On ne peut donc
// pas se contenter de vider tout _D.boosters_data au début de l'apply d'un
// des deux domaines, sous peine d'effacer ce que l'autre domaine venait d'y
// mettre. La solution : chaque appel ne remplace QUE le sous-ensemble qui le
// concerne (booster, ou non-booster) dans chaque extension déjà connue —
// y compris les extensions qui n'apparaissent plus du tout dans les
// nouvelles lignes (ex. tous les boosters d'une extension supprimés côté
// cloud doivent bien disparaître localement).
function _applyBoosterLikeRows(rows, cols) {
  rows.sort(function (a, b) { return (a[cols.sortCol] || 0) - (b[cols.sortCol] || 0); });
  if (!_D.boosters_data) _D.boosters_data = {};

  Object.keys(_D.boosters_data).forEach(function (extId) {
    _D.boosters_data[extId] = (_D.boosters_data[extId] || []).filter(function (il) {
      var ilIsBooster = (il.product_type || 'booster') === 'booster';
      return cols.isBooster ? !ilIsBooster : ilIsBooster;
    });
  });

  rows.forEach(function (r) {
    var extId = r[cols.extCol];
    if (!_D.boosters_data[extId]) _D.boosters_data[extId] = [];
    _D.boosters_data[extId].push({
      id: r[cols.idCol], desc: r[cols.descCol] || '', img: r[cols.imgCol] || '',
      obtained: !!r[cols.obtainedCol], date: r[cols.dateCol] || '', product_type: r[cols.typeCol] || 'booster',
    });
  });

  Object.keys(_D.boosters_data).forEach(function (extId) {
    if (!_D.boosters_data[extId].length) delete _D.boosters_data[extId];
  });
}

// Certains id générés avec Date.now() (illustrations, ventes, dépenses...)
// ne sont pas garantis uniques si deux ont été créées à la même
// milliseconde par le passé. Avec l'ancien blob JSON ça ne posait pas de
// souci ; avec une vraie contrainte d'unicité en base, deux lignes
// identiques dans le MÊME envoi font échouer toute l'écriture (23505). On
// dédoublonne donc chaque lot juste avant l'envoi, quelle que soit la
// table — on garde la DERNIÈRE occurrence de chaque clé (reflète l'état le
// plus récent en mémoire).
function _dedupeByKey(rows, keyCols) {
  var byKey = {};
  var order = [];
  rows.forEach(function (r) {
    var key = keyCols.map(function (c) { return r[c]; }).join('\u0000');
    if (!(key in byKey)) order.push(key);
    byKey[key] = r;
  });
  return order.map(function (key) { return byKey[key]; });
}

// ── Push : remplacement complet, table par table, dans l'ordre ci-dessus ──
var _pushInProgress = false;
var _pushRerunNeeded = false;

// Chaque domaine fait un DELETE puis un INSERT en 2 requêtes séparées. Une
// synchro complète (15 tables) prend donc plusieurs secondes — largement le
// temps qu'une nouvelle sauvegarde (ex. cocher une carte dans le Pokédex)
// déclenche un DEUXIÈME push pendant que le premier tourne encore. Sans
// verrou, les deux s'exécutent en parallèle sur les MÊMES tables : l'un
// supprime/réinsère pendant que l'autre le fait aussi avec un instantané
// légèrement différent de _D, ce qui provoque exactement ce genre de
// "duplicate key" (23505) quand les deux écritures s'entrelacent.
async function _cloudPushAll() {
  if (!_cloudReady()) return;
  if (_pullInProgress) {
    // Un pull est en cours (restauration au chargement, bouton Synchroniser
    // ou Récupérer depuis le cloud) : ne surtout pas pousser par-dessus. Le
    // push fait un DELETE puis un INSERT par table ; s'il s'intercale au
    // milieu d'un pull qui n'a pas fini de lire/appliquer toutes les tables,
    // il peut vider des lignes que le pull n'a pas encore traitées. On
    // réessaie simplement un peu plus tard plutôt que de forcer.
    setTimeout(_cloudPushAll, 400);
    return;
  }
  if (_pushInProgress) {
    // Une synchro tourne déjà : on ne lance pas une deuxième écriture en
    // parallèle, on redemande juste un passage juste après celui en cours,
    // pour rattraper les changements faits entre-temps.
    _pushRerunNeeded = true;
    return;
  }
  _pushInProgress = true;
  try {
    // BUG corrigé : les ~18 tables étaient poussées une par une (boucle avec
    // await séquentiel, DELETE puis INSERT à chaque fois) — plusieurs
    // dizaines de rendez-vous réseau bout à bout à CHAQUE sauvegarde, quel
    // que soit l'ampleur du changement (ajouter une seule carte à une vente
    // repoussait quand même les 18 tables en entier, une par une). C'est
    // exactement le même problème que celui déjà corrigé côté lecture (voir
    // le commentaire au-dessus de _cloudPullAll) — jamais reporté côté
    // écriture jusqu'ici. Poussées maintenant EN PARALLÈLE (Promise.all) :
    // aucune table ne dépend d'une autre (chacune son propre DELETE+INSERT
    // sur sa propre table), donc rien n'empêchait de les lancer toutes en
    // même temps. Chaque domaine a aussi son propre try/catch — un problème
    // sur UNE table (ex. colonne manquante) ne bloque plus la synchro des
    // 17 autres, contrairement à avant où la première erreur arrêtait tout
    // net (vécu très concrètement avec l'erreur pko_manual_card_ids).
    var results = await Promise.all(_SYNC_DOMAINS.map(async function (d) {
      try {
        var rows = _dedupeByKey(d.toRows(), d.keyCols);
        var delRes = await fetch(SB_URL + '/rest/v1/' + d.table + '?' + d.userCol + '=eq.' + encodeURIComponent(_cloudUserId()), {
          method: 'DELETE', headers: _sbHeaders(),
        });
        if (!delRes.ok) {
          var db = await delRes.text().catch(function () { return ''; });
          throw new Error('suppression ' + d.table + ' refusée (HTTP ' + delRes.status + ') ' + db.slice(0, 200));
        }
        if (rows.length) {
          var insRes = await fetch(SB_URL + '/rest/v1/' + d.table, {
            method: 'POST',
            headers: _sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
            body: JSON.stringify(rows),
          });
          if (!insRes.ok) {
            var ib = await insRes.text().catch(function () { return ''; });
            throw new Error('écriture ' + d.table + ' refusée (HTTP ' + insRes.status + ') ' + ib.slice(0, 200));
          }
        }
        return null;
      } catch (e) {
        return e; // un domaine en échec ne doit pas empêcher les autres de pousser
      }
    }));

    // Réglages (ligne unique par utilisateur) + horodatage global de synchro
    // — tenté même si une ou plusieurs tables ci-dessus ont échoué : c'est
    // une ligne indépendante, pas de raison de la bloquer pour autant.
    var s = _D.settings || {};
    var settingsRow = {
      set_user_id: _cloudUserId(), set_display_mode: s.display_mode || 'logo', set_sort_dir: s.sort_dir || 'asc',
      set_ui_scale: s.ui_scale || 1, set_bloc_order: s.bloc_order || [], set_tab_view_modes: s.tab_view_modes || {},
      set_data_ts: _D._ts || Date.now(), set_updated_at: _isoNow(),
    };
    var setRes = await fetch(SB_URL + '/rest/v1/settings?on_conflict=set_user_id', {
      method: 'POST',
      headers: _sbHeaders({ 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(settingsRow),
    });
    if (!setRes.ok) {
      var sb = await setRes.text().catch(function () { return ''; });
      throw new Error('écriture settings refusée (HTTP ' + setRes.status + ') ' + sb.slice(0, 200));
    }

    var failures = results.filter(function (e) { return e; });
    if (failures.length) {
      throw new Error(failures.length + '/' + _SYNC_DOMAINS.length + ' table(s) en échec : ' + failures.map(function (e) { return e.message; }).join(' | '));
    }
  } finally {
    _pushInProgress = false;
  }
  if (_pushRerunNeeded) {
    _pushRerunNeeded = false;
    await _cloudPushAll(); // rattrape ce qui a changé pendant qu'on poussait
  }
}

// ── Pull : uniquement si le cloud est strictement plus récent (sauf si
//    force=true, voir forceRestoreFromCloud ci-dessous) ────────────────────
//
// Deux bugs corrigés ici, tous deux responsables du même symptôme (collection
// entière vidée juste après le message "Données restaurées depuis le
// cloud", sur une page/un navigateur sans donnée locale) :
//
// 1. Les ~20 tables étaient lues une par une (boucle avec await séquentiel) :
//    plusieurs secondes au total. Largement le temps qu'un push automatique
//    (_scheduleCloudPush, déclenché par n'importe quel saveData() ailleurs
//    dans l'appli, débouncé 1.2s) se déclenche PENDANT que le pull tourne
//    encore. Comme le push fait un DELETE puis un INSERT par table (voir
//    _cloudPushAll), un push qui s'intercale au milieu d'un pull peut
//    supprimer des lignes que le pull n'a pas encore lues, ou les réinsérer
//    avec un _D encore partiellement (voire pas du tout) peuplé — ce qui
//    vide réellement le cloud, pas juste l'affichage local. Fix : les
//    tables sont maintenant toutes lues EN PARALLÈLE (Promise.all), ce qui
//    réduit la fenêtre de course à la durée d'UNE seule requête plutôt que
//    vingt, et un vrai verrou (_pullInProgress) fait maintenant patienter
//    tout push tant qu'un pull est en cours.
// 2. Si malgré tout une table revient vide (RLS mal configurée, ou push
//    concurrent qui a quand même réussi à passer), l'ancien code appliquait
//    ce résultat vide tel quel. On récupère maintenant TOUT d'abord sans
//    rien appliquer, et si LITTÉRALEMENT AUCUNE table ne renvoie la moindre
//    ligne alors que settings.set_data_ts existe, on refuse d'appliquer quoi
//    que ce soit plutôt que de vider la collection locale par erreur.
var _pullInProgress = false;
async function _cloudPullAll(force) {
  if (!_cloudReady()) {
    _loadingTitle('Mode local');
    _loadingLog('_conn', '⚠️', 'Cloud non configuré', 'utilisation des données locales', 'warn');
    return false;
  }
  _pullInProgress = true;
  _loadingTitle('Connexion à Supabase…');
  _loadingLog('_conn', '⏳', 'Connexion à Supabase', '', undefined);
  try {
    var res = await fetch(SB_URL + '/rest/v1/settings?set_user_id=eq.' + encodeURIComponent(_cloudUserId()), { headers: _sbHeaders() });
    if (!res.ok) {
      _loadingTitle('Erreur de connexion');
      _loadingLog('_conn', '✗', 'Connexion à Supabase', 'HTTP ' + res.status, 'err');
      return false;
    }
    var rows = await res.json();
    if (!rows.length) {
      _loadingTitle('Premier lancement');
      _loadingLog('_conn', '⚠️', 'Aucune donnée cloud', 'rien à récupérer pour l’instant', 'warn');
      return false;
    }
    var cloudTs = rows[0].set_data_ts || 0;
    if (!force && cloudTs <= (_D._ts || 0)) {
      _loadingLog('_conn', '✓', 'Connexion à Supabase', 'local déjà à jour', 'ok');
      return false;
    }
    _loadingLog('_conn', '✓', 'Connexion à Supabase', 'ok', 'ok');
    _loadingTitle('Récupération des données…');

    // BUG UX corrigé : les 18 lignes "⏳ …" apparaissaient TOUTES d'un coup
    // (dès le lancement du Promise.all, avant même la moindre réponse
    // réseau), puis se transformaient en "✓"/"✗" dans un ordre quelconque —
    // donnant l'impression d'un mur figé plutôt que d'un chargement
    // progressif. Chaque ligne n'est maintenant ajoutée qu'à la toute fin
    // de SA propre requête (une seule fois, déjà avec son résultat) : les
    // lignes apparaissent donc une par une, dans l'ordre réel où chaque
    // table répond.
    var fetched = await Promise.all(_SYNC_DOMAINS.map(async function (d) {
      var url = SB_URL + '/rest/v1/' + d.table + '?' + d.userCol + '=eq.' + encodeURIComponent(_cloudUserId()) + (d.orderBy ? '&order=' + d.orderBy : '');
      try {
        var r = await fetch(url, { headers: _sbHeaders() });
        if (!r.ok) {
          _loadingLog(d.table, '✗', d.table, 'HTTP ' + r.status, 'err');
          _loadingProgressTick();
          return { domain: d, rows: null };
        }
        var data = await r.json();
        _loadingLog(d.table, '✓', d.table, String(data.length), 'ok');
        _loadingProgressTick();
        return { domain: d, rows: data };
      } catch (e) {
        _loadingLog(d.table, '✗', d.table, e.message, 'err');
        _loadingProgressTick();
        return { domain: d, rows: null }; // échec réseau : ce domaine ne sera pas touché
      }
    }));

    var anyRowsFound = fetched.some(function (f) { return f.rows && f.rows.length; });
    if (!anyRowsFound) {
      _loadingTitle('Erreur de synchronisation');
      _loadingLog('_conn', '✗', 'Toutes les tables sont vides', 'policies RLS ?', 'err');
      throw new Error("le cloud a répondu mais TOUTES les tables sont vides — vérifie les policies RLS dans Supabase (lecture SELECT autorisée pour la clé anon, sur chaque table). Rien n'a été modifié en local.");
    }

    fetched.forEach(function (f) { if (f.rows) f.domain.apply(f.rows); });
    _loadingTitle('Données synchronisées !');

    var s = rows[0];
    // On préserve les éventuels réglages purement locaux (ex. sales_cards_per_row,
    // qui n'a pas encore de colonne dédiée côté cloud) au lieu d'écraser tout
    // _D.settings — seuls les champs réellement gérés par la table cloud sont
    // remplacés.
    _D.settings = {
      ..._D.settings,
      display_mode: s.set_display_mode || 'logo', sort_dir: s.set_sort_dir || 'asc', ui_scale: s.set_ui_scale || 1,
      bloc_order: s.set_bloc_order || [], tab_view_modes: s.set_tab_view_modes || {},
    };
    _D._ts = cloudTs;
    return true;
  } finally {
    _pullInProgress = false;
  }
}

// ── Débounce du push automatique après chaque saveData() ──────────────────
// _initialSyncDone : sécurité SUPPLÉMENTAIRE (en plus du blocage visuel de
// l'écran de chargement côté core.js, et du verrou _pullInProgress ci-dessus)
// — tant que la synchro initiale n'est pas terminée, AUCUN push n'est même
// programmé, quel que soit ce qui a appelé saveData(). Ça ferme le chemin qui
// pouvait encore écraser le cloud avec un état local pas encore stabilisé,
// sans dépendre uniquement du fait que l'UI est masquée pendant le chargement.
var _initialSyncDone = false;
var _cloudPushTimer = null;
function _scheduleCloudPush() {
  if (!_initialSyncDone) return; // pas de push tant que le pull initial n'a pas fini d'appliquer les données
  clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(function () {
    _cloudPushAll().catch(function (e) {
      console.error('[PTCG] push cloud auto : erreur', e.message);
      toast('Sync cloud : ' + e.message, 'error');
    });
  }, 1200);
}

// ── Synchronisation initiale (au chargement de la page) ───────────────────
// Au chargement de la page, on ne fait QUE récupérer depuis le cloud, jamais
// écrire dessus — c'est ce que "récupération seule" veut dire concrètement :
// ni saveData() (qui programme un push), ni le moindre appel à
// _cloudPushAll(), quel que soit le résultat du pull. Pousser au chargement
// est exactement ce qui pouvait écraser le cloud avec un état local pas
// encore stabilisé (voir _persistLocalOnly dans core.js). Si l'utilisateur
// modifie ensuite quoi que ce soit, le push automatique habituel
// (_scheduleCloudPush via saveData()) prend le relais normalement.
//
// core.js attend (await) cette fonction avant de retirer l'écran de
// chargement : tant qu'elle n'est pas résolue, aucune interaction utilisateur
// n'est possible, donc aucun saveData()/push ne peut partir. _initialSyncDone
// n'est mis à true qu'à la toute fin, une fois le pull, son application à _D,
// ET le préchargement des cartes (_preloadCardCatalogs, voir plus bas)
// terminés — c'est ce même flag que _scheduleCloudPush vérifie juste
// au-dessus, en sécurité indépendante de l'écran de chargement.
async function _cloudInitialSync() {
  // Une seule barre de progression pour TOUT ce qu'il y a à charger — pas
  // seulement la récupération cloud (_SYNC_DOMAINS) mais aussi le
  // préchargement des cartes (Pokédex + les 4 catégories + leurs comptes
  // possédés, voir _preloadCardCatalogs). Calculé UNE FOIS ici, au tout
  // début, pour que la barre ne reparte jamais de zéro en cours de route :
  // _cloudPullAll et _preloadCardCatalogs se contentent chacun d'appeler
  // _loadingProgressTick() au fur et à mesure, sur ce même total.
  var preloadSteps = (typeof PKO_KINDS !== 'undefined') ? PKO_KINDS.length + 2 : 0; // Pokédex + 4 catégories + cartes possédées
  _loadingProgressStart(_SYNC_DOMAINS.length + preloadSteps);
  try {
    // force=true : on veut TOUJOURS récupérer l'intégralité des données
    // cloud au démarrage, jamais seulement la table settings pour comparer
    // un horodatage. C'est cette requête complète que l'écran de chargement
    // attend avant de laisser l'utilisateur accéder à l'appli.
    var pulled = await _cloudPullAll(true);
    if (pulled) {
      _persistLocalOnly();
      renderAll();
      // Pas de toast ici : récupérer depuis le cloud est maintenant le
      // comportement NORMAL de chaque lancement, pas un événement
      // exceptionnel à signaler. Le toast reste utilisé pour syncCloud()
      // et forceRestoreFromCloud() (actions manuelles explicites).
    }
    // Si pulled est false : soit le cloud n'est pas configuré/joignable,
    // soit aucune ligne "settings" n'existe encore (tout premier lancement,
    // rien à récupérer) — dans les deux cas on reste sur l'état local.
  } catch (e) {
    // Une erreur ici (ex. le garde-fou "toutes les tables sont vides"
    // ci-dessus) ne doit pas rester invisible dans la seule console : c'est
    // potentiellement une collection entière qui a failli disparaître.
    console.warn('[PTCG] sync initiale cloud :', e.message);
    _loadingTitle('Erreur de synchronisation');
    _loadingLog('_conn', '✗', 'Erreur', e.message, 'err');
    toast('Restauration cloud interrompue : ' + e.message, 'error');
  }

  // On ne quitte PAS l'écran de chargement tant que le Pokédex et les 4
  // catégories (+ leurs cartes possédées) ne sont pas chargés — c'est ce
  // qui évite un temps d'attente à chaque fois qu'on regarde pour la
  // première fois les cartes d'un Pokémon/Personnage/Objet/Lieu/Énergie
  // dans la session (avant, ce chargement se faisait à la demande, au
  // premier visite de chaque onglet, un par un).
  if (_cloudReady() && typeof _preloadCardCatalogs === 'function') {
    await _preloadCardCatalogs();
  }
  // Fin de la synchro initiale, quel qu'en ait été le résultat (données
  // trouvées, rien de plus récent, ou même échec réseau/RLS) : à partir
  // d'ici, un saveData() peut légitimement programmer un push.
  _loadingTitle('C’est prêt !');
  _initialSyncDone = true;
}

// ── Bouton "Synchroniser" (manuel, immédiat, avec retour clair) ───────────
async function syncCloud() {
  if (!_cloudReady()) { toast('Configurez Supabase.', 'error'); return; }
  try {
    var pulled = await _cloudPullAll();
    if (pulled) {
      _persistLocalOnly(); renderAll();
      toast('Données importées du cloud.', 'success');
      return;
    }
    await _cloudPushAll();
    toast('Collection synchronisée !', 'success');
  } catch (e) {
    console.error('[PTCG] syncCloud a échoué :', e);
    toast('Erreur sync : ' + e.message, 'error');
  }
}

// ── Bouton "Récupérer depuis le cloud" (Paramètres) ────────────────────────
// Contrairement à syncCloud(), qui compare les horodatages et peut décider de
// POUSSER le local (s'il paraît plus récent), celui-ci ne fait QUE récupérer :
// il applique toujours ce qu'il y a sur Supabase, quel que soit l'horodatage
// local — utile si le local a été poussé par erreur après coup (état
// corrompu, doublons…) et paraît donc à tort "plus récent" que le cloud, ce
// qui empêcherait syncCloud() de le rattraper.
async function forceRestoreFromCloud() {
  if (!_cloudReady()) { toast('Configurez Supabase.', 'error'); return; }
  if (!confirm('Récupérer les données depuis Supabase et remplacer tout ce qui est affiché ici ?\n\nRien ne sera envoyé vers le cloud, uniquement récupéré. Les modifications locales pas encore synchronisées seront perdues.')) return;
  try {
    var pulled = await _cloudPullAll(true);
    if (!pulled) { toast('Aucune donnée trouvée sur Supabase pour cet utilisateur.', 'error'); return; }
    _persistLocalOnly();
    renderAll();
    renderLabelsList();
    _refreshPokedexAfterLabelChange();
    toast('Données récupérées depuis le cloud.', 'success');
  } catch (e) {
    console.error('[PTCG] forceRestoreFromCloud a échoué :', e);
    toast('Erreur de récupération : ' + e.message, 'error');
  }
}

// ── Config Supabase personnalisée (Paramètres) ─────────────────────────────
function saveCloudConfig() {
  var u = document.getElementById('cfg-url');
  var k = document.getElementById('cfg-key');
  var url = ((u && u.value) || '').trim();
  var key = ((k && k.value) || '').trim();
  try { localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify({ url: url, key: key })); } catch (e) { /* ignore */ }
  window.__PC_CLOUD_CONFIG__ = { url: url || CLOUD_DEFAULT_URL, key: key || CLOUD_DEFAULT_KEY, user_id: CLOUD_USER_ID };
  SB_URL = window.__PC_CLOUD_CONFIG__.url;
  SB_KEY = window.__PC_CLOUD_CONFIG__.key;
  toast('Config sauvegardée.', 'success');
  syncCloud();
}
