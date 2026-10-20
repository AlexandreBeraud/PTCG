import { api } from '../api.js';
import { config } from '../../config.js';
import { html, setHtml, on } from '../ui/dom.js';
import { toast, toastError } from '../ui/toast.js';
import { dropzone } from '../ui/upload.js';
import { THEMES, RADII, applyAppearance } from '../appearance.js';
import { store } from '../shared/store.js';

let settings = null;

const JOBS = { catalogue: 'Catalogue TCGdex', pokemon: 'Référentiel Pokémon', sauvegarde: 'Sauvegarde de la base' };

function runSummary(job, s) {
  if (!s) return 'OK';
  if (job === 'catalogue') {
    const added = (s.cartes_fr || 0) + (s.cartes_en || 0);
    const parts = [added ? `${added} carte(s) ajoutée(s)` : 'rien de nouveau'];
    if (s.passees_fr) parts.push(`${s.passees_fr} passée(s) en FR`);
    if (s.illisibles) parts.push(`${s.illisibles} à reprendre`);
    return parts.join(', ');
  }
  if (job === 'pokemon') return `${s.pokemon} Pokémon dont ${s.formes} formes`;
  if (job === 'sauvegarde') return `${s.fichier} (${Math.round(s.taille_ko / 1024 * 10) / 10} Mo)`;
  return 'OK';
}

async function save(patch) {
  const before = settings;
  settings = { ...settings, ...patch };
  applyAppearance(settings);
  try {
    await api.update('settings', { id: 'eq.1' }, { ...patch, updated_at: new Date().toISOString() });
  } catch (err) {
    settings = before;
    applyAppearance(settings);
    toastError(err);
  }
}

function appearanceHtml() {
  return html`
    <div class="field">
      <span>Thème</span>
      <div class="chips" role="radiogroup" aria-label="Thème">
        ${THEMES.map(t => html`
          <button type="button" class="chip" data-theme-id="${t.id}" role="radio" aria-checked="${settings.theme === t.id}" aria-pressed="${settings.theme === t.id}">
            <span style="display: inline-block; width: 14px; height: 14px; border-radius: 4px; vertical-align: -2px; margin-right: 6px; background: ${t.accent}; box-shadow: inset 0 0 0 3px ${t.bg}"></span>${t.name}
          </button>`)}
      </div>
    </div>
    <label class="field" style="max-width: 260px">Coins
      <select class="select" data-radius>
        ${RADII.map(r => html`<option value="${r.id}" ${settings.radius === r.id ? 'selected' : ''}>${r.name}</option>`)}
      </select>
    </label>
  `;
}

export default {
  title: 'Réglages',

  async render(main) {
    setHtml(main, html`
      <header class="page-header">
        <div><h1>Réglages</h1><p>Connexion, tâches de nuit, envoi de photos et apparence</p></div>
      </header>
      <div class="grid-auto" style="--min: 340px">
        <section class="panel" id="conn"><h2>Connexion</h2><p class="muted">Vérification…</p></section>
        <section class="panel">
          <h2>Image des lots de cartes</h2>
          <p class="muted small" style="margin: 0">Affichée pour chaque lot dans les ventes et achats. Envoyée dans ${config.uploadRoot}/Lots.</p>
          <div id="upload"></div>
        </section>
        <section class="panel" id="appearance"><h2>Apparence</h2><p class="muted">Chargement…</p></section>
      </div>
    `);

    this.checkConnection(main.querySelector('#conn'));

    const box = main.querySelector('#appearance');
    try {
      settings = await api.one('settings', { id: 'eq.1' });
      dropzone(main.querySelector('#upload'), {
        value: settings.lot_image || '',
        folder: 'Lots',
        label: 'Glisse la photo des lots ici',
        onChange: async path => {
          await save({ lot_image: path });
          store.forget('settings');
          toast('Image des lots enregistrée');
        },
      });
      setHtml(box, html`<h2>Apparence</h2>${appearanceHtml()}`);
    } catch (err) {
      setHtml(box, html`<h2>Apparence</h2><p class="muted">${err.message}</p>`);
      return;
    }
    on(box, 'click', '[data-theme-id]', async (_, btn) => {
      await save({ theme: btn.dataset.themeId });
      setHtml(box, html`<h2>Apparence</h2>${appearanceHtml()}`);
    });
    on(box, 'change', '[data-radius]', (_, sel) => save({ radius: sel.value }));
  },

  async checkConnection(box) {
    const rows = [];
    const check = async (label, fn) => {
      try { rows.push({ label, ok: true, detail: await fn() }); }
      catch (err) { rows.push({ label, ok: false, detail: err.message }); }
    };
    await check('Schéma v2 via PostgREST', async () => `${await api.count('sets')} extensions, ${await api.count('cards')} cartes`);
    await check('Écriture autorisée', async () => {
      const s = await api.one('settings', { id: 'eq.1' });
      await api.update('settings', { id: 'eq.1' }, { updated_at: new Date().toISOString() });
      return `réglages enregistrés (thème ${s.theme})`;
    });

    // dernier passage de chaque tâche de nuit
    let runs = [];
    try { runs = await api.list('job_runs', { order: 'started_at.desc', limit: 50 }); } catch (_) { /* déjà signalé plus haut */ }
    for (const [job, label] of Object.entries(JOBS)) {
      const run = runs.find(r => r.job === job);
      if (!run) { rows.push({ label, ok: null, detail: 'jamais lancé' }); continue; }
      const when = new Date(run.started_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const detail = !run.finished_at ? 'en cours…' : run.ok ? runSummary(job, run.summary) : run.error;
      rows.push({ label, ok: run.finished_at ? run.ok : null, detail: `${when} — ${detail}` });
    }

    setHtml(box, html`
      <h2>Connexion</h2>
      <div>
        ${rows.map(r => html`
          <div class="status-row">
            <span class="dot ${r.ok === null ? 'dot-warn' : r.ok ? 'dot-ok' : 'dot-danger'}"></span>
            <span class="grow"><span>${r.label}</span><span class="muted small">${r.detail}</span></span>
          </div>`)}
      </div>
    `);
  },
};
