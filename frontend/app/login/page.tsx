'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Glasses, Lock, Mail, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react';

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
    <div className="min-h-[85vh] bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Cabecera / Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3 bg-emerald-500 rounded-2xl text-slate-950 mb-4 shadow-lg shadow-emerald-500/20">
            <Glasses className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">
            Acceso Ópticas B2B
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            Ingresa a tu cuenta mayorista para desbloquear precios netos en CLP y armar pedidos de importación directa.
          </p>
        </div>

        {/* Tarjeta de Formulario */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contacto@tuoptica.cl"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Contraseña
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
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
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <span>Ingresar a Catálogo Mayorista</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Enlace al Registro */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center">
            <p className="text-xs text-slate-400">
              ¿Tu óptica aún no tiene cuenta comercial?
            </p>
            <Link
              href={`/registro?redirect=${encodeURIComponent(redirectPath)}`}
              className="inline-block mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition uppercase tracking-wider"
            >
              Solicitar Registro de Óptica →
            </Link>
          </div>
        </div>

        {/* Garantía B2B */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3 text-emerald-500" />
            Acceso exclusivo para ópticas y profesionales de la salud visual en Chile.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando acceso B2B...</div>}>
      <LoginForm />
    </Suspense>
  );
}
