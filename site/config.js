// ─── Supabase Cloud Sync ─────────────────────────────────────────────────
// Pointe maintenant vers le PostgREST self-hosted sur le Pi (via Caddy, qui
// reproduit le chemin /rest/v1/... de Supabase et retire l'en-tête
// Authorization avant PostgREST — voir Caddyfile). js/sync.js n'a besoin
// d'aucune modification.
//
// Ancienne config Supabase conservée en commentaire pour rollback rapide.
window.__PC_CLOUD_CONFIG__ = {
  url: 'http://100.72.66.5:3003',
  key: 'self-hosted-no-jwt',
  user_id: 'default',
};

// ─── Sprites Pokémon "Home" (NAS FileBrowser) ───────────────────────────────
// Alternative aux sprites Official Art de PokeAPI : va chercher l'image dans
// le partage FileBrowser du NAS, rangée par génération (1G…9G) puis par
// numéro de Pokédex sur 4 chiffres (+ suffixe _01, _02… pour les formes
// alternatives). Voir _nasSpriteUrl (js/pokedex.js). La clé fait partie du
// lien de partage FileBrowser — à mettre à jour ici si jamais elle change.
window.__PC_NAS_SPRITES__ = {
  base: 'http://100.72.66.5:8090/api/preview/big/Fichiers/Images/PTCG/Pokemon',
  key: '1756562554000',
};

// ─── Ancienne config Supabase (rollback) ─────────────────────
// window.__PC_CLOUD_CONFIG__ = {
//   url: 'https://kfyphcestbcgtkzurvas.supabase.co',
//   key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
//   user_id: 'default',
// };
