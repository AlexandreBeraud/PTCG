// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/labels.js
//  Labels de formes spéciales — édition, assignation manuelle, sync cloud
// ═══════════════════════════════════════════════════════════════════════════

// ── Labels de formes spéciales (Édition › Labels) ───────────────────────────
var _labelsQuery = '';

function filterLabelsList(q) { _labelsQuery = q; renderLabelsList(); }

// Lit l'état plié/déplié actuel de chaque <details> (identifié par son id)
// AVANT de réécrire le HTML — c'est ce qui évite qu'une simple frappe, un
// ajout ou tout autre changement ne redéploie systématiquement toutes les
// catégories que l'utilisateur avait explicitement repliées.
function _captureLabelOpenState(el) {
  const state = {};
  el.querySelectorAll('details[id]').forEach(d => { state[d.id] = d.open; });
  return state;
}

function renderLabelsList() {
  const el = document.getElementById('labels-list');
  if (!el) return;
  const openState = _captureLabelOpenState(el);
  const isOpen = (id, dflt) => openState[id] !== undefined ? openState[id] : dflt;
  // Grille/liste choisi via le bouton du header (#topbar-view-toggle, voir
  // setViewMode dans collection.js) plutôt qu'un bouton local à ce panneau.
  const mode = _tabViewModes['labels'] || 'grid';

  const q = _nnLbl(_labelsQuery||'');
  let html = '', totalShown = 0;

  const allTypes = _allLabelTypes();

  const colsHtml = `<div class="lbl-group-cols">
    <span>Label</span><span>Nom affiché</span><span>Badge</span><span>Couleur</span><span>Afficher</span><span>Préfixes carte</span><span>Suffixes carte</span><span>Catégorie</span><span></span>
  </div>`;

  // Grille de cartes compactes (par défaut, évite le défilement interminable
  // pour les catégories à beaucoup de labels) OU tableau de lignes classique
  // — au choix, via le bouton grille/liste du header.
  const cardsForTypes = types => {
    const kept = types.filter(type => {
      const cfg = getFormLabelConfig(type);
      return !(q && !_nnLbl(type + ' ' + cfg.fr).includes(q));
    });
    totalShown += kept.length;
    if (!kept.length) return '';
    if (mode === 'list') {
      return colsHtml + kept.map(type => _renderLabelRow(type, getFormLabelConfig(type))).join('');
    }
    return `<div class="lbl-cards-grid">${kept.map(type => _renderLabelCard(type, getFormLabelConfig(type))).join('')}</div>`;
  };

  // Une catégorie (récursif sur 1 niveau de sous-catégories, voir
  // getLabelCategoryTree) : ses propres labels PUIS ses sous-catégories.
  const renderCategory = (cat, depth) => {
    const detailsId = `lblcat-${cat.id}`;
    const typesInCat = allTypes.filter(t => _labelCategoryOf(t) === cat.id);
    const cardsHtml = cardsForTypes(typesInCat);
    const childrenHtml = (cat.children||[]).map(ch => renderCategory(ch, depth+1)).filter(Boolean).join('');
    if (!cardsHtml && !childrenHtml) {
      // Catégorie vide (ou entièrement filtrée par la recherche) : gardée
      // visible seulement hors recherche, pour pouvoir toujours la
      // réorganiser/renommer/supprimer ou y ranger des labels/catégories.
      if (q) return '';
      return `<details class="lbl-group${depth?' lbl-subgroup':''}" id="${detailsId}" ${isOpen(detailsId,true)?'open':''}>
        ${_labelCategoryHeaderHtml(cat, depth)}
        <p style="color:var(--text3);font-size:.74rem;padding:2px 10px 10px">Catégorie vide — assigne-lui des labels via le menu « Catégorie » d'une carte, ou ranges-y une autre catégorie via le sélecteur ci-dessus.</p>
      </details>`;
    }
    return `<details class="lbl-group${depth?' lbl-subgroup':''}" id="${detailsId}" ${isOpen(detailsId,true)?'open':''}>
      ${_labelCategoryHeaderHtml(cat, depth)}
      ${childrenHtml}
      ${cardsHtml}
    </details>`;
  };

  getLabelCategoryTree().forEach(cat => { html += renderCategory(cat, 0); });

  // Non classés (aucune catégorie assignée)
  const unclassified = allTypes.filter(t => _labelCategoryOf(t) === null);
  const unclassifiedHtml = cardsForTypes(unclassified);
  if (unclassifiedHtml) {
    html += `<details class="lbl-group" id="lblcat-unclassified" ${isOpen('lblcat-unclassified',true)?'open':''}>
      <summary class="lbl-group-header lbl-group-header-static"><span class="lbl-cat-chevron">▸</span>Non classés</summary>
      ${unclassifiedHtml}
    </details>`;
  }

  const counter = document.getElementById('labels-counter');
  if (counter) counter.textContent = `${totalShown} label${totalShown>1?'s':''}`;
  el.innerHTML = html || `<p style="color:var(--text2);font-size:.82rem;padding:16px 0">Aucun résultat.</p>`;
}

// En-tête de catégorie : glisser-déposer pour réorganiser, renommer,
// supprimer, et ranger comme sous-catégorie d'une autre.
function _labelCategoryHeaderHtml(cat, depth) {
  const safe = _escJs(cat.id);
  const roots = getLabelCategoryTree().filter(c => c.id !== cat.id);
  const parentOptions = `<option value="">— Catégorie principale —</option>`
    + roots.map(r => `<option value="${_escHtml(r.id)}" ${cat.parentId===r.id?'selected':''}>${_escHtml(r.name)}</option>`).join('');
  return `<summary class="lbl-group-header${depth?' lbl-group-header-sub':''}" draggable="true" data-cat-id="${_escHtml(cat.id)}"
      ondragstart="onLabelCatDragStart(event)" ondragover="onLabelCatDragOver(event)"
      ondragleave="this.classList.remove('drag-target')" ondrop="onLabelCatDrop(event)">
    <span class="lbl-cat-chevron">▸</span>
    <span class="lbl-cat-handle" title="Glisser pour réorganiser">⠿</span>
    <span class="lbl-cat-name">${_escHtml(cat.name)}</span>
    <select class="lbl-cat-parent-select" title="Ranger comme sous-catégorie de…" onclick="event.stopPropagation()" onchange="event.stopPropagation();setLabelCategoryParent('${safe}',this.value)">${parentOptions}</select>
    <span class="lbl-cat-actions">
      <button class="mbadge-clear" title="Renommer" onclick="event.preventDefault();event.stopPropagation();renameLabelCategory('${safe}')">✎</button>
      <button class="mbadge-clear" title="Supprimer la catégorie" onclick="event.preventDefault();event.stopPropagation();deleteLabelCategory('${safe}')">🗑</button>
    </span>
  </summary>`;
}

// Carte compacte pour un label (badge, nom, réglages) — plusieurs cartes
// tiennent par ligne dans la grille (.lbl-cards-grid), ce qui réduit
// drastiquement le défilement vertical pour les catégories à beaucoup de labels.
function _renderLabelCard(type, cfg) {
  const safe = type.replace(/'/g,"\\'");
  const esc  = s => (s||'').replace(/"/g,'&quot;');
  const currentCat = _labelCategoryOf(type);
  const catOptions = `<option value="" ${!currentCat?'selected':''}>Non classé</option>`
    + getLabelCategories().map(cat => `<option value="${_escHtml(cat.id)}" ${currentCat===cat.id?'selected':''}>${_escHtml(cat.name)}</option>`).join('');
  return `<div class="lbl-card" id="lblrow-${type}">
    <div class="lbl-card-top">
      <span class="pkdx-forms-type-badge" style="background:${cfg.color}">${cfg.badge}</span>
      <label class="lbl-switch lbl-switch-sm" title="Afficher ce label">
        <input type="checkbox" ${cfg.enabled!==false?'checked':''} onchange="updateLabelToggle('${safe}',this.checked)">
        <span class="lbl-switch-track"></span>
      </label>
      <span class="lbl-card-actions">
        <button class="mbadge-clear" title="Supprimer définitivement" onclick="deleteLabelPermanently('${safe}')">🗑</button>
      </span>
    </div>
    <input type="text" class="lbl-input lbl-input-name" value="${esc(cfg.fr)}" placeholder="Nom affiché" title="Nom affiché"
      oninput="_setLabelFieldValue('${safe}','fr',this.value)" onblur="commitLabelEdit('${safe}')">
    <div class="lbl-card-row2">
      <input type="text" class="lbl-input" value="${esc(cfg.badge)}" placeholder="Badge" maxlength="10" title="Badge"
        oninput="_setLabelFieldValue('${safe}','badge',this.value)" onblur="commitLabelEdit('${safe}')">
      <input type="color" class="lbl-color" value="${(cfg.color||'#888888').slice(0,7)}" title="Couleur"
        onchange="_setLabelFieldValue('${safe}','color',this.value);commitLabelEdit('${safe}')">
    </div>
    <input type="text" class="lbl-input" value="${esc((cfg.prefixes||[]).join(', '))}" placeholder="Préfixes carte — ex : Méga-, M "
      oninput="_setLabelFieldValue('${safe}','prefixes',this.value)" onblur="commitLabelEdit('${safe}')">
    <input type="text" class="lbl-input" value="${esc((cfg.suffixes||[]).join(', '))}" placeholder="Suffixes carte — ex : VMAX, X"
      oninput="_setLabelFieldValue('${safe}','suffixes',this.value)" onblur="commitLabelEdit('${safe}')">
    <select class="lbl-input" onchange="setLabelCategory('${safe}',this.value)" title="Catégorie">${catOptions}</select>
  </div>`;
}

// Ligne pleine largeur (mode liste) — mêmes champs que _renderLabelCard,
// disposés en colonnes façon tableau (voir colsHtml dans renderLabelsList).
function _renderLabelRow(type, cfg) {
  const safe = type.replace(/'/g,"\\'");
  const esc  = s => (s||'').replace(/"/g,'&quot;');
  const currentCat = _labelCategoryOf(type);
  const catOptions = `<option value="" ${!currentCat?'selected':''}>Non classé</option>`
    + getLabelCategories().map(cat => `<option value="${_escHtml(cat.id)}" ${currentCat===cat.id?'selected':''}>${_escHtml(cat.name)}</option>`).join('');
  return `<div class="lbl-row" id="lblrow-${type}">
    <div class="lbl-badge-cell"><span class="pkdx-forms-type-badge" style="background:${cfg.color}">${cfg.badge}</span></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc(cfg.fr)}" placeholder="Nom affiché"
      oninput="_setLabelFieldValue('${safe}','fr',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc(cfg.badge)}" placeholder="Badge" maxlength="10"
      oninput="_setLabelFieldValue('${safe}','badge',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-color-cell"><input type="color" class="lbl-color" value="${(cfg.color||'#888888').slice(0,7)}"
      onchange="_setLabelFieldValue('${safe}','color',this.value);commitLabelEdit('${safe}')"></div>
    <div class="lbl-toggle-cell"><label class="lbl-switch">
      <input type="checkbox" ${cfg.enabled!==false?'checked':''} onchange="updateLabelToggle('${safe}',this.checked)">
      <span class="lbl-switch-track"></span></label></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc((cfg.prefixes||[]).join(', '))}" placeholder="ex : Méga-, M "
      oninput="_setLabelFieldValue('${safe}','prefixes',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><input type="text" class="lbl-input" value="${esc((cfg.suffixes||[]).join(', '))}" placeholder="ex : VMAX, X"
      oninput="_setLabelFieldValue('${safe}','suffixes',this.value)" onblur="commitLabelEdit('${safe}')"></div>
    <div class="lbl-field"><select class="lbl-input" onchange="setLabelCategory('${safe}',this.value)">${catOptions}</select></div>
    <div class="lbl-reset-cell">
      <button class="mbadge-clear" title="Supprimer définitivement" onclick="deleteLabelPermanently('${safe}')">🗑</button>
    </div>
  </div>`;
}

function _refreshPokedexAfterLabelChange() {
  if (typeof _pkdx === 'undefined' || !_pkdx.formsLoaded) return;
  try { _applyPokedexFilter(); } catch(_) {}
  const fp = document.getElementById('pkdx-forms-panel');
  if (fp && fp.style.display !== 'none') { try { _buildFormTypeFilterList(); } catch(_) {} }
}

// Sauvegarde immédiate à chaque frappe (aucun re-rendu de la liste ici, pour ne
// pas faire perdre le focus du champ en cours d'édition). C'est cette fonction
// qui garantit qu'une actualisation de page ne perd jamais la saisie, même si
// l'utilisateur n'a pas encore quitté le champ (onblur).
function _setLabelFieldValue(type, field, value) {
  const row = (_D.labels||[]).find(l => l.type === type);
  if (!row) return;
  if (field === 'prefixes' || field === 'suffixes') {
    row[field] = value.split(',').map(s=>s.trim()).filter(Boolean);
  } else {
    row[field] = value;
  }
  saveData();
}

// Appelé en quittant un champ texte : pousse la valeur vers Supabase (via le
// moteur générique, déclenché par saveData() plus haut), rafraîchit le
// Pokédex (si déjà ouvert) et redessine la liste.
function commitLabelEdit(type) {
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
}

function updateLabelToggle(type, checked) {
  const row = (_D.labels||[]).find(l => l.type === type);
  if (!row) return;
  row.enabled = checked;
  saveData();
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label mis à jour.', 'success');
}

// Suppression définitive et immédiate — comme pour n'importe quelle autre
// donnée de l'app (vente, acheteur…), il n'y a plus de "valeur par défaut"
// vers laquelle revenir : supprimer, c'est supprimer.
function deleteLabelPermanently(type) {
  if (!confirm(`Supprimer définitivement le label "${getFormLabelConfig(type)?.fr || type}" ? Cette action est irréversible.`)) return;
  _D.labels = (_D.labels||[]).filter(l => l.type !== type);
  saveData();
  _refreshPokedexAfterLabelChange();
  renderLabelsList();
  toast('Label supprimé définitivement.', 'success');
}

// Crée un nouveau label.
function addCustomLabel() {
  const frInput    = document.getElementById('new-label-fr');
  const badgeInput = document.getElementById('new-label-badge');
  const colorInput = document.getElementById('new-label-color');
  const fr = (frInput?.value||'').trim();
  if (!fr) { toast('Indique un nom pour le nouveau label.', 'error'); return; }
  const badge = (badgeInput?.value||'').trim().toUpperCase() || fr.toUpperCase().slice(0, 8);
  const color = colorInput?.value || '#7038F8';

  let slug = _nnLbl(fr).replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
  if (!slug) slug = 'label';
  let type = slug, i = 2;
  while ((_D.labels||[]).some(l => l.type === type)) { type = `${slug}-${i++}`; }

  if (!_D.labels) _D.labels = [];
  _D.labels.push({ type, fr, badge, color, enabled: true, prefixes: [], suffixes: [], category_id: null, sort_order: _D.labels.length });
  saveData();
  if (frInput) frInput.value = '';
  if (badgeInput) badgeInput.value = '';
  renderLabelsList();
  toast('Label créé.', 'success');
}

// ── Assignation manuelle d'un label à un Pokémon précis ─────────────────────
// Construit les <option> du sélecteur d'assignation, en marquant l'option
// actuellement sélectionnée pour ce Pokémon (slug PokéAPI).
function _buildLabelAssignOptions(slug) {
  const assigned = (_D.pokemon_label_assignments||{})[slug];
  const autoSel    = assigned === undefined ? 'selected' : '';
  const noneSel    = assigned === '' ? 'selected' : '';
  let opts = `<option value="" ${autoSel}>Auto (détection)</option>
    <option value="__clear__" ${noneSel}>Aucun label</option>`;
  _allLabelTypes().forEach(type => {
    const cfg = getFormLabelConfig(type);
    if (!cfg) return;
    const sel = assigned === type ? 'selected' : '';
    opts += `<option value="${type}" ${sel}>${(cfg.fr||type)}</option>`;
  });
  return opts;
}

// value: '' → retour à l'auto-détection, '__clear__' → forcer "aucun label",
// sinon → type de label assigné. reopenType/A/B permettent de rouvrir la même
// fiche juste après pour refléter le changement immédiatement.
async function assignPokemonLabel(slug, value, reopenType, reopenA, reopenB) {
  if (!_D.pokemon_label_assignments) _D.pokemon_label_assignments = {};
  if (value === '') delete _D.pokemon_label_assignments[slug];
  else if (value === '__clear__') _D.pokemon_label_assignments[slug] = '';
  else _D.pokemon_label_assignments[slug] = value;
  saveData();
  _pushLabelSettingsToCloud();
  toast('Label du Pokémon mis à jour.', 'success');
  try { await _loadFormsList(); } catch(_) {}
  if (reopenType === 'base') openPokedexModal(reopenA);
  else if (reopenType === 'form') openPokedexFormModal(reopenA, reopenB);
}

// labels et label_categories font partie du moteur générique de js/sync.js
// (comme ventes, acheteurs…) : plus besoin d'un mécanisme de sync dédié ici,
// saveData() suffit à déclencher la synchronisation cloud automatiquement.
function _pushLabelSettingsToCloud() {
  _scheduleCloudPush();
}
function _pullLabelSettingsFromCloud() {
  return Promise.resolve();
}

function filterMappingList(q) { _mapping.query = q; renderMappingList(); }
function setMappingFilter(filter, btn) {
  _mapping.filter = filter;
  document.querySelectorAll('.mapping-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMappingList();
}
document.addEventListener('click', e => {
  if (!e.target.closest('.mrow-set-wrap'))
    document.querySelectorAll('.mrow-dropdown').forEach(d => d.style.display = 'none');
  if (!e.target.closest('#pkdx-ext-panel') && !e.target.closest('#pkdx-ext-toggle'))
    _closePkdxExtPanel();
  if (!e.target.closest('#pkdx-forms-panel') && !e.target.closest('#pkdx-forms-toggle'))
    _closePkdxFormsPanel();
  if (!e.target.closest('#pkdx-tcg-ext-panel') && !e.target.closest('#pkdx-tcg-ext-toggle'))
    _closeModalExtPanel();
  if (!e.target.closest('#add-ext-classeur-panel') && !e.target.closest('#add-ext-classeur-toggle')) {
    const p = document.getElementById('add-ext-classeur-panel');
    if (p) p.style.display = 'none';
  }
});

// ── Pokédex extension filter (multi-sélection) ──────────────────────────────
// null = pas de filtre, sinon Map<extId, {setId, name}> — plusieurs
// extensions peuvent être choisies simultanément.
var _pkdxExtFilter = null;

function _closePkdxExtPanel() {
  const panel = document.getElementById('pkdx-ext-panel');
  if (panel) panel.style.display = 'none';
  const btn = document.getElementById('pkdx-ext-toggle');
  if (btn) btn.classList.toggle('active', !!_pkdxExtFilter);
}

async function togglePokedexExtFilter(btn) {
  const panel = document.getElementById('pkdx-ext-panel');
  const open  = panel && panel.style.display !== 'none';
  if (open) { _closePkdxExtPanel(); return; }
  if (!_mapping.initialized) await initMappingView();
  btn.classList.add('active');
  _buildExtFilterList();
  if (panel) panel.style.display = '';
}

// Liste groupée par bloc (ordre des blocs) puis triée par code au sein de
// chaque bloc (sortExts, comme partout ailleurs dans l'appli), avec l'image
// sigle de chaque extension affichée à côté de son nom.
function _buildExtFilterList() {
  const el = document.getElementById('pkdx-ext-list');
  if (!el) return;
  const mappedExts = getAllExtensions().filter(e => _mapping.mappings[e.id]);
  if (!mappedExts.length) {
    el.innerHTML = '<div style="color:var(--text2);font-size:.8rem;padding:8px 12px">Aucune extension mappée.</div>';
    return;
  }
  let html = `<div class="pkdx-ext-filter-item pkdx-ext-filter-all ${!_pkdxExtFilter?'active':''}" onclick="setPokedexExtFilterAll()">Toutes les extensions</div>`;
  getBlocs().forEach(bloc => {
    const inBloc = sortExts(mappedExts.filter(e => getBlocForExt(e.id)?.id === bloc.id));
    if (!inBloc.length) return;
    html += `<div class="pkdx-ext-filter-bloc-label">${_escHtml(bloc.nom || bloc.name || bloc.id)}</div>`;
    html += inBloc.map(e => {
      const setId    = _mapping.mappings[e.id].set_id;
      const name     = e.nom || e.name || e.id;
      const active   = _pkdxExtFilter && _pkdxExtFilter.has(e.id) ? 'active' : '';
      const sigleSrc = e.sigle || bloc.sigle || '';
      return `<div class="pkdx-ext-filter-item ${active}" onclick="togglePokedexExtFilterItem('${_escJs(e.id)}','${_escJs(setId)}','${_escJs(name)}')">
        ${sigleSrc ? `<img src="${sigleSrc}" alt="" class="pkdx-ext-filter-sigle" onerror="this.style.display='none'">` : `<span class="pkdx-ext-filter-code">${_escHtml(e.code||'')}</span>`}
        <span>${_escHtml(name)}</span>
      </div>`;
    }).join('');
  });
  el.innerHTML = html;
}

function togglePokedexExtFilterItem(extId, setId, name) {
  if (!_pkdxExtFilter) _pkdxExtFilter = new Map();
  if (_pkdxExtFilter.has(extId)) _pkdxExtFilter.delete(extId);
  else _pkdxExtFilter.set(extId, { setId, name });
  if (_pkdxExtFilter.size === 0) _pkdxExtFilter = null;
  _buildExtFilterList();
  _refreshPokedexExtLabelAndClear();
  _applyPokedexExtFilterAsync();
}

function setPokedexExtFilterAll() {
  _pkdxExtFilter = null;
  _buildExtFilterList();
  _refreshPokedexExtLabelAndClear();
  _applyPokedexExtFilterAsync();
}

function _refreshPokedexExtLabelAndClear() {
  const labelEl  = document.getElementById('pkdx-ext-label');
  const clearBtn = document.getElementById('pkdx-ext-clear');
  if (!_pkdxExtFilter) {
    if (labelEl)  labelEl.textContent = 'Extension';
    if (clearBtn) clearBtn.style.display = 'none';
  } else {
    const names = [..._pkdxExtFilter.values()].map(v => v.name);
    if (labelEl)  labelEl.textContent = names.length === 1 ? names[0] : names.length + ' extensions';
    if (clearBtn) clearBtn.style.display = '';
  }
}

// Recalcule la liste des noms de cartes correspondant à TOUTES les extensions
// sélectionnées (union), pour filtrer la grille principale du Pokédex.
async function _applyPokedexExtFilterAsync() {
  if (!_pkdxExtFilter) {
    _pkdx.extFilterNames = null;
  } else {
    try {
      const baseEntries = new Set();
      const formEntries = new Set();
      await Promise.all([..._pkdxExtFilter.values()].map(async v => {
        const res = await fetch(`${SB_URL}/rest/v1/cards?set_id=eq.${encodeURIComponent(v.setId)}&select=name`,
          { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Range': '0-999' } });
        const cards = await res.json();
        const parsed = _parseTcgCardNames(cards.map(c => c.name || ''));
        parsed.baseEntries.forEach(n => baseEntries.add(n));
        parsed.formEntries.forEach(n => formEntries.add(n));
      }));
      _pkdx.extFilterNames = { baseEntries, formEntries };
    } catch(e) { _pkdx.extFilterNames = null; }
  }

  // Force load forms and all frNames
  const prevShowForms = _pkdx.showForms;
  _pkdx.showForms = true;
  if (!_pkdx.formsLoaded) await _loadFormsList();
  await _hydrateAllFrNames();
  _pkdx.showForms = prevShowForms;
  _closePkdxFormsPanel();

  _applyPokedexFilter();
}

// Bouton "×" du topbar : annule complètement le filtre d'extension du
// Pokédex, y compris — puisqu'il n'aurait plus de sens sans lui — le filtre
// local d'une fiche Pokémon actuellement ouverte.
function clearPokedexExtFilter() {
  _pkdxExtFilter = null;
  _pkdx.extFilterNames = null;
  _refreshPokedexExtLabelAndClear();
  if (document.getElementById('pkdx-ext-list')) _buildExtFilterList();
  if (_pkdx.initialized) _applyPokedexFilter();
  if (_pkdxModalTcg) {
    _pkdxModalTcg.filterExtIds = null;
    _renderPkdxTcgGroups();
    _buildModalExtFilterList();
  }
}

// Analyse les noms de cartes TCG d'une extension et détermine, pour chacune,
// à quel Pokémon PRÉCIS elle correspond : soit le Pokémon de base, soit une
// forme spéciale précise (jamais les deux). Réutilise les mêmes motifs
// préfixe/suffixe que le reste de l'appli (Édition › Labels / getFormLabelConfig)
// au lieu d'une liste de regex séparée — celle-ci ne reconnaissait ni les
// accents français ("Méga"), ni les abréviations TCGdex ("M "), ce qui
// empêchait la plupart des formes de ressortir dans le filtre par extension.
// Retour : { baseEntries: Set<string>, formEntries: Set<"baseName|formType"> }
function _parseTcgCardNames(cardNames) {
  const suffixRe = /\b(ex|v|vmax|vstar|gx|lv ?x|radieux|obscur|brillant|delta|turbo|break|prime|legend|origine|couronne)\b/g;

  // Types les plus "spécifiques" (ayant un suffixe requis, ex. mega-x/mega-y/gmax)
  // testés avant les types plus permissifs (ex. mega, qui n'exige aucun
  // suffixe) — sinon une carte "Méga-Dracaufeu X" serait classée "mega" avant
  // d'avoir eu la chance d'être reconnue comme "mega-x".
  const linkedTypes = _allLinkedFormTypes().sort((a, b) => {
    const sa = (getFormLabelConfig(a).suffixes||[]).length ? 1 : 0;
    const sb = (getFormLabelConfig(b).suffixes||[]).length ? 1 : 0;
    return sb - sa;
  });

  const baseEntries = new Set();
  const formEntries = new Set();

  cardNames.forEach(raw => {
    const cardName = (raw || '').trim();
    if (!cardName) return;

    let matchedType = null;
    for (const type of linkedTypes) {
      if (_cardMatchesFormType(cardName, type)) { matchedType = type; break; }
    }

    // Nom normalisé (accents/casse retirés), duquel on retire le motif de
    // forme détecté (préfixe et/ou suffixe) pour ne garder que le nom du
    // Pokémon lui-même.
    let residual = _nnLbl(cardName);
    if (matchedType) {
      const cfg = getFormLabelConfig(matchedType);
      [...(cfg.prefixes||[]), ...(cfg.suffixes||[])].forEach(pat => {
        const np = _nnLbl(pat);
        if (!np) return;
        residual = residual.replace(new RegExp('\\b'+_escRe(np)+'\\b', 'g'), ' ');
      });
    }
    residual = residual.replace(suffixRe, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    if (!residual) return;

    if (matchedType) formEntries.add(residual + '|' + matchedType);
    else             baseEntries.add(residual);
  });

  return { baseEntries, formEntries };
}

async function _hydrateAllFrNames() {
  const needed = _pkdx.all.filter(p => !p.isForm && !p.frName);
  if (!needed.length) return;
  const subtitle = document.getElementById('pokedex-subtitle');
  const BATCH = 20;
  for (let i = 0; i < needed.length; i += BATCH) {
    await Promise.allSettled(needed.slice(i, i+BATCH).map(async p => {
      try {
        const poke = await _fetchPokemon(p.id);
        const spec = await _fetchSpecies(poke.species.url);
        if (spec) { const fr = spec.names?.find(n => n.language.name === 'fr'); if (fr) p.frName = fr.name; }
      } catch(_) {}
    }));
    if (subtitle) subtitle.textContent = `⏳ Chargement : ${Math.min(i+BATCH, needed.length)} / ${needed.length}`;
  }
  if (subtitle) subtitle.textContent = `${_pkdx.all.filter(p=>!p.isForm).length} Pokémon — données via PokéAPI`;
}


function saveDisplayMode(){
  const sel=document.getElementById('settings-display-mode');
  if(!sel)return;
  if(!_D.settings)_D.settings={};
  _D.settings.display_mode=sel.value;
  saveData();renderAll();toast('Préférence sauvegardée.','success');
}

function applyUiScale(val){
  const scale=parseFloat(val)||1;
  document.documentElement.style.fontSize=`${14*scale}px`;
  if(!_D.settings)_D.settings={};
  _D.settings.ui_scale=scale;
  saveData();
}

function saveUiScale(){
  const inp=document.getElementById('settings-ui-scale');
  if(!inp)return;
  applyUiScale(inp.value);
  toast('Taille appliquée.','success');
}
function exportData(){
  const s={..._D};delete s._tpl_blocs;delete s.blocs;
  const a=Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'})),
    download:`ptcg_collection_${new Date().toISOString().slice(0,10)}.json`
  });
  a.click();toast('Export téléchargé.','success');
}
// Import via un vrai sélecteur de fichier (plutôt que copier-coller un JSON
// dans une zone de texte, peu pratique pour un gros export) : on lit le
// fichier choisi avec FileReader, le reste de la logique est inchangé.
function importDataFromFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result).trim());
      const tplBlocs = (window.__PC_DATA__ && window.__PC_DATA__.blocs) || [];
      _D = { ...parsed, _tpl_blocs: tplBlocs };
      ['boosters_data','custom_exts','ext_overrides','bloc_overrides','custom_blocs'].forEach(k=>{if(!_D[k])_D[k]=k==='boosters_data'?{}:[];});
      if (!_D.settings) _D.settings = { display_mode:'logo' };
      saveData(); renderAll();
      toast('Import réussi !', 'success');
    } catch(e) {
      toast('JSON invalide : ' + e.message, 'error');
    } finally {
      input.value = '';
    }
  };
  reader.onerror = () => { toast('Impossible de lire le fichier.', 'error'); input.value = ''; };
  reader.readAsText(file);
}
// saveCloudConfig() et syncCloud() sont définies dans js/sync.js (moteur de
// synchronisation générique, une ligne par table normalisée).
function resetData(){
  if(!confirm('Supprimer TOUTES vos données ?'))return;
  localStorage.removeItem(STORAGE_KEY);
  _D={
    _v:1,_ts:Date.now(),_tpl_blocs:[],
    collection:{},classeurs:[],boosters_data:{},
    custom_exts:[],ext_overrides:{},bloc_overrides:{},custom_blocs:[],
    labels:[],label_categories:[],pokemon_label_assignments:{},
    ventes:[],acheteurs:[],acheteur_commandes:[],depenses:[],vendeurs:[],vendeur_commandes:[],
    settings:{display_mode:'logo'}
  };
  saveData();renderAll();toast('Données réinitialisées.','success');
}


