import { api } from '../api.js';
import { config } from '../../config.js';
import { html, setHtml, on } from '../ui/dom.js';
import { toast, toastError } from '../ui/toast.js';
import { dropzone } from '../ui/upload.js';
import { THEMES, RADII, applyAppearance } from '../appearance.js';

let settings = null;

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
        <div><h1>Réglages</h1><p>Lot 0 : vérification de la connexion, de l’envoi de photos et de l’apparence</p></div>
      </header>
      <div class="grid-auto" style="--min: 340px">
        <section class="panel" id="conn"><h2>Connexion</h2><p class="muted">Vérification…</p></section>
        <section class="panel">
          <h2>Envoi de photo vers le NAS</h2>
          <p class="muted small" style="margin: 0">Dossier : ${config.uploadRoot}</p>
          <div id="upload"></div>
          <p class="muted small" id="upload-path" style="margin: 0"></p>
        </section>
        <section class="panel" id="appearance"><h2>Apparence</h2><p class="muted">Chargement…</p></section>
      </div>
    `);

    dropzone(main.querySelector('#upload'), {
      folder: 'Tests',
      onChange: path => {
        main.querySelector('#upload-path').textContent = path;
        toast('Photo envoyée sur le NAS');
      },
    });

    this.checkConnection(main.querySelector('#conn'));

    const box = main.querySelector('#appearance');
    try {
      settings = await api.one('settings', { id: 'eq.1' });
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
    await check('Dernier passage des jobs', async () => {
      const run = await api.one('job_runs', { order: 'started_at.desc' });
      return run ? new Date(run.started_at).toLocaleString('fr-FR') : 'aucun pour l’instant (lot 1)';
    });

    setHtml(box, html`
      <h2>Connexion</h2>
      <div>
        ${rows.map(r => html`
          <div class="status-row">
            <span class="dot ${r.ok ? 'dot-ok' : 'dot-danger'}"></span>
            <span class="grow"><span>${r.label}</span><span class="muted small">${r.detail}</span></span>
          </div>`)}
      </div>
    `);
  },
};
