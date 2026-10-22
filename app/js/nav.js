import { html, setHtml } from './ui/dom.js';
import { icon } from './ui/icons.js';

export const SECTIONS = [
  { items: [{ id: 'accueil', label: 'Accueil', path: '' }] },
  { title: 'Catalogue', items: [
    { id: 'extensions', label: 'Extensions' },
    { id: 'cartes', label: 'Cartes' },
    { id: 'pokedex', label: 'Pokédex' },
    { id: 'fiches', label: 'Personnages et objets' },
  ] },
  { title: 'Ventes et achats', items: [
    { id: 'ventes', label: 'Ventes et achats' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'bilan', label: 'Bilan' },
  ] },
  { title: 'Rangement', items: [
    { id: 'classeurs', label: 'Classeurs' },
    { id: 'produits', label: 'Produits' },
  ] },
  { title: 'Réglages', items: [
    { id: 'reglages', label: 'Réglages' },
    { id: 'labels', label: 'Labels de formes' },
  ] },
];

const href = item => '#/' + (item.path ?? item.id);
const PLUS = ['extensions', 'pokedex', 'fiches', 'contacts', 'bilan', 'classeurs', 'produits', 'reglages', 'labels', 'plus'];

export function renderNav(active) {
  setHtml(document.getElementById('sidebar'), html`
    <a class="brand" href="#/"><span class="brand-mark">${icon('logo')}</span>PTCG</a>
    ${SECTIONS.map(s => html`
      <nav class="nav-section" aria-label="${s.title || 'Accueil'}">
        ${s.title ? html`<span class="nav-title">${s.title}</span>` : ''}
        ${s.items.map(it => html`
          <a class="nav-link" href="${href(it)}" ${it.id === active ? html`aria-current="page"` : ''}>
            ${icon(it.id)}<span>${it.label}</span>
          </a>`)}
      </nav>`)}
    <div class="sidebar-status" id="sidebar-status"></div>
  `);

  const tab = (id, label, path = id) => html`
    <a class="tab" href="#/${path}" ${id === active || (id === 'plus' && PLUS.includes(active)) ? html`aria-current="page"` : ''}>${icon(id === 'plus' ? 'menu' : id, 22)}${label}</a>`;
  setHtml(document.getElementById('tabbar'), html`
    ${tab('accueil', 'Accueil', '')}
    ${tab('cartes', 'Cartes')}
    <a class="tab-main" href="#/ventes/nouvelle" aria-label="Nouvelle vente">${icon('plus', 24)}</a>
    ${tab('ventes', 'Ventes')}
    ${tab('plus', 'Plus')}
  `);
}
