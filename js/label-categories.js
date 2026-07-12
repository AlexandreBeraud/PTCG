// ═══════════════════════════════════════════════════════════════════════════
//  PTCG Collection — js/label-categories.js
//  Générations & couleurs, Catégories de labels (Édition › Labels)
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
//  POKÉDEX — v2 (noms FR, talens FR, types FR, formes spéciales, séparateurs)
// ═══════════════════════════════════════════════════════════════════════════

var POKEAPI = 'https://pokeapi.co/api/v2';

// ── Générations & couleurs ─────────────────────────────────────────────────
var POKEDEX_GENS = [
  { id:1, label:'I',    name:'Kanto',   from:1,   to:151  },
  { id:2, label:'II',   name:'Johto',   from:152, to:251  },
  { id:3, label:'III',  name:'Hoenn',   from:252, to:386  },
  { id:4, label:'IV',   name:'Sinnoh',  from:387, to:493  },
  { id:5, label:'V',    name:'Unys',    from:494, to:649  },
  { id:6, label:'VI',   name:'Kalos',   from:650, to:721  },
  { id:7, label:'VII',  name:'Alola',   from:722, to:809  },
  { id:8, label:'VIII', name:'Galar',   from:810, to:905  },
  { id:9, label:'IX',   name:'Paldea',  from:906, to:1025 },
];

var TYPE_COLORS = {
  normal:'#9099A1',fire:'#E8553D',water:'#4F91D6',electric:'#F4C832',
  grass:'#5DB947',ice:'#74CEC0',fighting:'#CE4265',poison:'#9754C8',
  ground:'#D4A244',flying:'#8FA9DC',psychic:'#E8527E',bug:'#90C22D',
  rock:'#C5B789',ghost:'#5269AC',dragon:'#0A6DC4',dark:'#5A5165',
  steel:'#5B8EA1',fairy:'#E685A8',
};

// Traductions françaises des types
var TYPE_FR = {
  normal:'Normal',fire:'Feu',water:'Eau',electric:'Électrik',
  grass:'Plante',ice:'Glace',fighting:'Combat',poison:'Poison',
  ground:'Sol',flying:'Vol',psychic:'Psy',bug:'Insecte',
  rock:'Roche',ghost:'Spectre',dragon:'Dragon',dark:'Ténèbres',
  steel:'Acier',fairy:'Fée',
};

// Labels des formes spéciales et leurs catégories : plus aucune définition
// en dur ici. Tout vit dans les tables Supabase "labels" et
// "label_categories" (voir js/sync.js, domaines génériques), chargées dans
// _D.labels / _D.label_categories comme n'importe quel autre domaine
// (ventes, acheteurs…). Seule la DÉTECTION (_detectFormType, plus bas dans
// ce fichier) reste du code : faire correspondre un nom de forme PokéAPI à
// un type de label est intrinsèquement une question de logique de parsing,
// pas une donnée éditable par l'utilisateur.

// Renvoie la config effective d'un label — directement depuis _D.labels
// (chargé depuis Supabase), plus aucune fusion avec une définition en dur.
// Si le type n'existe pas encore (nouveau type détecté jamais configuré),
// repli neutre plutôt qu'un plantage : reste affichable (badge générique)
// tant qu'il n'a pas été configuré dans Édition › Labels.
function getFormLabelConfig(type) {
  if (!type) return null;
  const row = (_D.labels || []).find(l => l.type === type);
  if (row) {
    return {
      fr:       row.fr    || type,
      badge:    row.badge || (type||'').toUpperCase(),
      color:    row.color || '#888888',
      enabled:  row.enabled !== false,
      prefixes: Array.isArray(row.prefixes) ? row.prefixes.slice() : [],
      suffixes: Array.isArray(row.suffixes) ? row.suffixes.slice() : [],
    };
  }
  return { fr: type, badge: (type||'').toUpperCase(), color: '#888888', enabled: true, prefixes: [], suffixes: [] };
}

// Tous les types de labels actuellement configurés (une ligne par label dans
// _D.labels — plus de distinction "intégré vs personnalisé", ce sont tous
// des labels de même nature).
function _allLabelTypes() {
  return (_D.labels || []).map(l => l.type);
}

// ── Catégories de labels (Édition › Labels) ────────────────────────────────
// Une ligne par catégorie dans _D.label_categories (chargée depuis Supabase),
// triée par sort_order, catégories masquées exclues.
function getLabelCategories() {
  return (_D.label_categories || [])
    .filter(c => !c.hidden)
    .slice()
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999))
    .map(c => ({ id: c.id, name: c.name, parentId: c.parent_id || null }));
}

// Regroupe les catégories en arbre — UN SEUL niveau de sous-catégories (pas
// de petites-catégories), pour rester simple à afficher/gérer/parcourir. Une
// catégorie dont le parent n'existe plus (supprimé) ou pointe sur elle-même
// redevient automatiquement une catégorie de premier niveau.
function getLabelCategoryTree() {
  const flat = getLabelCategories();
  const byId = new Map(flat.map(c => [c.id, { ...c, children: [] }]));
  const roots = [];
  byId.forEach(c => {
    if (c.parentId && c.parentId !== c.id && byId.has(c.parentId)) {
      byId.get(c.parentId).children.push(c);
    } else {
      roots.push(c);
    }
  });
  return roots;
}

// Catégorie d'un label : directement le champ category_id de sa ligne dans
// _D.labels. Filet de sécurité : si cette catégorie n'existe plus (supprimée
// depuis), on retombe sur "Non classé" plutôt que de rendre le label
// invisible partout dans l'éditeur.
function _labelCategoryOf(type) {
  const row = (_D.labels || []).find(l => l.type === type);
  if (!row || !row.category_id) return null;
  if (!getLabelCategories().some(c => c.id === row.category_id)) return null;
  return row.category_id;
}

// Déplace un label vers une catégorie (categoryId='' ou null → Non classé).
function setLabelCategory(type, categoryId) {
  const row = (_D.labels || []).find(l => l.type === type);
  if (!row) return;
  row.category_id = categoryId || null;
  saveData();
  renderLabelsList();
  toast('Catégorie mise à jour.', 'success');
}

function addLabelCategory() {
  const input = document.getElementById('new-label-cat');
  const name = (input?.value || '').trim();
  if (!name) { toast('Indique un nom pour la nouvelle catégorie.', 'error'); return; }
  if (!_D.label_categories) _D.label_categories = [];
  const id = 'lblcat_' + Date.now();
  const sortOrder = _D.label_categories.length;
  _D.label_categories.push({ id, name, hidden: false, parent_id: null, sort_order: sortOrder });
  saveData();
  if (input) input.value = '';
  renderLabelsList();
  toast('Catégorie créée.', 'success');
}

// Range une catégorie comme sous-catégorie d'une autre (parentId='' ou null
// → la remonte au premier niveau). Un seul niveau de sous-catégories est
// permis : on refuse de ranger une catégorie qui a déjà ses propres
// sous-catégories, ou sous une catégorie qui est elle-même une
// sous-catégorie — dans les deux cas on réaffiche quand même la liste pour
// que le sélecteur revienne à sa valeur réelle (annule visuellement le choix
// invalide qui vient d'être fait).
function setLabelCategoryParent(id, parentId) {
  const tree = getLabelCategoryTree();
  const selfNode = tree.find(c => c.id === id) || tree.flatMap(c => c.children).find(c => c.id === id);
  let ok = true, msg = '';
  if (parentId) {
    if (parentId === id) { ok = false; msg = 'Une catégorie ne peut pas être sa propre sous-catégorie.'; }
    else if (!tree.find(c => c.id === parentId)) { ok = false; msg = "Impossible : cette catégorie est déjà une sous-catégorie (un seul niveau de sous-catégories est permis)."; }
    else if (selfNode && selfNode.children && selfNode.children.length) { ok = false; msg = "Cette catégorie a ses propres sous-catégories : déplace-les d'abord (un seul niveau de sous-catégories est permis)."; }
  }
  if (ok) {
    const cat = (_D.label_categories||[]).find(c => c.id === id);
    if (cat) { cat.parent_id = parentId || null; saveData(); }
  }
  renderLabelsList();
  toast(ok ? (parentId ? 'Catégorie déplacée.' : 'Catégorie remontée au premier niveau.') : msg, ok ? 'success' : 'error');
}

function renameLabelCategory(id) {
  const cat = (_D.label_categories || []).find(c => c.id === id);
  if (!cat) return;
  const name = prompt('Renommer la catégorie :', cat.name);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { toast('Le nom ne peut pas être vide.', 'error'); return; }
  cat.name = trimmed;
  saveData();
  renderLabelsList();
  toast('Catégorie renommée.', 'success');
}

// Supprime une catégorie. Les labels qu'elle contenait, et ses éventuelles
// sous-catégories, repassent en "Non classé"/premier niveau plutôt que de
// disparaître.
function deleteLabelCategory(id) {
  const cat = (_D.label_categories || []).find(c => c.id === id);
  if (!cat) return;
  if (!confirm(`Supprimer la catégorie "${cat.name}" ? Les labels qu'elle contient repasseront en "Non classé".`)) return;
  _D.label_categories = (_D.label_categories || []).filter(c => c.id !== id);
  _D.label_categories.forEach(c => { if (c.parent_id === id) c.parent_id = null; });
  (_D.labels || []).forEach(l => { if (l.category_id === id) l.category_id = null; });
  saveData();
  renderLabelsList();
  toast('Catégorie supprimée.', 'success');
}

// Réorganisation par glisser-déposer des catégories (même principe que
// onBlocDragStart/Over/Drop pour les blocs d'extensions) — écrit directement
// le nouveau sort_order de chaque catégorie.
var _labelCatDragId = null;
function onLabelCatDragStart(e) { _labelCatDragId = e.currentTarget.dataset.catId; e.dataTransfer.effectAllowed = 'move'; }
function onLabelCatDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-target'); }
function onLabelCatDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.lbl-group-header.drag-target').forEach(el => el.classList.remove('drag-target'));
  const toId = e.currentTarget.dataset.catId;
  if (!_labelCatDragId || _labelCatDragId === toId) { _labelCatDragId = null; return; }
  const order = getLabelCategories().map(c => c.id);
  const fromIdx = order.indexOf(_labelCatDragId), toIdx = order.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) { _labelCatDragId = null; return; }
  order.splice(fromIdx, 1); order.splice(toIdx, 0, _labelCatDragId);
  order.forEach((cid, idx) => {
    const cat = (_D.label_categories||[]).find(c => c.id === cid);
    if (cat) cat.sort_order = idx;
  });
  saveData();
  renderLabelsList();
  toast('Ordre des catégories sauvegardé.', 'success');
  _labelCatDragId = null;
}

// Détermine le type de forme d'un Pokémon : une assignation manuelle prend
// toujours le pas sur la détection automatique par motif de nom PokéAPI.
// Une assignation à chaîne vide ('') force explicitement "aucun label".
function _resolveFormType(pokeApiSlug, baseName) {
  const assigned = (_D.pokemon_label_assignments||{})[pokeApiSlug];
  if (assigned !== undefined) return assigned || null;
  return _detectFormType(pokeApiSlug, baseName);
}

// Label assigné manuellement à un Pokémon de BASE via le sélecteur "Label" de
// sa fiche (indépendant de la détection de formes, qui ne concerne que les
// entrées "forme") — renvoie null si aucun label n'a été assigné/effacé.
function _pkdxBaseAssignedLabel(name) {
  const assigned = (_D.pokemon_label_assignments||{})[name];
  return assigned ? getFormLabelConfig(assigned) : null;
}

function _nnLbl(s) {
  return (s||'')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')  // accents
    .replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'")       // apostrophes typographiques → apostrophe droite
    .trim();
}
function _escRe(s)  { return (s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
// HTML-escape for injecting arbitrary/user-edited text (card names, ext names…) into innerHTML.
function _escHtml(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Escape for safely embedding a string inside a single-quoted inline onclick="..." attribute.
function _escJs(s)   { return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// Un nom de carte TCG correspond-il au label `formType` (via ses préfixes/suffixes) ?
function _cardMatchesFormType(cardName, formType) {
  const cfg = getFormLabelConfig(formType);
  if (!cfg.enabled) return false;
  const n = _nnLbl(cardName);
  const prefixes = (cfg.prefixes||[]).map(_nnLbl).filter(Boolean);
  const suffixes = (cfg.suffixes||[]).map(_nnLbl).filter(Boolean);
  if (!prefixes.length && !suffixes.length) return false;
  const test = p => new RegExp('\\b'+_escRe(p)+'\\b').test(n);
  const prefixOk = !prefixes.length || prefixes.some(test);
  const suffixOk = !suffixes.length || suffixes.some(test);
  return prefixOk && suffixOk;
}

// Liste des types de forme ayant au moins un motif de carte configuré (actif)
function _allLinkedFormTypes() {
  return _allLabelTypes().filter(t => {
    const c = getFormLabelConfig(t);
    return c && c.enabled && ((c.prefixes||[]).length || (c.suffixes||[]).length);
  });
}

// Détecte le type de forme à partir du nom PokéAPI
function _detectFormType(pokeName, baseName) {
  // Exact overrides for PokéAPI names that need special handling
  const exact = {
    'necrozma-dusk':'dusk-mane','necrozma-dawn':'dawn-wings','necrozma-ultra':'ultra',
    'kyurem-black':'black','kyurem-white':'white',
    'oricorio-baile':'baile','oricorio-pom-pom':'pom-pom','oricorio-pau':'pau','oricorio-sensu':'sensu',
    'toxtricity-amped':'amped','toxtricity-low-key':'low-key',
    'darmanitan-galar-standard':'galar','darmanitan-galar-zen':'galar-zen',
    'darmanitan-standard':'standard','darmanitan-zen':'zen',
    'castform-rainy':'rainy','castform-snowy':'snowy','castform-sunny':'sunshine',
    'tauros-paldea-combat-breed':'combat-breed','tauros-paldea-blaze-breed':'blaze-breed','tauros-paldea-aqua-breed':'aqua-breed',
    'toxtricity-amped-gmax':'amped-gmax','toxtricity-low-key-gmax':'low-key-gmax',
    'urshifu-single-strike-gmax':'single-strike-gmax','urshifu-rapid-strike-gmax':'rapid-strike-gmax',
    'greninja-ash':'ash','greninja-battle-bond':'battle-bond',
    'calyrex-ice':'ice-rider','calyrex-shadow':'shadow-rider',
    'eiscue-ice':'ice','eiscue-noice':'noice',
    'basculegion-male':'male','basculegion-female':'female',
    'indeedee-male':'male','indeedee-female':'female',
    'zarude-dada':'dada','palafin-zero':'zero','palafin-hero':'hero',
    'dialga-origin':'origin','palkia-origin':'origin',
    'giratina-origin':'origin','giratina-altered':'altered',
    'shaymin-sky':'sky','shaymin-land':'land',
    'keldeo-ordinary':'ordinary','keldeo-resolute':'resolute',
    'meloetta-aria':'aria','meloetta-pirouette':'pirouette',
    'aegislash-shield':'shield','aegislash-blade':'blade',
    'morpeko-full-belly':'full-belly','morpeko-hangry':'hangry',
    'mimikyu-disguised':'disguised','mimikyu-busted':'busted',
    'xerneas-active':'active','xerneas-neutral':'neutral',
    'wishiwashi-solo':'solo','wishiwashi-school':'school',
    'cramorant-gulping':'gulping','cramorant-gorging':'gorging',
    'gimmighoul-chest':'chest','gimmighoul-roaming':'roaming',
    'terapagos-normal':'terapagos-normal','terapagos-terastal':'terastal','terapagos-stellar':'stellar',
    'rotom-heat':'heat','rotom-wash':'wash','rotom-frost':'frost','rotom-fan':'fan','rotom-mow':'mow',
    'deoxys-attack':'attack','deoxys-defense':'defense','deoxys-speed':'speed',
    'wormadam-plant':'plant','wormadam-sandy':'sandy','wormadam-trash':'trash',
    'tornadus-incarnate':'incarnate','tornadus-therian':'therian',
    'thundurus-incarnate':'incarnate','thundurus-therian':'therian',
    'landorus-incarnate':'incarnate','landorus-therian':'therian',
    'enamorus-incarnate':'incarnate','enamorus-therian':'therian',
    'flabebe-red':'red','flabebe-yellow':'yellow','flabebe-orange':'orange','flabebe-blue':'blue','flabebe-white':'white',
    'floette-red':'red','floette-yellow':'yellow','floette-orange':'orange','floette-blue':'blue','floette-white':'white','floette-eternal':'eternal-flower',
    'florges-red':'red','florges-yellow':'yellow','florges-orange':'orange','florges-blue':'blue','florges-white':'white',
    'pumpkaboo-small':'small','pumpkaboo-average':'average','pumpkaboo-large':'large','pumpkaboo-super':'super',
    'gourgeist-small':'small','gourgeist-average':'average','gourgeist-large':'large','gourgeist-super':'super',
    'zygarde-50':'50','zygarde-10':'10','zygarde-complete':'complete',
    'hoopa-confined':'confined','hoopa-unbound':'unbound',
    'lycanroc-midday':'midday','lycanroc-midnight':'midnight','lycanroc-dusk':'dusk',
    'silvally-normal':'normal-silvally',
    'mimikyu-disguised':'disguised','mimikyu-busted':'busted',
    'necrozma-dusk-mane':'dusk-mane','necrozma-dawn-wings':'dawn-wings',
    'sinistea-phony':'phony','sinistea-antique':'antique',
    'polteageist-phony':'phony','polteageist-antique':'antique',
    'basculin-red-striped':'red-striped','basculin-blue-striped':'blue-striped','basculin-white-striped':'white-striped',
    'dudunsparce-two-segment':'two-segment','dudunsparce-three-segment':'three-segment',
    'tatsugiri-curly':'curly','tatsugiri-droopy':'droopy','tatsugiri-stretchy':'stretchy',
    'ogerpon-teal-mask':'teal-mask','ogerpon-wellspring-mask':'wellspring-mask','ogerpon-hearthflame-mask':'hearthflame-mask','ogerpon-cornerstone-mask':'cornerstone-mask',
    'magearna-original':'original',
    'pikachu-original-cap':'cap','pikachu-hoenn-cap':'cap','pikachu-sinnoh-cap':'cap',
    'pikachu-unova-cap':'cap','pikachu-kalos-cap':'cap','pikachu-alola-cap':'cap',
    'pikachu-partner-cap':'cap','pikachu-world-cap':'cap',
    'pikachu-cosplay':'cosplay','pikachu-rock-star':'rock-star','pikachu-belle':'belle',
    'pikachu-pop-star':'pop-star','pikachu-phd':'phd','pikachu-libre':'libre',
    'furfrou-natural':'natural',
    'furfrou-heart':'heart','furfrou-star':'star','furfrou-diamond':'diamond',
    'furfrou-debutante':'debutante','furfrou-matron':'matron','furfrou-dandy':'dandy',
    'furfrou-la-reine':'la-reine','furfrou-kabuki':'kabuki','furfrou-pharaoh':'pharaoh',
    'ursaluna-bloodmoon':'bloodmoon',
    'maushold-family-of-three':'three-family',
  };
  if (exact[pokeName]) return exact[pokeName];

  // Ordered suffix checks (most specific first)
  if (pokeName.includes('-mega-x'))    return 'mega-x';
  if (pokeName.includes('-mega-y'))    return 'mega-y';
  if (pokeName.includes('-mega-z'))    return 'mega-z';
  if (pokeName.includes('-mega'))      return 'mega';
  if (pokeName.includes('-gmax'))      return 'gmax';
  if (pokeName.includes('-alola'))     return 'alola';
  if (pokeName.includes('-galar'))     return 'galar';
  if (pokeName.includes('-hisui'))     return 'hisui';
  if (pokeName.includes('-paldea'))    return 'paldea';
  if (pokeName.includes('-primal'))    return 'primal';
  if (pokeName.includes('-totem'))     return 'totem';
  if (pokeName.includes('-eternamax')) return 'eternamax';
  if (pokeName.includes('-single-strike')) return 'single-strike';
  if (pokeName.includes('-rapid-strike'))  return 'rapid-strike';
  if (pokeName.includes('-original-color')) return 'original-color';
  if (pokeName.includes('-original'))  return 'original';
  if (pokeName.includes('-cap'))       return 'cap';
  if (pokeName.includes('-crowned'))   return 'crowned';
  if (pokeName.includes('-amped'))     return 'amped';
  if (pokeName.includes('-low-key'))   return 'low-key';
  if (pokeName.includes('-aqua-breed')) return 'aqua-breed';
  if (pokeName.includes('-blaze-breed')) return 'blaze-breed';
  if (pokeName.includes('-combat-breed')) return 'combat-breed';
  if (pokeName.includes('-battle-bond')) return 'battle-bond';
  if (pokeName.includes('-full-power')) return 'full-power';
  if (pokeName.includes('-full-belly')) return 'full-belly';
  if (pokeName.includes('-teal-mask')) return 'teal-mask';
  if (pokeName.includes('-wellspring-mask')) return 'wellspring-mask';
  if (pokeName.includes('-hearthflame-mask')) return 'hearthflame-mask';
  if (pokeName.includes('-cornerstone-mask')) return 'cornerstone-mask';
  if (pokeName.includes('-red-striped')) return 'red-striped';
  if (pokeName.includes('-blue-striped')) return 'blue-striped';
  if (pokeName.includes('-white-striped')) return 'white-striped';
  if (pokeName.includes('-two-segment')) return 'two-segment';
  if (pokeName.includes('-family-of-three')) return 'three-family';
  if (pokeName.includes('-three-segment')) return 'three-segment';
  if (pokeName.includes('-dusk-mane')) return 'dusk-mane';
  if (pokeName.includes('-dawn-wings')) return 'dawn-wings';
  if (pokeName.includes('-eternal-flower')) return 'eternal-flower';
  if (pokeName.includes('-own-tempo')) return 'own';
  if (pokeName.includes('-rock-star')) return 'rock-star';
  if (pokeName.includes('-pop-star'))  return 'pop-star';
  if (pokeName.includes('-pom-pom'))   return 'pom-pom';
  if (pokeName.includes('-origin'))    return 'origin';
  if (pokeName.includes('-therian'))   return 'therian';
  if (pokeName.includes('-incarnate')) return 'incarnate';
  if (pokeName.includes('-stellar'))   return 'stellar';
  if (pokeName.includes('-terastal'))  return 'terastal';
  if (pokeName.includes('-complete'))  return 'complete';
  if (pokeName.includes('-unbound'))   return 'unbound';
  if (pokeName.includes('-confined'))  return 'confined';
  if (pokeName.includes('-pirouette')) return 'pirouette';
  if (pokeName.includes('-eternamax')) return 'eternamax';
  if (pokeName.includes('-ultra'))     return 'ultra';
  if (pokeName.includes('-altered'))   return 'altered';
  if (pokeName.includes('-resolute'))  return 'resolute';
  if (pokeName.includes('-ordinary'))  return 'ordinary';
  if (pokeName.includes('-disguised')) return 'disguised';
  if (pokeName.includes('-busted'))    return 'busted';
  if (pokeName.includes('-hangry'))    return 'hangry';
  if (pokeName.includes('-gorging'))   return 'gorging';
  if (pokeName.includes('-gulping'))   return 'gulping';
  if (pokeName.includes('-noice'))     return 'noice';
  if (pokeName.includes('-school'))    return 'school';
  if (pokeName.includes('-midday'))    return 'midday';
  if (pokeName.includes('-midnight'))  return 'midnight';
  if (pokeName.includes('-crowned'))   return 'crowned';
  if (pokeName.includes('-blade'))     return 'blade';
  if (pokeName.includes('-shield'))    return 'shield';
  if (pokeName.includes('-attack'))    return 'attack';
  if (pokeName.includes('-defense'))   return 'defense';
  if (pokeName.includes('-speed'))     return 'speed';
  if (pokeName.includes('-cosplay'))   return 'cosplay';
  if (pokeName.includes('-belle'))     return 'belle';
  if (pokeName.includes('-libre'))     return 'libre';
  if (pokeName.includes('-phd'))       return 'phd';
  if (pokeName.includes('-curly'))     return 'curly';
  if (pokeName.includes('-droopy'))    return 'droopy';
  if (pokeName.includes('-stretchy'))  return 'stretchy';
  if (pokeName.includes('-phony'))     return 'phony';
  if (pokeName.includes('-antique'))   return 'antique';
  if (pokeName.includes('-dusk'))      return 'dusk';
  if (pokeName.includes('-dawn'))      return 'dawn';
  if (pokeName.includes('-sky'))       return 'sky';
  if (pokeName.includes('-land'))      return 'land';
  if (pokeName.includes('-zen'))       return 'zen';
  if (pokeName.includes('-aria'))      return 'aria';
  if (pokeName.includes('-heat'))      return 'heat';
  if (pokeName.includes('-wash'))      return 'wash';
  if (pokeName.includes('-frost'))     return 'frost';
  if (pokeName.includes('-fan'))       return 'fan';
  if (pokeName.includes('-mow'))       return 'mow';
  if (pokeName.includes('-plant'))     return 'plant';
  if (pokeName.includes('-sandy'))     return 'sandy';
  if (pokeName.includes('-trash'))     return 'trash';
  if (pokeName.includes('-spring'))    return 'spring';
  if (pokeName.includes('-summer'))    return 'summer';
  if (pokeName.includes('-autumn'))    return 'autumn';
  if (pokeName.includes('-winter'))    return 'winter';
  if (pokeName.includes('-baile'))     return 'baile';
  if (pokeName.includes('-pau'))       return 'pau';
  if (pokeName.includes('-sensu'))     return 'sensu';
  if (pokeName.includes('-overcast'))  return 'overcast';
  if (pokeName.includes('-sunshine'))  return 'sunshine';
  if (pokeName.includes('-rainy'))     return 'rainy';
  if (pokeName.includes('-snowy'))     return 'snowy';
  if (pokeName.includes('-natural'))   return 'natural';
  if (pokeName.includes('-black'))     return 'black';
  if (pokeName.includes('-white'))     return 'white';
  if (pokeName.includes('-red'))       return 'red';
  if (pokeName.includes('-yellow'))    return 'yellow';
  if (pokeName.includes('-orange'))    return 'orange';
  if (pokeName.includes('-blue'))      return 'blue';
  if (pokeName.includes('-neutral'))   return 'neutral';
  if (pokeName.includes('-hero'))      return 'hero';
  if (pokeName.includes('-zero'))      return 'zero';
  if (pokeName.includes('-ash'))       return 'ash';
  if (pokeName.includes('-dada'))      return 'dada';
  if (pokeName.includes('-male'))      return 'male';
  if (pokeName.includes('-female'))    return 'female';
  if (pokeName.includes('-small'))     return 'small';
  if (pokeName.includes('-large'))     return 'large';
  if (pokeName.includes('-super'))     return 'super';
  if (pokeName.includes('-average'))   return 'average';
  if (pokeName.includes('-chest'))     return 'chest';
  if (pokeName.includes('-roaming'))   return 'roaming';
  if (pokeName.includes('-shadow'))    return 'shadow';
  if (pokeName.includes('-ice'))       return 'ice';
  if (pokeName.includes('-50'))        return '50';
  if (pokeName.includes('-10'))        return '10';
  return null;
}


