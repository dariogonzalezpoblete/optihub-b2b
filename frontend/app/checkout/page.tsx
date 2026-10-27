'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCartStore, getProductCartKey } from '@/store/useCartStore';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { isValidRUT, formatRUT } from '@/lib/utils/rut';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import { ensureCartSynced } from '@/lib/cartService';
import { getMercadoPagoPublicKey, isMercadoPagoSandboxMode } from '@/lib/mercadopago';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  FileText,
  ShieldCheck,
  ArrowLeft,
  ArrowRight,
  CreditCard,
  AlertCircle,
  Truck,
  Lock,
  Check,
  CheckCircle2,
  Package,
  Sparkles,
  X,
  UserCheck,
} from 'lucide-react';

export default function CheckoutPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const submittingRef = useRef(false);

  const mpPublicKey = getMercadoPagoPublicKey();
  const isSandboxFrontend = isMercadoPagoSandboxMode(undefined, mpPublicKey);

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

      const fetchProfile = async () => {
        if (!user) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
          setFormData((prev) => ({
            ...prev,
            razon_social: data.business_name || prev.razon_social,
            rut: data.rut ? formatRUT(data.rut) : prev.rut,
            contacto_nombre: data.first_name || prev.contacto_nombre,
            contacto_telefono: data.phone || prev.contacto_telefono,
            contacto_email: user.email || prev.contacto_email,
            direccion: data.billing_address || prev.direccion,
            comuna: data.commune || prev.comuna,
            region: data.region || prev.region,
          }));
        } else {
          setFormData((prev) => ({ ...prev, contacto_email: user.email || '' }));
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

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#B89768] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pantalla de transición mientras se navega hacia la pasarela segura de Mercado Pago.
  if (isRedirecting) {
    return (
      <div className="min-h-screen pt-20 pb-16 flex items-center justify-center bg-[#F7F6F2] px-4">
        <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-8 sm:p-12 text-center max-w-md w-full shadow-sm">
          <div className="w-16 h-16 bg-[#F7F3EB] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#B89768]/30">
            <CreditCard className="w-8 h-8 text-[#9E7D4F] animate-pulse" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9E7D4F] mb-2">
            Pasarela Mayorista B2B
          </span>
          <h2 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] mb-3">
            Conectando con Mercado Pago
          </h2>
          <p className="text-[#575551] mb-8 text-xs sm:text-sm leading-relaxed">
            Estamos preparando su sesión de pago encriptada y reservando las unidades de su orden mayorista. Será transferido automáticamente en unos instantes...
          </p>
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#FAF9F6] border border-[#E5E4DF] text-[11px] font-mono font-medium text-[#111111]">
            <span className="w-2 h-2 rounded-full bg-[#B89768] animate-ping" />
            Conexión SSL Verificada • {isSandboxFrontend ? 'Entorno Sandbox TEST' : 'Producción'}
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0 || !isValidMOQ()) {
    return (
      <div className="min-h-[80vh] bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-8 sm:p-10 text-center shadow-sm">
          <div className="w-16 h-16 bg-[#FAF9F6] text-[#B89768] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#E5E4DF]">
            <AlertCircle className="w-8 h-8 stroke-[1.6]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B89768] mb-2">
            Validación Mayorista B2B
          </span>
          <h2 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] mb-2">
            Requisitos no cumplidos
          </h2>
          <p className="text-[#575551] text-xs sm:text-sm mb-8 leading-relaxed">
            {cart.length === 0
              ? 'Su carro mayorista se encuentra vacío actuellement.'
              : 'El pedido mínimo mayorista (MOQ) requerido para emitir factura electrónica es de 10 unidades combinables.'}
          </p>
          <Link
            href="/carrito"
            className="w-full inline-flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest"
          >
            <ArrowLeft className="w-4 h-4 text-[#B89768]" />
            Volver al Carro Mayorista
          </Link>
        </div>
      </div>
    );
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    let value = e.target.value;
    if (e.target.name === 'rut') {
      value = formatRUT(value);
    }
    if (e.target.name === 'region') {
      const newRegion = value;
      const validCommunes = getCommunesForRegion(newRegion);
      setFormData((prev) => ({
        ...prev,
        region: newRegion,
        comuna: validCommunes.includes(prev.comuna) ? prev.comuna : '',
      }));
      return;
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

    if (!isValidRUT(formData.rut)) {
      setErrorMsg('El RUT empresarial ingresado no es válido. Verifique el dígito verificador e intente nuevamente.');
      return;
    }

    if (!formData.region || !formData.comuna) {
      setErrorMsg('Por favor seleccione la región y comuna oficial de despacho.');
      return;
    }

    if (!acceptTerms) {
      setErrorMsg('Debe aceptar las Condiciones Comerciales Mayoristas B2B para proceder al pago.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        setErrorMsg('Su sesión ha expirado. Inicie sesión nuevamente para completar la orden.');
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
            ? 'Detectamos cambios simultáneos en su carro mayorista. Revise las cantidades y vuelva a intentar.'
            : 'No se pudo sincronizar su pedido con el servidor. Por favor, reintente en unos instantes.'
        );
        return;
      }

      if (!confirmedCartId) {
        setErrorMsg('No se pudo obtener el identificador del carrito en el servidor. Reintente la operación.');
        return;
      }

      const response = await fetch('/api/mercadopago/create-preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          cart,
          cartId: confirmedCartId,
          billing: formData,
        }),
      });

      let data: {
        error?: string;
        details?: string;
        initPoint?: string;
        sandboxInitPoint?: string;
        orderId?: string;
        sandboxMode?: boolean;
      } | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const rawServerError = typeof data?.error === 'string' ? data.error.trim() : '';
        const rawDetails = typeof data?.details === 'string' ? data.details.trim() : '';
        let friendlyError = rawServerError;

        if (!friendlyError || friendlyError === 'Internal Server Error') {
          friendlyError =
            'No se pudo procesar la solicitud de pago en el servidor. Por favor intente nuevamente en unos momentos.';
        } else if (rawDetails && !friendlyError.includes(rawDetails)) {
          friendlyError = `${friendlyError}: ${rawDetails}`;
        }

        console.error('[Checkout] Error devuelto por la pasarela de pagos:', {
          status: response.status,
          error: rawServerError,
          details: rawDetails,
          data,
        });

        throw new Error(friendlyError);
      }

      const targetRedirectUrl = data?.initPoint;
      if (targetRedirectUrl) {
        // Conservamos el carrito en Zustand y localStorage hasta que /checkout/resultado
        // verifique el pago aprobado en Supabase.
        setIsRedirecting(true);
        if (typeof window !== 'undefined') {
          window.location.href = targetRedirectUrl;
        }
        return;
      } else {
        console.error('[Checkout] Preference creada sin initPoint', data);
        setErrorMsg('No se pudo obtener la URL de pago de Mercado Pago. Por favor contacte a soporte.');
        if (data?.orderId) {
          router.push(`/mis-pedidos/${data.orderId}`);
        }
        return;
      }
    } catch (error: unknown) {
      setIsRedirecting(false);
      const errMsg = error instanceof Error ? error.message : '';
      setErrorMsg(errMsg || 'Error de conexión con la pasarela. Intente nuevamente.');
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const totalUnits = getTotalUnits();
  const montoNeto = getMontoNeto();
  const montoIva = getMontoIva();
  const montoTotal = getMontoTotal();
  const rutValido = formData.rut.trim().length > 3 && isValidRUT(formData.rut);

  return (
    <main className="min-h-screen bg-[#F7F6F2] text-[#111111] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* CABECERA EDITORIAL Y STEPPER B2B */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 border-b border-[#E5E4DF] pb-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-[#82807A] mb-2">
              <Link href="/" className="hover:text-[#111111] transition">
                Inicio
              </Link>
              <span>/</span>
              <Link href="/carrito" className="hover:text-[#111111] transition">
                Carro Mayorista B2B
              </Link>
              <span>/</span>
              <span className="text-[#111111] font-medium">Facturación y Pago</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">
                Checkout &amp; Facturación B2B
              </h1>
              {isSandboxFrontend && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#F7F3EB] text-[#9E7D4F] border border-[#B89768]/40">
                  <Sparkles className="w-3.5 h-3.5" />
                  Modo Sandbox (TEST-)
                </span>
              )}
            </div>
            <p className="text-[#575551] text-xs sm:text-sm mt-1.5 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#9E7D4F] shrink-0" />
              Emisión de Factura Electrónica SII • Pago encriptado vía Mercado Pago Checkout Pro
            </p>
          </div>

          {/* Indicador de Etapas B2B */}
          <div className="flex items-center gap-2 sm:gap-3 text-xs bg-[#FFFFFF] border border-[#E5E4DF] rounded-xl px-4 py-2.5 shadow-sm">
            <Link
              href="/carrito"
              className="flex items-center gap-2 text-[#575551] hover:text-[#111111] transition"
            >
              <span className="w-5 h-5 rounded-full bg-[#F7F3EB] border border-[#B89768]/40 text-[#9E7D4F] flex items-center justify-center font-mono text-[10px] font-bold">
                ✓
              </span>
              <span className="hidden sm:inline font-medium">1. Carro ({totalUnits} un.)</span>
            </Link>
            <span className="text-[#E5E4DF]">/</span>
            <div className="flex items-center gap-2 text-[#111111] font-semibold">
              <span className="w-5 h-5 rounded-full bg-[#111111] text-[#FFFFFF] flex items-center justify-center font-mono text-[10px] font-bold">
                2
              </span>
              <span>2. Datos Tributarios</span>
            </div>
            <span className="text-[#E5E4DF]">/</span>
            <div className="flex items-center gap-2 text-[#82807A]">
              <span className="w-5 h-5 rounded-full bg-[#FAF9F6] border border-[#E5E4DF] text-[#82807A] flex items-center justify-center font-mono text-[10px]">
                3
              </span>
              <span className="hidden sm:inline">3. Pago Seguro</span>
            </div>
          </div>
        </div>

        {/* ALERTA DE ERROR */}
        {errorMsg && (
          <div className="bg-red-50/90 border border-red-200 rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-red-900">
                  Verificación Requerida
                </h3>
                <p className="text-xs sm:text-sm text-red-800 mt-1 leading-relaxed">{errorMsg}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-red-700 hover:text-red-950 p-1 transition"
              aria-label="Cerrar alerta"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* COLUMNA IZQUIERDA: FORMULARIO TRIBUTARIO Y LOGÍSTICO (7 COLUMNAS) */}
          <div className="lg:col-span-7 space-y-6">
            {/* SECCIÓN 1: DATOS TRIBUTARIOS DE FACTURACIÓN (SII) */}
            <section className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-[#E5E4DF] bg-[#FAF9F6] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F7F3EB] border border-[#B89768]/30 flex items-center justify-center text-[#9E7D4F]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#9E7D4F]">
                      Sección 01 • Documento Tributario Electrónico
                    </span>
                    <h2 className="font-editorial font-serif text-lg sm:text-xl font-semibold text-[#111111]">
                      Datos de Facturación SII
                    </h2>
                  </div>
                </div>
                {rutValido && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    RUT Verificado
                  </span>
                )}
              </div>

              <div className="p-6 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    RUT Empresa / Óptica <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <input
                    type="text"
                    name="rut"
                    value={formData.rut}
                    onChange={handleChange}
                    required
                    placeholder="Ej: 76.123.456-K"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm font-mono text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                  />
                  <p className="text-[11px] text-[#82807A]">
                    Formato automático con puntos y guion verificador.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Razón Social <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <input
                    type="text"
                    name="razon_social"
                    value={formData.razon_social}
                    onChange={handleChange}
                    required
                    placeholder="Ej: Sociedad Óptica Visión SpA"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                  />
                  <p className="text-[11px] text-[#82807A]">
                    Nombre legal registrado ante el SII.
                  </p>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Giro Comercial <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <input
                    type="text"
                    name="giro"
                    value={formData.giro}
                    onChange={handleChange}
                    required
                    placeholder="Comercialización de artículos ópticos y médicos"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                  />
                </div>
              </div>
            </section>

            {/* SECCIÓN 2: RESPONSABLE DE ADQUISICIONES B2B */}
            <section className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-[#E5E4DF] bg-[#FAF9F6] flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F7F3EB] border border-[#B89768]/30 flex items-center justify-center text-[#9E7D4F]">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#9E7D4F]">
                    Sección 02 • Notificaciones y DTE
                  </span>
                  <h2 className="font-editorial font-serif text-lg sm:text-xl font-semibold text-[#111111]">
                    Contacto del Responsable de Compras
                  </h2>
                </div>
              </div>

              <div className="p-6 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Nombre Completo <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="contacto_nombre"
                      value={formData.contacto_nombre}
                      onChange={handleChange}
                      required
                      placeholder="Nombre y Apellido"
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Teléfono Directo / WhatsApp <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      name="contacto_telefono"
                      value={formData.contacto_telefono}
                      onChange={handleChange}
                      required
                      placeholder="+56 9 1234 5678"
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl pl-10 pr-4 py-3 text-sm font-mono text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Correo Corporativo de Confirmación y Facturación <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      name="contacto_email"
                      value={formData.contacto_email}
                      onChange={handleChange}
                      required
                      placeholder="compras@suoptica.cl"
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl pl-10 pr-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                    />
                  </div>
                  <p className="text-[11px] text-[#82807A]">
                    Recibirá el comprobante mayorista, tracking de importación y copia del DTE en esta casilla.
                  </p>
                </div>
              </div>
            </section>

            {/* SECCIÓN 3: LOGÍSTICA Y DIRECCIÓN DE DESPACHO */}
            <section className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-6 py-5 border-b border-[#E5E4DF] bg-[#FAF9F6] flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F7F3EB] border border-[#B89768]/30 flex items-center justify-center text-[#9E7D4F]">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#9E7D4F]">
                    Sección 03 • Recepción en Sucursal o Bodega
                  </span>
                  <h2 className="font-editorial font-serif text-lg sm:text-xl font-semibold text-[#111111]">
                    Logística y Dirección de Despacho
                  </h2>
                </div>
              </div>

              <div className="p-6 sm:p-7 grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Región <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <select
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    required
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm text-[#111111] outline-none transition"
                  >
                    {REGIONES_CHILE.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Comuna <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <select
                    name="comuna"
                    value={formData.comuna}
                    onChange={handleChange}
                    required
                    disabled={!formData.region}
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] disabled:bg-[#F2F1EC] disabled:text-[#A8A6A0] disabled:cursor-not-allowed rounded-xl px-4 py-3 text-sm text-[#111111] outline-none transition"
                  >
                    <option value="">
                      {formData.region ? 'Seleccione una comuna...' : 'Primero seleccione región'}
                    </option>
                    {getCommunesForRegion(formData.region).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Dirección Exacta de Entrega <span className="text-[#9E7D4F]">*</span>
                  </label>
                  <div className="relative">
                    <MapPin className="w-4 h-4 text-[#82807A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      name="direccion"
                      value={formData.direccion}
                      onChange={handleChange}
                      required
                      placeholder="Av. Nueva Providencia 1881, Local 104 / Oficina 502"
                      className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl pl-10 pr-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#575551]">
                    Instrucciones de Recepción en Óptica (Opcional)
                  </label>
                  <textarea
                    name="instrucciones_entrega"
                    value={formData.instrucciones_entrega}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Horario de bodega, nombre de encargado de recepción o indicaciones de acceso..."
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] focus:bg-[#FFFFFF] focus:border-[#111111] rounded-xl px-4 py-3 text-sm text-[#111111] placeholder:text-[#82807A]/60 outline-none transition resize-none"
                  />
                </div>
              </div>
            </section>
          </div>

          {/* COLUMNA DERECHA: RESUMEN DE ORDEN Y PAGO MERCADO PAGO (5 COLUMNAS) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24 space-y-6">
            <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-7 shadow-sm space-y-6">
              <div className="border-b border-[#E5E4DF] pb-4 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B89768] mb-1">
                    Liquidación Mayorista
                  </span>
                  <h2 className="font-editorial font-serif text-2xl font-semibold text-[#111111]">
                    Resumen de su Pedido
                  </h2>
                </div>
                <Link
                  href="/carrito"
                  className="text-xs font-medium text-[#575551] hover:text-[#111111] underline underline-offset-4 transition"
                >
                  Editar carro
                </Link>
              </div>

              {/* PREVIEW DE ARMAZONES EN LA ORDEN */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-[#575551]">
                  <span className="font-semibold uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-[#9E7D4F]" />
                    Detalle ({cart.length} {cart.length === 1 ? 'referencia' : 'referencias'})
                  </span>
                  <span className="font-mono font-semibold text-[#111111]">
                    {totalUnits} armazones
                  </span>
                </div>

                <div className="max-h-56 overflow-y-auto pr-1 space-y-2.5 divide-y divide-[#E5E4DF] border border-[#E5E4DF] rounded-xl bg-[#FAF9F6] p-3">
                  {cart.map((item) => {
                    const key = getProductCartKey(item.producto);
                    const lineNet = (item.producto.precio_neto_clp || 0) * item.cantidad;
                    return (
                      <div key={key} className="pt-2.5 first:pt-0 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg bg-[#FFFFFF] border border-[#E5E4DF] p-1 flex items-center justify-center shrink-0">
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
                          <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9E7D4F] truncate">
                              {item.producto.marca}
                            </p>
                            <p className="text-xs font-semibold text-[#111111] truncate">
                              {item.producto.modelo}
                            </p>
                            <p className="text-[11px] font-mono text-[#82807A]">
                              {item.cantidad} un. × ${(item.producto.precio_neto_clp || 0).toLocaleString('es-CL')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0 font-mono text-xs font-semibold text-[#111111]">
                          ${lineNet.toLocaleString('es-CL')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DESGLOSE FINANCIERO */}
              <div className="space-y-3 text-sm border-b border-[#E5E4DF] pb-5">
                <div className="flex justify-between text-[#575551]">
                  <span>Subtotal Neto Mayorista</span>
                  <span className="font-mono text-[#111111] font-medium">
                    ${montoNeto.toLocaleString('es-CL')} CLP
                  </span>
                </div>
                <div className="flex justify-between text-[#575551]">
                  <span>IVA (19% Factura Electrónica)</span>
                  <span className="font-mono text-[#111111] font-medium">
                    ${montoIva.toLocaleString('es-CL')} CLP
                  </span>
                </div>
                <div className="flex justify-between text-[#575551] text-xs pt-1">
                  <span>Logística e Importación B2B</span>
                  <span className="text-[#9E7D4F] font-semibold">Consolidación Asegurada</span>
                </div>
              </div>

              {/* TOTAL A FACTURAR */}
              <div className="flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-bold text-[#111111] uppercase tracking-wider block">
                    Total a Facturar
                  </span>
                  <span className="text-[11px] text-[#82807A]">IVA 19% incluido • Moneda CLP</span>
                </div>
                <div className="text-right font-mono">
                  <span className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight">
                    ${montoTotal.toLocaleString('es-CL')}
                  </span>
                  <span className="block text-[10px] text-[#82807A] uppercase">Pesos Chilenos</span>
                </div>
              </div>

              {/* TARJETA DE PASARELA MERCADO PAGO */}
              <div className="bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-[#9E7D4F]" />
                    <span className="text-xs font-semibold text-[#111111]">
                      Mercado Pago Checkout Pro
                    </span>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded bg-[#F7F3EB] text-[#9E7D4F] border border-[#B89768]/30">
                    {isSandboxFrontend ? 'Sandbox TEST' : ' Encriptación 256-bit'}
                  </span>
                </div>
                <p className="text-[11px] text-[#575551] leading-relaxed">
                  Acepte pagos corporativos con Tarjetas de Crédito (hasta 12 cuotas), Débito Redcompra, Prepago o saldo Mercado Pago con acreditación instantánea.
                </p>
              </div>

              {/* ACEPTACIÓN DE CONDICIONES COMERCIALES */}
              <div className="pt-1">
                <label className="flex items-start gap-3 cursor-pointer group select-none">
                  <div className="relative flex items-center justify-center mt-0.5">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                    />
                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                        acceptTerms
                          ? 'bg-[#111111] border-[#111111]'
                          : 'bg-[#FAF9F6] border-[#E5E4DF] group-hover:border-[#B89768]'
                      }`}
                    >
                      {acceptTerms && <Check className="w-3.5 h-3.5 text-[#FFFFFF]" />}
                    </div>
                  </div>
                  <span className="text-xs text-[#575551] leading-relaxed">
                    Declaro que los datos tributarios informados son fidedignos, represento a la razón social indicada y acepto los{' '}
                    <button
                      type="button"
                      onClick={() => setShowTerms(true)}
                      className="text-[#111111] font-semibold underline decoration-[#B89768] underline-offset-2 hover:text-[#9E7D4F] transition"
                    >
                      Términos y Condiciones Mayoristas B2B
                    </button>
                    .
                  </span>
                </label>
              </div>

              {/* BOTÓN PRINCIPAL DE PAGO */}
              <button
                type="submit"
                disabled={loading || !acceptTerms}
                className={`w-full py-4 px-6 rounded-xl font-semibold text-xs uppercase tracking-widest transition flex items-center justify-center gap-2.5 shadow-sm ${
                  loading || !acceptTerms
                    ? 'bg-[#E5E4DF] text-[#82807A] cursor-not-allowed'
                    : 'bg-[#111111] hover:bg-[#222222] text-[#FFFFFF]'
                }`}
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#B89768] border-t-transparent rounded-full animate-spin" />
                    <span>Sincronizando Orden y Preferencia...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 text-[#B89768]" />
                    <span>Pagar con Mercado Pago</span>
                    <ArrowRight className="w-4 h-4 text-[#B89768]" />
                  </>
                )}
              </button>

              {/* SELLOS DE CONFIANZA */}
              <div className="pt-2 border-t border-[#E5E4DF] space-y-2 text-[11px] text-[#575551]">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#B89768] shrink-0" />
                  <span>Reserva de stock atómica y conciliación automática en servidor.</span>
                </div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#B89768] shrink-0" />
                  <span>Factura Electrónica afecta a IVA emitida según normativa SII Chile.</span>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* MODAL DE CONDICIONES B2B */}
      {showTerms && (
        <div
          className="fixed inset-0 bg-[#111111]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          onClick={() => setShowTerms(false)}
        >
          <div
            className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-8 max-w-xl w-full max-h-[82vh] overflow-y-auto shadow-xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E4DF] pb-4">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#B89768] mb-1">
                  Marco Regulatorio Mayorista
                </span>
                <h2 className="font-editorial font-serif text-2xl font-semibold text-[#111111]">
                  Condiciones Comerciales B2B
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowTerms(false)}
                className="text-[#82807A] hover:text-[#111111] p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs sm:text-sm text-[#575551] leading-relaxed">
              <p>
                <strong className="text-[#111111]">1. Modalidad Mayorista (MOQ):</strong> OptiHub opera exclusivamente en modalidad de distribución mayorista B2B para ópticas y clínicas oftalmológicas establecidas, con un mínimo de compra de 10 unidades por orden.
              </p>
              <p>
                <strong className="text-[#111111]">2. Confirmación y Descuento de Stock:</strong> Los pagos se procesan mediante Mercado Pago Checkout Pro. El inventario se descuenta de forma transaccional una vez acreditado el pago en nuestros servidores.
              </p>
              <p>
                <strong className="text-[#111111]">3. Plazos de Importación y Despacho:</strong> Las órdenes pasan a consolidación internacional e internación aduanera tras la aprobación del pago, con un plazo estimado de entrega de 10 a 15 días hábiles en su óptica.
              </p>
              <p>
                <strong className="text-[#111111]">4. Facturación Electrónica SII:</strong> El Documento Tributario Electrónico (DTE) se emite exclusivamente al RUT y Razón Social informados en este formulario.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setAcceptTerms(true);
                  setShowTerms(false);
                }}
                className="w-full bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest"
              >
                Aceptar Condiciones y Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
