import { api } from '../../api.js';
import { html, setHtml, on, eur, reloadPage, errorHtml } from '../../ui/dom.js';
import { openModal, confirmModal } from '../../ui/modal.js';
import { toast, toastError } from '../../ui/toast.js';
import { cardPicker } from '../../shared/picker.js';
import { dropzone } from '../../ui/upload.js';
import { store } from '../../shared/store.js';
import {
  cardImage, spriteHtml, formBadge, variantLabel, conditionShort, venteStatusTag, fmtDate, norm, priceText, inList,
} from '../../shared/sales.js';
import { cardNumber, cardFoil, familleLabel, variantsText, cardTrail } from '../../shared/cards.js';

const FICHE_PAR = {
  label: l => l ? `envoyée ici par le label « ${l} »` : 'envoyée ici par un label',
  espece: () => 'rangée sur l’espèce d’après son numéro de Pokédex',
  correction: () => 'fiche corrigée à la main',
};

export async function renderCard(main, id) {
  setHtml(main, html`<p class="muted">Chargement…</p>`);
  let c, fiches, lines, settings;
  try {
    [c, fiches, lines, settings] = await Promise.all([
      api.one('card_list', { id: `eq.${id}` }),
      api.list('card_forms', { card_id: `eq.${id}` }),
      api.list('transaction_list', { card_id: `eq.${id}`, order: 'day.desc,created_at.desc' }),
      store.settings().catch(() => null),
    ]);
  } catch (err) {
    return setHtml(main, errorHtml('Impossible de charger la carte', err));
  }
  if (!c) return setHtml(main, html`<div class="empty"><h2>Carte introuvable</h2><a href="#/cartes">Toutes les cartes</a></div>`);
  document.title = `${c.name} · PTCG`;

  const pokemons = fiches.length
    ? await api.list('pokedex', { key: inList(fiches.map(f => f.pokemon_key)), select: 'key,name_fr,dex,sprite,pokeapi_id,form_badge,form_color,label_name,is_default' })
    : [];
  const stock = lines.filter(l => l.direction === 'vente' && l.status !== 'vendue');
  const history = lines.filter(l => !(l.direction === 'vente' && l.status !== 'vendue'));
  const manual = c.source === 'manual';
  const big = c.image && /assets\.tcgdex\.net/.test(c.image) ? cardImage(c.image, 'high') : cardImage(c.image, 'big');

  const priceRows = [['Prix le plus bas', c.price_low], ['Plus bas holo/reverse', c.price_low_holo]].filter(([, v]) => v != null);
  const imageNote = { manuelle: 'Image ajoutée à la main', secours: 'Image de pokemontcg.io (TCGdex n’en a pas)' }[c.image_source] || '';

  // retour vers la liste d'où vient la carte, sinon vers son extension
  const nav = cardTrail(c.id);
  const step = (to, label, sym) => (to
    ? html`<a class="btn btn-ghost btn-sm card-step" href="#/cartes/${encodeURIComponent(to)}" data-step aria-label="${label}" title="${label}">${sym}</a>`
    : html`<span class="btn btn-ghost btn-sm card-step" aria-disabled="true">${sym}</span>`);

  setHtml(main, html`
    <div class="card-nav">
      ${nav ? html`<a class="back-crumb" href="${nav.back}">← ${nav.label}</a>` : html`<a class="back-crumb" href="#/extensions/${encodeURIComponent(c.set_id)}">← ${c.set_name}</a>`}
      ${nav && nav.total > 1 ? html`
        <span class="card-steps">
          ${step(nav.prev, 'Carte précédente (←)', '‹')}
          <span class="muted small">${nav.pos} / ${nav.total}</span>
          ${step(nav.next, 'Carte suivante (→)', '›')}
        </span>` : ''}
    </div>
    <div class="card-page">
      <div class="card-visual">
        <span class="card-big ${cardFoil(c)}">${big ? html`<img src="${big}" alt="${c.name}" data-hide-on-error>` : html`<span class="thumb-empty">Pas d’image</span>`}</span>
        <p class="muted small">${imageNote ? `${imageNote} · ` : ''}Reflet blanc pour les holo, arc-en-ciel pour les reverse, au survol</p>
        ${!c.image || c.image_source !== 'tcgdex' ? html`<button type="button" class="btn btn-sm" data-image>${c.image_source === 'manuelle' ? 'Changer l’image' : 'Ajouter une image'}</button>` : ''}
      </div>
      <div class="card-info">
        <p class="muted" style="margin: 0"><a href="#/extensions/${encodeURIComponent(c.set_id)}">${c.set_name}</a> · ${cardNumber(c)}</p>
        <h1 class="card-title">${c.name} ${formBadge(c)}</h1>
        <div class="chips-static">
          ${c.famille ? html`<span class="tag">${familleLabel(c.famille)}</span>` : ''}
          ${c.subtype && c.category !== 'trainer' ? html`<span class="tag">${c.subtype}</span>` : ''}
          ${c.rarity ? html`<span class="tag">${c.rarity}</span>` : ''}
          ${c.lang === 'en' ? html`<span class="tag tag-warn">Données en anglais</span>` : ''}
          ${manual ? html`<span class="tag tag-info">Ajoutée à la main</span>` : ''}
        </div>
        <p class="small" style="margin: 0">Existe en : <strong>${variantsText(c)}</strong></p>

        ${c.category === 'pokemon' ? html`
          <section class="info-block">
            <h2>Fiche Pokémon</h2>
            ${pokemons.length ? html`${fiches.map(f => {
              const p = pokemons.find(x => x.key === f.pokemon_key);
              if (!p) return '';
              return html`
                <a class="fiche-link" href="#/pokedex/${encodeURIComponent(p.key)}">
                  <span class="tx-media">${spriteHtml(p, 'poke-img poke-img-sm')}</span>
                  <span class="grow"><strong>${p.name_fr} ${formBadge(p)}</strong>
                    <span class="muted small">n°${String(p.dex).padStart(3, '0')} · ${FICHE_PAR[f.source]?.(p.label_name) || ''}</span></span>
                </a>`;
            })}` : html`<p class="muted small" style="margin: 0">Rangée sur aucune fiche (numéro de Pokédex absent).</p>`}
            <div><button type="button" class="btn btn-sm btn-ghost" data-fix>Corriger la fiche Pokémon</button></div>
          </section>` : ''}

        <section class="info-block">
          <h2>Cardmarket</h2>
          ${c.cardmarket_url ? html`
            <a class="cm-link small" href="${c.cardmarket_url}" target="_blank" rel="noopener">${c.cardmarket_url.replace(/^https:\/\/www\./, '')}</a>` : html`<p class="muted small" style="margin: 0">Pas encore de lien.</p>`}
          <p class="muted small" style="margin: 0">${c.cardmarket_url_manual ? 'Lien corrigé à la main' : /\/Search\?/.test(c.cardmarket_url || '') ? 'Lien de recherche : ajoute le code Cardmarket de l’extension pour un lien direct' : 'Lien généré automatiquement'}</p>
          <div><button type="button" class="btn btn-sm btn-ghost" data-cm>Modifier le lien</button></div>
          ${priceRows.length ? html`
            <div class="kpis kpis-2">${priceRows.map(([label, v]) => html`<div class="kpi"><span class="muted small">${label}</span><strong>${eur(v)}</strong></div>`)}</div>
            <p class="muted small" style="margin: 0">Prix fournis par TCGdex${c.prices_updated_at ? `, relevés le ${fmtDate(c.prices_updated_at)}` : ''}</p>` : html`
            <p class="muted small" style="margin: 0">Prix relevés chaque nuit dès que la carte est dans tes ventes ou tes achats.</p>`}
        </section>

        <section class="info-block">
          <div class="panel-head"><h2>Mon stock</h2><span class="muted small">${stock.reduce((n, l) => n + l.qty, 0)} exemplaire(s)</span></div>
          ${stock.length ? html`<div class="mini-list">${stock.map(l => html`
            <button type="button" class="todo-item" data-line="${l.id}">
              <span class="grow"><strong>${[variantLabel(l.variant), conditionShort(l.condition), l.lang, l.qty > 1 ? `×${l.qty}` : ''].filter(Boolean).join(' · ')}</strong>
                <span class="muted small">${l.from_id ? 'Mise en stock depuis un achat' : 'Ajoutée'} le ${fmtDate(l.created_at)}</span></span>
              ${venteStatusTag(l.status)}
              <span class="price">${priceText(l, eur)}</span>
            </button>`)}</div>` : html`<p class="muted small" style="margin: 0">Aucun exemplaire en stock.</p>`}
          <div class="row-actions">
            <button type="button" class="btn btn-sm btn-primary" data-sell="en_vente">Mettre en vente</button>
            <button type="button" class="btn btn-sm" data-sell="a_mettre">Ajouter au stock</button>
          </div>
        </section>

        <section class="info-block">
          <h2>Historique</h2>
          ${history.length ? html`<div class="mini-list">${history.map(l => html`
            <button type="button" class="todo-item" data-line="${l.id}">
              <span class="tag ${l.direction === 'vente' ? 'tag-ok' : 'tag-danger'}">${l.direction === 'vente' ? 'Vente' : 'Achat'}</span>
              <span class="grow"><strong>${l.direction === 'vente' ? `Vendue${l.contact ? ` à ${l.contact}` : ''}` : `Achetée${l.contact ? ` chez ${l.contact}` : ''}`}</strong>
                <span class="muted small">${[fmtDate(l.day), variantLabel(l.variant), conditionShort(l.condition), l.qty > 1 ? `×${l.qty}` : '', l.for_account ? `pour ${l.for_account}` : ''].filter(Boolean).join(' · ')}</span></span>
              <span class="price">${eur(l.total)}</span>
            </button>`)}</div>` : html`<p class="muted small" style="margin: 0">Jamais vendue ni achetée.</p>`}
        </section>

        <section class="info-block">
          <h2>Données</h2>
          <p class="small" style="margin: 0">${manual ? 'Carte ajoutée à la main' : `TCGdex, ${c.lang === 'en' ? 'en anglais en attendant la VF' : 'en VF'}`}${c.updated_at ? ` · mise à jour le ${fmtDate(c.updated_at)}` : ''}${c.illustrator ? ` · illustrée par ${c.illustrator}` : ''}</p>
          ${manual ? html`
            <div id="lookalikes"></div>
            <div class="row-actions">
              <button type="button" class="btn btn-sm" data-edit-manual>Modifier la carte</button>
              <button type="button" class="btn btn-sm" data-replace>Remplacer par une carte TCGdex</button>
              ${!lines.length ? html`<button type="button" class="btn btn-sm btn-danger" data-delete-manual>Supprimer</button>` : ''}
            </div>` : ''}
        </section>
      </div>
    </div>
  `);

  const preset = { card: { ...c }, status: 'en_vente' };
  // d'une carte à l'autre sans empiler l'historique : le retour du navigateur ramène à la liste
  on(main, 'click', '[data-step]', (e, a) => { e.preventDefault(); location.replace(a.getAttribute('href')); });
  const onKey = e => {
    if (!main.isConnected) return document.removeEventListener('keydown', onKey);
    if (!nav || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('.modal-scrim')) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    const to = e.key === 'ArrowLeft' ? nav.prev : e.key === 'ArrowRight' ? nav.next : null;
    if (to) location.replace(`#/cartes/${encodeURIComponent(to)}`);
  };
  document.addEventListener('keydown', onKey);

  on(main, 'click', '[data-sell]', async (_, b) => {
    const { openLineForm } = await import('../ventes/line-form.js');
    openLineForm({ direction: 'vente', preset: { ...preset, status: b.dataset.sell }, onSaved: reloadPage }).catch(toastError);
  });
  on(main, 'click', '[data-line]', async (_, b) => {
    const line = lines.find(l => l.id === b.dataset.line);
    const { openLineForm } = await import('../ventes/line-form.js');
    openLineForm({ direction: line.direction, line, onSaved: reloadPage }).catch(toastError);
  });
  on(main, 'click', '[data-cm]', () => editCardmarket(c));
  on(main, 'click', '[data-image]', () => editImage(c));
  on(main, 'click', '[data-fix]', () => fixFiche(c, fiches));
  on(main, 'click', '[data-edit-manual]', async () => {
    const { openManualCard } = await import('./manual.js');
    openManualCard({ card: c, onSaved: reloadPage });
  });
  on(main, 'click', '[data-replace]', () => replaceManual(c, lines.length));
  on(main, 'click', '[data-delete-manual]', async () => {
    if (!await confirmModal({ title: 'Supprimer cette carte ?', message: c.name, confirmLabel: 'Supprimer', danger: true })) return;
    try {
      await api.rpc('delete_manual_card', { card_id: c.id });
      toast('Carte supprimée');
      location.hash = '#/cartes';
    } catch (err) { toastError(err); }
  });

  // une carte manuelle qui ressemble à une carte TCGdex : on propose le remplacement
  if (manual) {
    const box = main.querySelector('#lookalikes');
    // même nom (ou nom contenu dans l'autre), la même numérotation d'abord
    const n = norm(c.name);
    const anchor = n.split(/\s+/).filter(w => w.length >= 3 && !/^\d+$/.test(w)).sort((a, b) => b.length - a.length)[0];
    const found = anchor ? await api.rpc('search_cards', { q: anchor, lim: 40 }).catch(() => []) : [];
    const sameNumber = x => Number(!!c.number && norm(x.number).replace(/^0+/, '') === norm(c.number).replace(/^0+/, ''));
    const candidates = found
      .filter(x => x.source !== 'manual' && (n.includes(norm(x.name)) || norm(x.name).includes(n)))
      .sort((a, b) => sameNumber(b) - sameNumber(a));
    if (candidates.length && box) {
      setHtml(box, html`
        <div class="banner banner-info">
          <strong>Ça ressemble à une carte que TCGdex a maintenant</strong>
          ${candidates.slice(0, 3).map(x => html`
            <div class="row-actions">
              <span class="grow small">${x.name} · ${x.set_name} ${x.number || ''}</span>
              <button type="button" class="btn btn-sm" data-replace-with="${x.id}">Remplacer par celle-ci</button>
            </div>`)}
        </div>`);
      on(box, 'click', '[data-replace-with]', (_, b) => doReplace(c, b.dataset.replaceWith, lines.length));
    }
  }
}

function editCardmarket(c) {
  openModal({
    title: 'Lien Cardmarket',
    width: 620,
    body: html`
      <label class="field">Lien<input class="input" type="url" id="cm-url" value="${c.cardmarket_url_manual ? c.cardmarket_url : ''}" placeholder="${c.cardmarket_url || 'https://www.cardmarket.com/fr/Pokemon/Products/Singles/…'}"></label>
      <p class="muted small" style="margin: 0">Laisse vide pour revenir au lien calculé automatiquement.</p>`,
    actions: [
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: async el => {
        try {
          await api.rpc('set_card_cardmarket_url', { card_id: c.id, url: el.querySelector('#cm-url').value.trim() });
          toast('Lien enregistré');
          reloadPage();
        } catch (err) { toastError(err); return false; }
      } },
    ],
  });
}

// Image d'une carte que TCGdex n'a pas : photo envoyée sur le NAS, ou adresse d'une image
// (clic droit sur l'image de la carte sur Cardmarket → « Copier l'adresse de l'image »)
function editImage(c) {
  let path = c.image_source === 'manuelle' ? c.image : '';
  openModal({
    title: 'Image de la carte',
    width: 560,
    body: html`
      <div id="ci-drop"></div>
      <label class="field">ou l’adresse d’une image
        <input class="input" type="url" id="ci-url" value="${/^https?:/.test(path) ? path : ''}" placeholder="https://product-images.s3.cardmarket.com/…">
        <span class="muted small">Sur Cardmarket : clic droit sur l’image de la carte, « Copier l’adresse de l’image ».</span>
      </label>`,
    onOpen: el => dropzone(el.querySelector('#ci-drop'), {
      value: /^https?:/.test(path) ? '' : path, folder: 'Cartes', label: 'Glisse la photo ou le scan de la carte',
      onChange: p => { path = p; el.querySelector('#ci-url').value = ''; },
    }),
    actions: [
      ...(c.image_source === 'manuelle' ? [{ label: 'Retirer l’image', danger: true, run: () => saveImage(c, '') }] : []),
      { label: 'Annuler' },
      { label: 'Enregistrer', primary: true, run: el => saveImage(c, el.querySelector('#ci-url').value.trim() || path) },
    ],
  });
}

async function saveImage(c, image) {
  try {
    await api.rpc('set_card_image', { card_id: c.id, image });
    toast(image ? 'Image enregistrée' : 'Image retirée');
    reloadPage();
  } catch (err) { toastError(err); return false; }
}

// Correction rare : la carte va sur une autre fiche que celle choisie par les labels
function fixFiche(c, fiches) {
  const corrected = fiches.some(f => f.source === 'correction');
  const m = openModal({
    title: 'Corriger la fiche Pokémon',
    width: 560,
    body: html`
      <p class="muted" style="margin: 0">Pour les rares cartes que les labels rangent mal. La correction prime sur les labels.</p>
      <label class="search"><input type="search" id="fx-q" placeholder="Chercher un Pokémon ou une forme" aria-label="Chercher un Pokémon"></label>
      <div class="picker-results" id="fx-list"></div>`,
    onOpen: el => {
      let seq = 0;
      el.querySelector('#fx-q').addEventListener('input', async e => {
        const mine = ++seq;
        const q = norm(e.target.value);
        if (q.length < 2) return setHtml(el.querySelector('#fx-list'), '');
        const rows = await api.list('pokedex', { select: 'key,name_fr,dex,sprite,pokeapi_id,form_badge,form_color', search: `ilike.*${q}*`, order: 'sort_order', limit: 20 }).catch(() => []);
        if (mine !== seq) return;
        setHtml(el.querySelector('#fx-list'), html`${rows.map(p => html`
          <button type="button" class="picker-item" data-key="${p.key}">
            <span class="tx-media">${spriteHtml(p, 'poke-img poke-img-sm')}</span>
            <span class="grow"><span class="picker-name">${p.name_fr} ${formBadge(p)}</span><span class="muted small">n°${String(p.dex).padStart(3, '0')}</span></span>
          </button>`)}`);
      });
      // la correction s'applique tout de suite (plus de recalcul de tout le rangement)
      let busy = false;
      on(el, 'click', '[data-key]', async (_, b) => {
        if (busy) return;
        busy = true;
        b.setAttribute('aria-busy', 'true');
        try {
          await api.upsert('card_overrides', { card_id: c.id, pokemon_key: b.dataset.key }, 'card_id');
          toast('Fiche corrigée');
          m.close();
          reloadPage();
        } catch (err) { toastError(err); } finally { busy = false; b.removeAttribute('aria-busy'); }
      });
    },
    actions: [
      ...(corrected ? [{ label: 'Revenir au rangement automatique', run: async () => {
        try {
          await api.remove('card_overrides', { card_id: `eq.${c.id}` });
          toast('Rangement automatique rétabli');
          reloadPage();
        } catch (err) { toastError(err); return false; }
      } }] : []),
      { label: 'Fermer' },
    ],
  });
}

function replaceManual(c, n) {
  const m = openModal({
    title: 'Remplacer par une carte TCGdex',
    width: 640,
    body: html`<p class="muted" style="margin: 0">Ses ${n} vente(s) et achat(s) passeront sur la carte choisie, puis ta carte manuelle sera supprimée.</p><div id="rp"></div>`,
    actions: [{ label: 'Annuler' }],
  });
  cardPicker(m.el.querySelector('#rp'), { onPick: x => { m.close(); doReplace(c, x.id, n); } });
}

async function doReplace(c, tcgdexId, n) {
  const ok = await confirmModal({
    title: 'Remplacer la carte ?',
    message: `${n} vente(s) et achat(s) passeront sur la carte TCGdex, et « ${c.name} » (manuelle) sera supprimée.`,
    confirmLabel: 'Remplacer',
  });
  if (!ok) return;
  try {
    const moved = await api.rpc('replace_manual_card', { manual_id: c.id, tcgdex_id: tcgdexId });
    toast(`Carte remplacée, ${moved} ligne(s) déplacée(s)`);
    location.hash = `#/cartes/${encodeURIComponent(tcgdexId)}`;
  } catch (err) { toastError(err); }
}
