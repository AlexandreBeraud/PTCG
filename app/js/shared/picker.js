import { api } from '../api.js';
import { html, setHtml, on } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { cardImage } from './sales.js';

// Recherche de carte : « dracaufeu », « dracaufeu 013 », « goupix nuit noire »…
// cardPicker(el, { onPick(card), autofocus })
export function cardPicker(el, { onPick, onManual, autofocus = true, placeholder = 'Nom de la carte, numéro, extension…' } = {}) {
  let results = [];
  let timer = null;
  let seq = 0;

  setHtml(el, html`
    <div class="picker">
      <label class="search">
        ${icon('search')}
        <input type="search" placeholder="${placeholder}" aria-label="Chercher une carte" autocomplete="off">
      </label>
      <div class="picker-results" role="listbox" aria-label="Cartes trouvées"></div>
      ${onManual ? html`<button type="button" class="link small" data-manual>Carte introuvable ? L’ajouter à la main</button>` : ''}
    </div>
  `);
  const input = el.querySelector('input');
  const list = el.querySelector('.picker-results');

  function renderResults(state) {
    if (state === 'loading') return setHtml(list, html`<p class="muted small picker-note">Recherche…</p>`);
    if (state) return setHtml(list, html`<p class="muted small picker-note">${state}</p>`);
    setHtml(list, html`${results.map((c, i) => html`
      <button type="button" class="picker-item" role="option" data-i="${i}">
        <span class="thumb thumb-xs">${c.image ? html`<img src="${cardImage(c.image)}" alt="" loading="lazy" data-hide-on-error>` : ''}</span>
        <span class="grow">
          <span class="picker-name">${c.name}${c.lang === 'en' ? html` <span class="tag">EN</span>` : ''}</span>
          <span class="muted small">${c.set_name} · ${c.number || '—'}${c.rarity ? ` · ${c.rarity}` : ''}</span>
        </span>
        ${Number(c.en_stock) ? html`<span class="tag tag-info">${c.en_stock} en stock</span>` : ''}
      </button>`)}`);
  }

  async function search() {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.length < 2) { results = []; return renderResults(''); }
    renderResults('loading');
    try {
      const rows = await api.rpc('search_cards', { q, lim: 40 });
      if (mine !== seq) return;
      results = rows || [];
      if (results.length) return renderResults(null);
      renderResults(`Aucune carte pour « ${q} »`);
      const sugg = await api.rpc('suggest_names', { q, lim: 3 }).catch(() => []);
      if (mine === seq && sugg.length) {
        list.insertAdjacentHTML('beforeend', String(html`<p class="small picker-note">Tu voulais dire ${sugg.map((s, i) => html`${i ? ', ' : ''}<button type="button" class="link" data-suggest="${s.name}">${s.name}</button>`)} ?</p>`));
      }
    } catch (err) {
      if (mine === seq) renderResults(err.message);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(search, 250);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); list.querySelector('.picker-item')?.focus(); }
    if (e.key === 'Enter') { e.preventDefault(); if (results[0]) onPick?.(results[0]); }
  });
  list.addEventListener('keydown', e => {
    const btn = e.target.closest('.picker-item');
    if (!btn) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); btn.nextElementSibling?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); (btn.previousElementSibling || input).focus(); }
  });
  on(list, 'click', '.picker-item', (_, btn) => onPick?.(results[Number(btn.dataset.i)]));
  on(list, 'click', '[data-suggest]', (_, btn) => { input.value = btn.dataset.suggest; search(); input.focus(); });
  if (onManual) el.querySelector('[data-manual]').addEventListener('click', () => onManual(input.value.trim()));

  if (autofocus) setTimeout(() => input.focus(), 0);
  return { focus: () => input.focus(), clear() { input.value = ''; results = []; renderResults(''); } };
}
