// Tout passe par Caddy sur la même origine (voir infra/Caddyfile.ptcg-v2.example).
// Pour tester depuis le PC sans Caddy, surcharger dans config.local.js.
export const config = {
  api: '/api',
  nas: '/nas',
  // dossier FileBrowser où vont les photos envoyées depuis l'appli
  uploadRoot: 'Fichiers/Images/PTCG/Uploads',
  // sprites Home, rangés comme dans l'ancienne appli (1G…9G / 0006.png), vus depuis
  // le dossier de l'utilisateur FileBrowser de l'appli (Fichiers/Images/PTCG) ;
  // le chemin complet sert de repli si cet utilisateur voit tout le NAS
  spritesRoot: 'Pokemon',
  spritesRootAlt: 'Fichiers/Images/PTCG/Pokemon',
  nasUser: '',
  nasPassword: '',
};

try {
  const local = await import('./config.local.js');
  Object.assign(config, local.default || {});
} catch (_) {
  // pas de config.local.js : on garde les valeurs ci-dessus
}
