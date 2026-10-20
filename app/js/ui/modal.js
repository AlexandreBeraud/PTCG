import { html, setHtml } from './dom.js';
import { icon } from './icons.js';

// openModal({ title, body, actions: [{ label, primary, run }] })
// run() peut renvoyer une promesse ; la modale se ferme si elle ne lève pas d'erreur.
export function openModal({ title, body = '', actions = [], width = 720, onOpen }) {
  const scrim = document.createElement('div');
  scrim.className = 'modal-scrim';
  const titleId = 'modal-' + Math.random().toString(36).slice(2, 8);

  setHtml(scrim, html`
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}" style="--modal-w: ${width}px">
      <div class="modal-head">
        <h2 id="${titleId}">${title}</h2>
        <button type="button" class="btn btn-ghost btn-icon" data-close aria-label="Fermer">${icon('close', 20)}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? html`
        <div class="modal-foot">
          ${actions.map((a, i) => html`<button type="button" class="btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}" data-action="${i}">${a.label}</button>`)}
        </div>` : ''}
    </div>
  `);

  const previous = document.activeElement;
  const modal = scrim.querySelector('.modal');

  function close() {
    scrim.remove();
    document.removeEventListener('keydown', onKey);
    previous?.focus?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }

  scrim.addEventListener('click', async e => {
    if (e.target === scrim || e.target.closest('[data-close]')) return close();
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = actions[Number(btn.dataset.action)];
    if (!action.run) return close();
    btn.disabled = true;
    try {
      if ((await action.run(modal)) !== false) close();
    } finally {
      btn.disabled = false;
    }
  });
  document.addEventListener('keydown', onKey);

  document.body.append(scrim);
  (modal.querySelector('input, select, textarea') || modal.querySelector('[data-close]')).focus();
  onOpen?.(modal);
  return { el: modal, close };
}
