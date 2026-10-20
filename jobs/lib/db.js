// Accès à la base v2 via PostgREST, avec le rôle ptcg_job
const env = require('./env');
const { request } = require('./http');
const jwt = require('./jwt');

const BATCH = 500;
const PAGE = 1000;

function headers(extra = {}) {
  const h = { 'Accept-Profile': 'v2', 'Content-Profile': 'v2', ...extra };
  if (env.JWT_SECRET) h.Authorization = `Bearer ${jwt.sign({ role: 'ptcg_job' }, env.JWT_SECRET)}`;
  return h;
}

const url = (path, query = '') => `${env.API_URL}/${path}${query ? `?${query}` : ''}`;

// Toutes les lignes, page par page (query = filtres PostgREST : "select=id,name&lang=eq.en")
async function select(table, query = 'select=*') {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await request(url(table, `${query}&limit=${PAGE}&offset=${offset}`), { headers: headers() });
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

// Upsert par lots. Toutes les lignes d'un même appel doivent avoir les mêmes
// colonnes : PostgREST ne met à jour que celles-là, les autres sont conservées.
async function upsert(table, rows, { onConflict = 'id', ignoreDuplicates = false } = {}) {
  if (!rows.length) return 0;
  const keys = Object.keys(rows[0]).sort().join(',');
  if (rows.some(r => Object.keys(r).sort().join(',') !== keys)) throw new Error(`upsert ${table} : colonnes différentes d'une ligne à l'autre`);
  if (env.DRY_RUN) return rows.length;

  const prefer = `resolution=${ignoreDuplicates ? 'ignore' : 'merge'}-duplicates,return=minimal`;
  for (let i = 0; i < rows.length; i += BATCH) {
    await request(url(table, `on_conflict=${onConflict}&columns=${keys}`), {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: prefer }),
      body: JSON.stringify(rows.slice(i, i + BATCH)),
      retries: 2,
      timeout: 120000,
    });
  }
  return rows.length;
}

async function insertOne(table, row) {
  if (env.DRY_RUN) return { ...row, id: null };
  const res = await request(url(table), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(row),
    retries: 2,
  });
  return (await res.json())[0];
}

async function patch(table, filter, body) {
  if (env.DRY_RUN) return;
  await request(url(table, filter), {
    method: 'PATCH',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
    retries: 2,
  });
}

async function rpc(name, args = {}) {
  if (env.DRY_RUN) return null;
  const res = await request(url(`rpc/${name}`), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(args),
    retries: 1,
    timeout: 300000,
  });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

module.exports = { select, upsert, insertOne, patch, rpc };
