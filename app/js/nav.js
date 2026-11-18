import { html, setHtml } from '/_shared/ui/dom.js';
import { icone } from './ui/icones.js';

export const SECTIONS = [
  { items: [{ id: 'accueil', label: 'Accueil', path: '' }] },
  { title: 'Catalogue', items: [
    { id: 'extensions', label: 'Extensions' },
    { id: 'cartes', label: 'Cartes' },
    { id: 'pokedex', label: 'Pokédex' },
    { id: 'encyclopedie', label: 'Encyclopédie' },
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
const PLUS = ['extensions', 'pokedex', 'encyclopedie', 'contacts', 'bilan', 'classeurs', 'produits', 'reglages', 'labels', 'plus'];

export function renderNav(active) {
  setHtml(document.getElementById('sidebar'), html`
    <a class="marque" href="#/"><span class="marque-logo">${icone('logo')}</span><span class="marque-nom"><strong>PTCG</strong></span></a>
    ${SECTIONS.map(s => html`
      <nav class="nav-section" aria-label="${s.title || 'Accueil'}">
        ${s.title ? html`<span class="nav-titre">${s.title}</span>` : ''}
        ${s.items.map(it => html`
          <a class="nav-lien" href="${href(it)}" ${it.id === active ? html`aria-current="page"` : ''}>
            ${icone(it.id)}<span>${it.label}</span>
          </a>`)}
      </nav>`)}
    <div class="sidebar-pied"><div class="statut-nas" id="statut-nas" role="status"></div></div>
  `);

  const tab = (id, label, path = id) => html`
    <a class="onglet" href="#/${path}" ${id === active || (id === 'plus' && PLUS.includes(active)) ? html`aria-current="page"` : ''}>${icone(id === 'plus' ? 'menu' : id, 22)}${label}</a>`;
  setHtml(document.getElementById('tabbar'), html`
    ${tab('accueil', 'Accueil', '')}
    ${tab('cartes', 'Cartes')}
    <a class="onglet-principal" href="#/ventes/nouvelle" aria-label="Nouvelle vente">${icone('plus', 24)}</a>
    ${tab('ventes', 'Ventes')}
    ${tab('plus', 'Plus')}
  `);
}
