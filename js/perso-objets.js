// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/perso-objets.js
//  Personnages / Objets / Lieux / Énergies — SIMPLIFIÉ : plus aucune entrée
//  n'est créée automatiquement depuis un catalogue TCGdex. L'utilisateur
//  crée une entrée (nom + image, dans Édition), et l'appli lui rattache
//  automatiquement toute carte POSSÉDÉE dont le nom contient ce nom
//  (n'importe où dans le titre, ex. créer "Cynthia" récupère "Ordres de
//  Cynthia", "Carte Cynthia"…). C'est tout : pas de catalogue à charger, pas
//  de regroupement automatique par "nom canonique", pas de file d'attente
//  TCGdex à throttler — ce fichier n'appelle plus jamais TCGdex.
//
//  Ce fichier doit être chargé APRÈS pokedex.js, edition.js et
//  label-categories.js : il réutilise leurs briques (_pkdxTcgSectionHtml,
//  _groupCardsByExtension, _renderTcgCardGroupsHtml, _renderPkdxTcgGroups,
//  openCardDetailModal, _escHtml, _escJs, _normalizeStr, _accentVariants,
//  _cardNameMatchesKnown, _cardMatchesSomeLabeledPokemon,
//  _buildKnownPokemonNameSet…) au lieu de dupliquer la fiche détail / la
//  modale carte / le regroupement par extension.
// ═══════════════════════════════════════════════════════════════════════════

// Utilisé pour la correspondance nom -> cartes (recherche locale) et pour
// l'exclusion croisée entre catégories.
function _pkoNormTokens(name) {
  return _normalizeStr(name || '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Est-ce que la séquence `needle` apparaît, consécutive, quelque part dans
// `haystack` ? Comparaison par TOKENS ENTIERS (jamais une simple inclusion
// de sous-chaîne) pour ne jamais confondre un nom court avec un mot qui le
// contient par coïncidence (ex. "Ball" ne doit pas matcher "Poké Ball").
function _tokensContainSeq(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) { if (haystack[i + j] !== needle[j]) { ok = false; break; } }
    if (ok) return true;
  }
  return false;
}

// ── État & catégories ───────────────────────────────────────────────────
var PKO_KINDS = ['personnage', 'objet', 'lieu', 'energie'];
var PKO_ICON = { personnage: '🧑', objet: '🎒', lieu: '📍', energie: '⚡' };

const PKO_LABELS = {
  personnage: { title: 'Personnages', singular: 'personnage', color: '#6c5ce7', grid: 'personnages-grid', loadMore: 'personnages-load-more' },
  objet:      { title: 'Objets',      singular: 'objet',      color: '#00b894', grid: 'objets-grid',      loadMore: 'objets-load-more' },
  lieu:       { title: 'Lieux',       singular: 'lieu',       color: '#e17055', grid: 'lieux-grid',       loadMore: 'lieux-load-more' },
  energie:    { title: 'Énergies',    singular: 'énergie',    color: '#fdcb6e', grid: 'energies-grid',    loadMore: 'energies-load-more' },
};

var _pko = { entries: {}, filtered: {}, query: {}, page: {}, initialized: {}, pageSize: 45 };
PKO_KINDS.forEach(k => {
  _pko.entries[k] = []; _pko.filtered[k] = []; _pko.query[k] = ''; _pko.page[k] = 0; _pko.initialized[k] = false;
});

// Construit les entrées d'une catégorie directement depuis _D.perso_objets
// (nom + image saisis à la main dans Édition) — plus aucun catalogue à
// fusionner, ce qui rend cette fonction synchrone et quasi instantanée.
function _pkoBuildEntries(kind) {
  return (_D.perso_objets || [])
    .filter(o => o.kind === kind)
    .map(o => ({ id: o.id, kind, displayName: o.display_name || '(sans nom)', image: o.image_url || '' }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
}

async function initPersonnages() { return _pkoInitTab('personnage'); }
async function initObjets()      { return _pkoInitTab('objet'); }
async function initLieux()       { return _pkoInitTab('lieu'); }
async function initEnergies()    { return _pkoInitTab('energie'); }

async function _pkoInitTab(kind) {
  if (_pko.initialized[kind]) return;
  _pko.entries[kind] = _pkoBuildEntries(kind);
  _pko.filtered[kind] = _pko.entries[kind];
  _pko.initialized[kind] = true;
  _pko.page[kind] = 0;
  _pkoRenderPage(kind, true);
  // Nombre de cartes possédées par fiche (asynchrone, pas bloquant pour
  // l'affichage initial de la grille — voir _pkoComputeOwnedCounts) :
  // recalcule puis rafraîchit une fois prêt.
  _pkoComputeOwnedCounts().then(() => _pkoRenderPage(kind, true)).catch(e => console.error('[PTCG] owned count', e));
}

// Recalcule les entrées depuis _D.perso_objets (après une modification dans
// Édition) — toujours synchrone maintenant, plus de catalogue à refaire.
function _pkoRebuildEntries(kind) {
  _pko.entries[kind] = _pkoBuildEntries(kind);
  const q = _pko.query[kind];
  _pko.filtered[kind] = q ? _pko.entries[kind].filter(e => _normalizeStr(e.displayName).includes(q)) : _pko.entries[kind];
  _pkoRenderPage(kind, true);
  _pkoComputeOwnedCounts().then(() => _pkoRenderPage(kind, true)).catch(e => console.error('[PTCG] owned count', e));
}

// Cache partagé de TOUTES les cartes possédées (indépendant de la
// catégorie, un seul fetch réutilisé par Personnages/Objets/Lieux/
// Énergies) — sert à calculer le nombre de cartes possédées par fiche
// (badge de la grille) sans une requête réseau par fiche.
//
// BUG corrigé : rien n'empêchait plusieurs appels concurrents (ex.
// refreshPkoOwnedCounts lance _pkoComputeOwnedCounts pour les 4 catégories
// EN MÊME TEMPS après avoir vidé le cache) de déclencher chacun leur PROPRE
// fetch complet de toute la collection en parallèle — 4 fetches paginés
// redondants au lieu d'un seul. _pkoFetchAllLocalCardsPromise fait
// maintenant partager la MÊME requête en cours à tout appelant concurrent.
var _pkoAllLocalCards = null;
var _pkoFetchAllLocalCardsPromise = null;
async function _pkoFetchAllLocalCards(forceRefresh) {
  if (_pkoAllLocalCards && !forceRefresh) return _pkoAllLocalCards;
  if (_pkoFetchAllLocalCardsPromise) return _pkoFetchAllLocalCardsPromise;
  _pkoFetchAllLocalCardsPromise = (async () => {
    let allRows = [], offset = 0, pageSize = 1000;
    while (true) {
      const res = await fetch(
        `${SB_URL}/rest/v1/cards?select=id,name&order=name.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', 'Range': `${offset}-${offset+pageSize-1}` } }
      );
      if (!res.ok) break;
      const rows = await res.json();
      if (!rows.length) break;
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }
    _pkoAllLocalCards = allRows;
    return allRows;
  })();
  try { return await _pkoFetchAllLocalCardsPromise; }
  finally { _pkoFetchAllLocalCardsPromise = null; }
}

// BUG corrigé (gel complet du navigateur, "Page ne répondant pas") : cette
// fonction était appelée UNE FOIS PAR CATÉGORIE, et refreshPkoOwnedCounts
// lançait les 4 appels EN MÊME TEMPS (Promise.all) — chacun refaisant tout
// seul un passage synchrone complet sur toute la collection locale, sans
// aucun point de reprise. Sur une grosse collection (plusieurs milliers de
// cartes), 4 passages synchrones complets lancés en même temps bloquaient
// le thread principal assez longtemps pour que le navigateur affiche "Page
// ne répondant pas" — JS est mono-thread, un calcul synchrone sans await à
// l'intérieur de la boucle ne laisse aucune chance au navigateur de
// respirer pendant qu'il tourne.
//
// Corrigé par : (1) un seul passage combiné sur la collection calculant les
// 4 catégories à la fois, au lieu de 4 passages redondants ; (2) un verrou
// qui met en attente un seul recalcul de rattrapage pour les appels
// concurrents plutôt que d'empiler des calculs en parallèle (même principe
// que _pushRerunNeeded dans sync.js) ; (3) la collection est traitée par
// PAQUETS avec une pause (setTimeout 0) entre chaque, pour rendre la main
// au navigateur régulièrement — le calcul total prend un peu plus de temps
// "horloge murale" mais ne bloque plus jamais l'affichage ni les clics,
// quelle que soit la taille de la collection.
var _pkoOwnedCountsComputing = false;
var _pkoOwnedCountsRerunNeeded = false;
async function _pkoComputeOwnedCounts() {
  if (_pkoOwnedCountsComputing) { _pkoOwnedCountsRerunNeeded = true; return; }
  _pkoOwnedCountsComputing = true;
  try {
    await _pkoFetchAllLocalCards();
    if (!_pkdx.initialized) await initPokedex();
    await Promise.all(PKO_KINDS.map(k => _pko.initialized[k] ? null : _pkoInitTab(k)));

    const knownPokemon = _buildKnownPokemonNameSet();
    const knownByKind = {};
    PKO_KINDS.forEach(k => {
      knownByKind[k] = new Set();
      (_pko.entries[k] || []).forEach(e => _accentVariants(e.displayName).forEach(v => knownByKind[k].add(v)));
    });
    const knownOtherByKind = {};
    PKO_KINDS.forEach(kind => {
      const s = new Set();
      PKO_KINDS.filter(k => k !== kind).forEach(ok => knownByKind[ok].forEach(v => s.add(v)));
      knownOtherByKind[kind] = s;
    });

    // Index de TOUTES les entrées, TOUTES catégories confondues, par
    // premier token du nom — une seule structure pour le passage combiné.
    const byFirstToken = new Map();
    PKO_KINDS.forEach(kind => {
      (_pko.entries[kind] || []).forEach(e => {
        e._ownedCount = 0;
        const tokens = _pkoNormTokens(e.displayName);
        if (!tokens.length) return;
        const key = tokens[0];
        if (!byFirstToken.has(key)) byFirstToken.set(key, []);
        byFirstToken.get(key).push({ entry: e, tokens, kind });
      });
    });

    const cards = _pkoAllLocalCards || [];
    const CHUNK = 300;
    for (let i = 0; i < cards.length; i += CHUNK) {
      cards.slice(i, i + CHUNK).forEach(c => {
        const cardTokens = _pkoNormTokens(c.name);
        if (!cardTokens.length) return;
        const candidates = new Set();
        cardTokens.forEach(t => { const arr = byFirstToken.get(t); if (arr) arr.forEach(x => candidates.add(x)); });
        if (!candidates.size) return;

        const forced = _cardCategoryOverride(c.id);
        candidates.forEach(({ entry, tokens, kind }) => {
          if (!_tokensContainSeq(cardTokens, tokens)) return;
          if (forced) { if (forced === kind) entry._ownedCount++; return; }

          if (_cardNameMatchesKnown(c.name, knownPokemon) || _cardNameContainsKnown(c.name, knownPokemon)) return;
          if (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(c.name)) return;
          if (_cardNameContainsKnown(c.name, knownOtherByKind[kind])) return;
          entry._ownedCount++;
        });
      });
      // Rend la main au navigateur entre chaque paquet — c'est ce point de
      // reprise qui évite le gel, même sur une collection de plusieurs
      // milliers de cartes.
      if (i + CHUNK < cards.length) await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    _pkoOwnedCountsComputing = false;
  }
  if (_pkoOwnedCountsRerunNeeded) {
    _pkoOwnedCountsRerunNeeded = false;
    await _pkoComputeOwnedCounts(); // rattrape une demande arrivée pendant le calcul en cours
  }
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
    grid.innerHTML = `<p style="padding:24px;color:var(--text2);text-align:center;grid-column:1/-1">Aucun${L.singular.startsWith('é') ? 'e' : ''} ${L.singular} créé${L.singular.startsWith('é') ? 'e' : ''} pour l'instant — direction Édition pour en ajouter.</p>`;
    if (loadMoreEl) loadMoreEl.style.display = 'none';
    return;
  }

  const frag = document.createDocumentFragment();
  slice.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'pkdx-card';
    card.style.setProperty('--pkdx-color', L.color);
    card.onclick = () => openPkoModal(kind, entry.id);
    const nbCards = entry._ownedCount != null ? entry._ownedCount : '…';
    card.innerHTML = `
      <div class="pkdx-card-img-wrap">
        ${entry.image ? `<img src="${entry.image}" alt="${_escHtml(entry.displayName)}" loading="lazy" class="pkdx-sprite">` : '<div class="pkdx-no-sprite">?</div>'}
      </div>
      <div class="pkdx-card-name">${_escHtml(entry.displayName)}</div>
      <div class="pkdx-card-types"><span class="pkdx-type" style="background:${L.color}">${nbCards} carte${nbCards === 1 ? '' : 's'}</span></div>
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
async function openPkoModal(kind, entryId) {
  const entry = (_pko.entries[kind] || []).find(e => e.id === entryId);
  if (!entry) return;
  const modal = document.getElementById('modal-pokedex');
  const inner = document.getElementById('pkdx-modal-content');
  const L = PKO_LABELS[kind];

  inner.innerHTML = `
    <div class="pkdx-modal-hero" style="--pkdx-color:${L.color}">
      <div class="pkdx-modal-hero-bg"></div>
      ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="${_escHtml(entry.displayName)}" class="pkdx-modal-sprite">` : ''}
      <div class="pkdx-modal-hero-info">
        <div class="pkdx-modal-num">${L.singular.charAt(0).toUpperCase() + L.singular.slice(1)}</div>
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
// contient, n'importe où, le nom de l'entrée — à la différence de la fiche
// Pokémon (ancrée en préfixe), un Personnage/Objet/Lieu/Énergie peut
// apparaître n'importe où dans le titre ("Ordres de Cynthia"). Se
// combinent, dans l'ordre :
//  1) une catégorie FORCÉE à la main (fiche carte → "Catégorie") tranche
//     directement — utile pour résoudre les rares ambiguïtés entre
//     catégories (ex. un Objet nommé d'après un Personnage) ;
//  2) exclusion Pokémon connu (y compris formes/labels EX/GX/V…) ;
//  3) exclusion croisée avec les 3 AUTRES catégories Personnage/Objet/Lieu/
//     Énergie (une carte qui matche aussi le nom d'une autre catégorie est
//     ambiguë sans forçage manuel — voir 1).
async function _fetchLocalCardsContainingName(name, kind, knownPokemonSet, knownOtherKindsSet) {
  const variants = _accentVariants(name);
  const orFilter = `or=(${variants.map(n => `name.ilike.*${encodeURIComponent(n)}*`).join(',')})`;
  const url = `${SB_URL}/rest/v1/cards?${orFilter}&order=set_id.asc,number.asc&limit=500`;
  const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const raw = await res.json();
  const nameTokens = _pkoNormTokens(name);

  return raw.filter(c => {
    const cardTokens = _pkoNormTokens(c.name);
    if (!_tokensContainSeq(cardTokens, nameTokens)) return false;

    const forced = _cardCategoryOverride(c.id);
    if (forced) return forced === kind;

    if (_cardNameMatchesKnown(c.name, knownPokemonSet) || _cardNameContainsKnown(c.name, knownPokemonSet)) return false;
    if (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(c.name)) return false;
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
    if (!_pkdx.initialized) await initPokedex();
    const otherKinds = PKO_KINDS.filter(k => k !== kind);
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

// ── Catégorie forcée d'une carte (Pokémon / Personnage / Objet / Lieu /
// Énergie) — sert à trancher les rares ambiguïtés entre catégories, ou
// entre une catégorie et le Pokédex, sans jamais avoir besoin d'un
// catalogue. Réglable depuis la fiche de n'importe quelle carte.
function _cardCategoryOverride(cardId) {
  return (_D.card_category_overrides || {})[String(cardId)] || '';
}

function setCardCategoryOverride(cardId, category, opts) {
  if (!_D.card_category_overrides) _D.card_category_overrides = {};
  const key = String(cardId);
  if (category) _D.card_category_overrides[key] = category;
  else delete _D.card_category_overrides[key];
  saveData();

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
  // trouvable quelque part : la recherche exige toujours que le nom de la
  // carte corresponde au nom d'une fiche existante.
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
//  Édition › Perso., Objets, Lieux & Énergies — création/correction manuelle
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
  await Promise.all(PKO_KINDS.map(k => _pko.initialized[k] ? null : _pkoInitTab(k)));
  _pkoRenderEditionList();
}

// Recalcule les cartes possédées (utile après avoir ajouté des cartes à la
// collection ailleurs dans l'appli, pour que les compteurs se mettent à
// jour sans recharger la page).
function refreshPkoOwnedCounts() {
  toast('Recalcul des cartes possédées…', '');
  _pkoAllLocalCards = null;
  // BUG corrigé (gel du navigateur) : lançait _pkoComputeOwnedCounts 4 fois
  // EN MÊME TEMPS (une par catégorie), chacune relançant tout seule un
  // fetch complet de la collection ET un passage synchrone complet dessus
  // — un seul appel suffit maintenant, il couvre déjà les 4 catégories en
  // une seule passe chunkée (voir _pkoComputeOwnedCounts).
  _pkoComputeOwnedCounts().then(() => {
    PKO_KINDS.forEach(k => { if (_pko.initialized[k]) _pkoRenderPage(k, true); });
    _pkoRenderEditionList();
    toast('Recalculé.', 'success');
  });
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
    el.innerHTML = '<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucune entrée — crée-en une avec le formulaire à droite.</p>';
    return;
  }

  const mode = _tabViewModes['persoobjets'] || 'grid';
  el.className = mode === 'grid' ? 'edition-grid' : '';
  el.innerHTML = entries.map(entry => mode === 'grid' ? _pkoEntryCardHtml(kind, entry) : _pkoEntryRowHtml(kind, entry)).join('');
}

function _pkoEntryRowHtml(kind, entry) {
  const nbCards = entry._ownedCount != null ? entry._ownedCount : '…';
  return `
    <div class="edition-ext-row" id="pko-row-${_escJs(entry.id)}">
      <div class="edition-ext-thumb" style="background:${PKO_LABELS[kind].color}22;border:1px solid ${PKO_LABELS[kind].color}44">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="this.style.display='none'">` : ''}
      </div>
      <div class="edition-ext-info">
        <div class="edition-ext-name">${_escHtml(entry.displayName)}</div>
        <div class="edition-ext-meta">${nbCards} carte${nbCards === 1 ? '' : 's'} possédée${nbCards === 1 ? '' : 's'}</div>
      </div>
      <div class="edition-ext-actions">
        <button class="btn btn-icon btn-sm" title="Corriger" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">✎</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="pkoDeleteEntry('${_escJs(kind)}','${_escJs(entry.id)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

function _pkoEntryCardHtml(kind, entry) {
  const color = PKO_LABELS[kind].color;
  const nbCards = entry._ownedCount != null ? entry._ownedCount : '…';
  return `
    <div class="edition-item-card" id="pko-card-${_escJs(entry.id)}" style="cursor:pointer" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">
      <div class="edition-card-thumb" style="border-bottom:3px solid ${color};background:${color}22">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="this.style.display='none'">` : `<span style="color:${color};font-size:1.4rem">${PKO_ICON[kind]}</span>`}
      </div>
      <div class="edition-card-body">
        <div class="edition-card-name">${_escHtml(entry.displayName)}</div>
        <div class="edition-card-meta">${nbCards} carte${nbCards === 1 ? '' : 's'} possédée${nbCards === 1 ? '' : 's'}</div>
      </div>
      <div class="edition-card-actions">
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="event.stopPropagation();pkoDeleteEntry('${_escJs(kind)}','${_escJs(entry.id)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// ── Formulaire — panneau fixé à droite, toujours visible même en scrollant
// (même principe que Blocs/Extensions : .edition-layout + .edition-form-card
// { position:sticky }). "Nouvelle entrée" et "Annuler" réinitialisent
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
  // Le panneau reste fixé à l'écran en scrollant (≥960px) — ce scroll ne
  // sert qu'à l'amener en vue sous 960px, où il repasse sous la liste.
  document.getElementById('pko-edit-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pkoNewEntry() {
  _pkoEdit.editingId = null;
  document.getElementById('pko-form-title').textContent = 'Nouvelle entrée';
  document.getElementById('pko-form-name').value  = '';
  document.getElementById('pko-form-image').value = '';
}

function pkoCancelForm() { pkoNewEntry(); }

function pkoSaveEntry() {
  const kind = _pkoEdit.kind;
  const name  = document.getElementById('pko-form-name').value.trim();
  const image = document.getElementById('pko-form-image').value.trim();
  if (!name) { toast('Le nom est obligatoire.', 'error'); return; }

  if (!_D.perso_objets) _D.perso_objets = [];
  const isNew = !_pkoEdit.editingId;
  const id = _pkoEdit.editingId || ('pko_' + Date.now());
  let ov = _D.perso_objets.find(o => o.id === id && o.kind === kind);
  if (!ov) { ov = { id, kind, sort_order: _D.perso_objets.length }; _D.perso_objets.push(ov); }
  ov.display_name = name;
  ov.image_url = image;
  saveData();
  _pkoRebuildEntries(kind);
  _pkoInvalidateOrphanCache();
  pkoCancelForm();
  toast(isNew ? 'Entrée créée ! Ses cartes possédées apparaissent automatiquement.' : 'Entrée mise à jour.', 'success');
}

function pkoDeleteEntry(kind, entryId) {
  if (!confirm('Supprimer cette entrée ? (ses cartes redeviennent orphelines si aucune autre entrée ne les couvre)')) return;
  _D.perso_objets = (_D.perso_objets || []).filter(o => !(o.id === entryId && o.kind === kind));
  if (_pkoEdit.editingId === entryId) pkoCancelForm();
  saveData();
  _pkoRebuildEntries(kind);
  _pkoInvalidateOrphanCache();
  toast('Entrée supprimée.', 'success');
}

// Une entrée supprimée/renommée/créée change ce qui est "couvert" pour la
// détection des Cartes orphelines (_orphanCards.pkoKnownSet, construit à
// partir de _pko.entries) — sans invalidation, la liste restait figée sur
// son état d'avant la modification. Si l'onglet est ouvert, on relance le
// calcul tout de suite ; sinon on se contente d'invalider pour qu'il se
// relance à la prochaine ouverture plutôt que de garder un résultat périmé.
function _pkoInvalidateOrphanCache() {
  if (typeof _orphanCards === 'undefined') return;
  _orphanCards.initialized = false;
  if (typeof _editionTab !== 'undefined' && _editionTab === 'orphans' && typeof initOrphanCardsView === 'function') {
    initOrphanCardsView();
  }
}

// ── Préchargement pendant l'écran de chargement initial ────────────────────
// Charge le Pokédex + les 4 catégories (Personnages/Objets/Lieux/Énergies) +
// leurs cartes possédées PENDANT l'écran de chargement du démarrage, plutôt
// qu'à la demande à la première visite de chaque onglet — c'est ce qui
// évite un temps d'attente à chaque fois qu'on regarde pour la première
// fois les cartes d'un Pokémon/Personnage/Objet/Lieu/Énergie dans la
// session. Appelé depuis _cloudInitialSync (sync.js), qui attend que cette
// fonction se termine avant de retirer l'écran de chargement — même barre
// de progression que la récupération cloud, pas un chargement séparé (voir
// le calcul du total dans _cloudInitialSync).
async function _preloadCardCatalogs() {
  _loadingTitle('Chargement des cartes…');
  try {
    if (!_pkdx.initialized) await initPokedex();
    _loadingLog('pokedex', '✓', 'Pokédex', (_pkdx.all || []).length + ' entrées', 'ok');
    _loadingProgressTick();

    for (const kind of PKO_KINDS) {
      if (!_pko.initialized[kind]) {
        _pko.entries[kind] = _pkoBuildEntries(kind);
        _pko.filtered[kind] = _pko.entries[kind];
        _pko.initialized[kind] = true;
      }
      const n = _pko.entries[kind].length;
      _loadingLog(kind, '✓', PKO_LABELS[kind].title, `${n} entrée${n > 1 ? 's' : ''}`, 'ok');
      _loadingProgressTick();
    }

    // Un seul calcul combiné pour les 4 catégories (voir
    // _pkoComputeOwnedCounts) — c'est aussi ce qui, une fois passé par ici,
    // rend chaque première ouverture de fiche instantanée plutôt que de
    // devoir attendre ce calcul à ce moment-là.
    await _pkoComputeOwnedCounts();
    _loadingLog('owned', '✓', 'Cartes possédées', 'calculées', 'ok');
    _loadingProgressTick();
  } catch (e) {
    console.error('[PTCG] préchargement cartes :', e);
    _loadingLog('owned', '✗', 'Cartes possédées', e.message, 'err');
  }
}
