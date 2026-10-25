// test_supabase_privileges_and_catalog_isolation.mjs
// Automated test suite for FASE 29.2:
// Local verification of SQL privilege hardening (migration 016), column-level ACL parity,
// frontend query compatibility (no SELECT * on marcos, no restricted columns on anon),
// and role-based DAC/RLS simulation.
//
// NOTE ON LOCAL LIMITATION:
// This workspace does not have a live local PostgreSQL / Supabase instance running.
// These tests verify the SQL migration contract, frontend query projections, filter engine,
// and an in-memory PostgreSQL DAC + Column-ACL + RLS simulator derived from Migration 016.
// Live pg_catalog verification must be executed in the Supabase SQL Editor using the
// read-only diagnostic queries documented in the FASE 29.2 report.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register the path alias loader for @/ resolution under Node.js native ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

const {
  MARCOS_PUBLIC_COLUMNS_LIST,
  MARCOS_PUBLIC_COLUMNS,
  MARCOS_B2B_ONLY_COLUMNS_LIST,
  MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS,
  MARCOS_B2B_COLUMNS_LIST,
  MARCOS_B2B_COLUMNS,
  MARCOS_INTERNAL_SENSITIVE_COLUMNS_LIST,
} = await import('./frontend/lib/catalog/types.ts');

const { enrichMarcos, applyFilters } = await import('./frontend/lib/catalog/filterEngine.ts');

const MIGRATION_016_PATH = path.resolve('./supabase_migration_016_harden_marcos_catalog.sql');
const migrationSql = fs.readFileSync(MIGRATION_016_PATH, 'utf8');

function walkTsFiles(dirPath, result = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(fullPath, result);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      result.push(fullPath);
    }
  }
  return result;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

// ---------------------------------------------------------------------------
// 1. SQL MIGRATION 016 STRUCTURAL & PRIVILEGE CONTRACT TESTS
// ---------------------------------------------------------------------------

test('Migration 016 wraps all DDL/DCL in a single transaction with fail-closed verification', () => {
  assert.match(migrationSql, /^\s*BEGIN;/m, 'Migration 016 must start a transaction with BEGIN;');
  assert.match(
    migrationSql,
    /VERIFICACIÓN FALLIDA:/,
    'Migration 016 must include a fail-closed in-transaction verification block'
  );
  assert.match(
    migrationSql,
    /RAISE\s+EXCEPTION\s+'VERIFICACIÓN FALLIDA:/,
    'Migration 016 verification block must RAISE EXCEPTION on failure before COMMIT'
  );
  assert.match(migrationSql, /COMMIT;\s*$/m, 'Migration 016 must end with COMMIT;');
});

test('Migration 016 revokes all table and column privileges from PUBLIC, anon, and authenticated on all 10 tables', () => {
  const expectedTables = [
    'marcos',
    'orders',
    'order_items',
    'carts',
    'cart_items',
    'profiles',
    'inventory_movements',
    'processed_webhooks',
    'order_email_outbox',
    'user_checkout_leases',
  ];

  const foreachBlockMatch = migrationSql.match(
    /FOREACH\s+v_tbl\s+IN\s+ARRAY\s+ARRAY\[([\s\S]*?)\]\s*LOOP([\s\S]*?)END\s+LOOP;/i
  );
  assert.ok(foreachBlockMatch, 'Migration 016 must iterate over all 10 tables in its DAC cleanup loop');

  for (const tbl of expectedTables) {
    assert.ok(
      foreachBlockMatch[1].includes(`'${tbl}'`),
      `DAC cleanup table array must include '${tbl}'`
    );
  }

  assert.match(
    foreachBlockMatch[2],
    /REVOKE\s+ALL\s+PRIVILEGES\s+ON\s+TABLE\s+public\.%I\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
    'Loop must revoke all table-level privileges from PUBLIC, anon, and authenticated'
  );

  assert.match(
    foreachBlockMatch[2],
    /REVOKE\s+ALL\s+PRIVILEGES\s*\(%I\)\s*ON\s+TABLE\s+public\.%I\s+FROM\s+PUBLIC,\s*anon,\s*authenticated;/i,
    'Loop must revoke all residual column-level privileges from PUBLIC, anon, and authenticated'
  );
});

test('Migration 016 does NOT grant table-level SELECT or write privileges on public.marcos to anon or authenticated', () => {
  const tableLevelSelectGrant =
    /GRANT\s+SELECT\s+ON\s+(?:TABLE\s+)?public\.marcos\s+TO\s+(?:anon|authenticated)/i;
  assert.equal(
    tableLevelSelectGrant.test(migrationSql),
    false,
    'Must NOT grant table-level SELECT on public.marcos to anon or authenticated (must use column-level GRANT SELECT (%s))'
  );

  const anyWriteGrantOnMarcos =
    /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|TRUNCATE)[^;]*ON\s+(?:TABLE\s+)?public\.marcos\s+TO\s+(?:PUBLIC|anon|authenticated)/i;
  assert.equal(
    anyWriteGrantOnMarcos.test(migrationSql),
    false,
    'Must NOT grant INSERT, UPDATE, DELETE, TRUNCATE, or ALL on public.marcos to PUBLIC, anon, or authenticated'
  );

  assert.match(
    migrationSql,
    /EXECUTE\s+format\('GRANT SELECT \(%s\) ON TABLE public\.marcos TO anon;',\s*v_public_cols\);/i,
    'Must grant column-level SELECT to anon using v_public_cols'
  );
  assert.match(
    migrationSql,
    /EXECUTE\s+format\('GRANT SELECT \(%s\) ON TABLE public\.marcos TO authenticated;',\s*v_b2b_cols\);/i,
    'Must grant column-level SELECT to authenticated using v_b2b_cols'
  );
});

test('Migration 016 column-level allowlists on public.marcos match TypeScript column allowlists and exclude internal costs', () => {
  const publicArrayMatch = migrationSql.match(
    /INTO\s+v_public_cols[\s\S]*?a\.attname\s*=\s*ANY\s*\(\s*ARRAY\[([\s\S]*?)\]\s*\)/i
  );
  assert.ok(publicArrayMatch, 'Migration 016 must define v_public_cols allowlist array');

  const sqlAnonCols = Array.from(publicArrayMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);

  const b2bArrayMatch = migrationSql.match(
    /INTO\s+v_b2b_cols[\s\S]*?a\.attname\s*=\s*ANY\s*\(\s*ARRAY\[([\s\S]*?)\]\s*\)/i
  );
  assert.ok(b2bArrayMatch, 'Migration 016 must define v_b2b_cols allowlist array');

  const sqlAuthCols = Array.from(b2bArrayMatch[1].matchAll(/'([^']+)'/g)).map((m) => m[1]);

  // Every TypeScript public column must be present in SQL anon allowlist
  for (const pubCol of MARCOS_PUBLIC_COLUMNS_LIST) {
    assert.equal(
      sqlAnonCols.includes(pubCol),
      true,
      `SQL v_public_cols must include MARCOS_PUBLIC_COLUMNS_LIST column: ${pubCol}`
    );
  }

  // Every TypeScript B2B column must be present in SQL authenticated allowlist
  for (const b2bCol of MARCOS_B2B_COLUMNS_LIST) {
    assert.equal(
      sqlAuthCols.includes(b2bCol),
      true,
      `SQL v_b2b_cols must include MARCOS_B2B_COLUMNS_LIST column: ${b2bCol}`
    );
  }

  // Neither anon nor authenticated may receive internal cost/margin/supplier columns
  for (const sensitiveCol of MARCOS_INTERNAL_SENSITIVE_COLUMNS_LIST) {
    assert.equal(
      sqlAnonCols.includes(sensitiveCol),
      false,
      `anon column allowlist must NOT include sensitive internal column: ${sensitiveCol}`
    );
    assert.equal(
      sqlAuthCols.includes(sensitiveCol),
      false,
      `authenticated column allowlist must NOT include sensitive internal column: ${sensitiveCol}`
    );
    assert.equal(
      MARCOS_PUBLIC_COLUMNS_LIST.includes(sensitiveCol),
      false,
      `MARCOS_PUBLIC_COLUMNS_LIST must NOT include sensitive internal column: ${sensitiveCol}`
    );
    assert.equal(
      MARCOS_B2B_COLUMNS_LIST.includes(sensitiveCol),
      false,
      `MARCOS_B2B_COLUMNS_LIST must NOT include sensitive internal column: ${sensitiveCol}`
    );
  }

  // anon must NOT receive B2B commercial columns (precio_neto_clp, precio_bruto_clp, stock)
  for (const b2bOnlyCol of MARCOS_B2B_ONLY_COLUMNS_LIST) {
    assert.equal(
      sqlAnonCols.includes(b2bOnlyCol),
      false,
      `anon column allowlist must NOT include B2B-only column: ${b2bOnlyCol}`
    );
    assert.equal(
      MARCOS_PUBLIC_COLUMNS_LIST.includes(b2bOnlyCol),
      false,
      `MARCOS_PUBLIC_COLUMNS_LIST must NOT include B2B-only column: ${b2bOnlyCol}`
    );
    assert.equal(
      sqlAuthCols.includes(b2bOnlyCol),
      true,
      `authenticated column allowlist MUST include B2B column: ${b2bOnlyCol}`
    );
  }
});

test('Migration 016 enables RLS on all 10 tables and hardens sync_cart(uuid, jsonb, timestamptz)', () => {
  const expectedRlsTables = [
    'public.marcos',
    'public.orders',
    'public.order_items',
    'public.carts',
    'public.cart_items',
    'public.profiles',
    'public.inventory_movements',
    'public.processed_webhooks',
    'public.order_email_outbox',
    'public.user_checkout_leases',
  ];

  for (const tbl of expectedRlsTables) {
    const escaped = tbl.replace('.', '\\.');
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+${escaped}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i'
    );
    assert.match(migrationSql, rlsRegex, `Migration 016 must enable RLS on ${tbl}`);
  }

  // Verify sync_cart hardening
  assert.match(
    migrationSql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.sync_cart\s*\([\s\S]*?p_cart_id\s+UUID[\s\S]*?p_items\s+JSONB[\s\S]*?p_last_updated_at\s+TIMESTAMPTZ[\s\S]*?\)[\s\S]*?SECURITY\s+INVOKER[\s\S]*?SET\s+search_path\s*=\s*public/i,
    'sync_cart must be SECURITY INVOKER with SET search_path = public'
  );
  assert.match(
    migrationSql,
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_cart\s*\(\s*UUID,\s*JSONB,\s*TIMESTAMPTZ\s*\)\s+FROM\s+PUBLIC,\s*anon;/i,
    'sync_cart execution must be revoked from PUBLIC and anon'
  );
  assert.match(
    migrationSql,
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.sync_cart\s*\(\s*UUID,\s*JSONB,\s*TIMESTAMPTZ\s*\)\s+TO\s+authenticated,\s*service_role,\s*postgres;/i,
    'sync_cart execution must be granted only to authenticated, service_role, and postgres'
  );
});

// ---------------------------------------------------------------------------
// 2. FRONTEND QUERY COMPATIBILITY & COLUMN ISOLATION TESTS
// ---------------------------------------------------------------------------

test('Zero occurrences of .from("marcos").select("*") across all frontend TypeScript files', () => {
  const frontendDir = path.resolve('./frontend');
  const tsFiles = walkTsFiles(frontendDir);
  assert.ok(tsFiles.length > 0, 'Should scan frontend TypeScript files');

  const violations = [];
  const selectStarOnMarcosRegex =
    /\.from\(\s*['"`]marcos['"`]\s*\)[\s\S]{0,120}?\.select\(\s*['"`]\*['"`]\s*\)/m;

  for (const file of tsFiles) {
    const content = stripComments(fs.readFileSync(file, 'utf8'));
    if (selectStarOnMarcosRegex.test(content)) {
      violations.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Found forbidden .from('marcos').select('*') in frontend files: ${violations.join(', ')}`
  );
});

test('Public SSR and public API endpoints do not query B2B/internal columns on marcos under anon', () => {
  // 1. frontend/app/catalogo/page.tsx (SSR runs with anon key)
  const catalogoPage = stripComments(
    fs.readFileSync(path.resolve('./frontend/app/catalogo/page.tsx'), 'utf8')
  );
  assert.ok(
    catalogoPage.includes('MARCOS_PUBLIC_COLUMNS'),
    'catalogo/page.tsx must use MARCOS_PUBLIC_COLUMNS for SSR'
  );
  assert.equal(
    catalogoPage.includes(".gt('stock'") || catalogoPage.includes('.gt("stock"'),
    false,
    'catalogo/page.tsx SSR must not filter .gt("stock") directly because anon has no SELECT privilege on stock (RLS enforces stock > 0)'
  );
  assert.equal(
    catalogoPage.includes("order('precio_neto_clp'") || catalogoPage.includes("order('stock'"),
    false,
    'catalogo/page.tsx SSR must not order by precio_neto_clp or stock under anon'
  );

  // 2. frontend/app/producto/[marca]/[modelo]/page.tsx (SSR runs with anon key)
  const productoPage = stripComments(
    fs.readFileSync(path.resolve('./frontend/app/producto/[marca]/[modelo]/page.tsx'), 'utf8')
  );
  assert.ok(
    productoPage.includes('MARCOS_PUBLIC_COLUMNS'),
    'producto/[marca]/[modelo]/page.tsx must use MARCOS_PUBLIC_COLUMNS for SSR'
  );
  assert.equal(
    productoPage.includes('precio_neto_clp'),
    false,
    'producto/[marca]/[modelo]/page.tsx SSR must not expose precio_neto_clp in public JSON-LD or query'
  );

  // 3. frontend/app/sitemap.ts
  const sitemapFile = stripComments(
    fs.readFileSync(path.resolve('./frontend/app/sitemap.ts'), 'utf8')
  );
  assert.equal(
    sitemapFile.includes('stock') || sitemapFile.includes('updated_at'),
    false,
    'sitemap.ts executable code must not query stock or updated_at under anon'
  );

  // 4. frontend/app/api/catalog/search/route.ts
  const searchRoute = stripComments(
    fs.readFileSync(path.resolve('./frontend/app/api/catalog/search/route.ts'), 'utf8')
  );
  assert.equal(
    searchRoute.includes('stock') || searchRoute.includes('precio_neto_clp'),
    false,
    'public /api/catalog/search route must not query stock or precio_neto_clp under anon'
  );
});

test('filterEngine.applyFilters safely degrades price and stock sorting when canSeePrices is false', () => {
  const rawProducts = [
    {
      id_ext: 'SKU-HIGH-PRICE',
      marca: 'Gucci',
      modelo: 'GG001',
      color: 'Black',
      codigo_color: '001',
      genero: 'Unisex',
      forma: 'Square',
      material: 'Acetate',
      tamano: '54X18X145',
      upc: '111',
      origen: 'Italy',
      imagen_principal: 'https://example.com/1.jpg',
      imagenes_secundarias: '[]',
      precio_neto_clp: 90000,
      stock: 1,
    },
    {
      id_ext: 'SKU-LOW-PRICE',
      marca: 'Coach',
      modelo: 'HC002',
      color: 'Brown',
      codigo_color: '002',
      genero: 'Mujer',
      forma: 'Round',
      material: 'Metal',
      tamano: '52X17X140',
      upc: '222',
      origen: 'China',
      imagen_principal: 'https://example.com/2.jpg',
      imagenes_secundarias: '[]',
      precio_neto_clp: 30000,
      stock: 15,
    },
  ];

  const enriched = enrichMarcos(rawProducts);

  const baseFilterState = {
    q: '',
    marca: [],
    color: [],
    genero: [],
    material: [],
    forma: [],
    calibre: [],
    sort: 'precio-asc',
    page: 1,
  };

  // When canSeePrices = true, precio-asc sorts lowest price first (SKU-LOW-PRICE)
  const resPriceSortB2B = applyFilters(enriched, { ...baseFilterState, sort: 'precio-asc' }, true);
  assert.equal(resPriceSortB2B[0].id_ext, 'SKU-LOW-PRICE');
  assert.equal(resPriceSortB2B[1].id_ext, 'SKU-HIGH-PRICE');

  // When canSeePrices = false (anon), precio-asc and stock sort fall back to 'relevancia' (preserving input order when q='')
  const resPriceSortAnon = applyFilters(enriched, { ...baseFilterState, sort: 'precio-asc' }, false);
  assert.equal(resPriceSortAnon[0].id_ext, 'SKU-HIGH-PRICE');
  assert.equal(resPriceSortAnon[1].id_ext, 'SKU-LOW-PRICE');

  const resStockSortAnon = applyFilters(enriched, { ...baseFilterState, sort: 'stock' }, false);
  assert.equal(resStockSortAnon[0].id_ext, 'SKU-HIGH-PRICE');
  assert.equal(resStockSortAnon[1].id_ext, 'SKU-LOW-PRICE');
});

// ---------------------------------------------------------------------------
// 3. ROLE-AWARE POSTGRESQL DAC + COLUMN ACL + RLS SIMULATION
// ---------------------------------------------------------------------------

/**
 * Simulates PostgreSQL DAC (table + column privileges) and RLS policies
 * as configured by supabase_migration_016_harden_marcos_catalog.sql.
 */
function createMigration016PolicySimulator(sampleRows) {
  const ALL_MARCOS_COLUMNS = new Set([
    ...MARCOS_B2B_COLUMNS_LIST,
    ...MARCOS_INTERNAL_SENSITIVE_COLUMNS_LIST,
  ]);

  const TABLE_ACL = {
    marcos: {
      anon: { SELECT: 'COLUMN_LEVEL', INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: {
        SELECT: 'COLUMN_LEVEL',
        INSERT: false,
        UPDATE: false,
        DELETE: false,
        TRUNCATE: false,
      },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    orders: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: true, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    inventory_movements: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    processed_webhooks: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    order_email_outbox: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    user_checkout_leases: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
    cart_items: {
      anon: { SELECT: false, INSERT: false, UPDATE: false, DELETE: false, TRUNCATE: false },
      authenticated: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: false },
      service_role: { SELECT: true, INSERT: true, UPDATE: true, DELETE: true, TRUNCATE: true },
    },
  };

  const MARCOS_COLUMN_SELECT_ACL = {
    anon: new Set(MARCOS_PUBLIC_COLUMNS_LIST),
    authenticated: new Set(MARCOS_B2B_COLUMNS_LIST),
    service_role: ALL_MARCOS_COLUMNS,
  };

  return {
    executeMutation({ role, table, operation }) {
      const acl = TABLE_ACL[table]?.[role];
      if (!acl || acl[operation] !== true) {
        return {
          data: null,
          error: {
            code: '42501',
            message: `permission denied for table ${table} (role=${role}, op=${operation})`,
          },
        };
      }
      return { data: { ok: true }, error: null };
    },

    selectFromTable({ role, table, selectColumns = '*', filterColumns = [] }) {
      const acl = TABLE_ACL[table]?.[role];
      if (!acl || !acl.SELECT) {
        return {
          data: null,
          error: {
            code: '42501',
            message: `permission denied for table ${table} (role=${role}, op=SELECT)`,
          },
        };
      }

      if (table === 'marcos') {
        const allowedCols = MARCOS_COLUMN_SELECT_ACL[role];
        const requestedCols =
          selectColumns === '*'
            ? Array.from(ALL_MARCOS_COLUMNS)
            : selectColumns
                .split(',')
                .map((c) => c.trim())
                .filter(Boolean);

        for (const col of [...requestedCols, ...filterColumns]) {
          if (!allowedCols.has(col)) {
            return {
              data: null,
              error: {
                code: '42501',
                message: `permission denied for column "${col}" of relation "marcos" (role=${role})`,
              },
            };
          }
        }

        // Apply RLS policy on marcos:
        // - anon: stock IS NOT NULL AND stock > 0
        // - authenticated / service_role: stock IS NOT NULL AND stock >= 0
        const visibleRows = sampleRows.filter((row) => {
          if (role === 'anon') {
            return row.stock !== null && row.stock !== undefined && row.stock > 0;
          }
          return row.stock !== null && row.stock !== undefined && row.stock >= 0;
        });

        const projected = visibleRows.map((row) => {
          const out = {};
          for (const col of requestedCols) {
            out[col] = row[col];
          }
          return out;
        });

        return { data: projected, error: null };
      }

      return { data: [], error: null };
    },
  };
}

test('Simulator: anon and authenticated cannot INSERT, UPDATE, DELETE, or TRUNCATE protected tables', () => {
  const sim = createMigration016PolicySimulator([]);

  const protectedTables = [
    'marcos',
    'orders',
    'inventory_movements',
    'processed_webhooks',
    'order_email_outbox',
    'user_checkout_leases',
  ];
  const operations = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'];

  for (const role of ['anon', 'authenticated']) {
    for (const table of protectedTables) {
      for (const operation of operations) {
        const res = sim.executeMutation({ role, table, operation });
        assert.ok(res.error, `${role} must be denied ${operation} on ${table}`);
        assert.equal(res.error.code, '42501');
      }
    }
  }

  // Even on cart_items (where authenticated has DML under RLS), TRUNCATE is strictly denied
  assert.equal(
    sim.executeMutation({ role: 'authenticated', table: 'cart_items', operation: 'TRUNCATE' })
      .error?.code,
    '42501',
    'authenticated must be denied TRUNCATE on cart_items'
  );
  assert.equal(
    sim.executeMutation({ role: 'anon', table: 'cart_items', operation: 'SELECT' }).error?.code,
    '42501',
    'anon must be denied all access to cart_items'
  );
});

test('Simulator: catalog column-level ACL and RLS isolate public vs B2B vs internal cost fields', () => {
  const sampleCatalog = [
    {
      id: 1,
      id_ext: 'SKU-IN-STOCK',
      marca: 'Oakley',
      modelo: 'OX8156',
      color: 'Satin Black',
      codigo_color: '01',
      genero: 'Hombre',
      forma: 'Rectangular',
      material: 'Acetato',
      tamano: '54X18X137',
      upc: '888392',
      origen: 'USA',
      imagen_principal: 'https://cdn.example.com/1.jpg',
      imagenes_secundarias: '[]',
      // B2B commercial fields
      stock: 5,
      precio_neto_clp: 42000,
      precio_bruto_clp: 49980,
      // Internal sensitive cost/margin fields
      costo_cif_clp: 18500,
      costo_flete_usd: 2.5,
      costo_total_chile_clp: 24000,
      costo_despacho_local_clp: 1500,
      ad_valorem_clp: 1110,
      ganancia_clp: 18000,
      iva_clp: 7980,
      precio_usd: 19.5,
      id_nywd: 'NYWD-001',
      url_origen: 'https://supplier.example.com/item/1',
    },
    {
      id: 2,
      id_ext: 'SKU-OUT-OF-STOCK',
      marca: 'Ray-Ban',
      modelo: 'RB2140',
      color: 'Tortoise',
      codigo_color: '902',
      genero: 'Unisex',
      forma: 'Wayfarer',
      material: 'Acetato',
      tamano: '50X22X150',
      upc: '805289',
      origen: 'Italy',
      imagen_principal: 'https://cdn.example.com/2.jpg',
      imagenes_secundarias: '[]',
      stock: 0,
      precio_neto_clp: 55000,
      precio_bruto_clp: 65450,
      costo_cif_clp: 25000,
      costo_flete_usd: 2.5,
      costo_total_chile_clp: 31000,
      costo_despacho_local_clp: 1500,
      ad_valorem_clp: 1500,
      ganancia_clp: 24000,
      iva_clp: 10450,
      precio_usd: 26.0,
      id_nywd: 'NYWD-002',
      url_origen: 'https://supplier.example.com/item/2',
    },
  ];

  const sim = createMigration016PolicySimulator(sampleCatalog);

  // 1. anon SELECT * fails with 42501
  const anonSelectStar = sim.selectFromTable({ role: 'anon', table: 'marcos', selectColumns: '*' });
  assert.equal(anonSelectStar.error?.code, '42501');

  // 2. anon SELECT precio_neto_clp or stock fails with 42501
  const anonSelectPrice = sim.selectFromTable({
    role: 'anon',
    table: 'marcos',
    selectColumns: 'id_ext, precio_neto_clp',
  });
  assert.equal(anonSelectPrice.error?.code, '42501');

  const anonFilterStock = sim.selectFromTable({
    role: 'anon',
    table: 'marcos',
    selectColumns: MARCOS_PUBLIC_COLUMNS,
    filterColumns: ['stock'],
  });
  assert.equal(anonFilterStock.error?.code, '42501');

  // 3. anon SELECT MARCOS_PUBLIC_COLUMNS succeeds, filters stock > 0 via RLS, and hides B2B & internal fields
  const anonPublicQuery = sim.selectFromTable({
    role: 'anon',
    table: 'marcos',
    selectColumns: MARCOS_PUBLIC_COLUMNS,
  });
  assert.equal(anonPublicQuery.error, null);
  assert.equal(
    anonPublicQuery.data.length,
    1,
    'anon RLS policy must only return rows with stock > 0'
  );
  assert.equal(anonPublicQuery.data[0].id_ext, 'SKU-IN-STOCK');
  assert.equal('precio_neto_clp' in anonPublicQuery.data[0], false);
  assert.equal('stock' in anonPublicQuery.data[0], false);
  assert.equal('costo_cif_clp' in anonPublicQuery.data[0], false);
  assert.equal('ganancia_clp' in anonPublicQuery.data[0], false);

  // 4. authenticated SELECT * fails with 42501 (because internal cost columns are restricted)
  const authSelectStar = sim.selectFromTable({
    role: 'authenticated',
    table: 'marcos',
    selectColumns: '*',
  });
  assert.equal(authSelectStar.error?.code, '42501');

  // 5. authenticated SELECT internal cost/margin columns fails with 42501
  for (const internalCol of [
    'costo_cif_clp',
    'costo_flete_usd',
    'costo_total_chile_clp',
    'ganancia_clp',
  ]) {
    const res = sim.selectFromTable({
      role: 'authenticated',
      table: 'marcos',
      selectColumns: `id_ext, ${internalCol}`,
    });
    assert.equal(
      res.error?.code,
      '42501',
      `authenticated must be denied access to ${internalCol}`
    );
  }

  // 6. authenticated SELECT MARCOS_B2B_COLUMNS succeeds, includes wholesale price & stock, excludes internal costs
  const authB2bQuery = sim.selectFromTable({
    role: 'authenticated',
    table: 'marcos',
    selectColumns: MARCOS_B2B_COLUMNS,
  });
  assert.equal(authB2bQuery.error, null);
  assert.equal(
    authB2bQuery.data.length,
    2,
    'authenticated RLS policy allows reading all catalog items with stock >= 0 for history/cart reconciliation'
  );
  assert.equal(authB2bQuery.data[0].precio_neto_clp, 42000);
  assert.equal(authB2bQuery.data[0].precio_bruto_clp, 49980);
  assert.equal(authB2bQuery.data[0].stock, 5);
  assert.equal('costo_cif_clp' in authB2bQuery.data[0], false);
  assert.equal('ganancia_clp' in authB2bQuery.data[0], false);

  // 7. authenticated SELECT MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS succeeds for client hydration
  const authOverlayQuery = sim.selectFromTable({
    role: 'authenticated',
    table: 'marcos',
    selectColumns: MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS,
  });
  assert.equal(authOverlayQuery.error, null);
  assert.deepEqual(Object.keys(authOverlayQuery.data[0]), [
    'id_ext',
    'precio_neto_clp',
    'precio_bruto_clp',
    'stock',
  ]);
});
