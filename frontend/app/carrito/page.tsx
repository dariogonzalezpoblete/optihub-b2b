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
      <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center py-20">
        <div className="w-8 h-8 border border-[#0F0F0F] border-t-transparent animate-spin"></div>
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
    lines.push('Solicito confirmación de disponibilidad para emitir Factura Electrónica y coordinar despacho a óptica.');
    const text = lines.join('\n');
    return `https://wa.me/56989338537?text=${encodeURIComponent(text)}`;
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-12 text-center">
          <div className="w-12 h-12 bg-[#F4F2ED] text-[#9E8256] border border-[#E6E2DD] flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="w-6 h-6 stroke-[1.5]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9E8256] mb-2">
            ORDEN MAYORISTA B2B
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-normal text-[#0F0F0F] tracking-tight">
            Su Carro Mayorista está vacío
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 leading-relaxed">
            Explore nuestro catálogo de armazones originales con inventario sincronizado en origen. El pedido mínimo mayorista es de <span className="text-[#0F0F0F] font-semibold">10 unidades combinables</span> entre cualquier marca y modelo.
          </p>
          <div className="mt-8">
            <Link
              href="/catalogo"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white py-4 px-6 transition text-[11px] uppercase tracking-[0.2em] border border-[#0F0F0F]"
            >
              <span>Explorar Catálogo Mayorista</span>
              <ArrowRight className="w-4 h-4 text-[#9E8256]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-24">
      {/* Encabezado Editorial */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF] py-10 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#787670] mb-2">
              <Link href="/" className="hover:text-[#0F0F0F] transition">Inicio</Link>
              <span>/</span>
              <Link href="/catalogo" className="hover:text-[#0F0F0F] transition">Catálogo</Link>
              <span>/</span>
              <span className="text-[#9E8256] font-medium">Pedido Mayorista B2B</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
              Pedido Mayorista B2B
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (confirm('¿Está seguro de que desea vaciar su carro mayorista?')) {
                  clearCart();
                }
              }}
              className="text-[10px] uppercase tracking-[0.16em] text-[#5C5A55] hover:text-[#9E3838] transition flex items-center gap-1.5 px-3.5 py-2.5 bg-[#FFFFFF] border border-[#E6E2DD] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Vaciar Carro
            </button>
            <Link
              href="/catalogo"
              className="text-[10px] uppercase tracking-[0.16em] font-medium text-[#0F0F0F] hover:bg-[#FAF9F6] transition flex items-center gap-1.5 px-4 py-2.5 bg-[#FFFFFF] border border-[#0F0F0F]"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#9E8256]" />
              Seguir Seleccionando
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8">
        
        {/* Banner de Aviso de Stock */}
        {activeNotice && (
          <div className="p-4 bg-[#FBF8F1] border border-[#E6E2DD] text-[#846C44] text-xs font-medium flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-[#846C44]" />
              <span>{activeNotice}</span>
            </div>
            <button 
              onClick={() => {
                setStockWarning('');
                clearLastError();
              }}
              className="text-[#846C44] hover:text-[#0F0F0F] p-1 cursor-pointer"
              title="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* BARRA DE PROGRESO DE LA REGLA MOQ (10 UNIDADES) */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 transition-all">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 border border-[#E6E2DD] bg-[#FAF9F6] text-[#9E8256] flex items-center justify-center">
                {moqValido ? <CheckCircle2 className="w-5 h-5 text-[#9E8256]" /> : <ShoppingBag className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-normal text-[#0F0F0F]">
                  {moqValido 
                    ? 'Mínimo Mayorista Completado (10/10 MOQ)' 
                    : `Progreso hacia el Mínimo Mayorista: ${totalUnits} de 10 unidades`}
                </h3>
                <p className="text-xs text-[#5C5A55] mt-0.5">
                  {moqValido 
                    ? `Ha seleccionado ${totalUnits} unidades. Su orden está habilitada para facturación electrónica y despacho.` 
                    : `Añada ${unidadesFaltantes} ${unidadesFaltantes === 1 ? 'unidad adicional' : 'unidades adicionales'} (combinables entre cualquier marca) para habilitar su pedido B2B.`}
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0 font-mono">
              <span className="text-2xl font-bold text-[#0F0F0F] tabular-nums">{totalUnits}</span>
              <span className="text-xs text-[#787670] uppercase"> / 10 un.</span>
            </div>
          </div>

          {/* Barra visual fina de progreso */}
          <div className="w-full bg-[#F4F2ED] h-[3px] overflow-hidden border border-[#E6E2DD]/60">
            <div 
              className="h-full bg-[#0F0F0F] transition-all duration-500"
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>
        </div>

        {/* LAYOUT PRINCIPAL: LISTADO DE PRODUCTOS + RESUMEN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* TABLA / LISTADO DE ITEMS */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E6E2DD] overflow-hidden">
              <div className="p-5 sm:p-6 border-b border-[#E6E2DD] bg-[#FAF9F6] flex justify-between items-center">
                <h2 className="font-serif font-normal text-[#0F0F0F] text-lg sm:text-xl">
                  Armazones Seleccionados ({cart.length} {cart.length === 1 ? 'modelo' : 'modelos'})
                </h2>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#787670]">
                  Valores Netos CLP
                </span>
              </div>

              <div className="divide-y divide-[#E6E2DD]">
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
                          <div className="w-20 h-20 sm:w-24 sm:h-24 bg-[#F4F2ED] border border-[#E6E2DD] p-2 flex-shrink-0 flex items-center justify-center overflow-hidden">
                            <img 
                              src={item.producto.imagen_principal || '/placeholder.png'} 
                              alt={item.producto.modelo}
                              className="max-h-full max-w-full object-contain mix-blend-multiply"
                              onError={(e) => {
                                e.currentTarget.onerror = null;
                                e.currentTarget.src = '/placeholder.png';
                              }}
                            />
                          </div>
                          <div className="space-y-1 flex-1">
                            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold text-[#9E8256] block">
                              {item.producto.marca}
                            </span>
                            <h3 className="font-serif font-normal text-[#0F0F0F] text-base sm:text-lg leading-tight">
                              {item.producto.modelo}
                            </h3>
                            <div className="flex flex-wrap gap-2 text-[10px] text-[#787670] font-mono">
                              <span>SKU: {item.producto.id_ext}</span>
                              {item.producto.codigo_color && (
                                <span>· Col: {item.producto.codigo_color}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-0.5">
                              <p className="text-xs font-mono font-bold text-[#0F0F0F] tabular-nums">
                                ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')} CLP Neto c/u
                              </p>
                              <span className="text-[#E6E2DD]">•</span>
                              {isOutOfStock ? (
                                <span className="text-[9px] uppercase font-mono text-[#9E3838] bg-[#FAF4F4] border border-[#E6D0D0] px-1.5 py-0.5">
                                  Sin stock
                                </span>
                              ) : isExceeded ? (
                                <span className="text-[9px] uppercase font-mono text-[#9E3838] bg-[#FAF4F4] border border-[#E6D0D0] px-1.5 py-0.5">
                                  Supera stock ({item.cantidad}/{stockMax} un.)
                                </span>
                              ) : isMaxReached ? (
                                <span className="text-[9px] uppercase font-mono text-[#846C44] bg-[#FBF8F1] border border-[#E6E2DD] px-1.5 py-0.5">
                                  Máx. disponible ({stockMax} un.)
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono text-[#787670] tabular-nums">
                                  Stock origen: {stockMax} un.
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Controles de Cantidad y Subtotal */}
                        <div className="flex items-center justify-between sm:justify-end gap-5 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-[#E6E2DD]">
                          {/* Selector de cantidad arquitectónico */}
                          <div className="flex items-center border border-[#E6E2DD] bg-[#FFFFFF]">
                            <button
                              onClick={() => {
                                updateQuantity(targetId, item.cantidad - 1);
                                setStockWarning('');
                              }}
                              className="w-8 h-8 text-[#0F0F0F] hover:bg-[#FAF9F6] flex items-center justify-center transition border-r border-[#E6E2DD] cursor-pointer"
                              title="Disminuir"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            
                            <span className="w-10 text-center font-mono font-bold text-[#0F0F0F] text-xs tabular-nums">
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
                              className={`w-8 h-8 flex items-center justify-center transition border-l border-[#E6E2DD] ${
                                isMaxReached || isOutOfStock
                                  ? 'bg-[#F4F2ED] text-[#A8A6A0] cursor-not-allowed'
                                  : 'text-[#0F0F0F] hover:bg-[#FAF9F6] cursor-pointer'
                              }`}
                              title={
                                isOutOfStock 
                                  ? 'Producto sin stock disponible' 
                                  : isMaxReached 
                                    ? `Stock máximo disponible: ${stockMax} unidades` 
                                    : 'Aumentar'
                              }
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Subtotal del item */}
                          <div className="text-right min-w-[120px]">
                            <span className="text-[9px] text-[#787670] block uppercase tracking-wider">Subtotal Neto</span>
                            <span className="text-sm sm:text-base font-mono font-bold text-[#0F0F0F] tabular-nums">
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
                            className="text-[#787670] hover:text-[#9E3838] p-2 transition cursor-pointer"
                            title="Eliminar del pedido"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {isExceeded && (
                        <div className="p-3 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0 text-[#9E3838]" />
                            <span>Stock máximo disponible: {stockMax} {stockMax === 1 ? 'unidad' : 'unidades'}. Se requiere ajustar la cantidad.</span>
                          </div>
                          <button
                            onClick={() => {
                              updateQuantity(targetId, stockMax);
                              setStockWarning('');
                            }}
                            className="px-3 py-1 bg-[#FFFFFF] hover:bg-[#FAF4F4] text-[#9E3838] border border-[#E6D0D0] text-[10px] font-mono uppercase transition cursor-pointer"
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
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 flex items-start gap-3.5">
                <FileText className="w-4 h-4 text-[#9E8256] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">Factura Electrónica SII</h4>
                  <p className="text-xs text-[#5C5A55] mt-1">Emisión directa con IVA (19%) recuperable como crédito fiscal para su óptica.</p>
                </div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 flex items-start gap-3.5">
                <ShieldCheck className="w-4 h-4 text-[#9E8256] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">Autenticidad de Origen</h4>
                  <p className="text-xs text-[#5C5A55] mt-1">Armazones 100% originales con estuche rígido y paño oficial de fábrica.</p>
                </div>
              </div>
            </div>
          </div>

          {/* CARD LATERAL: RESUMEN DE ORDEN Y PAGO (DOCUMENTO EJECUTIVO) */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8 space-y-6 sticky top-28">
            <h2 className="font-serif text-2xl font-normal text-[#0F0F0F] pb-4 border-b border-[#E6E2DD]">
              Resumen de Orden
            </h2>

            <div className="space-y-3 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="text-[10px] uppercase tracking-[0.18em]">Total Armazones:</span>
                <span className="font-mono font-bold text-[#0F0F0F] tabular-nums">{totalUnits} unidades</span>
              </div>
              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="text-[10px] uppercase tracking-[0.18em]">Subtotal Neto:</span>
                <span className="font-mono font-bold text-[#0F0F0F] tabular-nums">${montoNeto.toLocaleString('es-CL')} CLP</span>
              </div>
              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]">
                  IVA (19% SII):
                </span>
                <span className="font-mono font-semibold text-[#5C5A55] tabular-nums">${montoIva.toLocaleString('es-CL')} CLP</span>
              </div>

              <div className="pt-4 border-t border-[#E6E2DD] flex justify-between items-end">
                <div>
                  <span className="text-[10px] text-[#787670] block font-semibold uppercase tracking-[0.18em]">Total Factura B2B</span>
                  <span className="text-[10px] text-[#9E8256] uppercase tracking-wider font-medium">IVA Incluido</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl sm:text-3xl font-bold text-[#0F0F0F] tracking-tight tabular-nums">
                    ${montoTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="text-[10px] text-[#787670] block font-semibold">CLP</span>
                </div>
              </div>
            </div>

            {/* BOTÓN DE ACCIÓN AL CHECKOUT */}
            <div className="pt-2">
              {hasStockViolations ? (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-[#FAF4F4] text-[#9E3838] font-medium py-4 px-6 cursor-not-allowed text-center uppercase tracking-[0.18em] text-[11px] border border-[#E6D0D0] flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Stock Insuficiente en el Pedido
                  </button>
                  <p className="text-[10px] uppercase tracking-wider text-center text-[#9E3838]">
                    Uno o más modelos superan el stock disponible. Ajuste las cantidades antes de continuar.
                  </p>
                </div>
              ) : moqValido ? (
                isLoggedIn ? (
                  <Link
                    href="/checkout"
                    className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white font-medium py-4 px-6 transition duration-200 text-center flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-[11px] border border-[#0F0F0F]"
                  >
                    <span>Continuar al Checkout B2B</span>
                    <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                  </Link>
                ) : (
                  <div className="space-y-3">
                    <Link
                      href="/login?redirect=/checkout"
                      className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white font-medium py-4 px-6 transition duration-200 text-center flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-[11px] border border-[#0F0F0F]"
                    >
                      <Lock className="w-4 h-4 text-[#9E8256]" />
                      <span>Iniciar Sesión para Facturar</span>
                    </Link>
                    <p className="text-[10px] text-center text-[#787670] uppercase tracking-wider">
                      Ingrese con su cuenta de óptica para procesar la facturación electrónica y el despacho.
                    </p>
                  </div>
                )
              ) : (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-[#FAF9F6] text-[#787670] font-medium py-4 px-6 cursor-not-allowed text-center uppercase tracking-[0.16em] text-[10px] border border-[#E6E2DD]"
                  >
                    Faltan {unidadesFaltantes} {unidadesFaltantes === 1 ? 'unidad' : 'unidades'} para el mínimo B2B
                  </button>
                  <p className="text-[10px] text-center text-[#846C44] uppercase tracking-wider">
                    Agregue al menos {unidadesFaltantes} {unidadesFaltantes === 1 ? 'armazón más' : 'armazones más'} de cualquier marca para habilitar la compra mayorista.
                  </p>
                </div>
              )}
            </div>

            {/* Opciones B2B: WhatsApp y Cotización Formal */}
            <div className="pt-4 border-t border-[#E6E2DD] space-y-2">
              <a
                href={generateWhatsAppOrderUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full bg-[#FFFFFF] hover:bg-[#FAF9F6] text-[#0F0F0F] font-medium py-3 px-4 transition text-[10px] uppercase tracking-[0.16em] border border-[#E6E2DD] hover:border-[#0F0F0F] flex items-center justify-center gap-2 text-center"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#9E8256]" />
                <span>Enviar Pedido por WhatsApp</span>
              </a>

              <button
                type="button"
                onClick={() => window.print()}
                className="w-full bg-[#FFFFFF] hover:bg-[#FAF9F6] text-[#5C5A55] font-medium py-3 px-4 transition text-[10px] uppercase tracking-[0.16em] border border-[#E6E2DD] flex items-center justify-center gap-2 text-center cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#787670]" />
                <span>Imprimir / Descargar Cotización</span>
              </button>
            </div>

            {/* Pasarela y Medios de Pago */}
            <div className="pt-4 border-t border-[#E6E2DD] text-center space-y-2">
              <span className="text-[10px] text-[#787670] uppercase tracking-wider block">
                Transacción comercial protegida vía
              </span>
              <div className="inline-flex items-center gap-2 bg-[#FAF9F6] px-3.5 py-1.5 border border-[#E6E2DD] text-[10px] font-mono uppercase tracking-wider text-[#0F0F0F]">
                <span className="w-1.5 h-1.5 bg-[#9E8256]"></span>
                Mercado Pago · Webpay / Débito / Crédito
              </div>
            </div>
          </div>

        </div>

        {/* LÍNEA DE TIEMPO VISUAL LOGÍSTICA */}
        <DeliveryTimeline />

      </div>

      {/* Modal de Confirmación para Eliminar Artículo */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F0F0F]/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] max-w-md w-full p-8 relative space-y-5">
            <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-[#FAF4F4] border border-[#E6D0D0] flex items-center justify-center text-[#9E3838]">
                <Trash2 className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="text-[#787670] hover:text-[#0F0F0F] p-2 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="font-serif text-xl font-normal text-[#0F0F0F]">
                ¿Quitar armazón de su orden?
              </h3>
              <p className="text-[#5C5A55] text-xs leading-relaxed">
                Está a punto de retirar <strong className="text-[#0F0F0F] font-medium">{itemToDelete.marca} {itemToDelete.modelo}</strong> ({itemToDelete.cantidad} {itemToDelete.cantidad === 1 ? 'unidad' : 'unidades'}) de su pedido mayorista.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-5 py-2.5 bg-[#FFFFFF] hover:bg-[#FAF9F6] text-[#0F0F0F] border border-[#E6E2DD] text-[11px] uppercase tracking-[0.16em] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  removeFromCart(itemToDelete.key);
                  setItemToDelete(null);
                }}
                className="px-5 py-2.5 bg-[#0F0F0F] hover:bg-[#9E3838] text-white text-[11px] uppercase tracking-[0.16em] transition cursor-pointer border border-[#0F0F0F]"
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
