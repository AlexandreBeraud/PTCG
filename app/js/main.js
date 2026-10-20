import { api } from './api.js';
import { ensureLogin } from './nas.js';
import { renderNav } from './nav.js';
import { html, setHtml, errorHtml, reloadPage } from './ui/dom.js';
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
  extensions: () => import('./pages/extensions/index.js'),
  cartes: () => import('./pages/cartes/index.js'),
  pokedex: () => import('./pages/pokedex/index.js'),
  labels: () => import('./pages/labels/index.js'),
  contacts: () => import('./pages/contacts/index.js'),
  bilan: () => import('./pages/bilan/index.js'),
  classeurs: () => import('./pages/classeurs/index.js'),
  produits: () => import('./pages/produits/index.js'),
  reglages: () => import('./pages/reglages/index.js'),
  plus: () => import('./pages/plus.js'),
};
const LOTS = {};

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
    setHtml(main, errorHtml('Cette page n’a pas pu s’afficher', err));
  }
}

// Image cassée : une image du NAS est retentée une fois (le Pi traîne quand
// beaucoup d'images arrivent d'un coup), puis l'adresse de repli (data-fallback),
// sinon on la masque
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.src.includes('/nas/api/') && !img.dataset.retried) {
    img.dataset.retried = '1';
    const src = img.src;
    setTimeout(() => { img.src = src + (src.includes('?') ? '&' : '?') + 'r=' + Date.now(); }, 800 + Math.random() * 600);
  } else if (img.dataset.fallback) {
    // plusieurs adresses de repli possibles, séparées par une espace
    const [next, ...rest] = img.dataset.fallback.split(' ');
    if (rest.length) img.dataset.fallback = rest.join(' ');
    else img.removeAttribute('data-fallback');
    img.src = next;
  } else if (img.hasAttribute('data-hide-on-error') || img.classList.contains('sprite')) {
    img.hidden = true;
  }
}, true);

// « Réessayer » sur un écran d'erreur : on réaffiche la page
document.addEventListener('click', e => {
  if (e.target.closest('[data-retry-page]')) reloadPage();
});

// Pi injoignable : un rappel discret dans le menu tant que ça dure
window.addEventListener('pi-status', e => {
  const box = document.getElementById('sidebar-status');
  if (box) setHtml(box, e.detail.ok ? '' : html`<strong>Le Pi ne répond pas</strong><span class="muted">Vérifie Tailscale et que le Pi est allumé. Rien de ce que tu as saisi n’est perdu.</span>`);
});

async function loadAppearance() {
  try {
    const settings = await api.one('settings', { id: 'eq.1' });
    if (settings) applyAppearance(settings);
  } catch (err) {
    toastError(err, { label: 'Réessayer', run: loadAppearance });
  }
}

async function boot() {
  window.addEventListener('hashchange', route);
  // les images du NAS ont besoin du jeton FileBrowser : on l'attend un peu avant le premier affichage
  await Promise.race([ensureLogin(), new Promise(r => setTimeout(r, 2500))]);
  route();
  loadAppearance();
}

boot();
