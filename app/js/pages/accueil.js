import { api } from '../api.js';
import { html, setHtml, on, eur } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toastError } from '../ui/toast.js';
import { store } from '../shared/store.js';
import { thumbHtml, spriteHtml, subtitle, fmtDate } from '../shared/sales.js';

const JOBS = { catalogue: 'Catalogue TCGdex', pokemon: 'Référentiel Pokémon', sauvegarde: 'Sauvegarde de la base' };
const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const signed = n => (n > 0 ? '+' : '') + eur(n);

function jobMeta(run) {
  const s = run.summary || {};
  if (!run.finished_at) return 'en cours…';
  if (!run.ok) return run.error || 'en erreur';
  if (run.job === 'catalogue') {
    const added = (s.cartes_fr || 0) + (s.cartes_en || 0);
    return [added ? `${added} carte(s) ajoutée(s)` : 'rien de nouveau', s.passees_fr ? `${s.passees_fr} passée(s) en FR` : ''].filter(Boolean).join(', ');
  }
  if (run.job === 'pokemon') return `${s.pokemon} Pokémon dont ${s.formes} formes`;
  if (run.job === 'sauvegarde') return `${s.fichier || 'OK'}`;
  return 'OK';
}

export default {
  title: 'Accueil',

  async render(main) {
    const now = new Date();
    const day = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const monthName = now.toLocaleDateString('fr-FR', { month: 'long' });
    setHtml(main, html`
      <header class="page-header">
        <div><p class="muted" style="margin: 0 0 6px">${day[0].toUpperCase() + day.slice(1)}</p><h1>Accueil</h1></div>
        <div class="page-actions">
          <a class="btn" href="#/achats">Ventes et achats</a>
          <button type="button" class="btn btn-primary" data-new-sale>${icon('plus')}Nouvelle vente</button>
        </div>
      </header>
      <div class="kpis" id="kpis"><div class="kpi"><span class="muted small">Chargement…</span></div></div>
      <div class="home-grid">
        <section class="panel" id="todo"><h2>À faire</h2></section>
        <section class="panel" id="sales"><h2>Dernières ventes</h2></section>
        <section class="panel" id="news"><h2>Nouveautés du catalogue</h2></section>
        <section class="panel" id="jobs"><h2>Automatisations</h2></section>
      </div>
    `);
    const $ = s => main.querySelector(s);
    const fail = (box, title, err) => setHtml(box, html`<h2>${title}</h2><p class="muted small">${err.message}</p>`);

    // chiffres du mois, bénéfice de l'année, stock
    (async () => {
      try {
        const [months, stock] = await Promise.all([
          api.rpc('bilan_mensuel', { scope: null }),
          api.rpc('transaction_counts', { dir: 'vente' }),
        ]);
        const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const m = months.find(x => x.mois.startsWith(key)) || { ventes: 0, achats: 0, cartes_vendues: 0, cartes_achetees: 0 };
        const year = months.filter(x => x.mois.startsWith(String(now.getFullYear())));
        const yearSolde = year.reduce((n, x) => n + Number(x.ventes) - Number(x.achats), 0);
        const solde = Number(m.ventes) - Number(m.achats);
        const enLigne = Number(stock.en_vente?.cartes || 0);
        const aMettre = Number(stock.a_mettre?.cartes || 0);
        setHtml($('#kpis'), html`
          <a class="kpi" href="#/bilan"><span class="muted small">Ventes · ${monthName}</span><strong>${eur(m.ventes)}</strong><span class="muted small">${m.cartes_vendues} carte(s) vendue(s)</span></a>
          <a class="kpi" href="#/bilan"><span class="muted small">Achats · ${monthName}</span><strong>${eur(m.achats)}</strong><span class="muted small">${m.cartes_achetees} carte(s) reçue(s)</span></a>
          <a class="kpi" href="#/bilan"><span class="muted small">Bénéfice · ${monthName}</span><strong class="${solde >= 0 ? 'pos' : 'neg'}">${signed(solde)}</strong><span class="muted small">Depuis janvier : ${signed(yearSolde)}</span></a>
          <a class="kpi" href="#/ventes/en_vente"><span class="muted small">Stock</span><strong>${enLigne + aMettre}</strong><span class="muted small">carte(s), dont ${enLigne} en ligne</span></a>
        `);
      } catch (err) {
        setHtml($('#kpis'), html`<div class="kpi"><span class="muted small">Le Pi ne répond pas</span><strong>—</strong><span class="muted small">${err.message}</span></div>`);
      }
    })();

    // commandes à envoyer, achats à payer ou à recevoir, cartes à mettre en vente
    (async () => {
      try {
        const [orders, stock] = await Promise.all([
          api.list('commande_list', { status: 'in.(a_envoyer,a_payer,paye)', order: 'ordered_on.asc.nullsfirst' }),
          api.rpc('transaction_counts', { dir: 'vente' }),
        ]);
        const items = orders.map(o => ({
          id: o.id,
          tone: o.status === 'a_payer' ? 'danger' : 'warn',
          title: o.direction === 'vente' ? `Commande de ${o.contact || '?'} à envoyer`
            : o.status === 'a_payer' ? `Achat chez ${o.contact || '?'} à payer` : `Achat chez ${o.contact || '?'} à recevoir`,
          meta: `${o.cartes} carte(s) · ${eur(o.total)} · depuis le ${fmtDate(o.ordered_on || o.created_at)}`,
        }));
        const toList = Number(stock.a_mettre?.cartes || 0);
        setHtml($('#todo'), html`
          <div class="panel-head"><h2>À faire</h2><span class="muted small">${items.length + (toList ? 1 : 0)} action(s)</span></div>
          ${items.length || toList ? html`<div class="todo">
            ${items.map(t => html`
              <button type="button" class="todo-item" data-commande="${t.id}">
                <span class="dot dot-${t.tone}"></span>
                <span class="grow"><strong>${t.title}</strong><span class="muted small">${t.meta}</span></span>
                <span class="muted small">Ouvrir</span>
              </button>`)}
            ${toList ? html`
              <a class="todo-item" href="#/ventes/a_mettre">
                <span class="dot dot-info"></span>
                <span class="grow"><strong>${toList} carte(s) à mettre en vente</strong><span class="muted small">${Number(stock.a_mettre.total) ? `${eur(stock.a_mettre.total)} au prix saisi` : 'prix à fixer'}</span></span>
                <span class="muted small">Ouvrir</span>
              </a>` : ''}
          </div>` : html`<p class="muted small">Rien en attente.</p>`}
        `);
      } catch (err) { fail($('#todo'), 'À faire', err); }
    })();

    (async () => {
      try {
        const [rows, settings] = await Promise.all([
          api.list('transaction_list', { direction: 'eq.vente', status: 'eq.vendue', order: 'day.desc,created_at.desc', limit: 6 }),
          store.settings().catch(() => null),
        ]);
        setHtml($('#sales'), html`
          <div class="panel-head"><h2>Dernières ventes</h2><a class="small" href="#/ventes/vendue">Toutes les ventes</a></div>
          ${rows.length ? html`<div class="mini-list">${rows.map(t => html`
            <div class="mini-row">
              <span class="tx-media">${thumbHtml(t, { lotImage: settings?.lot_image, size: 'xs' })}${spriteHtml(t)}</span>
              <span class="grow"><strong>${t.title}</strong><span class="muted small">${[t.contact, fmtDate(t.day), subtitle(t)].filter(Boolean).join(' · ')}</span></span>
              <span class="price">${eur(t.total)}</span>
            </div>`)}</div>` : html`<p class="muted small">Aucune vente pour l’instant.</p>`}
        `);
      } catch (err) { fail($('#sales'), 'Dernières ventes', err); }
    })();

    (async () => {
      try {
        // sorties des deux derniers mois, et extensions récentes encore en anglais
        const day = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
        const sets = await api.list('sets', {
          select: 'id,name,lang,card_count_total,release_date,symbol',
          or: `(release_date.gte.${day(60)},and(lang.eq.en,release_date.gte.${day(365)}))`,
          order: 'release_date.desc.nullslast', limit: 6,
        });
        setHtml($('#news'), html`
          <div class="panel-head"><h2>Nouveautés du catalogue</h2><span class="muted small">ajoutées automatiquement</span></div>
          ${sets.length ? html`<div class="mini-list">${sets.map(s => html`
            <div class="mini-row">
              <span class="set-code">${s.symbol ? html`<img src="${s.symbol}" alt="" data-hide-on-error>` : s.id.toUpperCase().slice(0, 4)}</span>
              <span class="grow"><strong>${s.name}</strong><span class="muted small">${s.card_count_total || '?'} cartes${s.release_date ? ` · sortie le ${fmtDate(s.release_date)}` : ''}</span></span>
              <span class="tag ${s.lang === 'en' ? 'tag-warn' : 'tag-ok'}">${s.lang === 'en' ? 'EN en attendant la VF' : 'VF'}</span>
            </div>`)}</div>` : html`<p class="muted small">Rien de neuf ces deux derniers mois.</p>`}
        `);
      } catch (err) { fail($('#news'), 'Nouveautés du catalogue', err); }
    })();

    (async () => {
      try {
        const runs = await api.list('job_runs', { order: 'started_at.desc', limit: 50 });
        setHtml($('#jobs'), html`
          <div class="panel-head"><h2>Automatisations</h2><a class="small" href="#/reglages">Historique</a></div>
          <div class="mini-list">${Object.entries(JOBS).map(([job, label]) => {
            const r = runs.find(x => x.job === job);
            return html`
              <div class="mini-row">
                <span class="dot ${!r ? '' : !r.finished_at ? 'dot-warn' : r.ok ? 'dot-ok' : 'dot-danger'}"></span>
                <span class="grow"><strong>${label}</strong><span class="muted small">${r ? jobMeta(r) : 'jamais lancé'}</span></span>
                <span class="muted small">${r ? new Date(r.started_at).toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>`;
          })}</div>
        `);
      } catch (err) { fail($('#jobs'), 'Automatisations', err); }
    })();

    on(main, 'click', '[data-commande]', async (_, b) => {
      const { openCommande } = await import('../shared/commande.js');
      openCommande(b.dataset.commande, { onChanged: reload }).catch(toastError);
    });
    on(main, 'click', '[data-new-sale]', async () => {
      const { openLineForm } = await import('./ventes/line-form.js');
      openLineForm({ direction: 'vente', onSaved: reload }).catch(toastError);
    });
  },
};
