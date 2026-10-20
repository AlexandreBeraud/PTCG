// Lit jobs/.env (CLE=valeur) sans écraser ce qui est déjà dans l'environnement
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '.env');
try {
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch (_) { /* pas de .env : on se contente de l'environnement */ }

const args = process.argv.slice(2);

module.exports = {
  API_URL: (process.env.API_URL || 'http://localhost:8085/api').replace(/\/$/, ''),
  JWT_SECRET: process.env.JWT_SECRET || '',
  TCGDEX_URL: (process.env.TCGDEX_URL || 'https://api.tcgdex.net/v2').replace(/\/$/, ''),
  POKEMONTCG_URL: (process.env.POKEMONTCG_URL || 'https://api.pokemontcg.io/v2').replace(/\/$/, ''),
  POKEMONTCG_KEY: process.env.POKEMONTCG_KEY || '',
  POKEAPI_CSV_URL: (process.env.POKEAPI_CSV_URL || 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv').replace(/\/$/, ''),
  DRY_RUN: args.includes('--dry-run'),
  flag: name => args.includes(`--${name}`),
  // --set=a,b → ['a', 'b']
  list: name => ((args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || '')
    .split(',').map(s => s.trim()).filter(Boolean),
};
