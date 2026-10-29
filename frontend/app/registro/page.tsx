'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, OpticaMetadata } from '@/context/AuthContext';
import { formatRUT, isValidRUT, cleanRUT } from '@/lib/utils/rut';
import { checkPasswordRules } from '@/lib/utils/password';
import { REGIONES_CHILE, getCommunesForRegion } from '@/lib/data/chileRegions';
import { trackB2BEvent } from '@/lib/analytics';
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
  FileText,
  Briefcase,
  Clock,
  MessageCircle,
} from 'lucide-react';

const GIROS_SII_OPTICOS = [
  'Venta al por menor de artículos ópticos e instrumental médico (Óptica)',
  'Consultas médicas oftalmológicas y centros oftalmológicos',
  'Laboratorio y taller de biselado / montaje óptico',
  'Distribución y comercialización mayorista de insumos oftálmicos',
  'Otro giro relacionado a la salud visual y optometría',
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect') || '/catalogo';

  const { register, isLoggedIn } = useAuth();

  const [formData, setFormData] = useState({
    razon_social: '',
    nombre_optica: '',
    rut_empresa: '',
    giro_comercial: GIROS_SII_OPTICOS[0],
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
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<OpticaMetadata | null>(null);
  const [loading, setLoading] = useState(false);
  const hasTrackedStartRef = useRef(false);

  const handleFormFocus = () => {
    if (!hasTrackedStartRef.current) {
      hasTrackedStartRef.current = true;
      trackB2BEvent('start_b2b_registration', {
        entry_point: 'formulario_registro_b2b',
      });
    }
  };

  useEffect(() => {
    if (isLoggedIn && !successData) {
      router.push(redirectPath);
    }
  }, [isLoggedIn, redirectPath, router, successData]);

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

  const handleRutBlur = () => {
    if (isRutComplete) {
      trackB2BEvent('rut_validation_result', {
        is_valid: isRutValid,
      });
    }
  };

  const pwdRules = useMemo(() => {
    return checkPasswordRules(formData.password, formData.confirmPassword);
  }, [formData.password, formData.confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.razon_social.trim()) {
      setErrorMsg('Debe indicar la Razón Social tributaria registrada ante el SII.');
      return;
    }

    if (!formData.nombre_optica.trim()) {
      setErrorMsg('Debe indicar el Nombre Comercial o Fantasía de la óptica.');
      return;
    }

    if (!isValidRUT(formData.rut_empresa)) {
      setErrorMsg('El RUT ingresado no es válido. Debe ser un RUT chileno oficial con su dígito verificador correcto (Módulo 11).');
      return;
    }

    if (!formData.giro_comercial) {
      setErrorMsg('Por favor seleccione el Giro Comercial SII correspondiente a su actividad.');
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
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }

    if (!acceptedTerms) {
      setErrorMsg('Debe aceptar los Términos y Condiciones Mayoristas y la Política de Privacidad de OPTIHUB para continuar.');
      return;
    }

    setLoading(true);

    const metadata: OpticaMetadata = {
      razon_social: formData.razon_social.trim(),
      nombre_optica: formData.nombre_optica.trim(),
      rut_empresa: formData.rut_empresa.trim(),
      giro_comercial: formData.giro_comercial,
      giro: formData.giro_comercial,
      nombre_contacto: formData.nombre_contacto.trim(),
      telefono: formData.telefono.trim(),
      region: formData.region,
      comuna: formData.comuna,
      ciudad: `${formData.comuna}, ${formData.region}`,
      rol: 'optica',
      verificado_b2b: false,
      estado_verificacion: 'pendiente',
      fecha_solicitud: new Date().toISOString(),
    };

    try {
      const { error } = await register(formData.email.trim(), formData.password, metadata);

      if (error) {
        setErrorMsg(error.message || 'Error al procesar el registro de la óptica.');
      } else {
        trackB2BEvent('complete_b2b_registration', {
          region: formData.region,
          comuna: formData.comuna,
          giro_type: formData.giro_comercial,
        });
        setSuccessData(metadata);
      }
    } catch {
      setErrorMsg('Ocurrió un error inesperado al registrar la cuenta. Por favor intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  // PANTALLA FORMAL DE CONFIRMACIÓN Y CONTACTO WHATSAPP PARA ACTIVACIÓN PRIORITARIA
  if (successData) {
    const whatsappMessage = `Hola OptiHub B2B, acabo de registrar la óptica ${successData.nombre_optica || 'Óptica'} (Razón Social: ${successData.razon_social || 'N/A'}, RUT: ${successData.rut_empresa}, Giro: ${successData.giro_comercial}). Solicito la activación prioritaria de mi cuenta comercial para acceder al catálogo mayorista.`;
    const whatsappUrl = `https://wa.me/56989338537?text=${encodeURIComponent(whatsappMessage)}`;

    return (
      <div className="min-h-[85vh] bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
        <div className="max-w-xl w-full bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-12 text-left">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-[#F7F3EB] text-[#846C44] border border-[#9E8256]/30 flex items-center justify-center flex-shrink-0">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <span className="block text-[10px] uppercase tracking-[0.22em] text-[#9E8256] font-semibold">
                VALIDACIÓN TRIBUTARIA SII · KYC B2B
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#0F0F0F] tracking-tight">
                Solicitud de Alta Comercial Recibida
              </h2>
            </div>
          </div>

          <div className="p-4 bg-[#FAF6ED] border border-[#E6D7B8] mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-[#846C44] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#846C44]">
                Estado: En Revisión Comercial (Validación de Giro Óptico)
              </span>
            </div>
            <p className="text-xs text-[#5C5A55] leading-relaxed">
              Para proteger a las ópticas establecidas en Chile, OptiHub verifica la concordancia del RUT y Giro Comercial ante el SII antes de habilitar la visualización de precios netos e importación directa.
            </p>
          </div>

          {/* Ficha Resumen de la Óptica Registrada */}
          <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-5 mb-8 space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-[#E6E2DD] pb-2">
              <span className="text-[#5C5A55] uppercase tracking-wider text-[10px]">Razón Social SII:</span>
              <span className="font-semibold text-[#0F0F0F]">{successData.razon_social}</span>
            </div>
            <div className="flex justify-between border-b border-[#E6E2DD] pb-2">
              <span className="text-[#5C5A55] uppercase tracking-wider text-[10px]">Nombre Comercial:</span>
              <span className="font-semibold text-[#0F0F0F]">{successData.nombre_optica}</span>
            </div>
            <div className="flex justify-between border-b border-[#E6E2DD] pb-2">
              <span className="text-[#5C5A55] uppercase tracking-wider text-[10px]">RUT de Empresa:</span>
              <span className="font-mono font-bold text-[#0F0F0F]">{successData.rut_empresa}</span>
            </div>
            <div className="flex justify-between border-b border-[#E6E2DD] pb-2">
              <span className="text-[#5C5A55] uppercase tracking-wider text-[10px]">Giro Comercial:</span>
              <span className="font-medium text-[#0F0F0F] text-right max-w-xs">{successData.giro_comercial}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#5C5A55] uppercase tracking-wider text-[10px]">Ubicación:</span>
              <span className="text-[#0F0F0F]">{successData.ciudad}</span>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="space-y-3">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackB2BEvent('click_whatsapp_b2b', {
                  source: 'registration',
                });
              }}
              className="w-full inline-flex items-center justify-center gap-2.5 bg-[#25D366] hover:bg-[#1EBE5D] text-white py-4 px-6 transition text-[11px] uppercase tracking-[0.2em] font-semibold border border-[#20BA5A] shadow-xs"
            >
              <MessageCircle className="w-4 h-4 fill-white" />
              <span>Solicitar Activación Inmediata por WhatsApp</span>
            </a>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href="/catalogo"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white py-3.5 px-4 transition text-[11px] uppercase tracking-[0.18em] border border-[#0F0F0F] text-center"
              >
                <span>Explorar Catálogo (Modo Vitrina)</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
              </Link>

              <Link
                href="/login"
                className="flex-1 inline-flex items-center justify-center gap-2 bg-transparent hover:bg-[#FAF9F6] text-[#0F0F0F] py-3.5 px-4 transition text-[11px] uppercase tracking-[0.18em] border border-[#D5D0C8] text-center"
              >
                <span>Iniciar Sesión</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl w-full">
        {/* Cabecera Editorial */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
              ALTA COMERCIAL B2B · USA & CHILE
            </span>
            <span className="w-6 h-[1px] bg-[#9E8256]" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
            Registro de Óptica B2B
          </h1>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-2.5 max-w-lg mx-auto leading-relaxed">
            Inscripción exclusiva para ópticas, oftalmólogos y laboratorios en Chile. Facturación electrónica SII, precios netos en CLP e importación directa desde USA.
          </p>
        </div>

        {/* Tarjeta de Formulario Ejecutiva */}
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-10 shadow-xs">
          {errorMsg && (
            <div className="mb-6 p-4 bg-[#FAF4F4] border border-[#E6D0D0] text-[#9E3838] text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9E3838]" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} onFocusCapture={handleFormFocus} className="space-y-5">
            {/* Fila 1: Razón Social SII & Nombre Comercial */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Razón Social (Tributaria SII) <span className="text-[#9E8256]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    required
                    name="razon_social"
                    value={formData.razon_social}
                    onChange={handleChange}
                    placeholder="Ej: Inversiones Ópticas del Sur SpA"
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Nombre de Fantasía / Óptica <span className="text-[#9E8256]">*</span>
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
            </div>

            {/* Fila 2: RUT de Empresa & Giro Comercial SII */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em]">
                    RUT de Empresa o Titular <span className="text-[#9E8256]">*</span>
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
                  onBlur={handleRutBlur}
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

              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Giro Comercial SII <span className="text-[#9E8256]">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#787670]">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <select
                    required
                    name="giro_comercial"
                    value={formData.giro_comercial}
                    onChange={handleChange}
                    className="w-full bg-[#FFFFFF] border border-[#D5D0C8] pl-10 pr-4 py-2.5 text-xs text-[#0F0F0F] focus:outline-none focus:border-[#0F0F0F] focus:ring-0 rounded-none transition cursor-pointer"
                  >
                    {GIROS_SII_OPTICOS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Fila 3: Encargado & Teléfono / WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Nombre del Encargado / Óptico <span className="text-[#9E8256]">*</span>
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
                  Teléfono / WhatsApp de Facturación <span className="text-[#9E8256]">*</span>
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

            {/* Fila 4: Región y Comuna */}
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

            {/* Fila 5: Correo Electrónico Comercial */}
            <div>
              <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                Correo Electrónico Comercial / DTE <span className="text-[#9E8256]">*</span>
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

            {/* Fila 6: Contraseñas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-semibold text-[#5C5A55] uppercase tracking-[0.18em] mb-2">
                  Contraseña <span className="text-[#9E8256]">*</span>
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
                  Confirmar Contraseña <span className="text-[#9E8256]">*</span>
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

            {/* Checkbox Obligatorio de Términos y Privacidad */}
            <div className="p-3.5 bg-[#FAF9F6] border border-[#E6E2DD]">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  required
                  id="accepted-terms-checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-none border border-[#D5D0C8] text-[#0F0F0F] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#0F0F0F]"
                />
                <span className="text-xs text-[#5C5A55] leading-relaxed">
                  Acepto los{' '}
                  <Link
                    href="/terminos-y-condiciones"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0F0F0F] font-semibold underline underline-offset-2 hover:text-[#9E8256] transition-colors"
                  >
                    Términos y Condiciones Mayoristas
                  </Link>{' '}
                  y la{' '}
                  <Link
                    href="/politica-de-privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0F0F0F] font-semibold underline underline-offset-2 hover:text-[#9E8256] transition-colors"
                  >
                    Política de Privacidad
                  </Link>{' '}
                  de OPTIHUB.
                </span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  loading ||
                  !acceptedTerms ||
                  !pwdRules.valid ||
                  !isRutValid ||
                  !formData.razon_social.trim() ||
                  !formData.nombre_optica.trim()
                }
                className="w-full bg-[#0F0F0F] hover:bg-[#262626] disabled:bg-[#E6E2DD] disabled:text-[#787670] text-white font-medium py-4 px-6 transition duration-200 text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 border border-[#0F0F0F] cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span>Registrando Óptica...</span>
                ) : (
                  <>
                    <span>Solicitar Alta Comercial B2B</span>
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
