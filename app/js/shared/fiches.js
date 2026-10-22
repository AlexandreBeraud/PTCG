import { listFolder, rawUrl, imageUrl } from '../nas.js';
import { html } from '../ui/dom.js';
import { cardImage, spriteHtml } from './sales.js';

// Fiches de l'Encyclopédie : leurs onglets et leurs images, rangées sur le NAS
// comme dans l'ancienne appli (Personnages/Cynthia.png, Objets/Poké Ball.png…)

export const KINDS = [
  { id: 'personnage', label: 'Personnages', one: 'personnage', search: 'Chercher un personnage (Cynthia, N…)', folder: 'Personnages', emoji: '👤' },
  { id: 'supporter', label: 'Supporters', one: 'supporter', search: 'Chercher un supporter', folder: 'Personnages', emoji: '👤' },
  { id: 'objet', label: 'Objets', one: 'objet', search: 'Chercher un objet (Poké Ball…)', folder: 'Objets', emoji: '🎒' },
  { id: 'lieu', label: 'Lieux', one: 'lieu', search: 'Chercher un lieu (stade)', folder: 'Lieux', emoji: '🌳' },
  { id: 'energie', label: 'Énergies', one: 'énergie', search: 'Chercher une énergie', folder: 'Energies', emoji: '⭕' },
];
export const kindOf = key => KINDS.find(k => k.id === String(key || '').split(':')[0]);

// couleur des énergies de base (« energie:type:feu »)
const TYPE_COLORS = {
  plante: '#5bb85d', feu: '#e8553e', eau: '#3d9be9', electrique: '#f2c12e', psy: '#a65fd0', combat: '#c0703a',
  obscurite: '#3c3a4a', metal: '#9aa3ad', fee: '#ee8fc5', dragon: '#c4a23a', incolore: '#e8e6df',
};

// même nettoyage que v2.fiche_slug côté base, en plus tolérant pour les noms de fichiers
export function ficheSlug(s) {
  return String(s || '')
    .replace(/[’‘ʼ´`]/g, "'")
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(prof\.\s*|professeure?\s+)/gi, 'Professeur ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^energie (.+?)( de base)?$/, '$1');
}

// ── Images du NAS : chaque dossier est lu une fois, puis gardé ──
const maps = new Map();
let pending = null;

export function loadFicheImages() {
  pending ||= Promise.all([...new Set(KINDS.map(k => k.folder))].map(async folder => {
    const files = await listFolder(folder);
    if (!files) throw new Error('NAS injoignable');
    const m = new Map();
    // le plus récent gagne si deux fichiers ont le même nom (Cynthia.png, Cynthia.jpg)
    files.filter(f => /\.(png|jpe?g|webp|gif)$/i.test(f.name))
      .sort((a, b) => String(a.modified).localeCompare(String(b.modified)))
      .forEach(f => m.set(ficheSlug(f.name.replace(/\.[^.]+$/, '')), f.path));
    maps.set(folder, m);
  })).catch(() => { pending = null; });
  // on n'attend pas le NAS plus de 2,5 s : les vignettes retombent sur la carte
  return Promise.race([pending, new Promise(r => setTimeout(r, 2500))]);
}

export function forgetFicheImages() {
  pending = null;
  maps.clear();
}

export function ficheImagePath(kind, name) {
  const k = KINDS.find(x => x.id === kind);
  return k ? maps.get(k.folder)?.get(ficheSlug(name)) || null : null;
}

function emojiHtml(key, cls) {
  const type = String(key || '').match(/^energie:type:(.+)$/);
  if (type) return html`<span class="fiche-emoji ${cls}"><span class="fiche-dot" style="background:${TYPE_COLORS[type[1]] || '#999'}"></span></span>`;
  return html`<span class="fiche-emoji ${cls}">${kindOf(key)?.emoji || ''}</span>`;
}

// Vignette d'une fiche : son image sur le NAS, sinon l'illustration de sa carte la plus récente
export function ficheImg(f, small = false) {
  const kind = kindOf(f.key)?.id;
  const path = ficheImagePath(kind, f.name);
  const size = small ? 'ent-img-sm' : '';
  if (path) {
    const rest = [imageUrl(path, 'thumb'), f.image ? cardImage(f.image) : ''].filter(Boolean).join(' ');
    // portrait : on garde le visage ; objet, lieu, énergie : l'image entière
    const fit = kind === 'personnage' || kind === 'supporter' ? 'ent-img-photo' : 'ent-img-obj';
    return html`<span class="ent-img ${fit} ${size}"><img src="${rawUrl(path)}" alt="" loading="lazy" data-fallback="${rest}" data-hide-on-error></span>`;
  }
  if (f.image) return html`<span class="ent-img ent-img-card ${size}"><img src="${cardImage(f.image)}" alt="" loading="lazy" data-hide-on-error></span>`;
  return html`<span class="ent-img ${size}">${emojiHtml(f.key, '')}</span>`;
}

// À côté d'une carte vendue ou achetée : le sprite du Pokémon, sinon l'image de la fiche, sinon un emoji
export function lineSpriteHtml(t, cls = 'sprite-inline') {
  if (t.sprite || t.pokeapi_id) return spriteHtml(t, cls);
  if (!t.fiche_key) return '';
  const path = ficheImagePath(t.fiche_kind, t.fiche_name);
  if (path) return html`<img class="${cls} fiche-sprite" src="${rawUrl(path)}" alt="" loading="lazy" data-fallback="${imageUrl(path, 'thumb')}" data-hide-on-error>`;
  return emojiHtml(t.fiche_key, cls);
}
