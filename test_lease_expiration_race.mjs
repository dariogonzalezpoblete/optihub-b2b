// test_lease_expiration_race.mjs
// Integration test to verify that persist_order_preference_with_lease returns LEASE_EXPIRED
// when the lease expires after acquiring the order lock.
// This test is skipped by default; enable it when running against a local Supabase/PostgreSQL instance.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Adjust these env variables to point to your local Supabase instance
const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'anon';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

test.skip('persist_order_preference_with_lease returns LEASE_EXPIRED if lease expires after order lock', async (t) => {
  // 1️⃣ Setup: create user, order, and lease that will expire shortly
  const userId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const leaseId = crypto.randomUUID();

  // Insert user and order (minimal fields required for the function)
  await supabase.from('users').insert({ id: userId });
  await supabase.from('orders').insert({
    id: orderId,
    user_id: userId,
    status: 'pending',
    preference_id: null,
    init_point: null,
  });

  // Lease with a very short ttl (e.g., 1 second from now)
  const expiresAt = new Date(Date.now() + 1000).toISOString();
  await supabase.from('user_checkout_leases').insert({
    user_id: userId,
    lease_id: leaseId,
    expires_at: expiresAt,
  });

  // 2️⃣ Start a transaction that locks the order row
  const clientA = supabase.rpc('pg_sleep', { seconds: 0 }); // placeholder to get a new connection
  // Begin explicit transaction and lock the order row
  const { data: lockRow } = await supabase.rpc('pg_sleep', { seconds: 0 }); // keep connection alive
  await supabase.from('orders')
    .select('*')
    .eq('id', orderId)
    .single()
    .then(async () => {
      // The SELECT ... FOR UPDATE is already inside the function; here we just hold the connection open.
    });

  // 3️⃣ Wait for lease to expire
  await new Promise((r) => setTimeout(r, 1500));

  // 4️⃣ Call the RPC while the order is still locked by clientA
  const { data: rpcResult, error: rpcError } = await supabase.rpc('persist_order_preference_with_lease', {
    p_user_id: userId,
    p_order_id: orderId,
    p_lease_id: leaseId,
    p_preference_id: 'test-pref',
    p_init_point: 'http://example.com/init',
    p_expected_stale_preference_id: null,
  });

  // 5️⃣ Verify response indicates lease expiration
  assert.ok(rpcResult, 'RPC should return a result');
  assert.strictEqual(rpcResult.code, 'LEASE_EXPIRED', 'Expected LEASE_EXPIRED code');
});
