'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';
import { 
  Building2, 
  MapPin, 
  Phone, 
  Mail, 
  FileText, 
  ShieldCheck, 
  ArrowLeft, 
  CreditCard, 
  AlertCircle,
  Truck,
  Lock
, Check } from 'lucide-react';

const REGIONES_CHILE = [
  'Región Metropolitana de Santiago',
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región del Libertador Gral. Bernardo O’Higgins',
  'Región del Maule',
  'Región de Ñuble',
  'Región del Biobío',
  'Región de La Araucanía',
  'Región de Los Ríos',
  'Región de Los Lagos',
  'Región de Aysén del Gral. Carlos Ibáñez del Campo',
  'Región de Magallanes y de la Antártica Chilena',
];

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const { user, isLoggedIn, opticaData, loading: authLoading } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);
  const getMontoIva = useCartStore((state) => state.getMontoIva);
  const getMontoTotal = useCartStore((state) => state.getMontoTotal);
  const isValidMOQ = useCartStore((state) => state.isValidMOQ);
  const clearCart = useCartStore((state) => state.clearCart);

  // Formulario de facturación y despacho B2B
  const [formData, setFormData] = useState({
    razon_social: '',
    rut: '',
    giro: 'Comercialización de artículos ópticos',
    contacto_nombre: '',
    contacto_telefono: '',
    contacto_email: '',
    direccion: '',
    comuna: '',
    region: 'Región Metropolitana de Santiago',
    instrucciones_entrega: '',
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-llenar datos con el perfil de la óptica
  useEffect(() => {
    if (mounted && !authLoading) {
      if (!isLoggedIn) {
        router.push('/login?redirect=/checkout');
        return;
      }

      setFormData((prev) => ({
        ...prev,
        razon_social: opticaData?.nombre_optica || prev.razon_social,
        rut: opticaData?.rut_empresa || prev.rut,
        contacto_nombre: opticaData?.nombre_contacto || prev.contacto_nombre,
        contacto_telefono: opticaData?.telefono || prev.contacto_telefono,
        contacto_email: user?.email || prev.contacto_email,
        comuna: opticaData?.ciudad || prev.comuna,
      }));
    }
  }, [mounted, authLoading, isLoggedIn, opticaData, user, router]);

  if (!mounted || authLoading) {
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

  if (cart.length === 0 || !isValidMOQ()) {
    return (
      <div className="min-h-[80vh] bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl">
          <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white">Tu pedido no cumple los requisitos</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            Para continuar al checkout debes tener al menos <span className="text-emerald-400 font-bold">10 unidades mayoristas</span> en tu carrito. Actualmente tienes {totalUnits}.
          </p>
          <div className="mt-6">
            <Link
              href="/carrito"
              className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-6 rounded-xl transition text-sm uppercase"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver al Carrito
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const response = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart,
          billing: formData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al conectar con la pasarela de pago');
      }

      // Vaciar carrito tras iniciar el proceso
      clearCart();

      // Redirigir al checkout seguro de Mercado Pago (o simulación en modo dev)
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error('No se recibió la URL de pago de Mercado Pago');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Ocurrió un error al procesar la orden');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24">
      {/* Encabezado */}
      <div className="border-b border-slate-800/80 bg-slate-900/40 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
              <Link href="/carrito" className="hover:text-emerald-400 transition flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" />
                Volver al Carrito
              </Link>
              <span>/</span>
              <span className="text-emerald-400 font-medium">Facturación y Pago B2B</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight uppercase">
              Checkout Mayorista OptiHub
            </h1>
          </div>

          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1.5 rounded-xl text-emerald-400 text-xs font-bold">
            <Lock className="w-4 h-4" />
            Transacción B2B Segura 256-bit SSL
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* COLUMNA IZQUIERDA: FORMULARIO B2B */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* SECCIÓN 1: DATOS DE FACTURACIÓN ELECTRÓNICA */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Datos de Facturación Electrónica (SII)</h2>
                  <p className="text-xs text-slate-400">Emisión de factura con IVA 19% recuperable para tu empresa</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Razón Social / Nombre de la Óptica *
                  </label>
                  <input
                    type="text"
                    required
                    name="razon_social"
                    value={formData.razon_social}
                    onChange={handleChange}
                    placeholder="Ej: Óptica y Contactología Visión SpA"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    RUT de la Empresa *
                  </label>
                  <input
                    type="text"
                    required
                    name="rut"
                    value={formData.rut}
                    onChange={handleChange}
                    placeholder="Ej: 76.543.210-K"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Giro Comercial *
                  </label>
                  <input
                    type="text"
                    required
                    name="giro"
                    value={formData.giro}
                    onChange={handleChange}
                    placeholder="Ej: Comercialización de artículos ópticos"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: DIRECCIÓN DE DESPACHO EN CHILE */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Dirección de Despacho Mayorista</h2>
                  <p className="text-xs text-slate-400">Entrega directa en local u óptica (10 a 15 días hábiles)</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Región *
                    </label>
                    <select
                      name="region"
                      value={formData.region}
                      onChange={handleChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                    >
                      {REGIONES_CHILE.map((reg) => (
                        <option key={reg} value={reg} className="bg-slate-900 text-white">
                          {reg}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                      Comuna / Ciudad *
                    </label>
                    <input
                      type="text"
                      required
                      name="comuna"
                      value={formData.comuna}
                      onChange={handleChange}
                      placeholder="Ej: Providencia, Santiago"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Dirección (Calle, Número, Oficina o Local) *
                  </label>
                  <input
                    type="text"
                    required
                    name="direccion"
                    value={formData.direccion}
                    onChange={handleChange}
                    placeholder="Ej: Av. Nueva Providencia 1881, Oficina 502"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Instrucciones Especiales de Entrega (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    name="instrucciones_entrega"
                    value={formData.instrucciones_entrega}
                    onChange={handleChange}
                    placeholder="Ej: Horario de atención óptica de 10:00 a 19:00 hrs. Dejar en recepción."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition resize-none"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN 3: CONTACTO DE RECEPCIÓN */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-800">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Persona de Contacto para Recepción</h2>
                  <p className="text-xs text-slate-400">Coordinación telefónica y notificación de seguimiento</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    name="contacto_nombre"
                    value={formData.contacto_nombre}
                    onChange={handleChange}
                    placeholder="Ej: María José Peña"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    name="contacto_telefono"
                    value={formData.contacto_telefono}
                    onChange={handleChange}
                    placeholder="+56 9 1234 5678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Email de Confirmación *
                  </label>
                  <input
                    type="email"
                    required
                    name="contacto_email"
                    value={formData.contacto_email}
                    onChange={handleChange}
                    placeholder="compras@tuoptica.cl"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* COLUMNA DERECHA: RESUMEN Y BOTÓN MERCADO PAGO */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl sticky top-28">
            <h2 className="text-xl font-black text-white uppercase tracking-tight pb-4 border-b border-slate-800">
              Resumen del Pedido
            </h2>

            {/* Miniatura de modelos incluidos */}
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1 divide-y divide-slate-800/60 scrollbar-thin">
              {cart.map((item) => (
                <div key={item.producto.id_ext} className="pt-2 first:pt-0 flex justify-between items-center text-xs">
                  <div className="truncate pr-2">
                    <span className="font-bold text-white">{item.cantidad}x </span>
                    <span className="text-slate-300">{item.producto.marca} {item.producto.modelo}</span>
                  </div>
                  <span className="font-mono text-slate-400 flex-shrink-0">
                    ${((item.producto.precio_neto_clp || 0) * item.cantidad).toLocaleString('es-CL')}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-3 text-sm pt-4 border-t border-slate-800">
              <div className="flex justify-between items-center text-slate-300">
                <span>Total Armazones:</span>
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

            
            {/* TERMINOS Y CONDICIONES */}
            <div className="pt-2 pb-2">
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className="relative flex items-center justify-center mt-0.5">
                  <input
                    type="checkbox"
                    required
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="peer sr-only"
                  />
                  <div className="w-5 h-5 border-2 border-slate-600 rounded bg-slate-900 peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all"></div>
                  <Check className="absolute w-3.5 h-3.5 text-slate-950 opacity-0 peer-checked:opacity-100 transition-opacity" />
                </div>
                <div className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                  Acepto los <button type="button" onClick={() => setShowTerms(true)} className="text-emerald-400 hover:underline font-bold">términos y condiciones de importación directa</button> (plazos de 10 a 15 días hábiles y valores más IVA).
                </div>
              </label>
            </div>

            {/* BOTÓN MERCADO PAGO */}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !acceptTerms}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-4 px-6 rounded-2xl transition duration-200 shadow-lg shadow-emerald-500/20 text-center flex items-center justify-center gap-2 uppercase tracking-wider text-sm"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                    <span>Conectando con Mercado Pago...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>Pagar con Mercado Pago</span>
                  </>
                )}
              </button>
            </div>

            {/* Medios de Pago Disponibles */}
            <div className="pt-4 border-t border-slate-800 text-center space-y-2">
              <span className="text-[11px] text-slate-400 block">
                Pasarela Oficial Mercado Pago Chile
              </span>
              <p className="text-[11px] text-slate-500">
                Acepta Webpay Plus, Redcompra, Tarjetas de Débito, y Tarjetas de Crédito con cuotas.
              </p>
            </div>
          </div>

        </form>
      </div>

      {/* MODAL TÉRMINOS Y CONDICIONES */}
      {showTerms && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setShowTerms(false)}></div>
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Términos de Importación Directa</h3>
              <button type="button" onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-white">
                Cerrar
              </button>
            </div>
            <div className="overflow-y-auto custom-scrollbar flex-grow text-sm text-slate-300 space-y-4 pr-2">
              <p><strong>1. Tiempos de Entrega:</strong> Al ser productos de importación directa desde nuestra bodega en Miami, EE.UU., el plazo de entrega estimado es de 10 a 15 días hábiles desde la confirmación del pago.</p>
              <p><strong>2. Valores e Impuestos:</strong> Los valores expresados en la plataforma corresponden al precio neto. El IVA (19%) ha sido calculado y agregado en el resumen final de la compra para la emisión de su Factura Electrónica.</p>
              <p><strong>3. Políticas de Garantía:</strong> Todos los armazones cuentan con garantía por defectos de fábrica válida por 3 meses. Los reclamos deben estar respaldados por evidencia fotográfica.</p>
              <p><strong>4. Consolidación de Pedidos:</strong> Si el pedido supera los volúmenes estándar o incluye marcas que requieren verificación aduanera especial, OptiHub se reserva el derecho de contactar a la óptica para coordinar la mejor vía de despacho.</p>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-800 text-right">
              <button type="button" onClick={() => setShowTerms(false)} className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-6 py-2.5 rounded-xl transition">
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
