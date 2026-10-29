'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle, Clock } from 'lucide-react';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 60;
const STORAGE_ATTEMPTS_KEY = 'optihub_login_failed_attempts';
const STORAGE_LOCKOUT_KEY = 'optihub_login_lockout_until';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/catalogo';

  const { login, isLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Inicializar estado de bloqueo desde sessionStorage para persistencia en recarga
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedLockout = sessionStorage.getItem(STORAGE_LOCKOUT_KEY);
      if (storedLockout) {
        const lockoutUntil = parseInt(storedLockout, 10);
        const now = Date.now();
        if (lockoutUntil > now) {
          setLockoutSeconds(Math.ceil((lockoutUntil - now) / 1000));
        } else {
          sessionStorage.removeItem(STORAGE_LOCKOUT_KEY);
        }
      }

      const storedAttempts = sessionStorage.getItem(STORAGE_ATTEMPTS_KEY);
      if (storedAttempts) {
        const parsed = parseInt(storedAttempts, 10);
        if (!isNaN(parsed)) {
          setFailedAttempts(parsed);
        }
      }
    } catch {
      // Ignorar restricciones de almacenamiento local/session
    }
  }, []);

  // Temporizador de cuenta regresiva para el bloqueo por fuerza bruta
  useEffect(() => {
    if (lockoutSeconds <= 0) return;

    const interval = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          try {
            sessionStorage.removeItem(STORAGE_LOCKOUT_KEY);
            sessionStorage.removeItem(STORAGE_ATTEMPTS_KEY);
          } catch {}
          setFailedAttempts(0);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  useEffect(() => {
    if (isLoggedIn) {
      router.push(redirectPath);
    }
  }, [isLoggedIn, redirectPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || lockoutSeconds > 0) return;

    setErrorMsg('');
    setLoading(true);

    try {
      const { error } = await login(email.trim(), password);
      if (error) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        try {
          sessionStorage.setItem(STORAGE_ATTEMPTS_KEY, nextAttempts.toString());
        } catch {}

        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          const lockoutUntil = Date.now() + LOCKOUT_DURATION_SECONDS * 1000;
          try {
            sessionStorage.setItem(STORAGE_LOCKOUT_KEY, lockoutUntil.toString());
          } catch {}
          setLockoutSeconds(LOCKOUT_DURATION_SECONDS);
          setErrorMsg(
            `Ha alcanzado el límite de ${MAX_FAILED_ATTEMPTS} intentos fallidos consecutivos. Por seguridad de su cuenta mayorista, el acceso ha sido bloqueado temporalmente por ${LOCKOUT_DURATION_SECONDS} segundos.`
          );
        } else {
          const remaining = MAX_FAILED_ATTEMPTS - nextAttempts;
          let detail = 'Error al iniciar sesión. Inténtalo nuevamente.';
          if (error.message.includes('Invalid login credentials')) {
            detail = 'Correo o contraseña incorrectos. Por favor verifica tus datos.';
          } else if (error.message.includes('Email not confirmed')) {
            detail = 'Tu correo electrónico no ha sido confirmado aún. Revisa tu bandeja de entrada.';
          } else if (error.message) {
            detail = error.message;
          }
          setErrorMsg(`${detail} (${remaining} intento${remaining !== 1 ? 's' : ''} restante${remaining !== 1 ? 's' : ''} antes del bloqueo temporal)`);
        }
      } else {
        // Acceso exitoso: reiniciar contadores
        setFailedAttempts(0);
        try {
          sessionStorage.removeItem(STORAGE_ATTEMPTS_KEY);
          sessionStorage.removeItem(STORAGE_LOCKOUT_KEY);
        } catch {}
        router.push(redirectPath);
      }
    } catch (err: any) {
      setErrorMsg('Ocurrió un error inesperado. Por favor intenta más tarde.');
    } finally {
      setLoading(false);
    }
  };

  const isLockedOut = lockoutSeconds > 0;

  return (
    <div className="min-h-[85vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
              ACCESO MAYORISTA B2B · USA
            </span>
            <span className="w-6 h-[1px] bg-[#9E8256]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
            Acceso Ópticas B2B
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-2.5 leading-relaxed max-w-sm mx-auto">
            Ingrese a su cuenta comercial para consultar valores netos mayoristas y gestionar pedidos de importación directa.
          </p>
        </div>

        {/* Tarjeta de Formulario Ejecutiva */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-10 shadow-xs">
          {/* Alerta de bloqueo por fuerza bruta */}
          {isLockedOut ? (
            <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
              <Clock className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838] animate-pulse" />
              <div>
                <span className="font-semibold block uppercase tracking-wider text-[10px] mb-0.5">
                  Bloqueo Temporal por Seguridad
                </span>
                <span>
                  Ha alcanzado 5 intentos fallidos consecutivos. Podrá reintentar en{' '}
                  <strong className="font-mono text-sm">{lockoutSeconds}s</strong>.
                </span>
              </div>
            </div>
          ) : errorMsg ? (
            <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838]" />
              <span>{errorMsg}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                Correo Electrónico de la Óptica
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  disabled={loading || isLockedOut}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@suoptica.cl"
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-3 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition disabled:bg-[#F4F2ED] disabled:text-[#787670] disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em]">
                  Contraseña
                </label>
                <Link
                  href="/recuperar-password"
                  className="text-[10px] uppercase tracking-[0.14em] text-[#9E8256] hover:text-[#0F0F0F] transition font-medium"
                >
                  ¿OLVIDÓ SU CLAVE?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  disabled={loading || isLockedOut}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-3 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition disabled:bg-[#F4F2ED] disabled:text-[#787670] disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || isLockedOut}
              className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verificando credenciales...</span>
                </>
              ) : isLockedOut ? (
                <>
                  <Clock className="w-4 h-4 text-[#9E8256]" />
                  <span>Bloqueado temporalmente ({lockoutSeconds}s)</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Catálogo Mayorista</span>
                  <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                </>
              )}
            </button>
          </form>

          {/* Enlace al Registro */}
          <div className="mt-8 pt-6 border-t border-[#E6E2DD] text-center">
            <p className="text-xs text-[#5C5A55]">
              ¿Su óptica aún no dispone de cuenta comercial?
            </p>
            <Link
              href={`/registro?redirect=${encodeURIComponent(redirectPath)}`}
              className="inline-block mt-2 text-[11px] font-semibold text-[#9E8256] hover:text-[#0F0F0F] transition uppercase tracking-[0.18em]"
            >
              Solicitar Registro de Óptica →
            </Link>
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

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center text-xs uppercase tracking-widest">
          Cargando acceso B2B...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
