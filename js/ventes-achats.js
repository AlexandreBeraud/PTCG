// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/ventes-achats.js
//  Ventes / Achats / Acheteurs / Vendeurs / Bilan / sélecteurs de carte
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  VENTES / ACHETEURS / DÉPENSES / VENDEURS
// ═══════════════════════════════════════════════════════════════════════════

var CARD_CONDITIONS = ['Mint','Near Mint','Excellent','Good','Light Played','Played','Poor'];
// Couleur associée à chaque état, du meilleur (bleu) au pire (rouge) — reprise
// partout où l'état d'une carte est affiché (grille, carte à gauche, liste).
var CARD_CONDITION_COLORS = {
  'Mint':          '#4a9eff',
  'Near Mint':     '#22c55e',
  'Excellent':     '#84cc16',
  'Good':          '#eab308',
  'Light Played':  '#f97316',
  'Played':        '#fb7185',
  'Poor':          '#ef4444',
};
function _etatHtml(etat) {
  if (!etat) return '—';
  const color = CARD_CONDITION_COLORS[etat];
  return color ? `<span style="color:${color};font-weight:700">${_escHtml(etat)}</span>` : _escHtml(etat);
}
var VENTE_TYPES = [
  { id:'normale',      label:'Normale',      color:'#4a9eff' },
  { id:'reverse',      label:'Reverse',      color:'#a78bfa' },
  { id:'holo_cosmos',  label:'Holo Cosmos',  color:'#22d3ee' },
  { id:'1ere_edition', label:'1ère édition', color:'#eab308' },
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

// Badges "Type" colorés (une couleur par type — Normale/Reverse/Holo Cosmos/
// 1ère édition) réutilisés partout où une vente/dépense affiche ses types.
function _typeChipsHtml(types, sm) {
  return (types||[]).map(t => {
    const info = VENTE_TYPES.find(x=>x.id===t);
    if (!info) return '';
    return `<span class="type-chip${sm?' sm':''}" style="color:${info.color};background:${info.color}22;border-color:${info.color}55">${info.label}</span>`;
  }).join('');
}

// Petits drapeaux sélectionnables pour distinguer les acheteurs/vendeurs d'un
// coup d'œil dans les listes (affichés en cercle dans le sélecteur). On stocke
// un code pays ISO 3166-1 alpha-2 (ex. 'fr') plutôt qu'un emoji drapeau : les
// emoji "regional indicator" ne s'affichent PAS comme des drapeaux sur tous
// les systèmes (Windows en particulier ne montre que les 2 lettres du code),
// donc on utilise de vraies images de drapeaux (flagcdn.com), fiables partout.
var PERSON_ICONS = ['fr','be','ch','de','gb','us','es','it','pt','nl','pl','se','gr','jp','kr','cn','ca','au'];

// D'anciens acheteurs/vendeurs peuvent avoir été enregistrés avec un emoji
// drapeau (ancien système) : on le convertit à la volée en code pays pour ne
// pas perdre l'info et continuer à afficher une vraie image de drapeau.
function _flagEmojiToCode(str) {
  if (!str || typeof str !== 'string') return null;
  const points = [...str].map(c => c.codePointAt(0));
  if (points.length === 2 && points.every(cp => cp >= 0x1F1E6 && cp <= 0x1F1FF)) {
    return points.map(cp => String.fromCharCode(cp - 0x1F1E6 + 65)).join('').toLowerCase();
  }
  return null;
}
function _personFlagCode(icon) {
  if (!icon) return 'fr';
  if (/^[a-z]{2}$/i.test(icon)) return icon.toLowerCase();
  return _flagEmojiToCode(icon) || 'fr';
}
// Image de drapeau en cercle — taille en px, 22 par défaut (icônes inline).
function _flagImgHtml(icon, size) {
  const code = _personFlagCode(icon);
  size = size || 22;
  return `<img src="https://flagcdn.com/w40/${code}.png" alt="${code.toUpperCase()}" width="${size}" height="${size}" class="flag-icon-img" onerror="this.style.visibility='hidden'">`;
}
function _buildIconPicker(containerId, selected) {
  const el = document.getElementById(containerId); if (!el) return;
  const selCode = _personFlagCode(selected);
  el.innerHTML = PERSON_ICONS.map(code =>
    `<button type="button" class="icon-pick-btn ${code===selCode?'active':''}" data-icon="${code}" title="${code.toUpperCase()}" onclick="_selectIcon('${containerId}', this)">${_flagImgHtml(code, 22)}</button>`
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
// Icône "vente partielle d'un lot" (bouton visible seulement quand qty > 1)
var ICON_SPLIT = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>';

function _venteId()    { return 'vt_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _acheteurId() { return 'ac_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _depenseId()  { return 'dp_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _vendeurId()  { return 'vd_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _acheteurCommandeId() { return 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }
function _vendeurCommandeId()  { return 'vcc_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

// Le lien CardMarket est une colonne de la table Supabase "cards" (partagée
// par toutes les ventes/dépenses qui référencent cette carte), pas un champ
// propre à chaque vente — éditable ici ET depuis la fiche carte du Pokédex
// (voir saveCardEdits dans pokedex.js). Best-effort : une erreur réseau ici
// ne doit pas empêcher l'enregistrement de la vente elle-même.
async function _pushCardMarketUrl(cardId, url) {
  if (!cardId) return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ cardmarket_url: url || null }),
    });
    if (!res.ok) console.warn('[PTCG] push cardmarket_url HTTP', res.status);
  } catch(e) { console.warn('[PTCG] push cardmarket_url:', e.message); }
}

// Couleur d'accent de l'extension d'une vente/dépense (pour le fond du mode
// "carte à gauche", comme les fiches du Pokédex) — retrouvée en comparant le
// sigle enregistré sur la ligne à celui des extensions connues.
function _extColorForSaleItem(item) {
  if (!item.ext_sigle || typeof getAllExtensions !== 'function') return null;
  try {
    const ext = getAllExtensions().find(e => e.sigle && e.sigle === item.ext_sigle);
    return ext ? extColor(ext) : null;
  } catch(_) { return null; }
}

function _jsEscape(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ── Nombre de cartes par ligne (Paramètres › Affichage) ─────────────────
// Pilote la variable CSS --sales-cards-per-row utilisée par .sales-grid /
// .sales-grid-wide (Ventes, Achats, Acheteurs, Vendeurs). 5 par défaut.
// ── Nombre de cartes par ligne (Paramètres › Affichage) ─────────────────
// Réglable séparément pour la grille et le mode "carte à gauche" (des cartes
// plus larges tiennent moins bien à 5 par ligne) — chacun pilote sa propre
// variable CSS. _D.settings.sales_cards_per_row était un simple nombre
// avant : migré en objet {grid, compact} à la volée si besoin.
function applyCardsPerRow(mode, val) {
  const fallback = mode === 'compact' ? 3 : 5;
  const n = Math.max(2, Math.min(10, parseInt(val,10) || fallback));
  document.documentElement.style.setProperty(`--sales-cards-per-row-${mode}`, n);
  if (!_D.settings) _D.settings = {};
  if (typeof _D.settings.sales_cards_per_row !== 'object' || !_D.settings.sales_cards_per_row) {
    const oldVal = typeof _D.settings.sales_cards_per_row === 'number' ? _D.settings.sales_cards_per_row : 5;
    _D.settings.sales_cards_per_row = { grid: oldVal, compact: 3, people: 5 };
  }
  _D.settings.sales_cards_per_row[mode] = n;
}
function saveCardsPerRow(mode) {
  const inp = document.getElementById(`settings-cards-per-row-${mode}`);
  if (!inp) return;
  applyCardsPerRow(mode, inp.value);
  saveData();
  toast('Nombre de cartes par ligne enregistré.', 'success');
}

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
    .sort((a,b) => (a.date_achat||'').localeCompare(b.date_achat||'') || (a.created_at||0)-(b.created_at||0));
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
    .sort((a,b) => (a.date_achat||'').localeCompare(b.date_achat||'') || (a.created_at||0)-(b.created_at||0));
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
var _venteSort = 'date_desc', _depenseSort = 'date_desc';
var _acheteurSort = 'alpha_asc', _vendeurSort = 'alpha_asc';
var _venteExtFilter = 'all', _depenseExtFilter = 'all';
var _ventePersonFilter = 'all', _depensePersonFilter = 'all';

// Pseudo de l'acheteur (vente) ou du vendeur (dépense) lié à cette ligne, ou
// chaîne vide si non vendue/liée — sert au tri ET au filtre par acheteur/vendeur.
function _personNameFor(item) {
  if (!item.commande_id) return '';
  const ac = (_D.acheteur_commandes||[]).find(x => x.id === item.commande_id);
  if (ac) { const a = (_D.acheteurs||[]).find(x => x.id === ac.acheteur_id); if (a) return a.pseudo || ''; }
  const vc = (_D.vendeur_commandes||[]).find(x => x.id === item.commande_id);
  if (vc) { const v = (_D.vendeurs||[]).find(x => x.id === vc.vendeur_id); if (v) return v.pseudo || ''; }
  return '';
}

// Tri partagé par Ventes et Dépenses — "tout possible et imaginable" : date,
// extension, nom, numéro dans l'extension, numéro national (Pokédex), prix, état.
function _applySaleSort(items, sortId) {
  const arr = [...items];
  const numFrom = s => { const n = parseInt(String(s||'').replace(/\D/g,''),10); return isNaN(n) ? 0 : n; };
  switch (sortId) {
    case 'date_asc':   arr.sort((a,b) => (a.created_at||0) - (b.created_at||0)); break;
    case 'ext_asc':     arr.sort((a,b) => (a.set_name||'').localeCompare(b.set_name||'','fr') || numFrom(a.number)-numFrom(b.number)); break;
    case 'ext_code_asc': arr.sort((a,b) => _blocSortIndexFor(a)-_blocSortIndexFor(b) || _extSortKeyFor(a).localeCompare(_extSortKeyFor(b),'fr',{numeric:true}) || numFrom(a.number)-numFrom(b.number)); break;
    case 'name_asc':   arr.sort((a,b) => (a.card_name||a.pokemon_name||'').localeCompare(b.card_name||b.pokemon_name||'','fr')); break;
    case 'number_asc': arr.sort((a,b) => numFrom(a.number) - numFrom(b.number)); break;
    case 'pokedex_asc': arr.sort((a,b) => _pokedexNumberFor(a) - _pokedexNumberFor(b) || (a.card_name||'').localeCompare(b.card_name||'','fr')); break;
    case 'price_desc': arr.sort((a,b) => _lineTotal(b) - _lineTotal(a)); break;
    case 'price_asc':  arr.sort((a,b) => _lineTotal(a) - _lineTotal(b)); break;
    case 'etat_asc':   arr.sort((a,b) => (a.etat||'').localeCompare(b.etat||'','fr')); break;
    case 'person_asc': arr.sort((a,b) => _personNameFor(a).localeCompare(_personNameFor(b),'fr') || (b.created_at||0)-(a.created_at||0)); break;
    case 'date_desc':
    default:            arr.sort((a,b) => (b.created_at||0) - (a.created_at||0));
  }
  return arr;
}

// Clé de tri "Par extension (code/sigle)" — le code officiel de l'extension
// (ex. "SV01"), pas son nom complet, retrouvé via l'extension correspondante.
// Sans extension reconnue, on retombe sur le nom brut pour ne pas la perdre.
function _extSortKeyFor(item) {
  if (!item.set_name) return '';
  const ext = (typeof getAllExtensions === 'function' ? getAllExtensions() : []).find(e => e.nom === item.set_name);
  return (ext && ext.code) || item.set_name;
}

// Position du bloc de cette vente/dépense dans l'ordre habituel des blocs —
// pour trier "par bloc PUIS par extension" plutôt que juste par code
// d'extension brut (qui mélangerait les blocs entre eux).
function _blocSortIndexFor(item) {
  if (!item.set_name) return 9999;
  const ext = (typeof getAllExtensions === 'function' ? getAllExtensions() : []).find(e => e.nom === item.set_name);
  if (!ext) return 9999;
  const bloc = (typeof getBlocForExt === 'function') ? getBlocForExt(ext.id) : null;
  if (!bloc) return 9999;
  const order = (typeof getBlocs === 'function' ? getBlocs() : []).map(b => b.nom);
  const idx = order.indexOf(bloc.nom);
  return idx === -1 ? 9998 : idx;
}

// Numéro national (Pokédex) du Pokémon représenté par une vente/dépense —
// recherché dans _pkdx.all par nom FR (chargé au besoin, voir
// _ensurePokedexNamesLoaded). Introuvable/pas encore chargé -> renvoyé en
// dernier plutôt que de planter le tri.
function _pokedexNumberFor(item) {
  const name = item.pokemon_name || item.card_name || '';
  if (!name || typeof _pkdx === 'undefined' || !_pkdx.all || !_pkdx.all.length) return 99999;
  const norm = _normalizeStr(name);
  const exact = _pkdx.all.find(p => !p.isForm && _normalizeStr(p.frName||'') === norm);
  if (exact) return exact.id;
  // Le nom de la carte porte souvent un suffixe (-ex, GX, VMAX…) : on retombe
  // sur une correspondance par préfixe.
  const partial = _pkdx.all.find(p => !p.isForm && p.frName && norm.startsWith(_normalizeStr(p.frName)));
  return partial ? partial.id : 99999;
}

// Charge juste ce qu'il faut du Pokédex (liste + noms FR) pour trier par
// numéro national, sans toucher à l'affichage de l'onglet Pokédex — utilisable
// depuis Ventes/Dépenses même si cet onglet n'a jamais été ouvert.
var _pkdxNamesLoadingPromise = null;
async function _ensurePokedexNamesLoaded() {
  if (typeof _pkdx === 'undefined') return;
  if (_pkdx.all && _pkdx.all.length) return;
  if (_pkdxNamesLoadingPromise) return _pkdxNamesLoadingPromise;
  _pkdxNamesLoadingPromise = (async () => {
    try {
      let speciesCount = 1025;
      try {
        const countRes = await fetch(`${POKEAPI}/pokemon-species?limit=1`);
        const countData = await countRes.json();
        if (countData.count) speciesCount = countData.count;
      } catch(_) {}
      const res = await fetch(`${POKEAPI}/pokemon?limit=${speciesCount}&offset=0`);
      const data = await res.json();
      _pkdx.all = data.results.map(p => {
        const parts = p.url.split('/').filter(Boolean);
        const id = parseInt(parts[parts.length-1],10);
        return { id, name: p.name, frName: '' };
      }).filter(p => p.id>=1 && p.id<=speciesCount).sort((a,b)=>a.id-b.id);
      await _bulkLoadFrNames();
    } catch(e) { console.warn('[PTCG] chargement noms Pokédex (tri) échoué :', e.message); }
  })();
  return _pkdxNamesLoadingPromise;
}

// Filtre par extension pour Ventes/Dépenses — repris tel quel du composant du
// Pokédex (mêmes classes CSS pkdx-ext-*) : bouton + panneau déroulant groupé
// par bloc, sigle de chaque extension, "Toutes les extensions" en tête.
function _saleExtPanelIds(kind) {
  const prefix = kind === 'vente' ? 'ventes' : 'depenses';
  return { toggle: `${prefix}-ext-toggle`, panel: `${prefix}-ext-panel`, list: `${prefix}-ext-list`, label: `${prefix}-ext-filter-label` };
}

function toggleSaleExtFilterPanel(kind) {
  const ids = _saleExtPanelIds(kind);
  const panel = document.getElementById(ids.panel); if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  // Referme l'autre panneau (vente/dépense) au passage, un seul ouvert à la fois.
  ['vente','depense'].forEach(k => { const p = document.getElementById(_saleExtPanelIds(k).panel); if (p && k !== kind) p.style.display = 'none'; });
  if (isOpen) { panel.style.display = 'none'; return; }
  _buildSaleExtFilterList(kind);
  panel.style.display = '';
}

function _buildSaleExtFilterList(kind) {
  const ids = _saleExtPanelIds(kind);
  const el = document.getElementById(ids.list); if (!el) return;
  const items = kind === 'vente' ? (_D.ventes||[]) : (_D.depenses||[]);
  const currentFilter = kind === 'vente' ? _venteExtFilter : _depenseExtFilter;
  const namesPresent = new Set(items.map(it => it.set_name).filter(Boolean));
  const allExts = (typeof getAllExtensions === 'function') ? getAllExtensions() : [];
  const relevantExts = allExts.filter(e => namesPresent.has(e.nom));

  let html = `<div class="pkdx-ext-filter-item ${currentFilter==='all'?'active':''}" onclick="setSaleExtFilter('${kind}','all')">Toutes les extensions</div>`;

  // BUG corrigé : on groupait en itérant getBlocs() et en exigeant
  // getBlocForExt(e.id)?.id === bloc.id. Or pour une extension custom sans
  // bloc_id valide, getBlocForExt() renvoie un bloc de secours synthétique
  // (id 'cx' ou '?') qui ne correspond jamais à un vrai bloc — l'extension
  // disparaissait alors du panneau sans jamais apparaître nulle part, même
  // groupée sous "Autres". On regroupe maintenant directement par le bloc
  // RÉSOLU de chaque extension (quel qu'il soit), ce qui n'en perd aucune.
  const groups = new Map(); // nom affiché -> { bloc, exts:[] }
  relevantExts.forEach(e => {
    const bloc = (typeof getBlocForExt === 'function' && getBlocForExt(e.id)) || { id:'?', nom:'Autres', sigle:'' };
    const key = bloc.nom || 'Autres';
    if (!groups.has(key)) groups.set(key, { bloc, exts: [] });
    groups.get(key).exts.push(e);
  });

  const knownOrder = (typeof getBlocs === 'function' ? getBlocs() : []).map(b => b.nom);
  const groupKeys = [...groups.keys()].sort((a, b) => {
    const ia = knownOrder.indexOf(a), ib = knownOrder.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

  groupKeys.forEach(key => {
    const { bloc, exts } = groups.get(key);
    html += `<div class="pkdx-ext-filter-bloc-label">${_escHtml(key)}</div>`;
    html += sortExts(exts).map(e => {
      const active = currentFilter === e.nom ? 'active' : '';
      const sigleSrc = e.sigle || bloc.sigle || '';
      return `<div class="pkdx-ext-filter-item ${active}" onclick="setSaleExtFilter('${kind}','${_escJs(e.nom)}')">
        ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="pkdx-ext-filter-sigle" onerror="this.style.display='none'">` : `<span class="pkdx-ext-filter-code">${_escHtml(e.code||'')}</span>`}
        <span>${_escHtml(e.nom)}</span>
      </div>`;
    }).join('');
  });
  // Extensions présentes dans les ventes/dépenses mais introuvables parmi les
  // extensions connues (ex. nom personnalisé/modifié depuis) : affichées quand
  // même, sans bloc, pour ne jamais perdre silencieusement une entrée du filtre.
  const matchedNames = new Set(relevantExts.map(e => e.nom));
  const orphanNames = [...namesPresent].filter(n => !matchedNames.has(n)).sort((a,b) => a.localeCompare(b,'fr'));
  if (orphanNames.length) {
    html += `<div class="pkdx-ext-filter-bloc-label">Autres</div>`;
    html += orphanNames.map(n => `<div class="pkdx-ext-filter-item ${currentFilter===n?'active':''}" onclick="setSaleExtFilter('${kind}','${_escJs(n)}')"><span class="pkdx-ext-filter-code">?</span><span>${_escHtml(n)}</span></div>`).join('');
  }
  el.innerHTML = html;
  _syncSaleExtFilterLabel(kind);
}

function _syncSaleExtFilterLabel(kind) {
  const ids = _saleExtPanelIds(kind);
  const items = kind === 'vente' ? (_D.ventes||[]) : (_D.depenses||[]);
  const currentFilter = kind === 'vente' ? _venteExtFilter : _depenseExtFilter;
  const namesPresent = new Set(items.map(it => it.set_name).filter(Boolean));
  // Si l'extension choisie a disparu de la liste (filtre de statut changé,
  // dernière carte de cette extension supprimée…), on retombe sur "Toutes".
  if (currentFilter !== 'all' && !namesPresent.has(currentFilter)) {
    if (kind === 'vente') _venteExtFilter = 'all'; else _depenseExtFilter = 'all';
  }
  const finalFilter = kind === 'vente' ? _venteExtFilter : _depenseExtFilter;
  const labelEl = document.getElementById(ids.label);
  if (labelEl) labelEl.textContent = finalFilter === 'all' ? 'Toutes les extensions' : finalFilter;
}

function setSaleExtFilter(kind, name) {
  if (kind === 'vente') { _venteExtFilter = name; renderVentes(); } else { _depenseExtFilter = name; renderDepenses(); }
  const panel = document.getElementById(_saleExtPanelIds(kind).panel);
  if (panel) panel.style.display = 'none';
}

// Remplit le <select> acheteur/vendeur avec les personnes réellement liées
// aux ventes/dépenses actuellement affichées (avant filtre statut/extension).
function _populatePersonFilter(selectId, items, currentValue) {
  const sel = document.getElementById(selectId); if (!sel) return;
  const names = [...new Set(items.map(it => _personNameFor(it)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  sel.innerHTML = '<option value="all">Tous</option>' + names.map(n => `<option value="${_escHtml(n)}">${_escHtml(n)}</option>`).join('');
  sel.value = names.includes(currentValue) ? currentValue : 'all';
}
function setVentePersonFilter(name) { _ventePersonFilter = name; renderVentes(); }
function setDepensePersonFilter(name) { _depensePersonFilter = name; renderDepenses(); }

function setVenteSort(sortId) {
  _venteSort = sortId;
  if (sortId === 'pokedex_asc') { _ensurePokedexNamesLoaded().then(renderVentes); }
  renderVentes();
}
function setDepenseSort(sortId) {
  _depenseSort = sortId;
  if (sortId === 'pokedex_asc') { _ensurePokedexNamesLoaded().then(renderDepenses); }
  renderDepenses();
}

// Tri partagé Acheteurs/Vendeurs : date de la dernière commande, nombre de
// cartes, prix total encaissé/dépensé, ou ordre alphabétique du pseudo.
function _applyPersonSort(items, sortId, kind) {
  const arr = [...items];
  const lastDateFor = kind === 'acheteur'
    ? (p => { const c = acheteurCommandes(p.id); return c.length ? (c[c.length-1].date_achat||'') : ''; })
    : (p => { const c = vendeurCommandes(p.id);  return c.length ? (c[c.length-1].date_achat||'') : ''; });
  const cardCountFor = kind === 'acheteur' ? (p => acheteurVentes(p.id).length) : (p => vendeurDepenses(p.id).length);
  const totalFor      = kind === 'acheteur' ? (p => acheteurTotal(p.id))       : (p => vendeurTotal(p.id));
  switch (sortId) {
    case 'date_desc':  arr.sort((a,b) => lastDateFor(b).localeCompare(lastDateFor(a))); break;
    case 'date_asc':   arr.sort((a,b) => lastDateFor(a).localeCompare(lastDateFor(b))); break;
    case 'cards_desc': arr.sort((a,b) => cardCountFor(b) - cardCountFor(a)); break;
    case 'cards_asc':  arr.sort((a,b) => cardCountFor(a) - cardCountFor(b)); break;
    case 'price_desc': arr.sort((a,b) => totalFor(b) - totalFor(a)); break;
    case 'price_asc':  arr.sort((a,b) => totalFor(a) - totalFor(b)); break;
    case 'alpha_desc': arr.sort((a,b) => (b.pseudo||'').localeCompare(a.pseudo||'','fr')); break;
    case 'alpha_asc':
    default:            arr.sort((a,b) => (a.pseudo||'').localeCompare(b.pseudo||'','fr'));
  }
  return arr;
}
function setAcheteurSort(sortId) { _acheteurSort = sortId; renderAcheteurs(); }
function setVendeurSort(sortId)  { _vendeurSort = sortId; renderVendeurs(); }
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
  const typesHtml = _typeChipsHtml(item.types, true);
  return `<div class="order-item-row">
    <div class="order-item-thumb">${item.card_image ? `<img src="${item.card_image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="order-item-info">
      <div class="order-item-name">${item.card_name || item.pokemon_name || '—'}${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</div>
      <div class="order-item-meta">${item.set_name||''}${item.number?' · N°'+item.number:''} · ${item.etat||''}</div>
      ${typesHtml ? `<div class="order-item-types">${typesHtml}</div>` : ''}
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : mode === 'compact' ? 'sales-compact-wrap' : 'sales-grid-wide';

  let items = [...(_D.ventes||[])];
  if (_venteFilter !== 'all') items = items.filter(v => venteStatusInfo(v).id === _venteFilter);
  if (_venteQuery) {
    const q = _normalizeStr(_venteQuery);
    items = items.filter(v => _normalizeStr(v.card_name||'').includes(q) || _normalizeStr(v.pokemon_name||'').includes(q));
  }
  _buildSaleExtFilterList('vente');
  if (_venteExtFilter !== 'all') items = items.filter(v => v.set_name === _venteExtFilter);
  _populatePersonFilter('ventes-acheteur-filter', items, _ventePersonFilter);
  if (_ventePersonFilter !== 'all') items = items.filter(v => _personNameFor(v) === _ventePersonFilter);
  items = _applySaleSort(items, _venteSort);

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucune vente${(_venteQuery||_venteFilter!=='all'||_venteExtFilter!=='all'||_ventePersonFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    const builder = mode === 'list' ? buildVenteRow : mode === 'compact' ? buildVenteCompact : buildVenteCard;
    items.forEach(v => grid.appendChild(builder(v)));
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
  // Le nombre de LIGNES de vente (arr.length) n'est pas le nombre de cartes
  // réelles quand une ligne représente plusieurs exemplaires (qty > 1) — on
  // additionne les quantités pour refléter le vrai nombre de cartes.
  const qtySum = arr => arr.reduce((s,v)=>s+(parseInt(v.qty,10)||1),0);
  el.innerHTML = `
    <div class="stat-card stat-card-money" style="--accent-color:#8a93b0">
      <div class="val">${sum(aMettre).toFixed(2)} €</div><div class="lbl">À mettre en vente</div><div class="sub">${qtySum(aMettre)} carte${qtySum(aMettre)>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--blue)">
      <div class="val">${sum(enVente).toFixed(2)} €</div><div class="lbl">En vente</div><div class="sub">${qtySum(enVente)} carte${qtySum(enVente)>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--green)">
      <div class="val">${sum(vendues).toFixed(2)} €</div><div class="lbl">Vendues</div><div class="sub">${qtySum(vendues)} carte${qtySum(vendues)>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--gold)">
      <div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Valeur totale</div><div class="sub">${qtySum(all)} carte${qtySum(all)>1?'s':''}</div></div>`;
}

function _venteAcheteurInfoHtml(v) {
  if (!v.commande_id) return '';
  const c = (_D.acheteur_commandes||[]).find(x=>x.id===v.commande_id);
  if (!c) return '';
  const a = (_D.acheteurs||[]).find(x=>x.id===c.acheteur_id);
  if (!a) return '';
  return `<span class="sale-person-link" onclick="_goToAcheteur('${a.id}')">${_flagImgHtml(a.icon)} ${_escHtml(a.pseudo)}</span>${c.date_arrivee ? `<span class="sale-person-date">${_fmtDate(c.date_arrivee)}</span>` : ''}`;
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
        <div class="sale-card-meta">${opts.extName}</div>
        ${opts.number ? `<div class="sale-card-number">N°${_escHtml(opts.number)}</div>` : ''}
        ${opts.statusLabel ? `<div class="status-badge ${opts.statusCls}">${opts.statusLabel}</div>` : ''}
      </div>
    </div>`;
}

// Boutons modifier/supprimer, désormais en bas à droite de la carte (dans le
// corps) plutôt que flottants sur l'image — partagé par Ventes et Dépenses.
function _saleCardFooterActionsHtml(opts) {
  return `<div class="sale-card-footer-actions">
    <button class="btn btn-icon btn-sm" title="Modifier" onclick="event.stopPropagation();${opts.editFn}('${opts.id}')">${ICON_EDIT}</button>
    <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();${opts.delFn}('${opts.id}')">${ICON_DELETE}</button>
  </div>`;
}

// Mode d'affichage "Carte à gauche" : l'image occupe toute la hauteur à
// gauche (comme une vraie carte posée sur la table), toutes les infos
// (état, prix, type, langue, acheteur…) à droite, bien lisibles sans avoir à
// zoomer sur une bannière. Partagé par Ventes ET Dépenses (voir buildVenteCompact
// / buildDepenseCompact) pour ne jamais avoir deux implémentations qui divergent.
function _saleCompactCardHtml(opts) {
  const pos = _cropPosition(opts.crop);
  const bg = opts.image ? `background-image:url('${opts.image}');background-position:${pos};` : '';
  return `
    <div class="sale-compact-thumb" style="${bg}">
      ${!opts.image ? '🎴' : ''}
      ${opts.sigle ? `<img src="${opts.sigle}" class="sale-card-sigle" alt="" onerror="this.style.display='none'">` : ''}
    </div>
    <div class="sale-compact-body">
      <div class="sale-compact-head">
        <div class="sale-compact-head-text">
          <div class="sale-compact-name">${opts.name}${opts.qty>1?` <span class="qty-badge">×${opts.qty}</span>`:''}</div>
          <div class="sale-compact-meta">${opts.extName}</div>
          ${opts.number ? `<div class="sale-compact-number">N°${_escHtml(opts.number)}</div>` : ''}
        </div>
        <div class="sale-compact-head-right">
          ${opts.statusLabel ? `<div class="status-badge ${opts.statusCls}">${opts.statusLabel}</div>` : ''}
          <div class="sale-compact-actions">
            <button class="btn btn-icon btn-sm" title="Modifier" onclick="event.stopPropagation();${opts.editFn}('${opts.id}')">${ICON_EDIT}</button>
            <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();${opts.delFn}('${opts.id}')">${ICON_DELETE}</button>
          </div>
        </div>
      </div>
      <div class="sale-compact-rows">
        <div class="sale-row"><span class="lbl">État</span><span class="val">${_etatHtml(opts.etat)}</span></div>
        <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${opts.priceHtml}</span></div>
        ${opts.typesHtml ? `<div class="sale-row"><span class="lbl">Type</span><span class="val sale-types-val">${opts.typesHtml}</span></div>` : ''}
        <div class="sale-row"><span class="lbl">Langue</span><span class="val">${opts.langue||'—'}</span></div>
      </div>
      <div class="sale-card-footer">
        ${opts.personInfoHtml ? `<div class="sale-acheteur">${opts.personInfoHtml}</div>` : ''}
        ${opts.cardmarketUrl ? `<a href="${opts.cardmarketUrl}" target="_blank" rel="noopener" class="sale-link" onclick="event.stopPropagation()">Voir sur CardMarket ↗</a>` : ''}
        ${opts.splitBtnHtml || ''}
      </div>
    </div>`;
}

// Mode liste : ligne d'aperçu toujours alignée (image, nom, statut, prix,
// acheteur/vendeur, actions) + détails secondaires repliables (État, Type,
// Langue) — <details>/<summary> natif, comme les catégories de labels, pour
// ne pas surcharger la liste quand on a beaucoup de ventes.
// Mode liste : tout sur une seule ligne (image, nom, statut, état, type,
// langue, prix, acheteur/vendeur, lien CardMarket, actions) — plus de menu
// dépliant, tout est visible d'un coup d'œil.
function _saleListRowHtml(opts) {
  return `
    <div class="sale-list-thumb">${opts.image ? `<img src="${opts.image}" alt="" onerror="this.parentElement.innerHTML='🎴'">` : '🎴'}</div>
    <div class="sale-list-main">
      <div class="sale-list-name">${opts.name}${opts.qty>1?` <span class="qty-badge">×${opts.qty}</span>`:''}</div>
      <div class="sale-list-meta">${opts.extName}</div>
      ${opts.number ? `<div class="sale-list-number">N°${_escHtml(opts.number)}</div>` : ''}
    </div>
    <div class="sale-list-cell">${opts.statusLabel ? `<div class="status-badge ${opts.statusCls}">${opts.statusLabel}</div>` : '—'}</div>
    <div class="sale-list-cell">${_etatHtml(opts.etat)}</div>
    <div class="sale-list-cell sale-list-types">${opts.typesHtml || '—'}</div>
    <div class="sale-list-cell">${opts.langue||'—'}</div>
    <div class="sale-list-price">${opts.priceHtml}</div>
    <div class="sale-list-acheteur ${opts.personInfoHtml ? '' : 'unlinked'}">${opts.personInfoHtml || opts.personEmptyLabel}</div>
    <div class="sale-list-cell">${opts.cardmarketUrl ? `<a href="${opts.cardmarketUrl}" target="_blank" rel="noopener" class="sale-link" onclick="event.stopPropagation()">CardMarket ↗</a>` : '—'}</div>
    <div class="sale-list-actions">
      ${opts.splitBtnHtml || ''}
      <button class="btn btn-icon btn-sm" title="Modifier" onclick="event.stopPropagation();${opts.editFn}('${opts.id}')">${ICON_EDIT}</button>
      <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();${opts.delFn}('${opts.id}')">${ICON_DELETE}</button>
    </div>`;
}

function buildVenteCard(v) {
  const st = venteStatusInfo(v);
  const acheteurInfo = _venteAcheteurInfoHtml(v);
  const qty = parseInt(v.qty,10) || 1;
  const typesHtml = _typeChipsHtml(v.types);
  const card = document.createElement('div');
  card.className = 'sale-card';
  const extColorVal = _extColorForSaleItem(v);
  if (extColorVal) card.style.background = `linear-gradient(160deg, ${extColorVal}82, var(--bg2) 55%)`;
  card.innerHTML =
    _saleCardTopHtml({
      image: v.card_image, qty, sigle: v.ext_sigle, crop: v.crop,
      name: v.card_name || v.pokemon_name || '—',
      extName: v.set_name||'', number: v.number||'',
      statusCls: st.cls, statusLabel: st.label,
      editFn: 'editVente', delFn: 'deleteVente', id: v.id,
    }) + `
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${_etatHtml(v.etat)}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${(parseFloat(v.prix)||0).toFixed(2)} €${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</span></div>
      ${typesHtml ? `<div class="sale-row"><span class="lbl">Type</span><span class="val sale-types-val">${typesHtml}</span></div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${v.langue||'—'}</span></div>
      <div class="sale-card-footer">
        ${acheteurInfo ? `<div class="sale-acheteur">${acheteurInfo}</div>` : ''}
        ${v.cardmarket_url ? `<a href="${v.cardmarket_url}" target="_blank" rel="noopener" class="sale-link" onclick="event.stopPropagation()">Voir sur CardMarket ↗</a>` : ''}
        ${qty > 1 && st.id !== 'vendue' ? `<button type="button" class="btn btn-secondary btn-sm sale-split-btn" onclick="event.stopPropagation();openVenteSplitModal('${v.id}')">${ICON_SPLIT} Vente</button>` : ''}
        ${_saleCardFooterActionsHtml({ editFn: 'editVente', delFn: 'deleteVente', id: v.id })}
      </div>
    </div>`;
  card.addEventListener('click', e => { if (e.target.closest('button,a,select,input')) return; editVente(v.id); });
  return card;
}

function buildVenteRow(v) {
  const st = venteStatusInfo(v);
  const acheteurInfo = _venteAcheteurInfoHtml(v);
  const qty = parseInt(v.qty,10) || 1;
  const typesHtml = _typeChipsHtml(v.types, true);
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  const extColorVal = _extColorForSaleItem(v);
  if (extColorVal) row.style.background = `linear-gradient(90deg, ${extColorVal}3d, var(--bg2) 40%)`;
  row.innerHTML = _saleListRowHtml({
    image: v.card_image, qty, name: v.card_name || v.pokemon_name || '—',
    extName: v.set_name||'', number: v.number||'',
    statusCls: st.cls, statusLabel: st.label, etat: v.etat, langue: v.langue, typesHtml,
    priceHtml: `${qty>1?`<span class="qty-badge">×${qty}</span> `:''}${(parseFloat(v.prix)||0).toFixed(2)} €`,
    personInfoHtml: acheteurInfo, personEmptyLabel: '— Non vendu —', cardmarketUrl: v.cardmarket_url,
    splitBtnHtml: qty > 1 && st.id !== 'vendue' ? `<button class="btn btn-icon btn-sm sale-list-split-btn" title="Vente" onclick="event.stopPropagation();openVenteSplitModal('${v.id}')">${ICON_SPLIT}</button>` : '',
    editFn: 'editVente', delFn: 'deleteVente', id: v.id,
  });
  row.addEventListener('click', e => { if (e.target.closest('button,a,select,input')) return; editVente(v.id); });
  return row;
}

// Mode "Carte à gauche" pour les Ventes.
function buildVenteCompact(v) {
  const st = venteStatusInfo(v);
  const acheteurInfo = _venteAcheteurInfoHtml(v);
  const qty = parseInt(v.qty,10) || 1;
  const typesHtml = _typeChipsHtml(v.types);
  const card = document.createElement('div');
  card.className = 'sale-compact-row';
  const extColorVal = _extColorForSaleItem(v);
  if (extColorVal) card.style.background = `linear-gradient(135deg, ${extColorVal}82, var(--bg2) 68%)`;
  card.innerHTML = _saleCompactCardHtml({
    image: v.card_image, qty, sigle: v.ext_sigle, crop: v.crop,
    name: v.card_name || v.pokemon_name || '—',
    extName: v.set_name||'', number: v.number||'',
    statusCls: st.cls, statusLabel: st.label, etat: v.etat, langue: v.langue, typesHtml,
    priceHtml: `${qty>1?`<span class="qty-badge">×${qty}</span> `:''}${(parseFloat(v.prix)||0).toFixed(2)} €`,
    personInfoHtml: acheteurInfo, cardmarketUrl: v.cardmarket_url,
    splitBtnHtml: qty > 1 && st.id !== 'vendue' ? `<button type="button" class="btn btn-secondary btn-sm sale-split-btn" onclick="event.stopPropagation();openVenteSplitModal('${v.id}')">${ICON_SPLIT} Vente</button>` : '',
    editFn: 'editVente', delFn: 'deleteVente', id: v.id, kind: 'vente',
  });
  card.addEventListener('click', e => { if (e.target.closest('button,a,select,input,.sale-compact-thumb')) return; editVente(v.id); });
  return card;
}

function setVenteFilter(f, btn) {
  _venteFilter = f;
  document.querySelectorAll('#ventes-filter-bar .booster-filter-btn').forEach(b=>b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderVentes();
}
function filterVentes(q) { _venteQuery = q; renderVentes(); }

// `selId` est optionnel — permet de réutiliser exactement la même logique
// pour le sélecteur du formulaire de vente ET celui de la modale "Marquer
// des exemplaires vendus" (openVenteSplitModal), plutôt que de dupliquer.
function populateAcheteurSelect(selected, selId) {
  const sel = document.getElementById(selId || 'vente-acheteur-select'); if (!sel) return;
  const opts = (_D.acheteurs||[]).slice().sort((a,b)=>(a.pseudo||'').localeCompare(b.pseudo||'','fr'))
    .map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${a.pseudo}</option>`).join('');
  sel.innerHTML = '<option value="">— Choisir —</option>' + opts;
}

// Remplit le choix de commande en fonction de l'acheteur sélectionné (chaque
// acheteur peut avoir plusieurs commandes, à des dates différentes) et permet
// d'en créer une nouvelle à la volée. `selId`/`previewId` optionnels, mêmes
// raisons que populateAcheteurSelect ci-dessus.
function populateVenteCommandeSelect(acheteurId, selected, selId, previewId) {
  selId = selId || 'vente-commande-select';
  previewId = previewId || 'vente-commande-preview';
  const sel = document.getElementById(selId); if (!sel) return;
  if (!acheteurId) { sel.innerHTML = '<option value="">— Choisis d\'abord un acheteur —</option>'; _renderVenteCommandePreview('', previewId); return; }
  const commandes = acheteurCommandes(acheteurId);
  const opts = commandes.map(c => {
    const st = ACHETEUR_STATUTS.find(s=>s.id===(c.etat||'a_envoyer')) || ACHETEUR_STATUTS[0];
    const label = `${c.date_achat?_fmtDate(c.date_achat):'Sans date'} · ${st.label}`;
    return `<option value="${c.id}" ${c.id===selected?'selected':''}>${label}</option>`;
  }).join('');
  sel.innerHTML = (opts || '<option value="">— Aucune commande existante —</option>') + '<option value="__new__">+ Nouvelle commande…</option>';
  if (selected) sel.value = selected;
  _renderVenteCommandePreview(sel.value, previewId);
}

function _renderVenteCommandePreview(commandeId, previewId) {
  const preview = document.getElementById(previewId || 'vente-commande-preview'); if (!preview) return;
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

// ── Vente partielle d'un lot multi-exemplaires ──────────────────────────
// Bouton visible sur une vente enregistrée avec qty > 1 : permet de dire
// "N de ces exemplaires viennent d'être vendus" sans transformer toute la
// ligne. La ligne d'origine perd N exemplaires (ou passe entièrement
// "Vendue" si N = qty), et une nouvelle ligne "Vendue" de quantité N est
// créée avec l'acheteur/la commande choisis.
var _venteSplitId = null;
function openVenteSplitModal(id) {
  const v = (_D.ventes||[]).find(x=>x.id===id); if (!v) return;
  const qty = parseInt(v.qty,10) || 1;
  if (qty <= 1) { toast('Cette vente ne contient qu\'un seul exemplaire.', 'error'); return; }
  _venteSplitId = id;
  document.getElementById('vente-split-title').textContent = v.card_name || v.pokemon_name || '—';
  document.getElementById('vente-split-qty-total').textContent = qty;
  const qtyInput = document.getElementById('vente-split-qty-input');
  qtyInput.value = 1;
  qtyInput.max = qty;
  populateAcheteurSelect('', 'vente-split-acheteur-select');
  populateVenteCommandeSelect('', null, 'vente-split-commande-select', 'vente-split-commande-preview');
  document.getElementById('modal-vente-split').classList.add('open');
}

function _onVenteSplitAcheteurChange() {
  const acheteurId = document.getElementById('vente-split-acheteur-select').value;
  populateVenteCommandeSelect(acheteurId, null, 'vente-split-commande-select', 'vente-split-commande-preview');
}

function _onVenteSplitCommandeChange() {
  const sel = document.getElementById('vente-split-commande-select');
  if (sel.value === '__new__') {
    const acheteurId = document.getElementById('vente-split-acheteur-select').value;
    if (!acheteurId) { toast("Choisis d'abord un acheteur.", 'error'); sel.value = ''; return; }
    _acheteurCommandeReturnTo = 'vente-split';
    _lastCreatedAcheteurCommandeId = null;
    document.getElementById('modal-vente-split').classList.remove('open');
    openAddAcheteurCommandeModal(acheteurId);
    return;
  }
  _renderVenteCommandePreview(sel.value, 'vente-split-commande-preview');
}

function _openAcheteurFromVenteSplit() {
  _acheteurReturnTo = 'vente-split';
  _lastCreatedAcheteurId = null;
  document.getElementById('modal-vente-split').classList.remove('open');
  openAddAcheteurModal();
}

function confirmVenteSplit() {
  const v = (_D.ventes||[]).find(x=>x.id===_venteSplitId); if (!v) return;
  const totalQty = parseInt(v.qty,10) || 1;
  const splitQty = Math.max(1, parseInt(document.getElementById('vente-split-qty-input').value,10) || 1);
  const commandeId = document.getElementById('vente-split-commande-select').value;
  if (!commandeId || commandeId === '__new__') { toast("Choisis une commande (ou crée-en une) pour l'acheteur.", 'error'); return; }
  if (splitQty > totalQty) { toast(`Il n'y a que ${totalQty} exemplaire${totalQty>1?'s':''} disponible${totalQty>1?'s':''}.`, 'error'); return; }

  if (splitQty === totalQty) {
    // Tout le lot part chez cet acheteur : pas besoin de créer une 2e ligne.
    v.statut = 'vendue'; v.commande_id = commandeId; v.updated_at = Date.now();
  } else {
    v.qty = totalQty - splitQty; v.updated_at = Date.now();
    const { id: _oldId, created_at: _oldCreated, updated_at: _oldUpdated, ...rest } = v;
    _D.ventes.push({ ...rest, id: _venteId(), qty: splitQty, statut: 'vendue', commande_id: commandeId, created_at: Date.now(), updated_at: Date.now() });
  }
  saveData(); renderAll(); closeModal('modal-vente-split');
  toast(`${splitQty} exemplaire${splitQty>1?'s':''} marqué${splitQty>1?'s':''} vendu${splitQty>1?'s':''} !`, 'success');
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
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name','ext-sigle','cardmarket-url'].forEach(f => {
    const el = document.getElementById('vente-'+f); if (el) el.value = '';
  });
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = 'Near Mint';
  document.getElementById('vente-prix-input').value = '0.02';
  document.getElementById('vente-qty-input').value = 1;
  document.getElementById('vente-langue-select').value = 'Français';
  _setChipGroup('vente-type-chips', ['normale']);
  setCropInput('vente', 16);
  // À défaut de pré-remplissage explicite (venant d'une commande existante),
  // on repart sur le dernier acheteur/commande effectivement utilisé.
  const defaultAcheteurId = prefillAcheteurId || (_D.settings && _D.settings.last_acheteur_id) || '';
  const defaultCommandeId = prefillCommandeId || (!prefillAcheteurId && _D.settings && _D.settings.last_acheteur_commande_id) || null;
  populateAcheteurSelect(defaultAcheteurId);
  populateVenteCommandeSelect(defaultAcheteurId, defaultCommandeId);
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
  const venteCmField = document.getElementById('vente-cardmarket-url');
  if (venteCmField) venteCmField.value = v.cardmarket_url||'';
  _renderCardPreview('vente');
  document.getElementById('vente-etat-select').value = v.etat||'Near Mint';
  document.getElementById('vente-prix-input').value = v.prix||'';
  document.getElementById('vente-qty-input').value = parseInt(v.qty,10) || 1;
  document.getElementById('vente-langue-select').value = v.langue||'Français';
  _setChipGroup('vente-type-chips', v.types||[]);
  setCropInput('vente', v.crop !== undefined && v.crop !== null && v.crop !== '' ? v.crop : 'center');
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
    // Mémorise l'acheteur/commande pour pré-remplir la prochaine nouvelle vente.
    const acheteurId = document.getElementById('vente-acheteur-select').value;
    if (acheteurId) {
      if (!_D.settings) _D.settings = {};
      _D.settings.last_acheteur_id = acheteurId;
      _D.settings.last_acheteur_commande_id = commandeId;
    }
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
    cardmarket_url: (document.getElementById('vente-cardmarket-url')?.value || '').trim(),
    statut,
    commande_id:  commandeId,
  };
  // Le lien CardMarket vit sur la carte elle-même (table Supabase "cards"),
  // pas seulement sur cette vente — éditable ici ET depuis la fiche carte du
  // Pokédex (voir saveCardEdits), donc on répercute la valeur aux deux endroits.
  _pushCardMarketUrl(data.card_id, data.cardmarket_url);
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : mode === 'compact' ? 'sales-compact-wrap' : 'sales-grid-wide';

  let items = [...(_D.depenses||[])];
  if (_depenseFilter === 'unlinked') items = items.filter(d => !d.commande_id);
  if (_depenseFilter === 'linked')   items = items.filter(d => !!d.commande_id);
  if (_depenseQuery) {
    const q = _normalizeStr(_depenseQuery);
    items = items.filter(d => _normalizeStr(d.card_name||'').includes(q) || _normalizeStr(d.pokemon_name||'').includes(q));
  }
  _buildSaleExtFilterList('depense');
  if (_depenseExtFilter !== 'all') items = items.filter(d => d.set_name === _depenseExtFilter);
  _populatePersonFilter('depenses-vendeur-filter', items, _depensePersonFilter);
  if (_depensePersonFilter !== 'all') items = items.filter(d => _personNameFor(d) === _depensePersonFilter);
  items = _applySaleSort(items, _depenseSort);

  if (!items.length) {
    grid.innerHTML = `<div class="sales-empty">Aucun achat${(_depenseQuery||_depenseFilter!=='all'||_depenseExtFilter!=='all'||_depensePersonFilter!=='all') ? ' ne correspond aux filtres' : ' pour le moment'}.</div>`;
  } else {
    const builder = mode === 'list' ? buildDepenseRow : mode === 'compact' ? buildDepenseCompact : buildDepenseCard;
    items.forEach(d => grid.appendChild(builder(d)));
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
  const qtySum = arr => arr.reduce((s,d)=>s+(parseInt(d.qty,10)||1),0);
  el.innerHTML = `
    <div class="stat-card stat-card-money" style="--accent-color:var(--accent)"><div class="val">${sum(all).toFixed(2)} €</div><div class="lbl">Dépensé au total</div><div class="sub">${qtySum(all)} carte${qtySum(all)>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--blue)"><div class="val">${sum(unlinked).toFixed(2)} €</div><div class="lbl">Sans vendeur</div><div class="sub">${qtySum(unlinked)} carte${qtySum(unlinked)>1?'s':''}</div></div>
    <div class="stat-card stat-card-money" style="--accent-color:var(--green)"><div class="val">${sum(linked).toFixed(2)} €</div><div class="lbl">Avec vendeur</div><div class="sub">${qtySum(linked)} carte${qtySum(linked)>1?'s':''}</div></div>`;
}

function _depenseVendeurInfoHtml(d) {
  if (!d.commande_id) return '';
  const c = (_D.vendeur_commandes||[]).find(x=>x.id===d.commande_id);
  if (!c) return '';
  const v = (_D.vendeurs||[]).find(x=>x.id===c.vendeur_id);
  if (!v) return '';
  return `<span class="sale-person-link" onclick="_goToVendeur('${v.id}')">${_flagImgHtml(v.icon)} ${_escHtml(v.pseudo)}</span>${c.date_achat ? `<span class="sale-person-date">${_fmtDate(c.date_achat)}</span>` : ''}`;
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
  const typesHtml = _typeChipsHtml(d.types);
  const card = document.createElement('div');
  card.className = 'sale-card';
  const extColorVal = _extColorForSaleItem(d);
  if (extColorVal) card.style.background = `linear-gradient(160deg, ${extColorVal}82, var(--bg2) 55%)`;
  card.innerHTML =
    _saleCardTopHtml({
      image: d.card_image, qty, sigle: d.ext_sigle, crop: d.crop,
      name: d.card_name || d.pokemon_name || '—',
      extName: d.set_name||'', number: d.number||'',
      statusCls: '', statusLabel: '',
      editFn: 'editDepense', delFn: 'deleteDepense', id: d.id,
    }) + `
    <div class="sale-card-body">
      <div class="sale-row"><span class="lbl">État</span><span class="val">${_etatHtml(d.etat)}</span></div>
      <div class="sale-row"><span class="lbl">Prix</span><span class="val price">${(parseFloat(d.prix)||0).toFixed(2)} €${qty>1?` <span class="qty-badge">×${qty}</span>`:''}</span></div>
      ${typesHtml ? `<div class="sale-row"><span class="lbl">Type</span><span class="val sale-types-val">${typesHtml}</span></div>` : ''}
      <div class="sale-row"><span class="lbl">Langue</span><span class="val">${d.langue||'—'}</span></div>
      <div class="sale-card-footer">
        <div class="sale-acheteur ${vendeurInfo ? '' : 'unlinked'}">${vendeurInfo || '— Aucun vendeur —'}</div>
        ${d.cardmarket_url ? `<a href="${d.cardmarket_url}" target="_blank" rel="noopener" class="sale-link" onclick="event.stopPropagation()">Voir sur CardMarket ↗</a>` : ''}
        ${_saleCardFooterActionsHtml({ editFn: 'editDepense', delFn: 'deleteDepense', id: d.id })}
      </div>
    </div>`;
  card.addEventListener('click', e => { if (e.target.closest('button,a,select,input')) return; editDepense(d.id); });
  return card;
}

function buildDepenseRow(d) {
  const vendeurInfo = _depenseVendeurInfoHtml(d);
  const qty = parseInt(d.qty,10) || 1;
  const typesHtml = _typeChipsHtml(d.types, true);
  const row = document.createElement('div');
  row.className = 'sale-list-row';
  const extColorVal = _extColorForSaleItem(d);
  if (extColorVal) row.style.background = `linear-gradient(90deg, ${extColorVal}3d, var(--bg2) 40%)`;
  row.innerHTML = _saleListRowHtml({
    image: d.card_image, qty, name: d.card_name || d.pokemon_name || '—',
    extName: d.set_name||'', number: d.number||'',
    statusCls: '', statusLabel: '', etat: d.etat, langue: d.langue, typesHtml,
    priceHtml: `${qty>1?`<span class="qty-badge">×${qty}</span> `:''}${(parseFloat(d.prix)||0).toFixed(2)} €`,
    personInfoHtml: vendeurInfo, personEmptyLabel: '— Aucun vendeur —', cardmarketUrl: d.cardmarket_url,
    splitBtnHtml: '',
    editFn: 'editDepense', delFn: 'deleteDepense', id: d.id,
  });
  row.addEventListener('click', e => { if (e.target.closest('button,a,select,input')) return; editDepense(d.id); });
  return row;
}

// Mode "Carte à gauche" pour les Dépenses.
function buildDepenseCompact(d) {
  const vendeurInfo = _depenseVendeurInfoHtml(d);
  const qty = parseInt(d.qty,10) || 1;
  const typesHtml = _typeChipsHtml(d.types);
  const card = document.createElement('div');
  card.className = 'sale-compact-row';
  const extColorVal = _extColorForSaleItem(d);
  if (extColorVal) card.style.background = `linear-gradient(135deg, ${extColorVal}82, var(--bg2) 68%)`;
  card.innerHTML = _saleCompactCardHtml({
    image: d.card_image, qty, sigle: d.ext_sigle, crop: d.crop,
    name: d.card_name || d.pokemon_name || '—',
    extName: d.set_name||'', number: d.number||'',
    statusCls: '', statusLabel: '', etat: d.etat, langue: d.langue, typesHtml,
    priceHtml: `${qty>1?`<span class="qty-badge">×${qty}</span> `:''}${(parseFloat(d.prix)||0).toFixed(2)} €`,
    personInfoHtml: vendeurInfo, cardmarketUrl: d.cardmarket_url,
    splitBtnHtml: '',
    editFn: 'editDepense', delFn: 'deleteDepense', id: d.id, kind: 'depense',
  });
  card.addEventListener('click', e => { if (e.target.closest('button,a,select,input,.sale-compact-thumb')) return; editDepense(d.id); });
  return card;
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
  ['card-id','card-name','card-image','set-id','set-name','set-logo','number','rarity','pokemon-name','ext-sigle','cardmarket-url'].forEach(f => {
    const el = document.getElementById('depense-'+f); if (el) el.value = '';
  });
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = 'Near Mint';
  document.getElementById('depense-prix-input').value = '0.02';
  document.getElementById('depense-qty-input').value = 1;
  document.getElementById('depense-langue-select').value = 'Français';
  _setChipGroup('depense-type-chips', []);
  setCropInput('depense', 16);
  // À défaut de pré-remplissage explicite (venant d'une commande existante),
  // on repart sur le dernier vendeur/commande effectivement utilisé.
  const defaultVendeurId = prefillVendeurId || (_D.settings && _D.settings.last_vendeur_id) || '';
  const defaultCommandeId = prefillCommandeId || (!prefillVendeurId && _D.settings && _D.settings.last_vendeur_commande_id) || null;
  populateVendeurSelect(defaultVendeurId);
  populateDepenseCommandeSelect(defaultVendeurId, defaultCommandeId);
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
  const depenseCmField = document.getElementById('depense-cardmarket-url');
  if (depenseCmField) depenseCmField.value = d.cardmarket_url||'';
  _renderCardPreview('depense');
  document.getElementById('depense-etat-select').value = d.etat||'Near Mint';
  document.getElementById('depense-prix-input').value = d.prix||'';
  document.getElementById('depense-qty-input').value = parseInt(d.qty,10) || 1;
  document.getElementById('depense-langue-select').value = d.langue||'Français';
  _setChipGroup('depense-type-chips', d.types||[]);
  setCropInput('depense', d.crop !== undefined && d.crop !== null && d.crop !== '' ? d.crop : 'center');
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
  // Mémorise le vendeur/commande pour pré-remplir le prochain nouvel achat.
  const vendeurSel = document.getElementById('depense-vendeur-select').value;
  if (vendeurSel) {
    if (!_D.settings) _D.settings = {};
    _D.settings.last_vendeur_id = vendeurSel;
    if (commandeSel && commandeSel !== '__new__') _D.settings.last_vendeur_commande_id = commandeSel;
  }
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
    cardmarket_url: (document.getElementById('depense-cardmarket-url')?.value || '').trim(),
    commande_id:  (commandeSel && commandeSel !== '__new__') ? commandeSel : null,
  };
  _pushCardMarketUrl(data.card_id, data.cardmarket_url);
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'people-grid-wide';

  let items = [...(_D.acheteurs||[])];
  if (_acheteurFilter !== 'all') {
    items = items.filter(a => acheteurCommandes(a.id).some(c => (c.etat||'a_envoyer') === _acheteurFilter));
  }
  if (_acheteurQuery) { const q = _normalizeStr(_acheteurQuery); items = items.filter(a => _normalizeStr(a.pseudo||'').includes(q)); }
  items = _applyPersonSort(items, _acheteurSort, 'acheteur');

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
      <div class="commande-row-line1">
        <div class="commande-date">${c.date_achat?_fmtDate(c.date_achat):'—'}${c.date_arrivee?' → '+_fmtDate(c.date_arrivee):''}</div>
        <div class="status-badge ${st.cls}">${st.label}</div>
      </div>
      <div class="commande-row-line2">
        <div class="commande-count">${ventes.length} carte${ventes.length>1?'s':''}</div>
        <div class="commande-total">${total.toFixed(2)} €</div>
        <div class="commande-actions" onclick="event.stopPropagation()">
          ${c.lien_vente ? `<a href="${c.lien_vente}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien de la vente">${ICON_LINK}</a>` : ''}
          <button class="btn btn-icon btn-sm" title="Modifier la commande" onclick="editAcheteurCommandeModal('${c.id}')">${ICON_EDIT}</button>
          <button class="btn btn-icon btn-sm btn-danger" title="Supprimer la commande" onclick="deleteAcheteurCommande('${c.id}')">${ICON_DELETE}</button>
          <div class="order-chevron ${expanded?'open':''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
        </div>
      </div>
    </div>
    ${expanded ? `
      <div class="order-items-list">${ventes.map(v=>_orderItemRowHtml(v,'vente')).join('') || '<div class="sales-empty" style="padding:6px 0">Aucune carte pour le moment.</div>'}</div>
      <button class="order-add-btn" onclick="openAddVenteModalForAcheteurCommande('${c.id}')">+ Ajouter une carte</button>
    ` : ''}
  </div>`;
}

// Couleur d'accent de l'extension la plus représentée dans les commandes d'un
// acheteur/vendeur (compte les cartes par extension, qty comprise) — même
// principe que le fond coloré des ventes/dépenses individuelles.
function _dominantExtColor(items) {
  if (!items || !items.length) return null;
  const counts = {};
  items.forEach(it => { if (it.set_name) counts[it.set_name] = (counts[it.set_name]||0) + (parseInt(it.qty,10)||1); });
  const names = Object.keys(counts);
  if (!names.length) return null;
  const topName = names.sort((a,b) => counts[b]-counts[a])[0];
  const ext = (typeof getAllExtensions === 'function' ? getAllExtensions() : []).find(e => e.nom === topName);
  return ext ? extColor(ext) : null;
}

function buildAcheteurCard(a) {
  const commandes = acheteurCommandes(a.id);
  const total  = acheteurTotal(a.id);
  const ventes = acheteurVentes(a.id);
  const nbCartes = ventes.length;
  const expanded = _orderExpandedAcheteurs.has(a.id);
  const card = document.createElement('div');
  card.className = 'order-card';
  card.dataset.acheteurId = a.id;
  const extColorVal = _dominantExtColor(ventes);
  if (extColorVal) card.style.background = `linear-gradient(160deg, ${extColorVal}82, var(--bg2) 55%)`;
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">${_flagImgHtml(a.icon, 22)}</div>
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
      <div class="clr-thumb clr-thumb-circle" style="background:linear-gradient(135deg,#4a9eff33,#4a9eff55)">${_flagImgHtml(a.icon, 20)}</div>
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
  _buildIconPicker('acheteur-icon-picker', 'fr');
  modal.classList.add('open');
}

function editAcheteur(id) {
  const a = (_D.acheteurs||[]).find(x=>x.id===id); if (!a) return;
  const modal = document.getElementById('modal-acheteur');
  modal.dataset.editId = id;
  document.getElementById('modal-acheteur-title').textContent = "Modifier l'acheteur";
  document.getElementById('acheteur-pseudo-input').value = a.pseudo||'';
  _buildIconPicker('acheteur-icon-picker', a.icon||'fr');
  modal.classList.add('open');
}

function saveAcheteur() {
  const modal = document.getElementById('modal-acheteur');
  const pseudo = document.getElementById('acheteur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const icon = _getSelectedIcon('acheteur-icon-picker', 'fr');
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
  grid.className = mode === 'list' ? 'sales-list-wrap' : 'people-grid-wide';

  let items = [...(_D.vendeurs||[])];
  if (_vendeurFilter !== 'all') {
    items = items.filter(v => vendeurCommandes(v.id).some(c => (c.etat||'a_payer') === _vendeurFilter));
  }
  if (_vendeurQuery) { const q = _normalizeStr(_vendeurQuery); items = items.filter(v => _normalizeStr(v.pseudo||'').includes(q)); }
  items = _applyPersonSort(items, _vendeurSort, 'vendeur');

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
      <div class="commande-row-line1">
        <div class="commande-date">${c.date_achat?_fmtDate(c.date_achat):'—'}${c.date_arrivee?' → '+_fmtDate(c.date_arrivee):''}</div>
        <div class="status-badge ${st.cls}">${st.label}</div>
      </div>
      <div class="commande-row-line2">
        <div class="commande-count">${depenses.length} carte${depenses.length>1?'s':''}</div>
        <div class="commande-total">${total.toFixed(2)} €</div>
        <div class="commande-actions" onclick="event.stopPropagation()">
          ${c.lien_achat ? `<a href="${c.lien_achat}" target="_blank" rel="noopener" class="btn btn-icon btn-sm" title="Lien de l'achat">${ICON_LINK}</a>` : ''}
          <button class="btn btn-icon btn-sm" title="Modifier la commande" onclick="editVendeurCommandeModal('${c.id}')">${ICON_EDIT}</button>
          <button class="btn btn-icon btn-sm btn-danger" title="Supprimer la commande" onclick="deleteVendeurCommande('${c.id}')">${ICON_DELETE}</button>
          <div class="order-chevron ${expanded?'open':''}"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></div>
        </div>
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
  const depensesForVendeur = vendeurDepenses(v.id);
  const nbCartes = depensesForVendeur.length;
  const expanded = _orderExpandedVendeurs.has(v.id);
  const card = document.createElement('div');
  card.className = 'order-card';
  card.dataset.vendeurId = v.id;
  const extColorVal = _dominantExtColor(depensesForVendeur);
  if (extColorVal) card.style.background = `linear-gradient(160deg, ${extColorVal}82, var(--bg2) 55%)`;
  card.innerHTML = `
    <div class="order-card-top">
      <div class="order-card-avatar">${_flagImgHtml(v.icon, 22)}</div>
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
      <div class="clr-thumb clr-thumb-circle" style="background:linear-gradient(135deg,#f9731633,#f9731655)">${_flagImgHtml(v.icon, 20)}</div>
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
  _buildIconPicker('vendeur-icon-picker', 'fr');
  modal.classList.add('open');
}

function editVendeur(id) {
  const v = (_D.vendeurs||[]).find(x=>x.id===id); if (!v) return;
  const modal = document.getElementById('modal-vendeur');
  modal.dataset.editId = id;
  document.getElementById('modal-vendeur-title').textContent = 'Modifier le vendeur';
  document.getElementById('vendeur-pseudo-input').value = v.pseudo||'';
  _buildIconPicker('vendeur-icon-picker', v.icon||'fr');
  modal.classList.add('open');
}

function saveVendeur() {
  const modal = document.getElementById('modal-vendeur');
  const pseudo = document.getElementById('vendeur-pseudo-input').value.trim();
  if (!pseudo) { toast('Veuillez saisir un pseudo.','error'); return; }
  const icon = _getSelectedIcon('vendeur-icon-picker', 'fr');
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

// Mois d'une vente : date d'arrivée de la commande si elle est vendue et
// liée (c'est à l'arrivée que l'argent est effectivement reçu — voir
// _venteIsArrivee ci-dessous), sinon date de création de la ligne (repli).
function _venteMonthKey(v) {
  if (v.commande_id) {
    const c = (_D.acheteur_commandes||[]).find(x=>x.id===v.commande_id);
    if (c && c.date_arrivee) return _monthKey(c.date_arrivee);
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

// Une vente/dépense ne compte dans le Bilan (revenus/dépenses, répartition)
// que si sa commande est arrivée — reconnaître le revenu/la dépense avant
// réception effective serait trompeur (l'argent/la carte peut encore ne
// jamais arriver). Sans commande liée du tout, on ne compte pas non plus :
// pas de commande = rien à valider.
function _venteIsArrivee(v) {
  if (!v.commande_id) return false;
  const c = (_D.acheteur_commandes||[]).find(x => x.id === v.commande_id);
  return !!c && (c.etat||'a_envoyer') === 'arrive';
}
function _depenseIsArrivee(d) {
  if (!d.commande_id) return false;
  const c = (_D.vendeur_commandes||[]).find(x => x.id === d.commande_id);
  return !!c && (c.etat||'a_payer') === 'arrive';
}

function renderBilan() {
  const statsEl = document.getElementById('bilan-stats');
  const el      = document.getElementById('bilan-content');
  if (!statsEl || !el) return;

  const ventesByMonth = {}, ventesCountByMonth = {};
  (_D.ventes||[]).filter(v => venteStatusInfo(v).id === 'vendue' && _venteIsArrivee(v)).forEach(v => {
    const key = _venteMonthKey(v); if (!key) return;
    ventesByMonth[key] = (ventesByMonth[key]||0) + _lineTotal(v);
    ventesCountByMonth[key] = (ventesCountByMonth[key]||0) + (parseInt(v.qty,10)||1);
  });

  const depensesByMonth = {}, depensesCountByMonth = {};
  (_D.depenses||[]).filter(d => _depenseIsArrivee(d)).forEach(d => {
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
    <div class="bilan-period-row">
      <span class="form-hint" style="margin:0">Répartition dépenses/revenus calculée sur :</span>
      <select id="bilan-period-select" class="sales-sort-select" onchange="_setBilanPeriod(this.value)">
        <option value="total" ${_bilanPeriod==='total'?'selected':''}>Total (tout l'historique)</option>
        <option value="year" ${_bilanPeriod==='year'?'selected':''}>Année en cours</option>
        <option value="month" ${_bilanPeriod==='month'?'selected':''}>Mois en cours</option>
      </select>
    </div>
    <div class="bilan-charts-row">
      <div class="bilan-chart-card">
        <div class="bilan-card-head">
          <h3>Répartition des dépenses <span class="form-hint" style="margin:0">par extension</span></h3>
          <div class="bilan-chart-type-toggle">
            <button class="bilan-ctt-btn ${_bilanDepMode==='donut'?'active':''}" onclick="_setBilanChartMode('dep','donut')" title="Camembert">◉</button>
            <button class="bilan-ctt-btn ${_bilanDepMode==='bar'?'active':''}" onclick="_setBilanChartMode('dep','bar')" title="Barres">≡</button>
          </div>
        </div>
        <div class="bilan-chart-wrapper" id="bilan-dep-wrapper"><canvas id="bilan-dep-canvas"></canvas></div>
      </div>
      <div class="bilan-chart-card">
        <div class="bilan-card-head">
          <h3>Répartition des revenus <span class="form-hint" style="margin:0">par extension</span></h3>
          <div class="bilan-chart-type-toggle">
            <button class="bilan-ctt-btn ${_bilanRevMode==='donut'?'active':''}" onclick="_setBilanChartMode('rev','donut')" title="Camembert">◉</button>
            <button class="bilan-ctt-btn ${_bilanRevMode==='bar'?'active':''}" onclick="_setBilanChartMode('rev','bar')" title="Barres">≡</button>
          </div>
        </div>
        <div class="bilan-chart-wrapper" id="bilan-rev-wrapper"><canvas id="bilan-rev-canvas"></canvas></div>
      </div>
    </div>
    <div class="bilan-chart-card">
      <div class="bilan-card-head"><h3>Évolution <span class="form-hint" style="margin:0">ventes vendues vs dépenses, par mois</span></h3></div>
      <div class="bilan-chart-wrapper bilan-chart-wrapper-tall"><canvas id="bilan-evo-canvas"></canvas></div>
    </div>
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

  // Chart.js est chargé via CDN (voir index.html, comme dans le budget de
  // référence) — si jamais il n'a pas pu se charger (offline, CDN
  // injoignable…), on garde au moins le tableau plutôt que de planter.
  if (typeof Chart === 'undefined') {
    ['bilan-dep-wrapper','bilan-rev-wrapper'].forEach(id => {
      const w = document.getElementById(id);
      if (w) w.innerHTML = '<div class="bilan-chart-empty">Graphique indisponible (Chart.js non chargé — vérifie ta connexion)</div>';
    });
    return;
  }

  const depensesByExt = _groupByExtension(_filterByBilanPeriod((_D.depenses||[]).filter(_depenseIsArrivee), _depenseMonthKey));
  const ventesByExt   = _groupByExtension(_filterByBilanPeriod((_D.ventes||[]).filter(v => venteStatusInfo(v).id === 'vendue' && _venteIsArrivee(v)), _venteMonthKey));
  const chronoMonths  = [...allMonths].reverse(); // plus ancien → plus récent, pour lire l'évolution dans le bon sens

  _bilanDepChart = _renderBilanCatChart('bilan-dep-canvas', depensesByExt, _bilanDepMode, _bilanDepChart, 'bilan-dep-wrapper');
  _bilanRevChart = _renderBilanCatChart('bilan-rev-canvas', ventesByExt,   _bilanRevMode, _bilanRevChart, 'bilan-rev-wrapper');
  _bilanEvoChart = _renderBilanEvolutionChart('bilan-evo-canvas', chronoMonths, ventesByMonth, depensesByMonth, _bilanEvoChart);
}

// ── Bilan : graphiques (Chart.js, chargé via CDN — voir index.html) ─────
// Reprend fidèlement l'approche du budget de référence fourni par Alex :
// mêmes réglages de graphique (camembert `cutout:'62%'`, légende à droite en
// usePointStyle, barres horizontales pour le mode liste, barres groupées par
// pile 'income'/'expense' pour l'évolution) — seules les couleurs sont
// adaptées au thème sombre de PTCG et le regroupement se fait par extension
// plutôt que par catégorie budgétaire.
var _bilanDepMode = 'donut', _bilanRevMode = 'donut';
var _bilanDepChart = null, _bilanRevChart = null, _bilanEvoChart = null;
var _bilanPeriod = 'total'; // 'total' | 'year' | 'month' — période de calcul de la répartition dépenses/revenus

function _setBilanPeriod(period) {
  _bilanPeriod = period;
  renderBilan();
}

// Restreint une liste de ventes/dépenses à l'année ou au mois en cours avant
// de calculer la répartition par extension — "total" ne filtre rien.
function _filterByBilanPeriod(items, dateKeyFn) {
  if (_bilanPeriod === 'total') return items;
  const now = new Date();
  const curYear  = String(now.getFullYear());
  const curMonth = curYear + '-' + String(now.getMonth()+1).padStart(2,'0');
  return items.filter(it => {
    const key = dateKeyFn(it);
    if (!key) return false;
    return _bilanPeriod === 'year' ? key.slice(0,4) === curYear : key === curMonth;
  });
}

function _setBilanChartMode(which, mode) {
  if (which === 'dep') _bilanDepMode = mode; else _bilanRevMode = mode;
  renderBilan();
}

const _BILAN_PALETTE = ['#ff6b6b','#4a9eff','#ffd166','#06d6a0','#a78bfa','#f472b6','#fb923c','#38bdf8','#a3e635','#e879f9'];

// Regroupe des ventes/dépenses par extension (set_name) — c'est le
// regroupement demandé pour la répartition des dépenses (et, par cohérence,
// des revenus) dans le Bilan.
function _groupByExtension(items) {
  const map = {};
  items.forEach(it => { const key = it.set_name || 'Sans extension'; map[key] = (map[key]||0) + _lineTotal(it); });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({ label, value, color: _BILAN_PALETTE[i%_BILAN_PALETTE.length] }));
}

function _renderBilanCatChart(canvasId, segments, mode, existingChart, wrapperId) {
  const cv = document.getElementById(canvasId);
  if (!cv) return existingChart;
  if (existingChart) existingChart.destroy();

  const withValue = segments.filter(s => s.value > 0);
  if (!withValue.length) {
    const wrapper = document.getElementById(wrapperId);
    if (wrapper) wrapper.innerHTML = '<div class="bilan-chart-empty">Aucune donnée</div>';
    return null;
  }

  const labels   = withValue.map(s => s.label);
  const values   = withValue.map(s => s.value);
  const bgColors = withValue.map(s => s.color);
  const styles    = getComputedStyle(document.documentElement);
  const inkColor  = styles.getPropertyValue('--text').trim()  || '#e8e8f0';
  const gridColor = styles.getPropertyValue('--border').trim() || '#2a2a3a';
  const bgColor   = styles.getPropertyValue('--bg2').trim()    || '#1a1a24';

  if (mode === 'bar') {
    return new Chart(cv, {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: bgColors, borderRadius: 5 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: bgColor, padding: 10, callbacks: { label: c => `${c.parsed.x.toFixed(2)} €` } },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: inkColor, callback: v => v>=1000?(v/1000)+'k €':v+'€' } },
          y: { grid: { display: false }, ticks: { color: inkColor, font: { size: 11 } } },
        },
      },
    });
  }
  return new Chart(cv, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: bgColors, borderColor: bgColor, borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: { position: 'right', labels: { color: inkColor, usePointStyle: true, padding: 12, font: { size: 11 } } },
        tooltip: { backgroundColor: bgColor, padding: 12, callbacks: { label: c => `${c.label}: ${c.parsed.toFixed(2)} €` } },
      },
    },
  });
}

function _renderBilanEvolutionChart(canvasId, months, ventesByMonth, depensesByMonth, existingChart) {
  const cv = document.getElementById(canvasId);
  if (!cv) return existingChart;
  if (existingChart) existingChart.destroy();
  if (!months.length) return null;

  const styles     = getComputedStyle(document.documentElement);
  const inkColor   = styles.getPropertyValue('--text').trim()   || '#e8e8f0';
  const mutedColor = styles.getPropertyValue('--text3').trim()  || '#8a8a9a';
  const gridColor  = styles.getPropertyValue('--border').trim() || '#2a2a3a';
  const bgColor    = styles.getPropertyValue('--bg2').trim()    || '#1a1a24';
  const green      = styles.getPropertyValue('--green').trim()  || '#22c55e';
  const red        = styles.getPropertyValue('--accent2').trim()|| '#ef4444';

  const labels       = months.map(m => _monthLabel(m));
  const ventesData   = months.map(m => ventesByMonth[m]||0);
  const depensesData = months.map(m => depensesByMonth[m]||0);

  return new Chart(cv, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Ventes',   data: ventesData,   backgroundColor: green, borderRadius: 6, borderSkipped: false, stack: 'income' },
        { label: 'Dépenses', data: depensesData, backgroundColor: red,   borderRadius: 6, borderSkipped: false, stack: 'expense' },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: inkColor, usePointStyle: true, boxWidth: 12 } },
        tooltip: { backgroundColor: bgColor, padding: 12, callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} €` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: mutedColor } },
        y: { stacked: true, grid: { color: gridColor }, ticks: { color: mutedColor, callback: v => v>=1000?(v/1000).toFixed(1)+'k €':v+' €' } },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  SÉLECTEUR "TYPE" (multi-sélection : Normale / Reverse / Holo Cosmos / 1ère édition)
// ═══════════════════════════════════════════════════════════════════════════
function _buildChipGroup(containerId, options, selected) {
  const el = document.getElementById(containerId); if (!el) return;
  // Un seul type à la fois (Normale / Reverse / Holo Cosmos / 1ère édition) —
  // comportement "radio", pas de sélection multiple.
  const first = selected && selected.length ? selected[0] : options[0].id;
  el.innerHTML = options.map(o => `<button type="button" class="chip-toggle-btn ${o.id===first?'active':''}" data-value="${o.id}" onclick="_toggleChip(this)">${o.label}</button>`).join('');
}
function _toggleChip(btn) {
  const group = btn.closest('.chip-toggle-group'); if (!group) return;
  group.querySelectorAll('.chip-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}
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
    // BUG corrigé : pour une forme (Méga, Gigamax, régionale…), on cherchait
    // jusqu'ici avec le nom COMBINÉ figé dans le code (p.frName, ex.
    // "Méga-Dracaufeu" — voir _buildFormFrName) au lieu du nom de BASE. Or les
    // cartes réelles n'utilisent pas forcément ce gabarit exact ("Méga
    // Dracaufeu" sans tiret, "M Dracaufeu", etc.) : la recherche ne trouvait
    // souvent rien, et le filtrage par préfixes/suffixes personnalisés
    // (Édition › Labels) n'avait alors plus aucune carte sur laquelle
    // s'appliquer. La fiche Pokédex, elle, cherchait déjà avec le nom de
    // base + le filtre de formType — c'est ce même comportement qu'on
    // applique ici pour que le sélecteur de carte trouve exactement les
    // mêmes cartes que la fiche.
    const baseEntry = p.isForm ? _pkdx.all.find(e => !e.isForm && e.id === p.baseId) : p;
    const frName = (baseEntry && baseEntry.frName) || p.frName || _capitalize(p.name.replace(/-/g,' '));
    // Résolution du type de forme identique aux fiches Pokédex (assignation
    // manuelle prioritaire, sinon détection automatique) — garantit que le
    // sélecteur trouve exactement les mêmes cartes que la fiche du Pokémon
    // (Gigamax, Méga "M"/"M-", label posé sur une forme de base, etc.).
    const formType = await _resolveFormTypeForPkdxEntry(p);
    // Types de forme réellement liés à ce Pokémon (voir openPokedexModal /
    // _fetchCardsGroupedByExtension) : évite qu'une carte VMAX d'un Pokémon
    // sans vraie forme Gigamax disparaisse à tort de sa vue de base.
    const baseIdForForms = p.isForm ? p.baseId : p.id;
    const ownFormTypes = _pkdx.all.filter(e => e.isForm && e.baseId === baseIdForForms).map(e => e.formType).filter(Boolean);
    const { groups } = await _fetchCardsGroupedByExtension(frName, formType, ownFormTypes);
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
  const cmField = document.getElementById(`${p}-cardmarket-url`);
  if (cmField) cmField.value = c.cardmarket_url || '';
  _renderCardPreview(p);
  closeModal('modal-card-picker');
}

function _renderCardPreview(prefix) {
  const wrap = document.getElementById(`${prefix}-card-preview`);
  const name = document.getElementById(`${prefix}-card-name`).value;
  const img = document.getElementById(`${prefix}-card-image`).value;
  // L'aperçu de rognage doit toujours suivre l'image actuellement choisie
  // (nouvelle carte sélectionnée, ou formulaire vidé) — on garde la valeur de
  // rognage déjà en place, seule l'image de fond change.
  const cropInput = document.getElementById(`${prefix}-crop-input`);
  if (cropInput) setCropInput(prefix, cropInput.value, img);
  if (!wrap) return;
  if (!name) { wrap.innerHTML = '<div class="sales-empty" style="padding:8px 0">Aucune carte sélectionnée.</div>'; return; }
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

// ── Rognage de l'image d'en-tête (curseur vertical interactif, 0-100%) ───
// Remplace l'ancien choix figé à 3 valeurs (Haut/Centre/Bas) par un
// positionnement exact : on glisse directement sur l'aperçu de la carte (ou
// sur le curseur de secours) pour choisir le point vertical exact affiché
// dans la bannière. La valeur stockée est un nombre 0-100 (% depuis le haut
// de l'image). Les anciennes ventes/dépenses enregistrées avec 'top'/
// 'center'/'bottom' restent lisibles grâce à CARD_CROP_LEGACY.
var CARD_CROP_LEGACY = { top: 0, center: 50, bottom: 100 };
function _cropValue(crop) {
  let v = crop;
  if (typeof v === 'string' && CARD_CROP_LEGACY[v] !== undefined) v = CARD_CROP_LEGACY[v];
  v = parseFloat(v);
  if (isNaN(v)) v = 50;
  return Math.max(0, Math.min(100, v));
}
function _cropPosition(crop) {
  return `center ${_cropValue(crop)}%`;
}

// (Ré)initialise le curseur de rognage d'un formulaire (vente/dépense) :
// image de fond, poignée glissable et curseur de secours, tous synchronisés.
// `imageUrl` est optionnel — s'il n'est pas fourni, on relit le champ caché
// `${prefix}-card-image` déjà présent dans le formulaire.
function setCropInput(prefix, crop, imageUrl) {
  const v = _cropValue(crop);
  const hidden = document.getElementById(`${prefix}-crop-input`);
  if (hidden) hidden.value = v;
  const img = imageUrl !== undefined ? imageUrl : (document.getElementById(`${prefix}-card-image`)?.value || '');
  const preview = document.getElementById(`${prefix}-crop-preview`);
  if (preview) {
    preview.classList.toggle('is-empty', !img);
    preview.style.backgroundImage = img ? `url('${img}')` : '';
    preview.style.backgroundPosition = `center ${v}%`;
  }
  const handle = document.getElementById(`${prefix}-crop-handle`);
  if (handle) handle.style.top = v + '%';
  const range = document.getElementById(`${prefix}-crop-range`);
  if (range) range.value = v;
  const valueEl = document.getElementById(`${prefix}-crop-value`);
  if (valueEl) valueEl.textContent = Math.round(v) + '%';
}

// Curseur de secours (accessible clavier/tactile) : appelé sur son oninput.
function _onCropRangeInput(prefix, val) { setCropInput(prefix, val); }

// Glisser-déposer directement sur l'aperçu de l'image — plus rapide et plus
// précis que le curseur seul : on peut cliquer n'importe où sur l'image pour
// y placer immédiatement le point de rognage, puis affiner en glissant.
function _cropPreviewPointerDown(prefix, ev) {
  const preview = document.getElementById(`${prefix}-crop-preview`);
  if (!preview || preview.classList.contains('is-empty')) return;
  ev.preventDefault();
  const clientYOf = e => (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  const update = clientY => {
    const rect = preview.getBoundingClientRect();
    const pct = ((clientY - rect.top) / rect.height) * 100;
    setCropInput(prefix, pct);
  };
  update(clientYOf(ev));
  const onMove = e => { e.preventDefault(); update(clientYOf(e)); };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
}


