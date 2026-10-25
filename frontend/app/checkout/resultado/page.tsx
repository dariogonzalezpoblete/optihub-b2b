'use client';

import React, { Suspense, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Truck,
  FileText,
  Loader2,
  ShieldCheck,
  Receipt,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { isValidUuid, resolveVerifiedCheckoutResult } from '@/lib/checkoutWebhookAndResult';
import { useCartStore } from '@/store/useCartStore';

interface VerifiedOrderRow {
  id: string;
  status: string;
  payment_status: string;
  payment_id?: string | null;
  total_amount?: number | string | null;
}

function ResultadoContent() {
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get('status') || searchParams.get('collection_status');
  const urlRef = searchParams.get('ref') || searchParams.get('external_reference');
  const urlPaymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
  const urlPreferenceId = searchParams.get('preference_id');
  const isMock = searchParams.get('mock') === 'true';

  const clearCart = useCartStore((state) => state.clearCart);
  const setCartId = useCartStore((state) => state.setCartId);
  const clearedOrderRef = useRef<string | null>(null);

  const [verifiedState, setVerifiedState] = useState<{
    checkedRef: string | null;
    order: VerifiedOrderRow | null;
    completed: boolean;
  }>({
    checkedRef: null,
    order: null,
    completed: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (!isValidUuid(urlRef)) {
      return () => {
        cancelled = true;
      };
    }

    const isTerminalOrResolvedOrder = (
      orderRow: VerifiedOrderRow,
      normalizedStatusParam: string
    ): boolean => {
      const dbPayStatus = String(orderRow.payment_status || '').toLowerCase();
      return (
        dbPayStatus === 'approved' ||
        dbPayStatus === 'rejected' ||
        dbPayStatus === 'refunded' ||
        orderRow.status === 'cancelled' ||
        orderRow.status === 'requires_attention' ||
        ['failure', 'rejected', 'null'].includes(normalizedStatusParam)
      );
    };

    const verifyOrderInDatabase = async () => {
      const maxAttempts = 4;
      const retryDelayMs = 1500;
      const normalizedUrlStatus = String(urlStatus || '').toLowerCase();
      let latestOrder: VerifiedOrderRow | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (cancelled) return;

        // 1. En el primer intento (o mientras siga pendiente), solicitar reconciliación
        //    server-to-server contra la API oficial de Mercado Pago + Supabase Admin.
        try {
          const verifyRes: Response = await window.fetch('/api/mercadopago/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: urlRef,
              paymentId: urlPaymentId,
              preferenceId: urlPreferenceId,
              status: urlStatus,
            }),
          });

          if (verifyRes.ok) {
            const verifyJson: { order?: VerifiedOrderRow | null } = await verifyRes.json();
            if (verifyJson?.order && verifyJson.order.id === urlRef) {
              const serverOrder: VerifiedOrderRow = verifyJson.order;
              latestOrder = serverOrder;
              if (cancelled) return;

              if (isTerminalOrResolvedOrder(serverOrder, normalizedUrlStatus)) {
                setVerifiedState({
                  checkedRef: urlRef,
                  order: serverOrder,
                  completed: true,
                });
                return;
              }

              setVerifiedState({
                checkedRef: urlRef,
                order: serverOrder,
                completed: false,
              });
            }
          }
        } catch (verifyErr) {
          console.warn('[Resultado] Aviso consultando /api/mercadopago/verify-payment:', verifyErr);
        }

        if (cancelled) return;

        // 2. Respaldo directo contra Supabase (lectura autenticada de la orden)
        const { data, error } = await supabase
          .from('orders')
          .select('id, status, payment_status, payment_id, total_amount')
          .eq('id', urlRef)
          .maybeSingle();

        if (cancelled) return;

        if (!error && data) {
          latestOrder = data;
          if (isTerminalOrResolvedOrder(data, normalizedUrlStatus)) {
            setVerifiedState({
              checkedRef: urlRef,
              order: data,
              completed: true,
            });
            return;
          }

          setVerifiedState({
            checkedRef: urlRef,
            order: data,
            completed: false,
          });
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }

      if (!cancelled) {
        setVerifiedState({
          checkedRef: urlRef,
          order: latestOrder,
          completed: true,
        });
      }
    };

    verifyOrderInDatabase();

    return () => {
      cancelled = true;
    };
  }, [urlRef, urlStatus, urlPaymentId, urlPreferenceId]);

  const isRefValid = isValidUuid(urlRef);
  const verificationComplete =
    !isRefValid || (verifiedState.checkedRef === urlRef && verifiedState.completed);
  const orderFromDb = isRefValid && verifiedState.checkedRef === urlRef ? verifiedState.order : null;

  const { displayState, requiresAttention, verifiedOrderId, verifiedPaymentId } =
    resolveVerifiedCheckoutResult({
      urlStatus,
      urlRef,
      orderFromDb,
      verificationComplete,
    });

  const isVerifying = displayState === 'verifying';
  const isApproved = displayState === 'approved';
  const isPending = displayState === 'pending';
  const isRejected = displayState === 'rejected';
  const displayRef = verifiedOrderId || (isValidUuid(urlRef) ? urlRef : 'SIN-REFERENCIA');
  const formattedTotal =
    orderFromDb?.total_amount !== null &&
    orderFromDb?.total_amount !== undefined &&
    Number.isFinite(Number(orderFromDb.total_amount))
      ? `$${Math.round(Number(orderFromDb.total_amount)).toLocaleString('es-CL')} CLP`
      : null;

  // Limpieza controlada del carrito: se ejecuta ÚNICAMENTE cuando la orden
  // ha sido verificada en la base de datos como efectivamente pagada y aprobada.
  useEffect(() => {
    if (isApproved && verifiedOrderId && clearedOrderRef.current !== verifiedOrderId) {
      clearedOrderRef.current = verifiedOrderId;
      clearCart();
      setCartId(null);
    }
  }, [isApproved, verifiedOrderId, clearCart, setCartId]);

  return (
    <div className="min-h-[85vh] bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-14 sm:py-20">
      <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-10 text-center shadow-sm">
        {/* Banner de Modo Simulación (si aplica) */}
        {isMock && (
          <div className="mb-6 p-3.5 rounded-xl bg-[#F7F3EB] border border-[#B89768]/40 text-[#9E7D4F] text-xs font-medium leading-relaxed">
            ℹ Simulación de desarrollo: El flujo de pago funcionó correctamente en modo prueba.
          </div>
        )}

        {/* ESTADO: VERIFICANDO EN SERVIDOR */}
        {isVerifying && (
          <div className="py-4">
            <div className="w-16 h-16 bg-[#F7F3EB] text-[#9E7D4F] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#B89768]/30">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>

            <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9E7D4F] mb-2">
              Conciliación Bancaria B2B
            </span>

            <h1 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">
              Verificando estado del pago...
            </h1>

            <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed max-w-md mx-auto">
              Estamos confirmando la acreditación de su transacción directamente con Mercado Pago y actualizando su pedido en nuestros registros. Por favor espere unos segundos.
            </p>
          </div>
        )}

        {/* ESTADO: APROBADO (Confirmado en Base de Datos Supabase) */}
        {isApproved && (
          <div>
            <div className="w-16 h-16 bg-emerald-50 text-emerald-700 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-200">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-800 uppercase tracking-[0.18em] bg-emerald-50 border border-emerald-200 px-3.5 py-1 rounded-full">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Pago Mayorista Confirmado
            </span>

            <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight mt-4">
              ¡Su Pedido B2B está en marcha!
            </h1>

            <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed max-w-md mx-auto">
              Hemos registrado su orden mayorista y acreditado el pago exitosamente mediante Mercado Pago. Su inventario ha sido asignado.
            </p>

            {/* Tarjeta de Comprobante y Resumen de Pedido */}
            <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-2xl p-5 my-6 text-left space-y-3 text-xs">
              <div className="flex items-center gap-2 pb-2.5 border-b border-[#E5E4DF] text-[#9E7D4F] font-semibold uppercase tracking-wider text-[11px]">
                <Receipt className="w-4 h-4" />
                Comprobante de Orden Mayorista
              </div>

              <div className="flex justify-between items-center pb-2.5 border-b border-[#E5E4DF]">
                <span className="text-[#575551] font-medium">N° de Orden OptiHub:</span>
                <span className="font-mono font-bold text-[#111111] text-xs sm:text-sm">
                  {displayRef}
                </span>
              </div>

              {(verifiedPaymentId || urlPaymentId) && (
                <div className="flex justify-between items-center pb-2.5 border-b border-[#E5E4DF]">
                  <span className="text-[#575551] font-medium">ID Operación Mercado Pago:</span>
                  <span className="font-mono font-semibold text-[#111111]">
                    #{verifiedPaymentId || urlPaymentId}
                  </span>
                </div>
              )}

              {formattedTotal && (
                <div className="flex justify-between items-center pb-2.5 border-b border-[#E5E4DF]">
                  <span className="text-[#575551] font-medium">Total Facturado (IVA incl.):</span>
                  <span className="font-mono font-bold text-[#111111]">{formattedTotal}</span>
                </div>
              )}

              <div className="flex justify-between items-center pb-2.5 border-b border-[#E5E4DF]">
                <span className="text-[#575551] font-medium">Plazo Estimado de Entrega:</span>
                <span className="font-semibold text-[#9E7D4F]">10 a 15 días hábiles</span>
              </div>

              <div className="flex justify-between items-center pt-0.5">
                <span className="text-[#575551] font-medium">Documento Tributario:</span>
                <span className="text-[#111111] font-medium">Factura Electrónica SII</span>
              </div>
            </div>

            {/* Próximos Pasos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left text-xs mb-8">
              <div className="bg-[#FAF9F6] border border-[#E5E4DF] p-4 rounded-xl">
                <Truck className="w-4 h-4 text-[#9E7D4F] mb-1.5" />
                <span className="font-semibold text-[#111111] block">Consolidación &amp; Aduana</span>
                <span className="text-[#575551] text-[11px] leading-relaxed">
                  Preparación desde centro de distribución en origen con seguro internacional.
                </span>
              </div>
              <div className="bg-[#FAF9F6] border border-[#E5E4DF] p-4 rounded-xl">
                <FileText className="w-4 h-4 text-[#9E7D4F] mb-1.5" />
                <span className="font-semibold text-[#111111] block">Emisión de DTE</span>
                <span className="text-[#575551] text-[11px] leading-relaxed">
                  Envío automático de la Factura Electrónica a su casilla tributaria.
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {verifiedOrderId && (
                <Link
                  href={`/mis-pedidos/${verifiedOrderId}`}
                  className="flex-1 bg-[#FAF9F6] hover:bg-[#F7F3EB] text-[#111111] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex items-center justify-center border border-[#E5E4DF]"
                >
                  Ver Detalle del Pedido
                </Link>
              )}
              <Link
                href="/catalogo"
                className="flex-1 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm"
              >
                <span>Volver al Catálogo</span>
                <ArrowRight className="w-4 h-4 text-[#B89768]" />
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO: PENDIENTE DE CONFIRMACIÓN O EN CONCILIACIÓN MANUAL */}
        {isPending && (
          <div>
            <div className="w-16 h-16 bg-amber-50 text-amber-700 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-amber-200">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full mb-3">
              {requiresAttention ? 'Conciliación Prioritaria' : 'En Proceso de Confirmación'}
            </span>

            <h1 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">
              {requiresAttention
                ? 'Pedido en Revisión y Conciliación'
                : 'Pago Pendiente de Acreditación'}
            </h1>

            <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed max-w-md mx-auto">
              {requiresAttention
                ? `Hemos registrado el comprobante ${verifiedPaymentId ? `#${verifiedPaymentId}` : 'de pago'} para la orden ${displayRef}. Nuestro equipo de operaciones B2B está validando la asignación de inventario.`
                : `Estamos aguardando la confirmación definitiva de Mercado Pago para su orden (${displayRef}). El estado se actualizará automáticamente en su panel de pedidos apenas se acredite el abono.`}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              {verifiedOrderId && (
                <Link
                  href={`/mis-pedidos/${verifiedOrderId}`}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest"
                >
                  <span>Revisar Estado del Pedido</span>
                  <ArrowRight className="w-4 h-4 text-[#B89768]" />
                </Link>
              )}
              <Link
                href="/catalogo"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FAF9F6] hover:bg-[#F7F3EB] text-[#111111] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest border border-[#E5E4DF]"
              >
                Volver al Catálogo
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO: RECHAZADO O NO VERIFICADO */}
        {isRejected && (
          <div>
            <div className="w-16 h-16 bg-red-50 text-red-700 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-red-200">
              <XCircle className="w-8 h-8" />
            </div>

            <span className="inline-block text-[10px] font-semibold uppercase tracking-[0.18em] text-red-800 bg-red-50 border border-red-200 px-3 py-1 rounded-full mb-3">
              Operación No Completada
            </span>

            <h1 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">
              El pago no pudo procesarse
            </h1>

            <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed max-w-md mx-auto">
              La transacción fue anulada o rechazada por el medio de pago. Su carro mayorista permanece intacto para que pueda reintentar con otra tarjeta o medio de pago en Mercado Pago.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/checkout"
                className="flex-1 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <span>Reintentar el Pago</span>
                <ArrowRight className="w-4 h-4 text-[#B89768]" />
              </Link>
              <Link
                href="/carrito"
                className="flex-1 bg-[#FAF9F6] hover:bg-[#F7F3EB] text-[#111111] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest flex items-center justify-center gap-2 border border-[#E5E4DF]"
              >
                <ArrowLeft className="w-4 h-4 text-[#82807A]" />
                <span>Revisar Carro B2B</span>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResultadoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center">
          <div className="flex items-center gap-3 text-xs font-mono uppercase tracking-widest text-[#575551]">
            <Loader2 className="w-5 h-5 text-[#B89768] animate-spin" />
            Verificando estado del pago...
          </div>
        </div>
      }
    >
      <ResultadoContent />
    </Suspense>
  );
}
