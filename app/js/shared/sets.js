import { api } from '../api.js';
import { html } from '../ui/dom.js';

// Toutes les extensions pour les menus : blocs dans l'ordre choisi (Réglages), sinon les plus récents d'abord
let cache = null;
export function setOptions() {
  cache ||= api.list('set_options', { order: 'serie_sort.asc.nullslast,serie_release.desc.nullslast,serie_id,release_date.desc.nullslast,name' })
    .catch(err => { cache = null; throw err; });
  return cache;
}
export const forgetSets = () => { cache = null; };

// <option> rangées sous leur bloc : setOptionsHtml(list, 'me02', { empty: 'Toutes' })
// list : lignes de set_options (id) ou de transaction_sets (set_key), déjà triées
// blocs : le bloc se choisit aussi (valeur « bloc:<nom> »), pour les filtres
export function setOptionsHtml(list, selected = '', { empty = null, label = s => s.name, blocs = false } = {}) {
  const groups = new Map();
  for (const s of list) {
    const bloc = s.serie_name || 'Hors bloc';
    if (!groups.has(bloc)) groups.set(bloc, { named: !!s.serie_name, sets: [] });
    groups.get(bloc).sets.push(s);
  }
  const id = s => s.id ?? s.set_key;
  const opt = s => html`<option value="${id(s)}" ${id(s) === selected ? 'selected' : ''}>${blocs ? '    ' : ''}${label(s)}</option>`;
  return html`${empty != null ? html`<option value="">${empty}</option>` : ''}${[...groups].map(([bloc, g]) => (blocs
    ? html`${g.named ? html`<option class="opt-bloc" value="bloc:${bloc}" ${`bloc:${bloc}` === selected ? 'selected' : ''}>${bloc.toUpperCase()} · tout le bloc</option>` : html`<option disabled>${bloc.toUpperCase()}</option>`}${g.sets.map(opt)}`
    : html`<optgroup label="${bloc}">${g.sets.map(opt)}</optgroup>`))}`;
}
