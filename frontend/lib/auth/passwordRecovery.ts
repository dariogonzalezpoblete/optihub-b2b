// frontend/lib/auth/passwordRecovery.ts
/**
 * Utilidades puras y deterministas para el flujo de recuperación de contraseña de OptiHub B2B.
 * Permite ejecutar pruebas automatizadas sobre la lógica real sin depender de React DOM.
 */

import { checkPasswordRules } from '@/lib/utils/password';

export interface JwtClaims {
  sub?: string;
  email?: string;
  amr?: Array<{ method: string; timestamp?: number }>;
  exp?: number;
  [key: string]: any;
}

/**
 * Decodifica de forma segura el payload de un JWT sin requerir librerías externas.
 * Compatible con entornos de navegador (atob) y Node.js (Buffer).
 */
export function parseJwtPayload(token: string): JwtClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = typeof window !== 'undefined'
      ? decodeURIComponent(
          atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        )
      : Buffer.from(base64, 'base64').toString('utf8');

    return JSON.parse(jsonStr);
  } catch (err) {
    return null;
  }
}

/**
 * Indicio informativo (NO autorización) de que el JWT proviene de una recuperación.
 * Tolera amr como array de strings o de objetos { method }.
 */
export function isRecoverySession(session: any): boolean {
  if (!session?.access_token) return false;
  const payload = parseJwtPayload(session.access_token);
  if (!payload) return false;

  if (Array.isArray(payload.amr)) {
    return (payload.amr as any[]).some((entry) =>
      typeof entry === 'string' ? entry === 'recovery' : !!entry && entry.method === 'recovery'
    );
  }

  return false;
}

/**
 * Valida los parámetros presentes en la URL (searchParams o hash) al acceder a /actualizar-password.
 */
export function validateRecoveryUrlParams({
  searchParams,
  hashString = '',
}: {
  searchParams?: { get: (key: string) => string | null } | URLSearchParams;
  hashString?: string;
}): {
  hasError: boolean;
  errorMessage?: string;
  code?: string | null;
  hasRecoveryHash: boolean;
} {
  const urlError = searchParams?.get('error');
  const urlErrorDesc = searchParams?.get('error_description');
  const urlErrorCode = searchParams?.get('error_code');
  const code = searchParams?.get('code');

  let hashError = '';
  let hashHasRecovery = false;

  if (hashString) {
    const rawHash = hashString.startsWith('#') ? hashString.substring(1) : hashString;
    const hashParams = new URLSearchParams(rawHash);
    if (hashParams.get('error') || hashParams.get('error_code')) {
      hashError = hashParams.get('error_description') || hashParams.get('error') || 'Error en enlace';
    }
    if (hashParams.get('type') === 'recovery') {
      hashHasRecovery = true;
    }
  }

  if (urlError || hashError || urlErrorCode === 'otp_expired') {
    return {
      hasError: true,
      errorMessage: 'El enlace de recuperación es inválido, ha expirado o ya fue utilizado. Por favor solicita uno nuevo.',
      code: null,
      hasRecoveryHash: false,
    };
  }

  return {
    hasError: false,
    code: code || null,
    hasRecoveryHash: hashHasRecovery,
  };
}

/**
 * Enmascara un correo para mostrarlo en pantalla (p. ej. a***@dominio.com).
 */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const at = email.indexOf('@');
  if (at < 1 || at === email.length - 1) return null;
  return `${email[0]}***${email.substring(at)}`;
}

/**
 * Limpia los parámetros sensibles (code, error, tokens) de la barra de direcciones del navegador.
 */
export function cleanUrlParameters(): void {
  if (typeof window !== 'undefined' && (window.location.search || window.location.hash)) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }
}

/**
 * Valida que la contraseña cumpla los requisitos mínimos y coincida con su confirmación.
 */
export function validatePasswordInput(
  password: string,
  confirmPassword: string
): { valid: boolean; error?: string } {
  const result = checkPasswordRules(password, confirmPassword);
  return {
    valid: result.valid,
    error: result.error,
  };
}

/**
 * Valida y sanitiza una dirección de correo para solicitud de recuperación.
 */
export function sanitizeRecoveryEmail(email: string): { valid: boolean; email: string } {
  const trimmed = (email || '').trim();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return { valid: isValid, email: trimmed };
}

/**
 * Construye la URL de redirección para Supabase de forma controlada sin aceptar entradas arbitrarias.
 * Garantiza que siempre termine en /actualizar-password en el origen permitido.
 */
export function resolveSafeRedirectUrl(baseUrl?: string): string {
  const rawBase = (baseUrl || '').trim();
  let baseOrigin = '';

  if (rawBase) {
    try {
      const parsed = new URL(rawBase.startsWith('http') ? rawBase : `https://${rawBase}`);
      baseOrigin = parsed.origin;
    } catch {
      baseOrigin = '';
    }
  }

  if (!baseOrigin && typeof window !== 'undefined' && window.location?.origin) {
    baseOrigin = window.location.origin;
  }

  return baseOrigin ? `${baseOrigin}/actualizar-password` : '/actualizar-password';
}

/**
 * Determina si debe cerrarse localmente una sesión preexistente tras un callback fallido.
 * Solo devuelve true cuando:
 * 1. Existe evidencia de callback fallido (error en URL/sonda o código PKCE no soportado en flujo implícito), y
 * 2. La sesión almacenada puede identificarse con confianza como una sesión de recuperación (`isRecoverySession`).
 * Nunca cierra sesiones ordinarias (p. ej. amr: password) ni sesiones cuyo origen no pueda determinarse.
 */
export function shouldSelectivelyCloseAbandonedRecovery({
  hasFailedCallback,
  session,
}: {
  hasFailedCallback: boolean;
  session: any;
}): boolean {
  if (!hasFailedCallback || !session) return false;
  return isRecoverySession(session);
}


