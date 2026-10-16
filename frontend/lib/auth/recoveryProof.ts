// frontend/lib/auth/recoveryProof.ts
/**
 * Prueba de recuperación de contraseña EN MEMORIA.
 *
 * - Se captura desde el evento PASSWORD_RECOVERY del SDK (suscriptor instalado de forma síncrona
 *   junto a createClient, para no perder el evento que el SDK emite en un setTimeout(0)).
 * - Vive solo en una variable de módulo: no usa React, sessionStorage ni window.
 * - Se vincula a userId + session_id (claim del JWT).
 * - IMPORTANTE: es un control de UI. El servidor (PUT /user) acepta el cambio con cualquier
 *   token válido; esto solo evita que la interfaz ofrezca el cambio sin una recuperación reciente.
 *
 * Sin imports para poder cargarse desde Node en pruebas.
 */

export const RECOVERY_PROOF_TTL_MS = 30 * 60 * 1000;

export interface RecoveryProof {
  userId: string;
  sessionId: string | null;
  at: number;
  consumed: boolean;
}

/** Solo indicadores booleanos; nunca valores de tokens ni códigos. Es una pista, no autorización. */
export interface CallbackProbe {
  path: string;
  hasCallback: boolean;
  hasError: boolean;
  hasCode: boolean;
  hasRecoveryType: boolean;
}

let currentProof: RecoveryProof | null = null;
let currentProbe: CallbackProbe | null = null;
const installedClients = new WeakSet<object>();

function decodeClaims(token: unknown): Record<string, any> | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(b64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          )
        : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function getSessionIdFromSession(session: any): string | null {
  const claims = decodeClaims(session?.access_token);
  return typeof claims?.session_id === 'string' ? claims.session_id : null;
}

export function getRecoveryProof(): RecoveryProof | null {
  return currentProof;
}

export function clearRecoveryProof(): void {
  currentProof = null;
}

export function consumeRecoveryProof(): void {
  if (currentProof) currentProof = { ...currentProof, consumed: true };
}

export function getCallbackProbe(): CallbackProbe | null {
  return currentProbe;
}

export function clearCallbackProbe(): void {
  currentProbe = null;
}

/** Solo para pruebas. */
export function __resetRecoveryProofForTests(): void {
  currentProof = null;
  currentProbe = null;
}

function captureProbe(win: any): void {
  try {
    const loc = win?.location;
    if (!loc) return;
    const search = new URLSearchParams(loc.search || '');
    const hash = new URLSearchParams(String(loc.hash || '').replace(/^#/, ''));
    const hasError = !!(
      search.get('error') || search.get('error_code') || hash.get('error') || hash.get('error_code')
    );
    const hasCode = !!search.get('code');
    const hasToken = !!(hash.get('access_token') || hash.get('refresh_token'));
    const hasRecoveryType = hash.get('type') === 'recovery' || search.get('type') === 'recovery';
    currentProbe = {
      path: String(loc.pathname || ''),
      hasCallback: hasError || hasCode || hasToken,
      hasError,
      hasCode,
      hasRecoveryType,
    };
  } catch {
    currentProbe = null;
  }
}

/**
 * Instala la sonda de URL y el suscriptor de auth. Idempotente por cliente.
 * Debe llamarse justo después de createClient, de forma síncrona.
 */
export function installRecoveryProof(client: any, win: any = (globalThis as any).window): void {
  if (!client?.auth || !win) return;
  if (installedClients.has(client)) return;
  installedClients.add(client);

  captureProbe(win);

  client.auth.onAuthStateChange((event: string, session: any) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'SIGNED_OUT') {
      currentProof = null;
      return;
    }
    if (event === 'PASSWORD_RECOVERY') {
      const userId = session?.user?.id;
      if (!userId) {
        currentProof = null;
        return;
      }
      // Un nuevo PASSWORD_RECOVERY reemplaza cualquier prueba previa (A -> B).
      currentProof = {
        userId,
        sessionId: getSessionIdFromSession(session),
        at: Date.now(),
        consumed: false,
      };
      return;
    }
    // Cualquier otro evento con sesión de otro usuario/sesión invalida la prueba.
    if (currentProof && session) {
      const sid = getSessionIdFromSession(session);
      if (session.user?.id !== currentProof.userId || (sid && sid !== currentProof.sessionId)) {
        currentProof = null;
      }
    }
  });
}

export type RecoveryDenyReason =
  | 'no_session'
  | 'no_claims'
  | 'no_proof'
  | 'consumed'
  | 'expired'
  | 'user_mismatch'
  | 'session_mismatch';

export interface RecoveryDecision {
  authorized: boolean;
  reason?: RecoveryDenyReason;
}

/**
 * Decisión pura. `amr`, `iat` y `last_sign_in_at` NO participan.
 */
export function evaluateRecoveryAuthorization({
  claims,
  sessionUserId,
  proof,
  now = Date.now(),
  ttl = RECOVERY_PROOF_TTL_MS,
}: {
  claims: { sub?: string; session_id?: string } | null | undefined;
  sessionUserId: string | null | undefined;
  proof: RecoveryProof | null | undefined;
  now?: number;
  ttl?: number;
}): RecoveryDecision {
  if (!sessionUserId) return { authorized: false, reason: 'no_session' };
  if (!claims || !claims.sub) return { authorized: false, reason: 'no_claims' };
  if (!proof) return { authorized: false, reason: 'no_proof' };
  if (proof.consumed) return { authorized: false, reason: 'consumed' };
  if (now - proof.at > ttl || now < proof.at) return { authorized: false, reason: 'expired' };
  if (claims.sub !== sessionUserId || proof.userId !== sessionUserId) {
    return { authorized: false, reason: 'user_mismatch' };
  }
  if (!proof.sessionId || !claims.session_id || claims.session_id !== proof.sessionId) {
    return { authorized: false, reason: 'session_mismatch' };
  }
  return { authorized: true };
}

/**
 * Único punto de decisión asíncrono. Usa getClaims() (verificado por el SDK) y falla cerrado.
 */
export async function verifyRecoveryAuthorization(
  client: any,
  opts: { now?: number; ttl?: number } = {}
): Promise<RecoveryDecision & { session?: any }> {
  try {
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session?.user?.id) return { authorized: false, reason: 'no_session' };

    const { data: claimsData, error: claimsError } = await client.auth.getClaims();
    if (claimsError || !claimsData?.claims) return { authorized: false, reason: 'no_claims' };

    const decision = evaluateRecoveryAuthorization({
      claims: claimsData.claims,
      sessionUserId: session.user.id,
      proof: getRecoveryProof(),
      now: opts.now,
      ttl: opts.ttl,
    });
    return decision.authorized ? { ...decision, session } : decision;
  } catch {
    return { authorized: false, reason: 'no_claims' };
  }
}
