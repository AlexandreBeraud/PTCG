import { ajouterIcones } from '/_shared/ui/icones.js';

// Icônes du menu de PTCG ; les tracés communs (fermer, ok, recherche…) sont dans le kit
ajouterIcones({
  extensions: 'M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5',
  pokedex: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h6M15 12h6M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  cartes: 'M7 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM20 7v12',
  classeurs: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 4v16',
  produits: 'M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9',
  ventes: 'M4 8h15l-4-4M20 16H5l4 4',
  encyclopedie: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z',
  contacts: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  bilan: 'M5 20V11M11 20V5M17 20v-6M3 20h18',
  labels: 'M3 12V4h8l10 10-7 7zM7.5 8h.01',
  logo: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h5M15 12h5M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
});

export { icone } from '/_shared/ui/icones.js';
