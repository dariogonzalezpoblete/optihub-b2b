'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import {
  validateRecoveryUrlParams,
  validatePasswordInput,
  cleanUrlParameters,
  maskEmail,
  shouldSelectivelyCloseAbandonedRecovery,
} from '@/lib/auth/passwordRecovery';
import {
  verifyRecoveryAuthorization,
  getCallbackProbe,
  clearCallbackProbe,
  clearRecoveryProof,
} from '@/lib/auth/recoveryProof';
import { Glasses, Lock, ArrowRight, AlertCircle, CheckCircle, ArrowLeft, ShieldCheck } from 'lucide-react';

function ActualizarPasswordForm() {
  const searchParams = useSearchParams();
  const { updatePassword, clearRecoveryMode } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [maskedAccountEmail, setMaskedAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Identificador incremental de ejecución para soportar doble montaje de React StrictMode sin quedar en "Verificando..."
  const runIdRef = useRef(0);

  useEffect(() => {
    const currentRunId = ++runIdRef.current;
    const isCurrentRun = () => runIdRef.current === currentRunId;

    const closeIfAbandonedRecovery = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const existingSession = data?.session;
        if (
          shouldSelectivelyCloseAbandonedRecovery({
            hasFailedCallback: true,
            session: existingSession,
          })
        ) {
          clearRecoveryProof();
          clearRecoveryMode();
          try {
            await supabase.auth.signOut({ scope: 'local' });
          } catch {
            // ignorar fallos de red/servidor al limpiar sesión local
          }
        }
      } catch {
        // ignorar
      }
    };

    const verifyRecoverySession = async () => {
      try {
        // A. Inspeccionar parámetros actuales de la URL y la sonda síncrona capturada antes de que el SDK limpiara el hash
        const urlParamsCheck = validateRecoveryUrlParams({
          searchParams,
          hashString: typeof window !== 'undefined' ? window.location.hash : '',
        });
        const probe = getCallbackProbe();

        const hasUrlError = urlParamsCheck.hasError || Boolean(probe?.hasError);
        const hasUnsupportedCode = Boolean(urlParamsCheck.code || probe?.hasCode);

        // B. Si el callback trajo error o un ?code= (no soportado en flujo implícito), rechazar sin autorizar sesiones previas
        if (hasUrlError || hasUnsupportedCode) {
          clearCallbackProbe();
          cleanUrlParameters();
          await closeIfAbandonedRecovery();
          if (isCurrentRun()) {
            setMaskedAccountEmail(null);
            setErrorMsg(
              urlParamsCheck.errorMessage ||
                'El enlace de recuperación es inválido, ha expirado o ya fue utilizado. Por favor solicita un nuevo enlace.'
            );
            setIsSessionValid(false);
            setCheckingSession(false);
          }
          return;
        }

        // C. Limpiar artefactos de la URL una vez inspeccionados
        clearCallbackProbe();
        cleanUrlParameters();

        // D. Único punto de decisión asíncrono basado en prueba en memoria + getClaims()
        const decision = await verifyRecoveryAuthorization(supabase);

        if (!isCurrentRun()) return;

        if (decision.authorized && decision.session) {
          setMaskedAccountEmail(maskEmail(decision.session.user?.email));
          setIsSessionValid(true);
          setErrorMsg('');
        } else {
          setMaskedAccountEmail(null);
          setIsSessionValid(false);
          setErrorMsg(
            'No hay una sesión de recuperación activa en esta pestaña (por ejemplo, si recargaste la página o abriste el enlace directamente). Por favor solicita un nuevo enlace de recuperación.'
          );
        }
        setCheckingSession(false);
      } catch (err) {
        console.error('[ActualizarPassword] Error al verificar sesión:', err);
        cleanUrlParameters();
        if (isCurrentRun()) {
          setMaskedAccountEmail(null);
          setErrorMsg('Error al verificar el estado de recuperación. Por favor solicita un nuevo enlace.');
          setIsSessionValid(false);
          setCheckingSession(false);
        }
      }
    };

    verifyRecoverySession();

    // E. Cuando llega PASSWORD_RECOVERY (se emite en setTimeout(0)), re-ejecutar verificación formal en vez de autorizar a ciegas
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!isCurrentRun()) return;
      if (event === 'PASSWORD_RECOVERY') {
        cleanUrlParameters();
        verifyRecoverySession();
      } else if (event === 'SIGNED_OUT') {
        setMaskedAccountEmail(null);
        setIsSessionValid(false);
        setCheckingSession(false);
      }
    });

    return () => {
      // Invalida la corrida actual; el segundo montaje de StrictMode incrementará runIdRef.current y completará normalmente
      if (runIdRef.current === currentRunId) {
        runIdRef.current++;
      }
      subscription.unsubscribe();
    };
  }, []);

  // 2. Manejador del formulario de cambio de contraseña
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const validation = validatePasswordInput(password, confirmPassword);
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Validación de contraseña fallida.');
      return;
    }

    setLoading(true);

    try {
      // updatePassword ejecuta internamente verifyRecoveryAuthorization(supabase) antes de llamar a updateUser
      const { error } = await updatePassword(password);

      if (error) {
        if (error.name === 'UnauthorizedRecoveryError' || error.name === 'SessionMissingError') {
          setIsSessionValid(false);
          setMaskedAccountEmail(null);
          setErrorMsg(
            error.message ||
              'Tu sesión de recuperación ya no es válida. Por favor solicita un nuevo enlace.'
          );
        } else if (error.message?.includes('different from the old password')) {
          setErrorMsg('La nueva contraseña debe ser diferente a la anterior.');
        } else if (error.message?.includes('weak')) {
          setErrorMsg('La contraseña ingresada es muy débil. Elige una combinación más segura.');
        } else {
          setErrorMsg(error.message || 'No se pudo actualizar la contraseña. Inténtalo nuevamente.');
        }
        setLoading(false);
        return;
      }

      // Éxito: limpiar estado de recuperación y presentar confirmación
      clearRecoveryMode();
      cleanUrlParameters();
      setMaskedAccountEmail(null);
      setIsSessionValid(false);
      setSuccess(true);
    } catch (err: any) {
      console.error('[ActualizarPassword] Error inesperado:', err);
      setErrorMsg('Ocurrió un error inesperado al actualizar la contraseña.');
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
            Nueva Contraseña
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Ingresa y confirma tu nueva clave de acceso para tu cuenta mayorista en OptiHub.
          </p>
        </div>

        {/* Tarjeta Principal */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          {checkingSession ? (
            /* Estado de Carga / Verificando enlace */
            <div className="text-center py-10 space-y-4">
              <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-300">
                Verificando enlace de recuperación seguro...
              </p>
            </div>
          ) : success ? (
            /* Estado de Éxito Transparente: Sesión cerrada por seguridad, requiere login con nueva clave (ARG-01) */
            <div className="text-center space-y-6">
              <div className="inline-flex p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 mb-2">
                <CheckCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  ¡Contraseña Restablecida!
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  Tu nueva contraseña ha sido guardada de forma segura. Por protección de tu cuenta mayorista, la sesión temporal de recuperación se ha cerrado. Por favor inicia sesión con tu nueva contraseña para continuar operando.
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/login"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <span>Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : !isSessionValid ? (
            /* Estado de Enlace Inválido / No Autorizado */
            <div className="text-center space-y-6">
              <div className="inline-flex p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 mb-2">
                <AlertCircle className="w-10 h-10" />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">
                  Enlace No Válido o Expirado
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {errorMsg || 'No se detectó una sesión válida de recuperación. Por motivos de seguridad, los enlaces de restablecimiento expiran tras 1 hora o al ser utilizados.'}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/recuperar-password"
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Solicitar Nuevo Enlace</span>
                </Link>

                <Link
                  href="/login"
                  className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition uppercase tracking-wider py-2"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            /* Formulario de Nueva Contraseña */
            <>
              {maskedAccountEmail && (
                <div className="mb-5 p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2">
                  <span className="text-slate-400">Cuenta a restablecer:</span>
                  <span className="font-mono font-bold text-emerald-400">{maskedAccountEmail}</span>
                </div>
              )}

              {errorMsg && (
                <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Nueva Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Confirmar Nueva Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repite la contraseña"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50 transition"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">Requisitos de seguridad:</p>
                  <p className="text-[11px] text-slate-400">
                    • Mínimo 8 caracteres, al menos una mayúscula (A-Z), una minúscula (a-z) y un número (0-9).
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-black py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 text-sm uppercase tracking-wider flex items-center justify-center gap-2 mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Actualizando clave...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar Nueva Contraseña</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Enlace de salida */}
              <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-emerald-400 transition uppercase tracking-wider"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Cancelar y volver al Login</span>
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

export default function ActualizarPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando...</div>}>
      <ActualizarPasswordForm />
    </Suspense>
  );
}
