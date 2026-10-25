// frontend/lib/env/runtimeEnv.ts

export type RuntimeEnvironment = 'production' | 'preview' | 'development' | 'test' | 'unknown';

/**
 * Returns the current runtime environment based on explicit server-side signals.
 *
 * Rules:
 * - 'preview': strictly when process.env.VERCEL_ENV === 'preview'.
 * - 'production': strictly when process.env.VERCEL_ENV === 'production'.
 * - 'development': when process.env.VERCEL_ENV === 'development' or process.env.NODE_ENV === 'development'.
 * - 'test': strictly when process.env.NODE_ENV === 'test'.
 * - 'unknown': when neither is clearly identified. Never defaults to 'production'.
 */
export function getRuntimeEnvironment(): RuntimeEnvironment {
  const vercelEnv = process.env.VERCEL_ENV?.toLowerCase().trim();

  if (vercelEnv === 'preview') {
    return 'preview';
  }

  if (vercelEnv === 'production') {
    return 'production';
  }

  if (vercelEnv === 'development' || process.env.NODE_ENV === 'development') {
    return 'development';
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test';
  }

  return 'unknown';
}

/**
 * Indicates whether the current execution is running in a Vercel Preview environment.
 */
export function isPreviewEnvironment(): boolean {
  return getRuntimeEnvironment() === 'preview';
}

/**
 * Indicates whether the current execution is running in confirmed Production.
 */
export function isProductionEnvironment(): boolean {
  return getRuntimeEnvironment() === 'production';
}

export interface BusinessMutationGuardResult {
  allowed: boolean;
  environment: RuntimeEnvironment;
  reason?: string;
  response?: Response;
}

export interface BusinessMutationGuardOptions {
  allowInTest?: boolean;
  customAuthClient?: unknown;
  customInventoryService?: unknown;
  customAdminClient?: unknown;
  customClient?: unknown;
}

/**
 * Evaluates whether state-mutating business operations are permitted against the database.
 *
 * Guarantees:
 * 1. Preview deployments are strictly blocked from mutating shared production data (HTTP 403).
 * 2. Admin role does NOT bypass the Preview block.
 * 3. Unknown environments fail safe (HTTP 403) to prevent accidental execution against production.
 * 4. Production and local development are permitted.
 * 5. Mocked unit test runs (injected mock clients or allowInTest) are permitted under unknown env.
 */
export function checkBusinessMutationAllowed(
  operationName: string,
  options?: BusinessMutationGuardOptions
): BusinessMutationGuardResult {
  const env = getRuntimeEnvironment();

  if (env === 'preview') {
    return {
      allowed: false,
      environment: 'preview',
      reason: `Operación "${operationName}" bloqueada en entorno Preview para proteger la base de datos compartida de producción.`,
      response: Response.json(
        {
          error: `Operación "${operationName}" bloqueada en entorno Preview para proteger la base de datos compartida de producción.`,
          code: 'PREVIEW_MUTATION_BLOCKED',
          environment: 'preview',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  if (env === 'unknown') {
    const isMockedTest = Boolean(
      options?.allowInTest ||
      options?.customAuthClient ||
      options?.customInventoryService ||
      options?.customAdminClient ||
      options?.customClient ||
      process.env.NODE_ENV === 'test'
    );

    if (isMockedTest) {
      return { allowed: true, environment: 'test' };
    }

    return {
      allowed: false,
      environment: 'unknown',
      reason: `Operación "${operationName}" bloqueada: entorno no verificado (VERCEL_ENV ausente). Se requiere confirmación de entorno.`,
      response: Response.json(
        {
          error: `Operación "${operationName}" bloqueada: entorno no verificado. Se requiere confirmación de entorno de producción.`,
          code: 'UNVERIFIED_ENVIRONMENT_BLOCKED',
          environment: 'unknown',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  return { allowed: true, environment: env };
}

export interface CronDispatchGuardResult {
  allowed: boolean;
  environment: RuntimeEnvironment;
  reason?: string;
  response?: Response;
}

export interface CronDispatchGuardOptions {
  allowInTest?: boolean;
}

/**
 * Evaluates whether the email outbox cron recovery dispatcher is permitted to execute.
 */
export function checkCronDispatchAllowed(
  options?: CronDispatchGuardOptions
): CronDispatchGuardResult {
  const env = getRuntimeEnvironment();

  if (env === 'preview') {
    return {
      allowed: false,
      environment: 'preview',
      reason: 'Despacho de correos (cron) bloqueado en entorno Preview para proteger los pedidos y la base de datos compartida de producción.',
      response: Response.json(
        {
          error: 'Despacho de correos (cron) bloqueado en entorno Preview para proteger la base de datos compartida de producción.',
          code: 'PREVIEW_CRON_BLOCKED',
          environment: 'preview',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  if (env === 'production') {
    return { allowed: true, environment: 'production' };
  }

  if (options?.allowInTest) {
    return { allowed: true, environment: 'test' };
  }

  if (env === 'development') {
    return {
      allowed: false,
      environment: 'development',
      reason: 'Despacho de correos (cron) bloqueado en entorno local para proteger la base de datos compartida de producción. El cron solo opera en Producción verificada.',
      response: Response.json(
        {
          error: 'Despacho de correos (cron) bloqueado en entorno local para proteger la base de datos compartida de producción.',
          code: 'LOCAL_CRON_BLOCKED',
          environment: 'development',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  return {
    allowed: false,
    environment: 'unknown',
    reason: 'Despacho de correos (cron) bloqueado: entorno no verificado (VERCEL_ENV ausente o desconocido). El cron requiere confirmación de entorno de producción.',
    response: Response.json(
      {
        error: 'Despacho de correos (cron) bloqueado: entorno no verificado. El cron requiere confirmación de entorno de producción.',
        code: 'UNVERIFIED_ENVIRONMENT_BLOCKED',
        environment: 'unknown',
        statusCode: 403,
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    ),
  };
}

export function isCronDispatchAllowed(): boolean {
  return checkCronDispatchAllowed().allowed;
}

export const PROD_SUPABASE_PROJECT_REF = 'yrdjnkbrvynmnzyrxlfx';

/**
 * Checks whether any configured database or Supabase URL targets the production database project.
 */
export function isConnectedToProductionDb(): boolean {
  const urls = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
    process.env.POSTGRES_URL_NON_POOLING,
  ];
  return urls.some((u) => typeof u === 'string' && u.includes(PROD_SUPABASE_PROJECT_REF));
}

export interface CheckoutPreferenceGuardResult {
  allowed: boolean;
  environment: RuntimeEnvironment;
  code?: string;
  reason?: string;
  response?: Response;
}

export interface CheckoutPreferenceGuardOptions {
  allowInTest?: boolean;
  customToken?: string;
  injectedPreferenceClient?: unknown;
  isolatedDatabaseConfirmed?: boolean;
}

/**
 * Checks whether creating a Mercado Pago payment preference is allowed
 * under the current environment and configuration.
 */
export function checkCheckoutPreferenceAllowed(
  options?: CheckoutPreferenceGuardOptions
): CheckoutPreferenceGuardResult {
  const env = getRuntimeEnvironment();
  const rawToken = (
    options?.customToken ??
    process.env.MP_TEST_ACCESS_TOKEN ??
    process.env.MP_ACCESS_TOKEN ??
    process.env.MERCADOPAGO_ACCESS_TOKEN ??
    ''
  ).trim();

  // PRODUCTION ENVIRONMENT
  if (env === 'production') {
    if (!rawToken && !options?.injectedPreferenceClient && !options?.allowInTest) {
      return {
        allowed: false,
        environment: 'production',
        code: 'MISSING_MP_CREDENTIALS',
        reason: 'Error de configuración: Credenciales de Mercado Pago ausentes en producción.',
        response: Response.json(
          {
            error: 'Falta configuración de la pasarela de pagos en el servidor.',
            code: 'MISSING_MP_CREDENTIALS',
            statusCode: 500,
            timestamp: new Date().toISOString(),
          },
          { status: 500 }
        ),
      };
    }
    return { allowed: true, environment: 'production' };
  }

  // PREVIEW ENVIRONMENT
  if (env === 'preview') {
    const isProductionToken = rawToken.startsWith('APP_USR-') || (!rawToken.startsWith('TEST-') && rawToken.length > 0);
    if (isProductionToken) {
      return {
        allowed: false,
        environment: 'preview',
        code: 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED',
        reason: 'Creación de preferencias bloqueada en Preview: se detectaron credenciales productivas de Mercado Pago (APP_USR). El entorno Preview nunca debe usar credenciales de producción.',
        response: Response.json(
          {
            error: 'Creación de preferencia bloqueada en Preview: se detectaron credenciales productivas de Mercado Pago. Preview no debe utilizar la cuenta comercial de producción.',
            code: 'PREVIEW_PRODUCTION_CREDENTIALS_BLOCKED',
            environment: 'preview',
            statusCode: 403,
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        ),
      };
    }

    if (isConnectedToProductionDb()) {
      return {
        allowed: false,
        environment: 'preview',
        code: 'PREVIEW_SHARED_DATABASE_BLOCKED',
        reason: 'Creación de preferencias bloqueada en Preview: la base de datos está conectada al proyecto de producción (referencia de proyecto productivo detectada).',
        response: Response.json(
          {
            error: 'Creación de preferencia bloqueada en Preview: la base de datos está compartida con producción. Se requiere aislamiento de pedidos para operar el checkout.',
            code: 'PREVIEW_SHARED_DATABASE_BLOCKED',
            environment: 'preview',
            statusCode: 403,
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        ),
      };
    }

    const isExplicitUnitTestWithMock = Boolean(
      options?.allowInTest &&
      options?.injectedPreferenceClient &&
      options?.isolatedDatabaseConfirmed
    );

    if (isExplicitUnitTestWithMock && rawToken.startsWith('TEST-')) {
      return { allowed: true, environment: 'preview' };
    }

    return {
      allowed: false,
      environment: 'preview',
      code: 'PREVIEW_SHARED_DATABASE_BLOCKED',
      reason: 'Creación de preferencias bloqueada en Preview: la base de datos se presume compartida con producción y no existe aislamiento verificado de pedidos. La variable declarativa no es suficiente para autorizar transacciones.',
      response: Response.json(
        {
          error: 'Creación de preferencia bloqueada en Preview: la base de datos está compartida con producción. Se requiere aislamiento de pedidos para operar el checkout.',
          code: 'PREVIEW_SHARED_DATABASE_BLOCKED',
          environment: 'preview',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  // LOCAL / DEVELOPMENT OR UNKNOWN
  const isMockedTest = Boolean(
    options?.allowInTest ||
    options?.injectedPreferenceClient ||
    process.env.NODE_ENV === 'test'
  );

  if (isMockedTest) {
    return { allowed: true, environment: env === 'development' ? 'development' : 'test' };
  }

  // Development with verified test token and isolated DB (or explicit MP_SANDBOX_MODE=true with TEST- token)
  if (env === 'development') {
    const isExplicitSandboxWithTestToken =
      process.env.MP_SANDBOX_MODE === 'true' && rawToken.startsWith('TEST-');

    if (isExplicitSandboxWithTestToken) {
      return { allowed: true, environment: 'development' };
    }

    if (isConnectedToProductionDb()) {
      return {
        allowed: false,
        environment: 'development',
        code: 'LOCAL_CHECKOUT_BLOCKED',
        reason: 'Creación de preferencias bloqueada en desarrollo local: detectada conexión al proyecto de producción.',
        response: Response.json(
          {
            error: 'Creación de preferencia remota bloqueada en entorno local: detectada conexión a la base de datos de producción.',
            code: 'LOCAL_CHECKOUT_BLOCKED',
            environment: 'development',
            statusCode: 403,
            timestamp: new Date().toISOString(),
          },
          { status: 403 }
        ),
      };
    }

    const isIsolatedDb = Boolean(
      options?.isolatedDatabaseConfirmed ||
      process.env.DATABASE_URL?.includes('localhost') ||
      process.env.POSTGRES_URL?.includes('localhost')
    );
    if (rawToken.startsWith('TEST-') && isIsolatedDb) {
      return { allowed: true, environment: 'development' };
    }

    return {
      allowed: false,
      environment: 'development',
      code: 'LOCAL_CHECKOUT_BLOCKED',
      reason: 'Creación de preferencias remotas bloqueada en entorno local para evitar llamadas contra la cuenta de producción o base compartida.',
      response: Response.json(
        {
          error: 'Creación de preferencia remota bloqueada en entorno local. Utilice mocks o configure credenciales de prueba y base aislada.',
          code: 'LOCAL_CHECKOUT_BLOCKED',
          environment: 'development',
          statusCode: 403,
          timestamp: new Date().toISOString(),
        },
        { status: 403 }
      ),
    };
  }

  // Unknown environment fails-safe
  return {
    allowed: false,
    environment: 'unknown',
    code: 'UNVERIFIED_ENVIRONMENT_BLOCKED',
    reason: 'Creación de preferencias bloqueada: entorno no verificado (VERCEL_ENV ausente). Se requiere confirmación de entorno.',
    response: Response.json(
      {
        error: 'Creación de preferencia bloqueada: entorno no verificado.',
        code: 'UNVERIFIED_ENVIRONMENT_BLOCKED',
        environment: 'unknown',
        statusCode: 403,
        timestamp: new Date().toISOString(),
      },
      { status: 403 }
    ),
  };
}

export function isCheckoutPreferenceAllowed(options?: CheckoutPreferenceGuardOptions): boolean {
  return checkCheckoutPreferenceAllowed(options).allowed;
}
