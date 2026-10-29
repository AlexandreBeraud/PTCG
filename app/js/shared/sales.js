import { config } from '../../config.js';
import { imageUrl, rawUrl } from '../nas.js';
import { html, esc } from '../ui/dom.js';

export const CONDITIONS = [
  { id: 'Mint', short: 'M', tone: 'info' },
  { id: 'Near Mint', short: 'NM', tone: 'ok' },
  { id: 'Excellent', short: 'EX', tone: 'ok' },
  { id: 'Good', short: 'GD', tone: 'warn' },
  { id: 'Light Played', short: 'LP', tone: 'warn' },
  { id: 'Played', short: 'PL', tone: 'danger' },
  { id: 'Poor', short: 'PO', tone: 'danger' },
];
export const ITEM_CONDITIONS = [{ id: 'Neuf', short: 'Neuf', tone: 'ok' }, { id: 'Occasion', short: 'Occasion', tone: 'warn' }];

export const VARIANTS = [
  { id: 'normale', label: 'Normale' },
  { id: 'reverse', label: 'Reverse' },
  { id: 'holo', label: 'Holo' },
  { id: '1ere_edition', label: '1ère édition' },
];

export const LANGS = [
  { id: 'FR', label: 'Français' }, { id: 'EN', label: 'Anglais' }, { id: 'JP', label: 'Japonais' },
  { id: 'DE', label: 'Allemand' }, { id: 'IT', label: 'Italien' }, { id: 'ES', label: 'Espagnol' },
  { id: 'PT', label: 'Portugais' }, { id: 'NL', label: 'Néerlandais' }, { id: 'KR', label: 'Coréen' },
  { id: 'CN', label: 'Chinois' },
];

export const VENTE_STATUS = [
  { id: 'a_mettre', label: 'À mettre en vente', tone: '' },
  { id: 'en_vente', label: 'En ligne', tone: 'info' },
  { id: 'vendue', label: 'Vendue', tone: 'ok' },
];

export const COMMANDE_STATUS = {
  vente: [
    { id: 'a_envoyer', label: 'À envoyer', tone: 'warn', next: 'Marquer comme envoyée' },
    { id: 'envoye', label: 'Envoyée', tone: 'info', next: 'Marquer comme reçue' },
    { id: 'arrive', label: 'Reçue', tone: 'ok' },
  ],
  achat: [
    { id: 'a_payer', label: 'À payer', tone: 'danger', next: 'Marquer comme payée' },
    { id: 'paye', label: 'Payée, en attente', tone: 'info', next: 'Marquer comme reçue' },
    { id: 'arrive', label: 'Reçue', tone: 'ok' },
  ],
};

export const KINDS = { carte: 'Carte', lot: 'Lot de cartes', accessoire: 'Accessoire', produit: 'Produit scellé' };

const byId = list => Object.fromEntries(list.map(x => [x.id, x]));
const COND = byId([...CONDITIONS, ...ITEM_CONDITIONS]);
const VAR = byId(VARIANTS);
const VST = byId(VENTE_STATUS);

export const variantLabel = id => VAR[id]?.label || '—';
export const langLabel = id => LANGS.find(l => l.id === id)?.label || id || '';
export const conditionShort = id => COND[id]?.short || id || '—';

export function conditionTag(id) {
  if (!id) return html`<span class="muted">—</span>`;
  return html`<span class="tag tag-${COND[id]?.tone || ''}" title="${id}">${COND[id]?.short || id}</span>`;
}

export function venteStatusTag(id) {
  const s = VST[id] || VENTE_STATUS[0];
  return html`<span class="tag tag-${s.tone}">${s.label}</span>`;
}

export function commandeStatus(direction, id) {
  return COMMANDE_STATUS[direction]?.find(s => s.id === id) || { id, label: id || '—', tone: '' };
}
export function commandeStatusTag(direction, id) {
  const s = commandeStatus(direction, id);
  return html`<span class="tag tag-${s.tone}">${s.label}</span>`;
}

// Prix affiché d'une ligne : rien tant qu'il n'est pas fixé
export const priceText = (t, fmt) => t.price == null ? '—' : fmt(t.total);

// Total d'une ligne : un lot a un prix global, le reste un prix unitaire
export const lineTotal = t => t.kind === 'lot' ? Number(t.price || 0) : Number(t.price || 0) * (t.qty || 1);

export const fmtDate = d => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('fr-FR') : '';
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Recherche côté base : même normalisation que v2.norm
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’‘ʼ´`]/g, "'").toLowerCase().trim();

// Image TCGdex en petite taille pour les listes
export function cardImage(url, size = 'low') {
  if (!url) return '';
  if (/assets\.tcgdex\.net/.test(url)) return url.replace(/\/(high|low)\.(png|webp|jpg)$/, `/${size}.webp`);
  // la vignette FileBrowser est un carré recadré : une carte du NAS garde toujours son format entier
  return imageUrl(url, 'big');
}

export function lineImage(t, lotImage) {
  if (t.kind === 'accessoire') return t.accessoire_image ? imageUrl(t.accessoire_image, 'thumb') : '';
  if (t.kind === 'lot') return lotImage ? imageUrl(lotImage, 'thumb') : '';
  return cardImage(t.card_image);
}

// Sprite Home du NAS, puis artwork officiel PokéAPI, sinon rien
export function spriteHtml(t, cls = 'sprite') {
  if (!t.sprite && !t.pokeapi_id) return '';
  const official = t.pokeapi_id
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${t.pokeapi_id}.png`
    : '';
  // sprite choisi à la main : une adresse, ou « /chemin » d'une photo envoyée sur le NAS
  if (/^https?:/.test(t.sprite || '')) return html`<img class="${cls}" src="${t.sprite}" alt="" loading="lazy" data-fallback="${official}" data-hide-on-error>`;
  // le fichier brut d'abord (adresse fixe, en cache), l'aperçu FileBrowser si le cookie ne passe pas
  const path = (t.sprite || '').startsWith('/') ? t.sprite.slice(1) : `${config.spritesRoot}/${t.sprite}`;
  const nas = t.sprite ? [rawUrl(path), imageUrl(path, 'big')] : [];
  const [src, ...rest] = [...nas, official].filter(Boolean);
  return html`<img class="${cls}" src="${src}" alt="" loading="lazy" data-fallback="${rest.join(' ')}" data-hide-on-error>`;
}

export const foilClass = variant => variant === 'reverse' ? 'foil foil-reverse' : variant === 'holo' ? 'foil foil-holo' : '';

// Vignette : image de la carte (ou de l'accessoire, du lot), reflet holo/reverse
export function thumbHtml(t, { lotImage, size = 'sm' } = {}) {
  const src = lineImage(t, lotImage);
  return html`
    <span class="thumb thumb-${size} ${foilClass(t.variant)}">
      ${src ? html`<img src="${src}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="thumb-empty">${t.kind === 'lot' ? 'Lot' : ''}</span>`}
    </span>`;
}

// Petite icône officielle de l'extension (TCGdex) ; son code si l'icône manque
export function setSymbolHtml(t) {
  const id = t.set_key || t.set_id;
  if (!id) return html`<span class="set-sym set-sym-none" aria-hidden="true"></span>`;
  return html`<span class="set-sym" title="${t.set_name || ''}">${t.set_symbol ? html`<img src="${imageUrl(t.set_symbol)}" alt="" loading="lazy" data-hide-on-error>` : ''}<span class="set-sym-code">${String(id).toUpperCase().slice(0, 5)}</span></span>`;
}

// Couleur de l'extension (ou de son bloc) pour le fond des lignes
export const setColorStyle = t => (t.set_color && /^#[0-9a-f]{3,8}$/i.test(t.set_color) ? `--set-color: ${t.set_color}` : '');

export function subtitle(t) {
  if (t.kind === 'lot') return [t.label, t.qty > 1 ? `${t.qty} cartes` : '', t.set_name].filter(Boolean).join(' · ');
  if (t.kind === 'accessoire' || t.kind === 'produit') return [t.kind === 'produit' ? t.label : '', t.set_name].filter(Boolean).join(' · ') || KINDS[t.kind];
  const num = t.number && t.set_count && /^\d+$/.test(t.number)
    ? `${t.number}/${String(t.set_count).padStart(t.number.length, '0')}`
    : t.number;
  return [t.set_name, num]
    .filter(Boolean).join(' · ');
}

export function formBadge(t) {
  if (!t.form_badge) return '';
  return html`<span class="form-badge" style="--badge: ${esc(t.form_color || '#F2C14E')}">${t.form_badge}</span>`;
}

// « CartesDuSud » → CS, « Holo_Lucas » → HL
export const initials = name => String(name || '?').replace(/[^\p{L}\p{N} _-]/gu, '')
  .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2').split(/[\s_-]+/).filter(Boolean)
  .slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// Pays proposés pour l'icône d'un contact (ceux de Cardmarket d'abord)
export const COUNTRIES = [
  ['fr', 'France'], ['be', 'Belgique'], ['ch', 'Suisse'], ['lu', 'Luxembourg'], ['de', 'Allemagne'],
  ['it', 'Italie'], ['es', 'Espagne'], ['pt', 'Portugal'], ['nl', 'Pays-Bas'], ['at', 'Autriche'],
  ['gb', 'Royaume-Uni'], ['ie', 'Irlande'], ['dk', 'Danemark'], ['se', 'Suède'], ['no', 'Norvège'],
  ['fi', 'Finlande'], ['is', 'Islande'], ['pl', 'Pologne'], ['cz', 'Tchéquie'], ['sk', 'Slovaquie'],
  ['hu', 'Hongrie'], ['si', 'Slovénie'], ['hr', 'Croatie'], ['ro', 'Roumanie'], ['bg', 'Bulgarie'],
  ['gr', 'Grèce'], ['cy', 'Chypre'], ['mt', 'Malte'], ['ee', 'Estonie'], ['lv', 'Lettonie'],
  ['lt', 'Lituanie'], ['li', 'Liechtenstein'], ['mc', 'Monaco'], ['ca', 'Canada'], ['us', 'États-Unis'],
  ['jp', 'Japon'],
];
// Windows n'affiche pas les drapeaux en emoji : une image (flagcdn), le code pays si elle ne charge pas
export const flag = code => (/^[a-z]{2}$/.test(code || '')
  ? html`<span class="flag"><img src="https://flagcdn.com/${code}.svg" alt="" loading="lazy" data-hide-on-error><span class="flag-code">${code.toUpperCase()}</span></span>`
  : '');

// Icône d'un contact : code pays (fr, be…) → drapeau, sinon initiales
export function contactAvatar(c, size = 40) {
  const code = String(c?.icon || c?.contact_icon || '').trim().toLowerCase();
  const drapeau = flag(code);
  const emoji = !drapeau && code && !/^https?:/.test(code) && [...code].length <= 2 ? code : '';
  return html`<span class="avatar" style="--size: ${size}px">${drapeau || emoji || initials(c?.pseudo || c?.contact)}</span>`;
}

// Filtre PostgREST « id dans la liste », valeurs entre guillemets
export const inList = ids => `in.(${ids.map(i => `"${String(i).replace(/["\\]/g, '\\$&')}"`).join(',')})`;
