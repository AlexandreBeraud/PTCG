import { api } from '../../api.js';
import { html, setHtml, on, uid, etatErreur } from '/_shared/ui/dom.js';
import { icone } from '../../ui/icones.js';
import { ouvrirModale, confirmer } from '/_shared/ui/modale.js';
import { notifier, notifierErreur } from '/_shared/ui/notifications.js';
import { norm, spriteHtml, formBadge } from '../../shared/sales.js';

const state = { cat: 'all', q: '' };

export default {
  title: 'Labels de formes',

  async render(main, params) {
    let cats = [], labels = [];
    let selected = params[0] || null;

    setHtml(main, html`
      <header class="page-tete">
        <div>
          <h1>Labels de formes</h1>
          <p>Ils reconnaissent les formes dans les noms de cartes : c’est eux qui envoient une carte sur la fiche Méga-Dracaufeu X plutôt que sur Dracaufeu.</p>
        </div>
        <div class="page-actions">
          <button type="button" class="btn" data-new-cat>Nouvelle catégorie</button>
          <button type="button" class="btn btn-principal" data-new-label>${icone('plus')}Nouveau label</button>
        </div>
      </header>
      <div class="labels-layout">
        <nav class="cat-tree" id="cats" aria-label="Catégories"></nav>
        <section class="labels-main">
          <label class="recherche">${icone('recherche')}<input type="search" id="lq" placeholder="Rechercher un label" value="${state.q}" aria-label="Rechercher un label"></label>
          <div id="cat-actions"></div>
          <div id="table"></div>
        </section>
        <aside class="label-editor" id="editor" aria-live="polite"></aside>
      </div>
    `);
    const $ = s => main.querySelector(s);

    async function load() {
      [cats, labels] = await Promise.all([
        api.lire('label_categories', { order: 'sort_order.asc.nullslast,name' }),
        api.lire('label_list', { order: 'sort_order.asc.nullslast,name_fr' }),
      ]);
    }

    const childrenOf = id => cats.filter(c => (c.parent_id || null) === id);
    const descendants = id => [id, ...childrenOf(id).flatMap(c => descendants(c.id))];
    const inCat = (l, cat) => cat === 'all' ? true : cat === 'none' ? !l.category_id : descendants(cat).includes(l.category_id);

    function renderCats() {
      const item = (id, name, depth) => html`
        <button type="button" class="cat-item" data-cat="${id}" aria-current="${state.cat === id}" style="--depth: ${depth}">
          <span class="grow">${name}</span><span class="muted small">${labels.filter(l => inCat(l, id)).length}</span>
        </button>`;
      const tree = (parent, depth) => childrenOf(parent).map(c => html`${item(c.id, c.name, depth)}${tree(c.id, depth + 1)}`);
      setHtml($('#cats'), html`${item('all', 'Tous les labels', 0)}${tree(null, 0)}${item('none', 'Sans catégorie', 0)}`);
      const cat = cats.find(c => c.id === state.cat);
      setHtml($('#cat-actions'), cat ? html`
        <div class="row-actions">
          <strong class="grow">${cat.name}</strong>
          <button type="button" class="btn btn-petit btn-fantome" data-edit-cat>Renommer ou déplacer</button>
          <button type="button" class="btn btn-petit btn-danger" data-del-cat>Supprimer la catégorie</button>
        </div>` : '');
    }

    function renderTable() {
      const q = norm(state.q);
      const list = labels.filter(l => inCat(l, state.cat) && (!q || norm(`${l.name_fr} ${l.type} ${l.badge || ''}`).includes(q)));
      setHtml($('#table'), list.length ? html`
        <div class="table-scroll">
          <table class="table table-click">
            <thead><tr><th>Badge</th><th>Nom</th><th>Préfixes</th><th>Suffixes</th><th class="num">Formes</th><th class="num">Cartes</th><th>Actif</th></tr></thead>
            <tbody>${list.map(l => html`
              <tr data-label="${l.type}" class="${l.type === selected ? 'is-selected' : ''} ${l.enabled ? '' : 'is-off'}" tabindex="0">
                <td>${l.badge ? html`<span class="form-badge" style="--badge: ${l.color || '#F2C14E'}">${l.badge}</span>` : '—'}</td>
                <td><strong>${l.name_fr}</strong><br><span class="muted small">${l.type}</span></td>
                <td class="small">${l.prefixes?.length ? l.prefixes.join(', ') : '—'}</td>
                <td class="small">${l.suffixes?.length ? l.suffixes.join(', ') : '—'}</td>
                <td class="num">${l.formes}</td>
                <td class="num">${l.cartes}</td>
                <td>${l.enabled ? html`<span class="badge badge-ok">Oui</span>` : html`<span class="badge">Non</span>`}</td>
              </tr>`)}</tbody>
          </table>
        </div>` : html`<div class="vide-etat"><h2>Aucun label ici</h2></div>`);
    }

    async function renderEditor() {
      // un contenu neuf à chaque affichage : les écouteurs du label d'avant partent avec l'ancien
      const box = document.createElement('div');
      box.className = 'label-editor-body';
      $('#editor').replaceChildren(box);
      const l = labels.find(x => x.type === selected);
      if (!l) return setHtml(box, html`<p class="muted small">Choisis un label pour le modifier.</p>`);

      const [forms, manual, excluded] = await Promise.all([
        api.lire('pokedex', { label_type: `eq.${l.type}`, or: '(is_default.eq.false,label_manuel.eq.true)', select: 'key,name_fr,dex,sprite,pokeapi_id,label_manuel,cartes', order: 'sort_order' }),
        api.lire('pokemon_labels', { label_type: `eq.${l.type}` }),
        api.lire('pokedex', { form_type: `eq.${l.type}`, label_manuel: 'eq.true', label_type: 'is.null', select: 'key,name_fr' }),
      ]).catch(err => { notifierErreur(err); return [[], [], []]; });
      if (selected !== l.type) return;
      const manualKeys = new Set(manual.map(m => m.pokemon_key));

      setHtml(box, html`
        <div class="panel-tete"><h2>${l.name_fr}</h2>${l.badge ? html`<span class="form-badge" style="--badge: ${l.color || '#F2C14E'}">${l.badge}</span>` : ''}</div>
        <form class="form-grid" id="lf">
          <label class="field">Nom affiché<input class="input" name="name_fr" value="${l.name_fr}" required></label>
          <div class="form-row">
            <label class="field">Badge<input class="input" name="badge" value="${l.badge || ''}" maxlength="8"></label>
            <label class="field">Couleur<input class="input input-color" type="color" name="color" value="${l.color || '#F2C14E'}"></label>
          </div>
          <label class="field">Catégorie
            <select class="input" name="category_id">
              <option value="">Sans catégorie</option>
              ${cats.map(c => html`<option value="${c.id}" ${c.id === l.category_id ? 'selected' : ''}>${c.parent_id ? '— ' : ''}${c.name}</option>`)}
            </select>
          </label>
          <label class="check-inline"><input type="checkbox" name="enabled" ${l.enabled ? 'checked' : ''}> Actif</label>
          ${['prefixes', 'suffixes'].map(k => html`
            <div class="field"><span>${k === 'prefixes' ? 'Préfixes' : 'Suffixes'} dans le nom de la carte</span>
              <div class="tag-input" data-list="${k}">
                ${(l[k] || []).map((v, i) => html`<span class="badge">${v}<button type="button" class="tag-x" data-rm="${k}:${i}" aria-label="Retirer ${v}">×</button></span>`)}
                <input class="input input-sm" data-add="${k}" placeholder="Ajouter puis Entrée" aria-label="Ajouter un ${k === 'prefixes' ? 'préfixe' : 'suffixe'}">
              </div>
            </div>`)}
          <p class="muted small" style="margin: 0">Une carte va sur la forme quand son nom contient un des préfixes <strong>et</strong> un des suffixes (mots entiers, sans tenir compte des accents). Une liste vide ne compte pas.</p>
          <div class="row-actions">
            <button type="submit" class="btn btn-principal">Enregistrer</button>
            <button type="button" class="btn btn-danger" data-del-label>Supprimer</button>
          </div>
        </form>

        <div class="field"><span>${forms.length} forme${forms.length > 1 ? 's' : ''} reliée${forms.length > 1 ? 's' : ''}</span>
          <div class="chips-static">${forms.map(f => html`
            <span class="badge ${manualKeys.has(f.key) ? 'badge-info' : ''}">
              <a href="#/pokedex/${encodeURIComponent(f.key)}">${f.name_fr}</a> · ${f.cartes}
              <button type="button" class="tag-x" data-unlink="${f.key}" aria-label="Détacher ${f.name_fr}" title="${manualKeys.has(f.key) ? 'Retirer l’assignation à la main' : 'Exclure cette forme du label'}">×</button>
            </span>`)}</div>
        </div>
        ${excluded.length ? html`
          <div class="field"><span>Exclues à la main</span>
            <div class="chips-static">${excluded.map(f => html`<span class="badge">${f.name_fr}<button type="button" class="tag-x" data-restore="${f.key}" aria-label="Rétablir ${f.name_fr}" title="Rétablir la détection automatique">↺</button></span>`)}</div>
          </div>` : ''}
        <div class="field"><span>Assigner à la main à un Pokémon</span>
          <label class="recherche"><input type="search" id="assign-q" placeholder="Choisir un Pokémon…" aria-label="Chercher un Pokémon à assigner"></label>
          <div class="picker-results" id="assign-list"></div>
        </div>
      `);

      const form = box.querySelector('#lf');
      const lists = { prefixes: [...(l.prefixes || [])], suffixes: [...(l.suffixes || [])] };
      const drawTags = k => {
        const wrap = form.querySelector(`[data-list="${k}"]`);
        const input = wrap.querySelector('input');
        wrap.querySelectorAll('.badge').forEach(t => t.remove());
        lists[k].forEach((v, i) => input.insertAdjacentHTML('beforebegin', String(html`<span class="badge">${v}<button type="button" class="tag-x" data-rm="${k}:${i}" aria-label="Retirer ${v}">×</button></span>`)));
      };
      on(form, 'keydown', '[data-add]', (e, inp) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const v = inp.value.trim();
        if (v && !lists[inp.dataset.add].includes(v)) lists[inp.dataset.add].push(v);
        inp.value = '';
        drawTags(inp.dataset.add);
      });
      on(form, 'click', '[data-rm]', (_, b) => {
        const [k, i] = b.dataset.rm.split(':');
        lists[k].splice(Number(i), 1);
        drawTags(k);
      });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const fd = new FormData(form);
        // un préfixe tapé sans Entrée compte aussi
        form.querySelectorAll('[data-add]').forEach(inp => { const v = inp.value.trim(); if (v && !lists[inp.dataset.add].includes(v)) lists[inp.dataset.add].push(v); });
        await save(() => api.modifier('labels', { type: `eq.${l.type}` }, {
          name_fr: fd.get('name_fr').trim(), badge: fd.get('badge').trim() || null, color: fd.get('color'),
          category_id: fd.get('category_id') || null, enabled: fd.get('enabled') === 'on',
          prefixes: lists.prefixes, suffixes: lists.suffixes,
        }), 'Label enregistré');
      });
      on(box, 'click', '[data-del-label]', async () => {
        if (!await confirmer({ titre: `Supprimer le label « ${l.name_fr} » ?`, message: 'Ses cartes repartent sur la fiche de leur espèce.', libelle: 'Supprimer', danger: true })) return;
        await save(() => api.supprimer('labels', { type: `eq.${l.type}` }), 'Label supprimé');
        selected = null;
        history.replaceState(null, '', '#/labels');
        renderEditor();
      });
      on(box, 'click', '[data-unlink]', (_, b) => {
        const key = b.dataset.unlink;
        save(() => manualKeys.has(key)
          ? api.supprimer('pokemon_labels', { pokemon_key: `eq.${key}` })
          : api.enregistrer('pokemon_labels', { pokemon_key: key, label_type: null }, 'pokemon_key'), 'Forme détachée');
      });
      on(box, 'click', '[data-restore]', (_, b) => save(() => api.supprimer('pokemon_labels', { pokemon_key: `eq.${b.dataset.restore}` }), 'Détection automatique rétablie'));

      let seq = 0;
      box.querySelector('#assign-q').addEventListener('input', async e => {
        const mine = ++seq;
        const q = norm(e.target.value);
        const out = box.querySelector('#assign-list');
        if (q.length < 2) return setHtml(out, '');
        const rows = await api.lire('pokedex', { search: `ilike.*${q}*`, select: 'key,name_fr,dex,sprite,pokeapi_id,form_badge,form_color', order: 'sort_order', limit: 12 }).catch(() => []);
        if (mine !== seq) return;
        setHtml(out, html`${rows.map(p => html`
          <button type="button" class="picker-item" data-assign="${p.key}">
            <span class="tx-media">${spriteHtml(p, 'poke-img poke-img-sm')}</span>
            <span class="grow"><span class="picker-name">${p.name_fr} ${formBadge(p)}</span><span class="muted small">n°${String(p.dex).padStart(3, '0')}</span></span>
          </button>`)}`);
      });
      on(box, 'click', '[data-assign]', (_, b) => save(() => api.enregistrer('pokemon_labels', { pokemon_key: b.dataset.assign, label_type: l.type }, 'pokemon_key'), 'Label assigné'));
    }

    // chaque changement recalcule le rangement des cartes : long sur le Pi, un seul à la fois
    let saving = false;
    async function save(write, message) {
      if (saving) return notifier('Recalcul des fiches en cours, un instant…');
      saving = true;
      try {
        await write();
        await api.appeler('refresh_card_forms', {}, { delai: 180000 });
        notifier(`${message} · fiches recalculées`);
        await load();
        renderCats();
        renderTable();
        renderEditor();
      } catch (err) { notifierErreur(err); } finally { saving = false; }
    }

    function categoryForm(cat = null) {
      ouvrirModale({
        titre: cat ? 'Modifier la catégorie' : 'Nouvelle catégorie',
        largeur: 460,
        corps: html`
          <label class="field">Nom<input class="input" id="cf-name" value="${cat?.name || ''}" required></label>
          <label class="field">Dans la catégorie
            <select class="input" id="cf-parent">
              <option value="">Aucune (premier niveau)</option>
              ${cats.filter(c => !cat || !descendants(cat.id).includes(c.id)).map(c => html`<option value="${c.id}" ${c.id === (cat ? cat.parent_id : state.cat) ? 'selected' : ''}>${c.name}</option>`)}
            </select>
          </label>`,
        actions: [
          { libelle: 'Annuler' },
          { libelle: 'Enregistrer', principal: true, run: async el => {
            const row = { name: el.querySelector('#cf-name').value.trim(), parent_id: el.querySelector('#cf-parent').value || null };
            if (!row.name) { notifierErreur(new Error('Le nom est obligatoire')); return false; }
            try {
              if (cat) await api.modifier('label_categories', { id: `eq.${cat.id}` }, row);
              else state.cat = (await api.ajouter('label_categories', { id: `cat-${uid()}`, ...row })).id;
              await load();
              renderCats();
              renderTable();
            } catch (err) { notifierErreur(err); return false; }
          } },
        ],
      });
    }

    function labelForm() {
      ouvrirModale({
        titre: 'Nouveau label',
        largeur: 480,
        corps: html`
          <label class="field">Nom affiché<input class="input" id="nl-name" placeholder="Forme de Paldea" required></label>
          <label class="field">Identifiant<input class="input" id="nl-type" placeholder="paldea" pattern="[a-z0-9-]+"><span class="muted small">Le type de forme détecté dans PokéAPI (paldea, mega-x, gmax…) pour relier ses formes automatiquement.</span></label>`,
        actions: [
          { libelle: 'Annuler' },
          { libelle: 'Créer', principal: true, run: async el => {
            const name = el.querySelector('#nl-name').value.trim();
            const type = (el.querySelector('#nl-type').value.trim() || norm(name)).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            if (!name || !type) { notifierErreur(new Error('Nom obligatoire')); return false; }
            try {
              await api.ajouter('labels', {
                type, name_fr: name, enabled: true, prefixes: [], suffixes: [],
                category_id: cats.some(c => c.id === state.cat) ? state.cat : null,
              });
              selected = type;
              await save(async () => {}, 'Label créé');
            } catch (err) {
              notifierErreur(err.status === 409 ? new Error(`L’identifiant « ${type} » existe déjà`) : err);
              return false;
            }
          } },
        ],
      });
    }

    $('#lq').addEventListener('input', e => { state.q = e.target.value; renderTable(); });
    on(main, 'click', '[data-cat]', (_, b) => { state.cat = b.dataset.cat; renderCats(); renderTable(); });
    on(main, 'click', '[data-label]', (_, row) => {
      selected = row.dataset.label;
      history.replaceState(null, '', `#/labels/${encodeURIComponent(selected)}`);
      renderTable();
      renderEditor();
      if (matchMedia('(max-width: 1200px)').matches) $('#editor').scrollIntoView({ behavior: 'smooth' });
    });
    on(main, 'keydown', '[data-label]', (e, row) => { if (e.key === 'Enter') row.click(); });
    on(main, 'click', '[data-new-cat]', () => categoryForm());
    on(main, 'click', '[data-edit-cat]', () => categoryForm(cats.find(c => c.id === state.cat)));
    on(main, 'click', '[data-del-cat]', async () => {
      const cat = cats.find(c => c.id === state.cat);
      if (!await confirmer({ titre: `Supprimer « ${cat.name} » ?`, message: 'Ses labels et sous-catégories restent, sans catégorie.', libelle: 'Supprimer', danger: true })) return;
      try {
        await api.supprimer('label_categories', { id: `eq.${cat.id}` });
        state.cat = 'all';
        await load();
        renderCats();
        renderTable();
      } catch (err) { notifierErreur(err); }
    });
    on(main, 'click', '[data-new-label]', () => labelForm());

    try {
      await load();
    } catch (err) {
      return setHtml($('#table'), etatErreur('Impossible de charger les labels', err, 'data-recharger'));
    }
    if (selected) {
      const l = labels.find(x => x.type === selected);
      if (l?.category_id) state.cat = 'all';
    }
    renderCats();
    renderTable();
    renderEditor();
  },
};
