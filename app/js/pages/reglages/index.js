import { api } from '../../api.js';
import { config } from '../../../config.js';
import { html, setHtml, on } from '../../ui/dom.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { THEMES, RADII, applyAppearance } from '../../appearance.js';
import { store } from '../../shared/store.js';
import { renderBackups, renderSources, renderAccessoires, renderSeries } from './sections.js';

let settings = null;

export const JOBS = {
  catalogue: { label: 'Catalogue TCGdex', freq: 'Chaque nuit à 03:00', cmd: 'node catalogue.js' },
  sauvegarde: { label: 'Sauvegarde de la base', freq: 'Chaque nuit à 02:45', cmd: './backup.sh' },
  pokemon: { label: 'Référentiel Pokémon', freq: 'Le dimanche à 02:30', cmd: 'node pokemon.js' },
};

export function runSummary(job, s) {
  if (!s) return 'OK';
  if (job === 'catalogue') {
    const added = (s.cartes_fr || 0) + (s.cartes_en || 0);
    const parts = [added ? `${added} carte(s) ajoutée(s)` : 'rien de nouveau'];
    if (s.passees_fr) parts.push(`${s.passees_fr} passée(s) en FR`);
    if (s.illisibles) parts.push(`${s.illisibles} à reprendre`);
    if (s.prix?.maj) parts.push(`${s.prix.maj} prix relevés`);
    return parts.join(', ');
  }
  if (job === 'pokemon') return `${s.pokemon} Pokémon dont ${s.formes} formes${s.nouveaux ? `, ${s.nouveaux} nouveau(x)` : ''}`;
  if (job === 'sauvegarde') return `${s.fichier} (${Math.round(s.taille_ko / 1024 * 10) / 10} Mo)`;
  return 'OK';
}

const duration = r => {
  if (!r.finished_at) return 'en cours…';
  const s = Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000);
  return s < 60 ? `${s} s` : `${Math.round(s / 60)} min`;
};
const when = d => new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

async function save(patch) {
  const before = settings;
  settings = { ...settings, ...patch };
  applyAppearance(settings);
  try {
    await api.update('settings', { id: 'eq.1' }, { ...patch, updated_at: new Date().toISOString() });
    store.forget('settings');
  } catch (err) {
    settings = before;
    applyAppearance(settings);
    toastError(err);
  }
}

function appearanceHtml() {
  return html`
    <h2>Apparence</h2>
    <div class="field"><span>Thème</span>
      <div class="chips" role="radiogroup" aria-label="Thème">
        ${THEMES.map(t => html`
          <button type="button" class="chip" data-theme-id="${t.id}" role="radio" aria-checked="${settings.theme === t.id}" aria-pressed="${settings.theme === t.id}">
            <span class="swatch" style="--sw-bg: ${t.bg}; --sw-accent: ${t.accent}"></span>${t.name}
          </button>`)}
      </div>
    </div>
    <div class="form-row">
      <div class="field"><span>Couleur d’accent</span>
        <span class="input-group">
          <input class="input input-color" type="color" data-accent value="${settings.accent || THEMES.find(t => t.id === settings.theme)?.accent || '#FF5E5B'}" aria-label="Couleur d’accent">
          <button type="button" class="btn btn-sm btn-ghost" data-accent-reset ${settings.accent ? '' : 'disabled'}>Celle du thème</button>
        </span>
      </div>
      <label class="field">Coins
        <select class="select" data-radius>${RADII.map(r => html`<option value="${r.id}" ${settings.radius === r.id ? 'selected' : ''}>${r.name}</option>`)}</select>
      </label>
    </div>`;
}

export default {
  title: 'Réglages',

  async render(main) {
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Réglages</h1><p>Automatisations, apparence, sauvegardes et extensions</p></div>
      </header>
      <section class="panel" id="jobs"><h2>Automatisations</h2><p class="muted">Chargement…</p></section>
      <div class="grid-auto" style="--min: 340px">
        <section class="panel" id="conn"><h2>Connexion</h2><p class="muted">Vérification…</p></section>
        <section class="panel" id="appearance"><h2>Apparence</h2><p class="muted">Chargement…</p></section>
        <section class="panel" id="backups"><h2>Sauvegardes</h2></section>
        <section class="panel">
          <h2>Image des lots de cartes</h2>
          <p class="muted small" style="margin: 0">Utilisée pour tous les lots vendus ou achetés. Envoyée dans ${config.uploadRoot}/Lots.</p>
          <div id="upload"></div>
        </section>
      </div>
      <section class="panel" id="sources"><h2>Images et liens</h2></section>
      <section class="panel" id="accessoires"><h2>Accessoires</h2></section>
      <section class="panel" id="series"><h2>Séries</h2></section>
    `);
    const $ = s => main.querySelector(s);

    this.checkConnection($('#conn'));
    this.renderJobs($('#jobs'));
    renderBackups($('#backups'));
    renderSources($('#sources'));
    renderAccessoires($('#accessoires'));
    renderSeries($('#series'));

    const box = $('#appearance');
    try {
      settings = await api.one('settings', { id: 'eq.1' });
    } catch (err) {
      return setHtml(box, html`<h2>Apparence</h2><p class="muted">${err.message}</p>`);
    }
    setHtml(box, appearanceHtml());
    dropzone($('#upload'), {
      value: settings.lot_image || '', folder: 'Lots', label: 'Glisse la photo des lots ici',
      onChange: async path => { await save({ lot_image: path }); toast('Image des lots enregistrée'); },
    });
    on(box, 'click', '[data-theme-id]', async (_, btn) => {
      await save({ theme: btn.dataset.themeId });
      setHtml(box, appearanceHtml());
    });
    on(box, 'change', '[data-radius]', (_, sel) => save({ radius: sel.value }));
    on(box, 'change', '[data-accent]', async (_, inp) => { await save({ accent: inp.value }); setHtml(box, appearanceHtml()); });
    on(box, 'click', '[data-accent-reset]', async () => { await save({ accent: null }); setHtml(box, appearanceHtml()); });
  },

  async renderJobs(box) {
    let runs = [];
    try { runs = await api.list('job_runs', { order: 'started_at.desc', limit: 60 }); } catch (err) {
      return setHtml(box, html`<h2>Automatisations</h2><p class="muted">${err.message}</p>`);
    }
    setHtml(box, html`
      <div class="panel-head"><h2>Automatisations</h2><span class="muted small">Tournent seules sur le Pi, la nuit</span></div>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>Tâche</th><th>Fréquence</th><th>Dernier passage</th><th>Résultat</th></tr></thead>
          <tbody>${Object.entries(JOBS).map(([job, j]) => {
            const r = runs.find(x => x.job === job);
            return html`<tr>
              <td><span class="dot ${!r ? '' : !r.finished_at ? 'dot-warn' : r.ok ? 'dot-ok' : 'dot-danger'}"></span> <strong>${j.label}</strong></td>
              <td class="small">${j.freq}</td>
              <td class="small">${r ? `${when(r.started_at)} · ${duration(r)}` : 'jamais lancé'}</td>
              <td class="small">${!r ? '—' : r.ok ? runSummary(job, r.summary) : html`<span class="neg">${r.error || 'en erreur'}</span>`}</td>
            </tr>`;
          })}</tbody>
        </table>
      </div>
      <details>
        <summary class="small">Historique et relance à la main</summary>
        <p class="muted small">Pour relancer une tâche tout de suite, sur le Pi : <code>cd ~/ptcg-repo/jobs && ${Object.values(JOBS).map(j => j.cmd).join(' · ')}</code></p>
        <div class="mini-list">${runs.slice(0, 20).map(r => html`
          <div class="mini-row">
            <span class="dot ${!r.finished_at ? 'dot-warn' : r.ok ? 'dot-ok' : 'dot-danger'}"></span>
            <span class="grow"><strong>${JOBS[r.job]?.label || r.job}</strong><span class="muted small">${r.ok ? runSummary(r.job, r.summary) : r.error || 'en cours…'}</span></span>
            <span class="muted small">${when(r.started_at)} · ${duration(r)}</span>
          </div>`)}</div>
      </details>`);
  },

  async checkConnection(box) {
    const rows = [];
    const check = async (label, fn) => {
      try { rows.push({ label, ok: true, detail: await fn() }); }
      catch (err) { rows.push({ label, ok: false, detail: err.message }); }
    };
    await check('Base v2 via PostgREST', async () => `${await api.count('sets')} extensions, ${await api.count('cards')} cartes`);
    await check('Écriture autorisée', async () => {
      await api.update('settings', { id: 'eq.1' }, { updated_at: new Date().toISOString() });
      return 'réglages enregistrés';
    });
    await check('Photos sur le NAS', async () => {
      const { ensureLogin } = await import('../../nas.js');
      if (!config.nasUser) throw new Error('identifiants FileBrowser absents (config.local.js)');
      if (!await ensureLogin()) throw new Error('FileBrowser refuse la connexion');
      return `connecté en tant que ${config.nasUser}`;
    });
    setHtml(box, html`
      <h2>Connexion</h2>
      <div>${rows.map(r => html`
        <div class="status-row">
          <span class="dot ${r.ok ? 'dot-ok' : 'dot-danger'}"></span>
          <span class="grow"><span>${r.label}</span><span class="muted small">${r.detail}</span></span>
        </div>`)}</div>`);
  },
};
