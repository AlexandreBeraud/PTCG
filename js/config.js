// ─── Supabase Cloud Sync ─────────────────────────────────────────────────
// Ces valeurs sont lues par js/sync.js. Chaque module (classeurs, ventes,
// labels…) se synchronise dans SA PROPRE table Supabase — voir
// supabase_schema.sql à la racine du projet pour créer/mettre à jour le
// schéma, à exécuter une fois dans Supabase → SQL Editor.
// Laissez url/key vides pour fonctionner uniquement en local (localStorage).
window.__PC_CLOUD_CONFIG__ = {
  url: 'https://kfyphcestbcgtkzurvas.supabase.co',   // ex: https://xyzabc.supabase.co
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmeXBoY2VzdGJjZ3RrenVydmFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2NTAwMzMsImV4cCI6MjA5ODIyNjAzM30.8sxe-_-uZdG4G0CGpUKViBMHE78RuReVaP_SsyLCaa8',   // clé anon publique Supabase
  user_id: 'default', // app mono-utilisateur : identifiant partagé par tous les appareils
};
