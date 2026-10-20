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
