import { api } from '../../api.js';
import { imageUrl } from '../../nas.js';
import { html, setHtml, on, reloadPage, errorHtml } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { fmtDate, setSymbolHtml } from '../../shared/sales.js';
import { askImage } from '../../ui/upload.js';
import { forgetSets } from '../../shared/sets.js';
import { cardTile } from '../../shared/cards.js';

const FILTERS = [
  { id: 'all', label: 'Toutes', test: () => true },
  { id: 'stock', label: 'En stock', test: c => Number(c.en_stock) > 0 },
  { id: 'vendues', label: 'Déjà vendues', test: c => Number(c.vendues) > 0 },
  { id: 'pokemon', label: 'Pokémon', test: c => c.category === 'pokemon' },
  { id: 'trainer', label: 'Dresseurs', test: c => c.category === 'trainer' },
  { id: 'energy', label: 'Énergies', test: c => c.category === 'energy' },
  { id: 'secretes', label: 'Secrètes', test: c => c.secrete },
];

const byNumber = (a, b) => String(a.number ?? '').localeCompare(String(b.number ?? ''), 'fr', { numeric: true });
const SORTS = [
  { id: 'number', label: 'Numéro', cmp: byNumber },
  { id: 'name', label: 'Nom (A → Z)', cmp: (a, b) => a.name.localeCompare(b.name, 'fr') || byNumber(a, b) },
  { id: 'stock', label: 'En stock d’abord', cmp: (a, b) => (Number(b.en_stock) > 0) - (Number(a.en_stock) > 0) || byNumber(a, b) },
  { id: 'price', label: 'Prix le plus bas, décroissant', cmp: (a, b) => Number(b.price_low ?? -1) - Number(a.price_low ?? -1) || byNumber(a, b) },
];
let sortId = 'number';

export async function renderSet(main, id) {
  let filter = 'all';
  setHtml(main, html`<p class="muted">Chargement…</p>`);

  let set, cards, children;
  try {
    [set, cards, children] = await Promise.all([
      api.one('set_list', { id: `eq.${id}` }),
      api.list('card_list', { set_id: `eq.${id}` }),
      api.list('set_list', { parent_id: `eq.${id}`, select: 'id,name' }),
    ]);
  } catch (err) {
    return setHtml(main, errorHtml('Impossible de charger l’extension', err));
  }
  if (!set) return setHtml(main, html`<div class="empty"><h2>Extension introuvable</h2><a href="#/extensions">Toutes les extensions</a></div>`);

  // les sous-extensions TCGdex (galerie, Trainer Gallery…) s'affichent dans leur extension
  const sections = [{ id: set.id, name: 'Cartes de l’extension', cards: cards.sort(byNumber) }];
  for (const ch of children) {
    const list = await api.list('card_list', { set_id: `eq.${ch.id}` }).catch(() => []);
    sections.push({ id: ch.id, name: ch.name, cards: list.sort(byNumber) });
  }
  const all = sections.flatMap(s => s.cards);
  const total = all.length;

  const official = set.card_count;
  const extra = set.card_count_total && official ? set.card_count_total - official : 0;
  document.title = `${set.name} · PTCG`;

  setHtml(main, html`
    <a class="back-crumb" href="#/extensions">← Extensions</a>
    <header class="set-header" style="${set.color || set.serie_color ? `--set-color: ${set.color || set.serie_color}` : ''}">
      <span class="set-logo set-logo-lg">${set.logo ? html`<img src="${imageUrl(set.logo)}" alt="" data-hide-on-error>` : html`<span class="set-code">${set.id.toUpperCase()}</span>`}</span>
      <div class="grow">
        <p class="muted small set-meta" style="margin: 0">${setSymbolHtml({ set_id: set.id, set_symbol: set.symbol, set_name: set.name })}${set.id.toUpperCase()}${set.parent_id ? html` · fait partie de <a href="#/extensions/${encodeURIComponent(set.parent_id)}">${set.parent_id.toUpperCase()}</a>` : ''}</p>
        <h1>${set.name}</h1>
        <p class="muted" style="margin: 4px 0 0">
          ${[set.serie_name, set.release_date ? `sortie le ${fmtDate(set.release_date)}` : '',
            official ? `${official} cartes${extra > 0 ? ` + ${extra} secrètes` : ''}` : `${total} cartes`,
            `${set.en_stock} en stock, ${set.vendues} vendues`].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button type="button" class="btn" data-custom>Personnaliser</button>
    </header>
    ${set.lang === 'en' ? html`
      <div class="banner banner-warn">
        <strong>Pas encore en VF sur TCGdex : données en anglais en attendant</strong>
        <span class="small">Les noms des Pokémon sont déjà traduits, les Dresseurs restent en anglais. Le catalogue vérifie chaque nuit et passe tout en VF dès que possible, sans casser tes ventes.</span>
      </div>` : ''}
    ${set.source === 'manual' ? html`<div class="banner"><span class="small">Extension créée à la main pour des cartes absentes de TCGdex.</span></div>` : ''}
    <div class="toolbar">
      <div class="chips grow" id="filters" role="group" aria-label="Filtre"></div>
      <select class="select select-auto" id="sort" aria-label="Tri">${SORTS.map(o => html`<option value="${o.id}" ${o.id === sortId ? 'selected' : ''}>${o.label}</option>`)}</select>
    </div>
    <div id="cards"></div>
  `);
  const $ = s => main.querySelector(s);

  function render() {
    const test = FILTERS.find(f => f.id === filter).test;
    setHtml($('#filters'), html`${FILTERS.map(f => {
      const n = all.filter(f.test).length;
      return f.id === 'all' || n ? html`<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${filter === f.id}">${f.label}<span class="n">${n}</span></button>` : '';
    })}`);
    const cmp = SORTS.find(o => o.id === sortId).cmp;
    const blocks = sections.map(s => ({ ...s, shown: s.cards.filter(test).sort(cmp) })).filter(s => s.shown.length);
    setHtml($('#cards'), blocks.length ? html`${blocks.map(s => html`
      ${sections.length > 1 ? html`<div class="serie-head"><h2>${s.name}</h2><span class="muted small">${s.shown.length} cartes</span></div>` : ''}
      <div class="card-grid">${s.shown.map(c => cardTile(c))}</div>`)}`
      : html`<div class="empty"><h2>${total ? 'Aucune carte pour ce filtre' : 'Les cartes arrivent avec le prochain passage du catalogue'}</h2></div>`);
  }

  on(main, 'click', '[data-filter]', (_, b) => { filter = b.dataset.filter; render(); });
  on(main, 'change', '#sort', (_, el) => { sortId = el.value; render(); });
  on(main, 'click', '[data-custom]', () => customize(set, reloadPage));
  render();
}

// Couleur, masquage, images et code Cardmarket de l'extension
function customize(set, done) {
  const m = openModal({
    title: `Personnaliser ${set.name}`,
    width: 520,
    body: html`
      <div class="field"><span>Images</span>
        <div class="set-images">
          <button type="button" class="set-image-btn" data-set-image="logo">
            <span class="set-logo">${set.logo ? html`<img src="${imageUrl(set.logo)}" alt="" data-hide-on-error>` : html`<span class="set-code">${set.id.toUpperCase()}</span>`}</span>
            <span class="small">Changer le logo</span>
          </button>
          <button type="button" class="set-image-btn" data-set-image="symbol">
            ${setSymbolHtml({ set_id: set.id, set_symbol: set.symbol, set_name: set.name })}
            <span class="small">Changer le sigle</span>
          </button>
        </div>
      </div>
      <label class="field">Couleur
        <span class="input-group">
          <input class="input input-color" type="color" id="c-color" value="${set.color || '#FF5E5B'}">
          <label class="check-inline"><input type="checkbox" id="c-nocolor" ${set.color ? '' : 'checked'}> Aucune</label>
        </span>
      </label>
      <label class="check-inline"><input type="checkbox" id="c-hidden" ${set.hidden ? 'checked' : ''}> Masquer cette extension de la liste</label>
      <label class="field">Code Cardmarket de l’extension
        <input class="input" id="c-code" value="${set.cardmarket_code || ''}" placeholder="PFL, SVI, MEW…" maxlength="12" autocapitalize="characters">
        <span class="muted small">Le code qui suit le nom dans les liens Cardmarket (…-PFL013). Les liens des cartes sont recalculés aussitôt, sauf ceux corrigés à la main.</span>
      </label>`,
    actions: [
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: async el => {
        try {
          const color = el.querySelector('#c-nocolor').checked ? null : el.querySelector('#c-color').value;
          await api.upsert('set_prefs', { kind: 'set', target_id: set.id, color, hidden: el.querySelector('#c-hidden').checked, sort_order: set.sort_order ?? null }, 'kind,target_id');
          const code = el.querySelector('#c-code').value.trim();
          if (code !== (set.cardmarket_code || '')) {
            const n = await api.rpc('set_cardmarket_code', { set_id: set.id, code });
            toast(`${n} lien${n > 1 ? 's' : ''} Cardmarket recalculé${n > 1 ? 's' : ''}`);
          } else toast('Extension enregistrée');
          done();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });

  // l'image se choisit dans sa propre fenêtre : on ferme celle-ci d'abord
  on(m.el, 'click', '[data-set-image]', async (_, b) => {
    const quoi = b.dataset.setImage;
    m.close();
    // l'image mise à la main, s'il y en a une, peut être retirée (retour à celle du catalogue)
    const mine = await api.one('sets', { id: `eq.${set.id}`, select: 'logo_manual,symbol_manual' }).catch(() => null);
    const current = (quoi === 'logo' ? mine?.logo_manual : mine?.symbol_manual) || '';
    const value = await askImage({
      title: quoi === 'logo' ? `Logo de ${set.name}` : `Sigle de ${set.name}`,
      value: current,
      folder: 'Extensions',
      hint: quoi === 'symbol' ? 'Une petite icône, de préférence sur fond transparent.' : '',
      removable: !!current,
    });
    if (value === null) return;
    try {
      await api.rpc('set_set_image', { set_id: set.id, quoi, url: value });
      forgetSets();
      toast(quoi === 'logo' ? 'Logo enregistré' : 'Sigle enregistré');
      done();
    } catch (err) { toastError(err); }
  });
}
