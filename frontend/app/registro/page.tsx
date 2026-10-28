'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, OpticaMetadata } from '@/context/AuthContext';
import { formatRUT, isValidRUT, cleanRUT } from '@/lib/utils/rut';
import { checkPasswordRules } from '@/lib/utils/password';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import {
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

  const availableCommunes = useMemo(() => {
    return getCommunesForRegion(formData.region);
  }, [formData.region]);

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

  const cleanRutStr = cleanRUT(formData.rut_empresa);
  const isRutComplete = cleanRutStr.length >= 7;
  const isRutValid = isRutComplete && isValidRUT(formData.rut_empresa);
  const isRutInvalid = isRutComplete && !isRutValid;

  const pwdRules = useMemo(() => {
    return checkPasswordRules(formData.password, formData.confirmPassword);
  }, [formData.password, formData.confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!isValidRUT(formData.rut_empresa)) {
      setErrorMsg('El RUT ingresado no es válido. Debe ser un RUT chileno oficial con su dígito verificador correcto (Módulo 11).');
      return;
    }

    if (!formData.region) {
      setErrorMsg('Por favor seleccione una región.');
      return;
    }
    if (!formData.comuna) {
      setErrorMsg('Por favor seleccione una comuna correspondiente a su región.');
      return;
    }

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
        if (data?.user && !data.session) {
          setSuccessMsg(true);
        } else {
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
      <div className="min-h-[85vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-12 text-center">
          <div className="w-12 h-12 bg-[#F7F3EB] text-[#846C44] border border-[#9E8256]/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <span className="block text-[10px] uppercase tracking-[0.22em] text-[#9E8256] font-semibold mb-2">
            SOLICITUD PROCESADA
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#0F0F0F] tracking-tight">
            ¡Registro Enviado con Éxito!
          </h2>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 leading-relaxed">
            Hemos registrado los datos de su óptica. Revise su bandeja de entrada en <span className="text-[#0F0F0F] font-semibold">{formData.email}</span> para verificar su cuenta y comenzar a cotizar armazones al por mayor.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="w-full inline-flex items-center justify-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white py-4 px-6 transition text-[11px] uppercase tracking-[0.2em] border border-[#0F0F0F]"
            >
              <span>Ir a Iniciar Sesión</span>
              <ArrowRight className="w-4 h-4 text-[#9E8256]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
      <div className="max-w-xl w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
              ALTA COMERCIAL B2B · USA
            </span>
            <span className="w-6 h-[1px] bg-[#9E8256]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
            Registro de Óptica B2B
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-2.5 max-w-md mx-auto leading-relaxed">
            Cree su cuenta comercial para acceder a precios mayoristas netos, inventario sincronizado e importación directa desde USA.
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

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Fila 1: Nombre Óptica & RUT Empresa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Nombre Comercial / Óptica
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    name="nombre_optica"
                    value={formData.nombre_optica}
                    onChange={handleChange}
                    placeholder="Ej: Óptica Santa Lucía"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em]">
                    RUT de Empresa o Titular
                  </label>
                  {isRutValid && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-[#2D6A4F] bg-[#F4F8F5] border border-[#C4D9C8] px-1.5 py-0.5">
                      <Check className="w-2.5 h-2.5" />
                      Válido
                    </span>
                  )}
                  {isRutInvalid && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono text-[#9E3838] bg-[#FAF4F4] border border-[#E6D0D0] px-1.5 py-0.5">
                      <AlertCircle className="w-2.5 h-2.5" />
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
                  className={`w-full bg-[#FFFFFF] border px-4 py-2.5 text-xs font-mono text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:ring-0 rounded-none transition tabular-nums ${
                    isRutInvalid
                      ? 'border-[#9E3838] bg-[#FAF4F4]/30'
                      : isRutValid
                      ? 'border-[#2D6A4F]'
                      : 'border-[#D5D0C8] focus:border-[#0F0F0F]'
                  }`}
                />
              </div>
            </div>

            {/* Fila 2: Encargado & Teléfono */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Nombre del Encargado / Óptico
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    name="nombre_contacto"
                    value={formData.nombre_contacto}
                    onChange={handleChange}
                    placeholder="Ej: Roberto Morales"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Teléfono / WhatsApp
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <Phone className="w-4 h-4" />
                  </div>
                  <input
                    type="tel"
                    required
                    name="telefono"
                    value={formData.telefono}
                    onChange={handleChange}
                    placeholder="+56989338537"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition font-mono tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Fila 3: Región y Comuna */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Región <span className="text-[#9E8256]">*</span>
                </label>
                <select
                  required
                  name="region"
                  value={formData.region}
                  onChange={handleRegionChange}
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] px-4 py-2.5 text-xs text-[#0F0F0F] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition cursor-pointer"
                >
                  <option value="">Seleccione una región...</option>
                  {REGIONES_CHILE.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Comuna <span className="text-[#9E8256]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <select
                    required
                    name="comuna"
                    value={formData.comuna}
                    onChange={handleChange}
                    disabled={!formData.region}
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] disabled:bg-[#F4F2ED] disabled:text-[#787670] disabled:cursor-not-allowed pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition cursor-pointer"
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
              <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                Correo Electrónico Comercial
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="compras@suoptica.cl"
                  className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
                />
              </div>
            </div>

            {/* Fila 5: Contraseñas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-10 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
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
                  Confirmar Contraseña
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                    placeholder="Repita la contraseña"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-10 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
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
            </div>

            {/* Checklist de Requisitos de Contraseña */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E6E2DD] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-medium text-[#5C5A55] mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-[#9E8256]" />
                <span>Requisitos de seguridad para la cuenta B2B:</span>
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] uppercase font-mono">
                <div className={`flex items-center gap-1.5 ${pwdRules.hasMinLength ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'}`}>
                  <span>{pwdRules.hasMinLength ? '✓' : '—'} Mínimo 8 caracteres</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdRules.hasUpper ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'}`}>
                  <span>{pwdRules.hasUpper ? '✓' : '—'} 1 Mayúscula (A-Z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdRules.hasLower ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'}`}>
                  <span>{pwdRules.hasLower ? '✓' : '—'} 1 Minúscula (a-z)</span>
                </div>
                <div className={`flex items-center gap-1.5 ${pwdRules.hasNumber ? 'text-[#2D6A4F] font-bold' : 'text-[#787670]'}`}>
                  <span>{pwdRules.hasNumber ? '✓' : '—'} 1 Número (0-9)</span>
                </div>
              </div>
              {formData.confirmPassword.length > 0 && (
                <div className={`pt-1 text-[10px] uppercase font-mono flex items-center gap-1.5 ${pwdRules.matchesConfirm ? 'text-[#2D6A4F]' : 'text-[#9E3838]'}`}>
                  <span>{pwdRules.matchesConfirm ? '✓ Las contraseñas coinciden' : '✕ Las contraseñas no coinciden'}</span>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !pwdRules.valid || !isRutValid}
                className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer"
              >
                {loading ? (
                  <span>Registrando Óptica...</span>
                ) : (
                  <>
                    <span>Crear Cuenta Mayorista B2B</span>
                    <ArrowRight className="w-4 h-4 text-[#9E8256]" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Enlace al Login */}
          <div className="mt-8 pt-6 border-t border-[#E6E2DD] text-center">
            <p className="text-xs text-[#5C5A55]">
              ¿Su óptica ya cuenta con acceso registrado?
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectPath)}`}
              className="inline-block mt-2 text-[11px] font-semibold text-[#9E8256] hover:text-[#0F0F0F] transition uppercase tracking-[0.18em]"
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
    <Suspense fallback={<div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center text-xs uppercase tracking-widest">Cargando registro B2B...</div>}>
      <RegisterForm />
    </Suspense>
  );
}
