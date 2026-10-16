// test_password_recovery_auth.mjs
// Automated test suite for OptiHub B2B: Stage 2C.8 - Strict In-Memory Recovery Proof, SDK-in-the-loop & Lifecycle

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// IMPORTACIÓN DEL CÓDIGO REAL DE PRODUCCIÓN
import {
  parseJwtPayload,
  isRecoverySession,
  validateRecoveryUrlParams,
  validatePasswordInput,
  sanitizeRecoveryEmail,
  resolveSafeRedirectUrl,
  maskEmail,
  shouldSelectivelyCloseAbandonedRecovery,
} from './frontend/lib/auth/passwordRecovery.ts';
import {
  RECOVERY_PROOF_TTL_MS,
  getSessionIdFromSession,
  getRecoveryProof,
  clearRecoveryProof,
  consumeRecoveryProof,
  getCallbackProbe,
  clearCallbackProbe,
  __resetRecoveryProofForTests,
  installRecoveryProof,
  evaluateRecoveryAuthorization,
  verifyRecoveryAuthorization,
} from './frontend/lib/auth/recoveryProof.ts';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { GoTrueClient } = require('./frontend/node_modules/@supabase/auth-js/dist/main/index.js');

// Helper para crear JWTs simulados válidos con claims personalizados
function createMockJwt(claims, headerObj = { alg: 'HS256', typ: 'JWT' }) {
  const header = Buffer.from(JSON.stringify(headerObj)).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const sig = Buffer.from('mock-signature-bytes').toString('base64url');
  return `${header}.${payload}.${sig}`;
}

// Helper para crear un cliente simulado con bus de eventos onAuthStateChange
function createMockSupabaseClient({ initialSession = null, claimsResponse = null } = {}) {
  const listeners = new Set();
  let currentSession = initialSession;

  const client = {
    auth: {
      onAuthStateChange(cb) {
        listeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(cb);
              },
            },
          },
        };
      },
      async getSession() {
        return { data: { session: currentSession }, error: null };
      },
      async getClaims() {
        if (claimsResponse) {
          return typeof claimsResponse === 'function' ? await claimsResponse() : claimsResponse;
        }
        if (!currentSession?.access_token) {
          return { data: null, error: null };
        }
        const parsed = parseJwtPayload(currentSession.access_token);
        return { data: { claims: parsed }, error: null };
      },
    },
    __emit(event, session) {
      currentSession = session;
      for (const cb of listeners) {
        cb(event, session);
      }
    },
    __setSession(session) {
      currentSession = session;
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// TEST 1: Login Page contiene el enlace accesible a "/recuperar-password"
// ---------------------------------------------------------------------------
test('1. Login Page contiene el enlace accesible a "/recuperar-password"', () => {
  const loginFilePath = path.join(process.cwd(), 'frontend', 'app', 'login', 'page.tsx');
  assert.ok(fs.existsSync(loginFilePath), 'El archivo login/page.tsx debe existir');

  const content = fs.readFileSync(loginFilePath, 'utf8');
  assert.ok(
    content.includes('href="/recuperar-password"'),
    'El archivo login/page.tsx debe incluir el enlace con href="/recuperar-password"'
  );
  assert.ok(
    content.includes('¿Olvidaste tu contraseña?'),
    'El texto del enlace debe ser exactamente "¿Olvidaste tu contraseña?"'
  );
});

// ---------------------------------------------------------------------------
// TEST 2: Validación, sanitización y enmascarado de correo
// ---------------------------------------------------------------------------
test('2. sanitizeRecoveryEmail y maskEmail validan y formatean correos correctamente', () => {
  assert.deepStrictEqual(sanitizeRecoveryEmail('  contacto@tuoptica.cl  '), {
    valid: true,
    email: 'contacto@tuoptica.cl',
  });
  assert.deepStrictEqual(sanitizeRecoveryEmail('admin.ventas@optica-central.com'), {
    valid: true,
    email: 'admin.ventas@optica-central.com',
  });

  assert.strictEqual(sanitizeRecoveryEmail('').valid, false);
  assert.strictEqual(sanitizeRecoveryEmail('correo-sin-arroba.cl').valid, false);
  assert.strictEqual(sanitizeRecoveryEmail('@dominio.cl').valid, false);
  assert.strictEqual(sanitizeRecoveryEmail('correo con espacios@optica.cl').valid, false);

  assert.strictEqual(maskEmail('contacto@tuoptica.cl'), 'c***@tuoptica.cl');
  assert.strictEqual(maskEmail('a@b.cl'), 'a***@b.cl');
  assert.strictEqual(maskEmail(null), null);
  assert.strictEqual(maskEmail('invalido'), null);
});

// ---------------------------------------------------------------------------
// TEST 3: Construcción controlada de URL de retorno
// ---------------------------------------------------------------------------
test('3. resolveSafeRedirectUrl genera estrictamente /actualizar-password sin entradas arbitrarias', () => {
  assert.strictEqual(
    resolveSafeRedirectUrl('https://optihub-b2b.vercel.app'),
    'https://optihub-b2b.vercel.app/actualizar-password'
  );
  assert.strictEqual(
    resolveSafeRedirectUrl('https://optihub.cl/'),
    'https://optihub.cl/actualizar-password'
  );
});

// ---------------------------------------------------------------------------
// TEST 4: Autorización estricta en memoria — ausente, expirada, consumida o manipulada en sessionStorage
// ---------------------------------------------------------------------------
test('4. evaluateRecoveryAuthorization y verifyRecoveryAuthorization rechazan sesiones ordinarias, sessionStorage manipulado y pruebas inválidas', async () => {
  __resetRecoveryProofForTests();

  const now = 1_700_000_000_000;
  const validClaims = {
    sub: 'usr-100',
    session_id: 'sess-abc-123',
    amr: [{ method: 'recovery' }],
  };

  // A. Sin prueba en memoria -> RECHAZADO aunque los claims tengan amr: recovery
  const noProofDecision = evaluateRecoveryAuthorization({
    claims: validClaims,
    sessionUserId: 'usr-100',
    proof: null,
    now,
  });
  assert.strictEqual(noProofDecision.authorized, false);
  assert.strictEqual(noProofDecision.reason, 'no_proof');

  // B. Manipulación de sessionStorage no tiene efecto alguno en la autorización
  const fakeWindow = {
    location: { pathname: '/actualizar-password', search: '', hash: '' },
    sessionStorage: {
      getItem(k) {
        if (k === 'optihub_recovery_in_progress') return 'true';
        if (k === 'optihub_recovery_user_id') return 'usr-100';
        return null;
      },
    },
  };
  const ordinarySession = {
    user: { id: 'usr-100', email: 'optica@cliente.cl' },
    access_token: createMockJwt({ sub: 'usr-100', session_id: 'sess-ordinary', amr: ['password'] }),
  };
  const clientOrdinary = createMockSupabaseClient({ initialSession: ordinarySession });
  installRecoveryProof(clientOrdinary, fakeWindow);

  const storageTamperCheck = await verifyRecoveryAuthorization(clientOrdinary);
  assert.strictEqual(storageTamperCheck.authorized, false);
  assert.strictEqual(storageTamperCheck.reason, 'no_proof');

  // C. Prueba expirada (supera TTL) -> RECHAZADO
  const expiredDecision = evaluateRecoveryAuthorization({
    claims: validClaims,
    sessionUserId: 'usr-100',
    proof: {
      userId: 'usr-100',
      sessionId: 'sess-abc-123',
      at: now - RECOVERY_PROOF_TTL_MS - 1,
      consumed: false,
    },
    now,
  });
  assert.strictEqual(expiredDecision.authorized, false);
  assert.strictEqual(expiredDecision.reason, 'expired');

  // D. Prueba consumida -> RECHAZADO
  const consumedDecision = evaluateRecoveryAuthorization({
    claims: validClaims,
    sessionUserId: 'usr-100',
    proof: {
      userId: 'usr-100',
      sessionId: 'sess-abc-123',
      at: now - 1000,
      consumed: true,
    },
    now,
  });
  assert.strictEqual(consumedDecision.authorized, false);
  assert.strictEqual(consumedDecision.reason, 'consumed');

  // E. Mismatch de userId o session_id -> RECHAZADO
  assert.strictEqual(
    evaluateRecoveryAuthorization({
      claims: validClaims,
      sessionUserId: 'usr-100',
      proof: { userId: 'usr-otro', sessionId: 'sess-abc-123', at: now, consumed: false },
      now,
    }).reason,
    'user_mismatch'
  );
  assert.strictEqual(
    evaluateRecoveryAuthorization({
      claims: validClaims,
      sessionUserId: 'usr-100',
      proof: { userId: 'usr-100', sessionId: 'sess-otra', at: now, consumed: false },
      now,
    }).reason,
    'session_mismatch'
  );

  // F. Prueba íntegra coincidente con sub y session_id -> AUTORIZADO
  const okDecision = evaluateRecoveryAuthorization({
    claims: validClaims,
    sessionUserId: 'usr-100',
    proof: { userId: 'usr-100', sessionId: 'sess-abc-123', at: now - 5000, consumed: false },
    now,
  });
  assert.strictEqual(okDecision.authorized, true);
});

// ---------------------------------------------------------------------------
// TEST 5: Evento antes del montaje de React y doble montaje de Strict Mode
// ---------------------------------------------------------------------------
test('5. Captura síncrona antes del montaje de React e inmunidad al doble montaje de StrictMode', async () => {
  __resetRecoveryProofForTests();

  const recoverySession = {
    user: { id: 'usr-early', email: 'ventas@optica.cl' },
    access_token: createMockJwt({ sub: 'usr-early', session_id: 'sess-early-1' }),
  };

  const mockWin = {
    location: {
      pathname: '/actualizar-password',
      search: '',
      hash: '#access_token=tok&type=recovery',
    },
  };

  // 1. El módulo supabaseClient instala installRecoveryProof ANTES de que React monte cualquier componente
  const client = createMockSupabaseClient({ initialSession: recoverySession });
  installRecoveryProof(client, mockWin);

  // El SDK emite INITIAL_SESSION (debe ser ignorado) y luego PASSWORD_RECOVERY antes de montar la página
  client.__emit('INITIAL_SESSION', recoverySession);
  assert.strictEqual(getRecoveryProof(), null, 'INITIAL_SESSION no debe crear ni borrar prueba');

  client.__emit('PASSWORD_RECOVERY', recoverySession);
  assert.ok(getRecoveryProof(), 'PASSWORD_RECOVERY antes del montaje debe quedar capturado en memoria');
  assert.strictEqual(getRecoveryProof().sessionId, 'sess-early-1');

  // 2. Simulación del ciclo de efecto con runIdRef bajo React Strict Mode (montaje 1 -> cleanup 1 -> montaje 2)
  const runIdRef = { current: 0 };
  let checkingSession = true;
  let isSessionValid = false;

  const runEffectMount = async () => {
    const currentRunId = ++runIdRef.current;
    const isCurrentRun = () => runIdRef.current === currentRunId;

    const verifyPromise = (async () => {
      const decision = await verifyRecoveryAuthorization(client);
      if (!isCurrentRun()) return;
      isSessionValid = decision.authorized;
      checkingSession = false;
    })();

    const cleanup = () => {
      if (runIdRef.current === currentRunId) {
        runIdRef.current++;
      }
    };

    return { verifyPromise, cleanup };
  };

  // Montaje 1 se desmonta inmediatamente (Strict Mode) antes de resolver
  const mount1 = await runEffectMount();
  mount1.cleanup();

  // Montaje 2 se ejecuta inmediatamente después y debe completar sin quedar bloqueado en "Verificando..."
  const mount2 = await runEffectMount();
  await mount1.verifyPromise;
  await mount2.verifyPromise;

  assert.strictEqual(checkingSession, false, 'StrictMode no debe dejar la página bloqueada en checkingSession=true');
  assert.strictEqual(isSessionValid, true, 'El segundo montaje de StrictMode debe autorizar con la prueba en memoria');
});

// ---------------------------------------------------------------------------
// TEST 6: Colisión A -> B (recuperación abandonada de A seguida de B) y cierre selectivo
// ---------------------------------------------------------------------------
test('6. Recuperación abandonada de usuario A seguida de B reemplaza la prueba; cierre selectivo protege sesiones ordinarias', async () => {
  __resetRecoveryProofForTests();

  const sessionA = {
    user: { id: 'user-A', email: 'a@optica.cl' },
    access_token: createMockJwt({ sub: 'user-A', session_id: 'sess-A', amr: [{ method: 'recovery' }] }),
  };
  const sessionB = {
    user: { id: 'user-B', email: 'b@optica.cl' },
    access_token: createMockJwt({ sub: 'user-B', session_id: 'sess-B', amr: ['recovery'] }),
  };
  const ordinarySessionA = {
    user: { id: 'user-A', email: 'a@optica.cl' },
    access_token: createMockJwt({ sub: 'user-A', session_id: 'sess-ord-A', amr: ['password'] }),
  };

  const client = createMockSupabaseClient({ initialSession: sessionA });
  installRecoveryProof(client, { location: { pathname: '/actualizar-password', search: '', hash: '' } });

  // Usuario A abre enlace pero abandona sin cambiar clave
  client.__emit('PASSWORD_RECOVERY', sessionA);
  assert.strictEqual((await verifyRecoveryAuthorization(client)).authorized, true);

  // Usuario B abre su propio enlace en el mismo navegador: reemplaza la prueba de A
  client.__emit('PASSWORD_RECOVERY', sessionB);
  assert.strictEqual(getRecoveryProof().userId, 'user-B');
  assert.strictEqual(getRecoveryProof().sessionId, 'sess-B');

  // Con la sesión activa de B, B está autorizado; si intentara usarse la sesión de A, falla
  const authB = await verifyRecoveryAuthorization(client);
  assert.strictEqual(authB.authorized, true);

  client.__setSession(sessionA);
  const authStaleA = await verifyRecoveryAuthorization(client);
  assert.strictEqual(authStaleA.authorized, false);
  assert.strictEqual(authStaleA.reason, 'user_mismatch');

  // Cierre selectivo ante callback fallido:
  // - Cierra si la sesión almacenada es identificable como recuperación (amr: recovery en objeto o string)
  assert.strictEqual(
    shouldSelectivelyCloseAbandonedRecovery({ hasFailedCallback: true, session: sessionA }),
    true
  );
  assert.strictEqual(
    shouldSelectivelyCloseAbandonedRecovery({ hasFailedCallback: true, session: sessionB }),
    true
  );
  // - NUNCA cierra una sesión ordinaria (amr: password) aunque falle un callback en la URL
  assert.strictEqual(
    shouldSelectivelyCloseAbandonedRecovery({ hasFailedCallback: true, session: ordinarySessionA }),
    false
  );
  // - No cierra nada si no hubo callback fallido
  assert.strictEqual(
    shouldSelectivelyCloseAbandonedRecovery({ hasFailedCallback: false, session: sessionA }),
    false
  );
});

// ---------------------------------------------------------------------------
// TEST 7: Eventos SIGNED_IN de otro usuario y SIGNED_OUT invalidan la prueba en memoria
// ---------------------------------------------------------------------------
test('7. Ciclo de vida: SIGNED_OUT o cambio de sesión/usuario invalidan la prueba en memoria', async () => {
  __resetRecoveryProofForTests();

  const recSession = {
    user: { id: 'usr-test' },
    access_token: createMockJwt({ sub: 'usr-test', session_id: 'sess-rec-1' }),
  };
  const client = createMockSupabaseClient({ initialSession: recSession });
  installRecoveryProof(client, { location: { pathname: '/actualizar-password', search: '', hash: '' } });

  client.__emit('PASSWORD_RECOVERY', recSession);
  assert.strictEqual((await verifyRecoveryAuthorization(client)).authorized, true);

  // Si inicia sesión una sesión distinta (otro session_id), la prueba se invalida
  const newLoginSession = {
    user: { id: 'usr-test' },
    access_token: createMockJwt({ sub: 'usr-test', session_id: 'sess-normal-2', amr: ['password'] }),
  };
  client.__emit('SIGNED_IN', newLoginSession);
  assert.strictEqual(getRecoveryProof(), null, 'Un SIGNED_IN con distinto session_id debe invalidar la prueba');
  assert.strictEqual((await verifyRecoveryAuthorization(client)).authorized, false);

  // Re-emite PASSWORD_RECOVERY y luego SIGNED_OUT
  client.__emit('PASSWORD_RECOVERY', recSession);
  assert.ok(getRecoveryProof());
  client.__emit('SIGNED_OUT', null);
  assert.strictEqual(getRecoveryProof(), null, 'SIGNED_OUT debe limpiar la prueba en memoria');
});

// ---------------------------------------------------------------------------
// TEST 8: Callbacks inválidos, expirados y ?code= no soportado en flujo implícito
// ---------------------------------------------------------------------------
test('8. validateRecoveryUrlParams y la sonda síncrona detectan errores y callbacks ?code=', () => {
  __resetRecoveryProofForTests();

  // Query param con error de Supabase
  const qError = new URLSearchParams('error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid');
  const resQ = validateRecoveryUrlParams({ searchParams: qError });
  assert.strictEqual(resQ.hasError, true);
  assert.ok(resQ.errorMessage.includes('inválido, ha expirado'));

  // Hash param con error de Supabase
  const resH = validateRecoveryUrlParams({ hashString: '#error=access_denied&error_code=otp_expired' });
  assert.strictEqual(resH.hasError, true);

  // Sonda captura ?code= y errores antes de que se limpie la URL
  const client = createMockSupabaseClient();
  installRecoveryProof(client, {
    location: {
      pathname: '/actualizar-password',
      search: '?code=unsupported-pkce-code',
      hash: '',
    },
  });
  const probe = getCallbackProbe();
  assert.ok(probe);
  assert.strictEqual(probe.hasCallback, true);
  assert.strictEqual(probe.hasCode, true);
  assert.strictEqual(probe.hasError, false);

  clearCallbackProbe();
  assert.strictEqual(getCallbackProbe(), null);
});

// ---------------------------------------------------------------------------
// TEST 9: Errores de getClaims, errores de updateUser y tolerancia a fallos de signOut
// ---------------------------------------------------------------------------
test('9. Manejo de errores en getClaims, updateUser y resiliencia ante fallo de signOut post-actualización', async () => {
  __resetRecoveryProofForTests();

  // Validación de entrada de contraseña
  assert.strictEqual(validatePasswordInput('12345', '12345').valid, false);
  assert.strictEqual(validatePasswordInput('Valida123!', 'Distinta123!').valid, false);
  assert.strictEqual(validatePasswordInput('Valida123!', 'Valida123!').valid, true);

  const session = {
    user: { id: 'usr-99' },
    access_token: createMockJwt({ sub: 'usr-99', session_id: 'sess-99' }),
  };

  // A. getClaims devuelve error -> verifyRecoveryAuthorization falla cerrado
  const clientFailingClaims = createMockSupabaseClient({
    initialSession: session,
    claimsResponse: { data: null, error: new Error('JWKS signature verification failed') },
  });
  installRecoveryProof(clientFailingClaims, { location: { pathname: '/actualizar-password', search: '', hash: '' } });
  clientFailingClaims.__emit('PASSWORD_RECOVERY', session);

  const failClaimsDecision = await verifyRecoveryAuthorization(clientFailingClaims);
  assert.strictEqual(failClaimsDecision.authorized, false);
  assert.strictEqual(failClaimsDecision.reason, 'no_claims');

  // B. Flujo completo de updatePassword: si updateUser falla, la prueba NO se consume;
  //    si updateUser tiene éxito y signOut lanza excepción, igualmente consume la prueba y retorna éxito.
  __resetRecoveryProofForTests();
  const clientOk = createMockSupabaseClient({ initialSession: session });
  installRecoveryProof(clientOk, { location: { pathname: '/actualizar-password', search: '', hash: '' } });
  clientOk.__emit('PASSWORD_RECOVERY', session);

  const runUpdatePassword = async ({ updateUserError = null, signOutThrows = false }) => {
    const decision = await verifyRecoveryAuthorization(clientOk);
    if (!decision.authorized) {
      return { error: { name: 'UnauthorizedRecoveryError', message: 'No autorizado' } };
    }
    if (updateUserError) {
      return { error: updateUserError };
    }
    consumeRecoveryProof();
    clearRecoveryProof();
    try {
      if (signOutThrows) throw new Error('Network failure during local signOut');
    } catch {
      // signOut encapsulado en try/catch: no revierte el éxito del cambio de contraseña
    }
    return { error: null };
  };

  // B1. Fallo en updateUser (p. ej. misma contraseña) -> retorna error y conserva prueba para reintentar
  const failedUpdate = await runUpdatePassword({
    updateUserError: { name: 'AuthApiError', message: 'New password should be different from the old password.' },
  });
  assert.ok(failedUpdate.error);
  assert.strictEqual((await verifyRecoveryAuthorization(clientOk)).authorized, true, 'Puede corregir y reintentar si updateUser falló');

  // B2. Éxito en updateUser aunque signOut lance excepción -> retorna error: null y consume/limpia la prueba
  const successDespiteSignOut = await runUpdatePassword({ updateUserError: null, signOutThrows: true });
  assert.strictEqual(successDespiteSignOut.error, null);
  assert.strictEqual(getRecoveryProof(), null);
});

// ---------------------------------------------------------------------------
// TEST 10: Consumo de prueba tras cambio exitoso e imposibilidad de reutilización o recarga
// ---------------------------------------------------------------------------
test('10. Tras cambiar la contraseña o recargar la página, no es posible reutilizar la sesión para un segundo cambio', async () => {
  __resetRecoveryProofForTests();

  const session = {
    user: { id: 'usr-reset' },
    access_token: createMockJwt({ sub: 'usr-reset', session_id: 'sess-reset-1', amr: [{ method: 'recovery' }] }),
  };
  const client = createMockSupabaseClient({ initialSession: session });
  installRecoveryProof(client, { location: { pathname: '/actualizar-password', search: '', hash: '' } });

  client.__emit('PASSWORD_RECOVERY', session);
  assert.strictEqual((await verifyRecoveryAuthorization(client)).authorized, true);

  // Se consume la prueba tras el primer cambio exitoso
  consumeRecoveryProof();
  assert.strictEqual((await verifyRecoveryAuthorization(client)).authorized, false);
  assert.strictEqual((await verifyRecoveryAuthorization(client)).reason, 'consumed');

  // Si el usuario recarga la página (memoria reiniciada), incluso si la sesión siguiera en storage con amr: recovery,
  // verifyRecoveryAuthorization rechaza con reason: 'no_proof'
  __resetRecoveryProofForTests();
  const afterReload = await verifyRecoveryAuthorization(client);
  assert.strictEqual(afterReload.authorized, false);
  assert.strictEqual(afterReload.reason, 'no_proof');
});

// ---------------------------------------------------------------------------
// TEST 11: ARG-07 — resolveSafeRedirectUrl neutraliza URLs arbitrarias y garantiza origen seguro
// ---------------------------------------------------------------------------
test('11. ARG-07: resolveSafeRedirectUrl previene open redirects y asegura ruta /actualizar-password', () => {
  assert.strictEqual(
    resolveSafeRedirectUrl('https://optihub.cl'),
    'https://optihub.cl/actualizar-password'
  );
  assert.strictEqual(
    resolveSafeRedirectUrl('https://optihub.cl/malicious/path?attack=1'),
    'https://optihub.cl/actualizar-password'
  );
  assert.strictEqual(
    resolveSafeRedirectUrl('optihub.cl'),
    'https://optihub.cl/actualizar-password'
  );
  assert.strictEqual(resolveSafeRedirectUrl(''), '/actualizar-password');
  assert.strictEqual(resolveSafeRedirectUrl(undefined), '/actualizar-password');
});

// ---------------------------------------------------------------------------
// TEST 12: SDK-in-the-loop con GoTrueClient real + verificación estática de higiene del código
// ---------------------------------------------------------------------------
test('12. SDK-in-the-loop (GoTrueClient real): captura PASSWORD_RECOVERY desde hash implícito, verifica getClaims y preserva sesión ante callback expirado', async () => {
  __resetRecoveryProofForTests();

  const expSec = Math.floor(Date.now() / 1000) + 3600;
  const recoveryJwt = createMockJwt({
    iss: 'https://example.supabase.co/auth/v1',
    sub: 'usr-sdk-real',
    aud: 'authenticated',
    exp: expSec,
    iat: expSec - 10,
    role: 'authenticated',
    aal: 'aal1',
    session_id: 'sess-sdk-real-777',
    amr: [{ method: 'recovery' }],
  });

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevHistory = globalThis.history;
  const prevLocation = globalThis.location;

  try {
    // 1. Entorno navegador simulado con hash implícito de recuperación
    const mockLocation = {
      href: `https://optihub.cl/actualizar-password#access_token=${recoveryJwt}&refresh_token=ref-123&expires_in=3600&token_type=bearer&type=recovery`,
      origin: 'https://optihub.cl',
      pathname: '/actualizar-password',
      search: '',
      hash: `#access_token=${recoveryJwt}&refresh_token=ref-123&expires_in=3600&token_type=bearer&type=recovery`,
    };
    const mockHistory = {
      replaceState(_state, _title, url) {
        mockLocation.href = `https://optihub.cl${url}`;
        mockLocation.hash = '';
        mockLocation.search = '';
      },
    };
    globalThis.window = {
      location: mockLocation,
      history: mockHistory,
      addEventListener() {},
      removeEventListener() {},
    };
    globalThis.location = mockLocation;
    globalThis.history = mockHistory;
    globalThis.document = { title: 'OptiHub', visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };

    const memoryStorage = new Map();
    const storageAdapter = {
      getItem: (k) => (memoryStorage.has(k) ? memoryStorage.get(k) : null),
      setItem: (k, v) => memoryStorage.set(k, v),
      removeItem: (k) => memoryStorage.delete(k),
    };

    const fakeFetch = async (url) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/user')) {
        return new Response(
          JSON.stringify({ id: 'usr-sdk-real', aud: 'authenticated', role: 'authenticated', email: 'real@optica.cl' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const authClient = new GoTrueClient({
      url: 'https://example.supabase.co/auth/v1',
      storageKey: 'sb-test-auth-token',
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: true,
      storage: storageAdapter,
      fetch: fakeFetch,
    });

    try {
      const wrappedClient = { auth: authClient };
      installRecoveryProof(wrappedClient, globalThis.window);

      await authClient.initializePromise;
      // Esperar al setTimeout(0) donde GoTrueClient emite PASSWORD_RECOVERY
      await new Promise((r) => setTimeout(r, 30));

      // Un suscriptor tardío registrado DESPUÉS de initialize solo recibe INITIAL_SESSION
      const lateEvents = [];
      const { data: lateSub } = authClient.onAuthStateChange((ev) => lateEvents.push(ev));
      await new Promise((r) => setTimeout(r, 20));
      lateSub.subscription.unsubscribe();
      assert.deepStrictEqual(lateEvents, ['INITIAL_SESSION'], 'Un suscriptor tardío solo recibe INITIAL_SESSION');

      // Nuestro suscriptor síncrono capturó PASSWORD_RECOVERY y verifyRecoveryAuthorization autoriza vía getClaims() real
      const proof = getRecoveryProof();
      assert.ok(proof, 'El suscriptor síncrono debe haber capturado PASSWORD_RECOVERY del GoTrueClient real');
      assert.strictEqual(proof.userId, 'usr-sdk-real');
      assert.strictEqual(proof.sessionId, 'sess-sdk-real-777');

      const realAuthDecision = await verifyRecoveryAuthorization(wrappedClient);
      assert.strictEqual(realAuthDecision.authorized, true);
      assert.strictEqual(realAuthDecision.session?.user?.email, 'real@optica.cl');

      // 1b. Segundo GoTrueClient sobre el mismo storage pero con callback expirado (#error=access_denied&error_code=otp_expired):
      //     GoTrueClient preserva la sesión previa en storage, la sonda detecta hasError=true y NO se emite nuevo PASSWORD_RECOVERY.
      __resetRecoveryProofForTests();
      mockLocation.href = 'https://optihub.cl/actualizar-password#error=access_denied&error_code=otp_expired';
      mockLocation.hash = '#error=access_denied&error_code=otp_expired';

      const authClientExpired = new GoTrueClient({
        url: 'https://example.supabase.co/auth/v1',
        storageKey: 'sb-test-auth-token',
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: true,
        storage: storageAdapter,
        fetch: fakeFetch,
      });
      try {
        const wrappedExpired = { auth: authClientExpired };
        installRecoveryProof(wrappedExpired, globalThis.window);
        await authClientExpired.initializePromise;
        await new Promise((r) => setTimeout(r, 20));

        assert.strictEqual(getCallbackProbe()?.hasError, true, 'La sonda debe registrar hasError=true en callback expirado');
        assert.strictEqual(getRecoveryProof(), null, 'Un callback expirado no debe crear prueba de recuperación');
        const { data: preserved } = await authClientExpired.getSession();
        assert.ok(preserved.session, 'GoTrueClient preserva la sesión previa en storage ante un callback con error');
        const expiredDecision = await verifyRecoveryAuthorization(wrappedExpired);
        assert.strictEqual(expiredDecision.authorized, false);
        assert.strictEqual(expiredDecision.reason, 'no_proof');
      } finally {
        await authClientExpired.stopAutoRefresh();
        authClientExpired.broadcastChannel?.close?.();
      }
    } finally {
      await authClient.stopAutoRefresh();
      authClient.broadcastChannel?.close?.();
    }
  } finally {
    globalThis.window = prevWindow;
    globalThis.document = prevDocument;
    globalThis.history = prevHistory;
    globalThis.location = prevLocation;
  }

  // 2. Verificación estática: no quedan referencias a processPkceCodeExchange ni getStoredRecoveryState en frontend/
  const filesToInspect = [
    path.join(process.cwd(), 'frontend', 'lib', 'auth', 'passwordRecovery.ts'),
    path.join(process.cwd(), 'frontend', 'lib', 'auth', 'recoveryProof.ts'),
    path.join(process.cwd(), 'frontend', 'context', 'AuthContext.tsx'),
    path.join(process.cwd(), 'frontend', 'app', 'actualizar-password', 'page.tsx'),
  ];
  for (const file of filesToInspect) {
    const src = fs.readFileSync(file, 'utf8');
    assert.strictEqual(
      src.includes('processPkceCodeExchange'),
      false,
      `No debe existir processPkceCodeExchange en ${path.basename(file)}`
    );
    assert.strictEqual(
      src.includes('getStoredRecoveryState'),
      false,
      `No debe existir getStoredRecoveryState en ${path.basename(file)}`
    );
    assert.strictEqual(
      src.includes('sessionStorage.setItem'),
      false,
      `No debe escribirse autorización en sessionStorage en ${path.basename(file)}`
    );
  }
});
