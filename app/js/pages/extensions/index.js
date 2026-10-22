import { api } from '../../api.js';
import { html, setHtml, on, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { fmtDate, norm } from '../../shared/sales.js';

const state = { q: '', stockOnly: false, showHidden: false, sort: 'date_desc' };
const byDate = (a, b) => String(a.release_date || '9999').localeCompare(String(b.release_date || '9999'));
const SORTS = [
  { id: 'date_desc', label: 'Date de sortie, récentes d’abord', group: true },
  { id: 'date_asc', label: 'Date de sortie, anciennes d’abord', group: true },
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => a.name.localeCompare(b.name, 'fr') },
  { id: 'stock', label: 'En stock d’abord', cmp: (a, b) => (Number(b.en_stock) > 0) - (Number(a.en_stock) > 0) || byDate(b, a) },
  { id: 'vendues', label: 'Cartes vendues', cmp: (a, b) => Number(b.vendues) - Number(a.vendues) || byDate(b, a) },
];

const releaseText = d => {
  if (!d) return 'date inconnue';
  const date = new Date(d + 'T12:00:00');
  return date > new Date() ? `Sortie prévue le ${fmtDate(d)}` : `Sortie le ${fmtDate(d)}`;
};

export default {
  title: 'Extensions',

  async render(main, params) {
    if (params[0]) {
      const { renderSet } = await import('./set.js');
      return renderSet(main, params[0]);
    }

    setHtml(main, html`
      <header class="page-header">
        <div><h1>Extensions</h1><p>Créées et mises à jour automatiquement depuis TCGdex</p></div>
      </header>
      <div class="toolbar">
        <label class="search grow">${icon('search')}<input type="search" id="q" placeholder="Rechercher une extension" value="${state.q}" aria-label="Rechercher une extension"></label>
        <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === state.sort ? 'selected' : ''}>${o.label}</option>`)}</select>
        <label class="check-inline"><input type="checkbox" id="stock" ${state.stockOnly ? 'checked' : ''}> Seulement celles où j’ai du stock</label>
        <label class="check-inline"><input type="checkbox" id="hidden" ${state.showHidden ? 'checked' : ''}> Afficher les masquées</label>
      </div>
      <div id="list" aria-live="polite"><p class="muted">Chargement…</p></div>
    `);
    const $ = s => main.querySelector(s);

    let sets = [];
    try {
      sets = await api.list('set_list', {
        select: 'id,name,name_en,serie_id,serie_name,symbol,logo,release_date,card_count,card_count_total,cartes,en_stock,vendues,lang,source,color,serie_color,hidden,serie_hidden,sort_order,serie_sort,serie_release',
        order: 'serie_sort.asc.nullslast,serie_release.desc.nullslast,sort_order.asc.nullslast,release_date.desc.nullslast,id',
      });
    } catch (err) {
      return setHtml($('#list'), errorHtml('Impossible de charger les extensions', err));
    }

    function render() {
      const q = norm(state.q);
      const shown = sets.filter(s =>
        (state.showHidden || (!s.hidden && !s.serie_hidden))
        && (!state.stockOnly || Number(s.en_stock) > 0)
        && (!q || norm(`${s.name} ${s.name_en || ''} ${s.id} ${s.serie_name || ''}`).includes(q)));

      const sort = SORTS.find(o => o.id === state.sort);
      if (!sort.group) {
        return setHtml($('#list'), shown.length
          ? html`<div class="set-grid">${[...shown].sort(sort.cmp).map(s => setCard(s, true))}</div>`
          : html`<div class="empty"><h2>Aucune extension ne correspond</h2></div>`);
      }
      // rangées par bloc, extensions strictement par date de sortie (sans date : à la fin)
      const asc = state.sort === 'date_asc';
      const byRelease = (a, b) => {
        if (!a.release_date !== !b.release_date) return a.release_date ? -1 : 1;
        return (asc ? 1 : -1) * String(a.release_date).localeCompare(String(b.release_date)) || a.id.localeCompare(b.id);
      };
      const series = [];
      for (const s of shown) {
        let g = series.find(x => x.id === (s.serie_id || ''));
        if (!g) series.push(g = { id: s.serie_id || '', name: s.serie_name || 'Hors bloc', sort: s.serie_sort, sets: [] });
        g.sets.push(s);
      }
      for (const g of series) {
        g.sets.sort(byRelease);
        g.date = g.sets.find(s => s.release_date)?.release_date || '';
      }
      // l'ordre des blocs choisi dans Réglages, sinon par date ; les extensions sans bloc à la fin
      series.sort((a, b) => (a.id === '') - (b.id === '') || (a.sort ?? 1e6) - (b.sort ?? 1e6)
        || (!a.date - !b.date) || (asc ? 1 : -1) * a.date.localeCompare(b.date));

      setHtml($('#list'), series.length ? html`${series.map(g => {
        const stock = g.sets.reduce((n, s) => n + Number(s.en_stock), 0);
        return html`
          <section class="serie">
            <div class="serie-head">
              <h2>${g.name}</h2>
              <span class="muted small">${g.sets.length} extension${g.sets.length > 1 ? 's' : ''}${stock ? ` · ${stock} carte${stock > 1 ? 's' : ''} en stock` : ''}</span>
            </div>
            <div class="set-grid">${g.sets.map(s => setCard(s))}</div>
          </section>`;
      })}` : html`<div class="empty"><h2>Aucune extension ne correspond</h2></div>`);
    }

    function setCard(s, withBloc = false) {
      const color = s.color || s.serie_color;
      return html`
        <a class="set-card ${s.hidden || s.serie_hidden ? 'is-hidden' : ''}" href="#/extensions/${encodeURIComponent(s.id)}" style="${color ? `--set-color: ${color}` : ''}">
          <span class="set-logo">${s.logo ? html`<img src="${s.logo}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="set-code">${s.id.toUpperCase()}</span>`}</span>
          <span class="set-info">
            <strong>${s.name}</strong>
            <span class="muted small">${withBloc && s.serie_name ? `${s.serie_name} · ` : ''}${s.id.toUpperCase()} · ${releaseText(s.release_date)}</span>
            <span class="small">
              ${s.card_count_total || s.cartes} cartes
              ${s.lang === 'en' ? html` <span class="tag tag-warn">EN</span>` : ''}
              ${s.source === 'manual' ? html` <span class="tag">À la main</span>` : ''}
              ${Number(s.en_stock) ? html` · <span class="pos">${s.en_stock} en stock</span>` : ''}
              ${state.sort === 'vendues' && Number(s.vendues) ? html` · ${s.vendues} vendues` : ''}
            </span>
          </span>
        </a>`;
    }

    $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
    $('#sort').addEventListener('change', e => { state.sort = e.target.value; render(); });
    on(main, 'change', '#stock', (_, c) => { state.stockOnly = c.checked; render(); });
    on(main, 'change', '#hidden', (_, c) => { state.showHidden = c.checked; render(); });
    render();
  },
};
