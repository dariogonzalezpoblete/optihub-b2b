/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isValidRUT } from '@/lib/utils/rut';
import { classifyCheckoutLeaseError, evaluatePendingOrdersForCheckout } from '@/lib/checkoutWebhookAndResult';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

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
 * Crea la preferencia en Mercado Pago con configuración de expiración a 4 horas.
 */
export async function createMpPreference({
  orderId,
  customerName,
  customerEmail,
  orderItems,
  taxAmount,
  siteUrl
}: {
  orderId: string;
  customerName: string;
  customerEmail: string;
  orderItems: any[];
  taxAmount: number;
  siteUrl: string;
}): Promise<{ id: string; paymentUrl: string }> {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw new Error('Falta configuración de Mercado Pago en el servidor.');
  }

  const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
  const preference = new Preference(client);

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

  const prefResponse = await preference.create({
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
      expires: true,
      expiration_date_to: expirationDateTo,
    }
  });

  const paymentUrl = prefResponse.sandbox_init_point || prefResponse.init_point;
  if (!prefResponse.id || !paymentUrl) {
    throw new Error('Mercado Pago devolvió una Preference incompleta.');
  }

  return { id: prefResponse.id, paymentUrl };
}

/**
 * Persiste la preferencia de forma atómica en Supabase con protección contra condiciones de carrera.
 */
export async function persistPreferenceAtomic(
  supabaseAdmin: any,
  orderId: string,
  prefId: string,
  paymentUrl: string
): Promise<{ id: string; initPoint: string; orderId: string }> {
  const { data: updateData, error: updateError } = await supabaseAdmin
    .from('orders')
    .update({
      preference_id: prefId,
      init_point: paymentUrl
    })
    .eq('id', orderId)
    .is('preference_id', null) // Garantía contra race conditions en PostgreSQL
    .select('preference_id, init_point')
    .maybeSingle();

  if (updateError) {
    throw new Error('Error interno al persistir la Preference.');
  }

  if (!updateData) {
    // Otra petición paralela ganó la carrera y escribió su preferencia antes
    const { data: winnerOrder } = await supabaseAdmin
      .from('orders')
      .select('preference_id, init_point')
      .eq('id', orderId)
      .single();

    if (winnerOrder && winnerOrder.preference_id && winnerOrder.init_point) {
      return {
        id: winnerOrder.preference_id,
        initPoint: winnerOrder.init_point,
        orderId
      };
    } else {
      throw new Error('Inconsistencia durante validación concurrente.');
    }
  }

  return {
    id: updateData.preference_id,
    initPoint: updateData.init_point,
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

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Error al invalidar la preferencia en Mercado Pago'
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
    if (leaseResult.success) {
      leaseAcquired = true;
    } else if (leaseResult.code === 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED') {
      console.warn('[CreatePref] RPC acquire_checkout_lease aún no configurada en BD; operando con firma compatible (migración 010).');
      leaseAcquired = false;
    } else {
      console.warn('[CreatePref] No se pudo adquirir el lease de checkout:', leaseResult);
      return NextResponse.json({
        error: leaseResult.message,
        code: leaseResult.code,
        retryAfter: leaseResult.retryAfter
      }, { status: leaseResult.httpStatus || 503 });
    }

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

    // 6. ETAPA 1, 2A, 2A.5 & 2D.2: GESTIÓN DE TODAS LAS ÓRDENES EN ESTADO 'pending' DEL USUARIO
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

    const pendingDecision = await evaluatePendingOrdersForCheckout({
      pendingOrders: allPendingOrders || [],
      fetchOrderItems: async (candidateOrderId: string) => {
        const { data: items } = await supabaseAdmin
          .from('order_items')
          .select('*')
          .eq('order_id', candidateOrderId);
        return items || [];
      },
      matchesOrder: (candidateOrder, candidateItems) =>
        matchesCandidateOrder(candidateOrder, candidateItems, itemsPayload, cartCalc),
      checkPaymentStatus: (candidateOrderId: string) =>
        checkCandidateOrderPaymentStatus(candidateOrderId, process.env.MP_ACCESS_TOKEN!),
      invalidatePreference: (preferenceId: string) =>
        invalidateCandidateOrderPreference(preferenceId, process.env.MP_ACCESS_TOKEN!),
    });

    if (pendingDecision.outcome === 'reuse_existing_preference') {
      return NextResponse.json({
        id: pendingDecision.order.preference_id,
        initPoint: pendingDecision.order.init_point,
        orderId: pendingDecision.order.id
      });
    }

    if (pendingDecision.outcome === 'recover_missing_preference') {
      try {
        const candidateOrder = pendingDecision.order;
        const pref = await createMpPreference({
          orderId: candidateOrder.id,
          customerName: candidateOrder.customer_name || billing.contacto_nombre || 'Cliente B2B',
          customerEmail: candidateOrder.customer_email || billing.contacto_email || user.email || '',
          orderItems: pendingDecision.candidateItems,
          taxAmount: Number(candidateOrder.tax_amount),
          siteUrl
        });

        const result = await persistPreferenceAtomic(
          supabaseAdmin,
          candidateOrder.id,
          pref.id,
          pref.paymentUrl
        );

        return NextResponse.json(result);
      } catch (mpError: any) {
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

    // 7. FLUJO NORMAL: No hay orden previa reutilizable o el carrito fue modificado
    // Forzar sincronización del carrito en Supabase
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

    let checkoutResult: any = null;
    let checkoutError: any = null;

    if (leaseAcquired) {
      // Verificar vigencia del lease antes de convertir el carrito y crear la orden
      const leaseValidityBeforeOrder = await verifyUserCheckoutLease(supabaseAdmin, verifiedUserId, leaseId);
      if (!leaseValidityBeforeOrder.valid) {
        console.warn('[CreatePref] Abortando creación de orden por lease inválido/expirado:', leaseValidityBeforeOrder);
        return NextResponse.json({
          error: 'Tu reserva de pago expiró o fue transferida antes de registrar la orden. Por favor intenta nuevamente.',
          code: leaseValidityBeforeOrder.code
        }, { status: 409 });
      }

      // Si existían múltiples órdenes pendientes históricas ya verificadas sin pagos activos,
      // cancelar las adicionales antes de pasar la orden principal a p_cancel_order_id en la RPC de 5 argumentos
      if (ordersToCancel.length > 1) {
        const extraOrdersToCancel = ordersToCancel.slice(1);
        const { error: extraCancelErr } = await supabaseAdmin
          .from('orders')
          .update({ status: 'cancelled' })
          .in('id', extraOrdersToCancel)
          .eq('user_id', verifiedUserId)
          .eq('status', 'pending');

        if (extraCancelErr) {
          console.error('[CreatePref] Error cancelando órdenes pendientes adicionales:', extraCancelErr);
          return NextResponse.json({
            error: 'No se pudieron cancelar todas las órdenes pendientes previas antes de crear el nuevo pedido.',
            code: 'PRIOR_ORDER_CANCELLATION_FAILED'
          }, { status: 500 });
        }
      }

      // Ejecutar RPC atómico con Fencing Token (p_lease_id) y Cancelación Atómica (p_cancel_order_id)
      const rpcRes = await supabaseAdmin.rpc('process_b2b_checkout', {
        p_user_id: verifiedUserId,
        p_cart_id: cartId,
        p_billing: billingData,
        p_lease_id: leaseId,
        p_cancel_order_id: cancelOrderId
      });
      checkoutResult = rpcRes.data;
      checkoutError = rpcRes.error;
    } else {
      // Modo compatible con migración 010 (3 argumentos) mientras migración 012 no haya sido ejecutada en BD
      if (ordersToCancel.length > 0) {
        const { error: cancelErr } = await supabaseAdmin
          .from('orders')
          .update({ status: 'cancelled' })
          .in('id', ordersToCancel)
          .eq('user_id', verifiedUserId)
          .eq('status', 'pending');

        if (cancelErr) {
          console.error('[CreatePref] Error cancelando órdenes pendientes en modo compatible 010:', cancelErr);
          return NextResponse.json({
            error: 'No se pudo cancelar la orden pendiente previa antes de crear el nuevo pedido.',
            code: 'PRIOR_ORDER_CANCELLATION_FAILED'
          }, { status: 500 });
        }
      }
      const rpcRes = await supabaseAdmin.rpc('process_b2b_checkout', {
        p_user_id: verifiedUserId,
        p_cart_id: cartId,
        p_billing: billingData
      });
      checkoutResult = rpcRes.data;
      checkoutError = rpcRes.error;
    }

    if (checkoutError) {
      console.error('[CreatePref] RPC Checkout Error:', {
        message: checkoutError.message,
        code: checkoutError.code,
        details: checkoutError.details,
        hint: checkoutError.hint
      });

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

    // 7.1 Validación Fail-Closed: checkoutResult debe ser un objeto válido y definido
    if (!checkoutResult || typeof checkoutResult !== 'object') {
      console.error('[CreatePref] Respuesta inválida o vacía de RPC process_b2b_checkout:', {
        type: typeof checkoutResult,
        hasResult: !!checkoutResult
      });
      return NextResponse.json({
        error: 'No se pudo confirmar la creación de la orden. Por favor intenta nuevamente.',
        code: 'INVALID_CHECKOUT_RESPONSE'
      }, { status: 500 });
    }

    // 7.2 Si success !== true, verificar si es un rechazo controlado o respuesta anómala
    if (checkoutResult.success !== true) {
      console.warn('[CreatePref] Fallo controlado o rechazo en RPC checkout:', {
        code: checkoutResult.code,
        message: checkoutResult.message
      });
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

    const orderId = rawOrderId;

      // Consultar preference existente (por si un retry rápido usó el mismo cartId)
      const { data: orderData, error: orderFetchError } = await supabaseAdmin
        .from('orders')
        .select('preference_id, init_point, customer_name, customer_email, tax_amount')
        .eq('id', orderId)
        .single();

      if (orderFetchError || !orderData) {
        return NextResponse.json({ error: 'Error al verificar la orden creada.' }, { status: 500 });
      }

      if (orderData.preference_id && orderData.init_point) {
        return NextResponse.json({ 
          id: orderData.preference_id,
          initPoint: orderData.init_point, 
          orderId 
        });
      }

      const { data: orderItems, error: itemsFetchError } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', orderId);

      if (itemsFetchError || !orderItems) {
        return NextResponse.json({ error: 'Error al recuperar los ítems de la orden.' }, { status: 500 });
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

        const result = await persistPreferenceAtomic(
          supabaseAdmin,
          orderId,
          pref.id,
          pref.paymentUrl
        );

        return NextResponse.json(result);
      } catch (mpError: any) {
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
