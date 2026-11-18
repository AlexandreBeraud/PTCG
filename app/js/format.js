export const eur = n => n == null ? '—' : Number(n).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
