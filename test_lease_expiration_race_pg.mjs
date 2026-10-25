// test_lease_expiration_race_pg.mjs
// ==============================================================================
// OPTIHUB B2B — Prueba de integración de concurrencia con PostgreSQL REAL (MEDIO-02)
//
// NIVEL DE PRUEBA: PostgreSQL local real (NO simulada, NO Supabase remoto).
//
// QUÉ DEMUESTRA
//   1. Conexión A retiene `SELECT ... FOR UPDATE` sobre la fila de
//      public.user_checkout_leases del usuario (primer bloqueo que toma
//      persist_order_preference_with_lease, migración 013, líneas 87-90).
//   2. Conexión B invoca la RPC real y queda bloqueada. La contención se prueba
//      con evidencia del motor (conexión observadora C, sin transacción):
//        - pg_stat_activity: state = 'active', wait_event_type = 'Lock',
//          query = la llamada a la RPC.
//        - pg_blocking_pids(pidB) contiene pidA.
//   3. Se verifica (en la BD) que el lease AÚN era vigente cuando B ya estaba
//      bloqueada, y luego se espera (sondeando la BD, no con sleep fijo) a que
//      expires_at <= clock_timestamp() ANTES de liberar a A.
//   4. A libera; B despierta y la RPC devuelve
//      { success:false, persisted:false, code:'LEASE_EXPIRED' } (migración 013,
//      líneas 110-117).
//   5. Se comprueba en la BD que orders.preference_id / init_point siguen NULL,
//      status 'pending', el lease no fue alterado y no hay order_items.
//
// POR QUÉ UNA TERCERA CONEXIÓN (C)
//   pg_stat_activity se cachea por transacción: si el observador fuese A (dentro
//   de BEGIN) vería una instantánea obsoleta y jamás detectaría el bloqueo de B.
//   C opera en autocommit, por lo que cada consulta ve el estado actual.
//   C debe conectar con el MISMO rol que B (o con pg_read_all_stats / superusuario)
//   para ver wait_event y query de B.
//
// REQUISITOS DEL ENTORNO (NO los crea este test; falla con mensaje claro si faltan)
//   - Instancia PostgreSQL LOCAL y aislada, con base de datos cuyo nombre contenga "test".
//   - Esquema aplicado en orden: tablas base (migración 001: orders, order_items,
//     carts, cart_items), 006 (orders.cart_id), 007 (orders.preference_id/init_point),
//     008/010 (restricciones de orders), 012 (user_checkout_leases + RPC) y 013.
//   - auth.users(id UUID PK) existente (en Supabase local ya existe; en PG puro se
//     debe crear un esquema auth mínimo FUERA de este test).
//   - Rol de conexión con EXECUTE sobre la RPC (postgres o service_role).
//   - Paquete npm `pg` resoluble desde este archivo.
//   - Variables: OPTIHUB_ALLOW_LOCAL_PG_TEST=1 (opt-in explícito), PGHOST (localhost,
//     127.0.0.1 o ::1), PGPORT, PGDATABASE (contiene "test"), PGUSER, PGPASSWORD.
//
// El test NO ejecuta DDL. Sólo inserta y luego borra filas identificadas por
// UUIDs generados en esta ejecución.
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

// ------------------------------------------------------------------------------
// 1. Configuración y salvaguarda anti-producción (fail-closed)
// ------------------------------------------------------------------------------
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const LOCAL_ADDRS = new Set(['127.0.0.1', '::1']);
const FORBIDDEN_PORTS = new Set([6543]); // pooler de Supabase

const pgConfig = {
  host: (process.env.PGHOST || '').trim().toLowerCase(),
  port: Number.parseInt(process.env.PGPORT || '5432', 10),
  database: (process.env.PGDATABASE || '').trim(),
  user: (process.env.PGUSER || 'postgres').trim(),
  password: process.env.PGPASSWORD || 'postgres',
  ssl: false, // un destino remoto de Supabase exigiría SSL: su ausencia es otra barrera
  connectionTimeoutMillis: 5000,
  statement_timeout: 15000, // tope servidor por sentencia
  query_timeout: 20000, // tope cliente por consulta
};

const TTL_MS = 3000; // vida del lease; se verifica en BD que sigue vigente al bloquearse B
const BLOCK_DETECT_TIMEOUT_MS = 5000;
const EXPIRY_WAIT_TIMEOUT_MS = TTL_MS + 5000;
const RPC_SETTLE_TIMEOUT_MS = 8000;

/** Valida la configuración ANTES de abrir cualquier socket. Lanza si es insegura. */
function assertSafeConfig() {
  if (process.env.OPTIHUB_ALLOW_LOCAL_PG_TEST !== '1') {
    throw new Error('[SEGURIDAD] Defina OPTIHUB_ALLOW_LOCAL_PG_TEST=1 para autorizar esta prueba sobre PostgreSQL local.');
  }
  if (!LOCAL_HOSTS.has(pgConfig.host)) {
    throw new Error(`[SEGURIDAD] PGHOST debe ser explícito y local (localhost/127.0.0.1/::1). Recibido: "${pgConfig.host}".`);
  }
  if (!Number.isInteger(pgConfig.port) || pgConfig.port < 1 || pgConfig.port > 65535 || FORBIDDEN_PORTS.has(pgConfig.port)) {
    throw new Error(`[SEGURIDAD] Puerto no permitido: ${process.env.PGPORT}.`);
  }
  if (!/test/i.test(pgConfig.database)) {
    throw new Error('[SEGURIDAD] PGDATABASE debe estar definido y contener "test" (base aislada dedicada).');
  }
  if (/supabase\.(co|com)/i.test(`${process.env.PGHOST || ''} ${process.env.DATABASE_URL || ''}`)) {
    throw new Error('[SEGURIDAD] Se detectó un destino Supabase remoto.');
  }
}

/** Verifica el destino EFECTIVO de una conexión ya abierta. */
async function assertEffectiveLocalTarget(client, label) {
  const { rows } = await client.query(
    `SELECT inet_server_addr()::text AS addr,
            current_database() AS db,
            current_setting('port') AS port,
            pg_postmaster_start_time()::text AS started`
  );
  const { addr, db, port, started } = rows[0];
  // addr NULL = socket Unix local; de lo contrario debe ser loopback
  if (addr !== null && !LOCAL_ADDRS.has(addr.replace(/\/\d+$/, ''))) {
    throw new Error(`[SEGURIDAD] La conexión ${label} resolvió a una dirección no local: ${addr}.`);
  }
  if (!/test/i.test(db)) {
    throw new Error(`[SEGURIDAD] La conexión ${label} apunta a la base "${db}", que no es una base de prueba.`);
  }
  return { db, port, started };
}

/** Falla con mensaje claro si el esquema requerido no está preparado. No crea nada. */
async function assertSchemaReady(client) {
  const { rows } = await client.query(`
    SELECT to_regclass('auth.users')                     AS auth_users,
           to_regclass('public.carts')                   AS carts,
           to_regclass('public.orders')                  AS orders,
           to_regclass('public.order_items')             AS order_items,
           to_regclass('public.user_checkout_leases')    AS leases,
           to_regprocedure('public.persist_order_preference_with_lease(uuid,uuid,uuid,text,text,text)') AS rpc
  `);
  const missing = Object.entries(rows[0]).filter(([, v]) => v === null).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `[ENTORNO] Esquema incompleto en la instancia aislada. Faltan: ${missing.join(', ')}. ` +
      'Aplique 001, 006, 007, 008, 010, 012 y 013 y cree auth.users antes de ejecutar.'
    );
  }
}

// ------------------------------------------------------------------------------
// 2. Utilidades
// ------------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Sondea `probe` hasta que devuelva un valor truthy o venza el plazo (finito). */
async function pollUntil(probe, { timeoutMs, intervalMs = 25, abortIf }) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    if (abortIf) abortIf();
    last = await probe();
    if (last) return last;
    await sleep(intervalMs);
  }
  return null;
}

/**
 * Inserta el fixture con las FK reales:
 *   auth.users <- carts <- orders(cart_id)   y   auth.users <- user_checkout_leases
 * El vencimiento del lease se calcula con el reloj de la BD (no del cliente).
 */
async function insertFixture(db, ids) {
  const { userId, cartId, orderId, leaseId } = ids;
  await db.query('INSERT INTO auth.users (id) VALUES ($1::uuid)', [userId]);
  await db.query(
    `INSERT INTO public.carts (id, user_id, status) VALUES ($1::uuid, $2::uuid, 'active')`,
    [cartId, userId]
  );
  await db.query(
    `INSERT INTO public.orders (id, user_id, cart_id, status, payment_status,
                                subtotal_net, tax_amount, total_amount, currency,
                                preference_id, init_point)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'pending', 'pending',
             100000, 19000, 119000, 'CLP', NULL, NULL)`,
    [orderId, userId, cartId]
  );
  await db.query(
    `INSERT INTO public.user_checkout_leases (user_id, lease_id, cart_id, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::uuid, clock_timestamp() + ($4::int * interval '1 millisecond'))`,
    [userId, leaseId, cartId, TTL_MS]
  );
}

/** Borra SOLO las filas creadas por esta ejecución (por UUID). Idempotente. */
async function cleanupFixture(db, ids) {
  const { userId, cartId, orderId } = ids;
  const stmts = [
    ['DELETE FROM public.user_checkout_leases WHERE user_id = $1::uuid', [userId]],
    ['DELETE FROM public.order_items WHERE order_id = $1::uuid', [orderId]],
    ['DELETE FROM public.orders WHERE id = $1::uuid AND user_id = $2::uuid', [orderId, userId]],
    ['DELETE FROM public.carts WHERE id = $1::uuid AND user_id = $2::uuid', [cartId, userId]],
    ['DELETE FROM auth.users WHERE id = $1::uuid', [userId]],
  ];
  for (const [sql, params] of stmts) {
    try {
      await db.query(sql, params);
    } catch (err) {
      console.error('[cleanup] fallo no fatal:', sql.split(' WHERE')[0], err.message);
    }
  }
}

// ------------------------------------------------------------------------------
// 3. Prueba
// ------------------------------------------------------------------------------
test('PG real: persist_order_preference_with_lease devuelve LEASE_EXPIRED si el lease vence mientras B espera el bloqueo de A', async () => {
  assertSafeConfig();

  const ids = {
    userId: crypto.randomUUID(),
    cartId: crypto.randomUUID(),
    orderId: crypto.randomUUID(),
    leaseId: crypto.randomUUID(),
  };

  const clientA = new Client(pgConfig); // retiene el bloqueo
  const clientB = new Client(pgConfig); // ejecuta la RPC (bloqueada)
  const clientC = new Client(pgConfig); // observador en autocommit

  const connected = { A: false, B: false, C: false };
  let fixtureInserted = false;
  let aInTransaction = false;
  let pidA = null;
  let pidB = null;

  // Estado de la consulta de B, observable sin generar rechazos huérfanos
  let bSettled = false;
  let bOutcome = null;
  let bPromise = null;

  try {
    await clientA.connect(); connected.A = true;
    await clientB.connect(); connected.B = true;
    await clientC.connect(); connected.C = true;

    // Destino efectivo de las TRES conexiones: local, base de prueba, misma instancia
    const tA = await assertEffectiveLocalTarget(clientA, 'A');
    const tB = await assertEffectiveLocalTarget(clientB, 'B');
    const tC = await assertEffectiveLocalTarget(clientC, 'C');
    assert.deepEqual([tB.db, tB.port, tB.started], [tA.db, tA.port, tA.started], 'A y B deben usar la misma instancia');
    assert.deepEqual([tC.db, tC.port, tC.started], [tA.db, tA.port, tA.started], 'C debe observar la misma instancia');

    // Tope de espera por bloqueo para B: nunca esperar indefinidamente
    await clientB.query(`SET lock_timeout = '${RPC_SETTLE_TIMEOUT_MS}ms'`);

    await assertSchemaReady(clientC);

    pidA = (await clientA.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    pidB = (await clientB.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    assert.notEqual(pidA, pidB, 'A y B deben ser backends distintos');

    // Fixture (autocommit en C: confirmado y visible para A y B)
    await insertFixture(clientC, ids);
    fixtureInserted = true;

    // A: transacción + bloqueo pesimista del lease
    await clientA.query('BEGIN');
    aInTransaction = true;
    const locked = await clientA.query(
      `SELECT lease_id FROM public.user_checkout_leases WHERE user_id = $1::uuid FOR UPDATE`,
      [ids.userId]
    );
    assert.equal(locked.rows.length, 1, 'A debe bloquear exactamente la fila del lease');

    // B: RPC real. Se envuelve el resultado ya mismo para que un rechazo temprano
    // (p.ej. statement_timeout) no quede sin manejar mientras se espera a C.
    const rpcSql = `SELECT public.persist_order_preference_with_lease(
                      $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, NULL::text) AS result`;
    bPromise = clientB
      .query(rpcSql, [ids.userId, ids.orderId, ids.leaseId, 'pref-pg-race-001', 'https://example.test/init-pg-race'])
      .then(
        (r) => { bSettled = true; bOutcome = { ok: true, result: r.rows[0]?.result }; },
        (e) => { bSettled = true; bOutcome = { ok: false, error: e }; }
      );

    // Evidencia de bloqueo real, observada desde C (autocommit => datos frescos)
    const blockedEvidence = await pollUntil(
      async () => {
        const { rows } = await clientC.query(
          `SELECT a.state, a.wait_event_type, a.wait_event, a.query,
                  ($2::int = ANY(pg_blocking_pids(a.pid))) AS blocked_by_a
             FROM pg_stat_activity a
            WHERE a.pid = $1::int`,
          [pidB, pidA]
        );
        const r = rows[0];
        return r &&
          r.state === 'active' &&
          r.wait_event_type === 'Lock' &&
          r.blocked_by_a === true &&
          /persist_order_preference_with_lease/.test(r.query)
          ? r
          : null;
      },
      {
        timeoutMs: BLOCK_DETECT_TIMEOUT_MS,
        abortIf: () => {
          if (bSettled) {
            throw new Error(
              'B terminó SIN haber quedado bloqueada: ' +
              (bOutcome?.ok ? JSON.stringify(bOutcome.result) : bOutcome?.error?.message)
            );
          }
        },
      }
    );
    assert.ok(blockedEvidence, 'B debe quedar bloqueada por A (wait_event_type=Lock y pg_blocking_pids contiene a A)');

    // Precondición de la carrera: el lease sigue vigente según la BD con B ya bloqueada
    const stillValid = (
      await clientC.query(
        `SELECT expires_at > clock_timestamp() AS valid FROM public.user_checkout_leases WHERE user_id = $1::uuid`,
        [ids.userId]
      )
    ).rows[0].valid;
    assert.equal(
      stillValid, true,
      'El lease ya había vencido antes de confirmar el bloqueo: prueba no concluyente; aumente TTL_MS'
    );

    // El lease debe vencer MIENTRAS B espera: sondeo en BD, A aún retiene el bloqueo
    const expired = await pollUntil(
      async () =>
        (
          await clientC.query(
            `SELECT expires_at <= clock_timestamp() AS expired FROM public.user_checkout_leases WHERE user_id = $1::uuid`,
            [ids.userId]
          )
        ).rows[0].expired === true,
      { timeoutMs: EXPIRY_WAIT_TIMEOUT_MS, abortIf: () => { if (bSettled) throw new Error('B terminó antes del vencimiento del lease'); } }
    );
    assert.ok(expired, 'El lease debe vencer durante la espera');
    assert.equal(bSettled, false, 'B debe seguir bloqueada en el instante del vencimiento');

    // Liberar A solo ahora (lease vencido confirmado en BD)
    await clientA.query('ROLLBACK');
    aInTransaction = false;

    // Esperar la conclusión de B con tope finito
    const settled = await pollUntil(async () => bSettled, { timeoutMs: RPC_SETTLE_TIMEOUT_MS, intervalMs: 20 });
    assert.ok(settled, 'La RPC de B debe concluir tras liberar el bloqueo');
    assert.equal(bOutcome.ok, true, `La RPC no debe lanzar excepción: ${bOutcome.error?.message}`);

    // Contrato de respuesta real (migración 013, líneas 110-117)
    const rpc = bOutcome.result;
    assert.equal(rpc.success, false);
    assert.equal(rpc.persisted, false);
    assert.equal(rpc.code, 'LEASE_EXPIRED');

    // Verificación de NO persistencia (lecturas por C, autocommit, tras concluir B)
    const order = (
      await clientC.query(
        `SELECT status, payment_status, preference_id, init_point, cart_id
           FROM public.orders WHERE id = $1::uuid`,
        [ids.orderId]
      )
    ).rows[0];
    assert.ok(order, 'La orden de prueba debe existir');
    assert.equal(order.status, 'pending');
    assert.equal(order.payment_status, 'pending');
    assert.equal(order.preference_id, null, 'preference_id no debe persistir con lease vencido');
    assert.equal(order.init_point, null, 'init_point no debe persistir con lease vencido');
    assert.equal(order.cart_id, ids.cartId);

    const lease = (
      await clientC.query(
        `SELECT lease_id FROM public.user_checkout_leases WHERE user_id = $1::uuid`,
        [ids.userId]
      )
    ).rows;
    assert.equal(lease.length, 1, 'La RPC no debe borrar el lease');
    assert.equal(lease[0].lease_id, ids.leaseId, 'La RPC no debe alterar el lease');

    const counts = (
      await clientC.query(
        `SELECT (SELECT count(*) FROM public.orders WHERE user_id = $1::uuid)::int AS orders,
                (SELECT count(*) FROM public.order_items WHERE order_id = $2::uuid)::int AS items,
                (SELECT status FROM public.carts WHERE id = $3::uuid) AS cart_status`,
        [ids.userId, ids.orderId, ids.cartId]
      )
    ).rows[0];
    assert.equal(counts.orders, 1, 'No deben aparecer órdenes adicionales');
    assert.equal(counts.items, 0, 'No deben crearse order_items');
    assert.equal(counts.cart_status, 'active', 'El carrito no debe alterarse');
  } finally {
    // Limpieza idempotente. Orden: liberar bloqueo -> cancelar B si sigue pendiente
    // -> esperar su cierre -> borrar datos -> cerrar sockets.
    if (connected.A && aInTransaction) {
      await clientA.query('ROLLBACK').catch(() => {});
    }
    if (connected.C && pidB !== null && bPromise && !bSettled) {
      await clientC.query('SELECT pg_cancel_backend($1::int)', [pidB]).catch(() => {});
    }
    if (bPromise) {
      await Promise.race([bPromise, sleep(RPC_SETTLE_TIMEOUT_MS)]);
    }
    if (connected.C && fixtureInserted) {
      await cleanupFixture(clientC, ids);
    }
    for (const [flag, client] of [[connected.A, clientA], [connected.B, clientB], [connected.C, clientC]]) {
      if (flag) await client.end().catch(() => {});
    }
  }
});
