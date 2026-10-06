'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCartStore } from '@/store/useCartStore';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowLeft, 
  ArrowRight, 
  ShieldCheck, 
  Truck, 
  FileText, 
  AlertCircle, 
  CheckCircle2,
  Lock
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function CarritoPage() {
  const [mounted, setMounted] = useState(false);
  const { isLoggedIn } = useAuth();

  const cart = useCartStore((state) => state.cart);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeFromCart = useCartStore((state) => state.removeFromCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);
  const getMontoIva = useCartStore((state) => state.getMontoIva);
  const getMontoTotal = useCartStore((state) => state.getMontoTotal);
  const isValidMOQ = useCartStore((state) => state.isValidMOQ);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const totalUnits = getTotalUnits();
  const montoNeto = getMontoNeto();
  const montoIva = getMontoIva();
  const montoTotal = getMontoTotal();
  const moqValido = isValidMOQ();
  const unidadesFaltantes = Math.max(0, 10 - totalUnits);
  const porcentajeProgreso = Math.min(100, Math.round((totalUnits / 10) * 100));

  if (cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <div className="w-20 h-20 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
            <ShoppingBag className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tight">
            Tu Carrito B2B está vacío
          </h1>
          <p className="text-slate-400 text-sm mt-3 leading-relaxed">
            Explora nuestro catálogo mayorista de armazones originales con stock sincronizado. Recuerda que el pedido mínimo es de <span className="text-emerald-400 font-bold">10 unidades combinables</span> entre cualquier marca.
          </p>
          <div className="mt-8">
            <Link
              href="/catalogo"
              className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 px-6 rounded-2xl transition shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider"
            >
              Explorar Catálogo Mayorista
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Encabezado */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <Link href="/" className="hover:text-emerald-400 transition">Inicio</Link>
              <span>/</span>
              <Link href="/catalogo" className="hover:text-emerald-400 transition">Catálogo</Link>
              <span>/</span>
              <span className="text-emerald-400 font-medium">Carrito de Compras B2B</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">
              Orden Mayorista B2B
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('¿Estás seguro de que deseas vaciar tu carrito?')) {
                  clearCart();
                }
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar Carrito
            </button>
            <Link
              href="/catalogo"
              className="text-xs font-bold text-slate-300 hover:text-white transition flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Seguir Comprando
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* BARRA DE PROGRESO DE LA REGLA MOQ (10 UNIDADES) */}
        <div className={`p-6 rounded-3xl border transition-all shadow-xl ${
          moqValido 
            ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300' 
            : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
        }`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-3">
            <div className="flex items-center gap-3">
              {moqValido ? (
                <div className="p-2.5 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              ) : (
                <div className="p-2.5 bg-amber-500/20 rounded-xl text-amber-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
              )}
              <div>
                <h3 className="font-extrabold text-white text-base sm:text-lg">
                  {moqValido 
                    ? '¡Mínimo de compra B2B completado!' 
                    : `Requisito Mínimo: ${totalUnits} de 10 unidades`}
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  {moqValido 
                    ? `Has alcanzado ${totalUnits} unidades. Puedes proceder al pago y despacho mayorista.` 
                    : `Te faltan ${unidadesFaltantes} unidades para desbloquear el pedido mayorista. Puedes combinarlas con cualquier modelo del catálogo.`}
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0">
              <span className="text-2xl font-black text-white">{totalUnits}</span>
              <span className="text-xs text-slate-400 font-bold"> / 10 Unidades</span>
            </div>
          </div>

          {/* Barra visual de progreso */}
          <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-800">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                moqValido ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-amber-500 to-orange-400'
              }`}
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>
        </div>

        {/* LAYOUT PRINCIPAL: LISTADO DE PRODUCTOS + RESUMEN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* TABLA / LISTADO DE ITEMS */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl overflow-hidden shadow-lg">
              <div className="p-4 sm:p-6 border-b border-slate-800 flex justify-between items-center">
                <h2 className="font-bold text-white text-lg">
                  Armazones en tu Pedido ({cart.length} modelos)
                </h2>
                <span className="text-xs text-slate-400">Precios Netos en CLP</span>
              </div>

              <div className="divide-y divide-slate-800/80">
                {cart.map((item) => {
                  const targetId = item.producto.id_ext || item.producto.id || '';
                  const subtotalItem = (item.producto.precio_neto_clp || 0) * item.cantidad;
                  const stockMax = typeof item.producto.stock === 'number' ? item.producto.stock : 999;

                  return (
                    <div 
                      key={targetId}
                      className="p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-slate-800/20 transition"
                    >
                      {/* Imagen y Datos del Armazón */}
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-slate-950 border border-slate-800 rounded-2xl p-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
                          <img 
                            src={item.producto.imagen_principal || '/placeholder.png'} 
                            alt={item.producto.modelo}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="space-y-1 flex-1">
                          <span className="inline-block bg-slate-800 border border-slate-700/60 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {item.producto.marca}
                          </span>
                          <h3 className="font-bold text-white text-base leading-tight">
                            {item.producto.modelo}
                          </h3>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-400 font-mono">
                            <span>SKU: {item.producto.id_ext}</span>
                            {item.producto.codigo_color && (
                              <span>• Color: {item.producto.codigo_color}</span>
                            )}
                          </div>
                          <p className="text-xs text-emerald-400 font-semibold pt-0.5">
                            ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')} CLP Neto c/u
                          </p>
                        </div>
                      </div>

                      {/* Controles de Cantidad y Subtotal */}
                      <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                        {/* Selector de cantidad */}
                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl p-1">
                          <button
                            onClick={() => updateQuantity(targetId, item.cantidad - 1)}
                            className="w-8 h-8 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition border border-slate-800"
                            title="Disminuir"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          
                          <span className="w-10 text-center font-bold text-white text-sm">
                            {item.cantidad}
                          </span>

                          <button
                            onClick={() => {
                              if (item.cantidad < stockMax) {
                                updateQuantity(targetId, item.cantidad + 1);
                              }
                            }}
                            disabled={item.cantidad >= stockMax}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${
                              item.cantidad >= stockMax
                                ? 'bg-slate-900/50 border-slate-800 text-slate-600 cursor-not-allowed'
                                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
                            }`}
                            title={item.cantidad >= stockMax ? 'Stock máximo alcanzado' : 'Aumentar'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Subtotal del item */}
                        <div className="text-right min-w-[110px]">
                          <span className="text-[10px] text-slate-400 block uppercase">Subtotal Neto</span>
                          <span className="text-base font-black text-white">
                            ${subtotalItem.toLocaleString('es-CL')} CLP
                          </span>
                        </div>

                        {/* Botón eliminar */}
                        <button
                          onClick={() => removeFromCart(targetId)}
                          className="text-slate-500 hover:text-rose-400 p-2 rounded-xl hover:bg-rose-500/10 transition"
                          title="Eliminar del pedido"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Garantías y condiciones comerciales */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl flex items-start gap-3">
                <Truck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">Importación 10-15 días</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Despacho coordinado directo a tu óptica en Chile.</p>
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl flex items-start gap-3">
                <FileText className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">Facturación B2B SII</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Emitimos factura con IVA recuperable por tu empresa.</p>
                </div>
              </div>
              <div className="bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white">Garantía Original</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Armazones 100% auténticos con estuche de fábrica.</p>
                </div>
              </div>
            </div>
          </div>

          {/* CARD LATERAL: RESUMEN DE ORDEN Y PAGO */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl sticky top-28">
            <h2 className="text-xl font-black text-white uppercase tracking-tight pb-4 border-b border-slate-800">
              Resumen Mayorista
            </h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center text-slate-300">
                <span>Total de Armazones:</span>
                <span className="font-bold text-white">{totalUnits} unidades</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Subtotal Neto:</span>
                <span className="font-bold text-white">${montoNeto.toLocaleString('es-CL')} CLP</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="flex items-center gap-1.5">
                  IVA (19%):
                  <span className="text-[10px] text-slate-400 uppercase bg-slate-800 px-1.5 py-0.5 rounded">Chile</span>
                </span>
                <span className="font-bold text-emerald-400">${montoIva.toLocaleString('es-CL')} CLP</span>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-end">
                <div>
                  <span className="text-xs text-slate-400 block font-medium uppercase">Total Factura B2B</span>
                  <span className="text-xs text-emerald-400 font-bold">Impuestos Incluidos</span>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-white tracking-tight">
                    ${montoTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="text-xs text-slate-400 block font-bold">CLP</span>
                </div>
              </div>
            </div>

            {/* BOTÓN DE ACCIÓN AL CHECKOUT */}
            <div className="pt-2">
              {moqValido ? (
                isLoggedIn ? (
                  <Link
                    href="/checkout"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 px-6 rounded-2xl transition duration-200 shadow-lg shadow-emerald-500/20 text-center flex items-center justify-center gap-2 uppercase tracking-wider text-sm"
                  >
                    Continuar al Checkout B2B
                    <ArrowRight className="w-5 h-5" />
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <Link
                      href="/login?redirect=/checkout"
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-4 px-6 rounded-2xl transition duration-200 shadow-lg shadow-emerald-500/20 text-center flex items-center justify-center gap-2 uppercase tracking-wider text-sm"
                    >
                      <Lock className="w-4 h-4" />
                      Iniciar Sesión para Pagar
                    </Link>
                    <p className="text-[11px] text-center text-slate-400">
                      Debes ingresar con tu cuenta de óptica para procesar la facturación electrónica y despacho.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-slate-800 text-slate-500 font-bold py-4 px-6 rounded-2xl cursor-not-allowed text-center uppercase tracking-wider text-sm border border-slate-700/50"
                  >
                    Faltan {unidadesFaltantes} unidades para comprar
                  </button>
                  <p className="text-[11px] text-center text-amber-400">
                    Agrega al menos {unidadesFaltantes} {unidadesFaltantes === 1 ? 'armazón más' : 'armazones más'} de cualquier marca para habilitar la orden.
                  </p>
                </div>
              )}
            </div>

            {/* Pasarela y Medios de Pago */}
            <div className="pt-4 border-t border-slate-800 text-center space-y-2">
              <span className="text-[11px] text-slate-400 block">
                Pago protegido a través de
              </span>
              <div className="inline-flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-bold text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                Mercado Pago • Webpay / Débito / Crédito
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
