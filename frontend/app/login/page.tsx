'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/catalogo';

  const { login, isLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isLoggedIn) {
      router.push(redirectPath);
    }
  }, [isLoggedIn, redirectPath, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const { error } = await login(email.trim(), password);
      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setErrorMsg('Correo o contraseña incorrectos. Por favor verifica tus datos.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMsg('Tu correo electrónico no ha sido confirmado aún. Revisa tu bandeja de entrada.');
        } else {
          setErrorMsg(error.message || 'Error al iniciar sesión. Inténtalo nuevamente.');
        }
      } else {
        router.push(redirectPath);
      }
    } catch (err: any) {
      setErrorMsg('Ocurrió un error inesperado. Por favor intenta más tarde.');
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
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-10">
          {errorMsg && (
            <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838]" />
              <span>{errorMsg}</span>
            </div>
          )}

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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@suoptica.cl"
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-3 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
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
                  ¿Olvidó su clave?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-3 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer"
            >
              {loading ? (
                <span>Verificando credenciales...</span>
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
    <Suspense fallback={<div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center text-xs uppercase tracking-widest">Cargando acceso B2B...</div>}>
      <LoginForm />
    </Suspense>
  );
}
