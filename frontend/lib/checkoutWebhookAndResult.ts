// frontend/lib/checkoutWebhookAndResult.ts
/**
 * Lógica pura y determinista para:
 * 1. Clasificación estricta de errores SQL en adquisición de lease (distinguiendo ausencia de migración 012,
 *    permisos insuficientes y errores de datos/infraestructura).
 * 2. Evaluación de transiciones de estado e idempotencia en el Webhook de Mercado Pago.
 * 3. Verificación segura de la página de retorno (/checkout/resultado) sin confiar en parámetros de la URL.
 *
 * Sin imports externos para permitir ejecución directa en suites de pruebas Node ESM (.mjs).
 */

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Distingue estrictamente la causa de un error al invocar acquire_checkout_lease:
 * - 'NOT_CONFIGURED': La función acquire_checkout_lease o la tabla user_checkout_leases no existen en el esquema (migración 012 pendiente).
 * - 'PERMISSION_DENIED': Error de permisos PostgreSQL (42501). Nunca debe activar fallback silencioso.
 * - 'UNAVAILABLE': Error de conexión, timeout, datos inválidos o fallo interno de BD. Nunca debe activar fallback silencioso.
 */
export function classifyCheckoutLeaseError(error: unknown): {
  kind: 'NOT_CONFIGURED' | 'PERMISSION_DENIED' | 'UNAVAILABLE';
  httpStatus: number;
  code: string;
  message: string;
} {
  const errObj = error && typeof error === 'object' ? (error as { code?: unknown; message?: unknown }) : {};
  const errCode = String(errObj.code || '');
  const errMsg = String(errObj.message || '');

  if (errCode === '42501') {
    return {
      kind: 'PERMISSION_DENIED',
      httpStatus: 503,
      code: 'CHECKOUT_LEASE_PERMISSION_DENIED',
      message: 'Permisos insuficientes en base de datos para gestionar la reserva de checkout.',
    };
  }

  const isMissingSchemaObject =
    errCode === '42883' || // PostgreSQL undefined_function
    errCode === 'PGRST202' || // PostgREST function not found in schema cache
    errCode === '42P01' || // PostgreSQL undefined_table
    errCode === 'PGRST205' || // PostgREST table not found in schema cache
    /function .*acquire_checkout_lease.*(does not exist|not found)/i.test(errMsg) ||
    /Could not find the function .*acquire_checkout_lease/i.test(errMsg) ||
    /relation .*user_checkout_leases.* does not exist/i.test(errMsg);

  if (isMissingSchemaObject) {
    return {
      kind: 'NOT_CONFIGURED',
      httpStatus: 503,
      code: 'CHECKOUT_CONCURRENCY_NOT_CONFIGURED',
      message:
        'El servicio de checkout requiere la configuración de concurrencia en base de datos. Por favor contacta al administrador.',
    };
  }

  return {
    kind: 'UNAVAILABLE',
    httpStatus: 503,
    code: 'CHECKOUT_LEASE_UNAVAILABLE',
    message: 'No se pudo establecer la reserva de checkout en el servidor. Por favor intenta nuevamente.',
  };
}

export interface OrderSnapshotForWebhook {
  id: string;
  status: string;
  payment_status: string;
  payment_id?: string | null;
  total_amount: number | string;
  currency?: string | null;
  stock_decremented?: boolean;
  stock_error?: string | null;
  notes?: string | null;
}

export interface MpPaymentSnapshot {
  id: string | number;
  status: string;
  external_reference?: string | null;
  transaction_amount?: number | string | null;
  currency_id?: string | null;
}

export type WebhookDecisionAction =
  | {
      action: 'ignore_ack';
      httpStatus: 200;
      reason: string;
      message: string;
      rpcEquivalentResult?: {
        success: boolean;
        code: string;
        message: string;
      };
    }
  | {
      action: 'reject';
      httpStatus: 400;
      reason: 'amount_mismatch' | 'currency_mismatch';
      error: string;
    }
  | {
      action: 'call_approved_rpc';
    }
  | {
      action: 'record_cancelled_order_paid_incident';
      alreadyProcessed: boolean;
      updateFields?: {
        payment_id: string;
        payment_status: 'approved';
        status: 'requires_attention';
        stock_decremented: false;
        stock_error: string;
        notes: string;
      };
      rpcEquivalentResult: {
        success: true;
        already_processed: boolean;
        code: 'cancelled_order_paid_requires_attention' | 'incident_pending';
        message: string;
        stock_status: 'skipped';
      };
    }
  | {
      action: 'update_order_non_approved';
      reason: 'payment_pending' | 'payment_rejected' | 'payment_refunded';
      updateFields: Record<string, unknown>;
    };

/**
 * Evalúa de forma determinista qué acción debe tomar el webhook tras obtener el pago de Mercado Pago y la orden de BD.
 * Garantiza:
 * - Verificación de importe y moneda (CLP).
 * - Protección contra sobrescritura de payment_id si la orden ya está asociada a un pago distinto.
 * - Protección de órdenes canceladas ante pagos aprobados tardíos (incluso si la migración 011 aún no fue ejecutada).
 * - Manejo de estados approved, pending/in_process, rejected/cancelled y refunded/charged_back.
 * - Inmunidad ante notificaciones antiguas o fuera de orden (nunca degrada una orden ya aprobada).
 */
export function evaluateWebhookPaymentTransition({
  order,
  payment,
}: {
  order: OrderSnapshotForWebhook;
  payment: MpPaymentSnapshot;
}): WebhookDecisionAction {
  const paymentIdStr = String(payment.id);
  const paymentStatus = String(payment.status || '').toLowerCase();
  const expectedCurrency = order.currency || 'CLP';

  // 1. Validar moneda e importe siempre antes de aceptar cualquier transición
  if (payment.currency_id !== expectedCurrency) {
    return {
      action: 'reject',
      httpStatus: 400,
      reason: 'currency_mismatch',
      error: 'Currency mismatch',
    };
  }

  const paidAmount = Math.round(Number(payment.transaction_amount));
  const orderAmount = Math.round(Number(order.total_amount));
  if (!Number.isFinite(paidAmount) || paidAmount !== orderAmount) {
    return {
      action: 'reject',
      httpStatus: 400,
      reason: 'amount_mismatch',
      error: 'Amount mismatch',
    };
  }

  // 2. Caso A: Pago aprobado ('approved')
  if (paymentStatus === 'approved') {
    // 2.1 Idempotencia sobre orden en requires_attention ya vinculada a este mismo pago
    if (
      order.status === 'requires_attention' &&
      order.payment_status === 'approved' &&
      order.payment_id &&
      String(order.payment_id) === paymentIdStr
    ) {
      return {
        action: 'record_cancelled_order_paid_incident',
        alreadyProcessed: true,
        rpcEquivalentResult: {
          success: true,
          already_processed: true,
          code: 'incident_pending',
          message:
            'Orden previamente registrada con pago aprobado e incidencia pendiente de conciliación manual.',
          stock_status: 'skipped',
        },
      };
    }

    // 2.2 Conflicto de payment_id: nunca sobrescribir un payment_id existente con otro distinto
    // (aplica tanto a órdenes canceladas como a órdenes en requires_attention o ya procesadas)
    if (order.payment_id && String(order.payment_id) !== paymentIdStr) {
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'payment_conflict',
        message: `ACK. Order ${order.id} is already linked to a different payment`,
        rpcEquivalentResult: {
          success: false,
          code: 'payment_conflict',
          message: 'Order already linked to a different payment',
        },
      };
    }

    // 2.3 Defensa en profundidad si la orden está cancelada (protege aunque la migración 011 aún esté pendiente en BD)
    if (order.status === 'cancelled') {
      const incidentNote = `[INCIDENCIA]: Pago aprobado ${paymentIdStr} recibido sobre orden cancelada/reemplazada. Stock NO descontado. Requiere conciliación manual o reembolso.`;
      const combinedNotes = order.notes ? `${order.notes}\n${incidentNote}` : incidentNote;

      return {
        action: 'record_cancelled_order_paid_incident',
        alreadyProcessed: false,
        updateFields: {
          payment_id: paymentIdStr,
          payment_status: 'approved',
          status: 'requires_attention',
          stock_decremented: false,
          stock_error:
            'Pago tardío recibido sobre orden previamente cancelada/reemplazada. Stock no descontado automáticamente.',
          notes: combinedNotes,
        },
        rpcEquivalentResult: {
          success: true,
          already_processed: false,
          code: 'cancelled_order_paid_requires_attention',
          message:
            'Pago registrado sobre orden cancelada. Stock no descontado. Requiere conciliación manual o reembolso.',
          stock_status: 'skipped',
        },
      };
    }

    // 2.4 Flujo normal de orden activa -> delegar en RPC transaccional process_approved_mp_payment
    return {
      action: 'call_approved_rpc',
    };
  }

  // 3. Caso B: Pagos en proceso / pendientes ('pending', 'in_process', 'authorized', 'in_mediation')
  if (['pending', 'in_process', 'authorized', 'in_mediation'].includes(paymentStatus)) {
    const isAlreadyFinalOrApproved =
      order.payment_status === 'approved' ||
      order.payment_status === 'refunded' ||
      order.stock_decremented === true ||
      ['paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'requires_attention'].includes(
        order.status
      );

    if (isAlreadyFinalOrApproved) {
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'stale_pending_notification',
        message: `ACK. Stale ${paymentStatus} notification ignored for order in status ${order.status}`,
      };
    }

    if (order.status === 'pending' || order.payment_status !== 'pending') {
      return {
        action: 'update_order_non_approved',
        reason: 'payment_pending',
        updateFields: {
          status: 'payment_pending',
          payment_status: 'pending',
        },
      };
    }

    return {
      action: 'ignore_ack',
      httpStatus: 200,
      reason: 'already_payment_pending',
      message: `ACK. Order already in payment_pending`,
    };
  }

  // 4. Caso C: Pagos rechazados o cancelados en pasarela ('rejected', 'cancelled')
  if (['rejected', 'cancelled'].includes(paymentStatus)) {
    const isAlreadyApprovedOrTerminal =
      order.payment_status === 'approved' ||
      order.payment_status === 'refunded' ||
      order.stock_decremented === true ||
      ['paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'refunded', 'requires_attention'].includes(
        order.status
      ) ||
      (order.payment_id && String(order.payment_id) !== paymentIdStr);

    if (isAlreadyApprovedOrTerminal) {
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'stale_rejection_notification',
        message: `ACK. Rejected/cancelled notification for payment ${paymentIdStr} ignored because order is in state ${order.status}/${order.payment_status}`,
      };
    }

    if (order.payment_status !== 'rejected') {
      return {
        action: 'update_order_non_approved',
        reason: 'payment_rejected',
        updateFields: {
          payment_status: 'rejected',
        },
      };
    }

    return {
      action: 'ignore_ack',
      httpStatus: 200,
      reason: 'already_rejected',
      message: 'ACK. Order payment_status already rejected',
    };
  }

  // 5. Caso D: Reembolsos o contracargos ('refunded', 'charged_back')
  if (['refunded', 'charged_back'].includes(paymentStatus)) {
    if (order.payment_status === 'refunded') {
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'already_refunded',
        message: 'ACK. Order already marked as refunded',
      };
    }

    // Solo aceptar reembolso si la orden estaba aprobada y coincide con el payment_id registrado
    if (
      order.payment_status !== 'approved' ||
      (order.payment_id && String(order.payment_id) !== paymentIdStr)
    ) {
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'unmatched_refund_ignored',
        message: `ACK. Refund notification for ${paymentIdStr} ignored (does not match approved payment on order)`,
      };
    }

    const refundNote = `[INCIDENCIA REEMBOLSO]: Pago ${paymentIdStr} notificado como ${paymentStatus}. ${
      order.stock_decremented
        ? 'El stock ya había sido descontado; requiere conciliación manual de inventario.'
        : 'Stock no había sido descontado.'
    }`;
    const combinedNotes = order.notes ? `${order.notes}\n${refundNote}` : refundNote;

    return {
      action: 'update_order_non_approved',
      reason: 'payment_refunded',
      updateFields: {
        payment_status: 'refunded',
        status: order.stock_decremented ? 'requires_attention' : 'refunded',
        notes: combinedNotes,
      },
    };
  }

  return {
    action: 'ignore_ack',
    httpStatus: 200,
    reason: 'unhandled_payment_status',
    message: `ACK. Payment status ${paymentStatus} ignored`,
  };
}

export type CheckoutDisplayState = 'verifying' | 'approved' | 'pending' | 'rejected';

const VALID_PROCESSED_ORDER_STATUSES = ['paid', 'preparing', 'shipped', 'delivered'];

/**
 * Determina el estado visual de /checkout/resultado.
 * REGLAS DE SEGURIDAD (Fase 3.7 y Etapa 2D.2):
 * - NUNCA devuelve 'approved' basándose únicamente en los parámetros de la URL (`urlStatus`).
 * - Para mostrar 'approved' es OBLIGATORIO que `orderFromDb` exista, coincida con `urlRef` (UUID válido),
 *   tenga `orderFromDb.payment_status === 'approved'` Y `orderFromDb.status` pertenezca a los estados de
 *   una orden efectivamente procesada (`paid`, `preparing`, `shipped`, `delivered`).
 * - Si `orderFromDb.status === 'requires_attention'`, NUNCA devuelve 'approved'; devuelve 'pending' con
 *   `requiresAttention: true` para informar revisión/conciliación pendiente.
 */
export function resolveVerifiedCheckoutResult({
  urlStatus,
  urlRef,
  orderFromDb,
  verificationComplete,
}: {
  urlStatus?: string | null;
  urlRef?: string | null;
  orderFromDb?: {
    id: string;
    status: string;
    payment_status: string;
    payment_id?: string | null;
  } | null;
  verificationComplete: boolean;
}): {
  displayState: CheckoutDisplayState;
  requiresAttention: boolean;
  verifiedOrderId: string | null;
  verifiedPaymentId: string | null;
} {
  const normalizedUrlStatus = String(urlStatus || '').toLowerCase();

  // 1. Sin referencia UUID válida en la URL: jamás puede ser aprobado
  if (!isValidUuid(urlRef)) {
    return {
      displayState: 'rejected',
      requiresAttention: false,
      verifiedOrderId: null,
      verifiedPaymentId: null,
    };
  }

  // 2. Mientras la consulta a la base de datos sigue en curso
  if (!verificationComplete) {
    return {
      displayState: 'verifying',
      requiresAttention: false,
      verifiedOrderId: urlRef,
      verifiedPaymentId: null,
    };
  }

  // 3. Si la orden existe en BD y pertenece al usuario autenticado
  if (orderFromDb && orderFromDb.id === urlRef) {
    const dbPayStatus = String(orderFromDb.payment_status || '').toLowerCase();
    const dbOrderStatus = String(orderFromDb.status || '').toLowerCase();

    // 3.1 Orden con incidencia (ej. pago tardío sobre orden cancelada o quiebre de stock):
    //     NUNCA mostrar como compra aprobada en marcha; mostrar estado de revisión/conciliación pendiente.
    if (dbOrderStatus === 'requires_attention') {
      return {
        displayState: 'pending',
        requiresAttention: true,
        verifiedOrderId: orderFromDb.id,
        verifiedPaymentId: orderFromDb.payment_id || null,
      };
    }

    // 3.2 ÚNICA vía para declarar 'approved': confirmación real en BD y estado de orden procesada activa
    if (
      dbPayStatus === 'approved' &&
      VALID_PROCESSED_ORDER_STATUSES.includes(dbOrderStatus)
    ) {
      return {
        displayState: 'approved',
        requiresAttention: false,
        verifiedOrderId: orderFromDb.id,
        verifiedPaymentId: orderFromDb.payment_id || null,
      };
    }

    if (dbPayStatus === 'rejected' || dbPayStatus === 'refunded' || dbOrderStatus === 'cancelled') {
      return {
        displayState: 'rejected',
        requiresAttention: false,
        verifiedOrderId: orderFromDb.id,
        verifiedPaymentId: orderFromDb.payment_id || null,
      };
    }

    // Si en BD sigue 'pending':
    // - Si el usuario volvió de un flujo explícito de rechazo/fallo en la URL, mostrar 'rejected'.
    // - Si volvió con 'approved', 'pending' o 'in_process' en la URL pero el webhook aún no actualiza la BD,
    //   mostrar 'pending' (Pago en Verificación / Pendiente de Acreditación), NUNCA 'approved'.
    if (['failure', 'rejected', 'null'].includes(normalizedUrlStatus)) {
      return {
        displayState: 'rejected',
        requiresAttention: false,
        verifiedOrderId: orderFromDb.id,
        verifiedPaymentId: null,
      };
    }

    return {
      displayState: 'pending',
      requiresAttention: false,
      verifiedOrderId: orderFromDb.id,
      verifiedPaymentId: orderFromDb.payment_id || null,
    };
  }

  // 4. Si la orden no se encontró en BD (o no pertenece al usuario autenticado):
  //    Nunca declarar 'approved' por query params.
  if (['pending', 'in_process'].includes(normalizedUrlStatus)) {
    return {
      displayState: 'pending',
      requiresAttention: false,
      verifiedOrderId: urlRef,
      verifiedPaymentId: null,
    };
  }

  return {
    displayState: 'rejected',
    requiresAttention: false,
    verifiedOrderId: null,
    verifiedPaymentId: null,
  };
}

export interface PendingOrderCandidateRow {
  id: string;
  cart_id?: string | null;
  total_amount: number | string;
  subtotal_net: number | string;
  tax_amount: number | string;
  preference_id?: string | null;
  init_point?: string | null;
  created_at?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  status: string;
  payment_status: string;
  notes?: string | null;
}

export function isOrderWithinReuseWindow(
  createdAt: string | null | undefined,
  nowMs = Date.now(),
  reuseWindowMs = 2 * 60 * 60 * 1000
): boolean {
  if (!createdAt || typeof createdAt !== 'string') return false;
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  const ageMs = nowMs - createdMs;
  return ageMs >= -60_000 && ageMs <= reuseWindowMs;
}

export type PendingOrdersEvaluationResult<TItem = Record<string, unknown>> =
  | {
      outcome: 'reuse_existing_preference';
      order: PendingOrderCandidateRow;
      candidateItems: TItem[];
    }
  | {
      outcome: 'recover_missing_preference';
      order: PendingOrderCandidateRow;
      candidateItems: TItem[];
    }
  | {
      outcome: 'proceed_new_order';
      ordersToCancel: string[];
    }
  | {
      outcome: 'block';
      httpStatus: 409 | 502;
      code:
        | 'PAYMENT_ALREADY_APPROVED'
        | 'PAYMENT_IN_PROCESS'
        | 'FAILED_TO_VERIFY_PRIOR_PAYMENTS'
        | 'PREFERENCE_INVALIDATION_FAILED';
      error: string;
      orderId: string;
    };

/**
 * Evalúa todas las órdenes con `status = 'pending'` de un usuario antes de crear un nuevo checkout.
 * Cumple los requisitos de la Etapa 2D.2 (Corrección 1):
 * 1. Inspecciona todas las órdenes `status = 'pending'` sin filtrar por antigüedad ni `payment_status`.
 * 2. Solo reutiliza cuando existe exactamente 1 orden candidata, reciente (< 2h), con `payment_status === 'pending'`
 *    y coincidencia exacta 1:1 con el carrito e importes recalculados.
 * 3. Para órdenes antiguas, con `payment_status = 'rejected'`, múltiples o con carrito modificado,
 *    consulta SIEMPRE el estado real en Mercado Pago antes de permitir cualquier cancelación/reemplazo.
 * 4. Ante pagos aprobados/en proceso o ante errores/respuestas ambiguas de Mercado Pago, aborta de forma fail-closed
 *    conservando las órdenes intactas.
 */
export async function evaluatePendingOrdersForCheckout<TItem = Record<string, unknown>>({
  pendingOrders,
  fetchOrderItems,
  matchesOrder,
  checkPaymentStatus,
  invalidatePreference,
  nowMs = Date.now(),
  reuseWindowMs = 2 * 60 * 60 * 1000,
}: {
  pendingOrders: PendingOrderCandidateRow[];
  fetchOrderItems: (orderId: string) => Promise<TItem[]>;
  matchesOrder: (candidateOrder: PendingOrderCandidateRow, candidateItems: TItem[]) => boolean;
  checkPaymentStatus: (orderId: string) => Promise<{
    status: string;
    activeState?: string;
    error?: string;
  }>;
  invalidatePreference: (preferenceId: string) => Promise<{
    success: boolean;
    error?: string;
  }>;
  nowMs?: number;
  reuseWindowMs?: number;
}): Promise<PendingOrdersEvaluationResult<TItem>> {
  if (!pendingOrders || pendingOrders.length === 0) {
    return {
      outcome: 'proceed_new_order',
      ordersToCancel: [],
    };
  }

  // Solo considerar reutilización si existe exactamente UNA orden pendiente, reciente y con payment_status === 'pending'
  if (pendingOrders.length === 1) {
    const candidateOrder = pendingOrders[0];
    const isStatusPending = String(candidateOrder.status || '').toLowerCase() === 'pending';
    const isPaymentPending = String(candidateOrder.payment_status || '').toLowerCase() === 'pending';
    const isRecent = isOrderWithinReuseWindow(candidateOrder.created_at, nowMs, reuseWindowMs);

    if (isStatusPending && isPaymentPending && isRecent) {
      const candidateItems = (await fetchOrderItems(candidateOrder.id)) || [];
      if (matchesOrder(candidateOrder, candidateItems)) {
        if (candidateOrder.preference_id && candidateOrder.init_point) {
          return {
            outcome: 'reuse_existing_preference',
            order: candidateOrder,
            candidateItems,
          };
        }
        return {
          outcome: 'recover_missing_preference',
          order: candidateOrder,
          candidateItems,
        };
      }
    }
  }

  // Si no es reutilizable (antigua, payment_status != 'pending' como 'rejected', múltiples órdenes o carrito modificado):
  // Verificar cada orden contra Mercado Pago antes de autorizar cualquier reemplazo/cancelación.
  const ordersToCancel: string[] = [];

  for (const pendingOrder of pendingOrders) {
    const localPayStatus = String(pendingOrder.payment_status || '').toLowerCase();

    // Si localmente ya figura con pago aprobado, bloquear sin cancelar
    if (localPayStatus === 'approved') {
      return {
        outcome: 'block',
        httpStatus: 409,
        code: 'PAYMENT_ALREADY_APPROVED',
        error: 'Ya tienes un pago aprobado para tu orden anterior. No es necesario crear una nueva orden.',
        orderId: pendingOrder.id,
      };
    }

    // Contrastar SIEMPRE con Mercado Pago (incluso si localPayStatus === 'rejected' o es antigua)
    const paymentCheck = await checkPaymentStatus(pendingOrder.id);

    if (
      !paymentCheck ||
      paymentCheck.status === 'error' ||
      (paymentCheck.status !== 'clean' && paymentCheck.status !== 'has_active_payment')
    ) {
      return {
        outcome: 'block',
        httpStatus: 502,
        code: 'FAILED_TO_VERIFY_PRIOR_PAYMENTS',
        error:
          'No se pudo verificar el estado de los pagos de tu orden previa en Mercado Pago. Por seguridad, por favor espera un momento y vuelve a intentarlo.',
        orderId: pendingOrder.id,
      };
    }

    if (paymentCheck.status === 'has_active_payment') {
      if (paymentCheck.activeState === 'approved') {
        return {
          outcome: 'block',
          httpStatus: 409,
          code: 'PAYMENT_ALREADY_APPROVED',
          error: 'Ya tienes un pago aprobado para tu orden anterior. No es necesario crear una nueva orden.',
          orderId: pendingOrder.id,
        };
      }
      return {
        outcome: 'block',
        httpStatus: 409,
        code: 'PAYMENT_IN_PROCESS',
        error:
          'Tienes un pago en procesamiento para tu orden anterior. Por favor espera a que se confirme antes de realizar otro pedido.',
        orderId: pendingOrder.id,
      };
    }

    // Si tiene preferencia creada previamente, invalidarla en Mercado Pago antes de permitir reemplazo
    if (pendingOrder.preference_id) {
      const invalidation = await invalidatePreference(pendingOrder.preference_id);
      if (!invalidation || !invalidation.success) {
        return {
          outcome: 'block',
          httpStatus: 502,
          code: 'PREFERENCE_INVALIDATION_FAILED',
          error:
            'No se pudo desactivar la pasarela de pago de tu orden previa. Por seguridad, por favor intenta nuevamente en unos instantes.',
          orderId: pendingOrder.id,
        };
      }
    }

    ordersToCancel.push(pendingOrder.id);
  }

  return {
    outcome: 'proceed_new_order',
    ordersToCancel,
  };
}
