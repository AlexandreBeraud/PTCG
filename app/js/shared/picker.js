import { api } from '../api.js';
import { imageUrl } from '../nas.js';
import { html, setHtml, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { toastError } from '../ui/toast.js';
import { cardImage, spriteHtml, formBadge, setSymbolHtml, norm, inList } from './sales.js';

// Choix d'une carte en deux temps : le Pokémon (ou le personnage, l'objet…),
// puis la carte parmi toutes les siennes. L'onglet « Recherche » garde la
// recherche directe : « dracaufeu 013 », « goupix nuit noire »…
// cardPicker(el, { onPick(card), onManual(nom), autofocus })

const TABS = [
  { id: 'pokemon', label: 'Pokémon', search: 'Chercher un Pokémon…', one: 'Pokémon' },
  { id: 'personnage', label: 'Personnages', search: 'Chercher un personnage (Cynthia, N…)', one: 'personnage', fam: null },
  { id: 'objet', label: 'Objets', search: 'Chercher un objet (Poké Ball…)', one: 'objet', fam: ['objet', 'outil'] },
  { id: 'lieu', label: 'Lieux', search: 'Chercher un lieu (stade)', one: 'lieu', fam: ['stade'] },
  { id: 'energie', label: 'Énergies', search: 'Chercher une énergie', one: 'énergie', fam: ['energie'] },
  { id: 'cartes', label: 'Recherche', search: 'Nom de la carte, numéro, extension…' },
];
const CARD_SELECT = 'id,name,number,set_id,set_name,set_symbol,set_count,image,variants,rarity,lang,source,price_trend,price_low,price_low_holo,cardmarket_url,en_stock,release_date,number_sort,form_badge,form_color';

let lastTab = 'pokemon';

const entityImage = src => (!src ? '' : /tcgdex|pokemontcg/.test(src) ? cardImage(src) : imageUrl(src, 'thumb'));

export function cardPicker(el, { onPick, onManual, autofocus = true } = {}) {
  const st = { tab: lastTab, q: '', entity: null, entities: [], cards: [], results: [] };
  let timer = null;
  let seq = 0;

  setHtml(el, html`
    <div class="picker">
      <div class="picker-tabs" role="tablist" aria-label="Type de carte">
        ${TABS.map(t => html`<button type="button" role="tab" class="chip" data-tab="${t.id}" aria-selected="${t.id === st.tab}">${t.label}</button>`)}
      </div>
      <div class="picker-head" hidden></div>
      <label class="search">
        ${icon('search')}
        <input type="search" aria-label="Chercher" autocomplete="off">
      </label>
      <div class="picker-body" aria-live="polite"></div>
      ${onManual ? html`<button type="button" class="link small" data-manual>Carte introuvable ? L’ajouter à la main</button>` : ''}
    </div>
  `);
  const input = el.querySelector('input');
  const body = el.querySelector('.picker-body');
  const head = el.querySelector('.picker-head');
  const tab = () => TABS.find(t => t.id === st.tab);

  const note = text => setHtml(body, html`<p class="muted small picker-note">${text}</p>`);

  function setPlaceholder() {
    input.placeholder = st.entity ? 'Filtrer ses cartes : extension, numéro…' : tab().search;
  }

  // ── 1. Pokémon, personnages… ──
  async function loadEntities() {
    const mine = ++seq;
    const q = input.value.trim();
    note('Recherche…');
    try {
      const rows = await api.rpc('picker_entities', { kind: st.tab, q: q || null, lim: 48 });
      if (mine !== seq) return;
      st.entities = rows || [];
      renderEntities(q);
    } catch (err) {
      if (mine === seq) note(err.message);
    }
  }

  function renderEntities(q) {
    const t = tab();
    const exact = st.entities.some(e => e.type === 'entite' && norm(e.name) === norm(q));
    const create = t.id !== 'pokemon' && q.length >= 2 && !exact
      ? html`<button type="button" class="ent ent-new" data-create>+ Créer la fiche ${t.one} « ${q} »<span class="muted small">regroupe toutes les cartes dont le nom contient « ${q} »</span></button>`
      : '';
    if (!st.entities.length) {
      setHtml(body, html`
        <p class="muted small picker-note">${q ? `Aucun ${t.one} pour « ${q} »` : t.id === 'pokemon' ? 'Tape le nom du Pokémon.' : `Tape le nom d’un ${t.one}.`}</p>
        ${create ? html`<div class="ent-grid">${create}</div>` : ''}`);
      return;
    }
    setHtml(body, html`
      ${!q ? html`<p class="muted small picker-note">${t.id === 'pokemon' ? 'Ceux que tu vends ou achètes le plus' : 'Tes fiches, puis les cartes que tu vends ou achètes le plus'}</p>` : ''}
      <div class="ent-grid">
        ${st.entities.map((e, i) => html`
          <button type="button" class="ent" data-ent="${i}">
            <span class="ent-img">${e.type === 'pokemon' ? spriteHtml(e, 'poke-img') : e.image ? html`<img src="${entityImage(e.image)}" alt="" loading="lazy" data-hide-on-error>` : ''}</span>
            <span class="ent-name">${e.name} ${formBadge(e)}</span>
            <span class="muted small">${e.cartes} carte${e.cartes > 1 ? 's' : ''}${Number(e.en_stock) ? html` · <span class="pos">${e.en_stock} en stock</span>` : ''}</span>
          </button>`)}
        ${create}
      </div>`);
  }

  // ── 2. ses cartes ──
  async function openEntity(e) {
    st.entity = e;
    input.value = '';
    setPlaceholder();
    setHtml(head, html`
      <button type="button" class="btn btn-sm btn-ghost" data-back>← ${tab().label}</button>
      <span class="ent-img ent-img-sm">${e.type === 'pokemon' ? spriteHtml(e, 'poke-img') : e.image ? html`<img src="${entityImage(e.image)}" alt="" data-hide-on-error>` : ''}</span>
      <strong>${e.name}</strong> ${formBadge(e)}`);
    head.hidden = false;
    note('Chargement des cartes…');
    const mine = ++seq;
    const order = 'release_date.desc.nullslast,set_id,number_sort.nullslast,number';
    const fam = tab().fam;
    let p;
    if (e.type === 'pokemon') p = api.list('fiche_cards', { fiche: `eq.${e.key}`, select: CARD_SELECT, order });
    else {
      const params = { select: CARD_SELECT, order, limit: 400 };
      params.name_tokens = e.type === 'entite' ? `like.*${e.tokens}*` : `eq.${e.tokens}`;
      if (fam) params.famille = inList(fam);
      else if (e.type === 'nom') params.famille = 'eq.supporter';
      p = api.list('card_list', params);
    }
    try {
      const rows = await p;
      if (mine !== seq) return;
      st.cards = rows || [];
      renderCards();
    } catch (err) {
      if (mine === seq) note(err.message);
    }
    if (autofocus) input.focus();
  }

  function renderCards() {
    const words = norm(input.value).split(/\s+/).filter(Boolean);
    const shown = st.cards.filter(c => {
      const text = norm(`${c.set_name} ${c.set_id} ${c.number} ${String(c.number || '').replace(/^0+/, '')} ${c.name}`);
      return words.every(w => text.includes(w));
    });
    st.results = shown;
    if (!st.cards.length) return note('Aucune carte pour l’instant.');
    if (!shown.length) return note('Aucune carte pour ce filtre.');
    setHtml(body, html`
      <p class="muted small picker-note">${shown.length} carte${shown.length > 1 ? 's' : ''}, les plus récentes d’abord</p>
      <div class="pick-grid">${shown.map((c, i) => html`
        <button type="button" class="pick-card" data-card="${i}" title="${c.name} · ${c.set_name} ${c.number || ''}">
          <span class="pick-img">${c.image ? html`<img src="${cardImage(c.image)}" alt="" loading="lazy" data-hide-on-error>` : html`<span class="thumb-empty">${c.name}</span>`}
            ${Number(c.en_stock) ? html`<span class="card-stock">Stock ${c.en_stock}</span>` : ''}
            ${c.lang === 'en' ? html`<span class="card-lang">EN</span>` : ''}</span>
          <span class="pick-meta">${setSymbolHtml(c)}<span class="small">${c.number || '—'}</span></span>
          <span class="pick-name small">${c.name}</span>
        </button>`)}
      </div>`);
  }

  // ── recherche directe ──
  async function searchCards() {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { st.results = []; return note('Tape au moins deux lettres.'); }
    note('Recherche…');
    try {
      const rows = await api.rpc('search_cards', { q, lim: 40 });
      if (mine !== seq) return;
      st.results = rows || [];
      if (st.results.length) {
        return setHtml(body, html`<div class="picker-results" role="listbox" aria-label="Cartes trouvées">${st.results.map((c, i) => html`
          <button type="button" class="picker-item" role="option" data-card="${i}">
            <span class="thumb thumb-xs">${c.image ? html`<img src="${cardImage(c.image)}" alt="" loading="lazy" data-hide-on-error>` : ''}</span>
            <span class="grow">
              <span class="picker-name">${c.name}${c.lang === 'en' ? html` <span class="tag">EN</span>` : ''}</span>
              <span class="muted small">${c.set_name} · ${c.number || '—'}${c.rarity ? ` · ${c.rarity}` : ''}</span>
            </span>
            ${Number(c.en_stock) ? html`<span class="tag tag-info">${c.en_stock} en stock</span>` : ''}
          </button>`)}</div>`);
      }
      note(`Aucune carte pour « ${q} »`);
      const sugg = await api.rpc('suggest_names', { q, lim: 3 }).catch(() => []);
      if (mine === seq && sugg.length) {
        body.insertAdjacentHTML('beforeend', String(html`<p class="small picker-note">Tu voulais dire ${sugg.map((s, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-suggest="${s.name}">${s.name}</button>`)} ?</p>`));
      }
    } catch (err) {
      if (mine === seq) note(err.message);
    }
  }

  function refresh() {
    if (st.tab === 'cartes') return searchCards();
    if (st.entity) return renderCards();
    return loadEntities();
  }

  function selectTab(id) {
    st.tab = lastTab = id;
    st.entity = null;
    head.hidden = true;
    input.value = '';
    el.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    setPlaceholder();
    refresh();
    input.focus();
  }

  async function createEntity() {
    const name = input.value.trim();
    try {
      const row = await api.insert('entites', { kind: st.tab, name });
      const rows = await api.rpc('picker_entities', { kind: st.tab, q: name, lim: 48 });
      const e = (rows || []).find(x => x.key === `e:${row.id}`);
      if (e) openEntity(e);
    } catch (err) {
      toastError(err.status === 409 ? new Error(`La fiche « ${name} » existe déjà`) : err);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    // filtrer les cartes d'un Pokémon est immédiat, le reste interroge le Pi
    if (st.entity) return renderCards();
    timer = setTimeout(refresh, 250);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape' && st.entity) { e.stopPropagation(); selectTab(st.tab); }
    if (e.key === 'ArrowDown') { e.preventDefault(); body.querySelector('button')?.focus(); }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (st.tab === 'cartes' || st.entity) { if (st.results[0]) onPick?.(st.results[0]); }
    else if (st.entities[0]) openEntity(st.entities[0]);
  });
  on(el, 'click', '[data-tab]', (_, b) => selectTab(b.dataset.tab));
  on(el, 'click', '[data-back]', () => selectTab(st.tab));
  on(body, 'click', '[data-ent]', (_, b) => openEntity(st.entities[Number(b.dataset.ent)]));
  on(body, 'click', '[data-create]', () => createEntity());
  on(body, 'click', '[data-card]', (_, b) => onPick?.(st.results[Number(b.dataset.card)]));
  on(body, 'click', '[data-suggest]', (_, b) => { input.value = b.dataset.suggest; searchCards(); input.focus(); });
  if (onManual) el.querySelector('[data-manual]').addEventListener('click', () => onManual(st.tab === 'cartes' ? input.value.trim() : ''));

  setPlaceholder();
  refresh();
  if (autofocus) setTimeout(() => input.focus(), 0);
  return { focus: () => input.focus(), clear() { selectTab(st.tab); } };
}
