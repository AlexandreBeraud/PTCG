import { config } from '../config.js';
import { uid } from './ui/dom.js';

// FileBrowser, joint via Caddy sur /nas (même origine que l'appli)
let token = null;
let pending = null;
// le jeton FileBrowser expire au bout de 2 h : on le renouvelle avant
const RENEW = 90 * 60 * 1000;

const encodePath = p => p.split('/').map(encodeURIComponent).join('/');

async function login() {
  const res = await fetch(`${config.nas}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.nasUser, password: config.nasPassword, recaptcha: '' }),
  });
  if (!res.ok) throw new Error(res.status === 403 ? 'Identifiants FileBrowser refusés (config.local.js)' : `FileBrowser injoignable (${res.status})`);
  token = (await res.text()).trim();
  setTimeout(() => { token = null; ensureLogin(); }, RENEW);
  return token;
}

// Une seule connexion à la fois ; null si le NAS ne répond pas (les images retombent alors sur leur repli)
export function ensureLogin() {
  if (token) return Promise.resolve(token);
  if (!config.nasUser) return Promise.resolve(null);
  pending ||= login().catch(() => null).finally(() => { pending = null; });
  return pending;
}

function send(path, file) {
  return fetch(`${config.nas}/api/resources/${encodePath(path)}?override=false`, {
    method: 'POST',
    headers: { 'X-Auth': token },
    body: file,
  });
}

// Envoie un fichier sur le NAS et renvoie son chemin, à stocker tel quel en base
export async function upload(file, folder = '') {
  if (!file || !file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image');
  if (!token) await login();

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const month = new Date().toISOString().slice(0, 7);
  const path = [config.uploadRoot, folder, month, `${uid()}.${ext}`].filter(Boolean).join('/');

  let res = await send(path, file);
  if (res.status === 401) {
    // jeton expiré : on se reconnecte une fois
    await login();
    res = await send(path, file);
  }
  if (!res.ok) throw new Error(`Le NAS a refusé l’envoi (${res.status})`);
  return path;
}

// Adresse d'affichage : les anciennes URL complètes restent telles quelles
export function imageUrl(pathOrUrl, size = 'big') {
  if (!pathOrUrl) return '';
  if (/^(https?:|data:|blob:)/.test(pathOrUrl)) return pathOrUrl;
  const auth = token ? `?auth=${encodeURIComponent(token)}` : '';
  return `${config.nas}/api/preview/${size}/${encodePath(pathOrUrl)}${auth}`;
}
