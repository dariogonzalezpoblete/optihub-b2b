// frontend/app/api/mercadopago/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';

import { createClient } from '@supabase/supabase-js';
import { MercadoPagoConfig, Payment, WebhookSignatureValidator } from 'mercadopago';

// Supabase client: must use service role key exclusively
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error('[Webhook] Service role key not defined');
  // We will throw at request time if the client cannot be instantiated
}
const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

export async function POST(req: NextRequest) {
  try {
    const mpAccessToken = process.env.MP_ACCESS_TOKEN;
    const mpWebhookSecret = process.env.MP_WEBHOOK_SECRET;

    if (!mpAccessToken || !mpWebhookSecret) {
      console.error('[Webhook] Missing MP secrets');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    // 1️⃣ Extract required headers
    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');
    const dataId = req.nextUrl.searchParams.get('data.id');
    const type = req.nextUrl.searchParams.get('type') || req.nextUrl.searchParams.get('topic');

    if (!xSignature || !xRequestId || !dataId) {
      console.warn('[Webhook] Missing validation headers');
      return NextResponse.json({ error: 'Bad Request: Missing validation parameters' }, { status: 400 });
    }

    if (type !== 'payment') {
      return NextResponse.json({ message: 'ACK. Event ignored' }, { status: 200 });
    }

    // 2️⃣ Signature validation using official SDK
    try {
      WebhookSignatureValidator.validate({
        xSignature: xSignature!,
        xRequestId: xRequestId!,
        dataId: dataId!,
        secret: mpWebhookSecret!
      });
    } catch (e) {
      console.error('[Webhook] Invalid signature', e);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 3️⃣ Server‑to‑server fetch of the payment
    const client = new MercadoPagoConfig({ accessToken: mpAccessToken });
    const paymentClient = new Payment(client);
    let paymentData;
    try {
      paymentData = await paymentClient.get({ id: dataId });
    } catch (mpError: any) {
      console.error(`[Webhook] Error retrieving payment ${dataId}:`, mpError);
      return NextResponse.json({ error: 'Error communicating with Mercado Pago' }, { status: 502 });
    }

    // 4️⃣ Verify payment status – only process approved payments
    if (paymentData.status !== 'approved') {
      console.info(`[Webhook] Ignored payment ${paymentData.id} with status ${paymentData.status}`);
      return NextResponse.json({ message: `ACK. Payment status ${paymentData.status} ignored` }, { status: 200 });
    }

    // 5️⃣ Extract and validate business data from the payment
    const externalReference = paymentData.external_reference;
    const transactionAmount = paymentData.transaction_amount;
    const currencyId = paymentData.currency_id;

    // Validate external_reference as UUID
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!externalReference) {
      console.warn(`[Webhook] Payment ${paymentData.id} missing external_reference`);
      return NextResponse.json({ message: 'ACK. No external_reference' }, { status: 200 });
    }
    if (!uuidRegex.test(externalReference)) {
      console.warn(`[Webhook] Invalid external_reference UUID: ${externalReference}`);
      return NextResponse.json({ message: 'ACK. Invalid external_reference' }, { status: 200 });
    }

    // Ensure we have a supabase admin client
    if (!supabaseAdmin) {
      console.error('[Webhook] Supabase admin client not initialized');
      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount')
      .eq('id', externalReference)
      .single();

    if (orderError || !order) {
      console.warn(`[Webhook] Order not found for external_reference ${externalReference}`);
      return NextResponse.json({ message: 'ACK. Order not found' }, { status: 200 });
    }

    // 6️⃣ Validate amount and currency
    if (Math.round(Number(transactionAmount)) !== Math.round(Number(order.total_amount))) {
      console.error(`[Webhook] Amount mismatch for order ${order.id}: payment ${transactionAmount} vs order ${order.total_amount}`);
      return NextResponse.json({ error: 'Amount mismatch' }, { status: 400 });
    }
    if (currencyId !== 'CLP') {
      console.error(`[Webhook] Currency mismatch for payment ${paymentData.id}: ${currencyId}`);
      return NextResponse.json({ error: 'Currency mismatch' }, { status: 400 });
    }

    // 7️⃣ Call the RPC to process the approved payment
    let rpcResult: any = null;
    try {
      const { data, error } = await supabaseAdmin.rpc('process_approved_mp_payment', {
        p_order_id: externalReference,
        p_payment_id: String(paymentData.id)
      });
      rpcResult = data;
      if (error) throw error;
    } catch (rpcError: any) {
      console.error('[Webhook] RPC error processing payment', rpcError.message || rpcError);
      // Propagate as 5xx so Mercado Pago can retry
      return NextResponse.json({ error: 'Internal Server Error processing payment' }, { status: 502 });
    }

    // 8️⃣ Interpret RPC response
    if (rpcResult?.code === 'cancelled_order_paid_requires_attention') {
      console.warn(
        `[Webhook] [ALERTA OPERACIONAL CRÍTICA] Pago ${paymentData.id} aprobado recibido para la orden cancelada/reemplazada ${order.id}. Stock NO descontado. Orden guardada en 'requires_attention' para conciliación o reembolso.`,
        { orderId: order.id, paymentId: paymentData.id, result: rpcResult }
      );
      return NextResponse.json({
        message: 'ACK. Payment recorded for cancelled order; stock skipped, requires manual attention/refund',
        result: rpcResult
      }, { status: 200 });
    }

    if (rpcResult?.code === 'stock_failed_requires_attention') {
      console.warn(
        `[Webhook] [ALERTA OPERACIONAL] Pago ${paymentData.id} aprobado para la orden ${order.id}, pero falló el descuento de inventario. Orden guardada en 'requires_attention'.`,
        { orderId: order.id, paymentId: paymentData.id, error: rpcResult.error }
      );
      return NextResponse.json({
        message: 'ACK. Payment recorded but stock reduction failed (requires manual attention)',
        result: rpcResult
      }, { status: 200 });
    }

    if (rpcResult?.code === 'incident_pending') {
      console.info(
        `[Webhook] Reintento de notificación para orden ${order.id} con incidencia de stock/conciliación pendiente de resolución.`,
        rpcResult
      );
      return NextResponse.json({
        message: 'ACK. Order has a pending incident under review',
        result: rpcResult
      }, { status: 200 });
    }

    const successCodes = ['processed', 'idempotent', 'payment_duplicate', 'payment_conflict', 'order_not_found', 'cancelled_order_paid_requires_attention'];
    if (rpcResult?.success || successCodes.includes(rpcResult?.code)) {
      // These are considered successful outcomes for the webhook perspective
      console.info(`[Webhook] RPC processed payment ${paymentData.id} for order ${order.id}`, rpcResult);
      return NextResponse.json({ message: 'ACK. Payment processed', result: rpcResult }, { status: 200 });
    } else {
      // Unexpected failure – treat as server error
      console.error('[Webhook] Unexpected RPC failure', rpcResult);
      return NextResponse.json({ error: 'Internal Server Error processing payment' }, { status: 502 });
    }
  } catch (error: any) {
    console.error('[Webhook] Unexpected internal error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
