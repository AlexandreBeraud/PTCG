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
async function initPokedex() {
  if (_pkdx.initialized) return;
  _pkdx.loading = true;
  document.getElementById('pokedex-loading').style.display = 'block';
  document.getElementById('pokedex-error').style.display   = 'none';

  try {
    // On interroge d'abord le nombre RÉEL d'espèces via /pokemon-species (plutôt
    // que de coder "1025" en dur) : nouvelles générations/DLC ajoutent des
    // espèces avec le temps, et un chiffre figé finit par en exclure certaines
    // de la recherche (ex. Pokémon les plus récents introuvables).
    let speciesCount = 1025;
    try {
      const countRes  = await fetch(`${POKEAPI}/pokemon-species?limit=1`);
      const countData = await countRes.json();
      if (countData.count) speciesCount = countData.count;
    } catch(_) { /* on retombe sur 1025 si l'appel échoue */ }

    const res  = await fetch(`${POKEAPI}/pokemon?limit=${speciesCount}&offset=0`);
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
    const res = await fetch('https://beta.pokeapi.co/graphql/v1beta2', {
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

    const sprite   = _spriteUrl(poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '');
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

    const sprite  = _spriteUrl(poke.sprites?.other?.['official-artwork']?.front_default ||
                    poke.sprites?.front_default || '');
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
              <img src="https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${e.speciesId}.png"
                   alt="${e.frName}" onerror="this.style.display='none'" style="width:64px;height:64px;object-fit:contain">
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
      const formCards = await Promise.all(varieties.map(async v => {
        try {
          const formPoke   = await _fetchPokemon(v.pokemon.name);
          const formSprite = _spriteUrl(formPoke.sprites?.other?.['official-artwork']?.front_default ||
                             formPoke.sprites?.front_default || '');
          const formTypes  = formPoke.types.map(t => t.type.name);
          const formColor  = TYPE_COLORS[formTypes[0]] || '#888';
          const formType   = _resolveFormType(v.pokemon.name, poke.name);
          if (formType) ownFormTypes.push(formType);
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
async function _fetchCardsGroupedByExtension(frName, formType, ownFormTypes) {
  const linkedTypes = _allLinkedFormTypes();

  // Ancré sur le nom ENTIER du Pokémon (exact, ou suivi d'un espace/tiret
  // pour les suffixes EX/GX/V/VMAX…) plutôt qu'un simple "contient" — un
  // "contient" faisait remonter des Pokémon sans aucun rapport dont le nom
  // contient la chaîne recherchée en plein milieu ou en préfixe collé (ex.
  // "Abra" dans "Simiabraz", "Draco" en préfixe de "Dracolosse", "Marill"
  // dans "Azumarill").
  const nameEsc = encodeURIComponent(frName);
  const orFilter = `or=(name.ilike.${nameEsc},name.ilike.${nameEsc}%20*,name.ilike.${nameEsc}-*)`;
  const url = `${SB_URL}/rest/v1/cards?${orFilter}&order=set_id.asc,number.asc&limit=500`;
  const res = await fetch(url, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let cards = await res.json();

  if (formType && linkedTypes.includes(formType)) {
    cards = cards.filter(card => _cardMatchesFormType(card.name, formType));
    // Certaines cartes au format court ("M Dracaufeu", "M-Dracaufeu") peuvent
    // se trouver hors de la fenêtre limit=500 de la requête principale. On
    // détecte les préfixes/suffixes réduits à une seule lettre ou un seul mot
    // court (ex. "M ", "M-" désignent tous la lettre "M") et on refait une
    // recherche dédiée pour chacun, en testant à la fois la jointure espace
    // ET la jointure tiret (les deux se rencontrent selon les imports TCGdex),
    // quelle que soit la façon dont l'utilisateur les a saisis dans Édition › Labels.
    const cfg = getFormLabelConfig(formType);
    const shortTokens = [...new Set(
      (cfg.prefixes||[])
        .map(p => _nnLbl(p).replace(/[-\s]+$/, '').replace(/^[-\s]+/, ''))
        .filter(Boolean)
    )];
    const seen = new Set(cards.map(c => c.id));
    for (const token of shortTokens) {
      for (const joiner of [' ', '-']) {
        try {
          const r2 = await fetch(`${SB_URL}/rest/v1/cards?name=ilike.${encodeURIComponent(token + joiner + frName)}*&order=set_id.asc,number.asc&limit=200`,
            { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
          const extra = r2.ok ? await r2.json() : [];
          extra.filter(c => _cardMatchesFormType(c.name, formType)).forEach(c => {
            if (!seen.has(c.id)) { cards.push(c); seen.add(c.id); }
          });
        } catch(_) {}
      }
    }
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
  }).sort((a,b) => a.ext.order - b.ext.order || (a.set_name||'').localeCompare(b.set_name||''));

  const cardsById = new Map();
  cards.forEach(c => cardsById.set(String(c.id), c));

  return { groups, cardsById };
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
function _renderTcgCardGroupsHtml(groups, cardClickAttr) {
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
      // Une extension = une ligne : rangée à défilement horizontal plutôt
      // qu'une grille qui s'étale sur plusieurs lignes. En ligne + en classe
      // pour ne dépendre d'aucune feuille de style externe.
      + '<div class="pkdx-tcg-grid" style="display:flex;gap:10px;overflow-x:auto;flex-wrap:nowrap;padding-bottom:8px">';

    group.cards.forEach(c => {
      html += '<div class="pkdx-tcg-card" onclick="' + cardClickAttr(c) + '" title="'
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
        <div class="settings-field">
          <label>Lien CardMarket</label>
          <input type="url" id="pkdx-card-edit-cardmarket" value="${_escHtml(card.cardmarket_url||'')}" placeholder="https://www.cardmarket.com/…">
        </div>
        <div class="modal-footer" style="justify-content:flex-start">
          <button class="btn btn-primary btn-sm" onclick="saveCardEdits('${_escJs(String(cardId))}')">Enregistrer dans Supabase</button>
          ${card.cardmarket_url ? `<a href="${_escHtml(card.cardmarket_url)}" target="_blank" rel="noopener" class="sale-link" style="margin-left:10px">Voir sur CardMarket ↗</a>` : ''}
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
  const cmInp   = document.getElementById('pkdx-card-edit-cardmarket');
  const newName = (nameInp?.value || '').trim();
  const newImg  = (imgInp?.value || '').trim();
  const newCm   = (cmInp?.value || '').trim();
  if (!newName) { toast('Le nom ne peut pas être vide.', 'error'); return; }

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
    const sprite  = _spriteUrl(poke.sprites?.other?.['official-artwork']?.front_default || poke.sprites?.front_default || '');
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
