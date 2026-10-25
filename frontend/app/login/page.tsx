'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Glasses, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/catalogo';

  const { login, isLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya está logueado, redirigir automáticamente
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
    <div className="min-h-[85vh] bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full">
        {/* Cabecera / Branding Editorial */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3.5 bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl text-[#B89768] mb-5 shadow-sm">
            <Glasses className="w-7 h-7 stroke-[1.6]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B89768] mb-2">
            Maison B2B • Acceso Mayorista
          </span>
          <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">
            Acceso Ópticas B2B
          </h1>
          <p className="text-[#575551] text-xs sm:text-sm mt-2.5 leading-relaxed max-w-sm mx-auto">
            Ingrese a su cuenta comercial para consultar valores netos mayoristas y gestionar pedidos de importación directa.
          </p>
        </div>

        {/* Tarjeta de Formulario */}
        <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 sm:p-9 shadow-sm">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs sm:text-sm flex items-start gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                Correo Electrónico de la Óptica
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@suoptica.cl"
                  className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-3 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider">
                  Contraseña
                </label>
                <Link
                  href="/recuperar-password"
                  className="text-[11px] font-medium text-[#B89768] hover:text-[#9E7D4F] transition"
                >
                  ¿Olvidó su contraseña?
                </Link>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-3 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#111111] hover:bg-[#222222] disabled:bg-[#E5E4DF] disabled:text-[#82807A] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition duration-200 shadow-sm text-xs uppercase tracking-widest flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#B89768] border-t-transparent rounded-full animate-spin"></div>
                  <span>Verificando credenciales...</span>
                </>
              ) : (
                <>
                  <span>Ingresar al Catálogo Mayorista</span>
                  <ArrowRight className="w-4 h-4 text-[#B89768]" />
                </>
              )}
            </button>
          </form>

          {/* Enlace al Registro */}
          <div className="mt-8 pt-6 border-t border-[#E5E4DF] text-center">
            <p className="text-xs text-[#575551]">
              ¿Su óptica aún no dispone de cuenta comercial?
            </p>
            <Link
              href={`/registro?redirect=${encodeURIComponent(redirectPath)}`}
              className="inline-block mt-2 text-xs font-semibold text-[#B89768] hover:text-[#9E7D4F] transition uppercase tracking-wider"
            >
              Solicitar Registro de Óptica →
            </Link>
          </div>
        </div>

        {/* Garantía B2B */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-[#82807A] flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-[#B89768]" />
            Plataforma exclusiva para ópticas y profesionales de la salud visual en Chile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center text-xs uppercase tracking-widest">Cargando acceso B2B...</div>}>
      <LoginForm />
    </Suspense>
  );
}
