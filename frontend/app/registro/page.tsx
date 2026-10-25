'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, OpticaMetadata } from '@/context/AuthContext';
import { formatRUT, isValidRUT } from '@/lib/utils/rut';
import { Glasses, Building2, User, Phone, MapPin, Mail, Lock, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/catalogo';

  const { register, isLoggedIn } = useAuth();

  const [formData, setFormData] = useState({
    nombre_optica: '',
    rut_empresa: '',
    nombre_contacto: '',
    telefono: '',
    ciudad: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isLoggedIn) {
      router.push(redirectPath);
    }
  }, [isLoggedIn, redirectPath, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    if (e.target.name === 'rut_empresa') {
      value = formatRUT(value);
    }
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isValidRUT(formData.rut_empresa)) {
      setErrorMsg('El RUT ingresado no es válido. Por favor verifica el formato (ej: 76.543.210-K).');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    if (formData.password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);

    const metadata: OpticaMetadata = {
      nombre_optica: formData.nombre_optica.trim(),
      rut_empresa: formData.rut_empresa.trim(),
      nombre_contacto: formData.nombre_contacto.trim(),
      telefono: formData.telefono.trim(),
      ciudad: formData.ciudad.trim(),
    };

    try {
      const { data, error } = await register(formData.email.trim(), formData.password, metadata);

      if (error) {
        setErrorMsg(error.message || 'Error al procesar el registro de la óptica.');
      } else {
        // Si Supabase requiere confirmación de email:
        if (data?.user && !data.session) {
          setSuccessMsg(true);
        } else {
          // Si tiene auto-confirm habilitado:
          router.push(redirectPath);
        }
      }
    } catch (err: any) {
      setErrorMsg('Ocurrió un error inesperado. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (successMsg) {
    return (
      <div className="min-h-[85vh] bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-8 sm:p-10 text-center shadow-sm">
          <div className="w-16 h-16 bg-[#F7F3EB] text-[#9E7D4F] rounded-2xl flex items-center justify-center mx-auto mb-6 border border-[#B89768]/30">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="font-editorial font-serif text-2xl sm:text-3xl font-semibold text-[#111111] tracking-tight">
            ¡Registro Enviado con Éxito!
          </h2>
          <p className="text-[#575551] text-xs sm:text-sm mt-3 leading-relaxed">
            Hemos registrado los datos de su óptica. Revise su bandeja de entrada en <span className="text-[#111111] font-semibold">{formData.email}</span> para verificar su cuenta y comenzar a cotizar armazones al por mayor.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#111111] hover:bg-[#222222] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition text-xs uppercase tracking-widest shadow-sm"
            >
              <span>Ir a Iniciar Sesión</span>
              <ArrowRight className="w-4 h-4 text-[#B89768]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center px-4 py-16">
      <div className="max-w-xl w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="inline-flex p-3.5 bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl text-[#B89768] mb-5 shadow-sm">
            <Glasses className="w-7 h-7 stroke-[1.6]" />
          </div>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.22em] text-[#B89768] mb-2">
            Maison B2B • Alta Comercial
          </span>
          <h1 className="font-editorial font-serif text-3xl sm:text-4xl font-semibold text-[#111111] tracking-tight">
            Registro de Óptica B2B
          </h1>
          <p className="text-[#575551] text-xs sm:text-sm mt-2.5 max-w-md mx-auto leading-relaxed">
            Cree su cuenta comercial para acceder a precios mayoristas netos, inventario sincronizado e importación directa.
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Nombre Comercial / Óptica
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    name="nombre_optica"
                    value={formData.nombre_optica}
                    onChange={handleChange}
                    placeholder="Ej: Óptica Santa Lucía"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  RUT de Empresa o Titular
                </label>
                <input
                  type="text"
                  required
                  name="rut_empresa"
                  value={formData.rut_empresa}
                  onChange={handleChange}
                  placeholder="Ej: 76.543.210-K"
                  className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl px-4 py-2.5 text-sm font-mono text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Nombre del Encargado / Óptico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    name="nombre_contacto"
                    value={formData.nombre_contacto}
                    onChange={handleChange}
                    placeholder="Ej: Roberto Morales"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Teléfono / WhatsApp
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    placeholder="+56 9 9893 38537"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                Ciudad / Comuna (Chile)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                  <MapPin className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  name="ciudad"
                  value={formData.ciudad}
                  onChange={handleChange}
                  placeholder="Ej: Providencia, Santiago"
                  className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                Correo Electrónico Comercial
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="compras@suoptica.cl"
                  className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Repita la contraseña"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#111111] hover:bg-[#222222] disabled:bg-[#E5E4DF] disabled:text-[#82807A] text-[#FFFFFF] font-semibold py-3.5 px-6 rounded-xl transition duration-200 shadow-sm text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-[#B89768] border-t-transparent rounded-full animate-spin"></div>
                    <span>Registrando Óptica...</span>
                  </>
                ) : (
                  <>
                    <span>Crear Cuenta Mayorista B2B</span>
                    <ArrowRight className="w-4 h-4 text-[#B89768]" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Enlace al Login */}
          <div className="mt-6 pt-6 border-t border-[#E5E4DF] text-center">
            <p className="text-xs text-[#575551]">
              ¿Su óptica ya cuenta con acceso registrado?
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
              className="inline-block mt-2 text-xs font-semibold text-[#B89768] hover:text-[#9E7D4F] transition uppercase tracking-wider"
            >
              Iniciar Sesión Aquí →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F6F2] text-[#111111] flex items-center justify-center text-xs uppercase tracking-widest">Cargando registro B2B...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
