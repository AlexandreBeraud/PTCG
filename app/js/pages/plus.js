import { html, setHtml } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { SECTIONS } from '../nav.js';

// Sur téléphone : toutes les pages, rangées comme dans le menu
export default {
  title: 'Plus',

  render(main) {
    setHtml(main, html`
      <header class="page-header"><div><h1>Plus</h1></div></header>
      ${SECTIONS.filter(s => s.title).map(s => html`
        <nav class="plus-section" aria-label="${s.title}">
          <h2 class="section-title">${s.title}</h2>
          ${s.items.map(it => html`<a class="plus-link" href="#/${it.path ?? it.id}">${icon(it.id, 22)}<span>${it.label}</span></a>`)}
        </nav>`)}
    `);
  },
};
