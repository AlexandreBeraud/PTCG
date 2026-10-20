// Liens Cardmarket des cartes.
// Avec le code Cardmarket de l'extension (ex. PFL pour Flammes Fantasmagoriques) :
//   /fr/Pokemon/Products/Singles/Phantasmal-Flames/Mega-Charizard-X-ex-V1-PFL013?language=2
// "-V1", "-V2"… seulement quand plusieurs cartes de l'extension ont le même nom.
// Sans code : une recherche par nom anglais.

const BASE = 'https://www.cardmarket.com/fr/Pokemon/Products';

function slug(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’‘ʼ´`.]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// "13" → "013", "TG01" reste tel quel
const cmNumber = n => (/^\d+$/.test(String(n)) ? String(n).padStart(3, '0') : String(n || ''));

const byNumber = (a, b) => String(a.number).localeCompare(String(b.number), 'en', { numeric: true });

// cards : [{ id, number, name, name_en }] d'une même extension → Map id → url
function setUrls(set, cards) {
  const urls = new Map();
  const code = set.cardmarket_code && set.cardmarket_code.trim();
  const setSlug = slug(set.name_en || set.name);

  if (!code || !setSlug) {
    for (const c of cards) urls.set(c.id, searchUrl(c.name_en || c.name));
    return urls;
  }

  const groups = new Map();
  for (const c of cards) {
    const key = slug(c.name_en || c.name).toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const group of groups.values()) {
    group.sort(byNumber);
    group.forEach((c, i) => {
      const version = group.length > 1 ? `-V${i + 1}` : '';
      urls.set(c.id, `${BASE}/Singles/${setSlug}/${slug(c.name_en || c.name)}${version}-${code}${cmNumber(c.number)}?language=2`);
    });
  }
  return urls;
}

function searchUrl(name) {
  return `${BASE}/Search?searchString=${encodeURIComponent(name || '')}`;
}

module.exports = { slug, setUrls, searchUrl };
