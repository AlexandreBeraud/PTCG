const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c]);
}

// Morceau de HTML déjà sûr, qu'html`` ne doit pas échapper
class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = s => new Raw(s);

function part(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  if (v === false || v == null) return '';
  return esc(v);
}

// Gabarit HTML : chaque valeur interpolée est échappée, sauf raw() et html``
export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += part(v) + strings[i + 1]; });
  return raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// Délégation : un seul écouteur par conteneur, même après un re-rendu
export function on(root, type, selector, handler) {
  root.addEventListener(type, e => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function setHtml(el, content) {
  el.innerHTML = String(content);
}

export const eur = n => n == null ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

export function uid() {
  // pas de crypto.randomUUID ici : il n'existe pas hors HTTPS
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Réaffiche la page courante dans un conteneur neuf (voir route() dans main.js)
export const reloadPage = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// Écran d'erreur avec « Réessayer » (géré dans main.js)
export function errorHtml(title, err) {
  const offline = err && err.status === 0;
  return html`<div class="empty">
    <h2>${offline ? 'Le Pi ne répond pas' : title}</h2>
    <p>${offline ? 'Vérifie que Tailscale est connecté sur cet appareil et que le Pi est allumé. Rien de ce que tu as saisi n’est perdu.' : err?.message || ''}</p>
    <button type="button" class="btn" data-retry-page>Réessayer</button>
  </div>`;
}
