'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Glasses, Truck, FileText, ShoppingBag } from 'lucide-react';

function ResultadoContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status') || searchParams.get('collection_status') || 'approved';
  const ref = searchParams.get('ref') || searchParams.get('external_reference') || 'OPTI-PEDIDO';
  const paymentId = searchParams.get('payment_id') || searchParams.get('collection_id');
  const isMock = searchParams.get('mock') === 'true';

  const isApproved = status === 'approved';
  const isPending = status === 'pending' || status === 'in_process';
  const isRejected = !isApproved && !isPending;

  return (
    <div className="min-h-[85vh] bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-16">
      <div className="max-w-xl w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md animate-scale-in">
        
        {/* Banner de Modo Simulación (si aplica) */}
        {isMock && (
          <div className="mb-6 p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-semibold">
            ℹ Simulación de desarrollo: El flujo de pago funcionó correctamente. Cuando vincules tus credenciales reales de Mercado Pago, serás redirigido a la pasarela bancaria.
          </div>
        )}

        {/* ESTADO: APROBADO */}
        {isApproved && (
          <div>
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full">
              Pago Mayorista Confirmado
            </span>

            <h1 className="text-3xl font-black text-white uppercase tracking-tight mt-4">
              ¡Tu Pedido B2B está en marcha!
            </h1>

            <p className="text-slate-300 text-sm mt-3 leading-relaxed max-w-md mx-auto">
              Hemos registrado tu orden y confirmado el pago mediante Mercado Pago. Hemos enviado los detalles de la compra a tu correo electrónico.
            </p>

            {/* Tarjeta de Resumen de Pedido */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 my-6 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-medium">N° de Referencia:</span>
                <span className="font-mono font-bold text-white text-sm">{ref}</span>
              </div>
              {paymentId && (
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="text-slate-400 font-medium">Comprobante Mercado Pago:</span>
                  <span className="font-mono text-slate-300">#{paymentId}</span>
                </div>
              )}
              <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                <span className="text-slate-400 font-medium">Plazo Estimado de Entrega:</span>
                <span className="font-bold text-emerald-400">10 a 15 días hábiles</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-400 font-medium">Factura Electrónica:</span>
                <span className="text-slate-300">Emitida a los datos tributarios informados</span>
              </div>
            </div>

            {/* Próximos Pasos */}
            <div className="grid grid-cols-2 gap-3 text-left text-xs mb-8">
              <div className="bg-slate-800/40 border border-slate-700/50 p-3.5 rounded-xl">
                <Truck className="w-4 h-4 text-emerald-400 mb-1" />
                <span className="font-bold text-white block">Importación Directa</span>
                <span className="text-slate-400 text-[11px]">Consolidación desde proveedores en Miami.</span>
              </div>
              <div className="bg-slate-800/40 border border-slate-700/50 p-3.5 rounded-xl">
                <FileText className="w-4 h-4 text-emerald-400 mb-1" />
                <span className="font-bold text-white block">Trazabilidad SII</span>
                <span className="text-slate-400 text-[11px]">Envío automático del DTE a tu casilla fiscal.</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/catalogo"
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                Volver al Catálogo
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO: PENDIENTE */}
        {isPending && (
          <div>
            <div className="w-20 h-20 bg-amber-500/10 text-amber-400 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              Pago Pendiente de Acreditación
            </h1>

            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              Mercado Pago está procesando la transacción. Si pagaste a través de transferencia bancaria, tu orden se activará automáticamente una vez confirmado el abono.
            </p>

            <div className="mt-8">
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-6 rounded-xl transition text-sm uppercase"
              >
                Volver al Catálogo
              </Link>
            </div>
          </div>
        )}

        {/* ESTADO: RECHAZADO */}
        {isRejected && (
          <div>
            <div className="w-20 h-20 bg-rose-500/10 text-rose-400 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
              <XCircle className="w-10 h-10" />
            </div>

            <h1 className="text-2xl font-black text-white uppercase tracking-tight">
              El Pago no pudo completarse
            </h1>

            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              La transacción fue cancelada o rechazada por la entidad bancaria. No se ha realizado ningún cobro a tu cuenta.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/checkout"
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition text-sm uppercase"
              >
                Reintentar el Pago
              </Link>
              <Link
                href="/carrito"
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 px-6 rounded-xl transition text-sm uppercase border border-slate-700"
              >
                Modificar Carrito
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
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Verificando estado del pago...</div>}>
      <ResultadoContent />
    </Suspense>
  );
}
