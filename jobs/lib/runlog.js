// Trace de chaque lancement dans v2.job_runs (affichée dans Réglages)
const db = require('./db');
const env = require('./env');

async function run(job, fn) {
  if (!env.DRY_RUN && !env.JWT_SECRET) {
    console.error('JWT_SECRET manquant : copie .env.example en .env et mets-y le secret de PostgREST.');
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  let entry = null;
  try {
    entry = await db.insertOne('job_runs', { job });
  } catch (e) {
    console.warn(`⚠ Impossible d'écrire dans job_runs (${e.message})`);
  }

  try {
    const summary = await fn();
    const seconds = Math.round((Date.now() - started) / 1000);
    if (entry && entry.id) await db.patch('job_runs', `id=eq.${entry.id}`, { finished_at: new Date().toISOString(), ok: true, summary: { ...summary, seconds } });
    console.log(`\nTerminé en ${seconds} s${env.DRY_RUN ? ' (simulation, rien n\'a été écrit)' : ''}.`);
  } catch (e) {
    console.error(`\nErreur : ${e.message}`);
    if (entry && entry.id) {
      const summary = e.summary ? { ...e.summary, seconds: Math.round((Date.now() - started) / 1000) } : null;
      await db.patch('job_runs', `id=eq.${entry.id}`, { finished_at: new Date().toISOString(), ok: false, summary, error: e.message.slice(0, 2000) })
        .catch(() => {});
    }
    process.exitCode = 1;
  }
}

module.exports = { run };
