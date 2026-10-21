// frontend/lib/payments/mercadopagoService.ts
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { executeQuery, withTransaction } from '../db/postgres';
import { PoolClient } from 'pg';

/**
 * Interface representing billing and customer details for payment preferences
 */
export interface BillingCustomerDetails {
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  businessName?: string;
  businessRut?: string;
  shippingAddress?: string;
  shippingRegion?: string;
  shippingCommune?: string;
}

/**
 * Item input for payment preference creation
 */
export interface PreferenceItemInput {
  productId: string;
  quantity: number;
  unitPriceNet?: number;
  productName?: string;
  brandName?: string;
}

/**
 * Options for generating a Mercado Pago preference
 */
export interface CreatePreferenceOptions {
  orderId: string;
  userId: string;
  items?: PreferenceItemInput[];
  billingDetails?: BillingCustomerDetails;
  shippingAmount?: number;
  customBackUrls?: {
    success?: string;
    failure?: string;
    pending?: string;
  };
  customClient?: PoolClient;
}

/**
 * Result of creating a payment preference
 */
export interface CreatePreferenceResult {
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
  orderId: string;
  totalAmount: number;
  currency: string;
}

/**
 * Initializes the official Mercado Pago Preference Client
 */
function getPreferenceClient(): Preference {
  const rawToken = process.env.MP_ACCESS_TOKEN || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const accessToken = rawToken.trim();
  if (!accessToken) {
    throw new Error('CONFIG_ERROR: MP_ACCESS_TOKEN no está configurado o está vacío en las variables de entorno.');
  }

  const mpConfig = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 10000 },
  });

  return new Preference(mpConfig);
}

/**
 * Resolves the absolute application site URL.
 * Mercado Pago requires a public HTTPS URL for auto_return and webhooks.
 */
function getSiteUrl(): string {
  let siteUrl = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || '';
  if (!siteUrl || siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1')) {
    siteUrl = 'https://optihub-b2b.vercel.app';
  }
  return siteUrl.replace(/\/+$/, '');
}

/**
 * Creates a Mercado Pago Payment Preference associated with an order,
 * with strict database-level price, product, and total verification.
 */
export async function createOrderPaymentPreference(
  options: CreatePreferenceOptions
): Promise<CreatePreferenceResult> {
  const { orderId, userId, items: providedItems, billingDetails, shippingAmount = 0, customBackUrls, customClient } = options;

  if (!orderId || typeof orderId !== 'string' || !orderId.trim()) {
    throw new Error('El parámetro orderId es requerido.');
  }

  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('El parámetro userId es requerido.');
  }

  const cleanOrderId = orderId.trim();
  const cleanUserId = userId.trim();

  const siteUrl = getSiteUrl();

  // Internal worker that can run inside or outside a caller transaction
  const executeVerificationAndCreation = async (client?: PoolClient): Promise<CreatePreferenceResult> => {
    // 1. Fetch order from database
    const orderQuery = `
      SELECT id, user_id, status, payment_status, subtotal_net, tax_amount, shipping_amount, total_amount, currency,
             customer_name, customer_email, customer_phone, business_name, business_rut, shipping_address
      FROM orders
      WHERE id = $1
    `;
    const orderResult = client
      ? await client.query(orderQuery, [cleanOrderId])
      : await executeQuery(orderQuery, [cleanOrderId]);

    if (orderResult.rows.length === 0) {
      throw new Error(`La orden de compra "${cleanOrderId}" no existe en la base de datos.`);
    }

    const order = orderResult.rows[0];

    if (order.user_id !== cleanUserId) {
      throw new Error('Acceso no autorizado: la orden pertenece a otro usuario.');
    }

    if (order.status !== 'pending' && order.status !== 'payment_pending') {
      throw new Error(
        `La orden "${cleanOrderId}" no es elegible para pago porque se encuentra en estado "${order.status}".`
      );
    }

    // 2. Fetch order items either from order_items table or provided input
    let itemsToProcess: Array<{ productId: string; quantity: number }> = [];

    const itemsQuery = `
      SELECT product_id, quantity, unit_price_net, product_name, brand_name, sku
      FROM order_items
      WHERE order_id = $1
    `;
    const itemsResult = client
      ? await client.query(itemsQuery, [cleanOrderId])
      : await executeQuery(itemsQuery, [cleanOrderId]);

    if (itemsResult.rows.length > 0) {
      itemsToProcess = itemsResult.rows.map((row) => ({
        productId: row.product_id,
        quantity: Number(row.quantity),
      }));
    } else if (providedItems && providedItems.length > 0) {
      itemsToProcess = providedItems.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      }));
    } else {
      throw new Error(`La orden "${orderId}" no contiene productos para procesar el pago.`);
    }

    // 3. Strict Validation against catalog truth (marcos table)
    const productIds = Array.from(new Set(itemsToProcess.map((i) => i.productId)));
    const marcosQuery = `
      SELECT id_ext, stock, marca, modelo, precio_neto_clp
      FROM marcos
      WHERE id_ext = ANY($1::text[])
    `;
    const marcosResult = client
      ? await client.query(marcosQuery, [productIds])
      : await executeQuery(marcosQuery, [productIds]);

    const catalogMap = new Map<string, { id_ext: string; stock: number; marca: string; modelo: string; precio_neto_clp: number }>();
    for (const row of marcosResult.rows) {
      catalogMap.set(row.id_ext, {
        id_ext: row.id_ext,
        stock: Number(row.stock || 0),
        marca: row.marca || '',
        modelo: row.modelo || '',
        precio_neto_clp: Math.round(Number(row.precio_neto_clp || 0)),
      });
    }

    // Verify all products exist in master catalog
    for (const pid of productIds) {
      if (!catalogMap.has(pid)) {
        throw new Error(`El producto "${pid}" no existe en el catálogo maestro.`);
      }
    }

    // Compute exact DB-derived financial amounts
    let calculatedSubtotalNet = 0;
    const mpItems: Array<{
      id: string;
      title: string;
      description?: string;
      quantity: number;
      unit_price: number;
      currency_id: string;
    }> = [];

    for (const item of itemsToProcess) {
      const marco = catalogMap.get(item.productId)!;
      const unitPriceNet = marco.precio_neto_clp;
      const lineSubtotal = unitPriceNet * item.quantity;
      calculatedSubtotalNet += lineSubtotal;

      // In Chilean B2B, Mercado Pago displays gross unit prices with 19% IVA included
      const grossUnitPrice = Math.round(unitPriceNet * 1.19);

      mpItems.push({
        id: marco.id_ext,
        title: `${marco.marca} ${marco.modelo}`.trim() || `Marco ${marco.id_ext}`,
        description: `Código SKU: ${marco.id_ext} - Óptica B2B`,
        quantity: item.quantity,
        unit_price: grossUnitPrice,
        currency_id: 'CLP',
      });
    }

    const calculatedTax = Math.round(calculatedSubtotalNet * 0.19);
    const resolvedShipping = Math.max(0, Math.round(shippingAmount || Number(order.shipping_amount || 0)));
    const calculatedTotal = calculatedSubtotalNet + calculatedTax + resolvedShipping;

    // Strict Anti-Tampering Check: Compare with order's total_amount in DB
    const orderDbTotal = Math.round(Number(order.total_amount));
    if (orderDbTotal > 0 && Math.abs(orderDbTotal - calculatedTotal) > 10) {
      throw new Error(
        `DISCREPANCIA_MONTOS: El monto esperado en base de datos ($${calculatedTotal} CLP) no coincide con el total de la orden ($${orderDbTotal} CLP). Se bloquea la creación de la preferencia por seguridad.`
      );
    }

    // Add shipping as a line item if applicable
    if (resolvedShipping > 0) {
      mpItems.push({
        id: 'SHIPPING_FEE',
        title: 'Costo de Envío B2B',
        quantity: 1,
        unit_price: resolvedShipping,
        currency_id: 'CLP',
      });
    }

    // Ensure total sum of mpItems matches calculatedTotal exactly (reconcile +/- 1 CLP rounding differences)
    const sumMpItems = mpItems.reduce((acc, curr) => acc + curr.unit_price * curr.quantity, 0);
    const diff = calculatedTotal - sumMpItems;
    if (diff !== 0 && mpItems.length > 0) {
      // Reconcile difference onto the first merchandise item
      mpItems[0].unit_price += diff;
    }

    // 4. Build Customer Payer details
    const customerEmail =
      billingDetails?.customerEmail || order.customer_email || 'contacto@optihub.cl';
    const customerName =
      billingDetails?.customerName || order.customer_name || 'Cliente B2B OptiHub';
    const customerPhone =
      billingDetails?.customerPhone || order.customer_phone || undefined;
    const businessRut =
      billingDetails?.businessRut || order.business_rut || undefined;
    const shippingAddress =
      billingDetails?.shippingAddress || order.shipping_address || undefined;

    // 5. Construct Preference Payload for Mercado Pago SDK
    const preferencePayload = {
      items: mpItems,
      payer: {
        email: customerEmail,
        name: customerName,
        phone: customerPhone ? { number: customerPhone } : undefined,
        identification: businessRut ? { type: 'RUT', number: businessRut } : undefined,
        address: shippingAddress ? { street_name: shippingAddress } : undefined,
      },
      back_urls: {
        success: customBackUrls?.success || `${siteUrl}/checkout/resultado?status=approved`,
        failure: customBackUrls?.failure || `${siteUrl}/checkout/resultado?status=rejected`,
        pending: customBackUrls?.pending || `${siteUrl}/checkout/resultado?status=pending`,
      },
      auto_return: 'approved' as const,
      external_reference: orderId,
      notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      statement_descriptor: 'OptiHub B2B',
      metadata: {
        order_id: orderId,
        user_id: userId,
        business_rut: businessRut || null,
      },
      expires: true,
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    };

    // 6. Call Mercado Pago API with retry capability
    const preferenceClient = getPreferenceClient();
    let preferenceResponse: { id?: string; init_point?: string; sandbox_init_point?: string };

    let attempts = 0;
    const maxAttempts = 2;
    while (attempts < maxAttempts) {
      attempts++;
      try {
        preferenceResponse = await preferenceClient.create({ body: preferencePayload });
        break;
      } catch (mpErr: any) {
        console.error(`[MercadoPago Service] Error detallado al crear preferencia (intento ${attempts}/${maxAttempts}):`, {
          name: mpErr?.name,
          message: mpErr?.message,
          status: mpErr?.status,
          error: mpErr?.error,
          causes: mpErr?.causes,
          cause: mpErr?.cause,
          apiResponse: mpErr?.api_response?.body,
        });

        if (attempts >= maxAttempts) {
          const detailMsg =
            mpErr?.message ||
            mpErr?.error ||
            (Array.isArray(mpErr?.causes) && mpErr.causes.length > 0
              ? JSON.stringify(mpErr.causes)
              : 'Error al comunicarse con la pasarela de pagos de Mercado Pago.');

          const enhancedError = new Error(`Mercado Pago: ${detailMsg}`);
          (enhancedError as any).status = mpErr?.status || 502;
          (enhancedError as any).originalError = mpErr;
          throw enhancedError;
        }
        await new Promise((res) => setTimeout(res, 300));
      }
    }

    const preferenceId = preferenceResponse!.id;
    const initPoint = preferenceResponse!.init_point;
    const sandboxInitPoint = preferenceResponse!.sandbox_init_point;

    if (!preferenceId || !initPoint) {
      throw new Error('La respuesta de Mercado Pago no incluyó un ID de preferencia o URL de pago válida.');
    }

    // 7. Persist preference to PostgreSQL orders table with defensive SQL error handling
    const updateOrderQuery = `
      UPDATE orders
      SET preference_id = $1,
          init_point = $2,
          updated_at = NOW()
      WHERE id = $3
      RETURNING id, preference_id, init_point
    `;

    try {
      const updateResult = client
        ? await client.query(updateOrderQuery, [preferenceId, initPoint, cleanOrderId])
        : await executeQuery(updateOrderQuery, [preferenceId, initPoint, cleanOrderId]);

      if (updateResult.rowCount === 0) {
        console.warn(`[MercadoPago Service] La orden "${cleanOrderId}" no fue actualizada al persistir preference (posiblemente ID inexistente o estado no elegible).`);
      }
    } catch (dbErr: any) {
      console.error('[MercadoPago Service] Error detallado SQL en orders al persistir preferencia:', {
        code: dbErr?.code,
        message: dbErr?.message,
        detail: dbErr?.detail,
        hint: dbErr?.hint,
        table: dbErr?.table,
        constraint: dbErr?.constraint,
        orderId: cleanOrderId,
        preferenceId,
      });
      const enrichedDbError = new Error(
        `Error al persistir la preferencia en la base de datos [${dbErr?.code || 'SQL_ERROR'}]: ${dbErr?.message || 'Fallo de consulta SQL'}`
      );
      (enrichedDbError as any).code = dbErr?.code;
      (enrichedDbError as any).originalError = dbErr;
      throw enrichedDbError;
    }

    return {
      preferenceId,
      initPoint,
      sandboxInitPoint,
      orderId: cleanOrderId,
      totalAmount: calculatedTotal,
      currency: 'CLP',
    };
  };

  if (customClient) {
    return executeVerificationAndCreation(customClient);
  }

  return executeVerificationAndCreation();
}
