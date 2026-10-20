export const THEMES = [
  { id: 'braise', name: 'Braise', bg: '#0E1016', accent: '#FF5E5B' },
  { id: 'abysses', name: 'Abysses', bg: '#0A141F', accent: '#2196D8' },
  { id: 'sylve', name: 'Sylve', bg: '#0B1310', accent: '#22A06B' },
  { id: 'amethyste', name: 'Améthyste', bg: '#120E1A', accent: '#9333EA' },
  { id: 'aurore', name: 'Aurore', bg: '#F4F1EA', accent: '#C2410C' },
];

export const RADII = [
  { id: 'angulaire', name: 'Anguleux' },
  { id: 'normal', name: 'Normal' },
  { id: 'arrondi', name: 'Arrondi' },
];

export function applyAppearance({ theme, radius, accent }) {
  const root = document.documentElement;
  root.dataset.theme = theme || 'braise';
  root.dataset.radius = radius || 'normal';
  if (accent) {
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--accent-text', accent);
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-text');
  }
}
