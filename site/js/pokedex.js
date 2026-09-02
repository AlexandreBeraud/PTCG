// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/pokedex.js
//  Pokédex — grille, fiche détail, formes, cartes TCG, évolutions
// ═══════════════════════════════════════════════════════════════════════════

// PokeAPI renvoie lui-même ses URLs de sprites pointant vers
// raw.githubusercontent.com, qui limite très vite le nombre de requêtes
// (429) dès qu'on affiche beaucoup de Pokémon d'un coup (grille complète).
// On les fait plutôt passer par cdn.jsdelivr.net, un miroir du même dépôt
// GitHub avec des quotas beaucoup plus généreux et un vrai cache CDN — même
// image, juste un domaine différent.
function _spriteUrl(url) {
  if (!url) return url;
  return url.replace(
    'https://raw.githubusercontent.com/PokeAPI/sprites/master/',
    'https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/'
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Source des sprites : Official Art (PokeAPI, par défaut) ou "Home" (NAS
//  FileBrowser) — réglage global Paramètres › Affichage. Utilisé partout où
//  un sprite Pokémon est affiché (Pokédex ET Ventes/Achats).
// ═══════════════════════════════════════════════════════════════════════════
function _spriteSourceMode() {
  return (_D.settings && _D.settings.sprite_source) || 'official';
}

// URL du sprite sur le NAS : {base}/{gen}G/{id sur 4 chiffres}[_XX].png?...
// dexId = TOUJOURS le numéro de Pokédex de l'espèce de BASE, même pour une
// forme (ex. Ogerpon Masque du Puits → 1017_01.png, pas 10273_...). formIndex
// = position (1-indexée) de la forme dans species.varieties hors variante
// par défaut, telle que rangée sur le NAS.
function _nasSpriteUrl(dexId, formIndex) {
  const cfg = window.__PC_NAS_SPRITES__;
  if (!cfg || !cfg.base || !dexId) return null;
  const gen = _pkdxGenForId(dexId);
  if (!gen) return null;
  const idStr  = String(dexId).padStart(4, '0');
  const suffix = formIndex ? `_${String(formIndex).padStart(2, '0')}` : '';
  return `${cfg.base}/${gen}G/${idStr}${suffix}.png?inline=true&key=${cfg.key}`;
}

// Position (1-indexée) d'une forme précise dans la liste des variétés PokeAPI
// de son espèce de base (hors variante par défaut) — sert à retrouver le
// suffixe _01/_02… du sprite Home quand on ne connaît pas déjà cet ordre
// (ex. grille principale du Pokédex, qui construit ses formes à partir de la
// liste globale /pokemon, pas des varieties d'une espèce précise). Résultat
// mis en cache via _fetchSpecies (même cache que le reste du Pokédex).
async function _pokeFormIndexFor(baseId, formPokemonName) {
  try {
    const spec = await _fetchSpecies(`${POKEAPI}/pokemon-species/${baseId}/`);
    if (!spec || !spec.varieties) return null;
    const alts = spec.varieties.filter(v => !v.is_default);
    const idx  = alts.findIndex(v => v.pokemon.name === formPokemonName);
    return idx >= 0 ? idx + 1 : null;
  } catch(_) { return null; }
}

// Petit système de "nouvel essai" générique pour les <img> chargées depuis
// le NAS (sprites Pokémon "Home" ET Personnages/Objets/Lieux/Énergies) : en
// cas d'échec, on retente une fois après un court délai (avec un paramètre
// anti-cache) avant d'abandonner. Le NAS tourne sur un Raspberry Pi aux
// ressources limitées et peut ponctuellement traîner ou échouer quand
// beaucoup d'images sont demandées d'un coup (ex. en arrivant sur une longue
// liste de ventes) — un simple nouvel essai un peu plus tard suffit la
// plupart du temps, plutôt que de basculer/abandonner immédiatement.
// fallbackSrc : URL de repli (Official Art) après le 2e échec — vide pour
// simplement retirer l'image (cas Personnages/Objets/Lieux/Énergies, sans
// repli possible).
function _spriteOnError(img, fallbackSrc) {
  const tries = parseInt(img.dataset.spriteTries || '0', 10);
  if (tries < 1) {
    img.dataset.spriteTries = '1';
    const base = img.src.split('&_r=')[0].split('?_r=')[0];
    const sep  = base.includes('?') ? '&' : '?';
    setTimeout(() => { img.src = `${base}${sep}_r=${Date.now()}`; }, 900 + Math.random() * 700);
    return;
  }
  if (fallbackSrc) { img.onerror = null; img.src = fallbackSrc; }
  else { img.remove(); } // le conteneur (taille fixe) reste — voir _hydrateSaleSprite
}

// Construit le tag <img> d'un sprite Pokémon en respectant le réglage
// Official Art / Home. En mode Home, si le fichier n'existe pas sur le NAS
// (404) ou échoue à charger, un nouvel essai est tenté puis, en dernier
// recours, bascule sur l'Official Art via onerror — jamais de sprite cassé
// affiché silencieusement.
// opts: { dexId, formIndex, officialUrl (brut PokeAPI, non transformé),
//         cssClass, style, alt }
function _pokeSpriteHtml(opts) {
  const official = opts.officialUrl ? _spriteUrl(opts.officialUrl) : '';
  const alt   = _escHtml(opts.alt || '');
  const cls   = opts.cssClass ? ` class="${opts.cssClass}"` : '';
  const style = opts.style ? ` style="${opts.style}"` : '';
  if (_spriteSourceMode() === 'home') {
    const nasUrl = _nasSpriteUrl(opts.dexId, opts.formIndex);
    if (nasUrl) {
      const fallbackArg = official ? official.replace(/'/g, "\\'") : '';
      return `<img src="${nasUrl}" alt="${alt}" loading="lazy"${cls}${style} onerror="_spriteOnError(this,'${fallbackArg}')">`;
    }
  }
  return official ? `<img src="${official}" alt="${alt}" loading="lazy"${cls}${style} onerror="this.style.display='none'">` : '';
}

// Variante async : ne calcule la position de la forme (formIndex) que si on
// est effectivement en mode Home (évite un appel réseau supplémentaire en
// mode Official Art, le cas le plus courant).
// opts: { id (numéro de l'espèce de BASE), isForm, formPokemonName,
//         officialUrl, cssClass, style, alt }
async function _pokeSpriteFor(opts) {
  let formIndex = null;
  if (opts.isForm && _spriteSourceMode() === 'home') {
    formIndex = await _pokeFormIndexFor(opts.id, opts.formPokemonName);
  }
  return _pokeSpriteHtml({
    dexId: opts.id, formIndex, officialUrl: opts.officialUrl,
    cssClass: opts.cssClass, style: opts.style, alt: opts.alt,
  });
}

// Sprite Personnage/Objet/Lieu/Énergie — TOUJOURS le NAS (voir
// window.__PC_NAS_SPRITES__.pkoBase/pkoFolders dans config.js), quel que
// soit le réglage Official Art/Home : ces catégories n'ont pas d'équivalent
// PokeAPI, donc pas de source alternative possible. Si le fichier n'existe
// pas sur le NAS (404), l'élément est simplement retiré (onerror) plutôt que
// de laisser une image cassée — pas de "sprite de repli" ici, contrairement
// aux Pokémon.
// kind: 'personnage' | 'objet' | 'lieu' | 'energie' — name: nom affiché de
// l'entrée (correspond au nom de fichier attendu sur le NAS).
function _pkoSpriteUrl(kind, name) {
  const cfg = window.__PC_NAS_SPRITES__;
  const folder = cfg && cfg.pkoFolders && cfg.pkoFolders[kind];
  if (!cfg || !cfg.pkoBase || !folder || !name) return null;
  return `${cfg.pkoBase}/${folder}/${encodeURIComponent(name)}.png?inline=true&key=${cfg.key}`;
}
function _pkoSpriteHtml(kind, name, cssClass, style, alt) {
  const url = _pkoSpriteUrl(kind, name);
  if (!url) return '';
  const cls   = cssClass ? ` class="${cssClass}"` : '';
  const sty   = style ? ` style="${style}"` : '';
  const altT  = _escHtml(alt || name || '');
  return `<img src="${url}" alt="${altT}" loading="lazy"${cls}${sty} onerror="this.remove()">`;
}

// ── State ──────────────────────────────────────────────────────────────────
var _pkdx = {
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
var _pkdxModalTcg = null;
// Mode de tri des groupes d'extension DANS une fiche Pokémon : 'default' (ordre
// bloc+code standard de l'appli), 'asc' ou 'desc' (tri code seul). Persiste
// d'une fiche à l'autre (préférence de session), contrairement à filterExtIds.
var _pkdxModalSortMode = 'default';

function _pkdxGenForId(id) {
  const g = POKEDEX_GENS.find(g => id >= g.from && id <= g.to);
  if (g) return g.id;
  // Pokémon plus récent que la dernière génération connue (nouveau DLC/jeu) :
  // on le rattache à la dernière génération plutôt que de le rendre invisible
  // dès qu'un filtre de génération précis est actif.
  const last = POKEDEX_GENS[POKEDEX_GENS.length - 1];
  return id > last.to ? last.id : 0;
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
// ── Cache local (espèces + noms FR + formes) ────────────────────────────────
// Cette liste ne change quasiment jamais d'une session à l'autre (seulement
// quand PokéAPI ajoute de nouveaux Pokémon/formes) — la recharger en entier
// depuis PokéAPI à CHAQUE démarrage (4 requêtes réseau + un calcul O(n²) sur
// les formes) n'apportait rien la plupart du temps. Un cache local élimine
// tout ça pour toutes les sessions suivant la première, dans la limite de
// PKDX_CACHE_TTL_MS — passé ce délai (ou si le cache est absent/corrompu),
// on retombe simplement sur le chargement réseau complet habituel.
var PKDX_CACHE_KEY    = 'ptcg_pkdx_cache_v2'; // v2 : _buildFormFrName corrigé (formes type Deoxys Vitesse)
var PKDX_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
function _pkdxLoadCache() {
  try {
    const raw = localStorage.getItem(PKDX_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.all) || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > PKDX_CACHE_TTL_MS) return null;
    return parsed.all;
  } catch(_) { return null; }
}
function _pkdxSaveCache() {
  try { localStorage.setItem(PKDX_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), all: _pkdx.all })); }
  catch(_) { /* quota dépassé ou navigation privée : pas bloquant, juste pas de cache cette fois */ }
}

async function initPokedex() {
  if (_pkdx.initialized) return;
  _pkdx.loading = true;
  document.getElementById('pokedex-loading').style.display = 'block';
  document.getElementById('pokedex-error').style.display   = 'none';

  try {
    const cached = _pkdxLoadCache();
    if (cached && cached.length) {
      _pkdx.all         = cached;
      _pkdx.filtered     = [..._pkdx.all];
      _pkdx.initialized  = true;
      _pkdx.loading      = false;
      _pkdx.formsLoaded  = true;
      _pkdx.showForms    = true;
      document.getElementById('pokedex-loading').style.display = 'none';
      document.getElementById('pokedex-subtitle').textContent  =
        `${_pkdx.all.filter(p=>!p.isForm).length} Pokémon + ${_pkdx.all.filter(p=>p.isForm).length} formes — PokéAPI (cache local)`;
      _buildGenFilters();
      _pkdx.page = 0;
      await renderPokedexPage();
      return;
    }

    // On interroge d'abord le nombre RÉEL d'espèces via /pokemon-species (plutôt
    // que de coder "1025" en dur) : nouvelles générations/DLC ajoutent des
    // espèces avec le temps, et un chiffre figé finit par en exclure certaines
    // de la recherche (ex. Pokémon les plus récents introuvables).
    let speciesCount = 1025;
    try {
      const countRes  = await _fetchTimeout(`${POKEAPI}/pokemon-species?limit=1`);
      const countData = await countRes.json();
      if (countData.count) speciesCount = countData.count;
    } catch(_) { /* on retombe sur 1025 si l'appel échoue (ou dépasse le délai) */ }

    const res  = await _fetchTimeout(`${POKEAPI}/pokemon?limit=${speciesCount}&offset=0`);
    const data = await res.json();

    _pkdx.all = data.results.map(p => {
      const parts = p.url.split('/').filter(Boolean);
      const id    = parseInt(parts[parts.length - 1], 10);
      return { id, name: p.name, frName: '' };
    }).filter(p => p.id >= 1 && p.id <= speciesCount)
      .sort((a, b) => a.id - b.id);

    _pkdx.filtered    = [..._pkdx.all];
    _pkdx.initialized = true;
    _pkdx.loading     = false;
    document.getElementById('pokedex-loading').style.display = 'none';
    document.getElementById('pokedex-subtitle').textContent  =
      `${_pkdx.all.length} Pokémon — données via PokéAPI`;

    _buildGenFilters();
    _pkdx.page = 0;
    // Charge en UNE seule requête les noms FR de TOUTE la liste (voir
    // _bulkLoadFrNames) — sans ça, un Pokémon jamais encore affiché dans la
    // grille n'a pas de nom FR connu et la recherche par nom (Pokédex ET
    // sélecteur de carte Ventes/Dépenses) ne le trouve pas, alors que la
    // recherche par numéro fonctionne toujours (elle ne dépend d'aucun appel
    // réseau). Ce chargement groupé élimine ce problème pour tout le Pokédex
    // d'un coup, plutôt que de dépendre de l'affichage carte par carte.
    document.getElementById('pokedex-subtitle').textContent = 'Chargement des noms français…';
    await _bulkLoadFrNames();
    document.getElementById('pokedex-subtitle').textContent = 'Chargement des formes…';
    await _loadFormsList();
    document.getElementById('pokedex-subtitle').textContent =
      `${_pkdx.all.filter(p=>!p.isForm).length} Pokémon + ${_pkdx.all.filter(p=>p.isForm).length} formes — PokéAPI`;
    _pkdxSaveCache();
    await renderPokedexPage();
  } catch(err) {
    _pkdx.loading = false;
    document.getElementById('pokedex-loading').style.display = 'none';
    document.getElementById('pokedex-error').style.display   = 'block';
    document.getElementById('pokedex-error').textContent     = 'Erreur : ' + err.message;
  }
}

// Récupère en UNE seule requête (endpoint GraphQL public de PokéAPI) le nom
// français de TOUTES les espèces, au lieu de 1000+ appels REST individuels
// (un par Pokémon, comme le fait l'ancienne hydratation "à la volée" au fil
// de l'affichage de la grille — _hydrateCard). C'est ce chargement groupé qui
// garantit que la recherche par nom trouve n'importe quel Pokémon dès
// l'ouverture du Pokédex, qu'il ait déjà été affiché ou non.
async function _bulkLoadFrNames() {
  try {
    const query = `query {
      species: pokemon_v2_pokemonspecies(order_by: {id: asc}) {
        id
        pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 5}}) { name }
      }
    }`;
    const res = await _fetchTimeout('https://beta.pokeapi.co/graphql/v1beta2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const rows = (json.data && json.data.species) || [];
    const byId = {};
    rows.forEach(s => {
      const n = s.pokemon_v2_pokemonspeciesnames && s.pokemon_v2_pokemonspeciesnames[0];
      if (n && n.name) byId[s.id] = n.name;
    });
    _pkdx.all.forEach(p => { if (!p.isForm && byId[p.id]) p.frName = byId[p.id]; });
  } catch (e) {
    // Pas bloquant : si l'appel groupé échoue (réseau, endpoint
    // indisponible…), l'ancienne hydratation carte par carte (_hydrateCard)
    // prend le relais au fil de l'affichage — dégradé mais fonctionnel.
    console.warn('[Pokédex] Chargement groupé des noms FR échoué, repli sur le chargement à la volée :', e.message);
  }
}

// Calcule le nom FR de chaque forme à partir du nom FR (déjà chargé par
// _bulkLoadFrNames) de son Pokémon de base — même construction que dans
// _hydrateCard, mais faite une fois pour toutes pour toute forme déjà
// connue plutôt qu'au moment où elle s'affiche à l'écran.
function _applyFrNamesToForms() {
  _pkdx.all.forEach(p => {
    if (!p.isForm || p.frName) return;
    const base = _pkdx.all.find(e => !e.isForm && e.id === p.baseId);
    if (base && base.frName) p.frName = _buildFormFrName(base.frName, p.formType, p.name);
  });
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

// Retire uniquement les accents (garde la casse) — utilisé pour interroger
// Supabase avec la variante SANS accent d'un nom en plus de l'originale
// (voir _fetchCardsGroupedByExtension), Postgres ILIKE ne faisant pas cette
// équivalence tout seul.
function _stripAccents(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
}
function _accentVariants(name) {
  const stripped = _stripAccents(name);
  return stripped !== name ? [name, stripped] : [name];
}

// Construit l'ensemble de tous les noms FR connus du Pokédex (Pokémon de
// base + formes, toutes variantes préfixe/suffixe de label actives), sous
// forme canonique (_canonPokeName, voir edition.js). Factorisé ici pour être
// utilisé à la fois par "Cartes orphelines" (Édition) et par la recherche
// locale des fiches Personnages/Objets (perso-objets.js), qui doit exclure
// toute carte réellement Pokémon pour ne jamais mélanger les deux
// catégories — auparavant dupliqué en ligne dans initOrphanCardsView.
function _buildKnownPokemonNameSet() {
  const known = new Set();
  _pkdx.all.forEach(p => {
    if (!p.frName) return;
    // Un Pokémon de base avec un label assigné manuellement (fiche →
    // sélecteur "Label") voit sa recherche de cartes restreinte à ce label
    // précis, exactement comme une forme : son nom "plat" n'est alors plus
    // cherché du tout — cf. openPokedexModal / _fetchCardsGroupedByExtension.
    const assignedType = (_D.pokemon_label_assignments || {})[p.name];
    if (assignedType) return;
    _accentVariants(p.frName).forEach(v => known.add(_canonPokeName(v)));
  });
  // Motifs préfixe/suffixe de chaque label actif (intégré ou personnalisé),
  // appliqués à chaque Pokémon de base connu — reproduit les mêmes motifs
  // que la recherche réelle (getFormLabelConfig) pour couvrir aussi les
  // formes qui ne suivent pas les motifs standards PokéAPI (Origine,
  // Couronné, Masque…, et tout label personnalisé).
  const baseEntries = _pkdx.all.filter(p => !p.isForm && p.frName);
  _allLabelTypes().forEach(type => {
    const cfg = getFormLabelConfig(type);
    if (!cfg || cfg.enabled === false) return;
    const prefixes = cfg.prefixes || [], suffixes = cfg.suffixes || [];
    if (!prefixes.length && !suffixes.length) return;
    baseEntries.forEach(p => {
      _accentVariants(p.frName).forEach(baseVariant => {
        const baseCanon = _canonPokeName(baseVariant);
        prefixes.forEach(pre => { const pc = _canonPokeName(pre); if (pc) known.add((pc + ' ' + baseCanon).trim()); });
        suffixes.forEach(suf => { const sc = _canonPokeName(suf); if (sc) known.add((baseCanon + ' ' + sc).trim()); });
      });
    });
  });
  return known;
}

// BUG corrigé : _buildKnownPokemonNameSet ci-dessus (utilisée par "Cartes
// orphelines") exige que "nom de base + suffixe" apparaisse comme une
// séquence EXACTE ET CONSÉCUTIVE en tout début de titre — alors que la
// fiche Pokémon elle-même (_cardMatchesFormType, label-categories.js) est
// plus souple : elle exige seulement que le préfixe ET/OU le suffixe
// apparaissent CHACUN comme un mot entier n'importe où dans le titre (une
// fois la carte déjà pré-filtrée par nom de base via la requête SQL). Deux
// implémentations séparées du "même" test pouvaient donc diverger — une
// carte affichée correctement sur la fiche du Pokémon (via
// _cardMatchesFormType) restait signalée comme orpheline (via le test Set
// plus strict). Repli utilisé seulement quand le test Set rapide échoue :
// réutilise LITTÉRALEMENT _cardMatchesFormType (la même fonction que la
// fiche) plutôt que de maintenir une deuxième logique qui peut diverger.
// PERF corrigé : cette fonction scannait TOUS les Pokémon (~1300, formes
// comprises) pour CHAQUE carte qui l'atteignait — y compris chaque
// orpheline authentique, qui par définition ne matchera jamais rien mais
// payait quand même le scan complet à chaque fois. Avec plusieurs centaines
// de cartes retombant sur ce repli (Cartes orphelines l'appelle pour toute
// carte ratant le test rapide), ça pouvait à lui seul expliquer plusieurs
// secondes de blocage de l'interface (JS mono-thread : ce calcul
// synchrone gèle l'affichage pendant qu'il tourne). Indexé maintenant par
// PREMIER TOKEN du nom FR — le lookup ne teste plus qu'une poignée de
// Pokémon candidats par carte au lieu de la totalité.
var _pkdxNameIndex = null;
var _pkdxNameIndexSize = -1;
function _buildPkdxNameIndex() {
  const idx = new Map();
  _pkdx.all.forEach(p => {
    if (!p.frName) return;
    const baseTokens = _pkoNormTokens ? _pkoNormTokens(p.frName) : _canonPokeName(p.frName).split(' ');
    if (!baseTokens.length) return;
    const key = baseTokens[0];
    if (!idx.has(key)) idx.set(key, []);
    idx.get(key).push(baseTokens);
  });
  return idx;
}
function _cardMatchesSomeLabeledPokemon(cardName) {
  if (typeof _cardMatchesFormType !== 'function' || typeof _allLinkedFormTypes !== 'function') return false;
  const types = _allLinkedFormTypes();
  if (!types.length) return false;
  const cardTokens = _pkoNormTokens ? _pkoNormTokens(cardName) : _canonPokeName(cardName || '').split(' ');
  if (!cardTokens.length) return false;

  if (!_pkdxNameIndex || _pkdxNameIndexSize !== _pkdx.all.length) {
    _pkdxNameIndex = _buildPkdxNameIndex();
    _pkdxNameIndexSize = _pkdx.all.length;
  }
  const candidates = new Set();
  cardTokens.forEach(t => { const arr = _pkdxNameIndex.get(t); if (arr) arr.forEach(bt => candidates.add(bt)); });
  if (!candidates.size) return false;

  for (const baseTokens of candidates) {
    // Le nom de base doit apparaître dans le titre (même principe que le
    // préfiltre SQL de _fetchCardsGroupedByExtension) — sans ça, un
    // préfixe/suffixe de label pourrait matcher un Pokémon totalement
    // différent par coïncidence.
    if (typeof _tokensContainSeq !== 'function' || !_tokensContainSeq(cardTokens, baseTokens)) continue;
    for (const type of types) {
      if (_cardMatchesFormType(cardName, type)) return true;
    }
  }
  return false;
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
    const res  = await _fetchTimeout(`${POKEAPI}/pokemon?limit=20000&offset=0`);
    const data = await res.json();

    // Base Pokémon already loaded (PokéAPI English names)
    const bases      = _pkdx.all.filter(p => !p.isForm);
    // Fast lookup: english name → entry
    const baseByName = Object.fromEntries(bases.map(b => [b.name, b]));
    // PERF corrigé : la recherche "plus long préfixe parmi TOUTES les bases"
    // rescannait ~1300 bases pour CHACUNE des ~2000 entrées renvoyées par
    // PokéAPI (jusqu'à plusieurs millions de comparaisons à chaque
    // démarrage). Un match valide exige que le premier segment (avant le
    // 1er tiret) du nom de la forme soit identique à celui de sa base — on
    // peut donc pré-regrouper les bases par ce premier segment une seule
    // fois, puis ne comparer qu'aux quelques candidates du même groupe.
    const basesByFirstToken = new Map();
    bases.forEach(b => {
      const key = b.name.split('-')[0];
      if (!basesByFirstToken.has(key)) basesByFirstToken.set(key, []);
      basesByFirstToken.get(key).push(b);
    });
    // PERF corrigé : "existing = _pkdx.all.find(...)" refaisait aussi un
    // scan linéaire de _pkdx.all (qui grossit au fil de la boucle) pour
    // CHAQUE entrée — remplacé par une Map à jour en O(1).
    const byName = new Map(_pkdx.all.map(e => [e.name, e]));

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
      const formRoot = p.name.split('-')[0];
      // Toute base candidate (préfixe OU racine d'espèce) a forcément le
      // même 1er segment que la forme — voir basesByFirstToken plus haut.
      const sameRootBases = basesByFirstToken.get(formRoot) || [];

      // Find base: exactParent first, then longest prefix match, then species-root match
      let base = null;
      if (exactParent[p.name]) {
        base = baseByName[exactParent[p.name]] || null;
      }
      if (!base) {
        // Try same-root base names as prefix — longest match wins
        let bestLen = 0;
        for (const b of sameRootBases) {
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
        const candidates = sameRootBases.filter(b => b.name.split('-')[0] === formRoot);
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

      const existing = byName.get(p.name);
      if (existing) {
        // Ré-appliquer un éventuel changement d'assignation manuelle sur une
        // entrée déjà chargée, sans dupliquer la ligne, et sans jamais
        // reconvertir une base existante (isForm déjà false) en forme.
        if (formType && existing.isForm) { existing.formType = formType; existing.baseId = base.id; }
        return;
      }
      if (!formType) return; // toujours pas de label reconnu ni assigné manuellement

      const newEntry = { id: apiId, baseId: base.id, name: p.name, frName: '', formType, isForm: true };
      _pkdx.all.push(newEntry);
      byName.set(p.name, newEntry);
      added++;
    });

    _pkdx.formsLoaded = true;
    _pkdx.showForms   = true;
    // Les noms FR des bases sont normalement déjà chargés en masse
    // (_bulkLoadFrNames, appelé avant _loadFormsList dans initPokedex) : on
    // peut donc calculer immédiatement le nom de chaque forme, sans attendre
    // qu'elle soit affichée à l'écran.
    _applyFrNamesToForms();
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
    default:
      // BUG corrigé : tout formType SANS grammaire spéciale ci-dessus
      // (Deoxys Vitesse/Attaque/Défense, les Rotom, Kyurem Noir/Blanc… — la
      // grande majorité des types déclarés dans _detectFormType) retombait
      // ici sur le nom de l'espèce de BASE tel quel, sans le moindre
      // suffixe : la forme devenait donc indiscernable de sa base pour
      // toute recherche par nom (sprite Ventes/Achats, matching de carte…).
      // On utilise maintenant le libellé FR déjà configuré pour ce label
      // (Édition › Labels, getFormLabelConfig) comme suffixe — seule
      // source de vérité pour ces libellés, au lieu de les redupliquer ici.
      var cfg   = getFormLabelConfig(formType);
      var label = cfg && cfg.fr && cfg.fr !== formType ? cfg.fr : null;
      return label ? (baseFr + ' ' + label) : baseFr;
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

    // Le nom FR est presque toujours déjà connu à ce stade (chargé en masse
    // par _bulkLoadFrNames à l'ouverture du Pokédex) : on ne refait l'appel
    // espèce que dans les cas résiduels où il manquerait encore (échec du
    // chargement groupé, ou forme ajoutée après coup sans base hydratée).
    let frName = p.frName || _capitalize(poke.name.replace(/-/g, ' '));
    if (!p.frName) {
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
    }

    const spriteHtml = await _pokeSpriteFor({
      id: displayId, isForm, formPokemonName: p.name,
      officialUrl: poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '',
      cssClass: 'pkdx-sprite', alt: frName,
    });
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
        ${spriteHtml || '<div class="pkdx-no-sprite">?</div>'}
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
  if (typeof _pkoCurrentModal !== 'undefined') _pkoCurrentModal = null; // on quitte une éventuelle fiche Personnage/Objet
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

    const spriteHtml = _pokeSpriteHtml({
      dexId: poke.id,
      officialUrl: poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '',
      cssClass: 'pkdx-modal-sprite', alt: frName,
    });
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
              ${_pokeSpriteHtml({
                dexId: e.speciesId,
                officialUrl: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${e.speciesId}.png`,
                style: 'width:64px;height:64px;object-fit:contain', alt: e.frName,
              })}
              <span class="pkdx-evo-num">#${String(e.speciesId).padStart(3,'0')}</span>
              <span class="pkdx-evo-name">${e.frName}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }

    // Special forms HTML — on garde aussi la liste des types de forme
    // réellement associés à CE Pokémon (ownFormTypes), pour que la vue "carte
    // de base" ci-dessous n'exclue que les cartes correspondant à une forme
    // qui existe vraiment ici (voir _fetchCardsGroupedByExtension).
    let formsHtml = '';
    const ownFormTypes = [];
    if (varieties.length > 0) {
      const formCards = await Promise.all(varieties.map(async (v, vIdx) => {
        try {
          const formPoke   = await _fetchPokemon(v.pokemon.name);
          const formTypes  = formPoke.types.map(t => t.type.name);
          const formColor  = TYPE_COLORS[formTypes[0]] || '#888';
          const formType   = _resolveFormType(v.pokemon.name, poke.name);
          if (formType) ownFormTypes.push(formType);
          const formMeta   = formType ? getFormLabelConfig(formType) : null;
          if (formMeta && !formMeta.enabled) return '';

          // Build display name
          let formLabel = v.pokemon.name.replace(poke.name + '-', '').replace(/-/g,' ');
          formLabel = formMeta ? formMeta.fr : _capitalize(formLabel);

          const formSpriteHtml = _pokeSpriteHtml({
            dexId: poke.id, formIndex: vIdx + 1,
            officialUrl: formPoke.sprites?.other?.['official-artwork']?.front_default || formPoke.sprites?.front_default || '',
            style: 'width:72px;height:72px;object-fit:contain', alt: formLabel,
          });

          return `<div class="pkdx-form-card" style="--pkdx-color:${formMeta?.color || formColor}" onclick="openPokedexFormModal('${v.pokemon.name}','${frName}')">
            ${formMeta ? `<span class="pkdx-form-badge" style="background:${formMeta.color}">${formMeta.badge}</span>` : ''}
            ${formSpriteHtml || '<div style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;color:var(--text3)">?</div>'}
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
        ${spriteHtml}
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
    _loadTcgCardsInModal(frName, assignedLabelType || undefined, ownFormTypes);
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

// Récupère et groupe par extension les cartes TCG correspondant à un Pokémon
// (recherche + filtre de forme + tri bloc/code) — fonction technique commune
// utilisée à la fois par la fiche Pokédex (_loadTcgCardsInModal) ET par le
// sélecteur de carte des Ventes/Dépenses, pour garantir un comportement
// strictement identique aux deux endroits (une seule implémentation, jamais
// deux copies qui pourraient diverger).
// `ownFormTypes` (optionnel) : types de forme réellement liés à CE Pokémon
// précis (ex. ['mega-x','mega-y','gmax'] pour Dracaufeu) — quand fourni, sert
// à restreindre l'exclusion de la vue "Pokémon de base" à ces seuls types au
// lieu de TOUS les types globalement configurés dans l'appli. Sans ça, une
// carte "XXX VMAX" d'un Pokémon qui n'a jamais eu de forme Gigamax dans les
// jeux disparaissait quand même de sa vue de base (parce que le motif
// générique "gmax" existe ailleurs dans l'appli), sans qu'aucune fiche de
// forme ne l'affiche non plus puisqu'aucune forme Gigamax n'existe réellement
// pour ce Pokémon — la carte devenait introuvable nulle part.
//
// BUG corrigé (même défaut que _fetchLocalCardsContainingName dans
// perso-objets.js) : cette fonction envoyait un filtre ilike AU SERVEUR
// (plusieurs variantes en OR, plafonnées à limit=500) avant toute
// comparaison, avec une recherche de repli à part (dizaines de requêtes
// séquentielles) spécifiquement pour rattraper les formes Méga/Gigamax dont
// le préfixe précède le nom ("Méga Dracaufeu") ET les cartes tombées hors de
// la fenêtre des 500 premiers résultats. Tout ça reposait sur le même filtre
// texte fragile côté serveur que celui qui empêchait les fiches Personnages/
// Objets/Lieux/Énergies de retrouver leurs cartes. On réutilise maintenant
// _pkoAllLocalCards (déjà chargé pour ces compteurs) : toute la comparaison —
// nom du Pokémon ET préfixes de forme — se fait en JS sur le catalogue
// COMPLET, sans plafond ni filtre serveur ; le serveur n'est requêté
// qu'ENSUITE, pour les détails des cartes déjà identifiées comme
// correspondantes. La recherche de repli devient inutile et disparaît.
async function _fetchCardsGroupedByExtension(frName, formType, ownFormTypes) {
  const linkedTypes = _allLinkedFormTypes();
  await _pkoFetchAllLocalCards();

  // Ancré sur le nom ENTIER du Pokémon (exact, ou suivi d'un espace/tiret
  // pour les suffixes EX/GX/V/VMAX…) plutôt qu'un simple "contient" — un
  // "contient" ferait remonter des Pokémon sans aucun rapport dont le nom
  // contient la chaîne recherchée en plein milieu ou en préfixe collé (ex.
  // "Abra" dans "Simiabraz", "Draco" en préfixe de "Dracolosse", "Marill"
  // dans "Azumarill"). On teste aussi la variante SANS accent (ex. "Negapi")
  // en plus de celle avec (ex. "Négapi") : certaines cartes sont enregistrées
  // sans accent selon l'import TCGdex.
  const nameVariants = _accentVariants(frName).map(v => v.toLowerCase());
  // Une carte "a le préfixe" une variante si son nom lui est identique, ou
  // commence par elle suivie d'un espace ou d'un tiret — jamais collé, pour
  // ne jamais confondre "Abra" et "Simiabraz". Réplique exactement les 3
  // motifs ilike historiques (égalité, "variante ", "variante-").
  const hasPrefix = (cardName, variants) => {
    const cn = (cardName || '').toLowerCase();
    return variants.some(v => {
      if (cn === v) return true;
      if (cn.length > v.length && cn.startsWith(v)) {
        const next = cn[v.length];
        return next === ' ' || next === '-';
      }
      return false;
    });
  };

  // Variantes "préfixe de forme + nom" (ex. "Méga Dracaufeu", "M-Dracaufeu",
  // "Gigamax Dracaufeu"…) — nécessaires pour les formes dont le préfixe
  // précède le nom du Pokémon : ces cartes ne commencent PAS par le nom du
  // Pokémon lui-même, donc hasPrefix(nameVariants) seul ne les trouverait
  // jamais. Même logique que l'ancienne recherche de repli, juste testée en
  // JS contre le catalogue complet plutôt qu'en requêtes serveur séparées.
  let formPrefixVariants = [];
  if (formType && linkedTypes.includes(formType)) {
    const cfg = getFormLabelConfig(formType);
    const shortTokens = [...new Set(
      (cfg.prefixes||[]).map(p => p.replace(/[-\s]+$/, '').replace(/^[-\s]+/, '')).filter(Boolean)
    )];
    shortTokens.forEach(token => {
      _accentVariants(token).forEach(tokenVariant => {
        [' ', '-'].forEach(joiner => {
          nameVariants.forEach(nv => formPrefixVariants.push((tokenVariant + joiner + nv).toLowerCase()));
        });
      });
    });
  }
  const allPrefixVariants = nameVariants.concat(formPrefixVariants);

  const matchedIds = [];
  (_pkoAllLocalCards || []).forEach(c => {
    if (!hasPrefix(c.name, allPrefixVariants)) return;
    // Une carte forcée manuellement vers "objet" ou "personnage" (fiche carte
    // → "Catégorie", voir perso-objets.js) ne doit plus jamais apparaître
    // dans une fiche Pokémon, même si son nom matche par ailleurs.
    const forced = typeof _cardCategoryOverride === 'function' ? _cardCategoryOverride(c.id) : '';
    if (forced && forced !== 'pokemon') return;
    matchedIds.push(c.id);
  });

  let cards = [];
  if (matchedIds.length) {
    const idFilter = `id=in.(${matchedIds.map(id => encodeURIComponent(id)).join(',')})`;
    const url = `${SB_URL}/rest/v1/cards?${idFilter}&select=id,name,set_id,set_name,image_url,number,rarity,cardmarket_url&order=set_id.asc,number.asc`;
    const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    cards = await res.json();
  }

  if (formType && linkedTypes.includes(formType)) {
    cards = cards.filter(card => _cardMatchesFormType(card.name, formType));
  } else if (!formType) {
    // Base Pokémon : exclure les cartes qui appartiennent à une forme spéciale
    // liée — mais seulement parmi les formes qui existent VRAIMENT pour ce
    // Pokémon (ownFormTypes) quand on les connaît, jamais la liste globale.
    const excludeTypes = Array.isArray(ownFormTypes) ? linkedTypes.filter(t => ownFormTypes.includes(t)) : linkedTypes;
    cards = cards.filter(c => !excludeTypes.some(t => _cardMatchesFormType(c.name, t)));
  }
  if (!cards.length) return { groups: [], cardsById: new Map() };

  // Ensure mapping loaded
  if (!_mapping.initialized) await initMappingView();

  const groups = _groupCardsByExtension(cards);
  const cardsById = new Map();
  cards.forEach(c => cardsById.set(String(c.id), c));

  return { groups, cardsById };
}

// Regroupe une liste de cartes par extension PTCG — résolue en priorité via
// le mapping TCGDex (set_id ↔ extension, voir Édition › Mapping TCG), avec
// repli sur le nom d'extension (set_name) si le mapping ne connaît pas ce
// set_id — puis trie les groupes par ordre de bloc/extension et les cartes de
// chaque groupe par numéro. Logique PARTAGÉE entre la fiche Pokédex/le
// sélecteur de carte (_fetchCardsGroupedByExtension) et l'onglet "Cartes
// orphelines" d'Édition (renderOrphanCardsList), pour un affichage identique.
function _groupCardsByExtension(cards) {
  if (!cards.length) return [];

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
  Object.entries(_mapping.mappings||{}).forEach(([extId, m]) => {
    const ext = allExts.find(e => e.id === extId);
    if (ext) setIdToExt[m.set_id] = ext;
  });

  // Group by set_id (repli sur set_name si la carte n'a pas de set_id, ex.
  // saisie manuelle)
  const groupMap = new Map();
  cards.forEach(c => {
    const key = c.set_id || c.set_name || '?';
    if (!groupMap.has(key)) groupMap.set(key, { set_id: c.set_id, set_name: c.set_name, cards: [] });
    groupMap.get(key).cards.push(c);
  });

  // Attache à chaque groupe (et à chaque carte, pour la modale de détail) les
  // infos d'extension PTCG utiles à l'affichage/au tri : id, code, nom, logo, sigle.
  return Array.from(groupMap.values()).map(group => {
    const ext = setIdToExt[group.set_id] || allExts.find(e => e.nom === group.set_name);
    const extInfo = {
      extId: ext ? ext.id : null,
      code:  ext ? (ext.code || '') : '',
      name:  ext ? (ext.nom || ext.name || group.set_name) : (group.set_name || group.set_id || '?'),
      logo:  ext ? (ext.logo  || '') : '',
      sigle: ext ? (ext.sigle || '') : '',
      order: ext && extOrder[ext.id] !== undefined ? extOrder[ext.id] : 9999,
    };
    group.cards.sort((a,b) => (a.number||'').localeCompare(b.number||'', 'fr', { numeric: true }));
    group.cards.forEach(c => { c._ext = extInfo; });
    return { ...group, ext: extInfo };
  }).sort((a,b) => a.ext.order - b.ext.order || (a.set_name||'').localeCompare(b.set_name||''));
}

// Détermine le formType à utiliser pour charger les cartes d'une entrée
// _pkdx.all (forme OU Pokémon de base avec label assigné manuellement) —
// exactement la même résolution que dans les fiches Pokédex
// (openPokedexModal / openPokedexFormModal), pour que le sélecteur de carte
// des Ventes/Dépenses trouve rigoureusement les mêmes cartes.
async function _resolveFormTypeForPkdxEntry(p) {
  if (!p.isForm) return (_D.pokemon_label_assignments||{})[p.name] || null;
  try {
    const poke = await _fetchPokemon(p.name);
    return _resolveFormType(p.name, poke.species.name);
  } catch(_) {
    return p.formType || null;
  }
}

async function _loadTcgCardsInModal(frName, formType, ownFormTypes) {
  const grid  = document.getElementById('pkdx-tcg-grid');
  const chip  = document.getElementById('pkdx-tcg-filter-chip');
  if (!grid) return;

  _pkdxModalTcg = null;
  if (chip) chip.style.display = 'none';

  try {
    const { groups, cardsById } = await _fetchCardsGroupedByExtension(frName, formType, ownFormTypes);
    if (!document.getElementById('pkdx-tcg-grid')) return;
    if (!groups.length) { grid.innerHTML = '<p style="color:var(--text3);font-size:.82rem">Aucune carte trouvée.</p>'; return; }

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
// Construit le HTML des groupes de cartes TCG par extension — UNE SEULE
// implémentation, utilisée à la fois par la fiche Pokédex
// (_renderPkdxTcgGroups) et le sélecteur de carte des Ventes/Dépenses
// (_cardPickerRenderCardGroups). `cardClickAttr(card)` fournit le contenu de
// l'attribut onclick de chaque tuile (comportement différent : ouvrir la
// fiche détaillée dans le Pokédex, sélectionner la carte dans le picker).
// Callback de repli pour une vignette de carte TCG (groupes par extension,
// voir _renderTcgCardGroupsHtml) qui a définitivement échoué à charger
// après les tentatives de _nasImgRetry (core.js) — reproduit le même
// placeholder texte que l'état "pas d'image_url" (else ci-dessous).
function _tcgCardImgGiveUp(img) {
  const name = img.dataset.fallbackName || '';
  img.outerHTML = '<div class="pkdx-tcg-placeholder">' + _escHtml(name) + '</div>';
}

// Même chose pour la grande image zoomée d'une carte (fiche détail carte,
// voir openCardDetailModal) — même style de placeholder que l'absence
// d'image_url, en conservant les proportions d'une carte (63/88).
function _tcgCardZoomImgGiveUp(img) {
  const name = img.dataset.fallbackName || '';
  img.outerHTML = '<div class="pkdx-tcg-placeholder" style="width:100%;aspect-ratio:63/88;border-radius:12px;background:var(--bg3)">' + _escHtml(name) + '</div>';
}

function _renderTcgCardGroupsHtml(groups, cardClickAttr) {
  let html = '';
  groups.forEach(group => {
    const ext = group.ext;
    html += '<div class="pkdx-tcg-ext-group">'
      + '<div class="pkdx-tcg-ext-header">'
      + (ext.logo  ? '<img src="' + ext.logo  + '" alt="" class="pkdx-tcg-ext-logo"  onerror="_nasImgRetry(this)">' : '')
      + (ext.sigle ? '<img src="' + ext.sigle + '" alt="" class="pkdx-tcg-ext-sigle" onerror="_nasImgRetry(this)">' : '')
      + '<span class="pkdx-tcg-ext-name">' + _escHtml(ext.name) + '</span>'
      + (ext.code  ? '<span class="pkdx-tcg-ext-code">' + _escHtml(ext.code) + '</span>' : '')
      + '<span class="pkdx-tcg-ext-badge">' + group.cards.length + '</span>'
      + '</div>'
      // Une extension = une ligne : rangée à défilement horizontal plutôt
      // qu'une grille qui s'étale sur plusieurs lignes. En ligne + en classe
      // pour ne dépendre d'aucune feuille de style externe.
      + '<div class="pkdx-tcg-grid" style="display:flex;gap:10px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:8px">';

    group.cards.forEach(c => {
      html += '<div class="pkdx-tcg-card" onclick="' + cardClickAttr(c) + '" title="'
        + _escHtml((c.set_name||'') + ' — ' + (c.number||'') + ' — ' + (c.rarity||'')) + '">';
      if (c.image_url) {
        html += '<img src="' + c.image_url + '" alt="' + _escHtml(c.name) + '" loading="lazy" data-fallback-name="' + _escHtml(c.name) + '" onerror="_nasImgRetry(this,_tcgCardImgGiveUp)">';
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
  return html;
}

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

  grid.innerHTML = _renderTcgCardGroupsHtml(groups, c => "openCardDetailModal('" + _escJs(String(c.id)) + "')");
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
      ${ext.sigle ? `<img src="${ext.sigle}" alt="" class="pkdx-ext-filter-sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : `<span class="pkdx-ext-filter-code">${_escHtml(ext.code||'')}</span>`}
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
          ? `<img src="${card.image_url}" alt="${_escHtml(card.name)}" id="pkdx-card-zoom-img" data-fallback-name="${_escHtml(card.name)}" onerror="_nasImgRetry(this,_tcgCardZoomImgGiveUp)">`
          : `<div class="pkdx-tcg-placeholder" style="width:100%;aspect-ratio:63/88;border-radius:12px;background:var(--bg3)">${_escHtml(card.name)}</div>`}
      </div>
      <div class="pkdx-card-modal-info">
        <h3>${_escHtml(card.name)}</h3>
        <div class="pkdx-card-modal-meta">
          ${ext.sigle ? `<img src="${ext.sigle}" alt="" class="pkdx-card-modal-ext-sigle" onerror="_nasImgRetry(this,img=>img.style.display='none')">` : ''}
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
          <div style="display:flex;gap:6px;align-items:center">
            <input type="url" id="pkdx-card-edit-img" value="${_escHtml(card.image_url||'')}" placeholder="https://…" style="flex:1" ondragover="event.preventDefault()" ondrop="_handleImageDrop(event,'pkdx-card-edit-img')">
            <label class="btn btn-secondary btn-sm" style="cursor:pointer" title="Importer une image depuis cet appareil">📁
              <input type="file" accept="image/*" style="display:none" onchange="_importImageFile(this,'pkdx-card-edit-img')">
            </label>
          </div>
        </div>
        <div class="settings-field">
          <label>Lien CardMarket</label>
          <input type="url" id="pkdx-card-edit-cardmarket" value="${_escHtml(card.cardmarket_url||'')}" placeholder="https://www.cardmarket.com/…">
        </div>
        <div class="settings-field">
          <label>Catégorie</label>
          <select id="pkdx-card-edit-category">
            <option value="">Auto (détection par le nom)</option>
            <option value="pokemon"${_cardCategoryOverride(cardId)==='pokemon'?' selected':''}>Pokémon</option>
            ${typeof PKO_KINDS !== 'undefined' ? PKO_KINDS.map(k => `<option value="${k}"${_cardCategoryOverride(cardId)===k?' selected':''}>${PKO_LABELS[k].singular.charAt(0).toUpperCase() + PKO_LABELS[k].singular.slice(1)}</option>`).join('') : ''}
          </select>
          <p class="form-hint" style="margin-top:4px">À utiliser si cette carte apparaît dans la mauvaise fiche (ex. un Pokémon qui ressort chez un Personnage à cause de son nom) — force la catégorie plutôt que de laisser la détection par nom décider.</p>
        </div>
        <div class="modal-footer" style="justify-content:flex-start">
          <button class="btn btn-primary btn-sm" onclick="saveCardEdits('${_escJs(String(cardId))}')">Enregistrer dans Supabase</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCardFromDb('${_escJs(String(cardId))}')">Supprimer cette carte</button>
          ${card.cardmarket_url ? `<a href="${_escHtml(card.cardmarket_url)}" target="_blank" rel="noopener" class="sale-link" style="margin-left:10px">Voir sur CardMarket ↗</a>` : ''}
        </div>
      </div>
    </div>
  `;
  modal.classList.add('open');
}

// Supprime définitivement une carte de la table Supabase "cards" — utile
// pour nettoyer les doublons/erreurs de saisie (manuelle ou import TCGDex).
// Ne touche pas aux ventes/dépenses existantes qui la référencent : elles
// gardent leurs infos déjà enregistrées (nom, image, extension…), seule la
// carte source disparaît de la recherche/du Pokédex.
async function deleteCardFromDb(cardId) {
  const card = _pkdxModalTcg?.cardsById?.get(String(cardId));
  const label = card ? `« ${card.name} »` : 'cette carte';
  if (!confirm(`Supprimer définitivement ${label} de la base de données ? Cette action est irréversible. Les ventes/dépenses existantes qui la référencent ne seront pas supprimées.`)) return;
  try {
    const res = await fetch(`${SB_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    if (_pkdxModalTcg?.cardsById) _pkdxModalTcg.cardsById.delete(String(cardId));
    if (_pkdxModalTcg?.groups) {
      _pkdxModalTcg.groups.forEach(g => { g.cards = g.cards.filter(c => String(c.id) !== String(cardId)); });
      _pkdxModalTcg.groups = _pkdxModalTcg.groups.filter(g => g.cards.length);
    }
    closeModal('modal-card-detail');
    if (typeof _renderPkdxTcgGroups === 'function') _renderPkdxTcgGroups();
    if (typeof _syncOrphanCardsAfterDelete === 'function') _syncOrphanCardsAfterDelete(cardId);
    toast('Carte supprimée de la base.', 'success');
  } catch(e) {
    toast('Erreur Supabase : ' + e.message, 'error');
  }
}

async function saveCardEdits(cardId) {
  const card = _pkdxModalTcg?.cardsById?.get(String(cardId));
  if (!card) return;
  const nameInp = document.getElementById('pkdx-card-edit-name');
  const imgInp  = document.getElementById('pkdx-card-edit-img');
  const cmInp   = document.getElementById('pkdx-card-edit-cardmarket');
  const catInp  = document.getElementById('pkdx-card-edit-category');
  const newName = (nameInp?.value || '').trim();
  const newImg  = (imgInp?.value || '').trim();
  const newCm   = (cmInp?.value || '').trim();
  const newCat  = catInp ? catInp.value : '';
  if (!newName) { toast('Le nom ne peut pas être vide.', 'error'); return; }
  if (typeof setCardCategoryOverride === 'function') setCardCategoryOverride(cardId, newCat || null, { silent: true, cardName: newName });

  try {
    const res = await fetch(`${SB_URL}/rest/v1/cards?id=eq.${encodeURIComponent(cardId)}`, {
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ name: newName, image_url: newImg || null, cardmarket_url: newCm || null }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);

    // Reflète immédiatement le changement dans l'état déjà chargé (même objet
    // référencé par groups[].cards et cardsById → un seul endroit à mettre à jour).
    card.name = newName;
    card.image_url = newImg;
    card.cardmarket_url = newCm;
    _renderPkdxTcgGroups();
    if (typeof _syncOrphanCardsAfterEdit === 'function') _syncOrphanCardsAfterEdit(cardId, { name: newName, image_url: newImg, cardmarket_url: newCm });
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
  if (typeof _pkoCurrentModal !== 'undefined') _pkoCurrentModal = null;
  inner.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2)">Chargement de la forme…</div>';
  modal.classList.add('open');

  try {
    const poke    = await _fetchPokemon(pokeName);
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

    // L'id de l'espèce de BASE (pas celui, ≥10000, de cette forme précise)
    // sert de dossier/numéro pour le sprite Home sur le NAS — voir _nasSpriteUrl.
    const specParts0 = poke.species.url.split('/').filter(Boolean);
    const specId0    = parseInt(specParts0[specParts0.length - 1], 10);
    const spriteHtml = await _pokeSpriteFor({
      id: specId0, isForm: true, formPokemonName: pokeName,
      officialUrl: poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '',
      cssClass: 'pkdx-modal-sprite', alt: fullFrName,
    });

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
    const specId = specId0;

    inner.innerHTML = `
      <div class="pkdx-modal-hero" style="--pkdx-color:${formMeta?.color || color}">
        <div class="pkdx-modal-hero-bg"></div>
        ${spriteHtml}
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
// BUG corrigé : plusieurs appels ailleurs dans le code (ex.
// _persistLocalOnly, core.js, pour le toast "quota localStorage dépassé —
// clique ici pour libérer de la place") passaient déjà un 3e argument
// {onClick} en attendant un toast cliquable — silencieusement ignoré ici,
// puisque cette fonction n'acceptait que (msg, type). Résultat : ces
// toasts s'affichaient bien, mais cliquer dessus ne faisait RIEN, laissant
// l'utilisateur bloqué sans façon de déclencher la correction proposée.
function toast(msg, type='', opts) {
  const el=Object.assign(document.createElement('div'),{className:'toast '+type,textContent:msg});
  if (opts && typeof opts.onClick === 'function') {
    el.style.cursor = 'pointer';
    el.style.textDecoration = 'underline';
    el.title = 'Cliquer pour agir';
    el.onclick = () => { opts.onClick(); el.remove(); };
  }
  document.getElementById('toast-container').appendChild(el);
  // Un toast avec une action cliquable reste affiché plus longtemps (8s
  // au lieu de 3.2s) — le temps de le remarquer et d'agir dessus, plutôt
  // que de disparaître avant que l'utilisateur ait pu cliquer.
  const duration = opts && opts.onClick ? 8000 : 3200;
  setTimeout(()=>el.remove(),duration);
}
