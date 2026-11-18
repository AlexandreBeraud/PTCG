import { preparerApparence } from '/_shared/apparence.js';

export const THEMES = [
  { id: 'braise', name: 'Braise', bg: '#0E1016', accent: '#FF5E5B' },
  { id: 'abysses', name: 'Abysses', bg: '#0A141F', accent: '#2196D8' },
  { id: 'sylve', name: 'Sylve', bg: '#0B1310', accent: '#22A06B' },
  { id: 'amethyste', name: 'Améthyste', bg: '#120E1A', accent: '#9333EA' },
  { id: 'aurore', name: 'Aurore', bg: '#F4F1EA', accent: '#C2410C' },
];

export const RAYONS = [
  { id: 'angulaire', name: 'Anguleux' },
  { id: 'normal', name: 'Normal' },
  { id: 'arrondi', name: 'Arrondi' },
];

// Gardée sur l'appareil : la page s'ouvre aux bonnes couleurs avant même la réponse de la base
const appliquer = preparerApparence({ cle: 'ptcg.apparence', defaut: { theme: 'braise' } });

// settings vient de la base (theme, radius, accent)
export const appliquerApparence = ({ theme, radius, accent }) => appliquer({ theme, rayon: radius, accent });
