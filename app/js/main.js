import { api } from './api.js';
import { ensureLogin } from './nas.js';
import { renderNav } from './nav.js';
import { html, setHtml } from './ui/dom.js';
import { toastError } from './ui/toast.js';
import { applyAppearance } from './appearance.js';

// Chaque page est un module chargé seulement quand on l'ouvre.
const PAGES = {
  accueil: () => import('./pages/accueil.js'),
  reglages: () => import('./pages/reglages.js'),
};
const LOTS = {
  extensions: 3, cartes: 3, pokedex: 3, labels: 3,
  ventes: 2, achats: 2, contacts: 2, bilan: 2,
  classeurs: 4, produits: 4,
};

const main = document.getElementById('main');
let current = null;

function parseHash() {
  const [id = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { id: id || 'accueil', params: rest.map(decodeURIComponent) };
}

async function route() {
  const { id, params } = parseHash();
  renderNav(id === 'achats' ? 'ventes' : id);
  current?.destroy?.();
  current = null;

  try {
    if (PAGES[id]) {
      const mod = await PAGES[id]();
      current = mod.default;
    } else {
      const { placeholder } = await import('./pages/placeholder.js');
      current = placeholder(id, LOTS[id]);
    }
    document.title = `${current.title} · PTCG`;
    await current.render(main, params);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    setHtml(main, html`<div class="empty"><h2>Cette page n’a pas pu s’afficher</h2><p>${err.message}</p></div>`);
  }
}

async function boot() {
  window.addEventListener('hashchange', route);
  route();

  try {
    const settings = await api.one('settings', { id: 'eq.1' });
    if (settings) applyAppearance(settings);
  } catch (err) {
    toastError(err, { label: 'Réessayer', run: boot });
  }
  ensureLogin();
}

boot();
