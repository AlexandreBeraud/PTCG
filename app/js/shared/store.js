import { api } from '../api.js';

// Petites listes partagées par plusieurs pages, relues après chaque modification
const cache = new Map();

function cached(key, load) {
  if (!cache.has(key)) cache.set(key, load().catch(err => { cache.delete(key); throw err; }));
  return cache.get(key);
}

export const store = {
  contacts: () => cached('contacts', () => api.list('contacts', { select: 'id,pseudo,icon', order: 'pseudo' })),
  accessoires: () => cached('accessoires', () => api.list('accessoires', { order: 'name' })),
  forAccounts: () => cached('forAccounts', () => api.list('for_accounts', { order: 'name' })),
  settings: () => cached('settings', () => api.one('settings', { id: 'eq.1' })),

  forget(...keys) {
    if (!keys.length) cache.clear();
    keys.forEach(k => cache.delete(k));
  },
};

// Nouvelle commande d'un contact (créé au passage s'il est nouveau)
export async function ensureContact({ contactId, newPseudo }) {
  if (contactId) return contactId;
  const pseudo = (newPseudo || '').trim();
  if (!pseudo) return null;
  const existing = (await store.contacts()).find(c => c.pseudo.toLowerCase() === pseudo.toLowerCase());
  if (existing) return existing.id;
  const row = await api.insert('contacts', { pseudo });
  store.forget('contacts');
  return row.id;
}
