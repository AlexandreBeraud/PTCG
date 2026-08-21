// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/edition.js
//  Édition (blocs & extensions), Statistiques, Navigation, Modals, Paramètres
// ═══════════════════════════════════════════════════════════════════════════

// ── Édition ────────────────────────────────────────────────────────────────
function renderEdition() {
  populateBlocSelect();
  renderEditionList();
}

function renderEditionList() {
  const list=document.getElementById('edition-list');
  list.innerHTML='';

  if (_editionTab==='blocs') {
    const items = sortExts(getBlocs().map(b=>({type:'bloc',...b})));
    if (items.length===0){list.innerHTML='<div class="empty-state"><p>Aucun bloc.</p></div>';return;}
    const edMode = _tabViewModes['edition'] || 'grid';
    if (edMode==='grid') {
      const grid=document.createElement('div'); grid.className='edition-grid';
      items.forEach(b=>{
        const el=buildEditionBlocCard(b);
        el.draggable=true; el.dataset.blocId=b.id;
        el.addEventListener('dragstart',onBlocDragStart);
        el.addEventListener('dragover',onBlocDragOver);
        el.addEventListener('drop',onBlocDrop);
        grid.appendChild(el);
      });
      list.appendChild(grid);
    } else {
      items.forEach(b=>{
        const el=buildEditionBlocRow(b);
        el.draggable=true; el.dataset.blocId=b.id;
        el.addEventListener('dragstart',onBlocDragStart);
        el.addEventListener('dragover',onBlocDragOver);
        el.addEventListener('drop',onBlocDrop);
        list.appendChild(el);
      });
    }
    return;
  }

  // Extensions tab — grouped by bloc, each bloc collapsible
  getBlocs().forEach(bloc => {
    // Include built-in exts (with their current bloc via override check)
    const builtInExts = (bloc.extensions||[]).filter(e => {
      const ov = (_D.ext_overrides||{})[e.id]||{};
      return !ov.bloc_id_override || ov.bloc_id_override === bloc.id;
    }).map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true,_bloc:bloc};});
    // Include built-in exts from other blocs moved here
    const movedHere = getBlocs().filter(b=>b._builtin&&b.id!==bloc.id).flatMap(b=>
      (b.extensions||[]).filter(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return ov.bloc_id_override===bloc.id;})
        .map(e=>{const ov=(_D.ext_overrides||{})[e.id]||{};return{...e,...ov,_builtin:true,_bloc:bloc};})
    );
    const customExts = (_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id).map(e=>({...e,_custom:true,_bloc:bloc}));
    const allExts = sortExts([...builtInExts, ...movedHere, ...customExts]);
    if (allExts.length===0) return;

    const uid = 'edext_' + bloc.id;
    const section = document.createElement('div');
    section.className = 'edition-bloc-section';
    const logoHtml = bloc.logo ? `<img src="${bloc.logo}" class="bloc-logo" alt="${bloc.short}" onerror="this.style.display='none'">` : '';
    section.innerHTML = `
      <div class="edition-bloc-header collapsible" onclick="toggleAccordion('${uid}')">
        ${logoHtml}
        <div class="bloc-color-dot" style="background:${bloc.couleur}"></div>
        <span class="edition-bloc-title">${bloc.nom}</span>
        <span class="edition-bloc-short">${bloc.short}</span>
        <span class="edition-bloc-count">${allExts.length} ext.</span>
        <div class="cer-chevron open" id="chev-${uid}" style="margin-left:auto">▼</div>
      </div>
      <div id="${uid}" class="${_viewMode()==='grid'?'edition-bloc-items open edition-grid':'edition-bloc-items open'}"></div>`;
    list.appendChild(section);

    const cont = section.querySelector(`#${uid}`);
    allExts.forEach(e => cont.appendChild(_viewMode()==='grid' ? buildEditionExtCard(e) : buildEditionExtRow(e)));
  });

  if (!list.children.length) list.innerHTML='<div class="empty-state"><p>Aucune extension.</p></div>';
}

// ── Edition card builders ──────────────────────────────────────────────────
function buildEditionBlocCard(b) {
  const el=document.createElement('div');
  el.className='edition-item-card';
  const logoSrc=b.logo||'';
  const _bid=b.id, _bcustom=!!b._custom_bloc;
  el.innerHTML=`
    <div class="edition-card-thumb" style="background:${b.couleur}22;border-bottom:3px solid ${b.couleur}">
      ${logoSrc?`<img src="${logoSrc}" alt="${b.short}" onerror="this.style.display='none'">`:
        `<span style="color:${b.couleur};font-size:1.1rem;font-weight:900">${b.short}</span>`}
    </div>
    <div class="edition-card-body">
      <div class="edition-card-code" style="color:${b.couleur}">${b.short}</div>
      <div class="edition-card-name">${b.nom}</div>
      <div class="edition-card-meta">${extCountForBloc(b)} ext · Bloc</div>
    </div>
    <div class="edition-card-actions">
      <button class="btn btn-icon btn-sm btn-danger" title="${b._custom_bloc?'Supprimer':'Masquer'}" onclick="event.stopPropagation();deleteAnyBloc('${b.id}',${!!b._custom_bloc})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', e => { if(!e.target.closest('.edition-card-actions')) editBloc(_bid); });
  return el;
}

function buildEditionBlocRow(b) {
  const el=document.createElement('div');
  el.className='edition-ext-row';
  const logoSrc=b.logo||'';
  const _bid=b.id, _bcustom=!!b._custom_bloc;
  el.innerHTML=`
    <div class="edition-ext-thumb" style="background:${b.couleur}22;border:1px solid ${b.couleur}44">
      ${logoSrc?`<img src="${logoSrc}" alt="${b.short}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:``}
      <div class="edition-ext-thumb-code" style="color:${b.couleur};${logoSrc?'display:none':''}">${b.short}</div>
    </div>
    <div class="edition-ext-info">
      <div class="edition-ext-code" style="color:${b.couleur}">${b.short}</div>
      <div class="edition-ext-name">${b.nom}</div>
      <div class="edition-ext-meta">${extCountForBloc(b)} ext · Bloc</div>
    </div>
    <div class="edition-ext-actions">
      <button class="btn btn-icon btn-sm btn-danger" title="${b._custom_bloc?'Supprimer':'Masquer'}" onclick="event.stopPropagation();deleteAnyBloc('${b.id}',${!!b._custom_bloc})">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', e => { if(!e.target.closest('.edition-ext-actions')) editBloc(_bid); });
  return el;
}

function buildEditionExtCard(e) {
  const color=extColor(e);
  const pct=e.nb_cartes>0?Math.round(ownedCount(e.id)/e.nb_cartes*100):0;
  const logoSrc=e.logo||e._bloc?.logo||'';
  const el=document.createElement('div');
  el.className='edition-item-card';
  const _eid=e.id, _ecustom=!!e._custom;
  el.innerHTML=`
    <div class="edition-card-thumb" style="border-bottom:3px solid ${color}">
      ${logoSrc?`<img src="${logoSrc}" alt="${e.code}" onerror="this.style.display='none'">`:
        `<span style="color:${color};font-size:.9rem;font-weight:900">${e.code}</span>`}
    </div>
    <div class="edition-card-body">
      <div class="edition-card-code" style="color:${color}">${e.code}</div>
      <div class="edition-card-name">${e.nom}</div>
      <div class="edition-card-meta">${e.nb_cartes||0} cartes</div>
      <div class="edition-card-pct-bar"><div style="width:${pct}%;background:${pctBg(pct)}"></div></div>
    </div>
    <div class="edition-card-actions">
      <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation();deleteAnyExt('${e.id}',${!!e._custom})" title="${e._custom?'Supprimer':'Masquer'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', ev => { if(!ev.target.closest('.edition-card-actions')) editExt(_eid,_ecustom); });
  return el;
}

function buildEditionExtRow(e) {
  const color=extColor(e); const logoSrc=e.logo||e._bloc?.logo||'';
  const el=document.createElement('div'); el.className='edition-ext-row';
  const _eid=e.id, _ecustom=!!e._custom;
  el.innerHTML=`
    <div class="edition-ext-thumb" style="border:1px solid ${color}33">
      ${logoSrc?`<img src="${logoSrc}" alt="${e.nom}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`:``}
      <div class="edition-ext-thumb-code" style="color:${color};${logoSrc?'display:none':''}">${e.code}</div>
    </div>
    <div class="edition-ext-info">
      <div class="edition-ext-code" style="color:${color}">${e.code}</div>
      <div class="edition-ext-name">${e.nom}</div>
      <div class="edition-ext-meta">${e._bloc?e._bloc.nom:'—'} · ${e.nb_cartes||0} cartes</div>
    </div>
    <div class="edition-ext-actions">
      <button class="btn btn-icon btn-sm btn-danger" onclick="event.stopPropagation();deleteAnyExt('${e.id}',${!!e._custom})" title="${e._custom?'Supprimer':'Masquer'}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
        </svg>
      </button>
    </div>`;
  el.style.cursor = 'pointer';
  el.addEventListener('click', ev => { if(!ev.target.closest('.edition-ext-actions')) editExt(_eid,_ecustom); });
  return el;
}

var _blocDragId = null;
function onBlocDragStart(e) { _blocDragId = e.currentTarget.dataset.blocId; e.dataTransfer.effectAllowed='move'; }
function onBlocDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-target'); }
function onBlocDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.edition-item-card.drag-target, .edition-ext-row.drag-target').forEach(el=>el.classList.remove('drag-target'));
  const toId = e.currentTarget.dataset.blocId;
  if (!_blocDragId || _blocDragId === toId) { _blocDragId=null; return; }
  const blocs = getBlocs();
  const order = blocs.map(b=>b.id);
  const fromIdx = order.indexOf(_blocDragId), toIdx = order.indexOf(toId);
  if (fromIdx<0||toIdx<0) { _blocDragId=null; return; }
  order.splice(fromIdx, 1); order.splice(toIdx, 0, _blocDragId);
  if(!_D.settings) _D.settings={};
  _D.settings.bloc_order = order;
  saveData(); renderAll();
  toast('Ordre des blocs sauvegardé.','success');
  _blocDragId = null;
}

function switchEditionTab(tab) {
  _editionTab = tab;
  _setHash('edition', tab);
  document.querySelectorAll('.edition-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  _syncEditionViewToggle(tab);

  const mainLayout      = document.getElementById('edition-layout-main');
  const mappingPanel    = document.getElementById('edition-mapping-panel');
  const labelsPanel     = document.getElementById('edition-labels-panel');
  const orphansPanel    = document.getElementById('edition-orphans-panel');
  const persoObjetsPanel= document.getElementById('edition-persoobjets-panel');
  const newBtn          = document.getElementById('edition-new-btn');
  const tabsRow         = document.getElementById('edition-tabs-row');

  if (tab === 'mapping') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = '';
    if (labelsPanel)  labelsPanel.style.display  = 'none';
    if (orphansPanel) orphansPanel.style.display = 'none';
    if (persoObjetsPanel) persoObjetsPanel.style.display = 'none';
    if (newBtn)       newBtn.style.display       = 'none';
    initMappingView();
    return;
  }

  if (tab === 'labels') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = 'none';
    if (labelsPanel)  labelsPanel.style.display  = '';
    if (orphansPanel) orphansPanel.style.display = 'none';
    if (persoObjetsPanel) persoObjetsPanel.style.display = 'none';
    if (newBtn)       newBtn.style.display       = 'none';
    renderLabelsList();
    return;
  }

  if (tab === 'orphans') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = 'none';
    if (labelsPanel)  labelsPanel.style.display  = 'none';
    if (orphansPanel) orphansPanel.style.display = '';
    if (persoObjetsPanel) persoObjetsPanel.style.display = 'none';
    if (newBtn)       newBtn.style.display       = 'none';
    initOrphanCardsView();
    return;
  }

  if (tab === 'persoobjets') {
    if (mainLayout)   mainLayout.style.display  = 'none';
    if (mappingPanel) mappingPanel.style.display = 'none';
    if (labelsPanel)  labelsPanel.style.display  = 'none';
    if (orphansPanel) orphansPanel.style.display = 'none';
    if (persoObjetsPanel) persoObjetsPanel.style.display = '';
    if (newBtn)       newBtn.style.display       = 'none';
    initPkoEditionView();
    return;
  }

  if (mainLayout)   mainLayout.style.display  = '';
  if (mappingPanel) mappingPanel.style.display = 'none';
  if (labelsPanel)  labelsPanel.style.display  = 'none';
  if (orphansPanel) orphansPanel.style.display = 'none';
  if (persoObjetsPanel) persoObjetsPanel.style.display = 'none';
  if (newBtn)       newBtn.style.display       = '';

  resetEditionForm();
  renderEditionList();
  newBtn.textContent = tab === 'blocs' ? '+ Nouveau bloc' : '+ Nouvelle extension';
  document.getElementById('edit-form-hint').textContent = tab === 'blocs'
    ? 'Blocs intégrés : surcharge nom/sigle/couleur. Blocs custom : création libre.'
    : 'Extensions intégrées : surcharge. Extensions custom : création libre.';
}

// Le bouton grille/liste du header (#topbar-view-toggle) est réutilisé pour
// TOUS les sous-onglets d'Édition ayant un mode d'affichage (Blocs/
// Extensions, Mapping TCG, Labels, Perso. & Objets) plutôt que d'avoir un
// bouton local par panneau — masqué seulement pour Cartes orphelines, qui
// n'a pas cette notion. Chaque sous-onglet garde son propre mode mémorisé
// (voir _viewModeStorageKey dans core.js), donc passer de l'un à l'autre ne
// perd jamais le choix fait sur les autres.
function _syncEditionViewToggle(tab) {
  const toggle = document.getElementById('topbar-view-toggle');
  if (!toggle) return;
  const show = ['blocs','exts','mapping','labels','persoobjets'].includes(tab);
  toggle.style.display = show ? 'flex' : 'none';
  if (!show) return;
  const key = tab === 'mapping' ? 'mapping' : tab === 'labels' ? 'labels' : tab === 'persoobjets' ? 'persoobjets' : 'edition';
  const mode = _tabViewModes[key] || 'grid';
  toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
}

// ── Cartes orphelines ────────────────────────────────────────────────────
// Détecte les cartes de la table Supabase "cards" dont le nom ne correspond
// (avec ou sans accent — voir _accentVariants dans pokedex.js) à AUCUN nom
// connu du Pokédex (Pokémon de base ou forme) : ce sont exactement les
// cartes qu'aucune recherche (fiche Pokédex, sélecteur de carte Ventes/
// Dépenses) ne peut jamais retrouver, quoi que l'utilisateur tape — le même
// mécanisme d'ancrage (nom entier, ou suivi d'un espace/tiret) que la
// recherche elle-même est reproduit ici pour que le diagnostic soit fiable.
var _orphanCards = { rows: [], query: '', categoryFilter: 'all', initialized: false, loading: false, knownSet: null };

function _canonPokeName(s) {
  return _normalizeStr(s).replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();
}

function _cardNameMatchesKnown(cardName, knownSet) {
  const norm = _canonPokeName(cardName||'');
  if (!norm) return false;
  if (knownSet.has(norm)) return true;
  const tokens = norm.split(' ');
  let acc = '';
  for (let i = 0; i < tokens.length; i++) {
    acc = acc ? acc + ' ' + tokens[i] : tokens[i];
    if (knownSet.has(acc)) return true;
  }
  return false;
}

// Variante "contient n'importe où" de _cardNameMatchesKnown (qui, elle, est
// ancrée en PRÉFIXE — adaptée aux Pokémon). Un Personnage/Objet peut au
// contraire apparaître n'importe où dans le titre d'une carte (ex. "Ordres
// de Sacha") : on compare par TOKENS ENTIERS (jamais une simple inclusion de
// sous-chaîne, voir _tokensContainSeq dans perso-objets.js).
//
// BUG corrigé : cette fonction tokenisait `cardName` avec _canonPokeName
// (qui ne découpe PAS sur les apostrophes ni la ponctuation, ex. "d'Ondine"
// reste un seul token "d'ondine"), alors que le regroupement Personnages/
// Objets (perso-objets.js) tokenise avec _pkoNormTokens (qui découpe bien
// "d'Ondine" en deux tokens "d"/"ondine"). Résultat : une carte correctement
// rattachée à une fiche Personnage pouvait quand même être signalée comme
// orpheline, dès que son titre contenait une apostrophe, un "&" ou toute
// ponctuation non gérée par _canonPokeName. On retokenise maintenant les
// DEUX côtés avec _pkoNormTokens au moment de la comparaison — peu importe
// comment `knownSet` a été construit en amont — pour garantir la même
// normalisation que celle qui a servi à décider l'appartenance de la carte.
function _cardNameContainsKnown(cardName, knownSet) {
  const tokens = _pkoNormTokens(cardName || '');
  if (!tokens.length) return false;
  for (const known of knownSet) {
    const kTokens = _pkoNormTokens(known);
    if (kTokens.length && _tokensContainSeq(tokens, kTokens)) return true;
  }
  return false;
}

async function initOrphanCardsView() {
  if (_orphanCards.initialized) { renderOrphanCardsList(); return; }
  const el = document.getElementById('orphan-cards-list');
  if (!el || _orphanCards.loading) return;
  _orphanCards.loading = true;
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2);font-size:.82rem">Chargement du Pokédex (noms français)…</div>';
  try {
    if (!_pkdx.initialized) await initPokedex();
    if (!_mapping.initialized) await initMappingView();
    // Personnages/Objets/Lieux/Énergies (perso-objets.js) : chargés ici
    // aussi (entrées créées à la main, chargement quasi instantané depuis
    // _D — plus de catalogue à fetcher) pour que leurs cartes ne soient plus
    // signalées à tort comme orphelines.
    if (typeof _pkoInitTab === 'function' && typeof PKO_KINDS !== 'undefined') {
      await Promise.all(PKO_KINDS.filter(k => !_pko.initialized[k]).map(k => _pkoInitTab(k)));
    }

    // Noms Pokémon (base + formes + tous motifs préfixe/suffixe de label) —
    // voir _buildKnownPokemonNameSet (pokedex.js) pour le détail : une carte
    // qui ne matche AUCUNE de ces variantes n'est trouvable par AUCUNE
    // recherche de l'appli (fiche Pokédex, sélecteur de carte) et doit
    // ressortir comme orpheline.
    const known = _buildKnownPokemonNameSet();
    _orphanCards.knownSet = known;

    // Noms Personnages/Objets/Lieux/Énergies connus (catalogue TCGdex +
    // entrées manuelles), avec les mêmes variantes accentuées — comparés en
    // mode "contient n'importe où" (_cardNameContainsKnown), pas en préfixe,
    // puisqu'un Personnage/Objet/Lieu/Énergie peut apparaître n'importe où
    // dans le titre. Gardés SÉPARÉS par catégorie (pas fusionnés) :
    // nécessaire pour vérifier qu'une catégorie forcée correspond bien à une
    // fiche réelle de CETTE catégorie précise (voir plus bas).
    const pkoKnownByKind = {};
    if (typeof _pko !== 'undefined' && typeof PKO_KINDS !== 'undefined') {
      PKO_KINDS.forEach(kind => {
        pkoKnownByKind[kind] = new Set();
        (_pko.entries[kind] || []).forEach(e => _accentVariants(e.displayName).forEach(v => pkoKnownByKind[kind].add(_canonPokeName(v))));
      });
    }
    const pkoKnown = new Set();
    Object.values(pkoKnownByKind).forEach(set => set.forEach(v => pkoKnown.add(v)));
    _orphanCards.pkoKnownSet = pkoKnown;

    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text2);font-size:.82rem">Chargement des cartes…</div>';
    let allRows = [], offset = 0, pageSize = 1000;
    while (true) {
      const res = await fetch(
        `${SB_URL}/rest/v1/cards?select=id,name,set_id,set_name,image_url,number,rarity,cardmarket_url&order=name.asc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range-Unit': 'items', 'Range': `${offset}-${offset+pageSize-1}` } }
      );
      const rows = await res.json();
      if (!rows.length) break;
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) break;
      offset += pageSize;
    }

    // Combine le test rapide (Set de chaînes exactes) et, seulement s'il
    // échoue, le repli qui réutilise _cardMatchesFormType — voir le
    // commentaire de _cardMatchesSomeLabeledPokemon (pokedex.js) pour le
    // détail du bug que ce repli corrige (carte trouvable sur sa fiche
    // Pokémon mais quand même signalée orpheline).
    const isKnownPokemonCard = name =>
      _cardNameMatchesKnown(name, known) ||
      (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(name));

    _orphanCards.rows = allRows.filter(c => {
      // Une catégorie forcée (Édition ou fiche carte, voir perso-objets.js)
      // tranche explicitement : "pokemon" reste évalué comme un Pokémon
      // (toujours soumis au test de trouvabilité normal). Pour les 3 autres
      // catégories, en revanche, forcer ne suffit PAS à rendre la carte
      // trouvable si son nom ne correspond au final à AUCUNE fiche de cette
      // catégorie (_fetchLocalCardsContainingName, perso-objets.js, exige
      // toujours que le nom matche l'entrée visée) — sans cette
      // vérification, la carte disparaissait purement et simplement des
      // Orphelines sans jamais apparaître nulle part ailleurs, pire
      // qu'orpheline. On ne la retire donc de la liste que si elle est
      // réellement rattachable à une fiche de la catégorie forcée.
      const forced = typeof _cardCategoryOverride === 'function' ? _cardCategoryOverride(c.id) : '';
      if (forced === 'pokemon') return !isKnownPokemonCard(c.name);
      if (forced && pkoKnownByKind[forced]) return !_cardNameContainsKnown(c.name, pkoKnownByKind[forced]);
      return !isKnownPokemonCard(c.name) && !_cardNameContainsKnown(c.name, pkoKnown);
    });
    _orphanCards.initialized = true;
    renderOrphanCardsList();
  } catch(e) {
    el.innerHTML = `<p style="color:var(--accent2);font-size:.82rem;padding:16px">Erreur : ${e.message}</p>`;
  }
  _orphanCards.loading = false;
}

function refreshOrphanCardsList() {
  _orphanCards.initialized = false;
  initOrphanCardsView();
}

function filterOrphanCardsList(q) {
  _orphanCards.query = q;
  renderOrphanCardsList();
}

// Filtre la liste par catégorie FORCÉE (voir _cardCategoryOverride,
// perso-objets.js) — 'none' = aucune catégorie forcée, 'all' = tout affiché.
// Une carte peut rester orpheline même après avoir reçu une catégorie
// forcée si aucune fiche de cette catégorie ne matche encore son nom (voir
// initOrphanCardsView) : ce filtre sert surtout à repérer d'un coup d'œil,
// par exemple, toutes les cartes déjà taguées "Personnage" qui attendent
// encore la création de leur fiche.
function setOrphanCategoryFilter(cat, btn) {
  _orphanCards.categoryFilter = cat;
  document.querySelectorAll('#orphans-category-filter-bar .booster-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOrphanCardsList();
}

// Même affichage qu'une fiche Pokédex (_renderTcgCardGroupsHtml, dans
// pokedex.js) : une extension par ligne, triées par bloc puis extension,
// cartes triées par numéro à l'intérieur (_groupCardsByExtension gère les
// deux). Cliquer sur une carte ouvre la MÊME modale de détail que le
// Pokédex (openCardDetailModal), avec zoom, nom/image/lien CardMarket
// éditables et bouton de suppression.
function renderOrphanCardsList() {
  const el = document.getElementById('orphan-cards-list'); if (!el) return;
  const counter = document.getElementById('orphans-counter');
  let rows = _orphanCards.rows;
  if (_orphanCards.categoryFilter && _orphanCards.categoryFilter !== 'all' && typeof _cardCategoryOverride === 'function') {
    rows = rows.filter(c => {
      const forced = _cardCategoryOverride(c.id) || '';
      return _orphanCards.categoryFilter === 'none' ? !forced : forced === _orphanCards.categoryFilter;
    });
  }
  if (_orphanCards.query) {
    const q = _normalizeStr(_orphanCards.query);
    rows = rows.filter(c => _normalizeStr(c.name||'').includes(q));
  }
  if (counter) counter.textContent = `${rows.length} carte${rows.length>1?'s':''} introuvable${rows.length>1?'s':''}`;
  if (!rows.length) {
    el.innerHTML = `<p style="color:var(--text2);font-size:.82rem;padding:16px 0">${_orphanCards.rows.length ? 'Aucun résultat pour ce filtre.' : 'Aucune carte orpheline trouvée 🎉'}</p>`;
    return;
  }
  const groups = _groupCardsByExtension(rows);
  const cardsById = new Map();
  rows.forEach(c => cardsById.set(String(c.id), c));
  // Réutilise le même état global que la fiche Pokédex pour que
  // openCardDetailModal/saveCardEdits/deleteCardFromDb (pokedex.js)
  // fonctionnent tels quels depuis cet onglet.
  if (typeof _pkoCurrentModal !== 'undefined') _pkoCurrentModal = null;
  _pkdxModalTcg = { groups, cardsById };
  el.innerHTML = _renderTcgCardGroupsHtml(groups, c => "openCardDetailModal('" + _escJs(String(c.id)) + "')");
}

// Appelés par saveCardEdits/deleteCardFromDb (pokedex.js) après une
// modification, pour que cet onglet reste synchronisé qu'il soit ou non la
// vue active (ex. une carte renommée peut redevenir trouvable et doit
// disparaître de la liste).
function _syncOrphanCardsAfterEdit(cardId, changes) {
  const card = _orphanCards.rows.find(c => String(c.id) === String(cardId));
  if (!card) return;
  Object.assign(card, changes);
  const nowKnown =
    (_orphanCards.knownSet && (_cardNameMatchesKnown(card.name, _orphanCards.knownSet) ||
      (typeof _cardMatchesSomeLabeledPokemon === 'function' && _cardMatchesSomeLabeledPokemon(card.name)))) ||
    (_orphanCards.pkoKnownSet && _cardNameContainsKnown(card.name, _orphanCards.pkoKnownSet));
  if (nowKnown) {
    _orphanCards.rows = _orphanCards.rows.filter(c => String(c.id) !== String(cardId));
  }
  if (_editionTab === 'orphans') renderOrphanCardsList();
}
function _syncOrphanCardsAfterDelete(cardId) {
  _orphanCards.rows = _orphanCards.rows.filter(c => String(c.id) !== String(cardId));
  if (_editionTab === 'orphans') renderOrphanCardsList();
}

function editBloc(blocId) {
  _editingBlocId=blocId; _editingExtId=null; _editingIsCustom=false;
  const b=getBlocs().find(b=>b.id===blocId); if(!b)return;
  document.getElementById('edit-code').value    = b.short  || '';
  document.getElementById('edit-nom').value     = b.nom    || '';
  document.getElementById('edit-nb').value      = '';
  document.getElementById('edit-logo').value    = b.logo   || '';
  const sBl = document.getElementById('edit-sigle'); if(sBl) sBl.value = b.sigle||'';
  document.getElementById('edit-couleur').value = b.couleur|| '#888888';
  previewEditionImg(b.logo||'');
  document.getElementById('edit-save-lbl').textContent     = 'Enregistrer';
  document.getElementById('edit-cancel-btn').style.display = '';
  document.getElementById('edition-form-title').textContent= 'Modifier le bloc';
  document.getElementById('edit-nb-field').style.display   = 'none';
  document.getElementById('edit-bloc-field').style.display = 'none';
  const smB = document.getElementById('edit-stat-mode-field'); if(smB) smB.style.display='none';
}

function editExt(id,isCustom) {
  _editingExtId=id; _editingIsCustom=isCustom; _editingBlocId=null;
  let e=isCustom?(_D.custom_exts||[]).find(ex=>ex.id===id):getAllExtensions().find(ex=>ex.id===id&&ex._builtin);
  if(!e)return;
  document.getElementById('edit-code').value    = e.code    ||'';
  document.getElementById('edit-nom').value     = e.nom     ||'';
  document.getElementById('edit-nb').value      = e.nb_cartes||'';
  document.getElementById('edit-logo').value    = e.logo    ||'';
  const sigleEl = document.getElementById('edit-sigle'); if(sigleEl) sigleEl.value = e.sigle||'';
  document.getElementById('edit-couleur').value = e.couleur || (e._bloc?e._bloc.couleur:getBlocForExt(id)?.couleur||'#e63946');
  const smEl = document.getElementById('edit-stat-mode'); if(smEl) smEl.value = e.stat_mode||'all';
  const bloc=e._bloc||getBlocForExt(id);
  document.getElementById('edit-bloc').value=e.bloc_id||bloc?.id||'';
  previewEditionImg(e.logo||'');
  document.getElementById('edit-save-lbl').textContent     = 'Enregistrer';
  document.getElementById('edit-cancel-btn').style.display = '';
  document.getElementById('edition-form-title').textContent= 'Modifier l\'extension';
  document.getElementById('edit-nb-field').style.display   = '';
  document.getElementById('edit-logo-field').style.display = '';
  document.getElementById('edit-bloc-field').style.display = '';
  const smF = document.getElementById('edit-stat-mode-field'); if(smF) smF.style.display='block';
}

function saveEditionItem() {
  if (_editingBlocId) {
    const short=document.getElementById('edit-code').value.trim().toUpperCase();
    const nom=document.getElementById('edit-nom').value.trim();
    const couleur=document.getElementById('edit-couleur').value;
    const logo=document.getElementById('edit-logo').value.trim();
    const sigleEl2=document.getElementById('edit-sigle'); const sigle=sigleEl2?sigleEl2.value.trim():'';
    if(!short||!nom){toast('Nom et sigle obligatoires.','error');return;}
    const cb=(_D.custom_blocs||[]).find(b=>b.id===_editingBlocId);
    if(cb){Object.assign(cb,{short,nom,couleur,logo,sigle});}
    else {if(!_D.bloc_overrides)_D.bloc_overrides={};_D.bloc_overrides[_editingBlocId]={short,nom,couleur,logo,sigle};}
    toast('Bloc mis à jour !','success');
    saveData();renderAll();resetEditionForm();return;
  }

  const code=document.getElementById('edit-code').value.trim().toUpperCase();
  const nom=document.getElementById('edit-nom').value.trim();
  const nb=parseInt(document.getElementById('edit-nb').value)||0;
  const blocId=document.getElementById('edit-bloc').value;
  const logo=document.getElementById('edit-logo').value.trim();
  const sigleEl=document.getElementById('edit-sigle'); const sigle=sigleEl?sigleEl.value.trim():'';
  const couleur=document.getElementById('edit-couleur').value;
  const statModeSel=document.getElementById('edit-stat-mode');
  const stat_mode = statModeSel ? statModeSel.value : 'all';
  if(!code||!nom){toast('Code et nom obligatoires.','error');return;}

  if(_editingExtId){
    if(_editingIsCustom){
      const ex=(_D.custom_exts||[]).find(e=>e.id===_editingExtId);
      if(ex)Object.assign(ex,{code,nom,nb_cartes:nb,bloc_id:blocId,logo,sigle,couleur,stat_mode,sorti:true});
    } else {
      if(!_D.ext_overrides)_D.ext_overrides={};
      _D.ext_overrides[_editingExtId]={code,nom,nb_cartes:nb,logo,sigle,couleur,stat_mode};
      if(blocId) _D.ext_overrides[_editingExtId].bloc_id_override = blocId;
    }
    toast('Extension mise à jour !','success');
  } else {
    if(_editionTab==='blocs'){
      if(!_D.custom_blocs)_D.custom_blocs=[];
      _D.custom_blocs.push({id:'cb_'+Date.now(),short:code,nom,couleur,logo,extensions:[],_custom_bloc:true});
      toast('Bloc créé !','success');
    } else {
      if(!blocId){toast('Choisissez un bloc.','error');return;}
      if(!_D.custom_exts)_D.custom_exts=[];
      _D.custom_exts.push({id:'cx_'+Date.now(),code,nom,nb_cartes:nb,bloc_id:blocId,logo,sigle,couleur,stat_mode,sorti:true,_custom:true});
      toast('Extension ajoutée !','success');
    }
  }
  saveData();renderAll();resetEditionForm();
}

function deleteCustomExt(id){
  if(!confirm('Supprimer cette extension ?'))return;
  _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.id!==id);
  // Nettoyage des données liées : sans ça, la collection/les boosters de
  // cette extension restent en mémoire pointant vers un ext_id qui n'existe
  // plus, ce qui fait échouer la synchro cloud (clé étrangère violée).
  delete (_D.collection||{})[id];
  delete (_D.boosters_data||{})[id];
  (_D.classeurs||[]).forEach(cl=>{ cl.extensions=(cl.extensions||[]).filter(e=>e.ext_id!==id); });
  saveData();renderAll();toast('Extension supprimée.','success');
}

// Delete any ext — custom: remove from array; built-in: mark as hidden via override
function deleteAnyExt(id, isCustom){
  if(!confirm('Supprimer cette extension ? Les données de collection associées seront perdues.'))return;
  if(isCustom){
    _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.id!==id);
  } else {
    if(!_D.ext_overrides)_D.ext_overrides={};
    if(!_D.ext_overrides[id])_D.ext_overrides[id]={};
    _D.ext_overrides[id]._hidden=true;
  }
  delete (_D.collection||{})[id];
  delete (_D.boosters_data||{})[id];
  (_D.classeurs||[]).forEach(cl=>{ cl.extensions=(cl.extensions||[]).filter(e=>e.ext_id!==id); });
  saveData();renderAll();toast('Extension supprimée.','success');
}

function deleteCustomBloc(id){
  if(!confirm('Supprimer ce bloc ? Les extensions custom de ce bloc seront aussi supprimées.'))return;
  _D.custom_blocs=(_D.custom_blocs||[]).filter(b=>b.id!==id);
  _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.bloc_id!==id);
  saveData();renderAll();toast('Bloc supprimé.','success');
}

// Delete any bloc — custom: remove; built-in: mark hidden
function deleteAnyBloc(id, isCustom){
  if(!confirm('Masquer ce bloc et toutes ses extensions ?'))return;
  if(isCustom){
    _D.custom_blocs=(_D.custom_blocs||[]).filter(b=>b.id!==id);
    _D.custom_exts=(_D.custom_exts||[]).filter(e=>e.bloc_id!==id);
  } else {
    if(!_D.bloc_overrides)_D.bloc_overrides={};
    if(!_D.bloc_overrides[id])_D.bloc_overrides[id]={};
    _D.bloc_overrides[id]._hidden=true;
    // Hide all built-in exts in that bloc
    const tplBloc=(_D._tpl_blocs||(window.__PC_DATA__ && window.__PC_DATA__.blocs)||[]).find(b=>b.id===id);
    if(tplBloc){
      (tplBloc.extensions||[]).forEach(e=>{
        if(!_D.ext_overrides)_D.ext_overrides={};
        if(!_D.ext_overrides[e.id])_D.ext_overrides[e.id]={};
        _D.ext_overrides[e.id]._hidden=true;
      });
    }
  }
  saveData();renderAll();toast('Bloc masqué.','success');
}

function resetEditionForm(){
  _editingBlocId=null;_editingExtId=null;_editingIsCustom=false;
  ['edit-code','edit-nom','edit-nb','edit-logo','edit-sigle'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  // La couleur n'est PAS réinitialisée ici : comme le bloc choisi, on garde
  // la dernière couleur utilisée pour ne pas avoir à la re-sélectionner à
  // chaque nouvelle extension (elle repart quand même à jour via l'auto-fill
  // de populateBlocSelect si l'utilisateur change de bloc).
  const p=document.getElementById('edition-preview');if(p)p.innerHTML='<span>Aperçu</span>';
  document.getElementById('edit-save-lbl').textContent     = _editionTab==='blocs'?'Créer':'Ajouter';
  document.getElementById('edit-cancel-btn').style.display = 'none';
  document.getElementById('edition-form-title').textContent= _editionTab==='blocs'?'Nouveau bloc':'Nouvelle extension';
  document.getElementById('edit-nb-field').style.display   = _editionTab!=='blocs'?'':'none';
  document.getElementById('edit-logo-field').style.display = '';
  document.getElementById('edit-bloc-field').style.display = _editionTab==='exts'?'':'none';
  const smR=document.getElementById('edit-stat-mode-field');if(smR)smR.style.display=_editionTab!=='blocs'?'block':'none';
  const smSel=document.getElementById('edit-stat-mode');if(smSel)smSel.value='all';
  const bs=document.getElementById('edit-bloc');if(bs)bs.disabled=false;
}

function previewEditionImg(url){
  const p=document.getElementById('edition-preview');if(!p)return;
  p.innerHTML=url?`<img src="${url}" onerror="this.parentNode.innerHTML='<span>Image non accessible</span>'">`:'<span>Aperçu</span>';
}

function populateBlocSelect(){
  const sel=document.getElementById('edit-bloc');if(!sel)return;
  const cur=sel.value;
  sel.innerHTML='<option value="">— Choisir un bloc —</option>';
  getBlocs().forEach(b=>{
    const opt=document.createElement('option');
    opt.value=b.id;opt.textContent=`${b.short} – ${b.nom}`;
    opt.dataset.couleur=b.couleur||'';
    sel.appendChild(opt);
  });
  if(cur)sel.value=cur;
  // Auto-fill color on change — only if user hasn't manually set a color
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    const couleurInput = document.getElementById('edit-couleur');
    // Only auto-fill if editing a NEW item (not editing existing) or color unchanged from last auto-fill
    if (couleurInput && opt && opt.dataset.couleur && !_editingExtId && !_editingBlocId) {
      couleurInput.value = opt.dataset.couleur;
    }
  };
}

// ── Statistics ──────────────────────────────────────────────────────────────
function renderStats(){
  const c=document.getElementById('stats-container');if(!c)return;
  c.innerHTML='';
  let tC=0,tO=0;
  const byBloc=[];
  getBlocs().forEach(bloc=>{
    let bT=0,bO=0;
    const exts=[
      ...(bloc.extensions||[]).map(e=>({...e,...((_D.ext_overrides||{})[e.id]||{})})).filter(e=>e.sorti&&(e.stat_mode||'all')!=='boosters_only'),
      ...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id&&(e.stat_mode||'all')!=='boosters_only')
    ];
    exts.forEach(e=>{bT+=e.nb_cartes||0;bO+=ownedCount(e.id);});
    tC+=bT;tO+=bO;
    byBloc.push({nom:bloc.nom,short:bloc.short,couleur:bloc.couleur,bT,bO,pct:bT>0?Math.round(bO/bT*100):0});
  });
  const bd=_D.boosters_data||{};
  let ilT=0,ilO=0;
  const ilByBloc=[];
  getBlocs().forEach(bloc=>{
    let bT=0,bO=0;
    const exts=[...(bloc.extensions||[]).filter(e=>e.sorti),...(_D.custom_exts||[]).filter(e=>e.bloc_id===bloc.id)];
    exts.forEach(e=>{const arr=bd[e.id]||[];bT+=arr.length;bO+=arr.filter(il=>il.obtained!==false).length;});
    ilT+=bT;ilO+=bO;
    if(bT>0)ilByBloc.push({nom:bloc.nom,short:bloc.short,couleur:bloc.couleur,bT,bO,pct:bT>0?Math.round(bO/bT*100):0});
  });
  const gC=tC>0?Math.round(tO/tC*100):0,gI=ilT>0?Math.round(ilO/ilT*100):0;
  c.innerHTML=`
    <div class="stats-overview">
      <div class="stat-big-card" style="--accent-color:${pctTxt(gC)}">
        <div class="sbc-label">Complétion cartes</div>
        <div class="sbc-val" style="color:${pctTxt(gC)}">${gC}%</div>
        <div class="sbc-sub">${tO.toLocaleString('fr')} / ${tC.toLocaleString('fr')}</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:${gC}%;background:${pctBg(gC)}"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:${pctTxt(gI)}">
        <div class="sbc-label">Illustrations obtenues</div>
        <div class="sbc-val" style="color:${pctTxt(gI)}">${gI}%</div>
        <div class="sbc-sub">${ilO} / ${ilT}</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:${gI}%;background:${pctBg(gI)}"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:var(--green)">
        <div class="sbc-label">Classeurs</div>
        <div class="sbc-val">${_D.classeurs.length}</div>
        <div class="sbc-sub">${_D.classeurs.reduce((a,cl)=>{const s=cl.slots_par_page||18;let f=0;(cl.extensions||[]).forEach(ce=>f+=Math.min(ce.filled||0,(ce.pages||0)*s));return a+f;},0)} slots remplis</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:100%;background:var(--green)"></div></div>
      </div>
      <div class="stat-big-card" style="--accent-color:var(--gold)">
        <div class="sbc-label">Blocs</div>
        <div class="sbc-val">${getBlocs().length}</div>
        <div class="sbc-sub">${getAllExtensions().filter(e=>e.sorti||e._custom).length} extensions actives</div>
        <div class="sbc-bar"><div class="sbc-fill" style="width:100%;background:var(--gold)"></div></div>
      </div>
    </div>
    <div class="stats-two-col">
      <div class="stats-panel">
        <div class="stats-panel-title">Complétion par bloc — Cartes</div>
        <div class="stats-bloc-list">
          ${byBloc.filter(b=>b.bT>0).sort((a,b)=>b.pct-a.pct).map(b=>`
            <div class="stats-bloc-row">
              <div class="stats-bloc-dot" style="background:${b.couleur}"></div>
              <div class="stats-bloc-name">${b.short}</div>
              <div class="stats-bloc-bar-wrap"><div class="stats-bloc-bar">
                <div class="stats-bloc-fill" style="width:${b.pct}%;background:${pctBg(b.pct)}"></div>
              </div></div>
              <div class="stats-bloc-pct" style="color:${pctTxt(b.pct)}">${b.pct}%</div>
              <div class="stats-bloc-detail">${b.bO}/${b.bT}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="stats-panel">
        <div class="stats-panel-title">Illustrations obtenues par bloc</div>
        ${ilByBloc.length===0?'<div class="empty-state" style="padding:24px 0"><p>Aucune illustration.</p></div>':`
          <div class="stats-bloc-list">${ilByBloc.sort((a,b)=>b.pct-a.pct).map(b=>`
            <div class="stats-bloc-row">
              <div class="stats-bloc-dot" style="background:${b.couleur}"></div>
              <div class="stats-bloc-name">${b.short}</div>
              <div class="stats-bloc-bar-wrap"><div class="stats-bloc-bar">
                <div class="stats-bloc-fill" style="width:${b.pct}%;background:${pctBg(b.pct)}"></div>
              </div></div>
              <div class="stats-bloc-pct" style="color:${pctTxt(b.pct)}">${b.pct}%</div>
              <div class="stats-bloc-detail">${b.bO}/${b.bT}</div>
            </div>`).join('')}</div>`}
      </div>
    </div>
    <div class="stats-panel" style="margin-top:16px">
      <div class="stats-panel-title">Top 10 extensions les mieux complétées</div>
      <div class="stats-top-list">
        ${getAllExtensions().filter(e=>(e.sorti||e._custom)&&(e.nb_cartes||0)>0)
          .map(e=>({e,pct:Math.round(ownedCount(e.id)/e.nb_cartes*100)}))
          .sort((a,b)=>b.pct-a.pct).slice(0,10)
          .map(({e,pct})=>`<div class="stats-top-row">
            <div class="stats-top-color" style="background:${extColor(e)}"></div>
            <div class="stats-top-code" style="color:${extColor(e)}">${e.code}</div>
            <div class="stats-top-name">${e.nom}</div>
            <div class="stats-top-bar-wrap"><div class="stats-top-bar">
              <div class="stats-top-fill" style="width:${pct}%;background:${pctBg(pct)}"></div>
            </div></div>
            <div class="stats-top-pct" style="color:${pctTxt(pct)}">${pct}%</div>
          </div>`).join('')||'<div class="empty-state" style="padding:20px 0"><p>Aucune donnée.</p></div>'}
      </div>
    </div>`;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function switchView(view,btn){
  _currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  if(btn)btn.classList.add('active');
  const titles={extensions:'Extensions',classeurs:'Classeurs',boosters:'Boosters / Illustrations',goodies:'Goodies',statistiques:'Statistiques',edition:'Édition',parametres:'Paramètres',pokedex:'Pokédex',personnages:'Personnages',objets:'Objets',lieux:'Lieux',energies:'Énergies',ventes:'Ventes',acheteurs:'Acheteurs',depenses:'Dépenses',vendeurs:'Vendeurs',bilan:'Bilan'};
  document.getElementById('topbar-title').textContent=titles[view]||view;
  const showSearch=view==='extensions';
  const showToggle=['extensions','classeurs','boosters','goodies','edition','ventes','acheteurs','depenses','vendeurs'].includes(view);
  const showCompactMode=['ventes','depenses'].includes(view);
  document.getElementById('topbar-search-wrap').style.display  =showSearch?'flex':'none';
  document.getElementById('topbar-view-toggle').style.display  =showToggle?'flex':'none';
  document.getElementById('topbar-view-toggle-compact').style.display = showCompactMode?'':'none';
  if (showToggle) {
    const mode = _tabViewModes[view] || 'grid';
    const toggleBtns = document.querySelectorAll('#topbar-view-toggle button');
    toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  }
  document.getElementById('global-progress-wrap').style.display=showSearch?'flex':'none';
  closeDetail();
  if(view==='edition'){populateBlocSelect();renderEditionList();}
  if(view==='statistiques')renderStats();
  if(view==='parametres')initSettingsView();
  if(view==='pokedex')initPokedex();
  if(view==='personnages')initPersonnages();
  if(view==='objets')initObjets();
  if(view==='lieux')initLieux();
  if(view==='energies')initEnergies();
  if(['ventes','acheteurs','depenses','vendeurs'].includes(view) && typeof initMappingView==='function' && !_mapping.initialized) initMappingView();
  if(view==='ventes')renderVentes();
  if(view==='acheteurs')renderAcheteurs();
  if(view==='depenses')renderDepenses();
  if(view==='vendeurs')renderVendeurs();
  if(view==='bilan')renderBilan();
  if(view==='goodies')renderGoodies();
  // Le sous-onglet d'Édition (#/edition/mapping) est géré uniquement par
  // switchEditionTab, pas ici — sinon les deux se marchent dessus au moment
  // où on arrive sur #/edition/xxx directement par l'URL.
  _setHash(view, null);
}

// ── Modals ─────────────────────────────────────────────────────────────────
function closeModal(id){
  document.getElementById(id).classList.remove('open');
  if(id==='modal-classeur')delete document.getElementById('modal-classeur').dataset.editId;
  if(id==='modal-acheteur' && (_acheteurReturnTo==='vente' || _acheteurReturnTo==='vente-split')){
    const isSplit = _acheteurReturnTo === 'vente-split';
    document.getElementById(isSplit ? 'modal-vente-split' : 'modal-vente').classList.add('open');
    if (_lastCreatedAcheteurId) {
      if (isSplit) {
        populateAcheteurSelect(_lastCreatedAcheteurId, 'vente-split-acheteur-select');
        populateVenteCommandeSelect(_lastCreatedAcheteurId, null, 'vente-split-commande-select', 'vente-split-commande-preview');
      } else {
        populateAcheteurSelect(_lastCreatedAcheteurId);
        populateVenteCommandeSelect(_lastCreatedAcheteurId, null);
      }
    }
    _acheteurReturnTo = null; _lastCreatedAcheteurId = null;
  }
  if(id==='modal-vendeur' && _vendeurReturnTo==='depense'){
    document.getElementById('modal-depense').classList.add('open');
    if (_lastCreatedVendeurId) {
      populateVendeurSelect(_lastCreatedVendeurId);
      populateDepenseCommandeSelect(_lastCreatedVendeurId, null);
    }
    _vendeurReturnTo = null; _lastCreatedVendeurId = null;
  }
  if(id==='modal-acheteur-commande' && (_acheteurCommandeReturnTo==='vente' || _acheteurCommandeReturnTo==='vente-split')){
    const isSplit = _acheteurCommandeReturnTo === 'vente-split';
    document.getElementById(isSplit ? 'modal-vente-split' : 'modal-vente').classList.add('open');
    if (_lastCreatedAcheteurCommandeId) {
      if (isSplit) {
        populateVenteCommandeSelect(document.getElementById('vente-split-acheteur-select').value, _lastCreatedAcheteurCommandeId, 'vente-split-commande-select', 'vente-split-commande-preview');
      } else {
        populateVenteCommandeSelect(document.getElementById('vente-acheteur-select').value, _lastCreatedAcheteurCommandeId);
        setVenteStatusInput('vendue');
      }
    }
    _acheteurCommandeReturnTo = null; _lastCreatedAcheteurCommandeId = null;
  }
  if(id==='modal-vendeur-commande' && _vendeurCommandeReturnTo==='depense'){
    document.getElementById('modal-depense').classList.add('open');
    if (_lastCreatedVendeurCommandeId) {
      populateDepenseCommandeSelect(document.getElementById('depense-vendeur-select').value, _lastCreatedVendeurCommandeId);
    }
    _vendeurCommandeReturnTo = null; _lastCreatedVendeurCommandeId = null;
  }
}

// ── Paramètres ─────────────────────────────────────────────────────────────
function initCloud(){
  const cfg=window.__PC_CLOUD_CONFIG__||{};
  const u=document.getElementById('cfg-url');if(u)u.value=cfg.url||'';
  const k=document.getElementById('cfg-key');if(k)k.value=cfg.key||'';
}
function initSettingsView(){
  const inp=document.getElementById('settings-ui-scale');
  if(inp)inp.value=_D.settings?.ui_scale||1;
  if(_D.settings?.ui_scale) applyUiScale(_D.settings.ui_scale);
  const saved = _D.settings?.sales_cards_per_row;
  const gridVal    = typeof saved === 'number' ? saved : (saved?.grid || 5);
  const compactVal = (saved && typeof saved === 'object') ? (saved.compact || 3) : 3;
  const peopleVal  = (saved && typeof saved === 'object') ? (saved.people || 5) : 5;
  const gridInp=document.getElementById('settings-cards-per-row-grid');
  if(gridInp)gridInp.value=gridVal;
  const compactInp=document.getElementById('settings-cards-per-row-compact');
  if(compactInp)compactInp.value=compactVal;
  const peopleInp=document.getElementById('settings-cards-per-row-people');
  if(peopleInp)peopleInp.value=peopleVal;

  const spriteMode = _D.settings?.sprite_source || 'official';
  document.querySelectorAll('#settings-sprite-source .chip-toggle-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.value === spriteMode);
  });
}

// Source des sprites Pokémon (Pokédex & Ventes) — Official Art (PokeAPI) ou
// Home (NAS FileBrowser, voir _nasSpriteUrl dans js/pokedex.js). Synchronisé
// au cloud comme les autres préférences d'affichage (voir js/sync.js).
function setSpriteSource(mode, btn){
  if(!_D.settings) _D.settings = {};
  _D.settings.sprite_source = mode;
  document.querySelectorAll('#settings-sprite-source .chip-toggle-btn').forEach(b=>b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  saveData(); renderAll();
  // La grille Pokédex n'est pas reconstruite par renderAll() (chargée à la
  // demande) — si elle a déjà été ouverte, on force le réaffichage de la
  // page courante pour refléter immédiatement le nouveau réglage.
  if (typeof _pkdx !== 'undefined' && _pkdx.initialized) renderPokedexPage(true);
  toast('Source des sprites mise à jour.', 'success');
}

// Vide le cache local Pokédex (voir PKDX_CACHE_KEY dans js/pokedex.js) et
// recharge la page — la façon la plus sûre de forcer un rechargement complet
// depuis PokéAPI (nouveau Pokémon manquant, forme mal détectée…).
function clearPokedexCache(){
  try { localStorage.removeItem(PKDX_CACHE_KEY); } catch(_) {}
  toast('Cache Pokédex vidé — rechargement…', 'success');
  setTimeout(() => location.reload(), 600);
}

