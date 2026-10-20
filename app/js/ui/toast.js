import { html, setHtml } from './dom.js';
import { icon } from './icons.js';

// toast('Vente enregistrée') · toast(err.message, { type: 'error', action: { label: 'Réessayer', run } })
export function toast(message, { type = 'ok', action = null, timeout } = {}) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  setHtml(el, html`
    ${icon(type === 'error' ? 'alert' : 'check')}
    <span class="grow">${message}</span>
    ${action ? html`<button type="button">${action.label}</button>` : ''}
  `);

  const close = () => el.remove();
  if (action) {
    el.querySelector('button').addEventListener('click', () => { close(); action.run(); });
  }
  box.append(el);
  setTimeout(close, timeout ?? (type === 'error' ? 9000 : 3500));
  return close;
}

export const toastError = (err, action) => toast(err?.message || String(err), { type: 'error', action });
