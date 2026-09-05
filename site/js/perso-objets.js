// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/perso-objets.js
//  Édition › Encyclopédies : Personnages / Objets / Lieux / Énergies —
//  SIMPLIFIÉ : plus aucune entrée n'est créée automatiquement depuis un
//  catalogue TCGdex. L'utilisateur crée une entrée (nom + image, dans
//  Édition), et l'appli lui rattache automatiquement toute carte POSSÉDÉE
//  dont le nom contient ce nom (n'importe où dans le titre, ex. créer
//  "Cynthia" récupère "Ordres de Cynthia", "Carte Cynthia"…). C'est tout :
//  pas de catalogue à charger, pas de regroupement automatique par "nom
//  canonique", pas de file d'attente TCGdex à throttler — ce fichier
//  n'appelle plus jamais TCGdex.
//
//  Ce fichier gère aussi Accessoires (voir PKO_EXTRA_KINDS ci-dessous) :
//  même formulaire nom + image, même stockage (_D.perso_objets), mais AUCUN
//  rattachement de carte — l'entrée est directement sélectionnable comme
//  article dans les modales Ventes/Achats (sleeves, classeurs, pages,
//  réductions…), voir js/ventes-achats.js (_cardPickerSelectAccessoireEntry).
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

// `needle` est-il un PRÉFIXE PROPRE de `haystack` (ses tokens correspondent
// exactement au tout début, aucun mot intercalé) ? Ex. "Lien Spirituel" est
// un préfixe propre de "Lien Spirituel Dracaufeu". Sert à distinguer un
// Objet/Personnage/Lieu/Énergie nommé "[Nom] [Pokémon]" (une vraie carte de
// cette catégorie — ex. les cartes "Lien Spirituel X", un Dresseur par Méga-
// Évolution) d'une carte qui matche juste par coïncidence quelque part dans
// un titre par ailleurs authentiquement Pokémon.
function _isCleanTokenPrefix(haystack, needle) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let i = 0; i < needle.length; i++) { if (haystack[i] !== needle[i]) return false; }
  return true;
}

// ── État & catégories ───────────────────────────────────────────────────
// PKO_KINDS = catégories qui RATTACHENT automatiquement des cartes possédées
// par correspondance de nom (Pokédex, cartes orphelines, compteur "cartes
// possédées", exclusion croisée…) — voir _pkoComputeOwnedCounts plus bas.
var PKO_KINDS = ['personnage', 'objet', 'lieu', 'energie'];
// PKO_EXTRA_KINDS = catégories qui vivent dans la même table _D.perso_objets
// et le même formulaire d'édition (nom + image) que ci-dessus, mais qui ne
// sont PAS des cartes à retrouver : "accessoire" couvre les autres types
// d'achats/ventes réutilisables (sleeves, classeurs, pages, réductions…),
// sélectionnables telles quelles (nom + image de la fiche) dans les modales
// Ventes/Achats — pas de rattachement de carte, pas de compteur "cartes
// possédées". Tenue à l'écart de PKO_KINDS pour ne jamais entrer dans la
// logique de rattachement/orphelines, qui n'a aucun sens pour ce genre
// d'article.
//
// NB : "Lot de cartes" n'est PAS ici — chaque lot étant différent à chaque
// fois, le cataloguer dans Édition n'aurait aucun intérêt (contrairement à
// un Accessoire, réutilisé tel quel d'une vente à l'autre). C'est un
// raccourci direct dans le sélecteur Ventes/Achats, géré entièrement dans
// ventes-achats.js (voir LOT_PKO_KEY / _cardPickerSelectLotDirect).
var PKO_EXTRA_KINDS = ['accessoire'];
// PKO_EDIT_KINDS = tout ce qui apparaît dans Édition › Encyclopédies (les 4
// catégories "cartes" + les catégories "articles").
var PKO_EDIT_KINDS = PKO_KINDS.concat(PKO_EXTRA_KINDS);
var PKO_ICON = { personnage: '🧑', objet: '🎒', lieu: '📍', energie: '⚡', accessoire: '📦' };

const PKO_LABELS = {
  personnage: { title: 'Personnages', singular: 'personnage', color: '#6c5ce7', grid: 'personnages-grid', loadMore: 'personnages-load-more' },
  objet:      { title: 'Objets',      singular: 'objet',      color: '#00b894', grid: 'objets-grid',      loadMore: 'objets-load-more' },
  lieu:       { title: 'Lieux',       singular: 'lieu',       color: '#e17055', grid: 'lieux-grid',       loadMore: 'lieux-load-more' },
  energie:    { title: 'Énergies',    singular: 'énergie',    color: '#fdcb6e', grid: 'energies-grid',    loadMore: 'energies-load-more' },
  // Pas de grid/loadMore : "Accessoires" n'a pas de vue "Pokédex" dédiée
  // dans la sidebar, seulement la liste de gestion dans Édition et le
  // sélecteur de carte Ventes/Achats (voir ventes-achats.js).
  accessoire: { title: 'Accessoires', singular: 'accessoire', color: '#00cec9' },
};

var _pko = { entries: {}, filtered: {}, query: {}, page: {}, initialized: {}, pageSize: 45 };
PKO_EDIT_KINDS.forEach(k => {
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
  // "Accessoires" (voir PKO_EXTRA_KINDS) n'a ni grille "Pokédex" dédiée ni
  // notion de "cartes possédées" : les entrées existent uniquement pour
  // Édition et le sélecteur Ventes/Achats, tous deux lus directement depuis
  // _pko.entries — rien à rendre ni calculer ici pour ces catégories.
  if (!PKO_KINDS.includes(kind)) return;
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
  if (PKO_KINDS.includes(kind)) {
    _pkoRenderPage(kind, true);
    _pkoScheduleOwnedCountsRecompute();
  }
  // BUG corrigé au passage : la liste d'Édition (#pko-edit-list) ne se
  // rafraîchissait jamais toute seule après Enregistrer/Dupliquer/Supprimer
  // (elle ne lisait que via switchPkoEditKind/initPkoEditionView) — on la
  // met à jour ici quand c'est bien la catégorie actuellement affichée dans
  // le formulaire d'Édition, pour toutes les catégories (y compris
  // Accessoires, qui n'a pas d'autre vue).
  if (_pkoEdit.kind === kind) _pkoRenderEditionList();
}

// Le recalcul des cartes possédées (_pkoComputeOwnedCounts) reste le plus
// gros coût de l'onglet : sans ça, créer/modifier/supprimer plusieurs
// entrées à la suite (ex. plusieurs "Enregistrer" rapprochés) relançait un
// passage complet sur toute la collection à CHAQUE fois. Débounce : un
// seul recalcul, 500ms après la DERNIÈRE modification plutôt qu'après
// chacune — la liste/grille elle-même reste mise à jour instantanément
// (_pkoRenderPage juste au-dessus), seul le recalcul des compteurs est
// différé et regroupé.
var _pkoOwnedCountsDebounceTimer = null;
function _pkoScheduleOwnedCountsRecompute() {
  if (_pkoOwnedCountsDebounceTimer) clearTimeout(_pkoOwnedCountsDebounceTimer);
  _pkoOwnedCountsDebounceTimer = setTimeout(() => {
    _pkoOwnedCountsDebounceTimer = null;
    _pkoComputeOwnedCounts()
      .then(() => PKO_KINDS.forEach(k => { if (_pko.initialized[k]) _pkoRenderPage(k, true); }))
      .catch(e => console.error('[PTCG] owned count', e));
  }, 500);
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
    // PERF corrigé : sur une table `cards` de plusieurs milliers de lignes,
    // l'ancienne boucle faisait UNE requête à la fois, en attendant chaque
    // réponse avant de lancer la suivante — des dizaines d'allers-retours
    // séquentiels vers le Pi (via Tailscale), pour la seule étape
    // "Chargement des cartes…" de l'écran de démarrage. On lit maintenant le
    // total exact dès la 1ère page (Content-Range, via Prefer: count=exact),
    // puis on lance toutes les pages restantes PAR LOTS EN PARALLÈLE
    // (au lieu d'une par une) — concurrence plafonnée pour ne pas saturer le
    // Pi (1 Go de RAM partagé entre Postgres/PostgREST/Caddy/etc.).
    const requestedSize = 2000;
    const baseUrl = `${SB_URL}/rest/v1/cards?select=id,name&order=name.asc`;
    const fetchPage = async (offset, size) => {
      try {
        const res = await _fetchTimeout(baseUrl, {
          headers: {
            apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
            'Range-Unit': 'items', 'Range': `${offset}-${offset + size - 1}`,
            'Prefer': 'count=exact',
          },
        });
        if (!res.ok) return { rows: [], total: null };
        const rows = await res.json();
        let total = null;
        const cr = res.headers.get('Content-Range'); // format "0-1999/12345"
        if (cr) { const m = cr.match(/\/(\d+)$/); if (m) total = parseInt(m[1], 10); }
        return { rows, total };
      } catch(_) { return { rows: [], total: null }; } // délai dépassé ou coupure réseau : cette page reste vide plutôt que de bloquer tout le catalogue
    };

    const first = await fetchPage(0, requestedSize);
    let allRows = first.rows.slice();
    const total    = first.total;
    // Taille RÉELLE renvoyée par le serveur — peut être plus petite que
    // requestedSize si PostgREST plafonne côté serveur ; on s'aligne dessus
    // pour que les offsets suivants ne sautent aucune ligne.
    const pageSize = first.rows.length || requestedSize;

    if (total && total > allRows.length && pageSize > 0) {
      const offsets = [];
      for (let o = pageSize; o < total; o += pageSize) offsets.push(o);
      const CONCURRENCY = 6;
      for (let i = 0; i < offsets.length; i += CONCURRENCY) {
        const batch   = offsets.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(o => fetchPage(o, pageSize)));
        results.forEach(r => { allRows = allRows.concat(r.rows); });
      }
    } else if (!total && first.rows.length === requestedSize) {
      // Repli séquentiel si le serveur ignore Prefer: count=exact (pas de
      // Content-Range dans la réponse) — comportement de l'ancien code,
      // uniquement en dernier recours.
      let offset = requestedSize;
      while (true) {
        const { rows } = await fetchPage(offset, requestedSize);
        if (!rows.length) break;
        allRows = allRows.concat(rows);
        if (rows.length < requestedSize) break;
        offset += requestedSize;
      }
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

    // PERF corrigé : _cardNameContainsKnown re-tokenisait CHAQUE chaîne du
    // set reçu à CHAQUE appel — appelée potentiellement plusieurs milliers
    // de fois par calcul (une fois par carte par candidate), ça revenait à
    // re-parser les mêmes noms connus encore et encore. Pré-tokenisés UNE
    // fois ici (ces sets ne changent pas pendant tout le calcul), plus
    // qu'une comparaison directe token-par-token ensuite (_tokensContainSeq).
    const knownPokemonTokenized = [];
    knownPokemon.forEach(s => { const t = _pkoNormTokens(s); if (t.length) knownPokemonTokenized.push(t); });
    const knownOtherTokenizedByKind = {};
    PKO_KINDS.forEach(kind => {
      const out = [];
      knownOtherByKind[kind].forEach(s => { const t = _pkoNormTokens(s); if (t.length) out.push(t); });
      knownOtherTokenizedByKind[kind] = out;
    });
    const containsAnyTokenized = (cardTokens, list) => {
      for (let i = 0; i < list.length; i++) { if (_tokensContainSeq(cardTokens, list[i])) return true; }
      return false;
    };

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
    const CHUNK = 150;
    for (let i = 0; i < cards.length; i += CHUNK) {
      cards.slice(i, i + CHUNK).forEach(c => {
        const cardTokens = _pkoNormTokens(c.name);
        if (!cardTokens.length) return;
        const candidates = new Set();
        cardTokens.forEach(t => { const arr = byFirstToken.get(t); if (arr) arr.forEach(x => candidates.add(x)); });
        if (!candidates.size) return;

        const forced = _cardCategoryOverride(c.id);
        // PERF corrigé : ces vérifications ne dépendent PAS de l'entrée
        // candidate testée (juste du nom de la carte) — calculées UNE
        // SEULE FOIS par carte ici, plutôt qu'une fois par candidate dans
        // la boucle ci-dessous (une carte au premier token ambigu peut
        // avoir plusieurs candidates, ce qui répétait ces vérifications
        // pour rien).
        // BUG corrigé : containsAnyTokenized (Pokémon connu N'IMPORTE OÙ
        // dans le titre) vivait ici, en exclusion GLOBALE de la carte —
        // une carte comme "Lien Spirituel Dracaufeu" (un Objet nommé
        // d'après un Pokémon, PAS une carte Pokémon) était donc exclue de
        // TOUTE fiche Personnage/Objet/Lieu/Énergie simplement parce que
        // "Dracaufeu" apparaît plus loin dans son titre — alors que ces
        // cartes existent bel et bien (les cartes "Lien Spirituel X" de
        // Méga-Évolution en sont un exemple réel). Descendue plus bas,
        // candidat par candidat, avec une exception : elle ne s'applique
        // plus quand l'entrée candidate est elle-même un PRÉFIXE PROPRE du
        // titre (_isCleanTokenPrefix) — un signal bien plus fiable que
        // "Dracaufeu apparaît quelque part" pour dire "ceci EST une vraie
        // carte Pokémon". _cardNameMatchesKnown et
        // _cardMatchesSomeLabeledPokemon restent ici tels quels : tous
        // deux sont déjà ancrés en tête de titre, donc déjà fiables sans
        // exception.
        let isKnownPokemon = false;
        if (!forced) {
          isKnownPokemon = _cardNameMatchesKnown(c.name, knownPokemon)
            || (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(c.name));
        }
        if (isKnownPokemon) return;

        const realMatches = []; // { entry, tokens, kind } — voir "la plus spécifique gagne" plus bas
        candidates.forEach(({ entry, tokens, kind }) => {
          if (!_tokensContainSeq(cardTokens, tokens)) return;
          if (forced) { if (forced === kind) realMatches.push({ entry, tokens, kind }); return; }
          if (!_isCleanTokenPrefix(cardTokens, tokens) && containsAnyTokenized(cardTokens, knownPokemonTokenized)) return;
          // Même exception que ci-dessus, appliquée à l'exclusion croisée
          // entre catégories (Personnage/Lieu/Énergie) : un Objet comme
          // "Sac" nommé en tête d'un titre "Sac de Nabil" ne doit pas être
          // écarté juste parce que "Nabil" (un Personnage enregistré)
          // apparaît plus loin dans ce même titre, connecté par une
          // particule ("de", "du"…). Le préfixe propre reste le signal fort
          // qui tranche : si CETTE entrée ouvre bien le titre, elle gagne.
          if (!_isCleanTokenPrefix(cardTokens, tokens) && containsAnyTokenized(cardTokens, knownOtherTokenizedByKind[kind])) return;
          realMatches.push({ entry, tokens, kind });
        });
        if (!realMatches.length) return;

        // Une carte comme "Super Potion" matche À LA FOIS "Potion" et
        // "Super Potion" si les deux fiches existent (le nom le plus court
        // est une sous-séquence du plus long) — ne créditer QUE la fiche la
        // plus SPÉCIFIQUE (le nom avec le plus de mots, donc le plus
        // précis) évite cette confusion. En cas d'égalité exacte de
        // longueur entre deux fiches différentes (rare, vraie ambiguïté),
        // les deux sont créditées faute de pouvoir trancher tout seul.
        const maxLen = Math.max(...realMatches.map(m => m.tokens.length));
        realMatches.filter(m => m.tokens.length === maxLen).forEach(m => { m.entry._ownedCount++; });
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

// Callback de repli pour une image d'entrée (Personnages/Objets/Lieux/
// Énergies/Accessoires) qui a définitivement échoué à charger après les
// tentatives de _nasImgRetry (core.js) — revient au même placeholder "?"
// que l'état "pas d'image" plutôt que de laisser un vide.
function _pkoImgGiveUp(img) {
  img.parentElement.innerHTML = '<div class="pkdx-no-sprite">?</div>';
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
        ${entry.image ? `<img src="${entry.image}" alt="${_escHtml(entry.displayName)}" loading="lazy" class="pkdx-sprite" onerror="_nasImgRetry(this,_pkoImgGiveUp)">` : '<div class="pkdx-no-sprite">?</div>'}
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
      ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="${_escHtml(entry.displayName)}" class="pkdx-modal-sprite" onerror="_nasImgRetry(this)">` : ''}
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

// Recherche les cartes POSSÉDÉES dont le nom contient, n'importe où, le nom
// de l'entrée — à la différence de la fiche Pokémon (ancrée en préfixe), un
// Personnage/Objet/Lieu/Énergie peut apparaître n'importe où dans le titre
// ("Ordres de Cynthia"). Se combinent, dans l'ordre :
//  1) une catégorie FORCÉE à la main (fiche carte → "Catégorie") tranche
//     directement — utile pour résoudre les rares ambiguïtés entre
//     catégories (ex. un Objet nommé d'après un Personnage) ;
//  2) exclusion Pokémon connu (y compris formes/labels EX/GX/V…) ;
//  3) exclusion croisée avec les 3 AUTRES catégories Personnage/Objet/Lieu/
//     Énergie (une carte qui matche aussi le nom d'une autre catégorie est
//     ambiguë sans forçage manuel — voir 1) ;
//  4) exclusion vis-à-vis d'une fiche SŒUR plus spécifique dans la MÊME
//     catégorie (ex. "Potion" ne récupère jamais les cartes "Super Potion"
//     si cette dernière fiche existe aussi — voir longerSiblings plus bas).
//
// BUG corrigé : cette fonction envoyait avant tout un filtre texte (ilike)
// AU SERVEUR pour ne récupérer qu'un sous-ensemble de cartes, puis
// réappliquait la comparaison JS (_tokensContainSeq) derrière — cette
// dernière est plus souple que le ilike littéral (accents/ponctuation/ordre
// des mots), si bien qu'une carte correctement reconnue par
// _pkoComputeOwnedCounts (qui lit TOUT le catalogue et ne compare qu'en JS,
// sans filtre serveur) pouvait ne jamais apparaître dans la fiche de son
// entrée : le ilike, trop littéral, la filtrait avant même que la
// comparaison JS (pourtant correcte) ait sa chance. On réutilise maintenant
// exactement la même source (_pkoAllLocalCards, déjà chargée pour le
// compteur) et exactement la même comparaison — le serveur n'est
// redemandé qu'ENSUITE, pour les détails (image, set, numéro…) des cartes
// déjà identifiées comme correspondantes, jamais pour filtrer par texte.
async function _fetchLocalCardsContainingName(name, kind, knownPokemonSet, knownOtherKindsSet) {
  await _pkoFetchAllLocalCards();
  const nameTokens = _pkoNormTokens(name);
  if (!nameTokens.length) return [];

  // Fiches SŒURS plus longues (même catégorie) — voir "la plus spécifique
  // gagne" dans _pkoComputeOwnedCounts : seule une fiche dont le nom compte
  // STRICTEMENT PLUS de mots peut "voler" une carte à celle-ci (ex. "Super
  // Potion" vole ses cartes à "Potion", jamais l'inverse). Cette fonction ne
  // connaît que l'entrée dont la fiche est ouverte, contrairement au calcul
  // du compteur qui voit toutes les entrées d'un coup — on doit donc lister
  // ici explicitement les sœurs plus spécifiques à vérifier.
  const longerSiblings = (_pko.entries[kind] || [])
    .filter(e => e.displayName !== name)
    .map(e => _pkoNormTokens(e.displayName))
    .filter(t => t.length > nameTokens.length);

  const matchedIds = [];
  (_pkoAllLocalCards || []).forEach(c => {
    const cardTokens = _pkoNormTokens(c.name);
    if (!cardTokens.length || !_tokensContainSeq(cardTokens, nameTokens)) return;

    const forced = _cardCategoryOverride(c.id);
    if (forced) { if (forced !== kind) return; }
    else {
      if (_cardNameMatchesKnown(c.name, knownPokemonSet)) return;
      if (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(c.name)) return;
      // BUG corrigé : _cardNameContainsKnown (Pokémon connu N'IMPORTE OÙ
      // dans le titre) excluait à tort les cartes comme "Lien Spirituel
      // Dracaufeu" (un Objet nommé d'après un Pokémon, PAS une carte
      // Pokémon) simplement parce que "Dracaufeu" apparaît plus loin dans
      // le titre — même correction que dans _pkoComputeOwnedCounts :
      // n'exclut plus quand CETTE entrée est elle-même un préfixe propre du
      // titre (_isCleanTokenPrefix), un signal bien plus fiable.
      if (!_isCleanTokenPrefix(cardTokens, nameTokens) && _cardNameContainsKnown(c.name, knownPokemonSet)) return;
      // Même exception que juste au-dessus (Pokémon), appliquée cette fois à
      // l'exclusion croisée Personnage/Objet/Lieu/Énergie : voir le
      // commentaire équivalent dans _pkoComputeOwnedCounts ("Sac de Nabil").
      if (knownOtherKindsSet && !_isCleanTokenPrefix(cardTokens, nameTokens) && _cardNameContainsKnown(c.name, knownOtherKindsSet)) return;
    }

    if (longerSiblings.some(t => _tokensContainSeq(cardTokens, t))) return; // volée par une fiche sœur plus précise
    matchedIds.push(c.id);
  });
  if (!matchedIds.length) return [];

  const idFilter = `id=in.(${matchedIds.map(id => encodeURIComponent(id)).join(',')})`;
  const url = `${SB_URL}/rest/v1/cards?${idFilter}&select=id,name,set_id,set_name,image_url,number,rarity,cardmarket_url&order=set_id.asc,number.asc`;
  const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return await res.json();
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
//  Édition › Encyclopédies (Personnages/Objets/Lieux/Énergies/Accessoires)
//  — création/correction manuelle
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
  await Promise.all(PKO_EDIT_KINDS.map(k => _pko.initialized[k] ? null : _pkoInitTab(k)));
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
  // "Accessoires" (voir PKO_EXTRA_KINDS) n'a pas de notion de "cartes
  // possédées" — pas de rattachement de carte, donc rien à compter.
  const isCardKind = PKO_KINDS.includes(kind);
  const nbCards = entry._ownedCount != null ? entry._ownedCount : '…';
  return `
    <div class="edition-ext-row" id="pko-row-${_escJs(entry.id)}">
      <div class="edition-ext-thumb" style="background:${PKO_LABELS[kind].color}22;border:1px solid ${PKO_LABELS[kind].color}44">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="_nasImgRetry(this)">` : ''}
      </div>
      <div class="edition-ext-info">
        <div class="edition-ext-name">${_escHtml(entry.displayName)}</div>
        ${isCardKind ? `<div class="edition-ext-meta">${nbCards} carte${nbCards === 1 ? '' : 's'} possédée${nbCards === 1 ? '' : 's'}</div>` : ''}
      </div>
      <div class="edition-ext-actions">
        <button class="btn btn-icon btn-sm" title="Corriger" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">✎</button>
        <button class="btn btn-icon btn-sm" title="Dupliquer" onclick="pkoDuplicateEntry('${_escJs(kind)}','${_escJs(entry.id)}')">⧉</button>
        <button class="btn btn-icon btn-sm btn-danger" title="Supprimer" onclick="pkoDeleteEntry('${_escJs(kind)}','${_escJs(entry.id)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// Callback de repli pour la vignette Édition en mode grille — revient à
// l'icône colorée de la catégorie (même état que "pas d'image") après
// échec définitif de _nasImgRetry.
function _pkoCardImgGiveUp(img, kind) {
  const color = PKO_LABELS[kind].color;
  img.outerHTML = `<span style="color:${color};font-size:1.4rem">${PKO_ICON[kind]}</span>`;
}

function _pkoEntryCardHtml(kind, entry) {
  const color = PKO_LABELS[kind].color;
  // "Accessoires" (voir PKO_EXTRA_KINDS) n'a pas de notion de "cartes
  // possédées" — pas de rattachement de carte, donc rien à compter.
  const isCardKind = PKO_KINDS.includes(kind);
  const nbCards = entry._ownedCount != null ? entry._ownedCount : '…';
  return `
    <div class="edition-item-card" id="pko-card-${_escJs(entry.id)}" style="cursor:pointer" onclick="pkoEditEntryOpen('${_escJs(kind)}','${_escJs(entry.id)}')">
      <div class="edition-card-thumb" style="border-bottom:3px solid ${color};background:${color}22">
        ${entry.image ? `<img src="${_escHtml(entry.image)}" alt="" onerror="_nasImgRetry(this,img=>_pkoCardImgGiveUp(img,'${_escJs(kind)}'))">` : `<span style="color:${color};font-size:1.4rem">${PKO_ICON[kind]}</span>`}
      </div>
      <div class="edition-card-body">
        <div class="edition-card-name">${_escHtml(entry.displayName)}</div>
        ${isCardKind ? `<div class="edition-card-meta">${nbCards} carte${nbCards === 1 ? '' : 's'} possédée${nbCards === 1 ? '' : 's'}</div>` : ''}
      </div>
      <div class="edition-card-actions">
        <button class="btn btn-icon btn-sm" title="Dupliquer" onclick="event.stopPropagation();pkoDuplicateEntry('${_escJs(kind)}','${_escJs(entry.id)}')">⧉</button>
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

// Id local unique — un simple Date.now() (utilisé avant) n'est pas garanti
// unique si deux entrées sont créées/dupliquées à la même milliseconde (cf.
// le commentaire sur _dedupeByKey dans sync.js) ; un suffixe aléatoire lève
// le doute, en particulier pour la duplication où deux clics rapprochés
// sont plus probables qu'en saisie manuelle.
function _pkoUniqueId() {
  return 'pko_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function pkoSaveEntry() {
  const kind = _pkoEdit.kind;
  const name  = document.getElementById('pko-form-name').value.trim();
  const image = document.getElementById('pko-form-image').value.trim();
  if (!name) { toast('Le nom est obligatoire.', 'error'); return; }

  if (!_D.perso_objets) _D.perso_objets = [];
  const isNew = !_pkoEdit.editingId;
  const id = _pkoEdit.editingId || _pkoUniqueId();

  // Empêche deux fiches de la même catégorie avec le même nom (comparaison
  // insensible à la casse/aux accents) — exclut l'entrée elle-même en cas
  // de correction (le nom peut rester inchangé). Sans ce garde-fou, deux
  // fiches "Sac" créent une ambiguïté silencieuse dans le rattachement de
  // cartes (laquelle des deux récupère "Sac Aventure" ?).
  const normName = _normalizeStr(name).trim();
  const dup = _D.perso_objets.find(o => o.kind === kind && o.id !== id && _normalizeStr(o.display_name || '').trim() === normName);
  if (dup) { toast(`Une entrée "${dup.display_name}" existe déjà dans cette catégorie.`, 'error'); return; }
  let ov = _D.perso_objets.find(o => o.id === id && o.kind === kind);
  if (!ov) { ov = { id, kind, sort_order: _D.perso_objets.length }; _D.perso_objets.push(ov); }
  ov.display_name = name;
  ov.image_url = image;
  saveData();
  _pkoRebuildEntries(kind);
  _pkoInvalidateOrphanCache();
  pkoCancelForm();
  const createdMsg = PKO_KINDS.includes(kind)
    ? 'Entrée créée ! Ses cartes possédées apparaissent automatiquement.'
    : 'Entrée créée ! Elle est maintenant sélectionnable dans Ventes/Achats.';
  toast(isNew ? createdMsg : 'Entrée mise à jour.', 'success');
}

// Duplique une entrée (nom + image) pour en créer rapidement une variante
// proche sans tout ressaisir (ex. plusieurs formes d'un même personnage) —
// ouvre directement le formulaire sur la copie pour n'avoir plus qu'à
// ajuster le nom/l'image puis Enregistrer.
function pkoDuplicateEntry(kind, entryId) {
  const ov = (_D.perso_objets||[]).find(o => o.id === entryId && o.kind === kind);
  if (!ov) return;
  if (!_D.perso_objets) _D.perso_objets = [];
  const newId = _pkoUniqueId();
  const copy = { ...ov, id: newId, display_name: (ov.display_name||'') + ' (copie)', sort_order: _D.perso_objets.length };
  _D.perso_objets.push(copy);
  saveData();
  _pkoRebuildEntries(kind);
  _pkoInvalidateOrphanCache();
  pkoEditEntryOpen(kind, newId);
  toast('Entrée dupliquée — ajuste le nom puis Enregistrer.', 'success');
}

function pkoDeleteEntry(kind, entryId) {
  const warn = PKO_KINDS.includes(kind)
    ? 'Supprimer cette entrée ? (ses cartes redeviennent orphelines si aucune autre entrée ne les couvre)'
    : 'Supprimer cette entrée ? (elle ne sera plus sélectionnable dans Ventes/Achats — les ventes/achats déjà enregistrés avec ne sont pas modifiés)';
  if (!confirm(warn)) return;
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

    // BUG corrigé : cette boucle marquait _pko.initialized[kind]=true SANS
    // jamais appeler _pkoRenderPage — la grille restait vide indéfiniment,
    // puisque _pkoInitTab (appelé à la première visite de l'onglet)
    // s'arrête immédiatement dès que _pko.initialized[kind] est déjà vrai
    // (voir son tout premier if). Les entrées existaient bien (visibles
    // dans Édition, qui lit directement _pko.entries) mais n'étaient
    // jamais rendues dans la grille — jusqu'à ce qu'une action modifie une
    // entrée et déclenche _pkoRebuildEntries, qui rend bien la grille, lui.
    for (const kind of PKO_KINDS) {
      if (!_pko.initialized[kind]) {
        _pko.entries[kind] = _pkoBuildEntries(kind);
        _pko.filtered[kind] = _pko.entries[kind];
        _pko.initialized[kind] = true;
      }
      _pkoRenderPage(kind, true);
      const n = _pko.entries[kind].length;
      _loadingLog(kind, '✓', PKO_LABELS[kind].title, `${n} entrée${n > 1 ? 's' : ''}`, 'ok');
      _loadingProgressTick();
    }

    // Un seul calcul combiné pour les 4 catégories (voir
    // _pkoComputeOwnedCounts) — c'est aussi ce qui, une fois passé par ici,
    // rend chaque première ouverture de fiche instantanée plutôt que de
    // devoir attendre ce calcul à ce moment-là.
    await _pkoComputeOwnedCounts();
    // Re-rendu après coup pour remplacer les badges "…" par le vrai
    // nombre de cartes possédées, maintenant calculé.
    PKO_KINDS.forEach(kind => _pkoRenderPage(kind, true));
    _loadingLog('owned', '✓', 'Cartes possédées', 'calculées', 'ok');
    _loadingProgressTick();
  } catch (e) {
    console.error('[PTCG] préchargement cartes :', e);
    _loadingLog('owned', '✗', 'Cartes possédées', e.message, 'err');
  }
}
