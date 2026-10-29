'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  MessageCircle,
  FileDown,
  Building2,
  Calendar,
  Check,
  Truck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import DeliveryTimeline from '@/components/catalog/DeliveryTimeline';
import { trackB2BEvent } from '@/lib/analytics';

export default function CarritoPage() {
  const [mounted, setMounted] = useState(false);
  const [stockWarning, setStockWarning] = useState<string>('');
  const [showQuoteModal, setShowQuoteModal] = useState<boolean>(false);
  const [itemToDelete, setItemToDelete] = useState<{
    key: string;
    marca: string;
    modelo: string;
    cantidad: number;
  } | null>(null);

  const { user, isLoggedIn, opticaData } = useAuth();

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

  const totalUnits = getTotalUnits();
  const montoNeto = getMontoNeto();
  const montoIva = getMontoIva();
  const montoTotal = getMontoTotal();
  const moqValido = isValidMOQ();
  const unidadesFaltantes = Math.max(0, 10 - totalUnits);
  const porcentajeProgreso = Math.min(100, Math.round((totalUnits / 10) * 100));

  // Generar código único para la cotización
  const quoteNumber = useMemo(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `COT-${yyyy}${mm}${dd}-${Math.floor(1000 + Math.random() * 9000)}`;
  }, []);

  const quoteDateStr = useMemo(() => {
    const today = new Date();
    return today.toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center py-20">
        <div className="w-8 h-8 border border-[#0F0F0F] border-t-transparent animate-spin"></div>
      </div>
    );
  }

  const hasStockViolations = cart.some((item) => {
    const s = getValidStock(item.producto?.stock);
    return s <= 0 || item.cantidad > s;
  });

  const activeNotice = stockWarning || lastError;

  const generateWhatsAppOrderUrl = () => {
    const lines: string[] = [
      '*SOLICITUD DE PEDIDO MAYORISTA - OPTIHUB B2B*',
      '',
      `*N° Cotización:* ${quoteNumber}`,
      `*Óptica:* ${opticaData?.nombre_optica || opticaData?.razon_social || 'Óptica Cliente'} (RUT: ${opticaData?.rut_empresa || 'En validación'})`,
      '',
      `*Detalle (${totalUnits} armazones combinables):*`,
    ];
    cart.forEach((it, idx) => {
      const subtotal = ((it.producto.precio_neto_clp || 0) * it.cantidad).toLocaleString('es-CL');
      lines.push(
        `${idx + 1}. ${it.producto.marca} ${it.producto.modelo} (${it.producto.id_ext}) x ${it.cantidad} un. - $${subtotal} CLP Neto`
      );
    });
    lines.push('');
    lines.push(`*Subtotal Neto:* $${montoNeto.toLocaleString('es-CL')} CLP`);
    lines.push(`*IVA (19% Crédito Fiscal):* $${montoIva.toLocaleString('es-CL')} CLP`);
    lines.push(`*Logística e Internación:* Incluida (Modalidad DDP)`);
    lines.push(`*Total Factura Electrónica SII:* $${montoTotal.toLocaleString('es-CL')} CLP`);
    lines.push('');
    lines.push('Solicito confirmación de disponibilidad para emitir Factura Electrónica y coordinar despacho.');
    const text = lines.join('\n');
    return `https://wa.me/56989338537?text=${encodeURIComponent(text)}`;
  };

  const handlePrintQuote = () => {
    trackB2BEvent('download_b2b_quote', {
      quote_number: quoteNumber,
      total_units: totalUnits,
      total_neto: montoNeto,
      item_count: cart.length,
    });
    window.print();
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-[80vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-12 text-center shadow-xs">
          <div className="w-12 h-12 bg-[#F4F2ED] text-[#9E8256] border border-[#E6E2DD] flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="w-6 h-6 stroke-[1.5]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#9E8256] mb-2 font-mono">
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
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF] py-10 px-4 sm:px-6 lg:px-8 print:hidden">
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 space-y-8 print:hidden">
        
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

        {/* BARRA DE PROGRESO DE LA REGLA MOQ (10 UNIDADES COMBINABLES) */}
        <div className={`p-6 transition-all border ${moqValido ? 'bg-[#FFFFFF] border-[#E6E2DD]' : 'bg-[#FAF6ED] border-[#E6D7B8]'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-10 h-10 border flex items-center justify-center shrink-0 ${
                moqValido 
                  ? 'border-[#C4D9C8] bg-[#F4F8F5] text-[#2D6A4F]' 
                  : 'border-[#E6D7B8] bg-[#FFFFFF] text-[#846C44]'
              }`}>
                {moqValido ? <CheckCircle2 className="w-5 h-5 text-[#2D6A4F]" /> : <ShoppingBag className="w-5 h-5 text-[#846C44]" />}
              </div>
              <div>
                <h3 className="font-serif text-lg sm:text-xl font-normal text-[#0F0F0F]">
                  {moqValido 
                    ? 'Mínimo Mayorista Completado (10/10 MOQ)' 
                    : `Faltan ${unidadesFaltantes} ${unidadesFaltantes === 1 ? 'unidad' : 'unidades'} para alcanzar el mínimo mayorista (MOQ 10 u.)`}
                </h3>
                <p className="text-xs text-[#5C5A55] mt-0.5">
                  {moqValido 
                    ? `Ha seleccionado ${totalUnits} unidades combinables. Su orden cumple con el mínimo requerido para facturación electrónica y despacho nacionalizado.` 
                    : `Ha seleccionado ${totalUnits} de 10 armazones combinables. Añada ${unidadesFaltantes} ${unidadesFaltantes === 1 ? 'unidad adicional' : 'unidades adicionales'} de cualquier marca o modelo para habilitar el paso a checkout.`}
                </p>
              </div>
            </div>

            <div className="text-right flex-shrink-0 font-mono">
              <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${moqValido ? 'text-[#2D6A4F]' : 'text-[#846C44]'}`}>
                {totalUnits}
              </span>
              <span className="text-xs text-[#787670] uppercase"> / 10 un.</span>
            </div>
          </div>

          {/* Barra visual de progreso */}
          <div className="w-full bg-[#E6E2DD]/70 h-2 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${moqValido ? 'bg-[#2D6A4F]' : 'bg-[#9E8256]'}`}
              style={{ width: `${porcentajeProgreso}%` }}
            />
          </div>

          {/* Acceso rápido a catálogo si falta para el mínimo */}
          {!moqValido && (
            <div className="mt-4 pt-3 border-t border-[#E6D7B8] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <span className="text-[#846C44] font-medium">
                💡 Consejo B2B: Puede mezclar marcas de lujo, modelos oftálmicos o solares sin restricción de repetición.
              </span>
              <Link
                href="/catalogo"
                className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-[#0F0F0F] hover:text-[#9E8256] transition-colors whitespace-nowrap"
              >
                <span>Seguir eligiendo en el catálogo</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
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
                  Valores Netos en CLP
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
                              alt={item.producto.modelo || 'Armazón'}
                              className="w-full h-full object-contain mix-blend-multiply"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = '/placeholder.png';
                              }}
                            />
                          </div>

                          <div className="space-y-1 min-w-0">
                            <span className="text-[10px] uppercase font-mono tracking-wider text-[#9E8256] font-semibold block">
                              {item.producto.marca}
                            </span>
                            <h3 className="font-serif text-base sm:text-lg text-[#0F0F0F] font-normal truncate">
                              {item.producto.modelo}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#5C5A55]">
                              <span className="font-mono text-[11px] text-[#787670]">
                                SKU: {item.producto.id_ext}
                              </span>
                              {(item.producto.color || item.producto.codigo_color) && (
                                <span>• Color: {item.producto.color || `COL ${item.producto.codigo_color}`}</span>
                              )}
                              {item.producto.tamano && (
                                <span className="font-mono text-[11px] bg-[#FAF9F6] border border-[#E6E2DD] px-1.5 py-0.2">
                                  Calibre: {item.producto.tamano}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#0F0F0F] font-mono pt-0.5">
                              ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')} CLP Neto / un.
                            </div>
                          </div>
                        </div>

                        {/* Controles de Cantidad y Subtotal */}
                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E6E2DD]">
                          {/* Stepper */}
                          <div className="flex items-center border border-[#D5D0C8] bg-[#FFFFFF]">
                            <button
                              onClick={() => {
                                if (item.cantidad > 1) {
                                  updateQuantity(targetId, item.cantidad - 1);
                                  setStockWarning('');
                                } else {
                                  setItemToDelete({
                                    key: targetId,
                                    marca: item.producto.marca || 'Armazón',
                                    modelo: item.producto.modelo || '',
                                    cantidad: item.cantidad
                                  });
                                }
                              }}
                              className="w-8 h-8 flex items-center justify-center text-[#0F0F0F] hover:bg-[#FAF9F6] transition border-r border-[#E6E2DD] cursor-pointer"
                              title="Reducir"
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
                  <p className="text-xs text-[#5C5A55] mt-1">Emisión formal con IVA (19%) 100% deducible como crédito fiscal para su óptica.</p>
                </div>
              </div>
              <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 flex items-start gap-3.5">
                <ShieldCheck className="w-4 h-4 text-[#9E8256] flex-shrink-0 mt-0.5 stroke-[1.5]" />
                <div>
                  <h4 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">Autenticidad & Empaque Oficial</h4>
                  <p className="text-xs text-[#5C5A55] mt-1">Armazones 100% originales con estuche rígido, microfibra y folletería de fábrica.</p>
                </div>
              </div>
            </div>
          </div>

          {/* CARD LATERAL: RESUMEN DE ORDEN Y PAGO (DOCUMENTO EJECUTIVO) */}
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8 space-y-6 sticky top-28 shadow-xs">
            <div className="border-b border-[#E6E2DD] pb-4">
              <span className="text-[10px] uppercase font-mono tracking-wider text-[#9E8256] font-semibold block mb-1">
                LIQUIDACIÓN TRIBUTARIA CHILENA
              </span>
              <h2 className="font-serif text-2xl font-normal text-[#0F0F0F]">
                Resumen de Orden B2B
              </h2>
            </div>

            {/* DESGLOSE FINANCIERO TRIBUTARIO CHILENO FORMAL */}
            <div className="space-y-3.5 text-xs sm:text-sm">
              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="text-[10px] uppercase tracking-[0.18em]">Total Armazones:</span>
                <span className="font-mono font-bold text-[#0F0F0F] tabular-nums">{totalUnits} unidades</span>
              </div>

              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="text-[10px] uppercase tracking-[0.18em]">Subtotal Neto:</span>
                <span className="font-mono font-bold text-[#0F0F0F] tabular-nums">
                  ${montoNeto.toLocaleString('es-CL')} CLP
                </span>
              </div>

              <div className="flex justify-between items-center text-[#5C5A55]">
                <span className="text-[10px] uppercase tracking-[0.18em]">
                  IVA (19% Crédito Fiscal SII):
                </span>
                <span className="font-mono font-semibold text-[#0F0F0F] tabular-nums">
                  ${montoIva.toLocaleString('es-CL')} CLP
                </span>
              </div>

              <div className="flex justify-between items-center text-[#5C5A55] text-xs pt-0.5">
                <span className="text-[10px] uppercase tracking-[0.18em]">Logística e Internación USA-Chile:</span>
                <span className="font-mono font-semibold text-[#2D6A4F]">
                  Incluida (Modalidad DDP)
                </span>
              </div>

              <div className="pt-4 border-t border-[#E6E2DD] flex justify-between items-end">
                <div>
                  <span className="text-[10px] text-[#787670] block font-semibold uppercase tracking-[0.18em]">Total Factura Electrónica SII</span>
                  <span className="text-[10px] text-[#2D6A4F] uppercase tracking-wider font-semibold">100% Crédito Fiscal Deducible</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl sm:text-3xl font-bold text-[#0F0F0F] tracking-tight tabular-nums">
                    ${montoTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="text-[10px] text-[#787670] block font-semibold uppercase">Pesos Chilenos (CLP)</span>
                </div>
              </div>
            </div>

            {/* BOTÓN DE ACCIÓN AL CHECKOUT Y CONTROL DE BLOQUEO MOQ */}
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
                /* REQUISITO 2: BLOQUEO VISUAL CLARO SI EL CARRITO TIENE 1 A 9 UNIDADES */
                <div className="space-y-3">
                  <div className="p-4 bg-[#FAF6ED] border border-[#E6D7B8] text-left space-y-1.5">
                    <div className="flex items-center gap-2 text-[#846C44] font-semibold text-xs font-mono uppercase tracking-wider">
                      <AlertCircle className="w-4 h-4 shrink-0 text-[#846C44]" />
                      <span>Mínimo Mayorista Requerido: 10 u.</span>
                    </div>
                    <p className="text-xs text-[#5C5A55] leading-relaxed">
                      Tiene <strong className="text-[#0F0F0F] font-mono">{totalUnits} de 10 armazones</strong> seleccionados. Faltan <strong className="text-[#846C44] font-mono">{unidadesFaltantes} {unidadesFaltantes === 1 ? 'unidad' : 'unidades'}</strong> para habilitar el paso a Checkout B2B.
                    </p>
                  </div>

                  <button
                    disabled
                    className="w-full bg-[#FAF9F6] text-[#787670] font-medium py-3.5 px-6 cursor-not-allowed text-center uppercase tracking-[0.16em] text-[10px] border border-[#E6E2DD]"
                  >
                    Checkout Bloqueado ({totalUnits}/10 unidades)
                  </button>

                  <Link
                    href="/catalogo"
                    className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white py-4 px-6 text-center text-[11px] uppercase tracking-[0.2em] font-medium flex items-center justify-center gap-2 border border-[#0F0F0F] transition"
                  >
                    <span>Seguir Eligiendo en Catálogo</span>
                    <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                  </Link>
                </div>
              )}
            </div>

            {/* REQUISITO 3: DESCARGAR PRE-COTIZACIÓN B2B / ORDEN DE COMPRA (PDF) */}
            <div className="pt-4 border-t border-[#E6E2DD] space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  trackB2BEvent('download_b2b_quote', {
                    quote_number: quoteNumber,
                    total_units: totalUnits,
                    total_neto: montoNeto,
                    item_count: cart.length,
                  });
                  setShowQuoteModal(true);
                }}
                className="w-full bg-[#FAF9F6] hover:bg-[#F4F2ED] text-[#0F0F0F] font-medium py-3 px-4 transition text-[11px] uppercase tracking-[0.16em] border border-[#D5D0C8] hover:border-[#0F0F0F] flex items-center justify-center gap-2 text-center cursor-pointer shadow-2xs"
              >
                <FileDown className="w-4 h-4 text-[#9E8256]" />
                <span>Descargar Pre-Cotización B2B (PDF / Imprimir)</span>
              </button>

              <a
                href={generateWhatsAppOrderUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackB2BEvent('click_whatsapp_b2b', {
                    source: 'cart',
                  });
                }}
                className="w-full bg-[#FFFFFF] hover:bg-[#FAF9F6] text-[#0F0F0F] font-medium py-3 px-4 transition text-[10px] uppercase tracking-[0.16em] border border-[#E6E2DD] hover:border-[#0F0F0F] flex items-center justify-center gap-2 text-center"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                <span>Enviar Orden por WhatsApp B2B</span>
              </a>
            </div>

            {/* Pasarela y Medios de Pago */}
            <div className="pt-4 border-t border-[#E6E2DD] text-center space-y-2">
              <span className="text-[10px] text-[#787670] uppercase tracking-wider block">
                Transacción comercial mayorista protegida
              </span>
              <div className="inline-flex items-center gap-2 bg-[#FAF9F6] px-3.5 py-1.5 border border-[#E6E2DD] text-[10px] font-mono uppercase tracking-wider text-[#0F0F0F]">
                <span className="w-1.5 h-1.5 bg-[#9E8256]"></span>
                Factura Electrónica SII · Webpay / Transferencia Bancaria
              </div>
            </div>
          </div>

        </div>

        {/* LÍNEA DE TIEMPO VISUAL LOGÍSTICA */}
        <DeliveryTimeline />

      </div>

      {/* MODAL EJECUTIVO DE PRE-COTIZACIÓN B2B (VISTA PREVIA Y DESCARGA PDF / IMPRESIÓN) */}
      {showQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F0F0F]/70 backdrop-blur-xs animate-fade-in print:p-0 print:bg-white print:static">
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-10 relative space-y-8 shadow-2xl print:max-h-none print:border-none print:p-0 print:shadow-none">
            
            {/* Barra de Controles del Modal (Oculta al imprimir) */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E6E2DD] print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#9E8256]" />
                <h3 className="font-serif text-lg text-[#0F0F0F] font-normal">
                  Vista Previa de Pre-Cotización B2B
                </h3>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrintQuote}
                  className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] transition-colors border border-[#0F0F0F] cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#9E8256]" />
                  <span>Imprimir / Guardar como PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowQuoteModal(false)}
                  className="p-2 text-[#787670] hover:text-[#0F0F0F] transition cursor-pointer"
                  title="Cerrar vista previa"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* DOCUMENTO OFICIAL FORMAL (IMPRIMIBLE / DESCARGABLE) */}
            <div id="b2b-quotation-document" className="space-y-6 text-[#0F0F0F]">
              
              {/* Encabezado con Membrete Corporativo OPTICA MULTIFOCUS LIMITADA */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pb-6 border-b-2 border-[#0F0F0F]">
                <div>
                  <span className="font-serif text-3xl tracking-[0.22em] uppercase text-[#0F0F0F] block leading-tight font-normal">
                    OPTIHUB
                  </span>
                  <span className="text-[10px] tracking-[0.25em] text-[#5C5A55] uppercase font-sans block mt-0.5">
                    MAYORISTA ÓPTICO · IMPORTACIÓN DIRECTA USA
                  </span>
                  <div className="mt-3 text-xs text-[#5C5A55] space-y-0.5 font-mono">
                    <p><strong className="text-[#0F0F0F]">Razón Social:</strong> OPTICA MULTIFOCUS LIMITADA</p>
                    <p><strong className="text-[#0F0F0F]">RUT:</strong> 78.044.452-5</p>
                    <p><strong className="text-[#0F0F0F]">Giro:</strong> Venta al por mayor y distribución de productos ópticos</p>
                    <p><strong className="text-[#0F0F0F]">Email:</strong> contacto@optihub.cl | <strong className="text-[#0F0F0F]">WhatsApp:</strong> +56 9 8933 8537</p>
                  </div>
                </div>

                <div className="sm:text-right bg-[#FAF9F6] border border-[#E6E2DD] p-4 min-w-[240px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#9E8256] block mb-1">
                    ORDEN DE PRE-COTIZACIÓN
                  </span>
                  <p className="font-mono text-base font-bold text-[#0F0F0F]">{quoteNumber}</p>
                  <div className="mt-2 text-xs text-[#5C5A55] space-y-0.5 font-mono">
                    <p><strong>Fecha Emisión:</strong> {quoteDateStr}</p>
                    <p><strong>Validez:</strong> 5 días hábiles</p>
                    <p><strong>Régimen:</strong> Factura SII (CLP)</p>
                  </div>
                </div>
              </div>

              {/* Ficha de la Óptica Solicitante */}
              <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-4 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#9E8256] block mb-2 font-mono">
                  DATOS DE LA ÓPTICA / CLIENTE COMERCIAL
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-4">
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">Razón Social:</span>
                    <strong className="text-[#0F0F0F] text-xs">
                      {opticaData?.razon_social || opticaData?.nombre_optica || (user ? 'Óptica Registrada B2B' : 'Cotización Preliminar Óptica')}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">RUT Empresa:</span>
                    <strong className="text-[#0F0F0F] font-mono text-xs">
                      {opticaData?.rut_empresa || 'RUT en proceso de acreditación'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">Giro Comercial SII:</span>
                    <span className="text-[#0F0F0F] truncate block">
                      {opticaData?.giro_comercial || 'Comercialización de artículos ópticos'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">Contacto / Encargado:</span>
                    <span className="text-[#0F0F0F]">
                      {opticaData?.nombre_contacto || user?.email || 'Encargado de Adquisiciones'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">Teléfono / WhatsApp:</span>
                    <span className="text-[#0F0F0F] font-mono">
                      {opticaData?.telefono || '+56 9 (Registrado)'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#787670] block text-[10px] uppercase">Destino / Región:</span>
                    <span className="text-[#0F0F0F]">
                      {opticaData?.ciudad || 'Despacho Nacional Puerta a Puerta'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Tabla Formal de Armazones */}
              <div>
                <table className="w-full text-left border-collapse border border-[#E6E2DD] text-xs">
                  <thead>
                    <tr className="bg-[#F4F2ED] border-b border-[#E6E2DD] text-[10px] uppercase tracking-wider font-semibold text-[#0F0F0F]">
                      <th className="p-2.5 border-r border-[#E6E2DD] w-8 text-center font-mono">#</th>
                      <th className="p-2.5 border-r border-[#E6E2DD]">Marca & Modelo</th>
                      <th className="p-2.5 border-r border-[#E6E2DD]">SKU / Acabado</th>
                      <th className="p-2.5 border-r border-[#E6E2DD] text-center">Calibre</th>
                      <th className="p-2.5 border-r border-[#E6E2DD] text-center font-mono">Cant.</th>
                      <th className="p-2.5 border-r border-[#E6E2DD] text-right font-mono">Precio Unit. Neto</th>
                      <th className="p-2.5 text-right font-mono">Subtotal Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E6E2DD]">
                    {cart.map((item, index) => {
                      const itemSubtotal = (item.producto.precio_neto_clp || 0) * item.cantidad;
                      return (
                        <tr key={`quote-row-${item.producto.id_ext || index}`} className="hover:bg-[#FAF9F6]">
                          <td className="p-2.5 border-r border-[#E6E2DD] text-center font-mono text-[#787670]">
                            {index + 1}
                          </td>
                          <td className="p-2.5 border-r border-[#E6E2DD]">
                            <strong className="text-[#0F0F0F] block font-semibold">{item.producto.marca}</strong>
                            <span className="text-[#5C5A55]">{item.producto.modelo}</span>
                          </td>
                          <td className="p-2.5 border-r border-[#E6E2DD] font-mono text-[11px]">
                            <span className="text-[#0F0F0F] block">{item.producto.id_ext}</span>
                            <span className="text-[#787670]">{item.producto.color || `COL ${item.producto.codigo_color || 'Estándar'}`}</span>
                          </td>
                          <td className="p-2.5 border-r border-[#E6E2DD] text-center font-mono text-[11px] text-[#5C5A55]">
                            {item.producto.tamano || 'Estándar'}
                          </td>
                          <td className="p-2.5 border-r border-[#E6E2DD] text-center font-mono font-bold text-[#0F0F0F]">
                            {item.cantidad}
                          </td>
                          <td className="p-2.5 border-r border-[#E6E2DD] text-right font-mono text-[#0F0F0F]">
                            ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')} CLP
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-[#0F0F0F]">
                            ${itemSubtotal.toLocaleString('es-CL')} CLP
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Resumen Financiero Tributario */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-6 pt-2">
                {/* Condiciones Legales de Importación */}
                <div className="flex-1 bg-[#FAF9F6] border border-[#E6E2DD] p-4 text-[11px] text-[#5C5A55] space-y-1.5">
                  <h4 className="font-bold text-[#0F0F0F] uppercase tracking-wider text-[10px] font-mono">
                    CONDICIONES COMERCIALES Y LOGÍSTICAS B2B
                  </h4>
                  <ul className="list-disc pl-4 space-y-1">
                    <li><strong className="text-[#0F0F0F]">Plazo de entrega:</strong> 10 a 15 días hábiles desde Miami, EE. UU. hasta su óptica en Chile.</li>
                    <li><strong className="text-[#0F0F0F]">Modalidad DDP:</strong> Aranceles, flete internacional e internación aduanera resueltos por OPTICA MULTIFOCUS LIMITADA.</li>
                    <li><strong className="text-[#0F0F0F]">100% Auténticos:</strong> Incluye estuche rígido original, paño de microfibra y folletería de fábrica por unidad.</li>
                    <li><strong className="text-[#0F0F0F]">Factura Electrónica SII:</strong> Emisión en Pesos Chilenos (CLP) con IVA 100% deducible como crédito fiscal.</li>
                    <li><strong className="text-[#0F0F0F]">Venta Firme B2B:</strong> Control de calidad unitario en Chile previo al despacho. Daños de transporte o fallas de fábrica deben reportarse en un plazo fatal de 5 días hábiles vía WhatsApp (+56 9 8933 8537) con respaldo fotográfico/video. No aplica retracto ni devoluciones por rotación de stock.</li>
                  </ul>
                </div>

                {/* Totales Numéricos */}
                <div className="w-full sm:w-72 border border-[#E6E2DD] bg-[#FFFFFF] p-4 space-y-2 text-xs font-mono">
                  <div className="flex justify-between pb-1 border-b border-[#E6E2DD]">
                    <span className="text-[#5C5A55]">Total Unidades:</span>
                    <strong className="text-[#0F0F0F]">{totalUnits} armazones</strong>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-[#E6E2DD]">
                    <span className="text-[#5C5A55]">Subtotal Neto:</span>
                    <strong className="text-[#0F0F0F]">${montoNeto.toLocaleString('es-CL')} CLP</strong>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-[#E6E2DD]">
                    <span className="text-[#5C5A55]">IVA (19% Crédito Fiscal):</span>
                    <strong className="text-[#0F0F0F]">${montoIva.toLocaleString('es-CL')} CLP</strong>
                  </div>
                  <div className="flex justify-between pb-1 border-b border-[#E6E2DD] text-[11px]">
                    <span className="text-[#5C5A55]">Flete e Internación:</span>
                    <strong className="text-[#2D6A4F]">Incluido (DDP)</strong>
                  </div>
                  <div className="pt-2 flex justify-between items-baseline text-sm">
                    <span className="font-bold text-[#0F0F0F] uppercase">Total Factura SII:</span>
                    <span className="font-bold text-base text-[#0F0F0F]">
                      ${montoTotal.toLocaleString('es-CL')} CLP
                    </span>
                  </div>
                </div>
              </div>

              {/* Recuadro para Aprobación y Firma de la Óptica */}
              <div className="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-8 border-t border-[#E6E2DD] text-xs">
                <div className="border border-dashed border-[#D5D0C8] p-4 text-center space-y-8">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-mono">
                    Emitido por OPTICA MULTIFOCUS LIMITADA (Chile)
                  </span>
                  <div className="pt-6 border-t border-[#E6E2DD]">
                    <p className="font-semibold text-[#0F0F0F]">Departamento de Operaciones & Comercio Exterior</p>
                    <p className="text-[10px] text-[#787670]">contacto@optihub.cl</p>
                  </div>
                </div>

                <div className="border border-dashed border-[#D5D0C8] p-4 text-center space-y-8">
                  <span className="text-[10px] text-[#787670] uppercase tracking-wider block font-mono">
                    Aprobación de Compra · Representante Legal Óptica
                  </span>
                  <div className="pt-6 border-t border-[#E6E2DD]">
                    <p className="font-semibold text-[#0F0F0F]">Firma y Timbre Representante Legal</p>
                    <p className="text-[10px] text-[#787670]">Fecha: _____ / _____ / 2026</p>
                  </div>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Modal de Confirmación para Eliminar Artículo */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0F0F0F]/60 backdrop-blur-xs animate-fade-in print:hidden">
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
