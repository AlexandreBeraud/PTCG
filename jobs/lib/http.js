// fetch avec délai max et nouvelles tentatives (TCGdex renvoie parfois des 503)

const sleep = ms => new Promise(r => setTimeout(r, ms));

class HttpError extends Error {
  constructor(status, url, body) {
    super(`HTTP ${status} sur ${url}${body ? ` : ${body.slice(0, 300)}` : ''}`);
    this.status = status;
  }
}

async function request(url, { method = 'GET', headers, body, timeout = 30000, retries = 4, allow404 = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res, err;
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    } catch (e) {
      err = e;
    }
    if (res && allow404 && res.status === 404) return null;
    if (res && res.ok) return res;

    const retryable = err || res.status >= 500 || res.status === 429;
    if (!retryable || attempt >= retries) {
      if (err) throw new Error(`${err.name === 'TimeoutError' ? 'délai dépassé' : err.message} sur ${url}`);
      throw new HttpError(res.status, url, await res.text().catch(() => ''));
    }
    await sleep(1000 * 2 ** attempt + Math.random() * 500);
  }
}

async function getJson(url, opts) {
  const res = await request(url, opts);
  return res && res.json();
}

async function getText(url, opts) {
  const res = await request(url, { timeout: 120000, ...opts });
  return res && res.text();
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

module.exports = { request, getJson, getText, mapLimit, HttpError, sleep };
