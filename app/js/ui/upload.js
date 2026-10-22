import { html, setHtml } from './dom.js';
import { icon } from './icons.js';
import { upload, imageUrl } from '../nas.js';
import { toastError } from './toast.js';

// Zone de dépôt d'image : glisser-déposer ou bouton, envoi direct sur le NAS.
// dropzone(el, { value, folder, onChange(path) })
export function dropzone(el, { value = '', folder = '', label = 'Glisse une photo ici', onChange } = {}) {
  let current = value;
  let busy = false;

  function render() {
    setHtml(el, html`
      <div class="dropzone">
        ${current ? html`<img src="${imageUrl(current)}" alt="">` : icon('upload', 28)}
        <span>${busy ? 'Envoi en cours…' : current ? 'Photo enregistrée sur le NAS' : label}</span>
        <label class="btn btn-sm">
          ${current ? 'Changer' : 'Choisir un fichier'}
          <input type="file" accept="image/*" class="visually-hidden">
        </label>
      </div>
    `);
  }

  async function send(file) {
    if (!file || busy) return;
    busy = true;
    render();
    try {
      current = await upload(file, folder);
      onChange?.(current);
    } catch (err) {
      toastError(err);
    } finally {
      busy = false;
      render();
    }
  }

  el.addEventListener('change', e => {
    if (e.target.type === 'file') send(e.target.files[0]);
  });
  el.addEventListener('dragover', e => {
    e.preventDefault();
    el.firstElementChild?.classList.add('is-over');
  });
  el.addEventListener('dragleave', () => el.firstElementChild?.classList.remove('is-over'));
  el.addEventListener('drop', e => {
    e.preventDefault();
    send(e.dataTransfer.files[0]);
  });

  render();
  return { get value() { return current; } };
}

// Choisir une image : photo envoyée sur le NAS ou adresse collée.
// Renvoie le chemin ou l'adresse, '' pour « retirer », null si on annule.
export async function askImage({ title = 'Image', value = '', folder = '', hint = '', removable = false } = {}) {
  const { openModal } = await import('./modal.js');
  return new Promise(resolve => {
    let path = /^https?:/.test(value) ? '' : value;
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title,
      width: 560,
      body: html`
        <div class="ask-drop"></div>
        <label class="field">ou l’adresse d’une image
          <input class="input" type="url" data-ask-url value="${/^https?:/.test(value) ? value : ''}" placeholder="https://…">
          ${hint ? html`<span class="muted small">${hint}</span>` : ''}
        </label>`,
      onOpen: el => dropzone(el.querySelector('.ask-drop'), {
        value: path, folder, label: 'Glisse une image ici',
        onChange: p => { path = p; el.querySelector('[data-ask-url]').value = ''; },
      }),
      actions: [
        ...(removable ? [{ label: 'Retirer', danger: true, run: () => finish('') }] : []),
        { label: 'Annuler', run: () => finish(null) },
        { label: 'Enregistrer', primary: true, run: el => finish(el.querySelector('[data-ask-url]').value.trim() || path || null) },
      ],
    });
    new MutationObserver((_, obs) => { if (!m.el.isConnected) { obs.disconnect(); finish(null); } })
      .observe(document.body, { childList: true });
  });
}
