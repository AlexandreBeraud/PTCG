import { html, setHtml } from '../ui/dom.js';
import { SECTIONS } from '../nav.js';

const TITLES = Object.fromEntries(SECTIONS.flatMap(s => s.items.map(it => [it.id, it.label])));

// Page pas encore construite : elle dit dans quel lot elle arrive
export function placeholder(id, lot) {
  const title = TITLES[id] || 'Page introuvable';
  return {
    title,
    render(main) {
      setHtml(main, html`
        <header class="page-header"><div><h1>${title}</h1></div></header>
        <div class="empty">
          <h2>${lot ? `Arrive avec le lot ${lot}` : 'Cette page n’existe pas'}</h2>
          <p>${lot ? 'La structure est en place, le contenu viendra ensuite.' : html`<a href="#/">Retour à l’accueil</a>`}</p>
        </div>
      `);
    },
  };
}
