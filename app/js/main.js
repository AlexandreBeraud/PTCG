import { api } from './api.js';
import { ensureLogin } from './nas.js';
import { renderNav } from './nav.js';
import { html, setHtml } from './ui/dom.js';
import { toastError } from './ui/toast.js';
import { applyAppearance } from './appearance.js';

// Chaque page est un module chargé seulement quand on l'ouvre.
const ventes = tab => () => import('./pages/ventes/index.js').then(m => ({
  default: { ...m.default, render: (el, params) => m.default.render(el, params, { tab }) },
}));
const PAGES = {
  accueil: () => import('./pages/accueil.js'),
  ventes: ventes('vente'),
  achats: ventes('achat'),
  contacts: () => import('./pages/contacts/index.js'),
  bilan: () => import('./pages/bilan/index.js'),
  reglages: () => import('./pages/reglages.js'),
};
const LOTS = {
  extensions: 3, cartes: 3, pokedex: 3, labels: 3,
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
    // un conteneur neuf par affichage : les écouteurs d'une page ne survivent pas à la suivante
    const view = document.createElement('div');
    view.className = 'page';
    main.replaceChildren(view);
    await current.render(view, params);
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (err) {
    console.error(err);
    setHtml(main, html`<div class="empty"><h2>Cette page n’a pas pu s’afficher</h2><p>${err.message}</p></div>`);
  }
}

// Image cassée : on tente l'adresse de repli (data-fallback), sinon on la masque
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.fallback) {
    img.src = img.dataset.fallback;
    img.removeAttribute('data-fallback');
  } else if (img.hasAttribute('data-hide-on-error') || img.classList.contains('sprite')) {
    img.hidden = true;
  }
}, true);

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
