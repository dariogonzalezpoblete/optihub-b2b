'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, OpticaMetadata } from '@/context/AuthContext';
import { formatRUT, isValidRUT, cleanRUT } from '@/lib/utils/rut';
import { checkPasswordRules } from '@/lib/utils/password';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import {
  Glasses,
  Building2,
  User,
  Phone,
  MapPin,
  Mail,
  Lock,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Check,
  ShieldCheck,
} from 'lucide-react';

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
    region: 'Región Metropolitana de Santiago',
    comuna: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      router.push(redirectPath);
    }
  }, [isLoggedIn, redirectPath, router]);

  // Comunas disponibles para la región seleccionada
  const availableCommunes = useMemo(() => {
    return getCommunesForRegion(formData.region);
  }, [formData.region]);

  // Si cambia la región y la comuna actual no pertenece a ella, resetear comuna
  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRegion = e.target.value;
    const communes = getCommunesForRegion(newRegion);
    setFormData((prev) => ({
      ...prev,
      region: newRegion,
      comuna: communes.includes(prev.comuna) ? prev.comuna : '',
    }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let value = e.target.value;
    if (e.target.name === 'rut_empresa') {
      value = formatRUT(value);
    }
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: value,
    }));
  };

  // Validación de RUT en tiempo real
  const cleanRutStr = cleanRUT(formData.rut_empresa);
  const isRutComplete = cleanRutStr.length >= 7;
  const isRutValid = isRutComplete && isValidRUT(formData.rut_empresa);
  const isRutInvalid = isRutComplete && !isRutValid;

  // Validación de contraseña en tiempo real
  const pwdRules = useMemo(() => {
    return checkPasswordRules(formData.password, formData.confirmPassword);
  }, [formData.password, formData.confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    // 1. Validar RUT con Algoritmo Módulo 11 estricto
    if (!isValidRUT(formData.rut_empresa)) {
      setErrorMsg('El RUT ingresado no es válido. Debe ser un RUT chileno oficial con su dígito verificador correcto (Módulo 11).');
      return;
    }

    // 2. Validar Región y Comuna
    if (!formData.region) {
      setErrorMsg('Por favor seleccione una región.');
      return;
    }
    if (!formData.comuna) {
      setErrorMsg('Por favor seleccione una comuna correspondiente a su región.');
      return;
    }

    // 3. Validar Seguridad de Contraseña (Mayúscula, Minúscula, Número, 8+ caracteres)
    if (!pwdRules.hasMinLength) {
      setErrorMsg('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!pwdRules.hasUpper) {
      setErrorMsg('La contraseña debe contener al menos una letra mayúscula (A-Z).');
      return;
    }
    if (!pwdRules.hasLower) {
      setErrorMsg('La contraseña debe contener al menos una letra minúscula (a-z).');
      return;
    }
    if (!pwdRules.hasNumber) {
      setErrorMsg('La contraseña debe contener al menos un número (0-9).');
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);

    const metadata: OpticaMetadata = {
      nombre_optica: formData.nombre_optica.trim(),
      rut_empresa: formData.rut_empresa.trim(),
      nombre_contacto: formData.nombre_contacto.trim(),
      telefono: formData.telefono.trim(),
      region: formData.region,
      comuna: formData.comuna,
      ciudad: `${formData.comuna}, ${formData.region}`,
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
      setErrorMsg('Ocurrió un error inesperado al registrar la cuenta. Por favor intente nuevamente.');
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
            {/* Fila 1: Nombre Óptica & RUT Empresa */}
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
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider">
                    RUT de Empresa o Titular
                  </label>
                  {isRutValid && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      <Check className="w-3 h-3 text-emerald-600" />
                      Válido
                    </span>
                  )}
                  {isRutInvalid && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                      <AlertCircle className="w-3 h-3 text-red-600" />
                      DV Inválido
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  required
                  name="rut_empresa"
                  value={formData.rut_empresa}
                  onChange={handleChange}
                  placeholder="Ej: 76.543.210-3"
                  className={`w-full bg-[#FAF9F6] border rounded-xl px-4 py-2.5 text-sm font-mono text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] transition ${
                    isRutInvalid
                      ? 'border-red-400 focus:border-red-500 bg-red-50/20'
                      : isRutValid
                      ? 'border-emerald-400 focus:border-emerald-500'
                      : 'border-[#E5E4DF] focus:border-[#B89768]'
                  }`}
                />
              </div>
            </div>

            {/* Fila 2: Encargado & Teléfono */}
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
                    placeholder="+56 9 9893 3853"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                </div>
              </div>
            </div>

            {/* Fila 3: Región y Comuna en Cascada */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Región <span className="text-[#9E7D4F]">*</span>
                </label>
                <div className="relative">
                  <select
                    required
                    name="region"
                    value={formData.region}
                    onChange={handleRegionChange}
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl px-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  >
                    <option value="">Seleccione una región...</option>
                    {REGIONES_CHILE.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#111111] uppercase tracking-wider mb-2">
                  Comuna <span className="text-[#9E7D4F]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#82807A]">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <select
                    required
                    name="comuna"
                    value={formData.comuna}
                    onChange={handleChange}
                    disabled={!formData.region}
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] disabled:bg-[#F2F1EC] disabled:text-[#A8A6A0] disabled:cursor-not-allowed rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#111111] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  >
                    <option value="">
                      {formData.region ? 'Seleccione una comuna...' : 'Primero seleccione región'}
                    </option>
                    {availableCommunes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Fila 4: Correo Electrónico Comercial */}
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

            {/* Fila 5: Contraseñas con botón de visibilidad */}
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
                    type={showPassword ? 'text' : 'password'}
                    required
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#82807A] hover:text-[#111111] transition"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
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
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Repita la contraseña"
                    className="w-full bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl pl-10 pr-10 py-2.5 text-sm text-[#111111] placeholder-[#A8A6A0] focus:outline-none focus:bg-[#FFFFFF] focus:border-[#B89768] transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#82807A] hover:text-[#111111] transition"
                    aria-label={showConfirmPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Checklist de Requisitos de Contraseña en Tiempo Real */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E5E4DF] rounded-xl space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#575551] mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#9E7D4F]" />
                <span>Requisitos de seguridad para la cuenta B2B:</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <div className={`flex items-center gap-1.5 transition ${pwdRules.hasMinLength ? 'text-emerald-700 font-medium' : 'text-[#82807A]'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${pwdRules.hasMinLength ? 'bg-emerald-100 text-emerald-700' : 'bg-[#E5E4DF] text-[#82807A]'}`}>
                    {pwdRules.hasMinLength ? '✓' : '•'}
                  </div>
                  <span>Mínimo 8 caracteres</span>
                </div>
                <div className={`flex items-center gap-1.5 transition ${pwdRules.hasUpper ? 'text-emerald-700 font-medium' : 'text-[#82807A]'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${pwdRules.hasUpper ? 'bg-emerald-100 text-emerald-700' : 'bg-[#E5E4DF] text-[#82807A]'}`}>
                    {pwdRules.hasUpper ? '✓' : '•'}
                  </div>
                  <span>Al menos una mayúscula</span>
                </div>
                <div className={`flex items-center gap-1.5 transition ${pwdRules.hasLower ? 'text-emerald-700 font-medium' : 'text-[#82807A]'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${pwdRules.hasLower ? 'bg-emerald-100 text-emerald-700' : 'bg-[#E5E4DF] text-[#82807A]'}`}>
                    {pwdRules.hasLower ? '✓' : '•'}
                  </div>
                  <span>Al menos una minúscula</span>
                </div>
                <div className={`flex items-center gap-1.5 transition ${pwdRules.hasNumber ? 'text-emerald-700 font-medium' : 'text-[#82807A]'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${pwdRules.hasNumber ? 'bg-emerald-100 text-emerald-700' : 'bg-[#E5E4DF] text-[#82807A]'}`}>
                    {pwdRules.hasNumber ? '✓' : '•'}
                  </div>
                  <span>Al menos un número (0-9)</span>
                </div>
              </div>
              {formData.confirmPassword.length > 0 && (
                <div className={`pt-1 text-[11px] flex items-center gap-1.5 ${pwdRules.matchesConfirm ? 'text-emerald-700 font-medium' : 'text-red-600'}`}>
                  <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] ${pwdRules.matchesConfirm ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {pwdRules.matchesConfirm ? '✓' : '✕'}
                  </div>
                  <span>{pwdRules.matchesConfirm ? 'Las contraseñas coinciden' : 'Las contraseñas no coinciden'}</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !pwdRules.valid || !isRutValid}
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
