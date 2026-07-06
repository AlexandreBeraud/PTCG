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
// Principe général (inchangé) :
//  - PUSH (débouncé 1.2s après chaque saveData()) : pour chaque table, dans
//    un ordre qui respecte les clés étrangères, on supprime toutes les
//    lignes de cet utilisateur puis on réinsère l'état actuel (upsert en
//    masse, 1 requête par table).
//  - PULL (une fois, au chargement) : comparaison d'un horodatage global
//    (settings.set_data_ts) ; si le cloud est plus récent, on reconstruit
//    tout _D à partir des tables cloud.

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
    toRows: function () {
      return (_D.custom_blocs || []).map(function (b, i) {
        return {
          blo_user_id: _cloudUserId(), blo_id: b.id, blo_nom: b.nom || '', blo_short: b.short || '',
          blo_couleur: b.couleur || '', blo_logo: b.logo || '', blo_sort_order: i, blo_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.blo_sort_order || 0) - (b.blo_sort_order || 0); });
      _D.custom_blocs = rows.map(function (r) {
        return { id: r.blo_id, short: r.blo_short || '', nom: r.blo_nom || '', couleur: r.blo_couleur || '', logo: r.blo_logo || '', extensions: [], _custom_bloc: true };
      });
    },
  },
  {
    table: 'extensions', keyCols: ['ext_id'], userCol: 'ext_user_id', orderBy: 'ext_sort_order.asc',
    toRows: function () {
      return (_D.custom_exts || []).map(function (e, i) {
        return {
          ext_user_id: _cloudUserId(), ext_id: e.id, ext_bloc_id: e.bloc_id || '', ext_code: e.code || '',
          ext_nom: e.nom || '', ext_nb_cartes: e.nb_cartes || 0, ext_logo: e.logo || '', ext_sigle: e.sigle || '',
          ext_couleur: e.couleur || '', ext_stat_mode: e.stat_mode || 'all', ext_sorti: e.sorti !== false,
          ext_sort_order: i, ext_updated_at: _isoNow(),
        };
      });
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.ext_sort_order || 0) - (b.ext_sort_order || 0); });
      _D.custom_exts = rows.map(function (r) {
        return {
          id: r.ext_id, code: r.ext_code || '', nom: r.ext_nom || '', nb_cartes: r.ext_nb_cartes || 0,
          bloc_id: r.ext_bloc_id || '', logo: r.ext_logo || '', sigle: r.ext_sigle || '', couleur: r.ext_couleur || '',
          stat_mode: r.ext_stat_mode || 'all', sorti: r.ext_sorti !== false, _custom: true,
        };
      });
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
        imgCol: 'boo_img', obtainedCol: 'boo_obtained', dateCol: 'boo_date', sortCol: 'boo_sort_order',
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
        imgCol: 'goo_img', obtainedCol: 'goo_obtained', dateCol: 'goo_date', sortCol: 'goo_sort_order',
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
          ven_commande_id: v.commande_id || null,
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
          statut: r.ven_statut || 'a_mettre', commande_id: r.ven_commande_id || null,
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
          commande_id: r.dep_commande_id || null,
          created_at: r.dep_created_at ? new Date(r.dep_created_at).getTime() : Date.now(),
          updated_at: r.dep_updated_at ? new Date(r.dep_updated_at).getTime() : Date.now(),
        };
      });
    },
  },
  {
    table: 'label_categories', keyCols: ['lab_id'], userCol: 'lab_user_id', orderBy: 'lab_sort_order.asc',
    toRows: function () {
      var order = _D.label_category_order || [];
      var out = [];
      (_D.custom_label_categories || []).forEach(function (c) {
        var idx = order.indexOf(c.id);
        out.push({ lab_user_id: _cloudUserId(), lab_id: c.id, lab_name: c.name || '', lab_is_hidden: false, lab_sort_order: idx === -1 ? 999 : idx, lab_updated_at: _isoNow() });
      });
      Object.keys(_D.label_category_overrides || {}).forEach(function (id) {
        var ov = _D.label_category_overrides[id] || {};
        var idx = order.indexOf(id);
        out.push({ lab_user_id: _cloudUserId(), lab_id: id, lab_name: ov.name || '', lab_is_hidden: !!ov._hidden, lab_sort_order: idx === -1 ? 999 : idx, lab_updated_at: _isoNow() });
      });
      return out;
    },
    apply: function (rows) {
      rows.sort(function (a, b) { return (a.lab_sort_order || 0) - (b.lab_sort_order || 0); });
      var customCats = [], overrides = {}, order = [];
      rows.forEach(function (r) {
        order.push(r.lab_id);
        if (String(r.lab_id).indexOf('lblcat_') === 0) {
          customCats.push({ id: r.lab_id, name: r.lab_name || '' });
        } else {
          var ov = {};
          if (r.lab_name) ov.name = r.lab_name;
          if (r.lab_is_hidden) ov._hidden = true;
          if (Object.keys(ov).length) overrides[r.lab_id] = ov;
        }
      });
      _D.custom_label_categories = customCats;
      _D.label_category_overrides = overrides;
      _D.label_category_order = order;
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
];

// Les deux tables "boosters" et "goodies" partagent la même forme de ligne
// et le même objet JS cible (_D.boosters_data) — factorisé ici pour éviter
// de dupliquer la logique deux fois.
function _applyBoosterLikeRows(rows, cols) {
  rows.sort(function (a, b) { return (a[cols.sortCol] || 0) - (b[cols.sortCol] || 0); });
  if (!_D.boosters_data) _D.boosters_data = {};
  rows.forEach(function (r) {
    var extId = r[cols.extCol];
    if (!_D.boosters_data[extId]) _D.boosters_data[extId] = [];
    _D.boosters_data[extId].push({
      id: r[cols.idCol], desc: r[cols.descCol] || '', img: r[cols.imgCol] || '',
      obtained: !!r[cols.obtainedCol], date: r[cols.dateCol] || '', product_type: r[cols.typeCol] || 'booster',
    });
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
  if (_pushInProgress) {
    // Une synchro tourne déjà : on ne lance pas une deuxième écriture en
    // parallèle, on redemande juste un passage juste après celui en cours,
    // pour rattraper les changements faits entre-temps.
    _pushRerunNeeded = true;
    return;
  }
  _pushInProgress = true;
  try {
    for (var i = 0; i < _SYNC_DOMAINS.length; i++) {
      var d = _SYNC_DOMAINS[i];
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
    }
    // Réglages (ligne unique par utilisateur) + horodatage global de synchro.
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
  } finally {
    _pushInProgress = false;
  }
  if (_pushRerunNeeded) {
    _pushRerunNeeded = false;
    await _cloudPushAll(); // rattrape ce qui a changé pendant qu'on poussait
  }
}

// ── Pull : uniquement si le cloud est strictement plus récent ─────────────
async function _cloudPullAll() {
  if (!_cloudReady()) return false;
  var res = await fetch(SB_URL + '/rest/v1/settings?set_user_id=eq.' + encodeURIComponent(_cloudUserId()), { headers: _sbHeaders() });
  if (!res.ok) return false;
  var rows = await res.json();
  if (!rows.length) return false;
  var cloudTs = rows[0].set_data_ts || 0;
  if (cloudTs <= (_D._ts || 0)) return false;

  for (var i = 0; i < _SYNC_DOMAINS.length; i++) {
    var d = _SYNC_DOMAINS[i];
    var url = SB_URL + '/rest/v1/' + d.table + '?' + d.userCol + '=eq.' + encodeURIComponent(_cloudUserId()) + (d.orderBy ? '&order=' + d.orderBy : '');
    var r = await fetch(url, { headers: _sbHeaders() });
    if (!r.ok) continue;
    var domainRows = await r.json();
    d.apply(domainRows);
  }
  var s = rows[0];
  _D.settings = {
    display_mode: s.set_display_mode || 'logo', sort_dir: s.set_sort_dir || 'asc', ui_scale: s.set_ui_scale || 1,
    bloc_order: s.set_bloc_order || [], tab_view_modes: s.set_tab_view_modes || {},
  };
  _D._ts = cloudTs;
  return true;
}

// ── Débounce du push automatique après chaque saveData() ──────────────────
var _cloudPushTimer = null;
function _scheduleCloudPush() {
  clearTimeout(_cloudPushTimer);
  _cloudPushTimer = setTimeout(function () {
    _cloudPushAll().catch(function (e) {
      console.error('[PTCG] push cloud auto : erreur', e.message);
      toast('Sync cloud : ' + e.message, 'error');
    });
  }, 1200);
}

// ── Synchronisation initiale (au chargement de la page) ───────────────────
async function _cloudInitialSync() {
  try {
    var pulled = await _cloudPullAll();
    if (pulled) {
      saveData();
      renderAll();
      toast('Données restaurées depuis le cloud.', 'success');
    } else {
      // Rien de plus récent côté cloud : on pousse notre état local, pour
      // que les autres appareils voient nos données existantes.
      _scheduleCloudPush();
    }
  } catch (e) {
    console.warn('[PTCG] sync initiale cloud :', e.message);
  }
  // form_label_overrides garde son mécanisme dédié (une ligne par form_type).
  try {
    await _pullLabelOverridesFromCloud();
    renderLabelsList();
    _refreshPokedexAfterLabelChange();
  } catch (e) { /* pas grave, on reste en local */ }
}

// ── Bouton "Synchroniser" (manuel, immédiat, avec retour clair) ───────────
async function syncCloud() {
  if (!_cloudReady()) { toast('Configurez Supabase.', 'error'); return; }
  try {
    var pulled = await _cloudPullAll();
    if (pulled) {
      saveData(); renderAll();
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
