/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isValidRUT } from '@/lib/utils/rut';
import {
  classifyCheckoutLeaseError,
  classifyCheckoutRpcFailureForRecovery,
  clearInvalidatedPreferencesCache,
  evaluatePendingOrdersForCheckout,
  isOrderWithinReuseWindow,
  isPreferenceMarkedInvalidated,
  markPreferenceAsInvalidated,
  type PriorOrderReplacementSnapshot
} from '@/lib/checkoutWebhookAndResult';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

export {
  classifyCheckoutRpcFailureForRecovery,
  clearInvalidatedPreferencesCache,
  isPreferenceMarkedInvalidated,
  markPreferenceAsInvalidated
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Valida que la URL base del sitio sea absoluta, válida y apta para redirección en Mercado Pago.
 * Mercado Pago rechaza 'localhost' y '127.0.0.1' cuando auto_return está activo ('approved').
 */
export function resolveAndValidateBaseUrl(providedUrl?: string): { valid: boolean; url?: string; error?: string } {
  const candidate = (
    providedUrl !== undefined ? providedUrl : (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '')
  ).trim();

  if (!candidate) {
    return {
      valid: false,
      error: 'Falta la configuración de la URL base del sitio en las variables de entorno (SITE_URL o NEXT_PUBLIC_SITE_URL).'
    };
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Protocolo de URL base inválido. Debe comenzar con http:// o https://.'
      };
    }
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      return {
        valid: false,
        error: 'Mercado Pago auto_return requiere un dominio público accesible. No se admite localhost ni 127.0.0.1. Configure el dominio desplegado de OptiHub en SITE_URL.'
      };
    }
    return {
      valid: true,
      url: candidate.replace(/\/+$/, '')
    };
  } catch {
    return {
      valid: false,
      error: 'La URL base configurada (SITE_URL) no tiene un formato de URL válido.'
    };
  }
}

/**
 * Sanitiza los errores arrojados por el SDK o la API de Mercado Pago.
 * Devuelve un mensaje claro al cliente sin exponer secretos ni tokens.
 */
export function sanitizeMercadoPagoError(mpError: any): { status: number; error: string } {
  let clientMessage = 'No se pudo generar la pasarela de pago en Mercado Pago.';
  if (mpError?.message?.includes('auto_return invalid')) {
    clientMessage = 'Error de configuración: Las URLs de retorno no son válidas para auto_return.';
  } else if (mpError?.message?.includes('TIMEOUT_MP_PREFERENCE_CREATE')) {
    clientMessage = 'Tiempo de espera agotado al comunicarse con Mercado Pago. Por favor intenta nuevamente.';
  } else if (mpError?.status === 400 || mpError?.name === 'MPBadRequestError') {
    clientMessage = 'Datos de orden no válidos para la pasarela de pagos.';
  } else if (mpError?.status === 401) {
    clientMessage = 'Error de autorización con la pasarela de pagos.';
  }
  return { status: 502, error: clientMessage };
}

/**
 * Valida y recalcula el carrito en el servidor contra la tabla 'marcos'.
 * Valida MOQ (>= 10), existencia en catálogo, stock suficiente y calcula IVA y total.
 */
export async function validateAndRecalculateCart(
  itemsPayload: { product_id: string; quantity: number }[],
  supabaseAdmin: any
): Promise<{
  valid: boolean;
  error?: string;
  subtotalNet: number;
  taxAmount: number;
  totalAmount: number;
  catalogMap: Map<string, any>;
}> {
  if (!itemsPayload || itemsPayload.length === 0) {
    return { valid: false, error: 'El carrito no contiene productos válidos.', subtotalNet: 0, taxAmount: 0, totalAmount: 0, catalogMap: new Map() };
  }

  const totalQuantity = itemsPayload.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity < 10) {
    return { valid: false, error: 'MOQ no cumplido: El pedido mínimo es de 10 unidades.', subtotalNet: 0, taxAmount: 0, totalAmount: 0, catalogMap: new Map() };
  }

  const productIds = itemsPayload.map((i) => i.product_id);
  const { data: dbProducts, error: dbError } = await supabaseAdmin
    .from('marcos')
    .select('id_ext, precio_neto_clp, stock, marca, modelo, codigo_color')
    .in('id_ext', productIds);

  if (dbError || !dbProducts) {
    return { valid: false, error: 'Error al consultar catálogo de productos en el servidor.', subtotalNet: 0, taxAmount: 0, totalAmount: 0, catalogMap: new Map() };
  }

  const catalogMap = new Map<string, any>();
  dbProducts.forEach((p: any) => catalogMap.set(p.id_ext, p));

  let subtotalNet = 0;
  for (const item of itemsPayload) {
    const dbProduct = catalogMap.get(item.product_id);
    if (!dbProduct) {
      return { valid: false, error: `Producto ${item.product_id} no encontrado en el catálogo.`, subtotalNet: 0, taxAmount: 0, totalAmount: 0, catalogMap };
    }
    if (dbProduct.stock === null || dbProduct.stock === undefined) {
      return { valid: false, error: `El producto ${item.product_id} no posee inventario configurado.`, subtotalNet: 0, taxAmount: 0, totalAmount: 0, catalogMap };
    }
    if (dbProduct.stock < item.quantity) {
      return {
        valid: false,
        error: `Stock insuficiente para ${dbProduct.marca || ''} ${dbProduct.modelo || ''} (${item.product_id}). Solicitado: ${item.quantity}, Disponible: ${dbProduct.stock}`,
        subtotalNet: 0,
        taxAmount: 0,
        totalAmount: 0,
        catalogMap
      };
    }
    subtotalNet += Number(dbProduct.precio_neto_clp) * item.quantity;
  }

  const taxAmount = Math.round(subtotalNet * 0.19);
  const totalAmount = subtotalNet + taxAmount;

  return {
    valid: true,
    subtotalNet,
    taxAmount,
    totalAmount,
    catalogMap
  };
}

/**
 * Comprueba si una orden pendiente existente coincide 1:1 con el carrito actual y los precios recalculados.
 */
export function matchesCandidateOrder(
  candidateOrder: any,
  candidateItems: any[],
  currentItems: { product_id: string; quantity: number }[],
  cartCalc: { subtotalNet: number; taxAmount: number; totalAmount: number; catalogMap: Map<string, any> }
): boolean {
  if (!candidateOrder || !candidateItems || !currentItems || !cartCalc) return false;

  // Comparar totales financieros recalculados
  if (Number(candidateOrder.subtotal_net) !== cartCalc.subtotalNet) return false;
  if (Number(candidateOrder.tax_amount) !== cartCalc.taxAmount) return false;
  if (Number(candidateOrder.total_amount) !== cartCalc.totalAmount) return false;

  // Comparar cantidad de ítems únicos
  if (candidateItems.length !== currentItems.length) return false;

  // Mapear ítems de la orden candidata
  const candidateMap = new Map<string, { quantity: number; unit_price_net: number }>();
  for (const oi of candidateItems) {
    candidateMap.set(oi.product_id, {
      quantity: Number(oi.quantity),
      unit_price_net: Number(oi.unit_price_net)
    });
  }

  // Verificar que cada ítem del carrito coincida exactamente en producto, cantidad y precio unitario
  for (const ci of currentItems) {
    const candidateItem = candidateMap.get(ci.product_id);
    if (!candidateItem) return false;
    if (candidateItem.quantity !== ci.quantity) return false;

    const catalogProduct = cartCalc.catalogMap.get(ci.product_id);
    if (!catalogProduct || candidateItem.unit_price_net !== Number(catalogProduct.precio_neto_clp)) {
      return false;
    }
  }

  return true;
}

/**
 * Error controlado cuando la orden cambió de estado (ej. fue cancelada tras expiración de lease)
 * antes de poder persistir o recuperar la preferencia de Mercado Pago.
 */
export class ConcurrentOrderStateChangedError extends Error {
  public readonly code = 'CONCURRENT_ORDER_STATE_CHANGED';
  public readonly httpStatus = 409;
  public readonly orderId: string;

  constructor(
    orderId: string,
    message = 'No se pudo completar el checkout porque la orden dejó de estar pendiente o fue reemplazada concurrentemente. Por favor intenta nuevamente.'
  ) {
    super(message);
    this.name = 'ConcurrentOrderStateChangedError';
    this.orderId = orderId;
  }
}

/**
 * Error controlado cuando la RPC atómica `persist_order_preference_with_lease` rechaza la persistencia
 * porque el lease no existe, expiró o fue adquirido por otra petición concurrente.
 */
export class CheckoutLeaseInvalidError extends Error {
  public readonly code: string;
  public readonly httpStatus = 409;
  public readonly orderId: string;

  constructor(
    orderId: string,
    code = 'LEASE_EXPIRED',
    message = 'Tu reserva de pago expiró o fue transferida antes de registrar la pasarela de pago. Por favor intenta nuevamente.'
  ) {
    super(message);
    this.name = 'CheckoutLeaseInvalidError';
    this.code = code;
    this.orderId = orderId;
  }
}

/**
 * Error controlado cuando `persist_order_preference_with_lease` devuelve `persisted: false`
 * (otra preferencia ya existe en la orden) pero no puede confirmarse su validez en Mercado Pago.
 */
export class WinnerPreferenceVerificationFailedError extends Error {
  public readonly code = 'FAILED_TO_VERIFY_PRIOR_PAYMENTS';
  public readonly httpStatus = 502;
  public readonly orderId: string;

  constructor(
    orderId: string,
    message = 'No se pudo verificar la vigencia de la pasarela de pago de tu orden en Mercado Pago. Por seguridad, intenta nuevamente en unos instantes.'
  ) {
    super(message);
    this.name = 'WinnerPreferenceVerificationFailedError';
    this.orderId = orderId;
  }
}

/**
 * Crea la preferencia en Mercado Pago con configuración de expiración a 4 horas y timeout explícito.
 * Si la llamada remota se resuelve tardíamente después del timeout local, intenta invalidar
 * automáticamente la preferencia huérfana en Mercado Pago.
 */
export async function createMpPreference({
  orderId,
  customerName,
  customerEmail,
  orderItems,
  taxAmount,
  siteUrl,
  timeoutMs = 10000,
  injectedPreferenceClient,
  invalidatePreference
}: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderItems: any[];
  taxAmount: number;
  siteUrl: string;
  timeoutMs?: number;
  injectedPreferenceClient?: any;
  invalidatePreference?: (preferenceId: string) => Promise<{ success: boolean; error?: string }>;
}): Promise<{ id: string; paymentUrl: string }> {
  const mpAccessToken = process.env.MP_ACCESS_TOKEN || '';
  if (!mpAccessToken && !injectedPreferenceClient) {
    throw new Error('Falta configuración de Mercado Pago en el servidor.');
  }

  const preference =
    injectedPreferenceClient || new Preference(new MercadoPagoConfig({ accessToken: mpAccessToken }));

  const mpItems = orderItems.map((oi: any) => ({
    id: oi.sku || oi.product_id,
    title: oi.product_name,
    quantity: oi.quantity,
    unit_price: Number(oi.unit_price_net),
    currency_id: 'CLP'
  }));

  mpItems.push({
    id: 'IVA',
    title: 'IVA (19%)',
    quantity: 1,
    unit_price: Number(taxAmount),
    currency_id: 'CLP'
  });

  // Ventana de expiración aprobada: 4 horas desde la creación
  const expirationDateTo = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();

  const invalidateLatePreference =
    invalidatePreference ||
    ((preferenceId: string) =>
      invalidateCandidateOrderPreference(
        preferenceId,
        mpAccessToken,
        7000,
        injectedPreferenceClient
      ));

  let timedOut = false;
  let timeoutId: NodeJS.Timeout | undefined;

  const createPromise = Promise.resolve().then(() =>
    preference.create({
      body: {
        items: mpItems,
        external_reference: orderId,
        payer: {
          name: customerName,
          email: customerEmail,
        },
        back_urls: {
          success: `${siteUrl}/checkout/resultado?status=approved&ref=${orderId}`,
          failure: `${siteUrl}/checkout/resultado?status=failure&ref=${orderId}`,
          pending: `${siteUrl}/checkout/resultado?status=pending&ref=${orderId}`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/webhooks/mercadopago`,
        expires: true,
        expiration_date_to: expirationDateTo,
      }
    })
  );

  // Un timeout local con Promise.race no cancela la solicitud HTTP en curso hacia Mercado Pago.
  // Si Mercado Pago termina creando la preferencia después del timeout, se invalida en segundo plano.
  void createPromise.then(
    async (lateResponse: any) => {
      if (!timedOut) return;
      const latePrefId = lateResponse?.id ? String(lateResponse.id).trim() : '';
      if (!latePrefId) return;
      try {
        const invRes = await invalidateLatePreference(latePrefId);
        if (!invRes || !invRes.success) {
          console.error('[CreatePref] Error controlado al invalidar preferencia tardía tras timeout:', {
            orderId,
            preferenceId: latePrefId,
            error: invRes?.error || 'Error desconocido al invalidar preferencia tardía'
          });
        }
      } catch (invErr: any) {
        console.error('[CreatePref] Excepción controlada al invalidar preferencia tardía tras timeout:', {
          orderId,
          preferenceId: latePrefId,
          error: invErr?.message || String(invErr)
        });
      }
    },
    () => {
      // Silenciar rechazos posteriores al timeout local para evitar unhandledRejection
    }
  );

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      reject(new Error('TIMEOUT_MP_PREFERENCE_CREATE'));
    }, timeoutMs);
  });

  let prefResponse: any;
  try {
    prefResponse = await Promise.race([createPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }

  const paymentUrl = prefResponse?.sandbox_init_point || prefResponse?.init_point;
  if (!prefResponse?.id || !paymentUrl) {
    throw new Error('Mercado Pago devolvió una Preference incompleta.');
  }

  return { id: prefResponse.id, paymentUrl };
}

/**
 * Persiste la preferencia de forma atómica en PostgreSQL mediante la RPC `persist_order_preference_with_lease`.
 *
 * Garantías (MEDIO-02):
 * 1. Exige `userId` y `leaseId` válidos; nunca ejecuta un UPDATE directo sin verificar y bloquear el lease en BD.
 * 2. La verificación de titularidad/vigencia del lease (`SELECT ... FOR UPDATE` en `user_checkout_leases`) y la
 *    actualización de `public.orders` ocurren en una única transacción atómica en PostgreSQL.
 * 3. Para `expectedStalePreferenceId`, reemplaza la preferencia obsoleta mediante compare-and-swap en una sola
 *    operación atómica dentro de la RPC, sin dos UPDATE separados.
 * 4. Si la RPC rechaza el lease o el estado de la orden, invalida únicamente la preferencia recién creada por
 *    esta petición (`prefId`), nunca la preferencia de la orden ganadora.
 * 5. Si la RPC indica `persisted: false`, invalida `prefId` (si es distinto de la ganadora) y verifica la validez
 *    de la preferencia ganadora en Mercado Pago antes de devolverla; si no puede verificarse, falla en cerrado (502).
 */
export async function persistPreferenceAtomic(
  supabaseAdmin: any,
  orderId: string,
  prefId: string,
  paymentUrl: string,
  options?: {
    userId?: string | null;
    leaseId?: string | null;
    mpAccessToken?: string;
    injectedPreferenceClient?: any;
    invalidatePreference?: (preferenceId: string) => Promise<{ success: boolean; error?: string }>;
    checkPreferenceValidity?: (
      preferenceId: string,
      expectedOrderId?: string
    ) => Promise<{ valid: boolean; status?: 'active' | 'expired' | 'error'; error?: string }>;
    expectedStalePreferenceId?: string | null;
  }
): Promise<{ id: string; initPoint: string; orderId: string }> {
  const mpAccessToken = options?.mpAccessToken ?? process.env.MP_ACCESS_TOKEN ?? '';
  const invalidateFn =
    options?.invalidatePreference ??
    (mpAccessToken || options?.injectedPreferenceClient
      ? (preferenceId: string) =>
          invalidateCandidateOrderPreference(
            preferenceId,
            mpAccessToken,
            7000,
            options?.injectedPreferenceClient
          )
      : undefined);

  // Invalida EXCLUSIVAMENTE la preferencia recién creada por esta petición (`prefId`),
  // siempre que no haya sido persistida ni corresponda al identificador de otra orden ganadora.
  const safeInvalidateCreatedPreference = async (reason: string): Promise<void> => {
    if (!invalidateFn || !prefId) return;
    try {
      const invRes = await invalidateFn(prefId);
      if (invRes?.success) {
        markPreferenceAsInvalidated(prefId);
      } else {
        console.error('[CreatePref] Error controlado al invalidar preferencia MP tardía/huérfana:', {
          orderId,
          preferenceId: prefId,
          reason,
          error: invRes?.error || 'Fallo al invalidar preferencia en Mercado Pago'
        });
      }
    } catch (invErr: any) {
      console.error('[CreatePref] Excepción controlada al invalidar preferencia MP tardía/huérfana:', {
        orderId,
        preferenceId: prefId,
        reason,
        error: invErr?.message || String(invErr)
      });
    }
  };

  const userId = typeof options?.userId === 'string' ? options.userId.trim() : '';
  const leaseId = typeof options?.leaseId === 'string' ? options.leaseId.trim() : '';

  if (!userId || !leaseId) {
    await safeInvalidateCreatedPreference('missing_user_or_lease_id');
    throw new CheckoutLeaseInvalidError(
      orderId,
      'LEASE_REQUIRED',
      'Se requiere una reserva de checkout válida (leaseId) para persistir la pasarela de pago.'
    );
  }

  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    await safeInvalidateCreatedPreference('missing_rpc_client');
    throw new Error('Error interno al persistir la Preference: cliente RPC no disponible.');
  }

  const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc(
    'persist_order_preference_with_lease',
    {
      p_user_id: userId,
      p_order_id: orderId,
      p_lease_id: leaseId,
      p_preference_id: prefId,
      p_init_point: paymentUrl,
      p_expected_stale_preference_id: options?.expectedStalePreferenceId ?? null
    }
  );

  if (rpcError || !rpcData || typeof rpcData !== 'object') {
    await safeInvalidateCreatedPreference('rpc_persist_error');
    throw new Error('Error interno al persistir la Preference.');
  }

  if (rpcData.success !== true) {
    const errCode = String(rpcData.code || '').trim();
    const existingWinnerPrefId =
      typeof rpcData.preference_id === 'string' ? rpcData.preference_id.trim() : '';

    // Solo invalidar prefId si es la preferencia creada por esta petición y no coincide con una existente en BD
    if (!existingWinnerPrefId || existingWinnerPrefId !== prefId) {
      await safeInvalidateCreatedPreference(`rpc_rejected_${errCode || 'unknown'}`);
    }

    if (
      [
        'LEASE_NOT_FOUND',
        'LEASE_LOST_TO_CONCURRENT_REQUEST',
        'LEASE_EXPIRED',
        'LEASE_REQUIRED'
      ].includes(errCode)
    ) {
      throw new CheckoutLeaseInvalidError(orderId, errCode, rpcData.message || undefined);
    }

    if (errCode === 'CONCURRENT_ORDER_STATE_CHANGED') {
      throw new ConcurrentOrderStateChangedError(orderId, rpcData.message || undefined);
    }

    if (errCode === 'INCONSISTENT_EXISTING_PREFERENCE') {
      throw new WinnerPreferenceVerificationFailedError(
        orderId,
        rpcData.message || 'La orden conserva una preferencia incompleta en el servidor.'
      );
    }

    throw new Error(rpcData.message || 'Error interno al persistir la Preference.');
  }

  // Caso 1: La RPC persistió atómicamente nuestra preferencia bajo el lease activo
  if (rpcData.persisted === true) {
    const persistedPrefId =
      typeof rpcData.preference_id === 'string' ? rpcData.preference_id.trim() : '';
    const persistedInitPoint =
      typeof rpcData.init_point === 'string' ? rpcData.init_point.trim() : '';

    if (!persistedPrefId || !persistedInitPoint) {
      await safeInvalidateCreatedPreference('incomplete_rpc_persisted_preference');
      throw new Error('Error interno al persistir la Preference.');
    }

    return {
      id: persistedPrefId,
      initPoint: persistedInitPoint,
      orderId
    };
  }

  // Caso 2: `persisted === false` -> Ya existía una preferencia ganadora en la orden.
  // Invalidar únicamente nuestra preferencia redundante (`prefId`) si es distinta de la ganadora,
  // y verificar en Mercado Pago que la preferencia ganadora sea válida antes de entregarla.
  const winnerPrefId =
    typeof rpcData.preference_id === 'string' ? rpcData.preference_id.trim() : '';
  const winnerInitPoint =
    typeof rpcData.init_point === 'string' ? rpcData.init_point.trim() : '';

  if (winnerPrefId !== prefId) {
    await safeInvalidateCreatedPreference('superseded_by_concurrent_pending_winner');
  }

  if (!winnerPrefId || !winnerInitPoint) {
    throw new WinnerPreferenceVerificationFailedError(
      orderId,
      'La preferencia ganadora en base de datos está incompleta.'
    );
  }

  const checkValidityFn =
    options?.checkPreferenceValidity ??
    ((candidatePrefId: string, expectedOrdId?: string) =>
      checkCandidatePreferenceValidity(
        candidatePrefId,
        mpAccessToken,
        7000,
        options?.injectedPreferenceClient,
        Date.now(),
        expectedOrdId ?? orderId
      ));

  const winnerValidity = await checkValidityFn(winnerPrefId, orderId);
  if (
    !winnerValidity ||
    !winnerValidity.valid ||
    winnerValidity.status !== 'active' ||
    isPreferenceMarkedInvalidated(winnerPrefId)
  ) {
    throw new WinnerPreferenceVerificationFailedError(
      orderId,
      winnerValidity?.error ||
        'No se pudo verificar la validez de la preferencia ganadora en Mercado Pago.'
    );
  }

  return {
    id: winnerPrefId,
    initPoint: winnerInitPoint,
    orderId
  };
}

/**
 * Consulta en Mercado Pago si la orden candidata registra pagos asociados.
 * Detecta pagos en estado 'approved', 'in_process', 'pending' o 'authorized'.
 * Implementa timeout de seguridad para evitar bloqueos por cuelgues de red.
 */
export async function checkCandidateOrderPaymentStatus(
  orderId: string,
  mpAccessToken: string,
  timeoutMs = 7000,
  injectedPaymentClient?: any
): Promise<{
  status: 'clean' | 'has_active_payment' | 'error';
  activeState?: 'approved' | 'in_process' | 'pending' | 'authorized';
  error?: string;
}> {
  try {
    if (!mpAccessToken && !injectedPaymentClient) {
      throw new Error('Falta token de acceso de Mercado Pago.');
    }

    const paymentClient = injectedPaymentClient || new Payment(new MercadoPagoConfig({ accessToken: mpAccessToken }));

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT_MP_PAYMENT_SEARCH')), timeoutMs);
    });

    const searchRes: any = await Promise.race([
      paymentClient.search({
        options: { external_reference: orderId }
      }),
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });

    const results = searchRes?.results || [];

    const approvedPayment = results.find((p: any) => p.status === 'approved');
    if (approvedPayment) {
      return { status: 'has_active_payment', activeState: 'approved' };
    }

    const inProcessPayment = results.find((p: any) =>
      ['in_process', 'pending', 'authorized'].includes(p.status)
    );
    if (inProcessPayment) {
      return { status: 'has_active_payment', activeState: inProcessPayment.status };
    }

    return { status: 'clean' };
  } catch (err: any) {
    return {
      status: 'error',
      error: err?.message || 'Error al consultar pagos en Mercado Pago'
    };
  }
}

/**
 * Invalida activamente una preferencia en Mercado Pago adelantando su fecha de expiración al pasado.
 * Esto provoca que el init_point de checkout sea rechazado de inmediato por Mercado Pago.
 * Implementa timeout de seguridad.
 */
export async function invalidateCandidateOrderPreference(
  preferenceId: string,
  mpAccessToken: string,
  timeoutMs = 7000,
  injectedPreferenceClient?: any
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!mpAccessToken && !injectedPreferenceClient) {
      throw new Error('Falta token de acceso de Mercado Pago.');
    }

    const prefClient = injectedPreferenceClient || new Preference(new MercadoPagoConfig({ accessToken: mpAccessToken }));
    const pastDate = new Date(Date.now() - 60 * 1000).toISOString();

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT_MP_PREFERENCE_UPDATE')), timeoutMs);
    });

    await Promise.race([
      prefClient.update({
        id: preferenceId,
        updatePreferenceRequest: {
          expires: true,
          expiration_date_to: pastDate
        }
      }),
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });

    markPreferenceAsInvalidated(preferenceId);
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error al invalidar la preferencia en Mercado Pago'
    };
  }
}

/**
 * Verifica en Mercado Pago si una preferencia existente asociada a una orden pendiente continúa vigente
 * y es estructuralmente íntegra:
 * 1. Consulta siempre Mercado Pago (`prefClient.get`) sin omitir la comprobación remota por el Set en memoria.
 * 2. Verifica que `prefData.id` coincida con `preferenceId`.
 * 3. Verifica que exista un `init_point` o `sandbox_init_point` utilizable (no vacío).
 * 4. Verifica que `external_reference` coincida con `expectedOrderId` (cuando se proporciona) o no sea vacío.
 * 5. Si `expires === true` y `expiration_date_to` está ausente o no es una fecha válida, falla en cerrado (`status: 'error'`).
 * 6. Comprueba que `expiration_date_to` y `date_of_expiration` (si existen) sean fechas válidas y futuras (> `nowMs`).
 */
export async function checkCandidatePreferenceValidity(
  preferenceId: string,
  mpAccessToken: string,
  timeoutMs = 7000,
  injectedPreferenceClient?: any,
  nowMs = Date.now(),
  expectedOrderId?: string | null
): Promise<{
  valid: boolean;
  status: 'active' | 'expired' | 'error';
  error?: string;
}> {
  const cleanPrefId = typeof preferenceId === 'string' ? preferenceId.trim() : '';
  if (!cleanPrefId) {
    return { valid: false, status: 'expired', error: 'ID de preferencia vacío o inválido' };
  }

  try {
    if (!mpAccessToken && !injectedPreferenceClient) {
      throw new Error('Falta token de acceso de Mercado Pago.');
    }

    const prefClient =
      injectedPreferenceClient || new Preference(new MercadoPagoConfig({ accessToken: mpAccessToken }));

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('TIMEOUT_MP_PREFERENCE_GET')), timeoutMs);
    });

    const prefData: any = await Promise.race([
      prefClient.get({ preferenceId: cleanPrefId }),
      timeoutPromise
    ]).finally(() => {
      clearTimeout(timeoutId);
    });

    if (
      !prefData ||
      typeof prefData !== 'object' ||
      !prefData.id ||
      String(prefData.id).trim() !== cleanPrefId
    ) {
      return {
        valid: false,
        status: 'error',
        error: 'Respuesta inválida o ID incongruente al consultar preferencia en Mercado Pago'
      };
    }

    // Verificar existencia de un init_point utilizable
    const usableInitPoint = prefData.sandbox_init_point || prefData.init_point;
    if (typeof usableInitPoint !== 'string' || usableInitPoint.trim() === '') {
      return {
        valid: false,
        status: 'error',
        error: 'La preferencia en Mercado Pago no contiene un init_point utilizable'
      };
    }

    // Verificar congruencia de external_reference con la orden
    const cleanExpectedOrderId =
      typeof expectedOrderId === 'string' ? expectedOrderId.trim() : '';
    if (cleanExpectedOrderId) {
      const extRef =
        typeof prefData.external_reference === 'string'
          ? prefData.external_reference.trim()
          : '';
      if (!extRef || extRef !== cleanExpectedOrderId) {
        return {
          valid: false,
          status: 'error',
          error: 'El external_reference de la preferencia no corresponde a la orden'
        };
      }
    } else if ('external_reference' in prefData) {
      const extRef =
        typeof prefData.external_reference === 'string'
          ? prefData.external_reference.trim()
          : '';
      if (!extRef) {
        return {
          valid: false,
          status: 'error',
          error: 'La preferencia en Mercado Pago tiene un external_reference vacío o inválido'
        };
      }
    }

    // Si expires === true, expiration_date_to es obligatorio y debe ser una fecha válida
    if (prefData.expires === true) {
      if (
        typeof prefData.expiration_date_to !== 'string' ||
        prefData.expiration_date_to.trim() === ''
      ) {
        return {
          valid: false,
          status: 'error',
          error: 'La preferencia tiene expires=true pero carece de expiration_date_to'
        };
      }

      const expToMs = Date.parse(prefData.expiration_date_to);
      if (!Number.isFinite(expToMs)) {
        return {
          valid: false,
          status: 'error',
          error: 'La preferencia tiene un expiration_date_to inválido o no interpretable'
        };
      }

      if (expToMs <= nowMs) {
        markPreferenceAsInvalidated(cleanPrefId);
        return { valid: false, status: 'expired' };
      }

      if (prefData.expiration_date_from !== undefined && prefData.expiration_date_from !== null) {
        const expFromMs = Date.parse(String(prefData.expiration_date_from));
        if (!Number.isFinite(expFromMs)) {
          return {
            valid: false,
            status: 'error',
            error: 'La preferencia tiene un expiration_date_from inválido o no interpretable'
          };
        }
        if (expFromMs > nowMs + 60_000) {
          return { valid: false, status: 'expired' };
        }
      }
    } else if (prefData.expiration_date_to !== undefined && prefData.expiration_date_to !== null) {
      const expToMs = Date.parse(String(prefData.expiration_date_to));
      if (!Number.isFinite(expToMs)) {
        return {
          valid: false,
          status: 'error',
          error: 'La preferencia tiene un expiration_date_to inválido o no interpretable'
        };
      }
      if (expToMs <= nowMs) {
        markPreferenceAsInvalidated(cleanPrefId);
        return { valid: false, status: 'expired' };
      }
    }

    if (prefData.date_of_expiration !== undefined && prefData.date_of_expiration !== null) {
      const dateOfExpMs = Date.parse(String(prefData.date_of_expiration));
      if (!Number.isFinite(dateOfExpMs)) {
        return {
          valid: false,
          status: 'error',
          error: 'La preferencia tiene un date_of_expiration inválido o no interpretable'
        };
      }
      if (dateOfExpMs <= nowMs) {
        markPreferenceAsInvalidated(cleanPrefId);
        return { valid: false, status: 'expired' };
      }
    }

    return { valid: true, status: 'active' };
  } catch (err: any) {
    return {
      valid: false,
      status: 'error',
      error: err?.message || 'Error al verificar vigencia de preferencia en Mercado Pago'
    };
  }
}

/**
 * Intenta adquirir un lease de checkout en PostgreSQL para serializar operaciones por usuario.
 * Evita colisiones de creación concurrente de órdenes y dobles cobros.
 * Si la RPC no existe o falla, detiene el flujo sin asumir fallback inseguro.
 */
export async function acquireUserCheckoutLease(
  supabaseAdmin: any,
  userId: string,
  cartId: string,
  leaseId: string,
  ttlSeconds = 45
): Promise<{ success: boolean; httpStatus?: number; code?: string; message?: string; retryAfter?: number }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('acquire_checkout_lease', {
      p_user_id: userId,
      p_cart_id: cartId,
      p_lease_id: leaseId,
      p_ttl_seconds: ttlSeconds
    });

    if (error) {
      // Clasificación estricta según Fase 1 / Fase 4:
      // Distingue entre ausencia de RPC/tabla (migración 012 pendiente), permisos insuficientes (42501)
      // y errores de datos o fallos internos de PostgreSQL.
      const classified = classifyCheckoutLeaseError(error);
      return {
        success: false,
        httpStatus: classified.httpStatus,
        code: classified.code,
        message: classified.message
      };
    }

    if (!data?.success) {
      return {
        success: false,
        httpStatus: 409,
        code: data?.code || 'CHECKOUT_IN_PROGRESS',
        message: data?.message || 'Ya existe un proceso de pago en curso para tu cuenta. Por favor espera unos momentos antes de reintentar.',
        retryAfter: data?.retry_after_seconds || 5
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 503,
      code: 'CHECKOUT_LEASE_UNAVAILABLE',
      message: err?.message || 'Fallo de comunicación al reservar el checkout.'
    };
  }
}

/**
 * Verifica que el lease_id del request siga siendo el propietario activo y no haya expirado.
 * Protege contra peticiones zombis que se ralentizaron y perdieron su lease por timeout de Mercado Pago.
 */
export async function verifyUserCheckoutLease(
  supabaseAdmin: any,
  userId: string,
  leaseId: string
): Promise<{ valid: boolean; code?: string; message?: string }> {
  try {
    const { data, error } = await supabaseAdmin
      .from('user_checkout_leases')
      .select('lease_id, expires_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return {
        valid: false,
        code: 'LEASE_NOT_FOUND',
        message: 'La reserva de checkout ya no existe o fue eliminada.'
      };
    }

    if (data.lease_id !== leaseId) {
      return {
        valid: false,
        code: 'LEASE_LOST_TO_CONCURRENT_REQUEST',
        message: 'La reserva de checkout fue adquirida por otra solicitud concurrente.'
      };
    }

    if (new Date(data.expires_at).getTime() <= Date.now()) {
      return {
        valid: false,
        code: 'LEASE_EXPIRED',
        message: 'La reserva de checkout ha expirado por tiempo de espera.'
      };
    }

    return { valid: true };
  } catch (err: any) {
    return {
      valid: false,
      code: 'LEASE_VERIFICATION_ERROR',
      message: err?.message || 'Error al verificar la vigencia de la reserva.'
    };
  }
}

/**
 * Libera de forma segura la reserva de checkout del usuario garantizando Fencing Token (leaseId).
 */
export async function releaseUserCheckoutLease(
  supabaseAdmin: any,
  userId: string,
  leaseId: string
): Promise<{ success: boolean; released: boolean }> {
  try {
    const { data, error } = await supabaseAdmin.rpc('release_checkout_lease', {
      p_user_id: userId,
      p_lease_id: leaseId
    });

    if (error) {
      return { success: false, released: false };
    }

    return { success: true, released: !!data?.released };
  } catch {
    return { success: false, released: false };
  }
}

/**
 * Verifica en Supabase TODAS las órdenes pendientes que van a ser reemplazadas (incluyendo las que tenían
 * `preference_id = null` en la lectura inicial), invalida en Mercado Pago las preferencias activas esperadas
 * y desacopla inmediatamente (`preference_id = null, init_point = null`) cada preferencia invalidada en Supabase.
 *
 * Garantías de seguridad (MEDIO-02):
 * 1. Se invoca únicamente DESPUÉS de que `sync_cart` y `verifyUserCheckoutLease` hayan tenido éxito.
 * 2. Inspecciona en base de datos TODAS las órdenes que se pretenden cancelar (`ordersToReplace` / `preferencesToInvalidate`):
 *    - Si una orden leída inicialmente con `preference_id = null` recibió una preferencia antes de la cancelación,
 *      detecta el cambio (`currentOrder.preference_id !== null`) y aborta con HTTP 409 sin invalidar la preferencia
 *      ganadora ni cancelar la orden.
 *    - Si una orden cambió de estado (`status !== 'pending'`) o de `preference_id`, aborta con HTTP 409.
 * 3. Registra cada preferencia invalidada en `markPreferenceAsInvalidated` tan pronto como Mercado Pago confirma
 *    su expiración y limpia `preference_id = null, init_point = null` en Supabase (con un reintento inmediato).
 *    Si ambos UPDATE fallan, devuelve HTTP 500 `PRIOR_PREFERENCE_DETACH_FAILED` con `failedDetachPreferenceIds`,
 *    y el siguiente checkout detecta la preferencia invalidada mediante el registro en memoria y `checkCandidatePreferenceValidity`.
 */
export async function invalidateAndDetachPriorOrderPreferences({
  supabaseAdmin,
  userId,
  preferencesToInvalidate,
  ordersToReplace,
  invalidatePreference
}: {
  supabaseAdmin: any;
  userId: string;
  preferencesToInvalidate?: { orderId: string; preferenceId: string | null }[];
  ordersToReplace?: PriorOrderReplacementSnapshot[];
  invalidatePreference: (preferenceId: string) => Promise<{ success: boolean; error?: string }>;
}): Promise<
  | {
      ok: true;
      detachedOrders: { orderId: string; invalidatedPreferenceId: string }[];
      failedDetachPreferenceIds: string[];
    }
  | {
      ok: false;
      httpStatus: 409 | 500 | 502;
      code:
        | 'CONCURRENT_ORDER_STATE_CHANGED'
        | 'PREFERENCE_INVALIDATION_FAILED'
        | 'PRIOR_PREFERENCE_DETACH_FAILED';
      error: string;
      orderId: string;
      detachedOrders: { orderId: string; invalidatedPreferenceId: string }[];
      failedDetachPreferenceIds: string[];
    }
> {
  const detachedOrders: { orderId: string; invalidatedPreferenceId: string }[] = [];
  const failedDetachPreferenceIds: string[] = [];

  const targets: PriorOrderReplacementSnapshot[] =
    ordersToReplace && ordersToReplace.length > 0
      ? ordersToReplace
      : (preferencesToInvalidate || []).map((item) => ({
          orderId: item.orderId,
          expectedPreferenceId: item.preferenceId ?? null
        }));

  for (const item of targets) {
    if (!item?.orderId) continue;

    // 1. Verificar en BD que la orden previa siga 'pending' y mantenga exactamente el preference_id observado (incluso si era null)
    const currentOrderQuery = supabaseAdmin
      .from('orders')
      .select('id, status, preference_id')
      .eq('id', item.orderId)
      .eq('user_id', userId);

    const { data: currentOrder, error: currentOrderErr } =
      typeof currentOrderQuery.maybeSingle === 'function'
        ? await currentOrderQuery.maybeSingle()
        : await currentOrderQuery.single();

    if (currentOrderErr) {
      console.error('[CreatePref] Error verificando estado de orden previa antes de invalidar preferencia:', {
        orderId: item.orderId,
        error: currentOrderErr
      });
      return {
        ok: false,
        httpStatus: 500,
        code: 'PRIOR_PREFERENCE_DETACH_FAILED',
        error: 'No se pudo verificar el estado actual de tu orden previa en el servidor. Por favor intenta nuevamente.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    if (!currentOrder || currentOrder.status !== 'pending') {
      return {
        ok: false,
        httpStatus: 409,
        code: 'CONCURRENT_ORDER_STATE_CHANGED',
        error: 'No se pudo procesar el reemplazo porque la orden previa cambió de estado concurrentemente o ya fue procesada.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    const currentPrefId = currentOrder.preference_id ?? null;
    const expectedPrefId = item.expectedPreferenceId ?? null;

    if (expectedPrefId === null) {
      if (currentPrefId !== null) {
        // La orden fue leída inicialmente con preference_id = null, pero otra petición le asignó una preferencia antes de la cancelación.
        // No invalidar la preferencia ganadora ni cancelar la orden.
        return {
          ok: false,
          httpStatus: 409,
          code: 'CONCURRENT_ORDER_STATE_CHANGED',
          error: 'La orden previa recibió una pasarela de pago concurrentemente por otra solicitud.',
          orderId: item.orderId,
          detachedOrders,
          failedDetachPreferenceIds
        };
      }
      // Sigue en status = 'pending' con preference_id = null: no hay preferencia que invalidar
      continue;
    }

    if (currentPrefId !== expectedPrefId) {
      // Otra solicitud concurrente asignó una preferencia ganadora distinta o ya desvinculó la anterior; no invalidar ni continuar
      return {
        ok: false,
        httpStatus: 409,
        code: 'CONCURRENT_ORDER_STATE_CHANGED',
        error: 'La pasarela de pago de la orden previa fue actualizada concurrentemente por otra solicitud.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    // 2. Invalidar la preferencia previa en Mercado Pago
    const invalidation = await invalidatePreference(expectedPrefId);
    if (!invalidation || !invalidation.success) {
      return {
        ok: false,
        httpStatus: 502,
        code: 'PREFERENCE_INVALIDATION_FAILED',
        error: 'No se pudo desactivar la pasarela de pago de tu orden previa. Por seguridad, por favor intenta nuevamente en unos instantes.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    // Registrar inmediatamente como invalidada para impedir que un checkout posterior la reutilice si falla el UPDATE en BD
    markPreferenceAsInvalidated(expectedPrefId);

    // 3. Desacoplar inmediatamente la preferencia invalidada en Supabase
    const runDetachUpdate = async () => {
      const detachQuery = supabaseAdmin
        .from('orders')
        .update({
          preference_id: null,
          init_point: null
        })
        .eq('id', item.orderId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('preference_id', expectedPrefId)
        .select('id, status, preference_id, init_point');

      return typeof detachQuery.maybeSingle === 'function'
        ? await detachQuery.maybeSingle()
        : await detachQuery.single();
    };

    let detachRes = await runDetachUpdate();
    if (detachRes.error) {
      // Un reintento inmediato ante fallo transitorio de red/BD dado que la preferencia ya fue expirada en MP
      detachRes = await runDetachUpdate();
    }

    if (detachRes.error) {
      failedDetachPreferenceIds.push(expectedPrefId);
      console.error('[CreatePref] Error crítico al limpiar preference_id invalidado en orden previa:', {
        orderId: item.orderId,
        preferenceId: expectedPrefId,
        error: detachRes.error
      });
      return {
        ok: false,
        httpStatus: 500,
        code: 'PRIOR_PREFERENCE_DETACH_FAILED',
        error: 'No se pudo actualizar el estado de la pasarela previa en el servidor. Por favor intenta nuevamente.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    if (!detachRes.data || (detachRes.data.status && detachRes.data.status !== 'pending')) {
      return {
        ok: false,
        httpStatus: 409,
        code: 'CONCURRENT_ORDER_STATE_CHANGED',
        error: 'No se pudo procesar el reemplazo porque la orden previa cambió de estado concurrentemente.',
        orderId: item.orderId,
        detachedOrders,
        failedDetachPreferenceIds
      };
    }

    detachedOrders.push({
      orderId: item.orderId,
      invalidatedPreferenceId: expectedPrefId
    });
  }

  return {
    ok: true,
    detachedOrders,
    failedDetachPreferenceIds
  };
}

/**
 * Recuperación explícita, controlada y protegida por lease cuando una etapa posterior a la desvinculación
 * de la preferencia previa (con rollback confirmado en PostgreSQL) falla y no llega a reemplazarse la orden.
 *
 * Garantías de concurrencia (Hallazgo ALTO-M02-01 y ALTO-M02-02):
 * - Exige un `leaseId` válido y verifica la vigencia y titularidad del lease (`verifyLease`):
 *   1. Antes de consultar la orden e ítems en Supabase.
 *   2. Inmediatamente antes de llamar a `createPreference` en Mercado Pago.
 *   3. Inmediatamente después de `createPreference` y ANTES de llamar a `persistPreference` (si el lease se perdió
 *      o expiró mientras se creaba la preferencia en MP, invalida de inmediato la preferencia recién creada y NO la persiste).
 * - La escritura en sí se ejecuta mediante `persistPreference` (`persist_order_preference_with_lease`), que bloquea
 *   atómicamente el lease (`SELECT ... FOR UPDATE`) y actualiza la orden en la misma transacción SQL.
 * - NO existe reversión post-hoc (`leaseAfterPersist`) que pueda invalidar o borrar una preferencia ya comiteada y
 *   potencialmente entregada a otra petición concurrente.
 */
export async function restorePendingOrdersAfterFailedReplacement({
  supabaseAdmin,
  userId,
  leaseId,
  detachedOrders,
  candidateOrdersById,
  siteUrl,
  fallbackCustomerEmail,
  fetchOrderItems,
  verifyLease = verifyUserCheckoutLease,
  createPreference = createMpPreference,
  persistPreference = persistPreferenceAtomic,
  invalidatePreference,
  nowMs = Date.now(),
  reuseWindowMs = 2 * 60 * 60 * 1000
}: {
  supabaseAdmin: any;
  userId: string;
  leaseId?: string | null;
  detachedOrders: { orderId: string; invalidatedPreferenceId: string }[];
  candidateOrdersById: Map<string, any>;
  siteUrl: string;
  fallbackCustomerEmail: string;
  fetchOrderItems: (orderId: string) => Promise<any[]>;
  verifyLease?: (
    supabaseAdmin: any,
    userId: string,
    leaseId: string
  ) => Promise<{ valid: boolean; code?: string; message?: string }>;
  createPreference?: typeof createMpPreference;
  persistPreference?: typeof persistPreferenceAtomic;
  invalidatePreference?: (preferenceId: string) => Promise<{ success: boolean; error?: string }>;
  nowMs?: number;
  reuseWindowMs?: number;
}): Promise<{
  restoredOrderIds: string[];
  detachedOnlyOrderIds: string[];
  abortedByLeaseLoss: boolean;
}> {
  const restoredOrderIds: string[] = [];
  const detachedOnlyOrderIds: string[] = [];
  let abortedByLeaseLoss = false;

  const invalidateOrphanRestoredPreference = async (prefId: string, reason: string) => {
    if (!prefId) return;
    const invFn =
      invalidatePreference ||
      ((id: string) => invalidateCandidateOrderPreference(id, process.env.MP_ACCESS_TOKEN || ''));
    try {
      const invRes = await invFn(prefId);
      if (invRes?.success) {
        markPreferenceAsInvalidated(prefId);
      } else {
        console.error('[CreatePref] Error al invalidar preferencia restaurada tras pérdida de lease:', {
          prefId,
          reason,
          error: invRes?.error
        });
      }
    } catch (err: any) {
      console.error('[CreatePref] Excepción al invalidar preferencia restaurada tras pérdida de lease:', {
        prefId,
        reason,
        error: err?.message || String(err)
      });
    }
  };

  const list = detachedOrders || [];
  for (let i = 0; i < list.length; i++) {
    const detached = list[i];
    const candidateOrder = candidateOrdersById.get(detached.orderId);
    if (!candidateOrder) {
      detachedOnlyOrderIds.push(detached.orderId);
      continue;
    }

    const isStatusPending = String(candidateOrder.status || '').toLowerCase() === 'pending';
    const isPaymentPending = String(candidateOrder.payment_status || '').toLowerCase() === 'pending';
    const isRecent = isOrderWithinReuseWindow(candidateOrder.created_at, nowMs, reuseWindowMs);

    // Órdenes antiguas (> 2h) o con payment_status != 'pending' no deben recibir nueva preferencia;
    // su estado consistente es permanecer con preference_id = null, init_point = null.
    if (!isStatusPending || !isPaymentPending || !isRecent) {
      detachedOnlyOrderIds.push(detached.orderId);
      continue;
    }

    // 1. Verificar vigencia y titularidad del lease antes de iniciar cualquier lectura/operación de recuperación
    if (!leaseId) {
      abortedByLeaseLoss = true;
      for (let j = i; j < list.length; j++) {
        detachedOnlyOrderIds.push(list[j].orderId);
      }
      break;
    }

    const leaseBeforeRead = await verifyLease(supabaseAdmin, userId, leaseId);
    if (!leaseBeforeRead || !leaseBeforeRead.valid) {
      console.warn('[CreatePref] Abortando recuperación compensatoria: lease inválido antes de consultar orden:', {
        orderId: detached.orderId,
        leaseCode: leaseBeforeRead?.code
      });
      abortedByLeaseLoss = true;
      for (let j = i; j < list.length; j++) {
        detachedOnlyOrderIds.push(list[j].orderId);
      }
      break;
    }

    try {
      // 2. Verificar que la orden siga 'pending' y con preference_id = null
      const checkQuery = supabaseAdmin
        .from('orders')
        .select('id, status, preference_id')
        .eq('id', detached.orderId)
        .eq('user_id', userId)
        .eq('status', 'pending');

      const { data: liveOrder, error: liveErr } =
        typeof checkQuery.maybeSingle === 'function'
          ? await checkQuery.maybeSingle()
          : await checkQuery.single();

      if (liveErr || !liveOrder || liveOrder.status !== 'pending' || liveOrder.preference_id !== null) {
        detachedOnlyOrderIds.push(detached.orderId);
        continue;
      }

      const orderItems = await fetchOrderItems(detached.orderId);
      if (!orderItems || orderItems.length === 0) {
        console.warn('[CreatePref] No se encontraron ítems para restaurar preferencia de orden previa:', {
          orderId: detached.orderId
        });
        detachedOnlyOrderIds.push(detached.orderId);
        continue;
      }

      // 3. Comprobar vigencia y titularidad del lease INMEDIATAMENTE antes de crear la preferencia en Mercado Pago
      const leaseBeforeCreate = await verifyLease(supabaseAdmin, userId, leaseId);
      if (!leaseBeforeCreate || !leaseBeforeCreate.valid) {
        console.warn('[CreatePref] Abortando recuperación compensatoria: lease perdido antes de createPreference:', {
          orderId: detached.orderId,
          leaseCode: leaseBeforeCreate?.code
        });
        abortedByLeaseLoss = true;
        for (let j = i; j < list.length; j++) {
          detachedOnlyOrderIds.push(list[j].orderId);
        }
        break;
      }

      const restoredPref = await createPreference({
        orderId: detached.orderId,
        customerName: candidateOrder.customer_name || 'Cliente B2B',
        customerEmail: candidateOrder.customer_email || fallbackCustomerEmail || '',
        orderItems,
        taxAmount: Number(candidateOrder.tax_amount),
        siteUrl
      });

      // 4. Comprobar vigencia y titularidad del lease INMEDIATAMENTE antes de invocar la RPC atómica de persistencia
      const leaseBeforePersist = await verifyLease(supabaseAdmin, userId, leaseId);
      if (!leaseBeforePersist || !leaseBeforePersist.valid) {
        console.warn('[CreatePref] Lease expiró o se perdió durante createPreference en recuperación; invalidando preferencia y abortando persistencia:', {
          orderId: detached.orderId,
          preferenceId: restoredPref.id,
          leaseCode: leaseBeforePersist?.code
        });
        await invalidateOrphanRestoredPreference(restoredPref.id, 'lease_lost_before_persist');
        abortedByLeaseLoss = true;
        for (let j = i; j < list.length; j++) {
          detachedOnlyOrderIds.push(list[j].orderId);
        }
        break;
      }

      // 5. Persistir atómicamente con bloqueo de lease en PostgreSQL (persist_order_preference_with_lease).
      //    Si el lease vence exactamente antes de adquirir el FOR UPDATE en BD, la RPC rechaza sin tocar la orden
      //    y persistPreference invalida únicamente restoredPref.id y lanza CheckoutLeaseInvalidError.
      await persistPreference(
        supabaseAdmin,
        detached.orderId,
        restoredPref.id,
        restoredPref.paymentUrl,
        {
          userId,
          leaseId,
          invalidatePreference
        }
      );

      restoredOrderIds.push(detached.orderId);
    } catch (restoreErr: any) {
      if (
        restoreErr instanceof CheckoutLeaseInvalidError ||
        [
          'LEASE_NOT_FOUND',
          'LEASE_LOST_TO_CONCURRENT_REQUEST',
          'LEASE_EXPIRED',
          'LEASE_REQUIRED'
        ].includes(String(restoreErr?.code || ''))
      ) {
        abortedByLeaseLoss = true;
        for (let j = i; j < list.length; j++) {
          detachedOnlyOrderIds.push(list[j].orderId);
        }
        break;
      }
      console.error('[CreatePref] No se pudo regenerar preferencia inmediata tras fallo de reemplazo; la orden queda con preference_id=null para recuperación segura:', {
        orderId: detached.orderId,
        error: restoreErr?.message || String(restoreErr)
      });
      detachedOnlyOrderIds.push(detached.orderId);
    }
  }

  return {
    restoredOrderIds,
    detachedOnlyOrderIds,
    abortedByLeaseLoss
  };
}

/**
 * Cancela las órdenes pendientes adicionales (`ordersToCancel.slice(1)`) exigiendo `status = 'pending'`
 * y `preference_id IS NULL`. Verifica estrictamente que el resultado sea un arreglo válido con todos
 * los IDs esperados; si falla o quedan filas sin actualizar, ejecuta la compensación apropiada
 * (`restoreDetachedOrdersIfNeeded`) antes de responder sin reactivar órdenes canceladas ni invalidar
 * preferencias ajenas.
 */
export async function cancelExtraPendingOrdersBeforeCheckout({
  supabaseAdmin,
  userId,
  extraOrdersToCancel,
  extraOrderIdsToCancel,
  fallbackCancelOrderId,
  restoreDetachedOrdersIfNeeded
}: {
  supabaseAdmin: any;
  userId: string;
  extraOrdersToCancel?: string[];
  extraOrderIdsToCancel?: string[];
  fallbackCancelOrderId?: string | null;
  restoreDetachedOrdersIfNeeded: () => Promise<void>;
}): Promise<
  | { ok: true; cancelledIds: string[] }
  | { ok: false; httpStatus: 409 | 500; body: Record<string, any> }
> {
  const targetExtraIds = extraOrdersToCancel ?? extraOrderIdsToCancel ?? [];
  if (!targetExtraIds || targetExtraIds.length === 0) {
    return { ok: true, cancelledIds: [] };
  }

  const { data: extraCancelledRows, error: extraCancelErr } = await supabaseAdmin
    .from('orders')
    .update({ status: 'cancelled' })
    .in('id', targetExtraIds)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('preference_id', null)
    .select('id');

  if (extraCancelErr) {
    console.error('[CreatePref] Error cancelando órdenes pendientes adicionales:', extraCancelErr);
    await restoreDetachedOrdersIfNeeded();
    return {
      ok: false,
      httpStatus: 500,
      body: {
        error: 'No se pudieron cancelar todas las órdenes pendientes previas antes de crear el nuevo pedido.',
        code: 'PRIOR_ORDER_CANCELLATION_FAILED'
      }
    };
  }

  const cancelledIds = Array.isArray(extraCancelledRows)
    ? extraCancelledRows
        .map((row: any) => (row && typeof row.id === 'string' ? row.id.trim() : ''))
        .filter(Boolean)
    : [];

  const allExpectedCancelled =
    Array.isArray(extraCancelledRows) &&
    cancelledIds.length === targetExtraIds.length &&
    targetExtraIds.every((expectedId) => cancelledIds.includes(expectedId));

  if (!allExpectedCancelled) {
    await restoreDetachedOrdersIfNeeded();
    return {
      ok: false,
      httpStatus: 409,
      body: {
        error:
          'No se pudo procesar el reemplazo porque una de las órdenes previas cambió de estado o recibió una pasarela concurrentemente.',
        code: 'CONCURRENT_ORDER_STATE_CHANGED',
        orderId: fallbackCancelOrderId || targetExtraIds[0]
      }
    };
  }

  return { ok: true, cancelledIds };
}

/**
 * Valida la coherencia del resultado de `process_b2b_checkout` tras haber desvinculado una orden previa:
 * - Si el carrito ya estaba convertido (`v_cart_status != 'active'`), `process_b2b_checkout` retorna anticipadamente
 *   la orden asociada a ese carrito sin cancelar `cancelOrderId` ni crear el nuevo pedido. En ese caso, si había
 *   un reemplazo en curso (`cancelOrderId !== null`), restaura de forma segura la orden previa desvinculada
 *   (bajo lease válido) y rechaza con HTTP 409 `CART_ALREADY_CONVERTED` para no emitir una preferencia sobre
 *   ítems obsoletos ni dejar la orden previa sin preferencia.
 * - Si falla la lectura posterior de la orden devuelta o su estado ya no es `pending`, verifica si `cancelOrderId`
 *   permaneció `pending` (sin cancelar) para restaurarla bajo lease válido antes de devolver el error correspondiente.
 * - Cuando `cancelOrderId !== null` y la RPC devuelve otra orden (`rawOrderId !== cancelOrderId`), verifica
 *   explícitamente en la base de datos el estado final de `cancelOrderId`. Si `cancelOrderId` no quedó en estado
 *   `cancelled` (por ejemplo, sigue `pending`), restaura su preferencia bajo lease válido y aborta con HTTP 409
 *   sin continuar como si el reemplazo se hubiera completado.
 */
export async function validateCreatedOrderAfterCheckoutRpc({
  supabaseAdmin,
  userId,
  checkoutResult,
  cancelOrderId,
  restoreDetachedOrdersIfNeeded
}: {
  supabaseAdmin: any;
  userId: string;
  checkoutResult: any;
  cancelOrderId: string | null;
  restoreDetachedOrdersIfNeeded: () => Promise<void>;
}): Promise<
  | {
      ok: true;
      orderId: string;
      orderData: {
        status: string;
        preference_id?: string | null;
        init_point?: string | null;
        customer_name?: string | null;
        customer_email?: string | null;
        tax_amount: number | string;
      };
    }
  | {
      ok: false;
      httpStatus: 409 | 500;
      body: Record<string, any>;
    }
> {
  const rawOrderId = checkoutResult?.order_id;
  const resultMsg = String(checkoutResult?.message || '');
  const isAlreadyConvertedMessage = /carrito ya convertido/i.test(resultMsg);

  // 1. Si se pretendía reemplazar una orden pendiente previa (cancelOrderId !== null), pero la RPC devolvió
  //    una orden existente por idempotencia de carrito ya convertido (o devolvió el mismo cancelOrderId sin cancelarlo),
  //    la Fase 2 de process_b2b_checkout NO se ejecutó: cancelOrderId sigue 'pending' con preference_id = null.
  if (cancelOrderId && (isAlreadyConvertedMessage || rawOrderId === cancelOrderId)) {
    await restoreDetachedOrdersIfNeeded();
    return {
      ok: false,
      httpStatus: 409,
      body: {
        error:
          'El carrito indicado ya fue procesado anteriormente y no puede utilizarse para reemplazar tu orden pendiente actual. Por favor actualiza tu carrito e intenta nuevamente.',
        code: 'CART_ALREADY_CONVERTED',
        orderId: cancelOrderId
      }
    };
  }

  const orderQuery = supabaseAdmin
    .from('orders')
    .select('status, preference_id, init_point, customer_name, customer_email, tax_amount')
    .eq('id', rawOrderId);

  const { data: orderData, error: orderFetchError } =
    typeof orderQuery.maybeSingle === 'function'
      ? await orderQuery.maybeSingle()
      : await orderQuery.single();

  const restoreIfPriorOrderStillPending = async () => {
    if (!cancelOrderId) return;
    try {
      const priorQuery = supabaseAdmin
        .from('orders')
        .select('id, status, preference_id')
        .eq('id', cancelOrderId)
        .eq('user_id', userId)
        .eq('status', 'pending');
      const { data: priorRow } =
        typeof priorQuery.maybeSingle === 'function'
          ? await priorQuery.maybeSingle()
          : await priorQuery.single();
      if (priorRow && priorRow.status === 'pending' && priorRow.preference_id === null) {
        await restoreDetachedOrdersIfNeeded();
      }
    } catch {
      // Ignorar error de consulta secundaria para preservar el error principal
    }
  };

  if (orderFetchError || !orderData) {
    await restoreIfPriorOrderStillPending();
    return {
      ok: false,
      httpStatus: 500,
      body: { error: 'Error al verificar la orden creada.' }
    };
  }

  if (orderData.status !== 'pending') {
    console.warn('[CreatePref] La orden devuelta por RPC ya no se encuentra en estado pending:', {
      orderId: rawOrderId,
      status: orderData.status
    });
    await restoreIfPriorOrderStillPending();
    return {
      ok: false,
      httpStatus: 409,
      body: {
        error:
          'No se pudo completar el checkout porque la orden dejó de estar pendiente concurrentemente. Por favor intenta nuevamente.',
        code: 'CONCURRENT_ORDER_STATE_CHANGED',
        orderId: rawOrderId
      }
    };
  }

  // 2. Comprobación explícita en BD del estado final de `cancelOrderId` cuando se devuelve otra orden (MEDIO-M02-02)
  if (cancelOrderId && rawOrderId !== cancelOrderId) {
    const priorCheckQuery = supabaseAdmin
      .from('orders')
      .select('id, status, preference_id')
      .eq('id', cancelOrderId)
      .eq('user_id', userId);

    const { data: priorOrderState, error: priorOrderErr } =
      typeof priorCheckQuery.maybeSingle === 'function'
        ? await priorCheckQuery.maybeSingle()
        : await priorCheckQuery.single();

    if (priorOrderErr || !priorOrderState) {
      return {
        ok: false,
        httpStatus: 500,
        body: { error: 'Error al verificar el estado final de la orden previa reemplazada.' }
      };
    }

    if (priorOrderState.status !== 'cancelled') {
      if (priorOrderState.status === 'pending' && priorOrderState.preference_id === null) {
        await restoreDetachedOrdersIfNeeded();
      }
      return {
        ok: false,
        httpStatus: 409,
        body: {
          error:
            'No se pudo procesar el reemplazo porque la orden previa no quedó cancelada o cambió de estado concurrentemente.',
          code: 'CONCURRENT_ORDER_STATE_CHANGED',
          orderId: cancelOrderId
        }
      };
    }
  }

  return {
    ok: true,
    orderId: rawOrderId,
    orderData
  };
}

export async function POST(req: NextRequest) {
  let verifiedUserId: string | null = null;
  let leaseId: string | null = null;
  let leaseAcquired = false;
  let supabaseAdmin: any = null;

  try {
    // Ensure required Supabase server configuration is present
    if (!supabaseUrl || !supabaseAnonKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error('[CreatePref] Missing required Supabase server configuration');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
    supabaseAdmin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No autorizado: Falta token de autenticación.' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    });
    const { data: { user }, error: authError } = await supabaseAuthClient.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado: Token inválido o expirado.' }, { status: 401 });
    }
    verifiedUserId = user.id;

    // 2. PARSEAR BODY Y EXTRAER CART ID
    const body = await req.json();
    const { cart, billing, cartId } = body;

    if (!cartId) {
      return NextResponse.json({ error: 'Falta el identificador del carrito (Sincronización pendiente).' }, { status: 400 });
    }

    // 2.1 ADQUIRIR RESERVA DE CHECKOUT (DISTRIBUTED LEASE BACKED BY POSTGRESQL)
    leaseId = crypto.randomUUID();
    const leaseResult = await acquireUserCheckoutLease(supabaseAdmin, verifiedUserId, cartId, leaseId, 45);
    if (!leaseResult.success) {
      console.warn('[CreatePref] No se pudo adquirir el lease de checkout:', leaseResult);
      return NextResponse.json({
        error: leaseResult.message,
        code: leaseResult.code,
        retryAfter: leaseResult.retryAfter
      }, { status: leaseResult.httpStatus || 503 });
    }
    leaseAcquired = true;

    // 3. VALIDAR RUT Y DATOS B2B
    if (!billing || !billing.rut || !isValidRUT(billing.rut)) {
      return NextResponse.json({ error: 'El RUT ingresado no es válido para compras B2B.' }, { status: 400 });
    }

    // 4. VALIDAR Y CONFIGURAR URL BASE PARA MERCADO PAGO
    let rawSiteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (!rawSiteUrl || rawSiteUrl.includes('localhost') || rawSiteUrl.includes('127.0.0.1')) {
      rawSiteUrl = 'https://optihub-b2b.vercel.app';
    }

    const urlValidation = resolveAndValidateBaseUrl(rawSiteUrl);
    if (!urlValidation.valid || !urlValidation.url) {
      console.error('[CreatePref] Error en URL base:', urlValidation.error);
      return NextResponse.json({ error: urlValidation.error || 'Configuración de URL base inválida.' }, { status: 500 });
    }
    const siteUrl = urlValidation.url;

    // 5. SANEAR Y VALIDAR ÍTEMS EN SERVIDOR (Precios, Stock y MOQ)
    const itemsPayload = (cart || [])
      .filter((item: any) => item.producto?.id_ext && (item.cantidad || 0) > 0)
      .map((item: any) => ({
        product_id: item.producto.id_ext,
        quantity: Math.min(item.cantidad || 0, 9999)
      }));

    const cartCalc = await validateAndRecalculateCart(itemsPayload, supabaseAdmin);
    if (!cartCalc.valid) {
      return NextResponse.json({ error: cartCalc.error }, { status: 400 });
    }

    // 6. ETAPA 1, 2A, 2A.5, 2D.2 & MEDIO-02: GESTIÓN DE TODAS LAS ÓRDENES EN ESTADO 'pending' DEL USUARIO
    const requestNowMs = Date.now();
    let cancelOrderId: string | null = null;
    let ordersToCancel: string[] = [];

    const { data: allPendingOrders, error: pendingOrdersError } = await supabaseAdmin
      .from('orders')
      .select('id, cart_id, total_amount, subtotal_net, tax_amount, preference_id, init_point, created_at, customer_name, customer_email, status, payment_status, notes')
      .eq('user_id', verifiedUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (pendingOrdersError) {
      console.error('[CreatePref] Error consultando órdenes pendientes del usuario:', pendingOrdersError);
      return NextResponse.json({
        error: 'No se pudo verificar el estado de tus órdenes pendientes en el servidor. Por favor intenta nuevamente.',
        code: 'PENDING_ORDERS_QUERY_FAILED'
      }, { status: 500 });
    }

    const fetchOrderItemsForOrder = async (candidateOrderId: string) => {
      const { data: items, error: itemsErr } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', candidateOrderId);
      if (itemsErr) {
        console.error('[CreatePref] Error consultando order_items de orden candidata:', {
          orderId: candidateOrderId,
          error: itemsErr
        });
      }
      return items || [];
    };

    const pendingDecision = await evaluatePendingOrdersForCheckout({
      pendingOrders: allPendingOrders || [],
      fetchOrderItems: fetchOrderItemsForOrder,
      matchesOrder: (candidateOrder, candidateItems) =>
        matchesCandidateOrder(candidateOrder, candidateItems, itemsPayload, cartCalc),
      checkPaymentStatus: (candidateOrderId: string) =>
        checkCandidateOrderPaymentStatus(candidateOrderId, process.env.MP_ACCESS_TOKEN!),
      invalidatePreference: (preferenceId: string) =>
        invalidateCandidateOrderPreference(preferenceId, process.env.MP_ACCESS_TOKEN!),
      checkPreferenceValidity: (preferenceId: string, expectedOrdId?: string) =>
        checkCandidatePreferenceValidity(
          preferenceId,
          process.env.MP_ACCESS_TOKEN!,
          7000,
          undefined,
          requestNowMs,
          expectedOrdId
        ),
      nowMs: requestNowMs,
      deferPreferenceInvalidation: true
    });

    if (pendingDecision.outcome === 'reuse_existing_preference') {
      return NextResponse.json({
        id: pendingDecision.order.preference_id,
        initPoint: pendingDecision.order.init_point,
        orderId: pendingDecision.order.id
      });
    }

    if (pendingDecision.outcome === 'recover_missing_preference') {
      const candidateOrder = pendingDecision.order;
      const leaseBeforeRecover = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
      if (!leaseBeforeRecover.valid) {
        return NextResponse.json(
          {
            error: 'Tu reserva de pago expiró o fue transferida antes de recuperar la pasarela. Por favor intenta nuevamente.',
            code: leaseBeforeRecover.code
          },
          { status: 409 }
        );
      }

      try {
        const pref = await createMpPreference({
          orderId: candidateOrder.id,
          customerName: candidateOrder.customer_name || billing.contacto_nombre || 'Cliente B2B',
          customerEmail: candidateOrder.customer_email || billing.contacto_email || user.email || '',
          orderItems: pendingDecision.candidateItems,
          taxAmount: Number(candidateOrder.tax_amount),
          siteUrl
        });

        const leaseBeforePersistRecover = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
        if (!leaseBeforePersistRecover.valid) {
          await invalidateCandidateOrderPreference(pref.id, process.env.MP_ACCESS_TOKEN!);
          return NextResponse.json(
            {
              error: 'Tu reserva de pago expiró mientras se generaba la pasarela. Por favor intenta nuevamente.',
              code: leaseBeforePersistRecover.code
            },
            { status: 409 }
          );
        }

        const result = await persistPreferenceAtomic(
          supabaseAdmin,
          candidateOrder.id,
          pref.id,
          pref.paymentUrl,
          {
            userId: verifiedUserId,
            leaseId,
            expectedStalePreferenceId: pendingDecision.stalePreferenceId ?? null
          }
        );

        return NextResponse.json(result);
      } catch (mpError: any) {
        if (
          mpError instanceof ConcurrentOrderStateChangedError ||
          mpError?.code === 'CONCURRENT_ORDER_STATE_CHANGED'
        ) {
          console.warn('[CreatePref] Orden recuperada dejó de estar pendiente antes de persistir preferencia:', {
            orderId: candidateOrder.id,
            message: mpError.message
          });
          return NextResponse.json(
            {
              error: mpError.message,
              code: 'CONCURRENT_ORDER_STATE_CHANGED',
              orderId: candidateOrder.id
            },
            { status: 409 }
          );
        }
        if (
          mpError instanceof CheckoutLeaseInvalidError ||
          [
            'LEASE_NOT_FOUND',
            'LEASE_LOST_TO_CONCURRENT_REQUEST',
            'LEASE_EXPIRED',
            'LEASE_REQUIRED'
          ].includes(String(mpError?.code || ''))
        ) {
          return NextResponse.json(
            {
              error: mpError.message,
              code: mpError.code,
              orderId: candidateOrder.id
            },
            { status: 409 }
          );
        }
        if (mpError instanceof WinnerPreferenceVerificationFailedError) {
          return NextResponse.json(
            {
              error: mpError.message,
              code: mpError.code,
              orderId: candidateOrder.id
            },
            { status: mpError.httpStatus }
          );
        }
        console.error('[CreatePref] Error recuperando preferencia MP para orden existente:', mpError?.message || mpError);
        const sanitized = sanitizeMercadoPagoError(mpError);
        return NextResponse.json({ error: sanitized.error }, { status: sanitized.status });
      }
    }

    if (pendingDecision.outcome === 'block') {
      console.warn('[CreatePref] Reemplazo de orden pendiente bloqueado por seguridad:', pendingDecision);
      return NextResponse.json({
        error: pendingDecision.error,
        code: pendingDecision.code,
        orderId: pendingDecision.orderId
      }, { status: pendingDecision.httpStatus });
    }

    ordersToCancel = pendingDecision.ordersToCancel;
    cancelOrderId = ordersToCancel.length > 0 ? ordersToCancel[0] : null;
    const preferencesToInvalidate = pendingDecision.preferencesToInvalidate || [];
    const priorOrdersSnapshot =
      pendingDecision.priorOrdersSnapshot ||
      (allPendingOrders || []).map((o: any) => ({
        orderId: o.id,
        expectedPreferenceId: o.preference_id ?? null
      }));
    const candidateOrdersById = new Map<string, any>(
      (allPendingOrders || []).map((o: any) => [o.id, o])
    );

    // 7. FLUJO NORMAL: No hay orden previa reutilizable o el carrito fue modificado
    // Forzar sincronización del carrito en Supabase ANTES de invalidar preferencias previas
    const { error: syncError } = await supabaseAuthClient.rpc('sync_cart', {
      p_cart_id: cartId,
      p_items: itemsPayload,
      p_last_updated_at: null 
    });

    if (syncError) {
      console.error('[CreatePref] Error sincronizando carrito en RPC sync_cart:', syncError);
      return NextResponse.json({ error: 'Error al sincronizar el carrito antes del checkout.' }, { status: 500 });
    }

    // Preparar datos de facturación
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', verifiedUserId).single();
    
    const billingData = {
      customer_name: billing.contacto_nombre || profile?.first_name || null,
      customer_email: billing.contacto_email || user.email || null,
      customer_phone: billing.contacto_telefono || profile?.phone || null,
      business_name: billing.razon_social || profile?.business_name || null,
      business_rut: billing.rut,
      billing_address: `${billing.direccion || ''}, ${billing.comuna || ''}`,
      shipping_region: billing.region || profile?.region || null,
      shipping_commune: billing.comuna || profile?.commune || null,
    };

    // Verificar vigencia del lease ANTES de invalidar preferencias previas o crear la orden
    const leaseValidityBeforeOrder = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
    if (!leaseValidityBeforeOrder.valid) {
      console.warn('[CreatePref] Abortando creación de orden por lease inválido/expirado:', leaseValidityBeforeOrder);
      return NextResponse.json({
        error: 'Tu reserva de pago expiró o fue transferida antes de registrar la orden. Por favor intenta nuevamente.',
        code: leaseValidityBeforeOrder.code
      }, { status: 409 });
    }

    // Verificar en Supabase TODAS las órdenes pendientes que se van a cancelar (incluyendo las que se leyeron
    // inicialmente con preference_id = null), invalidar en Mercado Pago las preferencias activas esperadas y
    // desacoplarlas (preference_id = null, init_point = null) únicamente tras confirmar sync_cart y verifyUserCheckoutLease.
    let detachedOrders: { orderId: string; invalidatedPreferenceId: string }[] = [];
    if (ordersToCancel.length > 0 || preferencesToInvalidate.length > 0) {
      const invalidationOutcome = await invalidateAndDetachPriorOrderPreferences({
        supabaseAdmin,
        userId: verifiedUserId,
        preferencesToInvalidate,
        ordersToReplace: priorOrdersSnapshot,
        invalidatePreference: (preferenceId: string) =>
          invalidateCandidateOrderPreference(preferenceId, process.env.MP_ACCESS_TOKEN!)
      });

      detachedOrders = invalidationOutcome.detachedOrders;

      if (!invalidationOutcome.ok) {
        if (
          detachedOrders.length > 0 &&
          invalidationOutcome.code !== 'CONCURRENT_ORDER_STATE_CHANGED'
        ) {
          await restorePendingOrdersAfterFailedReplacement({
            supabaseAdmin,
            userId: verifiedUserId,
            leaseId,
            detachedOrders,
            candidateOrdersById,
            siteUrl,
            fallbackCustomerEmail: billing.contacto_email || user.email || '',
            fetchOrderItems: fetchOrderItemsForOrder,
            nowMs: requestNowMs
          });
        }
        return NextResponse.json(
          {
            error: invalidationOutcome.error,
            code: invalidationOutcome.code,
            orderId: invalidationOutcome.orderId
          },
          { status: invalidationOutcome.httpStatus }
        );
      }
    }

    const restoreDetachedOrdersIfNeeded = async () => {
      if (detachedOrders.length > 0 && verifiedUserId && leaseId) {
        await restorePendingOrdersAfterFailedReplacement({
          supabaseAdmin,
          userId: verifiedUserId,
          leaseId,
          detachedOrders,
          candidateOrdersById,
          siteUrl,
          fallbackCustomerEmail: billing.contacto_email || user.email || '',
          fetchOrderItems: fetchOrderItemsForOrder,
          nowMs: requestNowMs
        });
      }
    };

    // Si existían múltiples órdenes pendientes históricas ya verificadas sin pagos activos y con preference_id = null,
    // cancelar las adicionales exigiendo status = 'pending' y preference_id IS NULL antes de pasar la principal a la RPC
    if (ordersToCancel.length > 1) {
      const extraCancelOutcome = await cancelExtraPendingOrdersBeforeCheckout({
        supabaseAdmin,
        userId: verifiedUserId,
        extraOrdersToCancel: ordersToCancel.slice(1),
        restoreDetachedOrdersIfNeeded
      });

      if (!extraCancelOutcome.ok) {
        return NextResponse.json(extraCancelOutcome.body, {
          status: extraCancelOutcome.httpStatus
        });
      }
    }

    // Ejecutar RPC atómico con Fencing Token (p_lease_id) y Cancelación Atómica (p_cancel_order_id)
    const { data: checkoutResult, error: checkoutError } = await supabaseAdmin.rpc('process_b2b_checkout', {
      p_user_id: verifiedUserId,
      p_cart_id: cartId,
      p_billing: billingData,
      p_lease_id: leaseId,
      p_cancel_order_id: cancelOrderId
    });

    if (checkoutError) {
      console.error('[CreatePref] RPC Checkout Error:', {
        message: checkoutError.message,
        code: checkoutError.code,
        details: checkoutError.details,
        hint: checkoutError.hint
      });

      const recoveryDecision = classifyCheckoutRpcFailureForRecovery({
        checkoutError,
        checkoutResult: null
      });

      if (recoveryDecision.shouldRecover) {
        await restoreDetachedOrdersIfNeeded();
      } else {
        console.warn('[CreatePref] Omitiendo recuperación compensatoria tras error de RPC:', {
          category: recoveryDecision.category,
          reason: recoveryDecision.reason,
          cancelOrderId
        });
      }

      // 1. Conflicto de unicidad de orden pendiente por usuario (idx_uniq_user_pending_order)
      const isPendingOrderUniqueConflict =
        checkoutError.message?.includes('CONCURRENT_PENDING_ORDER_EXISTS') ||
        checkoutError.message?.includes('idx_uniq_user_pending_order') ||
        checkoutError.details?.includes('idx_uniq_user_pending_order');

      if (isPendingOrderUniqueConflict) {
        return NextResponse.json({
          error: 'Ya existe una orden pendiente activa para tu cuenta. Por favor completa o revisa el pedido anterior.',
          code: 'CONCURRENT_PENDING_ORDER_EXISTS'
        }, { status: 409 });
      }

      // 2. Conflicto de estado en la orden previa que se intentaba cancelar
      if (checkoutError.message?.includes('CONCURRENT_ORDER_STATE_CHANGED')) {
        const responseBody: Record<string, any> = {
          error: 'No se pudo procesar el reemplazo porque la orden previa cambió de estado concurrentemente o ya fue procesada.',
          code: 'CONCURRENT_ORDER_STATE_CHANGED'
        };
        if (cancelOrderId) {
          responseBody.orderId = cancelOrderId;
        }
        return NextResponse.json(responseBody, { status: 409 });
      }

      // 3. Errores comerciales conocidos: Stock insuficiente (HTTP 400)
      if (
        checkoutError.message?.includes('Stock insuficiente') ||
        checkoutError.message?.includes('inventario configurado') ||
        checkoutError.message?.includes('Cantidad inválida')
      ) {
        return NextResponse.json({
          error: checkoutError.message,
          code: 'INSUFFICIENT_STOCK'
        }, { status: 400 });
      }

      // 4. Errores comerciales conocidos: MOQ no alcanzado (HTTP 400)
      if (
        checkoutError.message?.includes('Compra mínima mayorista') ||
        checkoutError.message?.includes('MOQ')
      ) {
        return NextResponse.json({
          error: checkoutError.message,
          code: 'MOQ_NOT_REACHED'
        }, { status: 400 });
      }

      // 5. Error de expiración del lease detectado por excepción al final de process_b2b_checkout
      if (checkoutError.code === 'P0001' && checkoutError.message?.includes('LEASE_EXPIRED')) {
        return NextResponse.json({
          error: checkoutError.message,
          code: 'LEASE_EXPIRED_AT_COMMIT'
        }, { status: 409 });
      }

      // 5. Errores de catálogo o carrito inválido (HTTP 400)
      if (
        checkoutError.message?.includes('no encontrado en catálogo') ||
        checkoutError.message?.includes('El carrito no existe')
      ) {
        return NextResponse.json({
          error: checkoutError.message,
          code: 'INVALID_CHECKOUT_REQUEST'
        }, { status: 400 });
      }

      // 6. Errores internos de PostgreSQL, violaciones de unicidad no relacionadas (ej. 23505 en carts) o fallos de infraestructura (HTTP 500 Sanitizado)
      return NextResponse.json({
        error: 'Ocurrió un error interno al procesar la orden en el servidor. Por favor intenta nuevamente más tarde.',
        code: 'INTERNAL_CHECKOUT_ERROR'
      }, { status: 500 });
    }

    // 7.1 Validación Fail-Closed: checkoutResult debe ser un objeto válido y definido (resultado ambiguo: NO restaurar a ciegas)
    if (!checkoutResult || typeof checkoutResult !== 'object') {
      console.error('[CreatePref] Respuesta inválida o vacía de RPC process_b2b_checkout (resultado ambiguo):', {
        type: typeof checkoutResult,
        hasResult: !!checkoutResult
      });
      return NextResponse.json({
        error: 'No se pudo confirmar la creación de la orden. Por favor intenta nuevamente.',
        code: 'INVALID_CHECKOUT_RESPONSE'
      }, { status: 500 });
    }

    // 7.2 Si success !== true, verificar si es un rechazo por pérdida de lease o conflicto de concurrencia.
    //     NUNCA ejecutar recuperación compensatoria cuando la RPC rechazó por LEASE_LOST_TO_CONCURRENT_REQUEST,
    //     LEASE_EXPIRED, LEASE_NOT_FOUND o CONCURRENT_ORDER_STATE_CHANGED.
    if (checkoutResult.success !== true) {
      console.warn('[CreatePref] Fallo controlado o rechazo en RPC checkout:', {
        code: checkoutResult.code,
        message: checkoutResult.message
      });
      const recoveryDecision = classifyCheckoutRpcFailureForRecovery({
        checkoutError: null,
        checkoutResult
      });
      if (recoveryDecision.shouldRecover) {
        await restoreDetachedOrdersIfNeeded();
      }
      const responseBody: Record<string, any> = {
        error: checkoutResult.message || 'Conflicto al procesar la orden en el servidor.',
        code: checkoutResult.code || 'CHECKOUT_CONFLICT'
      };
      if (cancelOrderId) {
        responseBody.orderId = cancelOrderId;
      }
      return NextResponse.json(responseBody, { status: 409 });
    }

    // 7.3 Validación Fail-Closed del identificador de orden (order_id): Formato UUID estricto
    const rawOrderId = checkoutResult.order_id;
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!rawOrderId || typeof rawOrderId !== 'string' || !uuidRegex.test(rawOrderId)) {
      console.error('[CreatePref] RPC checkout devolvió success=true pero sin order_id UUID válido:', {
        hasOrderId: !!rawOrderId,
        orderIdType: typeof rawOrderId
      });
      return NextResponse.json({
        error: 'El servidor no pudo verificar la orden creada. Por favor contacta a soporte.',
        code: 'INVALID_ORDER_IDENTIFIER'
      }, { status: 500 });
    }

    // 7.4 Validar consistencia de la orden devuelta (incluyendo carrito ya convertido y fallos posteriores a la desvinculación)
    const validatedOrder = await validateCreatedOrderAfterCheckoutRpc({
      supabaseAdmin,
      userId: verifiedUserId,
      checkoutResult,
      cancelOrderId,
      restoreDetachedOrdersIfNeeded
    });

    if (!validatedOrder.ok) {
      return NextResponse.json(validatedOrder.body, { status: validatedOrder.httpStatus });
    }

    const orderId = validatedOrder.orderId;
    const orderData = validatedOrder.orderData;
    let stalePreferenceOnOrder: string | null = null;

    if (orderData.preference_id && orderData.init_point) {
      // No confiar únicamente en el Set en memoria: verificar siempre la preferencia en Mercado Pago
      const existingPrefValidity = await checkCandidatePreferenceValidity(
        orderData.preference_id,
        process.env.MP_ACCESS_TOKEN!,
        7000,
        undefined,
        requestNowMs,
        orderId
      );

      if (!existingPrefValidity || existingPrefValidity.status === 'error') {
        return NextResponse.json(
          {
            error:
              'No se pudo verificar la vigencia de la pasarela de pago de tu orden en Mercado Pago. Por seguridad, intenta nuevamente en unos instantes.',
            code: 'FAILED_TO_VERIFY_PRIOR_PAYMENTS',
            orderId
          },
          { status: 502 }
        );
      }

      if (
        existingPrefValidity.valid &&
        existingPrefValidity.status === 'active' &&
        !isPreferenceMarkedInvalidated(orderData.preference_id)
      ) {
        return NextResponse.json({
          id: orderData.preference_id,
          initPoint: orderData.init_point,
          orderId
        });
      }

      stalePreferenceOnOrder = orderData.preference_id;
    }

    const { data: orderItems, error: itemsFetchError } = await supabaseAdmin
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    if (itemsFetchError || !orderItems) {
      return NextResponse.json({ error: 'Error al recuperar los ítems de la orden.' }, { status: 500 });
    }

    const leaseBeforeCreateNewPref = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
    if (!leaseBeforeCreateNewPref.valid) {
      return NextResponse.json(
        {
          error: 'Tu reserva de pago expiró o fue transferida antes de generar la pasarela. Por favor intenta nuevamente.',
          code: leaseBeforeCreateNewPref.code,
          orderId
        },
        { status: 409 }
      );
    }

    try {
      const pref = await createMpPreference({
        orderId,
        customerName: orderData.customer_name || 'Cliente B2B',
        customerEmail: orderData.customer_email || user.email || '',
        orderItems,
        taxAmount: Number(orderData.tax_amount),
        siteUrl
      });

      const leaseBeforePersistNewPref = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
      if (!leaseBeforePersistNewPref.valid) {
        await invalidateCandidateOrderPreference(pref.id, process.env.MP_ACCESS_TOKEN!);
        return NextResponse.json(
          {
            error: 'Tu reserva de pago expiró mientras se generaba la pasarela. Por favor intenta nuevamente.',
            code: leaseBeforePersistNewPref.code,
            orderId
          },
          { status: 409 }
        );
      }

      const result = await persistPreferenceAtomic(
        supabaseAdmin,
        orderId,
        pref.id,
        pref.paymentUrl,
        {
          userId: verifiedUserId,
          leaseId,
          expectedStalePreferenceId: stalePreferenceOnOrder
        }
      );

      return NextResponse.json(result);
    } catch (mpError: any) {
      if (
        mpError instanceof ConcurrentOrderStateChangedError ||
        mpError?.code === 'CONCURRENT_ORDER_STATE_CHANGED'
      ) {
        console.warn('[CreatePref] La orden cambió de estado durante la creación de preferencia MP:', {
          orderId,
          message: mpError.message
        });
        return NextResponse.json(
          {
            error: mpError.message,
            code: 'CONCURRENT_ORDER_STATE_CHANGED',
            orderId
          },
          { status: 409 }
        );
      }
      if (
        mpError instanceof CheckoutLeaseInvalidError ||
        [
          'LEASE_NOT_FOUND',
          'LEASE_LOST_TO_CONCURRENT_REQUEST',
          'LEASE_EXPIRED',
          'LEASE_REQUIRED'
        ].includes(String(mpError?.code || ''))
      ) {
        return NextResponse.json(
          {
            error: mpError.message,
            code: mpError.code,
            orderId
          },
          { status: 409 }
        );
      }
      if (mpError instanceof WinnerPreferenceVerificationFailedError) {
        return NextResponse.json(
          {
            error: mpError.message,
            code: mpError.code,
            orderId
          },
          { status: mpError.httpStatus }
        );
      }
      console.error('[CreatePref] Error de Mercado Pago:', mpError?.message || mpError);
      const sanitized = sanitizeMercadoPagoError(mpError);
      return NextResponse.json({ error: sanitized.error }, { status: sanitized.status });
    }

  } catch (error: any) {
    console.error('API Checkout Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor.' }, { status: 500 });
  } finally {
    if (leaseAcquired && verifiedUserId && leaseId && supabaseAdmin) {
      await releaseUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
    }
  }
}
