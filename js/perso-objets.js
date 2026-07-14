// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/perso-objets.js
//  Personnages & Objets — même modèle que le Pokédex (grille, fiche détail,
//  cartes TCG associées), mais alimenté par TCGdex (cartes Dresseur
//  Supporter / Item) plutôt que par PokéAPI.
//
//  Ce fichier doit être chargé APRÈS pokedex.js, edition.js et
//  label-categories.js : il réutilise leurs briques (_pkdxTcgSectionHtml,
//  _groupCardsByExtension, _renderTcgCardGroupsHtml, _renderPkdxTcgGroups,
//  openCardDetailModal, _escHtml, _escJs, _normalizeStr, _accentVariants,
//  _cardNameMatchesKnown, _buildKnownPokemonNameSet…) au lieu de dupliquer
//  la fiche détail / la modale carte / le regroupement par extension.
// ═══════════════════════════════════════════════════════════════════════════

// ── TCGdex : file d'attente à concurrence limitée ──────────────────────────
// PARTAGÉE par Personnages ET Objets (une seule instance globale) : sans ça,
// ouvrir les deux onglets à la suite cumule deux vagues de requêtes
// simultanées et sature quand même la connexion, même si chacune est
// limitée individuellement. max=3 est volontairement en dessous de la
// limite usuelle de connexions simultanées par domaine d'un navigateur
// (~6) : ça laisse de la marge pour qu'une requête TCGdex faite depuis une
// AUTRE page (ex. recherche manuelle dans le sélecteur de carte
// Ventes/Dépenses, ou Édition › Mapping TCG) parte sans attendre derrière
// tout un lot de 100 cartes — c'est précisément ce qui causait le lag
// observé sur les autres pages avec un chargement non throttled.
var _tcgdexQueue = { active: 0, max: 3, pending: [] };
function _tcgdexThrottled(fn) {
  return new Promise((resolve, reject) => {
    const run = () => {
      _tcgdexQueue.active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => {
        _tcgdexQueue.active--;
        if (_tcgdexQueue.pending.length) _tcgdexQueue.pending.shift()();
      });
    };
    if (_tcgdexQueue.active < _tcgdexQueue.max) run(); else _tcgdexQueue.pending.push(run);
  });
}

// ── Cache local du catalogue TCGdex ─────────────────────────────────────────
// Le catalogue complet (toutes les cartes Dresseur Supporter/Item, tous sets
// confondus) ne change quasiment jamais d'une session à l'autre — seules les
// sorties de nouvelles extensions en ajoutent quelques-unes. Le mettre en
// cache localStorage pendant 21 jours évite de refaire tout le crawl TCGdex
// à CHAQUE ouverture de l'onglet, qui est le scénario le plus susceptible de
// surcharger l'API. Un bouton "Rafraîchir le catalogue" (Édition › Perso. &
// Objets) permet de forcer une mise à jour avant l'échéance si besoin.
var PKO_CACHE_TTL_MS = 21 * 24 * 60 * 60 * 1000;
function _pkoCacheKey(kind) { return 'ptcg_pko_catalog_' + kind + '_v4'; } // v4 : réorganisation Personnages/Objets/Lieux/Énergies
function _pkoLoadCache(kind) {
  try {
    const raw = localStorage.getItem(_pkoCacheKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cards) || !parsed.ts) return null;
    if (Date.now() - parsed.ts > PKO_CACHE_TTL_MS) return null;
    return parsed.cards;
  } catch(_) { return null; }
}
function _pkoSaveCache(kind, cards) {
  try { localStorage.setItem(_pkoCacheKey(kind), JSON.stringify({ ts: Date.now(), cards })); } catch(_) { /* quota plein : tant pis, on recalculera à chaque fois */ }
}

// ── Récupération du catalogue TCGdex ────────────────────────────────────────
// Organisation (voir aussi PKO_LABELS) :
//  - Personnages = Dresseur Supporter
//  - Objets      = Dresseur Objet + Objet Spécial (trainerType Item|Tool)
//  - Lieux       = Dresseur Stade (trainerType Stadium)
//  - Énergies    = Énergie de base + spéciale (category=Energy — pas un
//    trainerType du tout, TCGdex range les Énergies dans une catégorie de
//    carte à part ; energyType Basic/Special n'a pas besoin d'être filtré
//    séparément puisqu'on veut les deux).
var PKO_CATALOG_FILTER = {
  personnage: 'trainerType=eq:Supporter',
  objet:      'trainerType=eq:Item|Tool',
  lieu:       'trainerType=eq:Stadium',
  energie:    'category=eq:Energy',
};

// Stratégie en 2 phases (voir notes précédentes du projet) :
//  1) endpoint EN — le seul où trainerType (et plus généralement la
//     classification des cartes) est fiable — filtré serveur : UNE seule
//     requête renvoie déjà l'id de TOUTES les cartes concernées, tous sets
//     confondus.
//  2) noms/images FR — PAS un appel par carte (des milliers de requêtes
//     individuelles saturent le domaine et ralentissent toute autre requête
//     TCGdex pendant ce temps, y compris depuis une autre page). On regroupe
//     les ids par paquets de 100 et on utilise le filtre "valeurs
//     multiples" de l'API (id=eq:a|b|c…) pour ne faire qu'UNE requête par
//     paquet — puis ces paquets sont eux-mêmes passés par la file
//     _tcgdexThrottled (3 à la fois) plutôt que tous lancés d'un coup avec
//     Promise.all.
// BUG corrigé : l'API TCGdex renvoie une URL "de base" pour chaque image
// (ex. "https://assets.tcgdex.net/fr/sm/sm5/151"), SANS extension ni
// indication de qualité — l'utiliser telle quelle échoue systématiquement
// au chargement (404), ce qui expliquait le mur d'images cassées sur les
// grilles Personnages/Objets. Il faut lui ajouter un suffixe qualité+format
// (voir la doc TCGdex "Assets Management"). Défensif : si l'URL a déjà une
// extension (ex. une image personnalisée saisie à la main dans Édition, qui
// elle est une vraie URL directe), on la laisse telle quelle.
function _tcgdexImgUrl(base) {
  if (!base) return '';
  if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(base)) return base;
  return base + '/high.png';
}

async function _fetchTcgdexPkoCards(kind, forceRefresh) {
  if (!forceRefresh) {
    const cached = _pkoLoadCache(kind);
    if (cached) return cached;
  }
  const filter = PKO_CATALOG_FILTER[kind];
  if (!filter) return [];

  const enRes = await fetch(`https://api.tcgdex.net/v2/en/cards?${filter}`);
  if (!enRes.ok) throw new Error('TCGdex HTTP ' + enRes.status);
  const enCards = await enRes.json(); // [{id, localId, name, image}, …]
  if (!enCards.length) return [];

  const chunks = [];
  for (let i = 0; i < enCards.length; i += 100) chunks.push(enCards.slice(i, i + 100).map(c => c.id));

  const chunkResults = await Promise.all(chunks.map(chunk => _tcgdexThrottled(async () => {
    const url = `https://api.tcgdex.net/v2/fr/cards?id=eq:${chunk.join('|')}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      return await res.json();
    } catch(_) { return []; } // un paquet en échec ne doit pas faire échouer tout le catalogue
  })));

  const frById = new Map();
  chunkResults.flat().forEach(c => frById.set(c.id, c));

  // Repli sur le nom/l'image anglais si la traduction FR manque pour telle
  // carte précise (endpoint FR incomplet pour un set récent, par ex.) plutôt
  // que de perdre la carte purement et simplement.
  const merged = enCards.map(en => {
    const fr = frById.get(en.id);
    return { id: en.id, name: (fr && fr.name) || en.name, image: _tcgdexImgUrl((fr && fr.image) || en.image) };
  });

  _pkoSaveCache(kind, merged);
  return merged;
}

// ── Regroupement automatique par nom réel ───────────────────────────────────
// Un même Personnage/Objet apparaît sous des titres de carte très variables
// ("Sacha", "Ordres de Sacha", "Sacha & Ronflex-GX"…). Règle : un titre SANS
// mot connecteur (de/du/des/et/d’) est un nom canonique candidat ; toute
// carte (y compris les titres composés) est ensuite rattachée au nom
// canonique dont les tokens apparaissent, à la suite, n'importe où dans son
// titre — comparaison par TOKENS ENTIERS (jamais une simple inclusion de
// sous-chaîne), pour ne jamais confondre un nom court avec un mot qui le
// contient par coïncidence (ex. "Ball" ne doit pas matcher "Poké Ball").
var PKO_CONNECTORS = new Set(['de', 'du', 'des', 'et', 'd']);

function _pkoNormTokens(name) {
  return _normalizeStr(name || '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function _pkoIsBareTitle(tokens) {
  return tokens.length > 0 && !tokens.some(t => PKO_CONNECTORS.has(t));
}

// Utilisé aussi par edition.js (_cardNameContainsKnown) : est-ce que la
// séquence `needle` apparaît, consécutive, quelque part dans `haystack` ?
function _tokensContainSeq(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) { if (haystack[i + j] !== needle[j]) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}

function _groupPkoCardsByAutoName(cards) {
  // 1) Candidats "noms canoniques" = titres sans connecteur, dédupliqués,
  // triés par longueur décroissante (priorité au match le plus spécifique :
  // "Sacha & Ondine" doit gagner sur "Sacha" s'il existe aussi tel quel).
  const bareByKey = new Map();
  cards.forEach(c => {
    const tokens = _pkoNormTokens(c.name);
    if (!_pkoIsBareTitle(tokens)) return;
    const key = tokens.join(' ');
    if (!bareByKey.has(key)) bareByKey.set(key, { displayName: c.name, tokens });
  });
  const bareList = [...bareByKey.entries()].sort((a, b) => b[1].tokens.length - a[1].tokens.length);

  // 2) Rattache chaque carte (bare ou composée) à son nom canonique.
  const groups = new Map();
  const unresolved = [];
  cards.forEach(c => {
    const tokens = _pkoNormTokens(c.name);
    let hit = null;
    for (const [key, info] of bareList) {
      if (_tokensContainSeq(tokens, info.tokens)) { hit = { key, displayName: info.displayName }; break; }
    }
    if (!hit) { unresolved.push(c); return; }
    if (!groups.has(hit.key)) groups.set(hit.key, { key: 'auto:' + hit.key, displayName: hit.displayName, cards: [] });
    groups.get(hit.key).cards.push(c);
  });

  // 3) Titres composés ne contenant AUCUN nom canonique connu (ex. seul
  // exemplaire d'une carte toujours nommée avec un connecteur) : deviennent
  // chacun leur propre groupe plutôt que de disparaître — reste corrigible à
  // la main dans Édition si l'auto-détection s'est trompée.
  unresolved.forEach(c => {
    const key = _pkoNormTokens(c.name).join(' ');
    if (!key) return;
    if (!groups.has(key)) groups.set(key, { key: 'auto:' + key, displayName: c.name, cards: [] });
    groups.get(key).cards.push(c);
  });

  return [...groups.values()];
}

// ── Fusion catalogue auto + corrections manuelles (Édition) ────────────────
// _D.perso_objets : tableau d'objets
//   { id, kind, display_name, image_url, manual_cards:[{id,name,image}], is_custom, is_deleted, sort_order }
// - id d'une correction d'entrée AUTO = la clé auto ("auto:sacha")
// - id d'une entrée 100% manuelle (n'existant dans aucune des deux sources)
//   = "cpo_" + timestamp
// - manual_cards embarque directement {id,name,image} (pas juste l'id) :
//   une carte assignée à la main peut venir d'une recherche TCGdex live
//   couvrant des types hors du catalogue auto-détecté (Stade, Objet Spécial/
//   Outil Pokémon, Énergie spéciale…) — elle n'a donc PAS forcément
//   d'entrée correspondante dans _pko.catalog[kind] pour la résoudre après
//   coup. Rétro-compatible avec l'ancien format (juste une chaîne d'id) via
//   _pkoResolveManualCards, qui retombe alors sur une résolution par
//   catalogue comme avant.
function _pkoOverridesFor(kind) {
  return (_D.perso_objets || []).filter(o => o.kind === kind);
}

function _pkoResolveManualCards(manualCards, byCardId) {
  return (manualCards || []).map(mc => {
    if (typeof mc === 'string') return byCardId.get(mc); // ancien format (compat)
    return mc.name ? mc : byCardId.get(mc.id);
  }).filter(Boolean);
}

function _pkoBuildEntries(kind) {
  const raw = _pko.catalog[kind] || [];
  const overrides = _pkoOverridesFor(kind);
  const overrideById = new Map(overrides.map(o => [o.id, o]));

  // Une carte assignée manuellement à UNE entrée ne doit plus jamais
  // réapparaître dans une AUTRE entrée via le regroupement automatique —
  // retirée du pool avant même de lancer _groupPkoCardsByAutoName.
  const manuallyClaimed = new Set();
  overrides.forEach(o => (o.manual_cards || []).forEach(mc => manuallyClaimed.add(typeof mc === 'string' ? mc : mc.id)));
  const autoPool = raw.filter(c => !manuallyClaimed.has(c.id));
  const autoGroups = _groupPkoCardsByAutoName(autoPool);
  const byCardId = new Map(raw.map(c => [c.id, c]));

  const entries = [];
  autoGroups.forEach(g => {
    const ov = overrideById.get(g.key);
    if (ov && ov.is_deleted) { overrideById.delete(g.key); return; }
    const extraCards = ov ? _pkoResolveManualCards(ov.manual_cards, byCardId) : [];
    entries.push({
      id: g.key, kind,
      displayName: (ov && ov.display_name) || g.displayName,
      image: (ov && ov.image_url) || (g.cards[0] && g.cards[0].image) || '',
      cards: [...g.cards, ...extraCards],
      isCustom: false,
    });
    overrideById.delete(g.key);
  });

  // Entrées purement manuelles restantes : custom, ou correction d'une clé
  // auto qui n'existe plus dans le catalogue courant (ex. après un
  // rafraîchissement où la carte source a disparu de TCGdex).
  overrideById.forEach(ov => {
    if (ov.is_deleted) return;
    const cards = _pkoResolveManualCards(ov.manual_cards, byCardId);
    entries.push({
      id: ov.id, kind,
      displayName: ov.display_name || '(sans nom)',
      image: ov.image_url || (cards[0] && cards[0].image) || '',
      cards, isCustom: true,
    });
  });

  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
}

// ── État & init (grille) ─────────────────────────────────────────────────
var PKO_KINDS = ['personnage', 'objet', 'lieu', 'energie'];
var PKO_ICON = { personnage: '🧑', objet: '🎒', lieu: '📍', energie: '⚡' };

const PKO_LABELS = {
  personnage: { title: 'Personnages', singular: 'personnage', color: '#6c5ce7', grid: 'personnages-grid', loadMore: 'personnages-load-more', loading: 'personnages-loading', error: 'personnages-error' },
  objet:      { title: 'Objets',      singular: 'objet',      color: '#00b894', grid: 'objets-grid',      loadMore: 'objets-load-more',      loading: 'objets-loading',      error: 'objets-error' },
  lieu:       { title: 'Lieux',       singular: 'lieu',       color: '#e17055', grid: 'lieux-grid',       loadMore: 'lieux-load-more',       loading: 'lieux-loading',       error: 'lieux-error' },
  energie:    { title: 'Énergies',    singular: 'énergie',    color: '#fdcb6e', grid: 'energies-grid',    loadMore: 'energies-load-more',    loading: 'energies-loading',    error: 'energies-error' },
};

var _pko = {
  catalog:     {}, entries: {}, filtered: {}, query: {}, page: {}, initialized: {}, loading: {},
  pageSize:    45,
};
PKO_KINDS.forEach(k => {
  _pko.catalog[k] = null; _pko.entries[k] = []; _pko.filtered[k] = []; _pko.query[k] = '';
  _pko.page[k] = 0; _pko.initialized[k] = false; _pko.loading[k] = false;
});

async function initPersonnages() { return _pkoInitTab('personnage'); }
async function initObjets()      { return _pkoInitTab('objet'); }
async function initLieux()       { return _pkoInitTab('lieu'); }
async function initEnergies()    { return _pkoInitTab('energie'); }

async function _pkoInitTab(kind, forceRefresh) {
  if (_pko.initialized[kind] && !forceRefresh) return;
  if (_pko.loading[kind]) return;
  const L = PKO_LABELS[kind];
  _pko.loading[kind] = true;
  const loadingEl = document.getElementById(L.loading);
  const errorEl   = document.getElementById(L.error);
  if (loadingEl) loadingEl.style.display = 'block';
  if (errorEl)   errorEl.style.display   = 'none';
  try {
    _pko.catalog[kind] = await _fetchTcgdexPkoCards(kind, forceRefresh);
    _pko.entries[kind]  = _pkoBuildEntries(kind);
    _pko.filtered[kind] = _pko.entries[kind];
    _pko.initialized[kind] = true;
    _pko.page[kind] = 0;
    if (loadingEl) loadingEl.style.display = 'none';
    _pkoRenderPage(kind, true);
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) { errorEl.style.display = 'block'; errorEl.textContent = 'Erreur : ' + err.message; }
  }
  _pko.loading[kind] = false;
}

// Recalcule les entrées à partir du catalogue déjà en mémoire (après une
// modification dans Édition) sans refaire le moindre appel réseau.
function _pkoRebuildEntries(kind) {
  if (!_pko.catalog[kind]) return;
  _pko.entries[kind] = _pkoBuildEntries(kind);
  const q = _pko.query[kind];
  _pko.filtered[kind] = q ? _pko.entries[kind].filter(e => _normalizeStr(e.displayName).includes(q)) : _pko.entries[kind];
  _pkoRenderPage(kind, true);
}

function _pkoRenderPage(kind, reset) {
  const L = PKO_LABELS[kind];
  const grid = document.getElementById(L.grid);
  if (!grid) return;
  if (reset) { grid.innerHTML = ''; _pko.page[kind] = 0; }

  const start = _pko.page[kind] * _pko.pageSize;
  const slice = _pko.filtered[kind].slice(start, start + _pko.pageSize);
  const loadMoreEl = document.getElementById(L.loadMore);

  if (!slice.length && _pko.page[kind] === 0) {
    grid.innerHTML = `<p style="padding:24px;color:var(--text2);text-align:center;grid-column:1/-1">Aucun${L.singular.startsWith('é') ? 'e' : ''} ${L.singular} trouvé${L.singular.startsWith('é') ? 'e' : ''}.</p>`;
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'pkdx-card';
    card.style.setProperty('--pkdx-color', L.color);
    card.onclick = () => openPkoModal(kind, entry.id);
    const nbCards = entry.cards.length;
    card.innerHTML = `
      <div class="pkdx-card-img-wrap">
        ${entry.image ? `<img src="${entry.image}" alt="${_escHtml(entry.displayName)}" loading="lazy" class="pkdx-sprite">` : '<div class="pkdx-no-sprite">?</div>'}
      </div>
      <div class="pkdx-card-name">${_escHtml(entry.displayName)}</div>
      <div class="pkdx-card-types"><span class="pkdx-type" style="background:${L.color}">${nbCards} carte${nbCards > 1 ? 's' : ''}</span></div>
    `;
    frag.appendChild(card);
  });
  grid.appendChild(frag);
  _pko.page[kind]++;

  const hasMore = _pko.page[kind] * _pko.pageSize < _pko.filtered[kind].length;
  if (loadMoreEl) loadMoreEl.style.display = hasMore ? 'block' : 'none';
}

function filterPersonnages(q) { _pkoFilter('personnage', q); }
function filterObjets(q)      { _pkoFilter('objet', q); }
function filterLieux(q)       { _pkoFilter('lieu', q); }
function filterEnergies(q)    { _pkoFilter('energie', q); }
function _pkoFilter(kind, q) {
  _pko.query[kind] = _normalizeStr(q || '');
  _pko.filtered[kind] = !_pko.query[kind]
    ? _pko.entries[kind]
    : _pko.entries[kind].filter(e => _normalizeStr(e.displayName).includes(_pko.query[kind]));
  _pkoRenderPage(kind, true);
}
function personnagesLoadMore() { _pkoRenderPage('personnage', false); }
function objetsLoadMore()      { _pkoRenderPage('objet', false); }
function lieuxLoadMore()       { _pkoRenderPage('lieu', false); }
function energiesLoadMore()    { _pkoRenderPage('energie', false); }

// ── Fiche détail — réutilise entièrement la modale Pokédex ─────────────────
// modal-pokedex / pkdx-modal-content / la section "Cartes TCG" et toute sa
// mécanique (_pkdxModalTcg, _renderPkdxTcgGroups, openCardDetailModal,
// saveCardEdits, deleteCardFromDb) sont RÉUTILISÉS tels quels — seule la
// partie "hero" change, et la source des cartes affichées (Supabase local,
// filtré différemment) change.
async function openPkoModal(kind, entryId) {
  const entry = (_pko.entries[kind] || []).find(e => e.id === entryId);
  if (!entry) return;
  const modal = document.getElementById('modal-pokedex');
  const inner = document.getElementById('pkdx-modal-content');
  const L = PKO_LABELS[kind];

  inner.innerHTML = `
    <div class="pkdx-modal-hero" style="--pkdx-color:${L.color}">
      <div class="pkdx-modal-hero-bg"></div>
      ${entry.image ? `<img src="${entry.image}" alt="${_escHtml(entry.displayName)}" class="pkdx-modal-sprite">` : ''}
      <div class="pkdx-modal-hero-info">
        <div class="pkdx-modal-num">${L.singular.charAt(0).toUpperCase() + L.singular.slice(1)}${entry.isCustom ? ' · entrée manuelle' : ''}</div>
        <h2 class="pkdx-modal-name">${_escHtml(entry.displayName)}</h2>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px"
          onclick="closeModal('modal-pokedex');switchView('edition');switchEditionTab('persoobjets');setTimeout(()=>pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}'),150)">
          ✎ Corriger dans Édition
        </button>
      </div>
    </div>
    <div class="pkdx-modal-body">
      ${_pkdxTcgSectionHtml()}
    </div>`;
  modal.classList.add('open');
  _pkoLoadLocalCards(kind, entry);
}

// Recherche les cartes POSSÉDÉES (table Supabase "cards") dont le nom
// contient, n'importe où, le nom canonique de l'entrée — à la différence de
// la fiche Pokémon (ancrée en préfixe), un Personnage/Objet/Lieu/Énergie
// peut apparaître n'importe où dans le titre ("Ordres de Sacha"). Se
// combinent, dans l'ordre :
//  1) une catégorie FORCÉE à la main (fiche carte → "Catégorie", ou Édition)
//     tranche directement, sans même regarder les noms connus ;
//  2) une correspondance EXACTE avec une carte du catalogue TCGdex de CETTE
//     catégorie l'emporte toujours — c'est la classification réelle de
//     TCGdex, la source la plus fiable qui soit. Sans ce cas, un Objet
//     nommé d'après un Personnage (ex. "Poké Poupée de Lillie") se faisait
//     exclure par la règle (4) ci-dessous alors qu'il est légitimement un
//     Objet ;
//  3) une correspondance EXACTE avec le catalogue d'une AUTRE catégorie
//     exclut directement (ex. cette même carte, vue depuis le Personnage
//     "Lillie", est bien reconnue comme n'étant PAS une carte "Lillie") ;
//  4) à défaut de correspondance exacte (carte hors catalogue TCGdex, faute
//     de frappe…), repli sur l'ancienne heuristique par noms connus
//     (Pokémon, puis les 3 autres catégories).
async function _fetchLocalCardsContainingName(name, kind, knownPokemonSet, knownOtherKindsSet) {
  const variants = _accentVariants(name);
  const orFilter = `or=(${variants.map(n => `name.ilike.*${encodeURIComponent(n)}*`).join(',')})`;
  const url = `${SB_URL}/rest/v1/cards?${orFilter}&order=set_id.asc,number.asc&limit=500`;
  const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const raw = await res.json();
  const nameTokens = _pkoNormTokens(name);

  const sameKindExact = new Set((_pko.catalog[kind] || []).map(c => _pkoNormTokens(c.name).join(' ')));
  const otherKindExact = new Set();
  PKO_KINDS.filter(k => k !== kind).forEach(k => (_pko.catalog[k] || []).forEach(c => otherKindExact.add(_pkoNormTokens(c.name).join(' '))));

  return raw.filter(c => {
    const cardTokens = _pkoNormTokens(c.name);
    if (!_tokensContainSeq(cardTokens, nameTokens)) return false;

    const forced = _cardCategoryOverride(c.id);
    if (forced) return forced === kind;

    const cardKey = cardTokens.join(' ');
    if (sameKindExact.has(cardKey))  return true;
    if (otherKindExact.has(cardKey)) return false;

    if (_cardNameMatchesKnown(c.name, knownPokemonSet) || _cardNameContainsKnown(c.name, knownPokemonSet)) return false;
    if (knownOtherKindsSet && _cardNameContainsKnown(c.name, knownOtherKindsSet)) return false;
    return true;
  });
}

// Fiche actuellement ouverte (Personnage, Objet, Lieu ou Énergie) — utilisé
// pour rafraîchir la liste de cartes affichée si une catégorie est forcée
// pendant que cette fiche est ouverte (voir setCardCategoryOverride).
var _pkoCurrentModal = null;

async function _pkoLoadLocalCards(kind, entry) {
  const grid = document.getElementById('pkdx-tcg-grid');
  const chip = document.getElementById('pkdx-tcg-filter-chip');
  _pkdxModalTcg = null;
  _pkoCurrentModal = { kind, entryId: entry.id };
  if (chip) chip.style.display = 'none';
  if (grid) grid.innerHTML = '<div style="color:var(--text2);font-size:.82rem;padding:4px 0">Chargement…</div>';
  try {
    // BUG corrigé : sans ceci, ouvrir directement une fiche (sans être passé
    // par le Pokédex avant, dans la même session) laissait
    // _buildKnownPokemonNameSet() renvoyer un ensemble VIDE — aucune carte
    // Pokémon n'était alors exclue, d'où des cartes comme "Carchacrok de
    // Cynthia" affichées à tort chez le Personnage "Cynthia".
    if (!_pkdx.initialized) await initPokedex();
    const otherKinds = PKO_KINDS.filter(k => k !== kind);
    // En parallèle (chaque catalogue passe de toute façon par la même file
    // throttled _tcgdexQueue, donc lancer les 3 en même temps ne sature pas
    // le réseau) plutôt qu'en séquence, pour ne pas cumuler les temps
    // d'attente au premier chargement à froid.
    await Promise.all(otherKinds.map(ok => _pko.initialized[ok] ? null : _pkoInitTab(ok)));

    const knownPokemon = _buildKnownPokemonNameSet();
    const knownOther = new Set();
    otherKinds.forEach(ok => (_pko.entries[ok] || []).forEach(e => _accentVariants(e.displayName).forEach(v => knownOther.add(v))));

    const cards = await _fetchLocalCardsContainingName(entry.displayName, kind, knownPokemon, knownOther);
    if (!document.getElementById('pkdx-tcg-grid')) return;
    if (!cards.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:.82rem">Aucune carte possédée trouvée.</p>'; return; }
    if (!_mapping.initialized) await initMappingView();
    const groups = _groupCardsByExtension(cards);
    const cardsById = new Map();
    cards.forEach(c => cardsById.set(String(c.id), c));
    _pkdxModalTcg = { frName: entry.displayName, groups, cardsById, filterExtIds: null };
    _renderPkdxTcgGroups();
  } catch (e) {
    if (grid) grid.innerHTML = '<p style="color:var(--accent2);font-size:.82rem">Erreur : ' + e.message + '</p>';
  }
}

// ── Catégorie forcée d'une carte (Pokémon / Objet / Personnage) ───────────
// Correction de dernier recours quand la détection par nom se trompe (ex.
// un Pokémon nommé d'après un Personnage, ou un Objet qui cite un
// Personnage dans son propre nom). Réglable depuis la fiche de n'importe
// quelle carte (sélecteur "Catégorie" dans la modale de détail, partagée
// par le Pokédex, les fiches Personnages/Objets ET Cartes orphelines).
function _cardCategoryOverride(cardId) {
  return (_D.card_category_overrides || {})[String(cardId)] || '';
}

function setCardCategoryOverride(cardId, category, opts) {
  if (!_D.card_category_overrides) _D.card_category_overrides = {};
  const key = String(cardId);
  if (category) _D.card_category_overrides[key] = category;
  else delete _D.card_category_overrides[key];
  saveData();

  // Recalcule le catalogue (rapide, en mémoire — n'affecte que le tri des
  // cartes déjà chargées, aucun appel réseau) puis rafraîchit la vue
  // actuellement ouverte, qui a pu charger cette carte AVANT le changement.
  PKO_KINDS.forEach(k => { if (_pko.initialized[k]) _pkoRebuildEntries(k); });
  if (_pkoCurrentModal) {
    const entry = (_pko.entries[_pkoCurrentModal.kind] || []).find(e => e.id === _pkoCurrentModal.entryId);
    if (entry) _pkoLoadLocalCards(_pkoCurrentModal.kind, entry);
  } else if (_pkdxModalTcg && _pkdxModalTcg.frName && typeof _loadTcgCardsInModal === 'function') {
    _loadTcgCardsInModal(_pkdxModalTcg.frName, _pkdxModalTcg.formType);
  }
  if (typeof _editionTab !== 'undefined' && _editionTab === 'orphans' && typeof refreshOrphanCardsList === 'function') {
    refreshOrphanCardsList();
  }

  // Avertit si forcer une catégorie ne suffira PAS à rendre la carte
  // trouvable quelque part : _fetchLocalCardsContainingName exige toujours
  // que le nom de la carte corresponde au nom d'une fiche existante — sans
  // ce nom qui matche, la carte disparaîtrait des Cartes orphelines sans
  // jamais apparaître ailleurs. On préfère prévenir tout de suite plutôt que
  // de laisser une carte devenir invisible silencieusement.
  if (category && category !== 'pokemon' && PKO_KINDS.includes(category) && opts && opts.cardName && typeof _cardNameContainsKnown === 'function') {
    const knownNames = new Set();
    (_pko.entries[category] || []).forEach(e => _accentVariants(e.displayName).forEach(v => knownNames.add(v)));
    if (!_cardNameContainsKnown(opts.cardName, knownNames)) {
      const label = PKO_LABELS[category].singular;
      toast(`Catégorie enregistrée, mais aucune fiche ${label.charAt(0).toUpperCase() + label.slice(1)} ne correspond encore au nom « ${opts.cardName} » — renomme la carte pour qu'elle contienne un nom connu, ou crée l'entrée manquante dans Édition.`, 'error');
      return;
    }
  }
  if (!opts || !opts.silent) toast('Catégorie mise à jour.', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════
//  Édition › Perso. & Objets — panneau de correction manuelle
// ═══════════════════════════════════════════════════════════════════════════
var _pkoEdit = { kind: 'personnage', query: '', editingId: null };

function switchPkoEditKind(kind) {
  _pkoEdit.kind = kind;
  _pkoEdit.query = '';
  const q = document.getElementById('pko-edit-search'); if (q) q.value = '';
  document.querySelectorAll('.pko-kind-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === kind));
  _pkoRenderEditionList();
}

function filterPkoEditionList(q) {
  _pkoEdit.query = _normalizeStr(q || '');
  _pkoRenderEditionList();
}

async function initPkoEditionView() {
  const kind = _pkoEdit.kind;
  if (!_pko.initialized[kind]) {
    const el = document.getElementById('pko-edit-list');
    if (el) el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2);font-size:.82rem">Chargement du catalogue TCGdex…</div>';
    await _pkoInitTab(kind);
  }
  // Précharge aussi les 3 autres catégories (nécessaires à l'exclusion
  // croisée + pour que changer de catégorie dans ce panneau soit instantané)
  // — en parallèle plutôt qu'en séquence pour ne pas cumuler l'attente.
  await Promise.all(PKO_KINDS.filter(k => k !== kind && !_pko.initialized[k]).map(k => _pkoInitTab(k)));
  _pkoRenderEditionList();
}

function refreshPkoCatalog() {
  if (!confirm('Recharger le catalogue TCGdex maintenant (au lieu d\'attendre le renouvellement automatique) ?')) return;
  toast('Rafraîchissement du catalogue en cours…', '');
  _pkoInitTab(_pkoEdit.kind, true).then(() => { _pkoRenderEditionList(); toast('Catalogue rafraîchi.', 'success'); });
}

function _pkoRenderEditionList() {
  const el = document.getElementById('pko-edit-list');
  const counter = document.getElementById('pko-edit-counter');
  if (!el) return;
  const kind = _pkoEdit.kind;
  let entries = _pko.entries[kind] || [];
  if (_pkoEdit.query) entries = entries.filter(e => _normalizeStr(e.displayName).includes(_pkoEdit.query));
  if (counter) counter.textContent = `${entries.length} entrée${entries.length > 1 ? 's' : ''}`;

  if (!entries.length) {
    el.innerHTML = '<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucune entrée.</p>';
    return;
  }

  const mode = _tabViewModes['persoobjets'] || 'grid';
  el.className = mode === 'grid' ? 'edition-grid' : '';
  el.innerHTML = entries.map(entry => mode === 'grid' ? _pkoEntryCardHtml(kind, entry) : _pkoEntryRowHtml(kind, entry)).join('');
}

function _pkoEntryRowHtml(kind, entry) {
  return `
    <div class="edition-ext-row" id="pko-row-${_escJs(entry.id)}">
      <div class="edition-ext-thumb" style="background:${PKO_LABELS[kind].color}22;border:1px solid ${PKO_LABELS[kind].color}44">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="edition-ext-info">
        <div class="edition-ext-name">${_escHtml(entry.displayName)}${entry.isCustom ? ' <span style="color:var(--text2);font-weight:400;font-size:.72rem">(manuelle)</span>' : ''}</div>
        <div class="edition-ext-meta">${entry.cards.length} carte${entry.cards.length > 1 ? 's' : ''} liée${entry.cards.length > 1 ? 's' : ''}</div>
      </div>
      <div class="edition-ext-actions">
        <button class="btn btn-icon btn-sm" title="Corriger" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">✎</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="pkoDeleteEntry('${_escJs(kind)}','${_escJs(entry.id)}',${entry.isCustom})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

function _pkoEntryCardHtml(kind, entry) {
  const color = PKO_LABELS[kind].color;
  return `
    <div class="edition-item-card" id="pko-card-${_escJs(entry.id)}" style="cursor:pointer" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">
      <div class="edition-card-thumb" style="border-bottom:3px solid ${color};background:${color}22">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="this.style.display='none'">` : `<span style="color:${color};font-size:1.4rem">${PKO_ICON[kind]}</span>`}
      </div>
      <div class="edition-card-body">
        <div class="edition-card-name">${_escHtml(entry.displayName)}${entry.isCustom ? ' <span style="color:var(--text2);font-weight:400;font-size:.72rem">(manuelle)</span>' : ''}</div>
        <div class="edition-card-meta">${entry.cards.length} carte${entry.cards.length > 1 ? 's' : ''} liée${entry.cards.length > 1 ? 's' : ''}</div>
      </div>
      <div class="edition-card-actions">
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();pkoDeleteEntry('${_escJs(kind)}','${_escJs(entry.id)}',${entry.isCustom})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ── Formulaire de correction — panneau fixé à droite, toujours visible même
// en scrollant (même principe que Blocs/Extensions : .edition-layout +
// .edition-form-card { position:sticky }), plutôt qu'une pop-up qui
// apparaît/disparaît. "Nouvelle entrée" et "Annuler" réinitialisent
// simplement le formulaire à l'état "création" au lieu de le masquer.
function pkoEditEntryOpen(kind, entryId) {
  switchView('edition', document.querySelector('[data-view="edition"]'));
  switchEditionTab('persoobjets');
  if (_pkoEdit.kind !== kind) switchPkoEditKind(kind);
  _pkoEdit.editingId = entryId;
  const entry = (_pko.entries[kind] || []).find(e => e.id === entryId);
  if (!entry) return;

  document.getElementById('pko-form-title').textContent = 'Corriger : ' + entry.displayName;
  document.getElementById('pko-form-name').value  = entry.displayName;
  document.getElementById('pko-form-image').value = entry.image || '';
  _pkoRenderFormCardsList(entry);
  document.getElementById('pko-form-search-results').innerHTML = '';
  const searchInp = document.getElementById('pko-form-card-search'); if (searchInp) searchInp.value = '';
  // Le panneau reste fixé à l'écran en scrollant (≥960px) — ce scroll ne sert
  // qu'à l'amener en vue sous 960px, où il repasse sous la liste (cf. CSS).
  document.getElementById('pko-edit-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pkoNewEntry() {
  _pkoEdit.editingId = null;
  document.getElementById('pko-form-title').textContent = 'Nouvelle entrée manuelle';
  document.getElementById('pko-form-name').value  = '';
  document.getElementById('pko-form-image').value = '';
  _pkoRenderFormCardsList(null);
  document.getElementById('pko-form-search-results').innerHTML = '';
  const searchInp = document.getElementById('pko-form-card-search'); if (searchInp) searchInp.value = '';
}

function pkoCancelForm() { pkoNewEntry(); }

function _pkoRenderFormCardsList(entry) {
  const el = document.getElementById('pko-form-cards');
  if (!el) return;
  const cards = entry ? entry.cards : [];
  el.innerHTML = cards.length
    ? cards.map(c => `
        <div class="pko-chip" title="${_escHtml(c.name)}">
          <div class="pko-chip-thumb">
            ${c.image ? `<img src="${c.image}" alt="">` : ''}
            <button type="button" onclick="pkoUnassignCard('${_escJs(c.id)}')" title="Retirer">×</button>
          </div>
          <div class="pko-chip-label">${_escHtml(c.name)}</div>
        </div>`).join('')
    : '<p style="color:var(--text2);font-size:.78rem">Aucune carte assignée pour l’instant.</p>';
}

// BUG corrigé : cette recherche se limitait au catalogue Personnages/Objets
// déjà chargé (donc, exactement comme le regroupement automatique, aux
// seules cartes Dresseur Supporter/Item de TCGdex). Or une entrée manuelle
// sert justement à couvrir ce que la détection automatique NE couvre PAS —
// Stade, Objet Spécial/Outil Pokémon, Énergie spéciale… — la limiter au même
// périmètre restreint la rendait incapable de jamais trouver ces cartes,
// même en tapant leur nom exact. On fait maintenant une recherche EN DIRECT
// sur TCGdex (name=… fait par défaut une recherche "contient", insensible à
// la casse, tous types de cartes confondus), avec un léger anti-rebond pour
// éviter une requête à chaque frappe.
var _pkoSearchDebounce = null;
function pkoSearchCatalogCards(q) {
  const el = document.getElementById('pko-form-search-results');
  if (!el) return;
  if (_pkoSearchDebounce) clearTimeout(_pkoSearchDebounce);
  const query = (q || '').trim();
  if (query.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = '<p style="color:var(--text2);font-size:.78rem">Recherche…</p>';
  _pkoSearchDebounce = setTimeout(() => _pkoDoSearchCatalogCards(query), 350);
}

async function _pkoDoSearchCatalogCards(query) {
  const el = document.getElementById('pko-form-search-results');
  if (!el) return; // formulaire refermé entretemps
  try {
    const res = await fetch(`https://api.tcgdex.net/v2/fr/cards?name=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    if (!document.getElementById('pko-form-search-results')) return;
    const matches = raw.slice(0, 30).map(c => ({ id: c.id, name: c.name, image: _tcgdexImgUrl(c.image) }));
    el.innerHTML = matches.map(c => `
      <div class="pko-chip" title="${_escHtml(c.name)}" onclick="pkoAssignCardManually('${_escJs(c.id)}','${_escJs(c.name)}','${_escJs(c.image)}')" style="cursor:pointer">
        <div class="pko-chip-thumb">${c.image ? `<img src="${c.image}" alt="">` : ''}</div>
        <div class="pko-chip-label">${_escHtml(c.name)}</div>
      </div>`).join('') || `<p style="color:var(--text2);font-size:.78rem">Aucun résultat pour « ${_escHtml(query)} ».</p>`;
  } catch (e) {
    el.innerHTML = `<p style="color:var(--accent2);font-size:.78rem">Erreur de recherche : ${_escHtml(e.message)}</p>`;
  }
}

function _pkoFindOrCreateOverride(id, kind, isNew) {
  if (!_D.perso_objets) _D.perso_objets = [];
  let ov = _D.perso_objets.find(o => o.id === id && o.kind === kind);
  if (!ov) {
    ov = { id, kind, display_name: '', image_url: '', manual_cards: [], is_custom: !!isNew, is_deleted: false, sort_order: _D.perso_objets.length };
    _D.perso_objets.push(ov);
  }
  if (!ov.manual_cards) ov.manual_cards = []; // compat overrides créés avant ce correctif
  return ov;
}

function pkoAssignCardManually(cardId, cardName, cardImage) {
  const kind = _pkoEdit.kind;
  const id = _pkoEdit.editingId || ('cpo_' + Date.now());
  const isNew = !_pkoEdit.editingId;
  const ov = _pkoFindOrCreateOverride(id, kind, isNew);
  if (!ov.manual_cards.some(mc => (typeof mc === 'string' ? mc : mc.id) === cardId)) {
    ov.manual_cards.push({ id: cardId, name: cardName || cardId, image: cardImage || '' });
  }
  _pkoEdit.editingId = id;
  saveData();
  _pkoRebuildEntries(kind);
  const entry = (_pko.entries[kind] || []).find(e => e.id === id);
  if (entry) _pkoRenderFormCardsList(entry);
  document.getElementById('pko-form-search-results').innerHTML = '';
  const searchInp = document.getElementById('pko-form-card-search'); if (searchInp) searchInp.value = '';
  toast('Carte assignée.', 'success');
}

function pkoUnassignCard(cardId) {
  const kind = _pkoEdit.kind;
  const id = _pkoEdit.editingId;
  if (!id) return;
  const ov = (_D.perso_objets || []).find(o => o.id === id && o.kind === kind);
  if (ov) ov.manual_cards = (ov.manual_cards || []).filter(mc => (typeof mc === 'string' ? mc : mc.id) !== cardId);
  saveData();
  _pkoRebuildEntries(kind);
  const entry = (_pko.entries[kind] || []).find(e => e.id === id);
  _pkoRenderFormCardsList(entry || null);
  toast('Carte retirée de cette entrée (redevient éligible au regroupement automatique).', 'success');
}

function pkoSaveEntry() {
  const kind = _pkoEdit.kind;
  const name  = document.getElementById('pko-form-name').value.trim();
  const image = document.getElementById('pko-form-image').value.trim();
  if (!name) { toast('Le nom est obligatoire.', 'error'); return; }

  const id = _pkoEdit.editingId || ('cpo_' + Date.now());
  const isNew = !_pkoEdit.editingId;
  const ov = _pkoFindOrCreateOverride(id, kind, isNew);
  ov.display_name = name;
  ov.image_url = image;
  saveData();
  _pkoRebuildEntries(kind);
  pkoCancelForm();
  toast(isNew ? 'Entrée créée !' : 'Entrée mise à jour.', 'success');
}

function pkoDeleteEntry(kind, entryId, isCustom) {
  if (!confirm(isCustom ? 'Supprimer définitivement cette entrée manuelle ?' : 'Masquer cette entrée du catalogue automatique ? (les cartes qui la composent redeviennent orphelines si aucune autre entrée ne les couvre)')) return;
  if (isCustom) {
    _D.perso_objets = (_D.perso_objets || []).filter(o => !(o.id === entryId && o.kind === kind));
  } else {
    const ov = _pkoFindOrCreateOverride(entryId, kind, false);
    ov.is_deleted = true;
  }
  if (_pkoEdit.editingId === entryId) pkoCancelForm();
  saveData();
  _pkoRebuildEntries(kind);
  toast('Entrée supprimée.', 'success');
}
