import { config } from '../config.js';

// Toutes les requêtes visent le schéma v2 ; l'ancienne appli reste sur public.
const PROFILE = 'v2';
const TIMEOUT = 15000;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function query(params = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.append(k, v);
  }
  const s = q.toString();
  return s ? '?' + s : '';
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  const h = { 'Accept-Profile': PROFILE, ...headers };
  if (body !== undefined) {
    h['Content-Type'] = 'application/json';
    h['Content-Profile'] = PROFILE;
  }

  let res;
  try {
    res = await fetch(config.api + path, {
      method,
      headers: h,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ApiError(e.name === 'AbortError' ? 'Le Pi ne répond pas (délai dépassé)' : 'Le Pi est injoignable', 0);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const err = await res.json();
      if (err.message) message = err.message;
    } catch (_) { /* corps vide ou pas du JSON */ }
    throw new ApiError(message, res.status);
  }

  const text = res.status === 204 ? '' : await res.text();
  return { data: text ? JSON.parse(text) : null, res };
}

export const api = {
  // api.list('cards', { select: 'id,name', set_id: 'eq.me05', order: 'number' })
  async list(table, params) {
    return (await request(`/${table}${query(params)}`)).data;
  },

  async one(table, params) {
    const rows = await this.list(table, { ...params, limit: 1 });
    return rows[0] ?? null;
  },

  // Une page de résultats + le total, pour ne jamais tout charger d'un coup
  async page(table, params, { offset = 0, limit = 60 } = {}) {
    const { data, res } = await request(`/${table}${query(params)}`, {
      headers: { 'Range-Unit': 'items', Range: `${offset}-${offset + limit - 1}`, Prefer: 'count=exact' },
    });
    const range = res.headers.get('Content-Range') || '';
    const total = Number(range.split('/')[1]);
    return { rows: data || [], total: Number.isFinite(total) ? total : (data || []).length };
  },

  async count(table, params) {
    const { res } = await request(`/${table}${query(params)}`, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
    });
    return Number((res.headers.get('Content-Range') || '').split('/')[1]) || 0;
  },

  async insert(table, row) {
    const { data } = await request(`/${table}`, { method: 'POST', body: row, headers: { Prefer: 'return=representation' } });
    return Array.isArray(row) ? data : data?.[0];
  },

  // api.update('settings', { id: 'eq.1' }, { theme: 'sylve' })
  async update(table, filter, patch) {
    const { data } = await request(`/${table}${query(filter)}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } });
    return data;
  },

  async remove(table, filter) {
    if (!filter || !Object.keys(filter).length) throw new Error('Suppression sans filtre refusée');
    await request(`/${table}${query(filter)}`, { method: 'DELETE' });
  },

  async rpc(fn, args = {}) {
    return (await request(`/rpc/${fn}`, { method: 'POST', body: args })).data;
  },
};
