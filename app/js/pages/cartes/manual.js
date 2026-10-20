import { api } from '../../api.js';
import { html, setHtml, on } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { dropzone } from '../../ui/upload.js';
import { VARIANTS, norm, spriteHtml, formBadge } from '../../shared/sales.js';
import { CATEGORIES } from '../../shared/cards.js';

// Fiche Pokémon la plus probable d'après le nom de la carte : le nom de
// Pokémon le plus long contenu dans le nom (« Méga-Dracaufeu X » avant « Dracaufeu »)
async function guessPokemon(cardName) {
  const words = norm(cardName).split(/[\s'’-]+/).filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
  if (!words.length) return null;
  const rows = await api.list('pokedex', {
    select: 'key,name_fr,dex,sprite,pokeapi_id,form_badge,form_color,is_default',
    search: `ilike.*${words[0]}*`, limit: 30,
  }).catch(() => []);
  const n = norm(cardName);
  return rows.filter(p => n.includes(norm(p.name_fr))).sort((a, b) => b.name_fr.length - a.name_fr.length)[0] || null;
}

// Carte absente de TCGdex (promo, carte japonaise…). card = carte manuelle existante à modifier
export async function openManualCard({ card = null, name = '', onSaved } = {}) {
  const sets = await api.list('sets', { select: 'id,name,source', order: 'release_date.desc.nullslast' });
  const st = {
    image: card?.image || '',
    name: card?.name || name,
    set_id: card?.set_id || '',
    new_set_name: '',
    number: card?.number || '',
    category: card?.category || 'pokemon',
    rarity: card?.rarity || '',
    variants: card?.variants?.length ? [...card.variants] : ['normale'],
    cardmarket_url: card?.cardmarket_url_manual ? card.cardmarket_url : '',
    pokemon: card?.pokemon_key ? { key: card.pokemon_key, name_fr: card.pokemon_name, sprite: card.sprite, pokeapi_id: card.pokeapi_id, form_badge: card.form_badge, form_color: card.form_color } : null,
    pokemonAuto: !card,
    choosing: false,
  };

  const m = openModal({
    title: card ? 'Modifier la carte' : 'Carte absente de TCGdex',
    width: 760,
    body: html`
      ${card ? '' : html`<p class="muted" style="margin: -10px 0 0">Pour une promo, une carte japonaise ou une vieille carte que TCGdex n’a pas. Si elle y apparaît plus tard, tu pourras remplacer ta fiche par la sienne depuis la fiche carte, ventes comprises.</p>`}
      <div class="manual-grid">
        <div id="mc-photo"></div>
        <div class="form-grid" id="mc"></div>
      </div>`,
    actions: [{ label: 'Annuler' }, { label: card ? 'Enregistrer' : 'Créer la carte', primary: true, run: save }],
  });
  const root = m.el.querySelector('#mc');

  dropzone(m.el.querySelector('#mc-photo'), {
    value: st.image, folder: 'Cartes', label: 'Glisse une photo ici',
    onChange: p => { st.image = p; },
  });

  function render() {
    setHtml(root, html`
      <label class="field">Nom de la carte<input class="input" data-f="name" value="${st.name}" required></label>
      <div class="form-row">
        <label class="field grow">Extension
          <select class="select" data-f="set_id">
            <option value="">Choisir…</option>
            <option value="__new" ${st.set_id === '__new' ? 'selected' : ''}>+ Nouvelle extension…</option>
            ${sets.map(s => html`<option value="${s.id}" ${s.id === st.set_id ? 'selected' : ''}>${s.name}${s.source === 'manual' ? ' (à la main)' : ''}</option>`)}
          </select>
        </label>
        ${st.set_id === '__new' ? html`<label class="field grow">Nom de l’extension<input class="input" data-f="new_set_name" value="${st.new_set_name}" placeholder="Promos — tournoi local"></label>` : ''}
        <label class="field">Numéro<input class="input" data-f="number" value="${st.number}"></label>
      </div>
      <div class="form-row">
        <label class="field">Catégorie
          <select class="select" data-f="category">${CATEGORIES.map(c => html`<option value="${c.id}" ${c.id === st.category ? 'selected' : ''}>${c.label}</option>`)}</select>
        </label>
        <label class="field grow">Rareté<input class="input" data-f="rarity" value="${st.rarity}" placeholder="Promo, Holo rare…"></label>
      </div>
      <div class="field"><span>Variantes qui existent</span>
        <div class="chips">${VARIANTS.map(v => html`<button type="button" class="chip" data-variant="${v.id}" aria-pressed="${st.variants.includes(v.id)}">${v.label}</button>`)}</div>
      </div>
      <div id="mc-pokefield"></div>
      <label class="field">Lien Cardmarket (facultatif)<input class="input" type="url" data-f="cardmarket_url" value="${st.cardmarket_url}" placeholder="Sinon, un lien de recherche est créé"></label>
    `);
    renderPoke();
  }

  function renderPoke() {
    const box = root.querySelector('#mc-pokefield');
    if (st.category !== 'pokemon') return setHtml(box, '');
    setHtml(box, html`
        <div class="field"><span>Fiche Pokémon${st.pokemonAuto && st.pokemon ? ' trouvée d’après le nom' : ''}</span>
          ${st.choosing ? html`
            <label class="search"><input type="search" data-poke-q placeholder="Chercher un Pokémon ou une forme" aria-label="Chercher un Pokémon"></label>
            <div class="picker-results" id="mc-poke"></div>`
          : html`
            <div class="picked picked-sm">
              ${st.pokemon ? html`<span class="tx-media">${spriteHtml(st.pokemon, 'poke-img poke-img-sm')}</span><strong>${st.pokemon.name_fr} ${formBadge(st.pokemon)}</strong>` : html`<span class="muted">Aucune pour l’instant</span>`}
              <span class="grow"></span>
              <button type="button" class="btn btn-sm" data-choose>Changer</button>
              ${st.pokemon ? html`<button type="button" class="btn btn-sm btn-ghost" data-nopoke>Aucune</button>` : ''}
            </div>`}
        </div>`);
    if (st.choosing) box.querySelector('[data-poke-q]').focus();
  }

  let guessTimer;
  root.addEventListener('input', e => {
    const f = e.target.dataset.f;
    if (f) st[f] = e.target.value;
    if (f === 'name' && st.pokemonAuto) {
      clearTimeout(guessTimer);
      guessTimer = setTimeout(async () => {
        st.pokemon = await guessPokemon(st.name);
        if (!st.choosing) renderPoke();
      }, 400);
    }
    if (e.target.matches('[data-poke-q]')) searchPokemon(e.target.value);
  });
  root.addEventListener('change', e => { if (e.target.dataset.f === 'set_id' || e.target.dataset.f === 'category') render(); });
  on(root, 'click', '[data-variant]', (_, b) => {
    const v = b.dataset.variant;
    st.variants = st.variants.includes(v) ? st.variants.filter(x => x !== v) : [...st.variants, v];
    b.setAttribute('aria-pressed', String(st.variants.includes(v)));
  });
  on(root, 'click', '[data-choose]', () => { st.choosing = true; renderPoke(); });
  on(root, 'click', '[data-nopoke]', () => { st.pokemon = null; st.pokemonAuto = false; renderPoke(); });
  on(root, 'click', '[data-poke]', (_, b) => {
    st.pokemon = JSON.parse(b.dataset.poke);
    st.pokemonAuto = false;
    st.choosing = false;
    renderPoke();
  });

  let pokeSeq = 0;
  async function searchPokemon(q) {
    const mine = ++pokeSeq;
    const box = root.querySelector('#mc-poke');
    if (norm(q).length < 2) return setHtml(box, '');
    const rows = await api.list('pokedex', {
      select: 'key,name_fr,dex,sprite,pokeapi_id,form_badge,form_color', search: `ilike.*${norm(q)}*`, order: 'sort_order', limit: 20,
    }).catch(() => []);
    if (mine !== pokeSeq) return;
    setHtml(box, html`${rows.map(p => html`
      <button type="button" class="picker-item" data-poke="${JSON.stringify(p)}">
        <span class="tx-media">${spriteHtml(p, 'poke-img poke-img-sm')}</span>
        <span class="grow"><span class="picker-name">${p.name_fr} ${formBadge(p)}</span><span class="muted small">n°${String(p.dex).padStart(3, '0')}</span></span>
      </button>`)}`);
  }

  async function save() {
    try {
      if (!st.name.trim()) throw new Error('Le nom de la carte est obligatoire');
      if (!st.set_id) throw new Error('Choisis l’extension');
      const id = await api.rpc('save_manual_card', {
        carte: {
          id: card?.id || null,
          set_id: st.set_id === '__new' ? null : st.set_id,
          new_set_name: st.set_id === '__new' ? st.new_set_name : null,
          number: st.number, name: st.name, category: st.category, rarity: st.rarity,
          variants: st.variants, image: st.image, cardmarket_url: st.cardmarket_url,
          pokemon_key: st.category === 'pokemon' ? st.pokemon?.key || null : null,
        },
      });
      toast(card ? 'Carte enregistrée' : 'Carte créée');
      onSaved?.(id);
    } catch (err) {
      toastError(err);
      return false;
    }
  }

  render();
  if (st.pokemonAuto && st.name) {
    st.pokemon = await guessPokemon(st.name);
    renderPoke();
  }
}
