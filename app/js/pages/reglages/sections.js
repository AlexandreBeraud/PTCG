import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on } from '../../ui/dom.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone, askImage } from '../../ui/upload.js';
import { store } from '../../shared/store.js';
import { setSymbolHtml, spriteHtml, formBadge, cardImage } from '../../shared/sales.js';
import { forgetSets } from '../../shared/sets.js';

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
const MY_TABLES = ['transactions', 'commandes', 'contacts', 'accessoires', 'classeurs', 'classeur_groupes', 'classeur_sets', 'produits',
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

// D'où viennent les images, sprites, liens et prix, et où ça en est ; un clic montre ce qui manque
export async function renderSources(box) {
  let s;
  try { s = await api.rpc('catalogue_stats'); } catch (err) {
    return setHtml(box, html`<h2>Images et liens</h2><p class="muted">${err.message}</p>`);
  }
  const rows = [
    ['logos', 'Logos d’extension', 'Fournis par TCGdex', `${nb(s.sets_logo)} / ${nb(s.sets)}`, s.sets - s.sets_logo],
    ['sigles', 'Sigles d’extension', 'pokemontcg.io, sinon TCGdex', 'La liste vérifie chaque sigle et ne garde que ceux qui ne s’affichent pas', 1],
    ['images', 'Images des cartes', 'TCGdex en VF, sinon en anglais, sinon pokemontcg.io ; ou ajoutée à la main',
      `${nb(s.cards_image)} / ${nb(s.cards)} · ${nb(s.cards_fallback)} de pokemontcg.io`, s.cards - s.cards_image],
    ['anglais', 'Cartes encore en anglais', 'Passent en VF dès que TCGdex la publie', nb(s.cards_en), s.cards_en],
    ['manuelles', 'Cartes ajoutées à la main', 'Absentes de TCGdex, à remplacer quand elles y arrivent', nb(s.cards_manual), s.cards_manual],
    ['sprites', 'Sprites des Pokémon et des formes', 'Tes sprites Home sur le NAS, repli sur l’illustration officielle', `${nb(s.pokemon_sprite)} / ${nb(s.pokemon)}`, s.pokemon - s.pokemon_sprite],
    ['liens', 'Liens Cardmarket', 'Nom anglais, extension et numéro ; modifiables carte par carte',
      `${pct(s.cm_direct, s.cards)} directs · ${nb(s.cm_manual)} corrigés à la main · ${nb(s.cm_search)} recherches`, s.cm_search],
    ['prix', 'Prix Cardmarket', 'Prix le plus bas de TCGdex, chaque nuit, pour les cartes de tes ventes et achats', `${nb(s.prices)} cartes · ${nb(s.prices_tracked)} suivies`, 1],
  ];
  setHtml(box, html`
    <div class="panel-head"><h2>Images et liens</h2><span class="muted small">Rempli automatiquement · clique sur une ligne pour voir ce qui manque</span></div>
    <div class="table-scroll"><table class="table table-click">
      <tbody>${rows.map(([id, name, how, state, missing]) => html`
        <tr data-missing="${missing ? id : ''}" tabindex="${missing ? 0 : -1}">
          <td><strong>${name}</strong><br><span class="muted small">${how}</span></td>
          <td class="small">${state}</td>
          <td class="small num">${missing ? html`<span class="link">Voir</span>` : html`<span class="pos">Complet</span>`}</td>
        </tr>`)}</tbody>
    </table></div>
    ${s.sets_without_code ? html`<p class="small" style="margin: 0">${s.sets_without_code} extension(s) où tu as des cartes n’ont pas de code Cardmarket : leurs liens sont des recherches. <button type="button" class="link" data-missing="codes">Les voir</button></p>` : ''}`);

  on(box, 'click', '[data-missing]', (_, el) => el.dataset.missing && showMissing(el.dataset.missing));
  on(box, 'keydown', '[data-missing]', (e, el) => { if (e.key === 'Enter') el.click(); });
}

// Ce qui manque, les éléments de mes ventes et achats d'abord
const MINE = '(en_stock.gt.0,vendues.gt.0,achetees.gt.0)';
const CARD = 'id,name,number,set_id,set_name,set_symbol,image,lang,en_stock,vendues,achetees';
const MISSING = {
  logos: { title: 'Extensions sans logo', table: 'set_list', params: { logo: 'is.null', source: 'eq.tcgdex', select: 'id,name,serie_name,release_date,symbol', order: 'release_date.desc.nullslast' }, kind: 'set' },
  sigles: { title: 'Extensions sans sigle', note: 'Sans sigle, ou dont l’image ne s’affiche pas : le code de l’extension la remplace.',
    table: 'set_list', params: { source: 'eq.tcgdex', select: 'id,name,serie_name,release_date,symbol', order: 'release_date.desc.nullslast' }, kind: 'set', limit: 1000,
    // seul le navigateur sait si l'image existe vraiment
    keep: async rows => {
      const broken = await Promise.all(rows.map(r => !r.symbol || imageFails(r.symbol)));
      return rows.filter((_, i) => broken[i]);
    } },
  images: { title: 'Cartes sans image', note: 'Le catalogue en cherche 60 par nuit sur pokemontcg.io.',
    table: 'card_list', params: { image: 'is.null', select: CARD, order: 'a_du_stock.desc,vendues.desc,achetees.desc,release_date.desc.nullslast,set_id,number_sort.nullslast' }, kind: 'card' },
  anglais: { title: 'Cartes encore en anglais', table: 'card_list', params: { lang: 'eq.en', select: CARD, order: 'a_du_stock.desc,vendues.desc,release_date.desc.nullslast,set_id,number_sort.nullslast' }, kind: 'card' },
  manuelles: { title: 'Cartes ajoutées à la main', table: 'card_list', params: { source: 'eq.manual', select: CARD, order: 'name' }, kind: 'card' },
  sprites: { title: 'Pokémon sans sprite sur le NAS', note: 'Ils affichent l’illustration officielle.', table: 'pokedex',
    params: { sprite: 'is.null', select: 'key,dex,name_fr,pokeapi_id,form_badge,form_color,cartes', order: 'cartes.desc,sort_order' }, kind: 'pokemon' },
  liens: { title: 'Cartes de tes ventes et achats avec un lien de recherche', note: 'Colle le bon lien, ou ajoute le code Cardmarket de l’extension (liste « sans code Cardmarket »).',
    table: 'card_list', params: { cardmarket_url: 'like.*/Search?*', or: MINE, select: CARD, order: 'set_name,number_sort.nullslast' }, kind: 'card' },
  prix: { title: 'Cartes de tes ventes et achats sans prix', note: 'TCGdex n’a pas de prix Cardmarket pour elles.',
    table: 'card_list', params: { prices_updated_at: 'is.null', or: MINE, source: 'eq.tcgdex', select: CARD, order: 'set_name,number_sort.nullslast' }, kind: 'card' },
  codes: { title: 'Extensions de tes cartes sans code Cardmarket', table: 'set_list',
    params: { cardmarket_code: 'is.null', source: 'eq.tcgdex', or: '(en_stock.gt.0,vendues.gt.0)', select: 'id,name,serie_name,release_date,symbol', order: 'release_date.desc.nullslast' }, kind: 'set' },
};

// Corriger à la main depuis la liste : une image (logo, sigle, image de carte, sprite) ou un texte (code, lien)
const FIX = {
  logos: { label: 'Logo…', image: r => ({ title: `Logo de ${r.name}`, folder: 'Extensions' }), save: (r, v) => api.rpc('set_set_image', { set_id: r.id, quoi: 'logo', url: v }) },
  sigles: { label: 'Sigle…', image: r => ({ title: `Sigle de ${r.name}`, folder: 'Extensions', hint: 'Une petite icône, de préférence sur fond transparent.' }),
    save: (r, v) => api.rpc('set_set_image', { set_id: r.id, quoi: 'symbol', url: v }) },
  images: { label: 'Image…', image: r => ({ title: `Image de ${r.name}`, folder: 'Cartes', hint: 'Sur Cardmarket : clic droit sur l’image de la carte, « Copier l’adresse de l’image ».' }),
    save: (r, v) => api.rpc('set_card_image', { card_id: r.id, image: v }) },
  sprites: { label: 'Sprite…', image: r => ({ title: `Sprite de ${r.name_fr}`, folder: 'Sprites' }),
    save: (r, v) => api.rpc('set_pokemon_sprite', { pokemon_key: r.key, sprite: /^https?:/.test(v) ? v : `/${v}` }) },
  liens: { text: 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/…', save: (r, v) => api.rpc('set_card_cardmarket_url', { card_id: r.id, url: v }) },
  codes: { text: 'PFL, SVI…', save: (r, v) => api.rpc('set_cardmarket_code', { set_id: r.id, code: v }) },
};

// l'image se charge-t-elle ? (6 s au plus)
function imageFails(src) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(true), 6000);
    img.onload = () => { clearTimeout(timer); resolve(!img.naturalWidth); };
    img.onerror = () => { clearTimeout(timer); resolve(true); };
    img.src = src;
  });
}

async function showMissing(id) {
  const m = MISSING[id];
  const fix = FIX[id];
  let page;
  try { page = await api.page(m.table, m.params, { limit: m.limit || 300 }); } catch (err) { return toastError(err); }
  if (m.keep) {
    const rows = await m.keep(page.rows);
    page = { rows, total: rows.length };
  }
  const control = (r, i) => !fix ? ''
    : fix.text ? html`<span class="input-group missing-fix"><input class="input input-sm" data-fix-text="${i}" placeholder="${fix.text}" aria-label="Corriger"><button type="button" class="btn btn-sm" data-fix-ok="${i}">OK</button></span>`
    : html`<button type="button" class="btn btn-sm" data-fix-image="${i}">${fix.label}</button>`;
  const item = (r, i) => {
    if (m.kind === 'set') return html`
      <div class="todo-item" data-row="${i}">
        ${setSymbolHtml({ set_id: r.id, set_symbol: r.symbol, set_name: r.name })}
        <a class="grow" href="#/extensions/${encodeURIComponent(r.id)}"><strong>${r.name}</strong><span class="muted small">${[r.serie_name, r.id.toUpperCase(), r.release_date ? r.release_date.slice(0, 4) : ''].filter(Boolean).join(' · ')}</span></a>
        ${control(r, i)}
      </div>`;
    if (m.kind === 'pokemon') return html`
      <div class="todo-item" data-row="${i}">
        <span class="tx-sprite">${spriteHtml(r, 'sprite-inline')}</span>
        <a class="grow" href="#/pokedex/${encodeURIComponent(r.key)}"><strong>${r.name_fr} ${formBadge(r)}</strong><span class="muted small">n°${String(r.dex).padStart(3, '0')} · ${r.cartes} carte${r.cartes > 1 ? 's' : ''}</span></a>
        ${control(r, i)}
      </div>`;
    const mine = Number(r.en_stock) || Number(r.vendues) || Number(r.achetees);
    return html`
      <div class="todo-item" data-row="${i}">
        ${setSymbolHtml(r)}
        <span class="thumb thumb-xs">${r.image ? html`<img src="${cardImage(r.image)}" alt="" loading="lazy" data-hide-on-error>` : ''}</span>
        <a class="grow" href="#/cartes/${encodeURIComponent(r.id)}"><strong>${r.name}</strong><span class="muted small">${r.set_name} · ${r.number || '—'}${mine ? ' · dans mes ventes ou achats' : ''}</span></a>
        ${control(r, i)}
      </div>`;
  };
  const modal = openModal({
    title: m.title,
    width: 760,
    body: html`
      <p class="muted small" style="margin: 0">${page.total.toLocaleString('fr-FR')} au total${page.total > page.rows.length ? `, les ${page.rows.length} premiers` : ''}${m.note ? ` · ${m.note}` : ''}</p>
      ${page.rows.length ? html`<div class="mini-list missing-list">${page.rows.map(item)}</div>` : html`<p class="pos">Rien ne manque.</p>`}`,
    actions: [{ label: 'Fermer' }],
  });
  // un lien ouvert ferme la liste
  on(modal.el, 'click', 'a[href]', () => modal.close());

  const done = i => {
    const row = modal.el.querySelector(`[data-row="${i}"]`);
    row.classList.add('is-fixed');
    row.querySelector('.missing-fix, [data-fix-image]')?.replaceWith(Object.assign(document.createElement('span'), { className: 'tag tag-ok', textContent: 'Corrigé' }));
  };
  const apply = async (i, value) => {
    try {
      await fix.save(page.rows[i], value);
      done(i);
      if (id === 'codes' || id === 'liens') toast('Enregistré · liens Cardmarket recalculés');
    } catch (err) { toastError(err); }
  };
  on(modal.el, 'click', '[data-fix-image]', async (_, b) => {
    const r = page.rows[Number(b.dataset.fixImage)];
    const value = await askImage(fix.image(r));
    if (value) apply(Number(b.dataset.fixImage), value);
  });
  on(modal.el, 'click', '[data-fix-ok]', (_, b) => {
    const input = modal.el.querySelector(`[data-fix-text="${b.dataset.fixOk}"]`);
    if (input.value.trim()) apply(Number(b.dataset.fixOk), input.value.trim());
  });
  on(modal.el, 'keydown', '[data-fix-text]', (e, input) => {
    if (e.key === 'Enter' && input.value.trim()) { e.preventDefault(); apply(Number(input.dataset.fixText), input.value.trim()); }
  });
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

// Blocs (séries TCGdex) créés par le catalogue : je choisis couleur, visibilité et ordre
export async function renderSeries(panel) {
  const box = document.createElement('div');
  box.className = 'contents';
  panel.replaceChildren(box);
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
  // l'ordre choisi d'abord, sinon du plus récent au plus ancien (comme la page Extensions)
  series.sort((a, b) => (pref(a.id).sort_order ?? 1e6) - (pref(b.id).sort_order ?? 1e6) || recent(b.id).localeCompare(recent(a.id)));
  const custom = series.some(s => pref(s.id).sort_order != null);

  setHtml(box, html`
    <div class="panel-head"><h2>Blocs</h2><span class="muted small">Créés par le catalogue · tu choisis la couleur (reprise par les extensions qui n’en ont pas), la visibilité et l’ordre</span></div>
    <div class="series-list">${series.map((s, i) => html`
      <div class="serie-row">
        <input class="input input-color" type="color" data-serie-color="${s.id}" value="${pref(s.id).color || '#8C95A8'}" aria-label="Couleur de ${s.name}">
        <span class="grow"><strong>${s.name}</strong> <span class="muted small">${nbSets(s.id)} extension(s)</span></span>
        <label class="check-inline small"><input type="checkbox" data-serie-visible="${s.id}" ${pref(s.id).hidden ? '' : 'checked'}> Visible</label>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-serie-move="${i}:-1" aria-label="Monter ${s.name}" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" class="btn btn-ghost btn-icon btn-sm" data-serie-move="${i}:1" aria-label="Descendre ${s.name}" ${i === series.length - 1 ? 'disabled' : ''}>↓</button>
      </div>`)}</div>
    ${custom ? html`<div><button type="button" class="btn btn-sm btn-ghost" data-serie-reset>Revenir à l’ordre par date</button></div>` : ''}`);

  const row = (id, patch) => {
    const cur = pref(id);
    return { kind: 'serie', target_id: id, color: cur.color ?? null, hidden: cur.hidden ?? false, sort_order: cur.sort_order ?? null, ...patch };
  };
  const savePref = async (id, patch) => {
    try {
      const r = row(id, patch);
      await api.upsert('set_prefs', r, 'kind,target_id');
      const i = prefs.findIndex(p => p.target_id === id);
      if (i >= 0) prefs[i] = r; else prefs.push(r);
    } catch (err) { toastError(err); }
  };
  // l'ordre complet est enregistré d'un coup
  const saveOrder = async list => {
    try {
      await api.upsert('set_prefs', list.map((s, i) => row(s.id, { sort_order: i + 1 })), 'kind,target_id');
      forgetSets();
      renderSeries(panel);
    } catch (err) { toastError(err); }
  };
  on(box, 'change', '[data-serie-color]', (_, inp) => savePref(inp.dataset.serieColor, { color: inp.value }));
  on(box, 'change', '[data-serie-visible]', (_, c) => savePref(c.dataset.serieVisible, { hidden: !c.checked }));
  on(box, 'click', '[data-serie-move]', (_, b) => {
    const [i, d] = b.dataset.serieMove.split(':').map(Number);
    const list = [...series];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    saveOrder(list);
  });
  on(box, 'click', '[data-serie-reset]', async () => {
    try {
      await api.upsert('set_prefs', series.map(s => row(s.id, { sort_order: null })), 'kind,target_id');
      forgetSets();
      renderSeries(panel);
    } catch (err) { toastError(err); }
  });
}
