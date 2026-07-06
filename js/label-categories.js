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

// Labels des formes spéciales
var FORM_LABELS = {
  // Méga
  mega:            { fr:'Méga',              badge:'MÉGA',      color:'#7038F8' },
  'mega-x':        { fr:'Méga X',            badge:'MÉGA X',    color:'#5A28C8' },
  'mega-y':        { fr:'Méga Y',            badge:'MÉGA Y',    color:'#C03028' },
  'mega-z':        { fr:'Méga Z',            badge:'MÉGA Z',    color:'#2563EB' },
  // Gigamax / Primo
  gmax:            { fr:'Gigamax',           badge:'GIGAMAX',   color:'#E63946' },
  'amped-gmax':        { fr:'Gigamax Ampli',        badge:'GIGAMAX AMPLI',   color:'#E63946' },
  'low-key-gmax':      { fr:'Gigamax Discret',      badge:'GIGAMAX DISCRET', color:'#E63946' },
  'single-strike-gmax':{ fr:'Gigamax Poing Unique',  badge:'POING UNIQUE',   color:'#E63946' },
  'rapid-strike-gmax': { fr:'Gigamax Style Rafale',  badge:'STYLE RAFALE',   color:'#E63946' },
  primal:          { fr:'Primo',             badge:'PRIMO',     color:'#E8553D' },
  eternamax:       { fr:'Éternamax',         badge:'ÉTERNA.',   color:'#DC2626' },
  // Régionales
  alola:           { fr:'Alola',             badge:'ALOLA',     color:'#06D6A0' },
  galar:           { fr:'Galar',             badge:'GALAR',     color:'#4A9EFF' },
  hisui:           { fr:'Hisui',             badge:'HISUI',     color:'#C0984A' },
  paldea:          { fr:'Paldea',            badge:'PALDEA',    color:'#A855F7' },
  // Légendaires formes
  origin:          { fr:'Originel',          badge:'ORIGIN.',   color:'#64748B' },
  altered:         { fr:'Modifié',           badge:'MODIF.',    color:'#4B5563' },
  sky:             { fr:'Ciel',              badge:'CIEL',      color:'#38BDF8' },
  land:            { fr:'Terrestre',         badge:'TERR.',     color:'#84CC16' },
  incarnate:       { fr:'Incarné',           badge:'INCARNÉ',   color:'#6366F1' },
  therian:         { fr:'Totémique',         badge:'TOTÉM.',    color:'#78716C' },
  crowned:         { fr:'Couronné',          badge:'COURON.',   color:'#D4AF37' },
  black:           { fr:'Noir',              badge:'NOIR',      color:'#1C1917' },
  white:           { fr:'Blanc',             badge:'BLANC',     color:'#E2E8F0' },
  'dusk-mane':     { fr:'Crinière Couchant', badge:'CRIN.',     color:'#F59E0B' },
  'dawn-wings':    { fr:'Ailes Aurore',      badge:'AILES',     color:'#6366F1' },
  ultra:           { fr:'Ultra',             badge:'ULTRA',     color:'#F97316' },
  confined:        { fr:'Confiné',           badge:'CONF.',     color:'#7C3AED' },
  unbound:         { fr:'Déchaîné',          badge:'DÉCHAÎNÉ',  color:'#DC2626' },
  complete:        { fr:'Complet',           badge:'COMPLET',   color:'#10B981' },
  '10':            { fr:'10%',               badge:'10%',       color:'#EF4444' },
  '50':            { fr:'50%',               badge:'50%',       color:'#6B7280' },
  '100':           { fr:'100%',              badge:'100%',      color:'#DC2626' },
  'battle-bond':   { fr:'Résolution',        badge:'RÉSOL.',    color:'#2563EB' },
  ash:             { fr:'Sacha',             badge:'SACHA',     color:'#EF4444' },
  'teal-mask':     { fr:'Masque Turquoise',  badge:'TURQ.',     color:'#0D9488' },
  'wellspring-mask':{ fr:'Masque Source',    badge:'SOURCE',    color:'#0EA5E9' },
  'hearthflame-mask':{ fr:'Masque Foyer',    badge:'FOYER',     color:'#F97316' },
  'cornerstone-mask':{ fr:'Masque Socle',    badge:'SOCLE',     color:'#78716C' },
  stellar:         { fr:'Stellaire',         badge:'STELL.',    color:'#A855F7' },
  terastal:        { fr:'Téracristal',       badge:'TÉRA',      color:'#F59E0B' },
  original:        { fr:'Passé',             badge:'PASSÉ',     color:'#D97706' },
  'original-color':{ fr:'Couleur Passé',     badge:'PASSÉ',     color:'#D97706' },
  'ice-rider':     { fr:'Cavalier Glace',    badge:'GLACE',     color:'#93C5FD' },
  'shadow-rider':  { fr:'Cavalier Spectre',  badge:'SPECTRE',   color:'#8B5CF6' },
  // Combat / mécanique
  blade:           { fr:'Épée',              badge:'ÉPÉE',      color:'#EF4444' },
  shield:          { fr:'Bouclier',          badge:'BOUCLIER',  color:'#3B82F6' },
  zen:             { fr:'Mode Zen',          badge:'ZEN',       color:'#8B5CF6' },
  'galar-zen':     { fr:'Galar Mode Zen',    badge:'GAL.ZEN',   color:'#3B82F6' },
  pirouette:       { fr:'Pirouette',         badge:'PIROU.',    color:'#EC4899' },
  aria:            { fr:'Aria',              badge:'ARIA',      color:'#F472B6' },
  resolute:        { fr:'Résolu',            badge:'RÉSOLU',    color:'#EF4444' },
  ordinary:        { fr:'Ordinaire',         badge:'ORD.',      color:'#9CA3AF' },
  busted:          { fr:'Révélé',            badge:'RÉVÉLÉ',    color:'#7C3AED' },
  disguised:       { fr:'Déguisé',           badge:'DÉGUISÉ',   color:'#059669' },
  school:          { fr:'Banc',              badge:'BANC',      color:'#06B6D4' },
  solo:            { fr:'Solo',              badge:'SOLO',      color:'#84CC16' },
  hangry:          { fr:'Affamé',            badge:'AFFAMÉ',    color:'#DC2626' },
  'full-belly':    { fr:'Repu',              badge:'REPU',      color:'#16A34A' },
  hero:            { fr:'Héros',             badge:'HÉROS',     color:'#D97706' },
  noice:           { fr:'Glace',             badge:'GLACE',     color:'#93C5FD' },
  amped:           { fr:'Amplifié',          badge:'AMPLI.',    color:'#FBBF24' },
  'low-key':       { fr:'Discret',           badge:'DISCR.',    color:'#60A5FA' },
  'single-strike': { fr:'Style Brutal',      badge:'BRUTAL',    color:'#1E3A8A' },
  'rapid-strike':  { fr:'Style Rapide',      badge:'RAPIDE',    color:'#06A77D' },
  gulping:         { fr:'Glouton',           badge:'GLOUTON',   color:'#F97316' },
  gorging:         { fr:'Gavé',              badge:'GAVÉ',      color:'#DC2626' },
  neutral:         { fr:'Neutre',            badge:'NEUTRE',    color:'#6B7280' },
  zero:            { fr:'Zéro',              badge:'ZÉRO',      color:'#9CA3AF' },
  dada:            { fr:'Papa',              badge:'PAPA',      color:'#A78BFA' },
  'two-segment':   { fr:'Courbée (2 seg.)',        badge:'×2',        color:'#6B7280' },
  'three-family':  { fr:'Famille de 3',      badge:'FAM.3',     color:'#F9A8D4' },
  'three-segment': { fr:'3 Segments',        badge:'×3',        color:'#374151' },
  'full-power':    { fr:'Puissance Max',     badge:'MAX',       color:'#7C3AED' },
  own:             { fr:'Maître',            badge:'MAÎTRE',    color:'#D97706' },
  'east-sea':      { fr:'Mer Orient',        badge:'ORIENT',    color:'#0EA5E9' },
  'west-sea':      { fr:'Mer Occident',      badge:'OCCID.',    color:'#6366F1' },
  active:          { fr:'Actif',             badge:'ACTIF',     color:'#FBBF24' },
  chest:           { fr:'Coffre',            badge:'COFFRE',    color:'#D97706' },
  roaming:         { fr:'Errant',            badge:'ERRANT',    color:'#9CA3AF' },
  // Rotom
  heat:            { fr:'Chaleur',           badge:'CHAUD',     color:'#EF4444' },
  wash:            { fr:'Lavage',            badge:'LAVAGE',    color:'#3B82F6' },
  frost:           { fr:'Froid',             badge:'FROID',     color:'#BAE6FD' },
  fan:             { fr:'Ventilateur',       badge:'VENT.',     color:'#86EFAC' },
  mow:             { fr:'Tonte',             badge:'TONTE',     color:'#4ADE80' },
  // Plumeline (Oricorio)
  baile:           { fr:'Style Flamenco',     badge:'FLAMENCO',  color:'#EF4444' },
  'pom-pom':       { fr:'Style Pom-Pom',     badge:'POM-POM',   color:'#F59E0B' },
  pau:             { fr:"Style Pa'u",        badge:"PA'U",      color:'#EC4899' },
  sensu:           { fr:'Style Sensu',       badge:'SENSU',     color:'#8B5CF6' },
  // Météo / saisonnières
  overcast:        { fr:'Nuageux',           badge:'NUAGE',     color:'#94A3B8' },
  sunshine:        { fr:'Ensoleillé',        badge:'SOLEIL',    color:'#FCD34D' },
  rainy:           { fr:'Pluvieux',          badge:'PLUIE',     color:'#60A5FA' },
  snowy:           { fr:'Neigeux',           badge:'NEIGE',     color:'#E0F2FE' },
  midday:          { fr:'Diurne',            badge:'DIURNE',    color:'#FCD34D' },
  midnight:        { fr:'Nocturne',          badge:'NOCT.',     color:'#4F46E5' },
  dusk:            { fr:'Crépusculaire',     badge:'CRÉP.',     color:'#F97316' },
  dawn:            { fr:'Aube',              badge:'AUBE',      color:'#818CF8' },
  spring:          { fr:'Printemps',         badge:'PRINT.',    color:'#F9A8D4' },
  summer:          { fr:'Été',               badge:'ÉTÉ',       color:'#FCD34D' },
  autumn:          { fr:'Automne',           badge:'AUT.',      color:'#F97316' },
  winter:          { fr:'Hiver',             badge:'HIVER',     color:'#93C5FD' },
  // Cheniti / Cheniselle
  plant:           { fr:'Plante',            badge:'PLANTE',    color:'#22C55E' },
  sandy:           { fr:'Sable',             badge:'SABLE',     color:'#D97706' },
  trash:           { fr:'Déchet',            badge:'DÉCHET',    color:'#6B7280' },
  // Flabébé / Florges
  red:             { fr:'Rouge',             badge:'ROUGE',     color:'#EF4444' },
  yellow:          { fr:'Jaune',             badge:'JAUNE',     color:'#FCD34D' },
  orange:          { fr:'Orange',            badge:'ORANGE',    color:'#F97316' },
  blue:            { fr:'Bleu',              badge:'BLEU',      color:'#3B82F6' },
  'eternal-flower':{ fr:'Fleur Éternelle',   badge:'ÉTERN.',    color:'#A78BFA' },
  // Pikachu
  cap:             { fr:'Casquette',         badge:'CASQ.',     color:'#FFCB05' },
  cosplay:         { fr:'Cosplay',           badge:'COSPLAY',   color:'#EC4899' },
  'rock-star':     { fr:'Rock Star',         badge:'ROCK',      color:'#374151' },
  belle:           { fr:'Belle',             badge:'BELLE',     color:'#F472B6' },
  'pop-star':      { fr:'Pop Star',          badge:'POP',       color:'#E879F9' },
  phd:             { fr:'Chercheuse',        badge:'DR.',       color:'#2563EB' },
  libre:           { fr:'Catcheuse',         badge:'LIBRE',     color:'#16A34A' },
  // Tauros Paldea
  'aqua-breed':    { fr:'Race Aqua',         badge:'AQUA',      color:'#38BDF8' },
  'blaze-breed':   { fr:'Race Flamme',       badge:'FLAMME',    color:'#F97316' },
  'combat-breed':  { fr:'Race Combat',       badge:'COMBAT',    color:'#EF4444' },
  // Divers
  totem:           { fr:'Totem',             badge:'TOTEM',     color:'#FFD166' },
  attack:          { fr:'Attaque',           badge:'ATT.',      color:'#EF4444' },
  defense:         { fr:'Défense',           badge:'DÉF.',      color:'#3B82F6' },
  speed:           { fr:'Vitesse',           badge:'VIT.',      color:'#F59E0B' },
  small:           { fr:'Petite',            badge:'PETITE',    color:'#86EFAC' },
  large:           { fr:'Grande',            badge:'GRANDE',    color:'#4ADE80' },
  super:           { fr:'Géante',            badge:'GÉANTE',    color:'#166534' },
  average:         { fr:'Moyenne',           badge:'MOY.',      color:'#6B7280' },
  curly:           { fr:'Vert (Enroulé)',     badge:'ENROUL.',   color:'#22C55E' },
  droopy:          { fr:'Pendant',           badge:'PENDANT',   color:'#93C5FD' },
  stretchy:        { fr:'Allongé',           badge:'ALLONG.',   color:'#FCD34D' },
  phony:           { fr:'Contrefait',        badge:'CONTREF.',  color:'#9CA3AF' },
  antique:         { fr:'Authentique',       badge:'AUTH.',     color:'#D97706' },
  'red-striped':   { fr:'Rayé Rouge',        badge:'ROUGE',     color:'#EF4444' },
  'blue-striped':  { fr:'Rayé Bleu',         badge:'BLEU',      color:'#3B82F6' },
  'white-striped': { fr:'Rayé Blanc',        badge:'BLANC',     color:'#E2E8F0' },
  natural:         { fr:'Naturel',           badge:'NAT.',      color:'#84CC16' },
  heart:           { fr:'Cœur',              badge:'CŒUR',      color:'#EC4899' },
  star:            { fr:'Étoile',            badge:'ÉTOILE',    color:'#FBBF24' },
  diamond:         { fr:'Diamant',           badge:'DIAMANT',   color:'#60A5FA' },
  debutante:       { fr:'Demoiselle',        badge:'DEMOIS.',   color:'#F9A8D4' },
  matron:          { fr:'Madame',            badge:'MADAME',    color:'#A78BFA' },
  dandy:           { fr:'Monsieur',          badge:'MONSIEUR',  color:'#374151' },
  'la-reine':      { fr:'Reine',             badge:'REINE',     color:'#D4AF37' },
  kabuki:          { fr:'Kabuki',            badge:'KABUKI',    color:'#EF4444' },
  pharaoh:         { fr:'Pharaon',           badge:'PHARAON',   color:'#D97706' },
  bloodmoon:       { fr:'Lune Vermeille',    badge:'L.VERM.',   color:'#DC2626' },
  male:            { fr:'Mâle',              badge:'♂',         color:'#3B82F6' },
  female:          { fr:'Femelle',           badge:'♀',         color:'#EC4899' },
  standard:        { fr:'Standard',          badge:'STD.',      color:'#6B7280' },
  normal:          { fr:'Normal',            badge:'NORM.',     color:'#9CA3AF' },
  'normal-silvally': { fr:'Type Aigüe',       badge:'AIGÜE',     color:'#9CA3AF' },
};

// Groupes de labels (utilisés par le filtre Pokédex ET l'onglet Édition › Labels)
var FORM_LABEL_GROUPS = [
  { id:'regionales',      label: 'Régionales',          types: ['alola','galar','hisui','paldea'] },
  { id:'mega',            label: 'Méga',                types: ['mega','mega-x','mega-y','mega-z'] },
  { id:'gmax-primo',      label: 'Gigamax / Primo',     types: ['gmax','amped-gmax','low-key-gmax','single-strike-gmax','rapid-strike-gmax','primal','eternamax'] },
  { id:'legendaires',     label: 'Légendaires',         types: ['origin','altered','sky','land','therian','incarnate','crowned','black','white','dusk-mane','dawn-wings','ultra','confined','unbound','complete','10','50','battle-bond','ash','teal-mask','wellspring-mask','hearthflame-mask','cornerstone-mask','stellar','terastal','original','original-color','ice-rider','shadow-rider'] },
  { id:'combat-mecanique',label: 'Combat / Mécanique',  types: ['blade','shield','zen','galar-zen','pirouette','aria','resolute','ordinary','busted','disguised','school','solo','hangry','full-belly','hero','noice','amped','low-key','single-strike','rapid-strike','gulping','gorging','neutral','zero','dada','two-segment','three-segment','three-family'] },
  { id:'rotom',           label: 'Rotom',               types: ['heat','wash','frost','fan','mow'] },
  { id:'morpheo',         label: 'Morphéo (Oricorio)',  types: ['baile','pom-pom','pau','sensu'] },
  { id:'formes-meteo',    label: 'Formes météo',        types: ['overcast','sunshine','rainy','snowy','midday','midnight','dusk','dawn'] },
  { id:'formes-saisons',  label: 'Formes saisonnières', types: ['spring','summer','autumn','winter'] },
  { id:'chenipoto',       label: 'Cheniti/Cheniselle',  types: ['plant','sandy','trash'] },
  { id:'flabebe',         label: 'Flabébé / Florges',   types: ['red','yellow','orange','blue','white','eternal-flower'] },
  { id:'pikachu-speciaux',label: 'Pikachu spéciaux',    types: ['cap','cosplay','rock-star','belle','pop-star','phd','libre'] },
  { id:'tauros-paldea',   label: 'Tauros Paldea',       types: ['aqua-breed','blaze-breed','combat-breed'] },
  { id:'couafarel',       label: 'Couafarel',           types: ['natural','heart','star','diamond','debutante','matron','dandy','la-reine','kabuki','pharaoh'] },
  { id:'autres',          label: 'Autres',              types: ['totem','attack','defense','speed','small','large','super','average','curly','droopy','stretchy','phony','antique','red-striped','blue-striped','white-striped','male','female','own','east-sea','west-sea','active','chest','roaming','full-power','bloodmoon','standard','normal'] },
];

// Motifs par défaut (préfixe / suffixe dans le nom de carte TCG) permettant de
// relier une forme spéciale à ses cartes. Seuls les types ayant un réel
// équivalent carte ont des motifs par défaut ; les autres labels restent
// éditables mais ne filtrent rien tant qu'aucun motif n'est renseigné.
var DEFAULT_FORM_CARD_PATTERNS = {
  mega:     { prefixes: ['Méga-', 'Méga ', 'M ', 'M-'], suffixes: [] },
  'mega-x': { prefixes: ['Méga-', 'Méga ', 'M ', 'M-'], suffixes: ['X'] },
  'mega-y': { prefixes: ['Méga-', 'Méga ', 'M ', 'M-'], suffixes: ['Y'] },
  'mega-z': { prefixes: ['Méga-', 'Méga ', 'M ', 'M-'], suffixes: ['Z'] },
  gmax:     { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  'amped-gmax':         { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  'low-key-gmax':       { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  'single-strike-gmax': { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  'rapid-strike-gmax':  { prefixes: [], suffixes: ['Gigamax', 'VMAX'] },
  primal:   { prefixes: ['Primo-', 'Primo '], suffixes: [] },
  alola:    { prefixes: [], suffixes: ["d'Alola", 'de Alola', 'Alola'] },
  galar:    { prefixes: [], suffixes: ['de Galar'] },
  hisui:    { prefixes: [], suffixes: ['de Hisui', "d'Hisui"] },
  paldea:   { prefixes: [], suffixes: ['de Paldea'] },
};

// Fusionne la définition statique d'un label (ou sa version personnalisée)
// avec la surcharge utilisateur (nom, badge, couleur, visibilité, préfixes/
// suffixes). Si le label a été supprimé définitivement, il est neutralisé.
function getFormLabelConfig(type) {
  if (!type) return null;
  if ((_D.deleted_labels||[]).includes(type)) {
    return { fr:type, badge:'', color:'#555', enabled:false, prefixes:[], suffixes:[], isCustom:false, isDeleted:true };
  }
  const custom = (_D.custom_labels||{})[type];
  const base   = custom || FORM_LABELS[type] || { fr: type, badge: (type||'').toUpperCase(), color: '#888' };
  const ov     = (_D.form_label_overrides || {})[type] || {};
  const dflt   = DEFAULT_FORM_CARD_PATTERNS[type] || { prefixes: [], suffixes: [] };
  return {
    fr:       ov.fr       !== undefined ? ov.fr       : base.fr,
    badge:    ov.badge    !== undefined ? ov.badge    : base.badge,
    color:    ov.color    !== undefined ? ov.color    : base.color,
    enabled:  ov.enabled !== undefined ? ov.enabled : (custom && custom.enabled !== undefined ? custom.enabled : true),
    prefixes: Array.isArray(ov.prefixes) ? ov.prefixes.slice() : (custom ? (custom.prefixes||[]).slice() : dflt.prefixes.slice()),
    suffixes: Array.isArray(ov.suffixes) ? ov.suffixes.slice() : (custom ? (custom.suffixes||[]).slice() : dflt.suffixes.slice()),
    isCustom: !!custom,
    isDeleted:false,
  };
}

// Un type de label existe-t-il en tant que label personnalisé (créé par l'utilisateur) ?
function _isCustomLabelType(type) { return !!(_D.custom_labels||{})[type]; }

// Tous les types de labels actuellement disponibles (hors supprimés définitivement)
function _allLabelTypes() {
  const deleted = new Set(_D.deleted_labels||[]);
  const builtins = Object.keys(FORM_LABELS).filter(t => !deleted.has(t));
  const customs  = Object.keys(_D.custom_labels||{});
  return [...builtins, ...customs];
}

// ── Catégories de labels (Édition › Labels) ────────────────────────────────
// Les catégories intégrées (FORM_LABEL_GROUPS) et celles créées par
// l'utilisateur (_D.custom_label_categories) sont fusionnées et triées selon
// _D.label_category_order (même principe que getBlocs() / _D.settings.bloc_order).
// Une catégorie intégrée peut être renommée ou masquée via
// _D.label_category_overrides[id] = { name?, _hidden? } — elle n'est jamais
// supprimée du code, seulement masquée (restaurable).
function getLabelCategories() {
  const builtin = FORM_LABEL_GROUPS
    .filter(g => !(_D.label_category_overrides||{})[g.id]?._hidden)
    .map(g => {
      const ov = (_D.label_category_overrides||{})[g.id] || {};
      return { id: g.id, name: ov.name !== undefined ? ov.name : g.label, _builtin: true };
    });
  const custom  = (_D.custom_label_categories || []).map(c => ({ id: c.id, name: c.name, _custom: true }));
  const all = [...builtin, ...custom];
  const order = _D.label_category_order || [];
  if (order.length) {
    all.sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  return all;
}

// Catégorie effective d'un label : une assignation manuelle prend le pas sur
// l'appartenance par défaut à un groupe intégré ; sans les deux, le label est
// "Non classé" (null). Si la catégorie par défaut a été masquée, le label
// retombe aussi sur "Non classé" plutôt que de disparaître silencieusement.
function _labelCategoryOf(type) {
  const ov = (_D.label_category_assignments || {})[type];
  if (ov !== undefined) return ov || null;
  const grp = FORM_LABEL_GROUPS.find(g => g.types.includes(type));
  if (!grp) return null;
  if ((_D.label_category_overrides||{})[grp.id]?._hidden) return null;
  return grp.id;
}

// Déplace un label vers une catégorie (categoryId='' ou null → Non classé).
// N'enregistre une surcharge que si elle diffère de la catégorie par défaut,
// pour rester cohérent avec le reste de l'appli (ext_overrides, etc.).
function setLabelCategory(type, categoryId) {
  if (!_D.label_category_assignments) _D.label_category_assignments = {};
  const defaultCat = (FORM_LABEL_GROUPS.find(g => g.types.includes(type)) || {}).id || null;
  const normalized = categoryId || null;
  if (normalized === defaultCat) delete _D.label_category_assignments[type];
  else _D.label_category_assignments[type] = normalized || '';
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie mise à jour.', 'success');
}

function addLabelCategory() {
  const input = document.getElementById('new-label-cat');
  const name = (input?.value || '').trim();
  if (!name) { toast('Indique un nom pour la nouvelle catégorie.', 'error'); return; }
  if (!_D.custom_label_categories) _D.custom_label_categories = [];
  const id = 'lblcat_' + Date.now();
  _D.custom_label_categories.push({ id, name });
  saveData();
  _pushLabelSettingsToCloud();
  if (input) input.value = '';
  renderLabelsList();
  toast('Catégorie créée.', 'success');
}

// Renomme une catégorie, personnalisée OU intégrée (via une surcharge de nom).
function renameLabelCategory(id) {
  const custom  = (_D.custom_label_categories || []).find(c => c.id === id);
  const builtin = FORM_LABEL_GROUPS.find(g => g.id === id);
  if (!custom && !builtin) return;
  const currentName = custom ? custom.name : ((_D.label_category_overrides||{})[id]?.name ?? builtin.label);
  const name = prompt('Renommer la catégorie :', currentName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) { toast('Le nom ne peut pas être vide.', 'error'); return; }
  if (custom) {
    custom.name = trimmed;
  } else {
    if (!_D.label_category_overrides) _D.label_category_overrides = {};
    const ov = { ...(_D.label_category_overrides[id] || {}) };
    if (trimmed === builtin.label) delete ov.name; else ov.name = trimmed;
    if (Object.keys(ov).length) _D.label_category_overrides[id] = ov;
    else delete _D.label_category_overrides[id];
  }
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie renommée.', 'success');
}

// Supprime une catégorie personnalisée, ou masque une catégorie intégrée
// (restaurable ensuite). Dans les deux cas, les labels qu'elle contenait
// repassent en "Non classé" plutôt que de disparaître.
function deleteLabelCategory(id) {
  const custom  = (_D.custom_label_categories || []).find(c => c.id === id);
  const builtin = FORM_LABEL_GROUPS.find(g => g.id === id);
  if (!custom && !builtin) return;
  const name = custom ? custom.name : ((_D.label_category_overrides||{})[id]?.name ?? builtin.label);
  const msg = custom
    ? `Supprimer la catégorie "${name}" ? Les labels qu'elle contient repasseront en "Non classé".`
    : `Masquer la catégorie intégrée "${name}" ? Les labels qu'elle contient repasseront en "Non classé" (elle reste restaurable en bas de liste).`;
  if (!confirm(msg)) return;

  if (custom) {
    _D.custom_label_categories = (_D.custom_label_categories || []).filter(c => c.id !== id);
  } else {
    if (!_D.label_category_overrides) _D.label_category_overrides = {};
    _D.label_category_overrides[id] = { ...(_D.label_category_overrides[id]||{}), _hidden: true };
    if (!_D.label_category_assignments) _D.label_category_assignments = {};
    builtin.types.forEach(type => {
      if (!(type in (_D.label_category_assignments||{}))) _D.label_category_assignments[type] = '';
    });
  }
  if (_D.label_category_assignments) {
    Object.keys(_D.label_category_assignments).forEach(type => {
      if (_D.label_category_assignments[type] === id) delete _D.label_category_assignments[type];
    });
  }
  if (_D.label_category_order) _D.label_category_order = _D.label_category_order.filter(cid => cid !== id);
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast(custom ? 'Catégorie supprimée.' : 'Catégorie masquée.', 'success');
}

// Restaure une catégorie intégrée précédemment masquée.
function restoreLabelCategory(id) {
  if ((_D.label_category_overrides||{})[id]) {
    delete _D.label_category_overrides[id]._hidden;
    if (Object.keys(_D.label_category_overrides[id]).length === 0) delete _D.label_category_overrides[id];
  }
  saveData();
  _pushLabelSettingsToCloud();
  renderLabelsList();
  toast('Catégorie restaurée.', 'success');
}

// Réorganisation par glisser-déposer des catégories (même principe que
// onBlocDragStart/Over/Drop pour les blocs d'extensions).
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
  _D.label_category_order = order;
  saveData();
  _pushLabelSettingsToCloud();
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


