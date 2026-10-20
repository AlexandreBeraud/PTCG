import { api } from '../api.js';
import { html, setHtml } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

export default {
  title: 'Accueil',

  async render(main) {
    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    setHtml(main, html`
      <header class="page-header">
        <div>
          <p class="muted" style="margin: 0 0 6px">${today}</p>
          <h1>Accueil</h1>
        </div>
      </header>
      <section class="panel" id="home-status"><p class="muted">Connexion au Pi…</p></section>
      <div class="empty">
        <h2>Le tableau de bord arrive avec le lot 2</h2>
        <p>Chiffres du mois, commandes à envoyer, dernières ventes et nouveautés du catalogue.</p>
      </div>
    `);

    const box = main.querySelector('#home-status');
    try {
      const [sets, cards, transactions] = await Promise.all([
        api.count('sets'), api.count('cards'), api.count('transactions'),
      ]);
      setHtml(box, html`
        <div class="panel-head">
          <h2>Base v2</h2>
          <span class="tag tag-ok">${icon('check', 14)}&nbsp;Connectée</span>
        </div>
        <p class="muted small" style="margin: 0">${sets} extensions · ${cards} cartes · ${transactions} ventes et achats</p>
      `);
    } catch (err) {
      setHtml(box, html`
        <div class="panel-head">
          <h2>Base v2</h2>
          <span class="tag tag-danger">Injoignable</span>
        </div>
        <p class="muted small" style="margin: 0">${err.message}. Vérifie que Tailscale est connecté et que le Pi est allumé.</p>
      `);
    }
  },
};
