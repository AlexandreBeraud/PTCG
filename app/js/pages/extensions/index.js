import { api } from '../../api.js';
import { html, setHtml, on, errorHtml } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { fmtDate, norm } from '../../shared/sales.js';

const state = { q: '', stockOnly: false, showHidden: false };

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
        <label class="check-inline"><input type="checkbox" id="stock" ${state.stockOnly ? 'checked' : ''}> Seulement celles où j’ai du stock</label>
        <label class="check-inline"><input type="checkbox" id="hidden" ${state.showHidden ? 'checked' : ''}> Afficher les masquées</label>
      </div>
      <div id="list" aria-live="polite"><p class="muted">Chargement…</p></div>
    `);
    const $ = s => main.querySelector(s);

    let sets = [];
    try {
      sets = await api.list('set_list', {
        select: 'id,name,name_en,serie_id,serie_name,symbol,logo,release_date,card_count,card_count_total,cartes,en_stock,vendues,lang,source,color,hidden,serie_hidden,sort_order,serie_sort,serie_release',
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

      const series = [];
      for (const s of shown) {
        let g = series.find(x => x.id === (s.serie_id || ''));
        if (!g) series.push(g = { id: s.serie_id || '', name: s.serie_name || 'Hors série', sets: [] });
        g.sets.push(s);
      }

      setHtml($('#list'), series.length ? html`${series.map(g => {
        const stock = g.sets.reduce((n, s) => n + Number(s.en_stock), 0);
        return html`
          <section class="serie">
            <div class="serie-head">
              <h2>${g.name}</h2>
              <span class="muted small">${g.sets.length} extension${g.sets.length > 1 ? 's' : ''}${stock ? ` · ${stock} carte${stock > 1 ? 's' : ''} en stock` : ''}</span>
            </div>
            <div class="set-grid">
              ${g.sets.map(s => html`
                <a class="set-card ${s.hidden || s.serie_hidden ? 'is-hidden' : ''}" href="#/extensions/${encodeURIComponent(s.id)}" style="${s.color ? `--set-color: ${s.color}` : ''}">
                  <span class="set-logo">${s.logo ? html`<img src="${s.logo}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="set-code">${s.id.toUpperCase()}</span>`}</span>
                  <span class="set-info">
                    <strong>${s.name}</strong>
                    <span class="muted small">${s.id.toUpperCase()} · ${releaseText(s.release_date)}</span>
                    <span class="small">
                      ${s.card_count_total || s.cartes} cartes
                      ${s.lang === 'en' ? html` <span class="tag tag-warn">EN</span>` : ''}
                      ${s.source === 'manual' ? html` <span class="tag">À la main</span>` : ''}
                      ${Number(s.en_stock) ? html` · <span class="pos">${s.en_stock} en stock</span>` : ''}
                    </span>
                  </span>
                </a>`)}
            </div>
          </section>`;
      })}` : html`<div class="empty"><h2>Aucune extension ne correspond</h2></div>`);
    }

    $('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
    on(main, 'change', '#stock', (_, c) => { state.stockOnly = c.checked; render(); });
    on(main, 'change', '#hidden', (_, c) => { state.showHidden = c.checked; render(); });
    render();
  },
};
