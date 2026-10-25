'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCartStore, getValidStock, getProductCartKey } from '@/store/useCartStore';
import { 
  ShoppingBag, 
  Trash2, 
  Plus, 
  Minus, 
  ArrowLeft, 
  ArrowRight, 
  ShieldCheck, 
  FileText, 
  AlertCircle, 
  CheckCircle2,
  Lock,
  X,
  Printer,
  MessageCircle
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DeliveryTimeline from '@/components/catalog/DeliveryTimeline';

export default function CarritoPage() {
  const [mounted, setMounted] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [itemToDelete, setItemToDelete] = useState<{
    key: string;
    marca: string;
    modelo: string;
    cantidad: number;
  } | null>(null);
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
  const lastError = useCartStore((state) => state.lastError);
  const clearLastError = useCartStore((state) => state.clearLastError);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#B89768] border-t-transparent rounded-full animate-spin"></div>
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

  // Validación de stock a nivel de carrito
  const hasStockViolations = cart.some((item) => {
    const s = getValidStock(item.producto?.stock);
    return s <= 0 || item.cantidad > s;
  });

  const activeNotice = stockWarning || lastError;

  const generateWhatsAppOrderUrl = () => {
    const lines: string[] = [
      '*SOLICITUD DE PEDIDO MAYORISTA - OPTIHUB B2B*',
      '',
      `*Detalle (${totalUnits} armazones):*`,
    ];
    cart.forEach((it, idx) => {
      const subtotal = ((it.producto.precio_neto_clp || 0) * it.cantidad).toLocaleString('es-CL');
      lines.push(
        `${idx + 1}. ${it.producto.marca} ${it.producto.modelo} (${it.producto.id_ext}) x ${it.cantidad} un. - $${subtotal} CLP Neto`
      );
    });
    lines.push('');
    lines.push(`*Total Neto:* $${montoNeto.toLocaleString('es-CL')} CLP`);
    lines.push(`*IVA (19%):* $${montoIva.toLocaleString('es-CL')} CLP`);
    lines.push(`*Total Facturado:* $${montoTotal.toLocaleString('es-CL')} CLP`);
    lines.push('');
    lines.push('Solicito confirmacion de disponibilidad para emitir Factura Electronica y coordinar despacho a optica.');
    const text = lines.join('\n');
    return `https://wa.me/569989338537?text=${encodeURIComponent(text)}`;
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-8 sm:p-10 text-center shadow-sm">
          <div className="w-16 h-16 bg-[#FAF9F6] text-[#B89768] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#E5E4DF]">
            <ShoppingBag className="w-8 h-8 stroke-[1.6]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B89768] mb-2">
            Orden Mayorista B2B
          </span>
          <h1 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">
            Su Carro Mayorista está vacío
          </h1>
          <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed">
            Explore nuestro catálogo de armazones originales con inventario sincronizado en origen. El pedido mínimo mayorista es de <span className="text-[#111111] font-semibold">10 unidades combinables</span> entre cualquier marca y modelo.
          </p>
          <div className="mt-8">
            <Link
              href="/catalogo"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition shadow-sm text-xs uppercase tracking-widest"
            >
              <span>Explorar Catálogo Mayorista</span>
              <ArrowRight className="w-4 h-4 text-[#B89768]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#111111] pb-24">
      {/* Encabezado Editorial */}
      <div className="border-b border-[#E5E4DF] bg-[#FFFFFF] py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#82807A] mb-2">
              <Link href="/" className="hover:text-[#111111] transition">Inicio</Link>
              <span>/</span>
              <Link href="/catalogo" className="hover:text-[#111111] transition">Catálogo</Link>
              <span>/</span>
              <span className="text-[#B89768] font-medium">Carro Mayorista B2B</span>
            </div>
            <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">
              Orden Mayorista B2B
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('¿Está seguro de que desea vaciar su carro mayorista?')) {
                  clearCart();
                }
              }}
              className="text-xs text-[#575551] hover:text-red-700 transition flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar Carro
            </button>
            <Link
              href="/catalogo"
              className="text-xs font-semibold text-[#111111] hover:bg-[#FAF9F6] transition flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#FFFFFF] border border-[#E5E4DF]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#B89768]" />
              Seguir Seleccionando
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Banner de Aviso de Stock */}
        {activeNotice && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs sm:text-sm font-medium flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>{activeNotice}</span>
            </div>
            <button 
              onClick={() => {
                setStockWarning('');
                clearLastError();
              }}
              className="text-amber-700 hover:text-amber-950 p-1"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* BARRA DE PROGRESO DE LA REGLA MOQ (10 UNIDADES) - ESTILO MAISON EDITORIAL */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DF] p-6 rounded-2xl shadow-sm transition-all">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3.5">
              {moqValido ? (
                <div className="p-2.5 bg-[#F7F3EB] border border-[#B89768]/40 rounded-xl text-[#9E7D4F]">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl text-[#B89768]">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              )}
              <div>
                <h3 className="font-editorial font-serif text-lg sm:text-xl font-semibold text-[#111111]">
                  {moqValido 
                    ? 'Mínimo Mayorista Completado (MOQ)' 
                    : `Progreso hacia el Mínimo Mayorista: ${totalUnits} de 10 unidades`}
                </h3>
                <p className="text-xs text-[#575551] mt-0.5">
                  {moqValido 
                    ? `Ha seleccionado ${totalUnits} unidades. Su orden está habilitada para facturación electrónica y despacho.` 
                    : `Añada ${unidadesFaltantes} ${unidadesFaltantes === 1 ? 'unidad adicional' : 'unidades adicionales'} (combinables entre cualquier marca) para habilitar su pedido B2B.`}
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0 font-mono">
              <span className="text-2xl font-bold text-[#111111]">{totalUnits}</span>
              <span className="text-xs text-[#82807A] font-medium"> / 10 un.</span>
            </div>
          </div>

          {/* Barra visual de progreso */}
          <div className="w-full bg-[#F7F6F2] rounded-full h-2.5 overflow-hidden border border-[#E5E4DF]">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                moqValido ? 'bg-[#111111]' : 'bg-[#B89768]'
              }`}
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>
        </div>

        {/* LAYOUT PRINCIPAL: LISTADO DE PRODUCTOS + RESUMEN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* TABLA / LISTADO DE ITEMS */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl overflow-hidden shadow-sm">
              <div className="p-5 sm:p-6 border-b border-[#E5E4DF] bg-[#FAF9F6] flex justify-between items-center">
                <h2 className="font-editorial font-serif font-semibold text-[#111111] text-lg sm:text-xl">
                  Armazones Seleccionados ({cart.length} {cart.length === 1 ? 'modelo' : 'modelos'})
                </h2>
                <span className="text-[11px] font-mono uppercase tracking-wider text-[#82807A]">
                  Valores Netos CLP
                </span>
              </div>

              <div className="divide-y divide-[#E5E4DF]">
                {cart.map((item) => {
                  const targetId = getProductCartKey(item.producto);
                  const subtotalItem = (item.producto.precio_neto_clp || 0) * item.cantidad;
                  const stockMax = getValidStock(item.producto.stock);
                  const isOutOfStock = stockMax <= 0;
                  const isExceeded = item.cantidad > stockMax;
                  const isMaxReached = item.cantidad >= stockMax;

                  return (
                    <div 
                      key={targetId}
                      className="p-5 sm:p-6 flex flex-col gap-3 hover:bg-[#FAF9F6]/60 transition"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        {/* Imagen y Datos del Armazón */}
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#FFFFFF] border border-[#E5E4DF] rounded-xl p-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            <img 
                              src={item.producto.imagen_principal || '/placeholder.png'} 
                              alt={item.producto.modelo}
                              className="max-h-full max-w-full object-contain"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/placeholder.png';
                              }}
                            />
                          </div>
                          <div className="space-y-1 flex-1">
                            <span className="inline-block bg-[#F7F3EB] border border-[#B89768]/30 text-[#9E7D4F] text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider">
                              {item.producto.marca}
                            </span>
                            <h3 className="font-editorial font-serif font-semibold text-[#111111] text-base sm:text-lg leading-tight">
                              {item.producto.modelo}
                            </h3>
                            <div className="flex flex-wrap gap-2 text-[11px] text-[#82807A] font-mono">
                              <span>SKU: {item.producto.id_ext}</span>
                              {item.producto.codigo_color && (
                                <span>• Color: {item.producto.codigo_color}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-0.5">
                              <p className="text-xs font-mono font-semibold text-[#111111]">
                                ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')} CLP Neto c/u
                              </p>
                              <span className="text-[#E5E4DF]">•</span>
                              {isOutOfStock ? (
                                <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                  Sin stock
                                </span>
                              ) : isExceeded ? (
                                <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                  Supera stock ({item.cantidad}/{stockMax} un.)
                                </span>
                              ) : isMaxReached ? (
                                <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                  Máx. disponible ({stockMax} un.)
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-[#82807A]">
                                  Stock origen: {stockMax} un.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Controles de Cantidad y Subtotal */}
                        <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-[#E5E4DF]">
                          {/* Selector de cantidad */}
                          <div className="flex items-center gap-1.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl p-1">
                            <button
                              onClick={() => {
                                updateQuantity(targetId, item.cantidad - 1);
                                setStockWarning('');
                              }}
                              className="w-8 h-8 rounded-lg bg-[#FFFFFF] hover:bg-[#F7F6F2] text-[#111111] flex items-center justify-center transition border border-[#E5E4DF]"
                              title="Disminuir"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            
                            <span className="w-10 text-center font-mono font-bold text-[#111111] text-sm">
                              {item.cantidad}
                            </span>

                            <button
                              onClick={() => {
                                if (item.cantidad < stockMax) {
                                  const res = updateQuantity(targetId, item.cantidad + 1);
                                  if (res?.message) {
                                    setStockWarning(res.message);
                                  } else {
                                    setStockWarning('');
                                  }
                                } else {
                                  setStockWarning(`Stock máximo disponible: ${stockMax} ${stockMax === 1 ? 'unidad' : 'unidades'}.`);
                                }
                              }}
                              disabled={isMaxReached || isOutOfStock}
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition border ${
                                isMaxReached || isOutOfStock
                                  ? 'bg-[#F7F6F2] border-[#E5E4DF] text-[#C2C0B8] cursor-not-allowed'
                                  : 'bg-[#FFFFFF] hover:bg-[#F7F6F2] text-[#111111] border-[#E5E4DF]'
                              }`}
                              title={
                                isOutOfStock 
                                  ? 'Producto sin stock disponible' 
                                  : isMaxReached 
                                    ? `Stock máximo disponible: ${stockMax} unidades` 
                                    : 'Aumentar'
                              }
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Subtotal del item */}
                          <div className="text-right min-w-[115px]">
                            <span className="text-[10px] text-[#82807A] block uppercase tracking-wider">Subtotal Neto</span>
                            <span className="text-sm sm:text-base font-mono font-bold text-[#111111]">
                              ${subtotalItem.toLocaleString('es-CL')} CLP
                            </span>
                          </div>

                          {/* Botón eliminar */}
                          <button
                            onClick={() => {
                              setItemToDelete({
                                key: targetId,
                                marca: item.producto.marca || 'Armazón',
                                modelo: item.producto.modelo || '',
                                cantidad: item.cantidad
                              });
                            }}
                            className="text-[#82807A] hover:text-red-600 p-2 rounded-xl hover:bg-red-50 transition"
                            title="Eliminar del pedido"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Alerta contextual si el item supera el stock */}
                      {isExceeded && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-medium flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                            <span>Stock máximo disponible: {stockMax} {stockMax === 1 ? 'unidad' : 'unidades'}. Se requiere ajustar la cantidad.</span>
                          </div>
                          <button
                            onClick={() => {
                              updateQuantity(targetId, stockMax);
                              setStockWarning('');
                            }}
                            className="px-3 py-1 bg-[#FFFFFF] hover:bg-red-100 text-red-800 border border-red-300 rounded-lg text-[10px] font-bold uppercase transition"
                          >
                            Ajustar a {stockMax}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Garantías B2B */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#FFFFFF] border border-[#E5E4DF] p-5 rounded-2xl flex items-start gap-3.5 shadow-sm">
                <FileText className="w-5 h-5 text-[#B89768] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Factura Electrónica SII</h4>
                  <p className="text-xs text-[#575551] mt-1">Emisión directa con IVA (19%) recuperable como crédito fiscal para su óptica.</p>
                </div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E5E4DF] p-5 rounded-2xl flex items-start gap-3.5 shadow-sm">
                <ShieldCheck className="w-5 h-5 text-[#B89768] flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Autenticidad de Origen</h4>
                  <p className="text-xs text-[#575551] mt-1">Armazones 100% originales con estuche rígido y paño oficial de fábrica.</p>
                </div>
              </div>
            </div>
          </div>

          {/* CARD LATERAL: RESUMEN DE ORDEN Y PAGO */}
          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm sticky top-28">
            <h2 className="font-editorial font-serif text-2xl font-semibold text-[#111111] pb-4 border-b border-[#E5E4DF]">
              Resumen de Orden
            </h2>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-[#575551]">
                <span>Total de Armazones:</span>
                <span className="font-mono font-bold text-[#111111]">{totalUnits} unidades</span>
              </div>
              <div className="flex justify-between items-center text-[#575551]">
                <span>Subtotal Neto:</span>
                <span className="font-mono font-bold text-[#111111]">${montoNeto.toLocaleString('es-CL')} CLP</span>
              </div>
              <div className="flex justify-between items-center text-[#575551]">
                <span className="flex items-center gap-1.5">
                  IVA (19%):
                  <span className="text-[10px] text-[#82807A] uppercase bg-[#F7F6F2] border border-[#E5E4DF] px-1.5 py-0.5 rounded">SII Chile</span>
                </span>
                <span className="font-mono font-semibold text-[#575551]">${montoIva.toLocaleString('es-CL')} CLP</span>
              </div>

              <div className="pt-4 border-t border-[#E5E4DF] flex justify-between items-end">
                <div>
                  <span className="text-[11px] text-[#82807A] block font-semibold uppercase tracking-wider">Total Factura B2B</span>
                  <span className="text-[11px] text-[#B89768] font-medium">IVA Incluido</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight">
                    ${montoTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="text-[10px] text-[#82807A] block font-semibold">CLP</span>
                </div>
              </div>
            </div>

            {/* BOTÓN DE ACCIÓN AL CHECKOUT */}
            <div className="pt-2">
              {hasStockViolations ? (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-red-50 text-red-700 font-semibold py-3.5 px-6 rounded-xl cursor-not-allowed text-center uppercase tracking-wider text-xs border border-red-200 flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Stock Insuficiente en el Pedido
                  </button>
                  <p className="text-[11px] text-center text-red-700">
                    Uno o más modelos superan el stock disponible. Ajuste las cantidades antes de continuar.
                  </p>
                </div>
              ) : moqValido ? (
                isLoggedIn ? (
                  <Link
                    href="/checkout"
                    className="w-full bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-4 px-6 rounded-xl transition duration-200 shadow-sm text-center flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                  >
                    <span>Continuar al Checkout B2B</span>
                    <ArrowRight className="w-4 h-4 text-[#B89768]" />
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <Link
                      href="/login?redirect=/checkout"
                      className="w-full bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-4 px-6 rounded-xl transition duration-200 shadow-sm text-center flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
                    >
                      <Lock className="w-4 h-4 text-[#B89768]" />
                      <span>Iniciar Sesión para Facturar</span>
                    </Link>
                    <p className="text-[11px] text-center text-[#82807A]">
                      Ingrese con su cuenta de óptica para procesar la facturación electrónica y el despacho.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-[#F7F6F2] text-[#82807A] font-semibold py-4 px-6 rounded-xl cursor-not-allowed text-center uppercase tracking-wider text-xs border border-[#E5E4DF]"
                  >
                    Faltan {unidadesFaltantes} {unidadesFaltantes === 1 ? 'unidad' : 'unidades'} para el mínimo B2B
                  </button>
                  <p className="text-[11px] text-center text-[#9E7D4F]">
                    Agregue al menos {unidadesFaltantes} {unidadesFaltantes === 1 ? 'armazón más' : 'armazones más'} de cualquier marca para habilitar la compra mayorista.
                  </p>
                </div>
              )}
            </div>

            {/* Opciones B2B: WhatsApp y Cotización Formal */}
            <div className="pt-4 border-t border-[#E5E4DF] space-y-2.5">
              <a
                href={generateWhatsAppOrderUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#FAF9F6] hover:bg-[#F4EFE6] text-[#111111] font-semibold py-3 px-4 rounded-xl transition text-xs border border-[#E5E4DF] hover:border-[#B89768] flex items-center justify-center gap-2 text-center"
              >
                <MessageCircle className="w-4 h-4 text-[#B89768]" />
                <span>Enviar Pedido por WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-[#FFFFFF] hover:bg-[#FAF9F6] text-[#575551] font-medium py-2.5 px-4 rounded-xl transition text-xs border border-[#E5E4DF] flex items-center justify-center gap-2 text-center"
              >
                <Printer className="w-3.5 h-3.5 text-[#82807A]" />
                <span>Imprimir / Descargar Cotización</span>
              </button>
            </div>

            {/* Pasarela y Medios de Pago */}
            <div className="pt-4 border-t border-[#E5E4DF] text-center space-y-2">
              <span className="text-[11px] text-[#82807A] block">
                Transacción comercial protegida vía
              </span>
              <div className="inline-flex items-center gap-2 bg-[#FAF9F6] px-3.5 py-1.5 rounded-full border border-[#E5E4DF] text-[11px] font-semibold text-[#111111]">
                <span className="w-2 h-2 rounded-full bg-[#B89768]"></span>
                Mercado Pago • Webpay / Débito / Crédito
              </div>
            </div>
          </div>

        </div>

        {/* LÍNEA DE TIEMPO VISUAL LOGÍSTICA */}
        <DeliveryTimeline />

      </div>

      {/* Modal de Confirmación para Eliminar Artículo */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/40 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-xl relative space-y-5">
            <div className="flex items-center justify-between">
              <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="text-[#82807A] hover:text-[#111111] p-2 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="font-editorial font-serif text-xl font-semibold text-[#111111]">
                ¿Quitar armazón de su orden?
              </h3>
              <p className="text-[#575551] text-xs sm:text-sm leading-relaxed">
                Está a punto de retirar <strong className="text-[#111111] font-semibold">{itemToDelete.marca} {itemToDelete.modelo}</strong> ({itemToDelete.cantidad} {itemToDelete.cantidad === 1 ? 'unidad' : 'unidades'}) de su pedido mayorista.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2.5 rounded-xl bg-[#FAF9F6] hover:bg-[#F7F6F2] text-[#111111] border border-[#E5E4DF] font-semibold text-xs transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  removeFromCart(itemToDelete.key);
                  setItemToDelete(null);
                }}
                className="px-5 py-2.5 rounded-xl bg-[#111111] hover:bg-red-700 text-[#FFFFFF] font-semibold text-xs uppercase tracking-wider transition"
              >
                Sí, Quitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
