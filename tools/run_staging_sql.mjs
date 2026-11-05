// Ejecuta un archivo SQL SOLO contra STAGING.
// Uso: node tools/run_staging_sql.mjs <archivo.sql> [--out salida.json] [--env backend/scraper/.env.staging]
// Reglas duras:
//  - Lee DATABASE_URL SOLO del archivo .env.staging (nunca de .env/.env.local de producción).
//  - Imprime host/usuario/base antes de ejecutar.
//  - Se niega si la URL contiene el project-ref de PRODUCCIÓN (derivado de SUPABASE_URL en backend/scraper/.env).
//  - Se niega si no existe el archivo o DATABASE_URL.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.resolve('frontend/package.json'));
const { Client } = require('pg');

const args = process.argv.slice(2);
const sqlFile = args[0];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const envFile = opt('--env', 'backend/scraper/.env.staging');
const outFile = opt('--out', null);
if (!sqlFile) { console.error('Falta archivo SQL'); process.exit(2); }

const readEnv = (f) => Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));

if (!fs.existsSync(envFile)) { console.error(`No existe ${envFile}`); process.exit(2); }
const stg = readEnv(envFile);
if (!stg.DATABASE_URL) { console.error('DATABASE_URL ausente en el archivo de staging'); process.exit(2); }

let prodRef = null;
try {
  const prod = readEnv('backend/scraper/.env');
  prodRef = new URL(prod.SUPABASE_URL).hostname.split('.')[0];
} catch { /* sin referencia de prod disponible */ }

const u = new URL(stg.DATABASE_URL);
console.log(`[staging] host=${u.hostname} port=${u.port} user=${decodeURIComponent(u.username)} db=${u.pathname.slice(1)}`);
if (prodRef && stg.DATABASE_URL.includes(prodRef)) {
  console.error(`ABORTADO: la URL contiene el project-ref de PRODUCCION (${prodRef}).`); process.exit(3);
}
console.log(`[staging] verificado: no contiene el ref de produccion (${prodRef ?? 'desconocido'}).`);

const sql = fs.readFileSync(sqlFile, 'utf8');
const client = new Client({ connectionString: stg.DATABASE_URL, ssl: { rejectUnauthorized: false } });
client.on('notice', (n) => console.log('NOTICE:', n.message));
await client.connect();
try {
  const res = await client.query(sql);
  const last = Array.isArray(res) ? res[res.length - 1] : res;
  const rows = last?.rows ?? [];
  if (outFile) { fs.writeFileSync(outFile, JSON.stringify(rows)); console.log(`[staging] ${rows.length} fila(s) -> ${outFile}`); }
  else console.log(JSON.stringify(rows).slice(0, 4000));
} catch (e) {
  console.error('ERROR SQL:', e.message); process.exitCode = 1;
} finally { await client.end(); }
