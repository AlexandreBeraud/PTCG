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

// ─── Ancienne config Supabase (rollback) ─────────────────────
// window.__PC_CLOUD_CONFIG__ = {
//   url: 'https://kfyphcestbcgtkzurvas.supabase.co',
//   key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
//   user_id: 'default',
// };
