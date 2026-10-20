import { html, on, setHtml } from './dom.js';

// Groupe de pastilles de filtre.
// chips(el, { options: [{ value, label, count }], value, multiple, onChange })
export function chips(el, { options, value, multiple = false, label = 'Filtre', onChange }) {
  let selected = multiple ? new Set(value || []) : value;

  const isOn = v => multiple ? selected.has(v) : selected === v;

  function render() {
    setHtml(el, html`
      <div class="chips" role="group" aria-label="${label}">
        ${options.map(o => html`
          <button type="button" class="chip" data-value="${o.value}" aria-pressed="${isOn(o.value)}">
            ${o.label}${o.count != null ? html`<span class="n">${o.count}</span>` : ''}
          </button>`)}
      </div>
    `);
  }

  on(el, 'click', '.chip', (_, btn) => {
    const v = btn.dataset.value;
    if (multiple) {
      selected.has(v) ? selected.delete(v) : selected.add(v);
      onChange?.([...selected]);
    } else {
      selected = v;
      onChange?.(v);
    }
    render();
  });

  render();
  return {
    set(next) { selected = multiple ? new Set(next) : next; render(); },
    setOptions(next) { options = next; render(); },
  };
}
