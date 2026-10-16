'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { sanitizeRecoveryEmail, resolveSafeRedirectUrl } from '@/lib/auth/passwordRecovery';
import { Glasses, Mail, ArrowRight, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

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
      setErrorMsg('Por favor ingresa el correo electrónico de tu óptica.');
      return;
    }

    if (!sanitized.valid) {
      setErrorMsg('El formato del correo electrónico no es válido.');
      return;
    }

    setLoading(true);

    try {
      const targetRedirect = resolveSafeRedirectUrl(process.env.NEXT_PUBLIC_SITE_URL);
      const { error } = await resetPasswordForEmail(sanitized.email, targetRedirect);

      if (error) {
        // Manejar errores de rate limiting sin exponer datos internos
        if (error.message?.toLowerCase().includes('rate limit') || error.status === 429) {
          setErrorMsg('Has superado el límite de solicitudes. Por favor espera unos minutos antes de reintentar.');
          setLoading(false);
          return;
        }
      }

      // Neutralidad de respuesta: Siempre mostrar éxito para evitar enumeración de usuarios
      setSubmitted(true);
    } catch (err: any) {
      // Incluso en error inesperado, registrar en consola y presentar mensaje neutral o reintentable
      console.error('[RecuperarPassword] Error en solicitud:', err);
      setErrorMsg('Ocurrió un error inesperado al procesar la solicitud. Por favor intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Cabecera / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-emerald-500 rounded-2xl text-slate-950 mb-4 shadow-lg shadow-emerald-500/20">
            <Glasses className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">
            Recuperar Contraseña
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Ingresa el correo corporativo de tu óptica y te enviaremos las instrucciones para restablecer tu clave.
          </p>
        </div>

        {/* Tarjeta de Formulario o Confirmación */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {submitted ? (
            <div className="text-center space-y-6">
              <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 mb-2">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  Instrucciones Enviadas
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Si el correo <span className="text-emerald-400 font-semibold">{email}</span> corresponde a una óptica registrada en OptiHub, recibirás un enlace seguro para restablecer tu contraseña en los próximos minutos.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-left space-y-1.5">
                <p className="font-semibold text-slate-300">¿No recibes el correo?</p>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li>Revisa tu bandeja de spam o correo no deseado.</li>
                  <li>Verifica que el correo esté escrito correctamente.</li>
                  <li>El enlace de recuperación es válido por 1 hora.</li>
                </ul>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/login"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
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
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition uppercase tracking-wider py-2"
                >
                  Intentar con otro correo
                </button>
              </div>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Correo Electrónico de la Óptica
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contacto@tuoptica.cl"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 transition"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Enviando enlace...</span>
                    </>
                  ) : (
                    <>
                      <span>Enviar Enlace de Recuperación</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Enlace de regreso al Login */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-emerald-400 transition uppercase tracking-wider"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Volver a Iniciar Sesión</span>
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Garantía B2B */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-slate-500">
            OptiHub B2B — Plataforma Mayorista Exclusiva para Ópticas en Chile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function RecuperarPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando...</div>}>
      <RecuperarPasswordForm />
    </Suspense>
  );
}
