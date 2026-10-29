'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { sanitizeRecoveryEmail, resolveSafeRedirectUrl } from '@/lib/auth/passwordRecovery';
import { Mail, ArrowRight, AlertCircle, CheckCircle, ArrowLeft, Lock, MessageCircle } from 'lucide-react';

const WHATSAPP_B2B_SUPPORT_URL =
  'https://wa.me/56989338537?text=' +
  encodeURIComponent(
    'Hola OptiHub, necesito asistencia B2B porque perdimos acceso al correo corporativo de nuestra óptica para restablecer la clave.'
  );

function RecuperarPasswordForm() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const sanitized = sanitizeRecoveryEmail(email);
    if (!sanitized.email) {
      setErrorMsg('Por favor ingrese el correo corporativo de su óptica.');
      return;
    }

    if (!sanitized.valid) {
      setErrorMsg('El formato del correo electrónico ingresado no es válido.');
      return;
    }

    setLoading(true);

    try {
      const targetRedirect = resolveSafeRedirectUrl(process.env.NEXT_PUBLIC_SITE_URL);
      const { error } = await resetPasswordForEmail(sanitized.email, targetRedirect);

      if (error) {
        // Manejo controlado de limitación de tasa (rate limit)
        if (error.message?.toLowerCase().includes('rate limit') || (error as any).status === 429) {
          setErrorMsg('Ha superado el límite de solicitudes. Por favor espere unos minutos antes de reintentar.');
          setLoading(false);
          return;
        }
      }

      // Principio de anti-enumeración de cuentas: respuesta uniforme garantizada
      setSubmitted(true);
    } catch (err: any) {
      console.error('[RecuperarPassword] Error en solicitud:', err);
      // Mantenemos neutralidad anti-enumeración ante errores inesperados
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
              RECUPERACIÓN SEGURA · B2B
            </span>
            <span className="w-6 h-[1px] bg-[#9E8256]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
            Recuperar Contraseña
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-2.5 leading-relaxed max-w-sm mx-auto">
            Ingrese el correo corporativo de su óptica para recibir un enlace seguro de restablecimiento de contraseña.
          </p>
        </div>

        {/* Tarjeta de Formulario Ejecutiva */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-10 shadow-xs">
          {submitted ? (
            /* Vista de Confirmación Anti-Enumeración */
            <div className="text-center space-y-6">
              <div className="inline-flex p-3 bg-[#F4F8F5] border border-[#C4D9C8] text-[#2D6A4F] mb-1">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-normal text-[#0F0F0F] tracking-tight">
                  Solicitud Enviada
                </h2>
                <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed max-w-sm mx-auto">
                  Si el correo está asociado a una óptica registrada en OPTIHUB, recibirás un enlace seguro para restablecer tu clave en los próximos minutos.
                </p>
              </div>

              <div className="p-4 bg-[#FAF9F6] border border-[#E6E2DD] text-xs text-[#5C5A55] text-left space-y-1.5">
                <p className="font-semibold text-[#0F0F0F] uppercase tracking-wider text-[10px]">
                  Indicaciones de seguridad:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[#787670] text-[11px]">
                  <li>Revise su bandeja principal y correo no deseado (Spam).</li>
                  <li>El enlace de recuperación es de un solo uso y caduca en 1 hora.</li>
                  <li>Si no recibe el correo, compruebe que sea el correo oficial registrado.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/login"
                  className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white font-medium py-3.5 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Volver a Iniciar Sesión</span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setEmail('');
                    setErrorMsg('');
                  }}
                  className="text-[11px] uppercase tracking-[0.16em] text-[#787670] hover:text-[#0F0F0F] transition font-medium py-1 cursor-pointer"
                >
                  Probar con otro correo
                </button>
              </div>
            </div>
          ) : (
            /* Vista de Formulario de Solicitud */
            <>
              {errorMsg && (
                <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838]" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                    Correo Corporativo de la Óptica
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contacto@suoptica.cl"
                      className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-3 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition disabled:bg-[#F4F2ED] disabled:text-[#787670]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Enviando enlace seguro...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar Enlace de Recuperación</span>
                      <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                    </>
                  )}
                </button>
              </form>

              {/* Botón para volver a login */}
              <div className="mt-6 pt-6 border-t border-[#E6E2DD] text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#5C5A55] hover:text-[#0F0F0F] transition uppercase tracking-[0.16em]"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a Iniciar Sesión</span>
                </Link>
              </div>
            </>
          )}

          {/* Asistencia WhatsApp B2B */}
          <div className="mt-6 pt-6 border-t border-[#E6E2DD] text-center space-y-2">
            <p className="text-xs text-[#5C5A55]">
              ¿Su óptica ha perdido acceso a su correo electrónico corporativo?
            </p>
            <a
              href={WHATSAPP_B2B_SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 text-[11px] font-semibold text-[#25D366] hover:text-[#1EBE5D] transition uppercase tracking-[0.16em]"
            >
              <MessageCircle className="w-3.5 h-3.5 fill-[#25D366]" />
              <span>Contactar Asistencia B2B por WhatsApp →</span>
            </a>
          </div>
        </div>

        {/* Garantía B2B */}
        <div className="mt-6 text-center">
          <p className="text-[10px] text-[#787670] uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-[#9E8256]" />
            Plataforma exclusiva para ópticas y profesionales de la salud visual en Chile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RecuperarPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center text-xs uppercase tracking-widest">
          Cargando recuperación de contraseña...
        </div>
      }
    >
      <RecuperarPasswordForm />
    </Suspense>
  );
}
