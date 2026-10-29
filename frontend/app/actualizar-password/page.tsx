'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { checkPasswordRules } from '@/lib/utils/password';
import {
  validateRecoveryUrlParams,
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
import { Lock, ArrowRight, AlertCircle, CheckCircle, ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';

function ActualizarPasswordForm() {
  const searchParams = useSearchParams();
  const { updatePassword, clearRecoveryMode } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [maskedAccountEmail, setMaskedAccountEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Identificador incremental de ejecución para soportar doble montaje de React StrictMode sin quedar en "Verificando..."
  const runIdRef = useRef(0);

  // Validación de reglas de contraseña en tiempo real, idéntica a /registro
  const pwdRules = useMemo(() => {
    return checkPasswordRules(password, confirmPassword);
  }, [password, confirmPassword]);

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
            // Ignorar fallos de red/servidor al limpiar sesión local
          }
        }
      } catch {
        // Ignorar
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

    // E. Cuando llega PASSWORD_RECOVERY (se emite en setTimeout(0)), re-ejecutar verificación formal
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
      if (runIdRef.current === currentRunId) {
        runIdRef.current++;
      }
      subscription.unsubscribe();
    };
  }, [clearRecoveryMode, searchParams]);

  // Manejador del formulario de cambio de contraseña
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!pwdRules.valid) {
      setErrorMsg(pwdRules.error || 'La contraseña no cumple con los requisitos de seguridad.');
      return;
    }

    setLoading(true);

    try {
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
    <div className="min-h-[85vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
              SEGURIDAD B2B · OPTIHUB
            </span>
            <span className="w-6 h-[1px] bg-[#9E8256]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
            Nueva Contraseña
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-2.5 leading-relaxed max-w-sm mx-auto">
            Establezca una nueva clave de acceso segura para la cuenta comercial de su óptica.
          </p>
        </div>

        {/* Tarjeta de Formulario Ejecutiva */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-10 shadow-xs">
          {checkingSession ? (
            /* Estado de Carga / Verificando enlace */
            <div className="text-center py-10 space-y-4">
              <div className="w-8 h-8 border-2 border-[#0F0F0F] border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs uppercase tracking-widest text-[#5C5A55]">
                Verificando enlace de recuperación seguro...
              </p>
            </div>
          ) : success ? (
            /* Estado de Éxito: Sesión de recuperación cerrada por seguridad, requiere login con nueva clave */
            <div className="text-center space-y-6">
              <div className="inline-flex p-3 bg-[#F4F8F5] border border-[#C4D9C8] text-[#2D6A4F] mb-1">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-normal text-[#0F0F0F] tracking-tight">
                  ¡Contraseña Restablecida Con Éxito!
                </h2>
                <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed max-w-sm mx-auto">
                  Su nueva contraseña ha sido guardada de forma segura. Por protección de su cuenta mayorista, la sesión temporal de recuperación se ha cerrado. Por favor inicie sesión con su nueva clave para continuar operando.
                </p>
              </div>

              <div className="pt-2">
                <Link
                  href="/login"
                  className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white font-medium py-3.5 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F]"
                >
                  <span>Iniciar Sesión</span>
                  <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                </Link>
              </div>
            </div>
          ) : !isSessionValid ? (
            /* Estado de Enlace Inválido / No Autorizado */
            <div className="text-center space-y-6">
              <div className="inline-flex p-3 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] mb-1">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="font-serif text-2xl font-normal text-[#0F0F0F] tracking-tight">
                  Enlace No Válido o Expirado
                </h2>
                <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed max-w-sm mx-auto">
                  {errorMsg ||
                    'No se detectó una sesión válida de recuperación. Por motivos de seguridad, los enlaces de restablecimiento expiran tras 1 hora o al ser utilizados.'}
                </p>
              </div>

              <div className="pt-2 flex flex-col gap-3">
                <Link
                  href="/recuperar-password"
                  className="w-full bg-[#0F0F0F] hover:bg-[#262626] text-white font-medium py-3.5 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Solicitar Nuevo Enlace</span>
                </Link>

                <Link
                  href="/login"
                  className="text-[11px] uppercase tracking-[0.16em] text-[#787670] hover:text-[#0F0F0F] transition font-medium py-1"
                >
                  Volver al inicio de sesión
                </Link>
              </div>
            </div>
          ) : (
            /* Formulario de Nueva Contraseña */
            <>
              {maskedAccountEmail && (
                <div className="mb-5 p-3 bg-[#FAF9F6] border border-[#E6E2DD] text-xs text-[#5C5A55] flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[#787670]">
                    Cuenta comercial:
                  </span>
                  <span className="font-mono font-bold text-[#0F0F0F]">{maskedAccountEmail}</span>
                </div>
              )}

              {errorMsg && (
                <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838]" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                    Nueva Contraseña <span className="text-[#9E8256]">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      disabled={loading}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-10 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition disabled:bg-[#F4F2ED] disabled:text-[#787670]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#787670] hover:text-[#0F0F0F] transition cursor-pointer"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                    Confirmar Nueva Contraseña <span className="text-[#9E8256]">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      disabled={loading}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repita la contraseña"
                      className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-10 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition disabled:bg-[#F4F2ED] disabled:text-[#787670]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#787670] hover:text-[#0F0F0F] transition cursor-pointer"
                      aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Checklist de Requisitos de Contraseña en tiempo real idéntico a /registro */}
                <div className="p-3.5 bg-[#FAF9F6] border border-[#E6E2DD] space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#5C5A55] mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
                    <span>Requisitos de seguridad para la cuenta B2B:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] uppercase font-mono">
                    <div
                      className={`flex items-center gap-1.5 ${
                        pwdRules.hasMinLength ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'
                      }`}
                    >
                      <span>{pwdRules.hasMinLength ? '✓' : '—'} Mínimo 8 caracteres</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        pwdRules.hasUpper ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'
                      }`}
                    >
                      <span>{pwdRules.hasUpper ? '✓' : '—'} 1 Mayúscula (A-Z)</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        pwdRules.hasLower ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'
                      }`}
                    >
                      <span>{pwdRules.hasLower ? '✓' : '—'} 1 Minúscula (a-z)</span>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 ${
                        pwdRules.hasNumber ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'
                      }`}
                    >
                      <span>{pwdRules.hasNumber ? '✓' : '—'} 1 Número (0-9)</span>
                    </div>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div
                      className={`pt-1 text-[10px] uppercase font-mono flex items-center gap-1.5 ${
                        pwdRules.matchesConfirm ? 'text-[#2D6A4F]' : 'text-[#9E3838]'
                      }`}
                    >
                      <span>
                        {pwdRules.matchesConfirm
                          ? '✓ Las contraseñas coinciden'
                          : '✕ Las contraseñas no coinciden'}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !pwdRules.valid}
                  className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer disabled:cursor-not-allowed mt-2"
                >
                  {loading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Guardando nueva contraseña...</span>
                    </>
                  ) : (
                    <>
                      <span>Guardar Nueva Contraseña</span>
                      <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                    </>
                  )}
                </button>
              </form>

              {/* Enlace para cancelar */}
              <div className="mt-6 pt-6 border-t border-[#E6E2DD] text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#5C5A55] hover:text-[#0F0F0F] transition uppercase tracking-[0.16em]"
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
          <p className="text-[10px] text-[#787670] uppercase tracking-wider flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-[#9E8256]" />
            Plataforma exclusiva para ópticas y profesionales de la salud visual en Chile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ActualizarPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center text-xs uppercase tracking-widest">
          Cargando verificación de clave...
        </div>
      }
    >
      <ActualizarPasswordForm />
    </Suspense>
  );
}
