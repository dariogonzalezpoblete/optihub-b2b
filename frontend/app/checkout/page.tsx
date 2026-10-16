'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isValidRUT, formatRUT } from '@/lib/utils/rut';
import { ensureCartSynced } from '@/lib/cartService';
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
  Lock,
  Check 
} from 'lucide-react';

const REGIONES_CHILE = [
  'Región Metropolitana de Santiago',
  'Región de Arica y Parinacota',
  'Región de Tarapacá',
  'Región de Antofagasta',
  'Región de Atacama',
  'Región de Coquimbo',
  'Región de Valparaíso',
  'Región del Libertador Gral. Bernardo O\'Higgins',
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
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const submittingRef = useRef(false);

  const { user, isLoggedIn, loading: authLoading } = useAuth();
  const cart = useCartStore((state) => state.cart);
  const setCart = useCartStore((state) => state.setCart);
  const cartId = useCartStore((state) => state.cartId);
  const setCartId = useCartStore((state) => state.setCartId);
  const setLastSyncedAt = useCartStore((state) => state.setLastSyncedAt);
  const setSyncStatus = useCartStore((state) => state.setSyncStatus);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);
  const getMontoIva = useCartStore((state) => state.getMontoIva);
  const getMontoTotal = useCartStore((state) => state.getMontoTotal);
  const isValidMOQ = useCartStore((state) => state.isValidMOQ);

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
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (mounted && !authLoading) {
      if (!isLoggedIn) {
        router.push('/login?redirect=/checkout');
        return;
      }

      // Fetch Perfil real B2B
      const fetchProfile = async () => {
        if (!user) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
          setFormData((prev) => ({
            ...prev,
            razon_social: data.business_name || prev.razon_social,
            rut: data.rut || prev.rut,
            contacto_nombre: data.first_name || prev.contacto_nombre,
            contacto_telefono: data.phone || prev.contacto_telefono,
            contacto_email: user.email || prev.contacto_email,
            direccion: data.billing_address || prev.direccion,
            comuna: data.commune || prev.comuna,
            region: data.region || prev.region,
          }));
        } else {
          setFormData(prev => ({ ...prev, contacto_email: user.email || '' }));
        }
      };
      
      fetchProfile();
    }
  }, [mounted, authLoading, isLoggedIn, router, user]);

  // Pre-sincronización de fondo si el carrito tiene productos y no tiene cartId
  useEffect(() => {
    if (mounted && user?.id && cart.length > 0 && !cartId) {
      ensureCartSynced(user.id, cart)
        .then((res) => {
          if (res.reconciledCart) {
            setCart(res.reconciledCart);
          }
          setCartId(res.cartId);
          setLastSyncedAt(res.updatedAt);
          setSyncStatus('synced');
        })
        .catch((err) => {
          console.warn('[Checkout] Background pre-sync aviso:', err);
        });
    }
  }, [mounted, user?.id, cart, cartId, setCart, setCartId, setLastSyncedAt, setSyncStatus]);

  if (!mounted || authLoading) return null;

  // Pantalla de carga mientras se navega hacia la pasarela segura de Mercado Pago.
  // Evita que aparezca el guardián de "Requisitos no cumplidos / Carrito vacío".
  if (isRedirecting) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-slate-950 px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 text-center max-w-md w-full">
          <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20">
            <CreditCard className="w-10 h-10 text-emerald-400 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Redirigiendo a Mercado Pago</h2>
          <p className="text-slate-400 mb-6 text-sm">
            Estamos conectando con la pasarela de pagos segura. Serás transferido en unos segundos...
          </p>
          <div className="flex justify-center items-center gap-2 text-xs font-semibold text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Transferencia segura SSL
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0 || !isValidMOQ()) {
    return (
      <div className="min-h-screen pt-24 pb-12 flex items-center justify-center bg-slate-950 px-4">
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 md:p-12 text-center max-w-md w-full">
          <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-rose-500/20">
            <AlertCircle className="w-10 h-10 text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Requisitos no cumplidos</h2>
          <p className="text-slate-400 mb-8">
            {cart.length === 0 
              ? 'Tu carrito está vacío.' 
              : 'El pedido mínimo mayorista (MOQ) es de 10 unidades.'}
          </p>
          <Link 
            href="/carrito"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-6 rounded-xl transition text-sm uppercase"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al Carrito
          </Link>
        </div>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    let value = e.target.value;
    
    // Auto-formatear RUT
    if (e.target.name === 'rut') {
      value = formatRUT(value);
    }
    
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || loading || isRedirecting) {
      return;
    }
    setErrorMsg('');
    
    // Validación de cliente B2B
    if (!isValidRUT(formData.rut)) {
      setErrorMsg('El RUT ingresado no es válido. Por favor verifica e intenta nuevamente.');
      return;
    }

    if (!acceptTerms) {
      setErrorMsg('Debes aceptar los Términos y Condiciones Comerciales B2B para continuar.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user?.id) {
        setErrorMsg('Debes iniciar sesión para completar la compra.');
        return;
      }

      // Sincronización bloqueante y confirmada del carrito antes del checkout
      let confirmedCartId = cartId;
      try {
        setSyncStatus('syncing');
        const syncResult = await ensureCartSynced(session.user.id, cart);
        confirmedCartId = syncResult.cartId;
        if (syncResult.reconciledCart) {
          setCart(syncResult.reconciledCart);
        }
        setCartId(syncResult.cartId);
        setLastSyncedAt(syncResult.updatedAt);
        setSyncStatus('synced');
      } catch (syncErr: unknown) {
        console.error('[Checkout] Error de sincronización obligatoria:', syncErr);
        setSyncStatus('error');
        const syncErrMsg = syncErr instanceof Error ? syncErr.message : '';
        setErrorMsg(
          syncErrMsg === 'OCC_PERSISTENT_CONFLICT'
            ? 'Detectamos cambios simultáneos en tu carrito. Por favor, revisa tus productos y vuelve a intentar.'
            : 'No se pudo sincronizar tu pedido con el servidor. Por favor, reintenta en unos instantes.'
        );
        return;
      }

      if (!confirmedCartId) {
        setErrorMsg('No se pudo obtener el identificador del carrito en el servidor. Reintenta la operación.');
        return;
      }

      const response = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          cart,
          cartId: confirmedCartId,
          billing: formData,
        }),
      });

      let data: { error?: string; initPoint?: string; orderId?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const rawServerError = typeof data?.error === 'string' ? data.error.trim() : '';
        const friendlyError =
          !rawServerError || rawServerError === 'Internal Server Error'
            ? 'No se pudo procesar la solicitud de pago en el servidor. Por favor intenta nuevamente en unos momentos.'
            : rawServerError;
        throw new Error(friendlyError);
      }

      if (data?.initPoint) {
        // Activar pantalla de redirección. Conservamos el carrito en Zustand y localStorage
        // para que no se pierdan productos si el pago se cancela, queda pendiente o falla.
        setIsRedirecting(true);
        if (typeof window !== 'undefined') {
          window.location.href = data.initPoint;
        }
        return;
      } else {
        // initPoint ausente: mostrar error pero mantener la orden identificable
        console.error('[Checkout] Preference creada sin initPoint', data);
        setErrorMsg('No se pudo obtener la URL de pago de Mercado Pago. Por favor contacte soporte.');
        if (data?.orderId) {
          router.push(`/mis-pedidos/${data.orderId}`);
        }
        return;
      }

    } catch (error: unknown) {
      setIsRedirecting(false);
      const errMsg = error instanceof Error ? error.message : '';
      setErrorMsg(errMsg || 'Error de conexión. Intenta nuevamente.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-20 bg-slate-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Cabecera Segura */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4 border-b border-slate-800 pb-8">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 tracking-tight">
              Checkout B2B
            </h1>
            <p className="text-slate-400 mt-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Tus datos están protegidos y encriptados.
            </p>
          </div>
          <Link href="/carrito" className="text-sm font-bold text-slate-400 hover:text-emerald-400 transition flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Modificar Carrito
          </Link>
        </div>

        {errorMsg && (
          <div className="mb-8 bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-rose-400 font-semibold">{errorMsg}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          
          {/* Columna Izquierda: Formulario B2B */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Facturación */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-400" />
                Datos de Facturación
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400">RUT Empresa (con guion)</label>
                  <input
                    type="text"
                    name="rut"
                    value={formData.rut}
                    onChange={handleChange}
                    required
                    placeholder="Ej: 76.123.456-K"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400">Razón Social</label>
                  <input
                    type="text"
                    name="razon_social"
                    value={formData.razon_social}
                    onChange={handleChange}
                    required
                    placeholder="Ej: Ópticas Visión SpA"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400">Giro Comercial</label>
                  <input
                    type="text"
                    name="giro"
                    value={formData.giro}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Contacto */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                Contacto del Encargado
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><Lock className="w-3 h-3"/> Nombre Completo</label>
                  <input
                    type="text"
                    name="contacto_nombre"
                    value={formData.contacto_nombre}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><Phone className="w-3 h-3"/> Teléfono B2B</label>
                  <input
                    type="tel"
                    name="contacto_telefono"
                    value={formData.contacto_telefono}
                    onChange={handleChange}
                    required
                    placeholder="+56 9 1234 5678"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><Mail className="w-3 h-3"/> Email B2B (Donde recibirás la confirmación)</label>
                  <input
                    type="email"
                    name="contacto_email"
                    value={formData.contacto_email}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
              </div>
            </div>

            {/* Despacho */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8">
              <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                Despacho y Bodega
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400">Región</label>
                  <select
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition appearance-none"
                  >
                    {REGIONES_CHILE.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-400">Comuna</label>
                  <input
                    type="text"
                    name="comuna"
                    value={formData.comuna}
                    onChange={handleChange}
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400 flex items-center gap-2"><MapPin className="w-3 h-3"/> Dirección Exacta</label>
                  <input
                    type="text"
                    name="direccion"
                    value={formData.direccion}
                    onChange={handleChange}
                    required
                    placeholder="Calle Principal 123, Local 4B"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition"
                  />
                </div>
                
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-400">Instrucciones Adicionales (Opcional)</label>
                  <textarea
                    name="instrucciones_entrega"
                    value={formData.instrucciones_entrega}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Horario de recepción, referencias, etc."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-4 py-3 text-white outline-none transition resize-none"
                  />
                </div>
              </div>
            </div>

          </div>
          
          {/* Columna Derecha: Resumen de Orden */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 sticky top-28">
              <h2 className="text-lg font-bold text-white mb-6">Resumen de Orden</h2>
              
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <span className="text-slate-400">Total Unidades</span>
                <span className="text-white font-bold">{getTotalUnits()} armazones</span>
              </div>
              
              <div className="py-4 space-y-4 border-b border-slate-800">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Subtotal Neto</span>
                  <span className="text-white font-semibold">${getMontoNeto().toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">IVA (19%)</span>
                  <span className="text-white font-semibold">${getMontoIva().toLocaleString('es-CL')}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Despacho Nacional</span>
                  <span className="text-emerald-400 font-bold">Por calcular</span>
                </div>
              </div>
              
              <div className="pt-4 pb-8">
                <div className="flex justify-between items-end">
                  <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">Total B2B</span>
                  <div className="text-right">
                    <p className="text-2xl md:text-3xl font-black text-white">
                      ${getMontoTotal().toLocaleString('es-CL')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-0.5">
                    <input 
                      type="checkbox" 
                      className="sr-only"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                    />
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors
                      ${acceptTerms ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-950 border-slate-700 group-hover:border-emerald-500'}
                    `}>
                      {acceptTerms && <Check className="w-3.5 h-3.5 text-slate-950" />}
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-medium leading-relaxed">
                    Confirmo que los datos ingresados son correctos, represento legalmente a la empresa y acepto las <button type="button" onClick={() => setShowTerms(true)} className="text-emerald-400 underline">Condiciones de Venta B2B</button>.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || !acceptTerms}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-4 px-6 rounded-xl transition-all flex justify-center items-center gap-2 group"
              >
                {loading ? (
                  <span className="animate-pulse">Sincronizando y procesando orden segura...</span>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    Proceder al Pago
                  </>
                )}
              </button>
              
              <div className="mt-6 flex flex-col items-center gap-2 text-xs text-slate-500 font-semibold text-center">
                <p className="flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-500/50" />
                  Transacción 100% segura. Verificación SSL.
                </p>
                <p>Las facturas se emiten según Ley de la República de Chile.</p>
              </div>
            </div>
          </div>
          
        </form>
      </div>

      {showTerms && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-white mb-6">Condiciones B2B</h2>
            <div className="space-y-4 text-sm text-slate-400 mb-8">
              <p>1. OptiHub opera estrictamente en modalidad de importación al por mayor (B2B).</p>
              <p>2. El tiempo estimado logístico no depende de OptiHub sino de los transportistas aéreos internacionales.</p>
              <p>3. Los pagos realizados se procesan server-side y el inventario solo se compromete transaccionalmente una vez confirmado.</p>
            </div>
            <button 
              onClick={() => setShowTerms(false)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-6 rounded-xl transition"
            >
              Cerrar y volver al checkout
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
