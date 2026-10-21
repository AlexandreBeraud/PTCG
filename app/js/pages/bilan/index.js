import { api } from '../../api.js';
import { html, setHtml, eur } from '../../ui/dom.js';
import { store } from '../../shared/store.js';
import { loadChart } from '../../shared/chart.js';

const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const state = { scope: '', year: String(new Date().getFullYear()) };
let chart = null;

const signed = n => (n > 0 ? '+' : '') + eur(n);

export default {
  title: 'Bilan',

  destroy() {
    chart?.destroy();
    chart = null;
  },

  async render(main) {
    setHtml(main, html`
      <header class="page-header">
        <div>
          <h1>Bilan</h1>
          <p>Ventes vendues dont la commande est reçue, au mois de réception · achats reçus · les ventes pour le compte d’autres sont à part</p>
        </div>
        <div class="page-actions">
          <select class="select select-auto" id="scope" aria-label="Périmètre"><option value="">Mon bilan</option></select>
          <select class="select select-auto" id="year" aria-label="Année"></select>
        </div>
      </header>
      <div class="kpis" id="kpis"></div>
      <section class="panel">
        <div class="panel-head"><h2>Ventes et achats par mois</h2></div>
        <div class="chart-box"><canvas id="chart" aria-label="Ventes et achats par mois" role="img"></canvas></div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Mois par mois</h2></div>
        <div id="table"></div>
      </section>
      <div class="grid-auto" style="--min: 320px" id="split"></div>
    `);
    const $ = s => main.querySelector(s);

    const accounts = await store.forAccounts().catch(() => []);
    if (state.scope && !accounts.some(a => a.name === state.scope)) state.scope = '';
    setHtml($('#scope'), html`<option value="">Mon bilan</option>${accounts.map(a => html`<option value="${a.name}" ${a.name === state.scope ? 'selected' : ''}>Pour ${a.name}</option>`)}`);

    async function draw() {
      const self = !state.scope;
      let months, waiting;
      try {
        [months, waiting] = await Promise.all([
          api.rpc('bilan_mensuel', { scope: state.scope || null }),
          api.rpc('bilan_en_attente', { scope: state.scope || null }).catch(() => []),
        ]);
      } catch (err) {
        return setHtml($('#table'), html`<p class="muted">${err.message}</p>`);
      }
      // ventes vendues pas encore comptées : leur commande n'est pas encore reçue
      const pending = new Map(waiting.map(w => [w.mois, w]));
      for (const w of waiting) {
        if (!months.some(m => m.mois === w.mois)) months.push({ mois: w.mois, ventes: 0, achats: 0, cartes_vendues: 0, cartes_achetees: 0 });
      }
      months.sort((a, b) => a.mois.localeCompare(b.mois));

      const years = [...new Set(months.map(m => m.mois.slice(0, 4)))].sort().reverse();
      if (!years.includes(state.year) && state.year !== 'all') state.year = years[0] || String(new Date().getFullYear());
      setHtml($('#year'), html`${years.map(y => html`<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}</option>`)}<option value="all" ${state.year === 'all' ? 'selected' : ''}>Depuis le début</option>`);

      const rows = (state.year === 'all' ? months : months.filter(m => m.mois.startsWith(state.year)))
        .map(m => ({ ...m, ventes: Number(m.ventes), achats: Number(m.achats), solde: Number(m.ventes) - Number(m.achats),
          attente: Number(pending.get(m.mois)?.montant || 0), attente_n: Number(pending.get(m.mois)?.lignes || 0) }));
      const sum = k => rows.reduce((n, r) => n + Number(r[k]), 0);
      const label = state.year === 'all' ? 'depuis le début' : state.year;
      const solde = sum('ventes') - sum('achats');
      const attente = sum('attente');
      const attenteKpi = attente ? html`
        <div class="kpi" title="Ventes « Vendue » dont la commande n’est pas encore reçue : elles comptent au mois de réception">
          <span class="muted small">En attente de réception</span><strong>${eur(attente)}</strong>
          <span class="muted small">${sum('attente_n')} vente${sum('attente_n') > 1 ? 's' : ''}, comptée${sum('attente_n') > 1 ? 's' : ''} à la réception</span>
        </div>` : '';

      setHtml($('#kpis'), self ? html`
        <div class="kpi"><span class="muted small">Ventes ${label}</span><strong>${eur(sum('ventes'))}</strong></div>
        <div class="kpi"><span class="muted small">Achats ${label}</span><strong>${eur(sum('achats'))}</strong></div>
        <div class="kpi"><span class="muted small">Bénéfice ${label}</span><strong class="${solde >= 0 ? 'pos' : 'neg'}">${signed(solde)}</strong></div>
        <div class="kpi"><span class="muted small">Cartes vendues</span><strong>${sum('cartes_vendues')}</strong></div>${attenteKpi}` : html`
        <div class="kpi"><span class="muted small">Ventes pour ${state.scope} · ${label}</span><strong>${eur(sum('ventes'))}</strong></div>
        <div class="kpi"><span class="muted small">Cartes vendues</span><strong>${sum('cartes_vendues')}</strong></div>${attenteKpi}`);

      const name = m => {
        const [y, mo] = m.mois.split('-').map(Number);
        return `${MONTHS[mo - 1]}${state.year === 'all' ? ` ${y}` : ''}`;
      };
      setHtml($('#table'), rows.length ? html`
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Mois</th><th class="num">Ventes</th>${self ? html`<th class="num">Achats</th><th class="num">Bénéfice</th>` : ''}<th class="num">Cartes vendues</th>${attente ? html`<th class="num">En attente</th>` : ''}</tr></thead>
            <tbody>
              ${[...rows].reverse().map(r => html`<tr>
                <td>${name(r)}</td>
                <td class="num">${eur(r.ventes)}</td>
                ${self ? html`<td class="num">${eur(r.achats)}</td><td class="num ${r.solde >= 0 ? 'pos' : 'neg'}">${signed(r.solde)}</td>` : ''}
                <td class="num">${r.cartes_vendues}</td>
                ${attente ? html`<td class="num muted">${r.attente ? eur(r.attente) : '—'}</td>` : ''}
              </tr>`)}
            </tbody>
            <tfoot><tr><th>Total</th><th class="num">${eur(sum('ventes'))}</th>${self ? html`<th class="num">${eur(sum('achats'))}</th><th class="num ${solde >= 0 ? 'pos' : 'neg'}">${signed(solde)}</th>` : ''}<th class="num">${sum('cartes_vendues')}</th>${attente ? html`<th class="num">${eur(attente)}</th>` : ''}</tr></tfoot>
          </table>
        </div>` : html`<p class="muted">Rien sur cette période.</p>`);

      drawChart(rows, self);
      drawSplit(self);
    }

    async function drawChart(rows, self) {
      const box = $('.chart-box');
      try {
        const Chart = await loadChart();
        if (!main.isConnected) return;
        const css = getComputedStyle(document.documentElement);
        const color = v => css.getPropertyValue(v).trim();
        chart?.destroy();
        chart = new Chart($('#chart'), {
          type: 'bar',
          data: {
            labels: rows.map(r => {
              const [y, m] = r.mois.split('-').map(Number);
              return state.year === 'all' ? `${SHORT[m - 1]} ${String(y).slice(2)}` : SHORT[m - 1];
            }),
            datasets: [
              { label: 'Ventes', data: rows.map(r => r.ventes), backgroundColor: color('--ok'), borderRadius: 4 },
              ...(self ? [{ label: 'Achats', data: rows.map(r => r.achats), backgroundColor: color('--accent'), borderRadius: 4 }] : []),
            ],
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: { labels: { color: color('--text-2') } },
              tooltip: { callbacks: { label: c => `${c.dataset.label} : ${eur(c.parsed.y)}` } },
            },
            scales: {
              x: { ticks: { color: color('--text-2') }, grid: { display: false } },
              y: { ticks: { color: color('--text-2'), callback: v => `${v} €` }, grid: { color: color('--border') } },
            },
          },
        });
      } catch (err) {
        box.classList.add('chart-off');
        setHtml(box, html`<p class="muted small">${err.message} — le tableau ci-dessous reste complet.</p><canvas id="chart" hidden></canvas>`);
      }
    }

    async function drawSplit(self) {
      const du = state.year === 'all' ? null : `${state.year}-01-01`;
      const au = state.year === 'all' ? null : `${state.year}-12-31`;
      let parts = [];
      try { parts = await api.rpc('bilan_extensions', { scope: state.scope || null, du, au }); } catch (_) { /* facultatif */ }
      const block = (sens, title) => {
        const list = parts.filter(p => p.sens === sens).slice(0, 10);
        const max = Math.max(1, ...list.map(p => Number(p.montant)));
        return html`
          <section class="panel">
            <div class="panel-head"><h2>${title}</h2><span class="muted small">par extension</span></div>
            ${list.length ? html`<div class="bars">${list.map(p => html`
              <div class="bar-row">
                <span class="bar-label">${p.set_name}</span>
                <span class="bar"><span class="bar-fill bar-${sens}" style="--w: ${Math.round(Number(p.montant) / max * 100)}%"></span></span>
                <span class="bar-value">${eur(p.montant)}</span>
              </div>`)}</div>` : html`<p class="muted small">Rien sur cette période.</p>`}
          </section>`;
      };
      setHtml($('#split'), html`${block('vente', 'Revenus')}${self ? block('achat', 'Dépenses') : ''}`);
    }

    $('#scope').addEventListener('change', e => { state.scope = e.target.value; draw(); });
    $('#year').addEventListener('change', e => { state.year = e.target.value; draw(); });
    await draw();
  },
};
