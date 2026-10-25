import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

/**
 * Resolves the active Mercado Pago Access Token (Server-side).
 * Prioritizes explicit test credentials (MP_TEST_ACCESS_TOKEN) when available,
 * falling back to MP_ACCESS_TOKEN or MERCADOPAGO_ACCESS_TOKEN.
 */
export function getMercadoPagoAccessToken(customToken?: string): string {
  const candidate =
    customToken !== undefined
      ? customToken
      : process.env.MP_TEST_ACCESS_TOKEN ||
        process.env.MP_ACCESS_TOKEN ||
        process.env.MERCADOPAGO_ACCESS_TOKEN ||
        '';
  return candidate.trim();
}

/**
 * Resolves the active Mercado Pago Public Key (Client-side / Frontend).
 * Prioritizes explicit test public key (NEXT_PUBLIC_MP_TEST_PUBLIC_KEY) when available,
 * falling back to NEXT_PUBLIC_MP_PUBLIC_KEY.
 */
export function getMercadoPagoPublicKey(customPublicKey?: string): string {
  const candidate =
    customPublicKey !== undefined
      ? customPublicKey
      : process.env.NEXT_PUBLIC_MP_TEST_PUBLIC_KEY ||
        process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ||
        '';
  return candidate.trim();
}

/**
 * Determines whether Mercado Pago is operating in Sandbox (Test) mode.
 * Returns true if:
 * - MP_SANDBOX_MODE === 'true'
 * - The access token starts with 'TEST-'
 * - The public key starts with 'TEST-'
 */
export function isMercadoPagoSandboxMode(customToken?: string, customPublicKey?: string): boolean {
  if (process.env.MP_SANDBOX_MODE === 'true') {
    return true;
  }
  const token = getMercadoPagoAccessToken(customToken);
  if (token.startsWith('TEST-')) {
    return true;
  }
  const pubKey = getMercadoPagoPublicKey(customPublicKey);
  if (pubKey.startsWith('TEST-')) {
    return true;
  }
  return false;
}

/**
 * Validates that Backend (Access Token) and Frontend (Public Key) credentials
 * belong to the same environment (both TEST- or both APP_USR-) to prevent
 * the Mercado Pago error: "Una de las partes con la que intentas hacer el pago es de prueba".
 */
export function validateMercadoPagoEnvironmentConsistency(
  customToken?: string,
  customPublicKey?: string
): {
  valid: boolean;
  isSandbox: boolean;
  hasTestToken: boolean;
  hasTestPublicKey: boolean;
  warning?: string;
} {
  const token = getMercadoPagoAccessToken(customToken);
  const pubKey = getMercadoPagoPublicKey(customPublicKey);
  const hasTestToken = token.startsWith('TEST-');
  const hasProdToken = token.startsWith('APP_USR-');
  const hasTestPublicKey = pubKey.startsWith('TEST-');
  const hasProdPublicKey = pubKey.startsWith('APP_USR-');
  const sandboxFlag = process.env.MP_SANDBOX_MODE === 'true';

  if (token && pubKey) {
    if ((hasTestToken && hasProdPublicKey) || (hasProdToken && hasTestPublicKey)) {
      return {
        valid: false,
        isSandbox: true,
        hasTestToken,
        hasTestPublicKey,
        warning:
          'Conflicto de credenciales Mercado Pago: MP_ACCESS_TOKEN y NEXT_PUBLIC_MP_PUBLIC_KEY mezclan entornos (TEST- vs APP_USR-). Ambas deben iniciar con TEST- en modo prueba.',
      };
    }
  }

  if (sandboxFlag && hasProdToken) {
    return {
      valid: true,
      isSandbox: true,
      hasTestToken,
      hasTestPublicKey,
      warning:
        'MP_SANDBOX_MODE=true está activo con un token APP_USR-. Asegúrese de usar credenciales de prueba (TEST-...) o credenciales de un Usuario de Prueba de Mercado Pago.',
    };
  }

  return {
    valid: Boolean(token),
    isSandbox: sandboxFlag || hasTestToken || hasTestPublicKey,
    hasTestToken,
    hasTestPublicKey,
  };
}

/**
 * Resolves a safe payer email for Mercado Pago Preference creation.
 *
 * CRITICAL FIX FOR SANDBOX:
 * In Mercado Pago Checkout Pro, if the seller uses Sandbox/Test credentials (TEST-...)
 * and `payer.email` in the preference payload is a real user's email (or the seller's own email),
 * Mercado Pago blocks the checkout with:
 * "Una de las partes con la que intentas hacer el pago es de prueba".
 *
 * In Sandbox mode, this function maps `payer.email` to `MP_TEST_PAYER_EMAIL` or a neutral
 * `@testuser.com` test buyer address unless `customerEmail` is already a `@testuser.com` email.
 * The real customer email remains stored in Supabase `orders.customer_email` for B2B invoicing.
 */
export function resolveSandboxSafePayerEmail(
  customerEmail?: string | null,
  customToken?: string
): string {
  const cleanCustomerEmail = (customerEmail || '').trim();
  const isSandbox = isMercadoPagoSandboxMode(customToken);

  if (isSandbox) {
    const configuredTestPayer = (process.env.MP_TEST_PAYER_EMAIL || '').trim();
    if (configuredTestPayer) {
      return configuredTestPayer;
    }
    if (cleanCustomerEmail.toLowerCase().endsWith('@testuser.com')) {
      return cleanCustomerEmail;
    }
    return 'test_user_optihub_b2b@testuser.com';
  }

  return cleanCustomerEmail || 'cliente@optihub.cl';
}

/**
 * Selects the appropriate redirect URL from a Mercado Pago preference response.
 * Strictly prioritizes `sandbox_init_point` when running in Sandbox / TEST- mode.
 */
export function resolvePreferenceInitPoint(
  prefResponse: { init_point?: string; sandbox_init_point?: string } | null | undefined,
  customToken?: string
): string {
  if (!prefResponse) return '';
  const isSandbox = isMercadoPagoSandboxMode(customToken);
  if (isSandbox) {
    return prefResponse.sandbox_init_point || prefResponse.init_point || '';
  }
  return prefResponse.init_point || prefResponse.sandbox_init_point || '';
}

/**
 * Builds canonical back_urls for OptiHub checkout results with explicit status and order reference.
 */
export function buildCanonicalBackUrls(siteUrl: string, orderId: string) {
  const cleanSiteUrl = siteUrl.replace(/\/+$/, '');
  const cleanOrderId = orderId.trim();
  return {
    success: `${cleanSiteUrl}/checkout/resultado?status=approved&ref=${cleanOrderId}`,
    failure: `${cleanSiteUrl}/checkout/resultado?status=failure&ref=${cleanOrderId}`,
    pending: `${cleanSiteUrl}/checkout/resultado?status=pending&ref=${cleanOrderId}`,
  };
}

/**
 * Creates a fresh MercadoPagoConfig instance with the current environment token.
 */
export function createMercadoPagoClient(customToken?: string, timeoutMs = 8000): MercadoPagoConfig {
  const token =
    getMercadoPagoAccessToken(customToken) ||
    'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';
  return new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: timeoutMs },
  });
}

const defaultAccessToken =
  getMercadoPagoAccessToken() ||
  'TEST-0000000000000000-000000-00000000000000000000000000000000-000000000';

export const mpClient = new MercadoPagoConfig({
  accessToken: defaultAccessToken,
  options: { timeout: 7000 },
});

export const preferenceClient = new Preference(mpClient);
export const paymentClient = new Payment(mpClient);
