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
        already_processed?: boolean;
        code: string;
        message?: string;
        stock_status?: 'skipped' | 'failed' | 'decremented';
        error?: string | null;
      };
    }
  | {
      action: 'reject';
      httpStatus: 400;
      reason: 'amount_mismatch' | 'currency_mismatch' | 'invalid_payment_id';
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
        stock_error: string | null;
        notes: string;
      };
      rpcEquivalentResult: {
        success: true;
        already_processed: boolean;
        code: 'cancelled_order_paid_requires_attention' | 'incident_pending';
        message: string;
        stock_status: 'skipped' | 'failed';
        error?: string | null;
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
 * - Protección de órdenes en estados post-pago o terminales ('refunded', 'paid', 'preparing', 'shipped', 'delivered')
 *   para no descontar inventario por segunda vez ni revertir estados resueltos manualmente a 'preparing'.
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
  const rawPaymentId = payment?.id;
  const paymentIdStr =
    rawPaymentId === null || rawPaymentId === undefined ? '' : String(rawPaymentId).trim();
  const paymentStatus = String(payment?.status || '').toLowerCase();
  const expectedCurrency = order.currency || 'CLP';

  if (!paymentIdStr) {
    return {
      action: 'reject',
      httpStatus: 400,
      reason: 'invalid_payment_id',
      error: 'Invalid or empty payment ID',
    };
  }

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
    const existingPaymentId =
      order.payment_id === null || order.payment_id === undefined
        ? null
        : String(order.payment_id).trim();

    // 2.1 Orden ya procesada con stock descontado
    if (order.stock_decremented === true) {
      if (existingPaymentId === paymentIdStr) {
        return {
          action: 'ignore_ack',
          httpStatus: 200,
          reason: 'idempotent',
          message: `ACK. Order ${order.id} already processed for payment ${paymentIdStr}`,
          rpcEquivalentResult: {
            success: true,
            already_processed: true,
            code: 'idempotent',
          },
        };
      }
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

    // 2.2 Conflicto de payment_id: nunca sobrescribir un payment_id existente con otro distinto
    // (aplica tanto a órdenes canceladas como a órdenes en requires_attention o ya procesadas)
    if (existingPaymentId && existingPaymentId !== paymentIdStr) {
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

    // 2.3 Idempotencia sobre orden en requires_attention
    if (order.status === 'requires_attention') {
      if (order.payment_status === 'refunded') {
        return {
          action: 'ignore_ack',
          httpStatus: 200,
          reason: 'already_refunded',
          message: `ACK. Order ${order.id} payment was already refunded`,
          rpcEquivalentResult: {
            success: true,
            already_processed: true,
            code: 'idempotent',
            message: 'Order payment was already refunded',
          },
        };
      }

      if (order.payment_status === 'approved' && existingPaymentId === paymentIdStr) {
        const stockStatus: 'failed' | 'skipped' =
          order.stock_error !== null &&
          order.stock_error !== undefined &&
          String(order.stock_error).trim() !== ''
            ? 'failed'
            : 'skipped';
        return {
          action: 'record_cancelled_order_paid_incident',
          alreadyProcessed: true,
          rpcEquivalentResult: {
            success: true,
            already_processed: true,
            code: 'incident_pending',
            message:
              'Orden previamente registrada con pago aprobado e incidencia pendiente de conciliación manual.',
            stock_status: stockStatus,
            error: order.stock_error ?? null,
          },
        };
      }
    }

    // 2.4 Defensa en profundidad si la orden está cancelada (protege aunque la migración 011 aún esté pendiente en BD)
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
          stock_error: null,
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

    // 2.5 Salvaguarda: Estados posteriores al pago o terminales ('refunded', 'paid', 'preparing', 'shipped', 'delivered')
    //     Evita que un webhook repetido (ej. tras reembolso o tras conciliación/despacho manual con stock_decremented = false)
    //     invoque la RPC y descuente inventario por segunda vez o revierta el estado a 'preparing'.
    if (
      order.payment_status === 'refunded' ||
      ['refunded', 'paid', 'preparing', 'shipped', 'delivered'].includes(order.status)
    ) {
      if (existingPaymentId && existingPaymentId === paymentIdStr) {
        return {
          action: 'ignore_ack',
          httpStatus: 200,
          reason: 'already_processed_or_terminal',
          message: `ACK. Order ${order.id} already in post-payment or terminal state (${order.status})`,
          rpcEquivalentResult: {
            success: true,
            already_processed: true,
            code: 'idempotent',
            message: `Order already in post-payment or terminal state: ${order.status}`,
          },
        };
      }
      return {
        action: 'ignore_ack',
        httpStatus: 200,
        reason: 'payment_conflict',
        message: `ACK. Cannot process payment on order ${order.id} in state ${order.status} without matching payment_id`,
        rpcEquivalentResult: {
          success: false,
          code: 'payment_conflict',
          message: `Cannot process payment on order in state ${order.status} without matching payment_id`,
        },
      };
    }

    // 2.6 Flujo normal de orden activa ('pending' o 'payment_pending') -> delegar en RPC transaccional process_approved_mp_payment
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

export interface CancelledOrderIncidentUpdateResolution {
  httpStatus: 200 | 502;
  emitCriticalAlert: boolean;
  responseBody: Record<string, unknown>;
}

/**
 * Resuelve el resultado de la actualización defensiva (`.update(...).eq('status', 'cancelled').or(...)`)
 * cuando el webhook recibe un pago aprobado sobre una orden que inicialmente se leyó como `cancelled`.
 * Evita falsos positivos si 0 filas fueron modificadas por una carrera concurrente (ej. otro webhook con
 * un `payment_id` distinto o la misma notificación en paralelo) o si ocurre `23505` en `idx_uniq_orders_payment_id`.
 */
export function resolveCancelledOrderIncidentUpdateOutcome({
  orderId,
  paymentId,
  updatedOrder,
  updateError,
  rereadOrder,
  rereadError,
  rpcEquivalentResult,
}: {
  orderId: string;
  paymentId: string | number;
  updatedOrder?: {
    id: string;
    status: string;
    payment_status: string;
    payment_id?: string | null;
    stock_decremented?: boolean | null;
    stock_error?: string | null;
  } | null;
  updateError?: { code?: string; message?: string } | null;
  rereadOrder?: {
    id: string;
    status: string;
    payment_status: string;
    payment_id?: string | null;
    stock_decremented?: boolean | null;
    stock_error?: string | null;
  } | null;
  rereadError?: { code?: string; message?: string } | null;
  rpcEquivalentResult: Record<string, unknown>;
}): CancelledOrderIncidentUpdateResolution {
  const cleanPaymentId = String(paymentId ?? '').trim();

  // 1. Error en el UPDATE
  if (updateError) {
    // 23505 en idx_uniq_orders_payment_id: el mismo payment_id ya fue registrado en otra orden
    if (updateError.code === '23505') {
      return {
        httpStatus: 200,
        emitCriticalAlert: false,
        responseBody: {
          message: 'ACK. Payment already registered on another order',
          reason: 'payment_duplicate',
          result: {
            success: true,
            already_processed: true,
            code: 'payment_duplicate',
            message: 'Payment already registered on another order',
          },
        },
      };
    }

    return {
      httpStatus: 502,
      emitCriticalAlert: false,
      responseBody: {
        error: 'Internal Server Error processing incident',
      },
    };
  }

  // 2. El UPDATE afectó exactamente la fila esperada
  if (updatedOrder && updatedOrder.id === orderId) {
    return {
      httpStatus: 200,
      emitCriticalAlert: true,
      responseBody: {
        message: 'ACK. Payment recorded for cancelled order; stock skipped, requires manual attention/refund',
        result: rpcEquivalentResult,
      },
    };
  }

  // 3. El UPDATE afectó 0 filas (!updatedOrder): inspeccionar la relectura de la orden
  if (rereadError || !rereadOrder) {
    return {
      httpStatus: 502,
      emitCriticalAlert: false,
      responseBody: {
        error: 'Internal Server Error verifying concurrent order state',
      },
    };
  }

  const rereadPaymentId =
    rereadOrder.payment_id !== null && rereadOrder.payment_id !== undefined
      ? String(rereadOrder.payment_id).trim()
      : '';

  // 3.1 La orden fue reclamada concurrentemente por un payment_id diferente -> payment_conflict
  if (rereadPaymentId !== '' && rereadPaymentId !== cleanPaymentId) {
    return {
      httpStatus: 200,
      emitCriticalAlert: false,
      responseBody: {
        message: `ACK. Order ${rereadOrder.id} is already linked to a different payment_id`,
        reason: 'payment_conflict',
        result: {
          success: false,
          code: 'payment_conflict',
          message: 'Order is already linked to a different payment_id',
        },
      },
    };
  }

  // 3.2 Otro proceso concurrente ya registró este mismo payment_id en requires_attention -> incident_pending
  if (
    rereadOrder.status === 'requires_attention' &&
    rereadOrder.payment_status === 'approved' &&
    rereadPaymentId === cleanPaymentId
  ) {
    const stockStatus: 'failed' | 'skipped' =
      rereadOrder.stock_error !== null &&
      rereadOrder.stock_error !== undefined &&
      String(rereadOrder.stock_error).trim() !== ''
        ? 'failed'
        : 'skipped';

    return {
      httpStatus: 200,
      emitCriticalAlert: false,
      responseBody: {
        message: 'ACK. Order has a pending incident under review',
        result: {
          success: true,
          already_processed: true,
          code: 'incident_pending',
          message:
            'Orden previamente registrada con pago aprobado e incidencia pendiente de conciliación manual.',
          stock_status: stockStatus,
          error: rereadOrder.stock_error ?? null,
        },
      },
    };
  }

  // 3.3 La orden ya avanzó a un estado procesado o terminal con el mismo payment_id -> idempotent
  if (
    rereadPaymentId === cleanPaymentId &&
    (rereadOrder.stock_decremented === true ||
      rereadOrder.payment_status === 'refunded' ||
      ['refunded', 'paid', 'preparing', 'shipped', 'delivered'].includes(rereadOrder.status))
  ) {
    return {
      httpStatus: 200,
      emitCriticalAlert: false,
      responseBody: {
        message: `ACK. Order ${rereadOrder.id} already processed for this payment`,
        reason: 'already_processed_or_terminal',
        result: {
          success: true,
          already_processed: true,
          code: 'idempotent',
          message: 'Order already processed for this payment',
        },
      },
    };
  }

  // 3.4 Estado inesperado donde el pago aún no quedó registrado: devolver 502 para reintento seguro
  return {
    httpStatus: 502,
    emitCriticalAlert: false,
    responseBody: {
      error: 'Concurrent state change prevented recording payment incident; retry required',
    },
  };
}

/**
 * Modelo determinista paso a paso de `public.process_approved_mp_payment(p_order_id, p_payment_id)`
 * definido en `supabase_migration_011_cancelled_order_webhook_guard.sql`.
 * Nota: Se utiliza en suites de pruebas locales para verificar todas las ramas de la máquina de estados
 * de la migración 011 sin conectarse ni ejecutar SQL contra Supabase remoto.
 */
export function simulateApprovedPaymentRpc011({
  p_order_id,
  p_payment_id,
  ordersById,
  decrementStockForOrder,
}: {
  p_order_id?: string | null;
  p_payment_id?: string | null;
  ordersById: Map<
    string,
    {
      id: string;
      status: string;
      payment_status: string;
      payment_id: string | null;
      stock_decremented: boolean;
      stock_error: string | null;
      notes?: string | null;
    }
  >;
  decrementStockForOrder: (orderId: string) => void;
}): Record<string, unknown> {
  // 0. Validación defensiva de parámetros de entrada
  const cleanPayment = p_payment_id !== null && p_payment_id !== undefined ? String(p_payment_id).trim() : '';
  if (!p_order_id || !isValidUuid(p_order_id) || cleanPayment === '') {
    return {
      success: false,
      code: 'invalid_parameters',
      message: 'p_order_id and a non-empty p_payment_id are required',
    };
  }

  // 1. Verificar si este payment_id ya fue registrado en OTRA orden distinta
  for (const [, existing] of ordersById.entries()) {
    if (existing.payment_id === cleanPayment && existing.id !== p_order_id) {
      return {
        success: true,
        already_processed: true,
        code: 'payment_duplicate',
        existing_order_id: existing.id,
        message: 'Payment already registered on another order',
      };
    }
  }

  // 2. Bloquear exclusivamente la fila de la orden objetivo
  const v_order = ordersById.get(p_order_id);
  if (!v_order) {
    return {
      success: false,
      code: 'order_not_found',
      message: `Order ${p_order_id} not found`,
    };
  }

  // 2.1 Idempotencia estricta: el inventario YA fue descontado previamente
  if (v_order.stock_decremented === true) {
    if (v_order.payment_id !== null && v_order.payment_id !== cleanPayment) {
      return {
        success: false,
        code: 'payment_conflict',
        message: 'Order already processed with a different payment_id',
      };
    }
    return {
      success: true,
      already_processed: true,
      code: 'idempotent',
      message: 'Order already processed and stock decremented',
    };
  }

  // 2.2 Protección contra colisión de payment_id en la misma orden
  if (v_order.payment_id !== null && v_order.payment_id !== cleanPayment) {
    return {
      success: false,
      code: 'payment_conflict',
      message: 'Order is already linked to a different payment_id',
    };
  }

  // 2.3 Si la orden ya se encuentra en 'requires_attention'
  if (v_order.status === 'requires_attention') {
    if (v_order.payment_status === 'refunded') {
      return {
        success: true,
        already_processed: true,
        code: 'idempotent',
        message: 'Order payment was already refunded',
      };
    }

    if (v_order.payment_status === 'approved' && v_order.payment_id === cleanPayment) {
      return {
        success: true,
        already_processed: true,
        code: 'incident_pending',
        message: 'Orden previamente registrada con pago aprobado e incidencia pendiente de conciliación manual.',
        stock_status: v_order.stock_error !== null ? 'failed' : 'skipped',
        error: v_order.stock_error,
      };
    }

    const note = `[INCIDENCIA]: Pago aprobado ${cleanPayment} recibido mientras la orden ya estaba en requires_attention. Stock NO descontado.`;
    v_order.payment_id = cleanPayment;
    v_order.payment_status = 'approved';
    v_order.stock_decremented = false;
    v_order.notes = v_order.notes ? `${v_order.notes}\n${note}` : note;

    return {
      success: true,
      already_processed: false,
      code: 'incident_pending',
      message: 'Pago registrado sobre orden en requires_attention. Stock no descontado.',
      stock_status: v_order.stock_error !== null ? 'failed' : 'skipped',
      error: v_order.stock_error,
    };
  }

  // 2.4 Salvaguarda crítica (Etapa 2D): Orden cancelada recibe un pago aprobado tardío
  if (v_order.status === 'cancelled') {
    const note = `[INCIDENCIA]: Pago aprobado ${cleanPayment} recibido sobre orden cancelada/reemplazada. Stock NO descontado. Requiere conciliación manual o reembolso.`;
    v_order.payment_id = cleanPayment;
    v_order.payment_status = 'approved';
    v_order.status = 'requires_attention';
    v_order.stock_decremented = false;
    v_order.stock_error = null;
    v_order.notes = v_order.notes ? `${v_order.notes}\n${note}` : note;

    return {
      success: true,
      already_processed: false,
      code: 'cancelled_order_paid_requires_attention',
      message:
        'Pago registrado sobre orden cancelada. Stock no descontado. Requiere conciliación manual o reembolso.',
      stock_status: 'skipped',
    };
  }

  // 2.5 Salvaguarda para estados posteriores al pago o terminales
  if (
    v_order.payment_status === 'refunded' ||
    ['refunded', 'paid', 'preparing', 'shipped', 'delivered'].includes(v_order.status)
  ) {
    if (v_order.payment_id === cleanPayment) {
      return {
        success: true,
        already_processed: true,
        code: 'idempotent',
        message: `Order already in post-payment or terminal state: ${v_order.status}`,
      };
    }
    return {
      success: false,
      code: 'payment_conflict',
      message: `Cannot process payment on order in state ${v_order.status} without matching payment_id`,
    };
  }

  // 3. Registrar el pago aprobado en la orden antes de intentar el descuento
  v_order.payment_id = cleanPayment;
  v_order.payment_status = 'approved';

  // 4. Intentar descontar el inventario de forma atómica
  try {
    decrementStockForOrder(p_order_id);
  } catch (err: unknown) {
    // 5. Si el descuento falla: registrar la orden en 'requires_attention' con stock_error NOT NULL
    const rawMsg = err instanceof Error ? err.message : String(err ?? '');
    const v_stock_error = rawMsg.trim() !== '' ? rawMsg.trim() : 'Error al descontar inventario';
    const note = `[INCIDENCIA STOCK]: Pago ${cleanPayment} aprobado, fallo al descontar stock (${v_stock_error}).`;
    v_order.status = 'requires_attention';
    v_order.stock_decremented = false;
    v_order.stock_error = v_stock_error;
    v_order.notes = v_order.notes ? `${v_order.notes}\n${note}` : note;

    return {
      success: true,
      already_processed: false,
      code: 'stock_failed_requires_attention',
      message: 'Payment recorded, but stock decrement failed. Order flagged as requires_attention.',
      stock_status: 'failed',
      error: v_stock_error,
    };
  }

  // 6. Descuento de stock exitoso: orden lista para preparación
  v_order.status = 'preparing';
  v_order.stock_decremented = true;
  v_order.stock_error = null;

  return {
    success: true,
    already_processed: false,
    code: 'processed',
    message: 'Payment approved and stock decremented successfully',
    stock_status: 'decremented',
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

export interface PriorPreferenceToInvalidate {
  orderId: string;
  preferenceId: string;
}

export interface PriorOrderReplacementSnapshot {
  orderId: string;
  expectedPreferenceId: string | null;
}

/**
 * Caché local no autoritativa de preferencias invalidadas en esta instancia.
 * IMPORTANTE: Solo actúa como señal adicional; NUNCA sustituye ni permite omitir
 * la verificación remota en Mercado Pago (`checkCandidatePreferenceValidity`).
 */
const INVALIDATED_PREFERENCE_IDS = new Set<string>();
const MAX_INVALIDATED_PREFERENCES_CACHE = 2000;

export function markPreferenceAsInvalidated(preferenceId: string | null | undefined): void {
  const clean = typeof preferenceId === 'string' ? preferenceId.trim() : '';
  if (!clean) return;
  if (INVALIDATED_PREFERENCE_IDS.size >= MAX_INVALIDATED_PREFERENCES_CACHE) {
    const oldest = INVALIDATED_PREFERENCE_IDS.values().next().value;
    if (oldest) {
      INVALIDATED_PREFERENCE_IDS.delete(oldest);
    }
  }
  INVALIDATED_PREFERENCE_IDS.add(clean);
}

export function isPreferenceMarkedInvalidated(preferenceId: string | null | undefined): boolean {
  const clean = typeof preferenceId === 'string' ? preferenceId.trim() : '';
  return clean !== '' && INVALIDATED_PREFERENCE_IDS.has(clean);
}

export function clearInvalidatedPreferencesCache(): void {
  INVALIDATED_PREFERENCE_IDS.clear();
}

export type CheckoutRecoveryEligibility = {
  shouldRecover: boolean;
  category:
    | 'confirmed_rollback'
    | 'lease_or_concurrency_conflict'
    | 'ambiguous_outcome';
  reason: string;
};

/**
 * Clasifica si un fallo de `process_b2b_checkout` corresponde a:
 * - `'confirmed_rollback'`: Excepción determinista de PostgreSQL/negocio donde la transacción hizo ROLLBACK
 *   con certeza y la orden previa sigue en `status = 'pending'`.
 * - `'lease_or_concurrency_conflict'`: Pérdida/expiración de lease o cambio concurrente de estado; la petición
 *   actual NO está autorizada a ejecutar recuperación compensatoria.
 * - `'ambiguous_outcome'`: Corte de red, timeout o respuesta truncada donde no puede descartarse que PostgreSQL
 *   haya confirmado (o siga ejecutando) la cancelación de la orden previa; no se debe emitir una nueva preferencia
 *   para evitar asociar una preferencia activa a una orden cancelada.
 */
export function classifyCheckoutRpcFailureForRecovery({
  checkoutError,
  checkoutResult,
}: {
  checkoutError?: { code?: unknown; message?: unknown; details?: unknown; hint?: unknown } | null;
  checkoutResult?: unknown;
}): CheckoutRecoveryEligibility {
  if (checkoutError) {
    const code = String(checkoutError.code || '').trim();
    const message = String(checkoutError.message || '');
    const details = String(checkoutError.details || '');
    const combined = `${message} ${details}`;

    if (
      combined.includes('CONCURRENT_ORDER_STATE_CHANGED') ||
      combined.includes('CONCURRENT_PENDING_ORDER_EXISTS') ||
      combined.includes('idx_uniq_user_pending_order') ||
      combined.includes('LEASE_LOST_TO_CONCURRENT_REQUEST') ||
      combined.includes('LEASE_EXPIRED') ||
      combined.includes('LEASE_NOT_FOUND') ||
      combined.includes('LEASE_REQUIRED')
    ) {
      return {
        shouldRecover: false,
        category: 'lease_or_concurrency_conflict',
        reason: code || 'concurrent_or_lease_conflict',
      };
    }

    const ambiguousCodes = new Set([
      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '57P01',
      '57P02',
      '57P03',
      '57014',
      'PGRST000',
      'PGRST001',
      'PGRST002',
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'UND_ERR_SOCKET',
      'ABORT_ERR',
    ]);

    const isAmbiguousMessage =
      /fetch failed|network|timeout|timed out|socket hang up|connection reset|connection terminated|broken pipe|bad gateway|service unavailable|gateway timeout|econnreset|etimedout/i.test(
        combined
      );

    if (ambiguousCodes.has(code) || isAmbiguousMessage) {
      return {
        shouldRecover: false,
        category: 'ambiguous_outcome',
        reason: code || 'network_or_timeout_ambiguous_commit',
      };
    }

    const isKnownBusinessRollback =
      message.includes('Stock insuficiente') ||
      message.includes('inventario configurado') ||
      message.includes('Cantidad inválida') ||
      message.includes('Compra mínima mayorista') ||
      message.includes('MOQ') ||
      message.includes('no encontrado en catálogo') ||
      message.includes('El carrito no existe') ||
      message.includes('Estado inconsistente: Carrito inactivo');

    const deterministicRollbackCodes = new Set([
      'P0001',
      '23502',
      '23503',
      '23505',
      '23514',
      '22P02',
      '22003',
      '42703',
      '42883',
    ]);

    if (isKnownBusinessRollback || deterministicRollbackCodes.has(code)) {
      return {
        shouldRecover: true,
        category: 'confirmed_rollback',
        reason: code || 'deterministic_sql_rollback',
      };
    }

    return {
      shouldRecover: false,
      category: 'ambiguous_outcome',
      reason: code || 'unclassified_rpc_error',
    };
  }

  if (!checkoutResult || typeof checkoutResult !== 'object') {
    return {
      shouldRecover: false,
      category: 'ambiguous_outcome',
      reason: 'invalid_or_empty_rpc_response',
    };
  }

  const resObj = checkoutResult as { success?: unknown; code?: unknown; order_id?: unknown };
  if (resObj.success !== true) {
    const resCode = String(resObj.code || '').trim();
    if (
      [
        'LEASE_LOST_TO_CONCURRENT_REQUEST',
        'LEASE_EXPIRED',
        'LEASE_NOT_FOUND',
        'LEASE_REQUIRED',
        'CONCURRENT_ORDER_STATE_CHANGED',
        'CONCURRENT_PENDING_ORDER_EXISTS',
      ].includes(resCode)
    ) {
      return {
        shouldRecover: false,
        category: 'lease_or_concurrency_conflict',
        reason: resCode,
      };
    }

    return {
      shouldRecover: false,
      category: 'lease_or_concurrency_conflict',
      reason: resCode || 'rpc_rejected_without_mutation',
    };
  }

  if (!isValidUuid(resObj.order_id)) {
    return {
      shouldRecover: false,
      category: 'ambiguous_outcome',
      reason: 'missing_or_invalid_order_id_on_success',
    };
  }

  return {
    shouldRecover: false,
    category: 'ambiguous_outcome',
    reason: 'rpc_succeeded',
  };
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
      stalePreferenceId?: string | null;
    }
  | {
      outcome: 'proceed_new_order';
      ordersToCancel: string[];
      preferencesToInvalidate: PriorPreferenceToInvalidate[];
      priorOrdersSnapshot: PriorOrderReplacementSnapshot[];
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
 * Cumple los requisitos de la Etapa 2D.2 (Corrección 1) y MEDIO-02:
 * 1. Inspecciona todas las órdenes `status = 'pending'` sin filtrar por antigüedad ni `payment_status`.
 * 2. Solo reutiliza cuando existe exactamente 1 orden candidata, reciente (< 2h), con `payment_status === 'pending'`
 *    y coincidencia exacta 1:1 con el carrito e importes recalculados, verificando además que su `preference_id`
 *    no haya sido invalidado previamente ni esté expirado en Mercado Pago.
 * 3. Para órdenes antiguas, con `payment_status = 'rejected'`, múltiples o con carrito modificado,
 *    consulta SIEMPRE el estado real en Mercado Pago en TODAS las órdenes antes de invalidar cualquier preferencia.
 * 4. Permite diferir la invalidación (`deferPreferenceInvalidation = true`) hasta después de que `sync_cart`
 *    y `verifyUserCheckoutLease` hayan tenido éxito, devolviendo `priorOrdersSnapshot` con todas las órdenes a
 *    cancelar (incluyendo las que tenían `preference_id = null` en la lectura inicial) para detectar mutaciones
 *    concurrentes antes de cancelar.
 */
export async function evaluatePendingOrdersForCheckout<TItem = Record<string, unknown>>({
  pendingOrders,
  fetchOrderItems,
  matchesOrder,
  checkPaymentStatus,
  invalidatePreference,
  checkPreferenceValidity,
  nowMs = Date.now(),
  reuseWindowMs = 2 * 60 * 60 * 1000,
  deferPreferenceInvalidation = false,
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
  checkPreferenceValidity?: (
    preferenceId: string,
    expectedOrderId?: string
  ) => Promise<{
    valid: boolean;
    status?: 'active' | 'expired' | 'error';
    error?: string;
  }>;
  nowMs?: number;
  reuseWindowMs?: number;
  deferPreferenceInvalidation?: boolean;
}): Promise<PendingOrdersEvaluationResult<TItem>> {
  if (!pendingOrders || pendingOrders.length === 0) {
    return {
      outcome: 'proceed_new_order',
      ordersToCancel: [],
      preferencesToInvalidate: [],
      priorOrdersSnapshot: [],
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
          // El Set en memoria es únicamente una señal no autoritativa; SIEMPRE que se provea
          // checkPreferenceValidity se consulta Mercado Pago para verificar vigencia, init_point
          // y external_reference sin permitir que la caché en memoria omita la comprobación remota.
          let isStaleOrExpired = isPreferenceMarkedInvalidated(candidateOrder.preference_id);

          if (typeof checkPreferenceValidity === 'function') {
            const validity = await checkPreferenceValidity(
              candidateOrder.preference_id,
              candidateOrder.id
            );
            if (!validity || validity.status === 'error') {
              return {
                outcome: 'block',
                httpStatus: 502,
                code: 'FAILED_TO_VERIFY_PRIOR_PAYMENTS',
                error:
                  'No se pudo verificar la vigencia de la pasarela de pago de tu orden previa en Mercado Pago. Por seguridad, intenta nuevamente en unos instantes.',
                orderId: candidateOrder.id,
              };
            }
            if (!validity.valid || validity.status === 'expired') {
              markPreferenceAsInvalidated(candidateOrder.preference_id);
              isStaleOrExpired = true;
            }
          }

          if (!isStaleOrExpired) {
            return {
              outcome: 'reuse_existing_preference',
              order: candidateOrder,
              candidateItems,
            };
          }

          // Antes de regenerar preferencia para una orden con preference_id expirado/desincronizado,
          // verificar que no tenga un pago aprobado o en curso en Mercado Pago.
          const staleOrderPaymentCheck = await checkPaymentStatus(candidateOrder.id);
          if (
            !staleOrderPaymentCheck ||
            staleOrderPaymentCheck.status === 'error' ||
            (staleOrderPaymentCheck.status !== 'clean' &&
              staleOrderPaymentCheck.status !== 'has_active_payment')
          ) {
            return {
              outcome: 'block',
              httpStatus: 502,
              code: 'FAILED_TO_VERIFY_PRIOR_PAYMENTS',
              error:
                'No se pudo verificar el estado de los pagos de tu orden previa en Mercado Pago. Por seguridad, por favor espera un momento y vuelve a intentarlo.',
              orderId: candidateOrder.id,
            };
          }

          if (staleOrderPaymentCheck.status === 'has_active_payment') {
            if (staleOrderPaymentCheck.activeState === 'approved') {
              return {
                outcome: 'block',
                httpStatus: 409,
                code: 'PAYMENT_ALREADY_APPROVED',
                error:
                  'Ya tienes un pago aprobado para tu orden anterior. No es necesario crear una nueva orden.',
                orderId: candidateOrder.id,
              };
            }
            return {
              outcome: 'block',
              httpStatus: 409,
              code: 'PAYMENT_IN_PROCESS',
              error:
                'Tienes un pago en procesamiento para tu orden anterior. Por favor espera a que se confirme antes de realizar otro pedido.',
              orderId: candidateOrder.id,
            };
          }

          return {
            outcome: 'recover_missing_preference',
            order: candidateOrder,
            candidateItems,
            stalePreferenceId: candidateOrder.preference_id,
          };
        }
        return {
          outcome: 'recover_missing_preference',
          order: candidateOrder,
          candidateItems,
          stalePreferenceId: null,
        };
      }
    }
  }

  // Fase 1: Verificar el estado de pago de TODAS las órdenes pendientes en Mercado Pago
  // antes de invalidar cualquier preferencia. Si alguna bloquea, ninguna preferencia se invalida.
  const ordersToCancel: string[] = [];
  const preferencesToInvalidate: PriorPreferenceToInvalidate[] = [];
  const priorOrdersSnapshot: PriorOrderReplacementSnapshot[] = [];

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

    ordersToCancel.push(pendingOrder.id);
    priorOrdersSnapshot.push({
      orderId: pendingOrder.id,
      expectedPreferenceId: pendingOrder.preference_id ?? null,
    });
    if (pendingOrder.preference_id) {
      preferencesToInvalidate.push({
        orderId: pendingOrder.id,
        preferenceId: pendingOrder.preference_id,
      });
    }
  }

  // Fase 2: Invalidar preferencias solo cuando no se haya solicitado diferir hasta después de sync_cart y verifyLease
  if (!deferPreferenceInvalidation) {
    for (const item of preferencesToInvalidate) {
      const invalidation = await invalidatePreference(item.preferenceId);
      if (!invalidation || !invalidation.success) {
        return {
          outcome: 'block',
          httpStatus: 502,
          code: 'PREFERENCE_INVALIDATION_FAILED',
          error:
            'No se pudo desactivar la pasarela de pago de tu orden previa. Por seguridad, por favor intenta nuevamente en unos instantes.',
          orderId: item.orderId,
        };
      }
      markPreferenceAsInvalidated(item.preferenceId);
    }
  }

  return {
    outcome: 'proceed_new_order',
    ordersToCancel,
    preferencesToInvalidate,
    priorOrdersSnapshot,
  };
}
