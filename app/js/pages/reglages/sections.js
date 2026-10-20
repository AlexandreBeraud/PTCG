import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on } from '../../ui/dom.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { store } from '../../shared/store.js';

const nb = n => Number(n || 0).toLocaleString('fr-FR');
const pct = (a, b) => (b ? `${Math.round(a / b * 100)} %` : '—');

// Dernières sauvegardes de nuit et export JSON de mes données
export async function renderBackups(box) {
  let runs = [];
  try { runs = await api.list('job_runs', { job: 'eq.sauvegarde', order: 'started_at.desc', limit: 5 }); } catch (_) { /* affiché vide */ }
  setHtml(box, html`
    <h2>Sauvegardes</h2>
    <p class="muted small" style="margin: 0">Copie complète de la base chaque nuit sur le NAS (Sauvegardes/ptcg), 14 jours conservés.</p>
    <div class="mini-list">${runs.length ? runs.map(r => html`
      <div class="mini-row">
        <span class="dot ${r.ok ? 'dot-ok' : r.finished_at ? 'dot-danger' : 'dot-warn'}"></span>
        <span class="grow"><strong>${r.summary?.fichier || new Date(r.started_at).toLocaleDateString('fr-FR')}</strong>
          <span class="muted small">${r.ok ? `${Math.round((r.summary?.taille_ko || 0) / 102.4) / 10} Mo` : r.error || 'en cours'}</span></span>
      </div>`) : html`<p class="muted small" style="margin: 0">Aucune sauvegarde enregistrée pour l’instant.</p>`}</div>
    <div><button type="button" class="btn btn-sm" data-export>Exporter mes données en JSON</button></div>`);
  on(box, 'click', '[data-export]', (_, b) => exportJson(b));
}

// Tout ce que j'ai saisi (pas le référentiel, que les jobs recréent)
const MY_TABLES = ['transactions', 'commandes', 'contacts', 'accessoires', 'classeurs', 'classeur_sets', 'produits',
  'set_prefs', 'labels', 'label_categories', 'pokemon_labels', 'card_overrides', 'entites', 'settings'];

async function exportJson(btn) {
  btn.disabled = true;
  try {
    const data = { exporte_le: new Date().toISOString(), version: 'v2' };
    for (const t of MY_TABLES) {
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await api.page(t, {}, { offset, limit: 1000 });
        rows.push(...page.rows);
        if (rows.length >= page.total || !page.rows.length) break;
      }
      data[t] = rows;
    }
    data.cartes_manuelles = await api.list('cards', { source: 'eq.manual' });
    data.extensions_manuelles = await api.list('sets', { source: 'eq.manual' });
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ptcg-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Export téléchargé');
  } catch (err) {
    toastError(err);
  } finally {
    btn.disabled = false;
  }
}

// D'où viennent les images, sprites, liens et prix, et où ça en est
export async function renderSources(box) {
  let s;
  try { s = await api.rpc('catalogue_stats'); } catch (err) {
    return setHtml(box, html`<h2>Images et liens</h2><p class="muted">${err.message}</p>`);
  }
  const rows = [
    ['Logos d’extension', 'Fournis par TCGdex', `${nb(s.sets_logo)} / ${nb(s.sets)}`],
    ['Images des cartes', 'TCGdex, en VF dès qu’elle existe, sinon en anglais', `${nb(s.cards_image)} / ${nb(s.cards)} · ${nb(s.cards_en)} encore en anglais`],
    ['Cartes ajoutées à la main', 'Absentes de TCGdex, à remplacer quand elles y arrivent', nb(s.cards_manual)],
    ['Sprites des Pokémon et des formes', 'Tes sprites Home sur le NAS, repli sur l’illustration officielle', `${nb(s.pokemon_sprite)} / ${nb(s.pokemon)}`],
    ['Liens Cardmarket', 'Nom anglais, extension et numéro ; modifiables carte par carte',
      `${pct(s.cm_direct, s.cards)} directs · ${nb(s.cm_manual)} corrigés à la main · ${nb(s.cm_search)} recherches`],
    ['Prix Cardmarket', 'Tendance, prix bas et moyenne 30 jours de TCGdex, chaque nuit', `${nb(s.prices)} cartes · ${nb(s.prices_tracked)} suivies`],
  ];
  setHtml(box, html`
    <div class="panel-head"><h2>Images et liens</h2><span class="muted small">Tout est rempli automatiquement, rien à coller à la main</span></div>
    <div class="table-scroll"><table class="table">
      <tbody>${rows.map(([name, how, state]) => html`<tr><td><strong>${name}</strong><br><span class="muted small">${how}</span></td><td class="small">${state}</td></tr>`)}</tbody>
    </table></div>
    ${s.sets_without_code ? html`<p class="small" style="margin: 0">${s.sets_without_code} extension(s) où tu as des cartes n’ont pas de code Cardmarket : leurs liens sont des recherches. <a href="#/extensions">Ajoute le code</a> depuis la page de l’extension (Personnaliser).</p>` : ''}`);
}

// Articles qui ne sont pas des cartes (protège-cartes, classeurs…), à choisir dans une vente
export async function renderAccessoires(panel) {
  // contenu neuf à chaque affichage : sinon les clics ouvraient une fiche de plus à chaque fois
  const box = document.createElement('div');
  box.className = 'contents';
  panel.replaceChildren(box);
  let items = [], used = [];
  try {
    [items, used] = await Promise.all([
      api.list('accessoires', { order: 'name' }),
      api.list('transactions', { select: 'accessoire_id', accessoire_id: 'not.is.null' }),
    ]);
  } catch (err) {
    return setHtml(box, html`<h2>Accessoires</h2><p class="muted">${err.message}</p>`);
  }
  const count = id => used.filter(u => u.accessoire_id === id).length;
  setHtml(box, html`
    <div class="panel-head"><h2>Accessoires</h2><button type="button" class="btn btn-sm" data-acc-new>+ Nouvel accessoire</button></div>
    <p class="muted small" style="margin: 0">Articles qui ne sont pas des cartes, à choisir dans une vente ou un achat.</p>
    ${items.length ? html`<div class="acc-grid">${items.map(a => html`
      <button type="button" class="acc" data-acc-edit="${a.id}">
        <span class="thumb thumb-sm">${a.image ? html`<img src="${imageUrl(a.image, 'thumb')}" alt="" data-hide-on-error>` : ''}</span>
        <span class="small"><strong>${a.name}</strong></span>
        <span class="muted small">${count(a.id)} vente(s) ou achat(s)</span>
      </button>`)}</div>` : html`<p class="muted small">Aucun accessoire.</p>`}`);

  const edit = a => {
    let image = a?.image || '';
    const m = openModal({
      title: a ? 'Modifier l’accessoire' : 'Nouvel accessoire',
      width: 560,
      body: html`<label class="field">Nom<input class="input" id="acc-name" value="${a?.name || ''}"></label><div id="acc-photo"></div>`,
      actions: [
        ...(a ? [{ label: 'Supprimer', danger: true, run: async () => {
          if (count(a.id)) { toastError(new Error('Utilisé dans des ventes ou achats : impossible de le supprimer')); return false; }
          if (!await confirmModal({ title: `Supprimer « ${a.name} » ?`, message: 'Cette suppression est définitive.', confirmLabel: 'Supprimer', danger: true })) return false;
          try { await api.remove('accessoires', { id: `eq.${a.id}` }); store.forget('accessoires'); renderAccessoires(panel); } catch (err) { toastError(err); return false; }
        } }] : []),
        { label: 'Annuler' },
        { label: 'Enregistrer', primary: true, run: async el => {
          const name = el.querySelector('#acc-name').value.trim();
          if (!name) { toastError(new Error('Le nom est obligatoire')); return false; }
          try {
            if (a) await api.update('accessoires', { id: `eq.${a.id}` }, { name, image: image || null });
            else await api.insert('accessoires', { name, image: image || null });
            store.forget('accessoires');
            toast('Accessoire enregistré');
            renderAccessoires(panel);
          } catch (err) { toastError(err); return false; }
        } },
      ],
    });
    dropzone(m.el.querySelector('#acc-photo'), { value: image, folder: 'Accessoires', label: 'Photo de l’accessoire', onChange: p => { image = p; } });
  };
  on(box, 'click', '[data-acc-new]', () => edit(null));
  on(box, 'click', '[data-acc-edit]', (_, b) => edit(items.find(x => x.id === b.dataset.accEdit)));
}

// Blocs (séries TCGdex) créés par le catalogue : je choisis seulement couleur et visibilité
export async function renderSeries(box) {
  let series = [], prefs = [], counts = [];
  try {
    [series, prefs, counts] = await Promise.all([
      api.list('series', { order: 'name' }),
      api.list('set_prefs', { kind: 'eq.serie' }),
      api.list('set_list', { select: 'serie_id,release_date' }),
    ]);
  } catch (err) {
    return setHtml(box, html`<h2>Blocs</h2><p class="muted">${err.message}</p>`);
  }
  const pref = id => prefs.find(p => p.target_id === id) || {};
  const recent = id => counts.filter(c => c.serie_id === id).map(c => c.release_date || '').sort().pop() || '';
  const nbSets = id => counts.filter(c => c.serie_id === id).length;
  series.sort((a, b) => recent(b.id).localeCompare(recent(a.id)));

  setHtml(box, html`
    <div class="panel-head"><h2>Blocs</h2><span class="muted small">Créés par le catalogue · tu choisis la couleur (reprise par les extensions qui n’en ont pas) et la visibilité</span></div>
    <div class="series-list">${series.map(s => html`
      <div class="serie-row">
        <input class="input input-color" type="color" data-serie-color="${s.id}" value="${pref(s.id).color || '#8C95A8'}" aria-label="Couleur de ${s.name}">
        <span class="grow"><strong>${s.name}</strong> <span class="muted small">${nbSets(s.id)} extension(s)</span></span>
        <label class="check-inline small"><input type="checkbox" data-serie-visible="${s.id}" ${pref(s.id).hidden ? '' : 'checked'}> Visible</label>
      </div>`)}</div>`);

  const savePref = async (id, patch) => {
    try {
      const cur = pref(id);
      const row = { kind: 'serie', target_id: id, color: cur.color ?? null, hidden: cur.hidden ?? false, sort_order: cur.sort_order ?? null, ...patch };
      await api.upsert('set_prefs', row, 'kind,target_id');
      const i = prefs.findIndex(p => p.target_id === id);
      if (i >= 0) prefs[i] = row; else prefs.push(row);
    } catch (err) { toastError(err); }
  };
  on(box, 'change', '[data-serie-color]', (_, inp) => savePref(inp.dataset.serieColor, { color: inp.value }));
  on(box, 'change', '[data-serie-visible]', (_, c) => savePref(c.dataset.serieVisible, { hidden: !c.checked }));
}
