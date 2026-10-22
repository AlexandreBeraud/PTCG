import { html } from '../ui/dom.js';
import { cardImage, spriteHtml, formBadge, variantLabel } from './sales.js';

export const FAMILLES = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'supporter', label: 'Supporter' },
  { id: 'objet', label: 'Objet' },
  { id: 'outil', label: 'Outil' },
  { id: 'stade', label: 'Stade' },
  { id: 'energie', label: 'Énergie' },
  { id: 'autre', label: 'Sans catégorie' },
];
export const familleLabel = id => FAMILLES.find(f => f.id === id)?.label || '';

export const CATEGORIES = [
  { id: 'pokemon', label: 'Pokémon' },
  { id: 'trainer', label: 'Dresseur' },
  { id: 'energy', label: 'Énergie' },
];

// « 013/094 » quand le numéro est un nombre et que l'extension a un total officiel
export function cardNumber(c) {
  if (!c.number) return '—';
  if (/^\d+$/.test(c.number) && c.set_count) return `${c.number}/${String(c.set_count).padStart(c.number.length, '0')}`;
  return c.number;
}

// Reflet au survol : arc-en-ciel si la carte n'existe qu'en reverse, blanc si elle a une version holo
export function cardFoil(c) {
  const v = c.variants || [];
  if (v.includes('holo')) return 'foil foil-holo';
  if (v.length && v.every(x => x === 'reverse')) return 'foil foil-reverse';
  return '';
}

export const variantsText = c => (c.variants?.length ? c.variants.map(variantLabel).join(', ') : 'inconnues');

// Vignette d'une carte du catalogue (pages Extension, Cartes, Pokédex)
export function cardTile(c, { showSet = false } = {}) {
  return html`
    <a class="card-tile" href="#/cartes/${encodeURIComponent(c.id)}">
      <span class="card-tile-img ${cardFoil(c)}">
        ${c.image ? html`<img src="${cardImage(c.image)}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="thumb-empty">${c.name}</span>`}
        ${Number(c.en_stock) ? html`<span class="card-stock">Stock ${c.en_stock}</span>` : ''}
        ${c.lang === 'en' ? html`<span class="card-lang">EN</span>` : ''}
        ${spriteHtml(c, 'sprite sprite-lg')}
      </span>
      <span class="card-tile-name">${c.name} ${formBadge(c)}</span>
      <span class="muted small">${showSet ? `${c.set_name} · ` : ''}${cardNumber(c)}${c.rarity ? ` · ${c.rarity}` : ''}</span>
    </a>`;
}

// Petite vignette de Pokémon (Pokédex, évolutions, autres formes)
export function pokemonTile(p, { compact = false } = {}) {
  return html`
    <a class="poke-tile ${compact ? 'poke-tile-sm' : ''} ${p.masque ? 'is-masked' : ''}" href="#/pokedex/${encodeURIComponent(p.key)}" ${p.masque ? html`title="Forme masquée"` : ''}>
      <span class="poke-sprite">${spriteHtml(p, 'poke-img')}</span>
      <span class="muted small">n°${String(p.dex).padStart(3, '0')}</span>
      <span class="poke-name">${p.name_fr} ${formBadge(p)}</span>
      ${p.cartes != null ? html`<span class="muted small">${p.cartes} carte${p.cartes > 1 ? 's' : ''}${Number(p.en_stock) ? html` · <span class="pos">${p.en_stock} en stock</span>` : ''}</span>` : ''}
    </a>`;
}
