// test_admin_security_auth.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register the path alias loader for @/ resolution under Node.js native ESM
register('./test_alias_loader.mjs', pathToFileURL('./'));

const { handleSyncGet, handleSyncPost, GET, POST } = await import(
  './frontend/app/api/admin/sync/route.ts'
);
const { handleScraper, POST: handleScraperPost } = await import(
  './frontend/app/api/admin/scraper/route.ts'
);

const ADMIN_EMAIL = 'multifocuslimitada@gmail.com';
const CLIENT_EMAIL = 'optica_cliente@test.cl';

function createMockAuthClient() {
  const usersByToken = new Map([
    [
      'valid_admin_token',
      { id: 'admin-uuid', email: ADMIN_EMAIL, role: 'authenticated' },
    ],
    [
      'valid_client_token',
      { id: 'client-uuid', email: CLIENT_EMAIL, role: 'authenticated' },
    ],
  ]);

  return {
    auth: {
      getUser: async (token) => {
        if (usersByToken.has(token)) {
          return { data: { user: usersByToken.get(token) }, error: null };
        }
        return { data: { user: null }, error: new Error('Invalid or expired token') };
      },
    },
  };
}

test('1. Admin routes reject requests missing Authorization header (401)', async () => {
  const reqSyncGet = new Request('http://localhost:3000/api/admin/sync', { method: 'GET' });
  const resSyncGet = await handleSyncGet(reqSyncGet);
  assert.equal(resSyncGet.status, 401, 'Sync GET without auth must return 401');

  const reqSyncPost = new Request('http://localhost:3000/api/admin/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand: 'Guess', dry_run: true }),
  });
  const resSyncPost = await handleSyncPost(reqSyncPost);
  assert.equal(resSyncPost.status, 401, 'Sync POST without auth must return 401');

  const reqScraperPost = new Request('http://localhost:3000/api/admin/scraper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'full-catalog' }),
  });
  const resScraperPost = await handleScraperPost(reqScraperPost);
  assert.equal(resScraperPost.status, 401, 'Scraper POST without auth must return 401');
});

test('2. Admin routes reject malformed Bearer header (401)', async () => {
  const customAuthClient = createMockAuthClient();

  const reqSyncGet = new Request('http://localhost:3000/api/admin/sync', {
    method: 'GET',
    headers: { Authorization: 'Basic dXNlcjpwYXNz' },
  });
  const resSyncGet = await handleSyncGet(reqSyncGet, { customAuthClient });
  assert.equal(resSyncGet.status, 401);

  const reqScraperPost = new Request('http://localhost:3000/api/admin/scraper', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'NotBearer 123',
    },
    body: JSON.stringify({ mode: 'full-catalog' }),
  });
  const resScraperPost = await handleScraperPost(reqScraperPost, { customAuthClient });
  assert.equal(resScraperPost.status, 401);
});

test('3. Admin routes reject invalid or expired Bearer token (401)', async () => {
  const customAuthClient = createMockAuthClient();

  const reqSyncGet = new Request('http://localhost:3000/api/admin/sync', {
    method: 'GET',
    headers: { Authorization: 'Bearer invalid_or_expired_token' },
  });
  const resSyncGet = await handleSyncGet(reqSyncGet, { customAuthClient });
  assert.equal(resSyncGet.status, 401, 'Sync GET with invalid token must return 401');

  const reqSyncPost = new Request('http://localhost:3000/api/admin/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer invalid_or_expired_token',
    },
    body: JSON.stringify({ brand: 'Guess', dry_run: true }),
  });
  const resSyncPost = await handleSyncPost(reqSyncPost, { customAuthClient });
  assert.equal(resSyncPost.status, 401, 'Sync POST with invalid token must return 401');

  const reqScraperPost = new Request('http://localhost:3000/api/admin/scraper', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer invalid_or_expired_token',
    },
    body: JSON.stringify({ mode: 'full-catalog' }),
  });
  const resScraperPost = await handleScraper(reqScraperPost, { customAuthClient });
  assert.equal(resScraperPost.status, 401, 'Scraper POST with invalid token must return 401');
});

test('4. Admin routes return 403 Forbidden when called by authenticated regular (non-admin) user', async () => {
  const customAuthClient = createMockAuthClient();

  // GET /api/admin/sync
  const reqSyncGet = new Request('http://localhost:3000/api/admin/sync', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid_client_token' },
  });
  const resSyncGet = await handleSyncGet(reqSyncGet, { customAuthClient });
  assert.equal(resSyncGet.status, 403, 'Sync GET called by non-admin must return 403');
  const bodySyncGet = await resSyncGet.json();
  assert.match(bodySyncGet.error, /administrador/i);

  // POST /api/admin/sync
  const reqSyncPost = new Request('http://localhost:3000/api/admin/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid_client_token',
    },
    body: JSON.stringify({ brand: 'Guess', dry_run: true }),
  });
  const resSyncPost = await handleSyncPost(reqSyncPost, { customAuthClient });
  assert.equal(resSyncPost.status, 403, 'Sync POST called by non-admin must return 403');
  const bodySyncPost = await resSyncPost.json();
  assert.match(bodySyncPost.error, /administrador/i);

  // POST /api/admin/scraper
  const reqScraperPost = new Request('http://localhost:3000/api/admin/scraper', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid_client_token',
    },
    body: JSON.stringify({ mode: 'full-catalog' }),
  });
  const resScraperPost = await handleScraper(reqScraperPost, { customAuthClient });
  assert.equal(resScraperPost.status, 403, 'Scraper POST called by non-admin must return 403');
  const bodyScraperPost = await resScraperPost.json();
  assert.match(bodyScraperPost.error, /administrador/i);
});

test('5. Admin routes allow requests from verified administrator (proceeds past auth check)', async () => {
  const customAuthClient = createMockAuthClient();

  // POST /api/admin/scraper with admin token
  const reqScraperPost = new Request('http://localhost:3000/api/admin/scraper', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid_admin_token',
    },
    body: JSON.stringify({ mode: 'full-catalog' }),
  });
  const resScraperPost = await handleScraper(reqScraperPost, { customAuthClient });
  // Should NOT be 401 or 403
  assert.notEqual(resScraperPost.status, 401);
  assert.notEqual(resScraperPost.status, 403);
  assert.equal(resScraperPost.status, 200);
  const data = await resScraperPost.json();
  assert.equal(data.status, 'info');
});
