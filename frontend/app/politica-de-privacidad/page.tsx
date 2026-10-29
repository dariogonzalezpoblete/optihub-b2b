import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldCheck,
  Lock,
  FileCheck2,
  Database,
  EyeOff,
  UserCheck,
  Building,
  Mail,
  Scale,
  ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Política de Privacidad y Tratamiento de Datos | OPTIHUB Chile',
  description:
    'Política de Privacidad de OPTIHUB conforme a la Ley 19.628 y Ley 21.719 de Protección de Datos Personales en Chile. Resguardo confidencial de RUT, Razón Social e historial de compras B2B.',
  alternates: {
    canonical: '/politica-de-privacidad',
  },
};

export default function PoliticaDePrivacidadPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F]">
      {/* HEADER EDITORIAL */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold">
              PROTECCIÓN DE DATOS PERSONALES Y SECRETOS COMERCIALES
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
            Política de Privacidad B2B
          </h1>
          <p className="text-[#5C5A55] text-sm sm:text-base mt-4 max-w-3xl leading-relaxed">
            Compromiso institucional de <strong className="text-[#0F0F0F] font-semibold">OPTICA MULTIFOCUS LIMITADA</strong> (operadora comercial de OPTIHUB) en resguardo de la confidencialidad, tratamiento lícito y seguridad de la información corporativa y datos de contacto de nuestros clientes ópticos en estricto cumplimiento con la <strong className="text-[#0F0F0F]">Ley N° 19.628</strong> y la nueva <strong className="text-[#0F0F0F]">Ley N° 21.719</strong> de la República de Chile.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-wider text-[#787670] font-mono">
            <span>Marco: Ley N° 19.628 & Ley N° 21.719</span>
            <span>•</span>
            <span>Estándar de Cifrado Bancario SSL 256-Bit</span>
            <span>•</span>
            <span className="text-[#2D6A4F] font-semibold">Cumplimiento Activo</span>
          </div>
        </div>
      </div>

      {/* TARJETAS RESUMEN DE PRINCIPIOS */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Scale className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Ley 21.719 Chile</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Tratamiento lícito, proporcional y con deber de seguridad reforzado.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <EyeOff className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Confidencialidad</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Jamás vendemos ni compartimos sus datos tributarios con terceros ajenos.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Database className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Historial Seguro</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Registro inalterable de compras, Facturas SII y trazabilidad aduanera.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <UserCheck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Derechos ARCO</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Acceso, Rectificación, Supresión y Oposición canalizados vía DPO.
            </p>
          </div>
        </div>
      </div>

      {/* CUERPO PRINCIPAL DE LA POLÍTICA */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-14 space-y-12 shadow-xs">

          {/* SECCIÓN 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                1. RESPONSABLE DEL TRATAMIENTO
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Identidad y Contacto del Responsable
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              El responsable del tratamiento de los datos personales y comerciales recabados a través del sitio web <strong className="text-[#0F0F0F]">optihub.cl</strong> es:
            </p>
            <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-4 text-xs font-mono space-y-1 text-[#0F0F0F]">
              <p><span className="text-[#787670] uppercase">Razón Social:</span> OPTICA MULTIFOCUS LIMITADA</p>
              <p><span className="text-[#787670] uppercase">RUT Empresarial:</span> 78.044.452-5</p>
              <p><span className="text-[#787670] uppercase">Giro Tributario:</span> Venta al por mayor y distribución de productos ópticos e instrumental médico</p>
              <p><span className="text-[#787670] uppercase">Contacto Oficial:</span> <a href="mailto:contacto@optihub.cl" className="text-[#9E8256] underline">contacto@optihub.cl</a> / <a href="mailto:privacidad@optihub.cl" className="text-[#9E8256] underline">privacidad@optihub.cl</a></p>
            </div>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* SECCIÓN 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                2. DATOS RECOPILADOS Y CATEGORIZACIÓN
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Naturaleza de los Datos Comerciales y Personales
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              En atención al carácter B2B de nuestra operativa, recabamos exclusivamente los datos estrictamente pertinentes para formalizar las transacciones comerciales de importación mayorista:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="border border-[#E6E2DD] p-4 bg-[#FAF9F6]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] mb-2">
                  Datos Tributarios (SII)
                </h4>
                <ul className="text-xs text-[#5C5A55] space-y-1.5 list-disc pl-4">
                  <li>Razón Social o Nombre Completo.</li>
                  <li>RUT de Empresa o Titular.</li>
                  <li>Giro Comercial acreditado ante el SII.</li>
                  <li>Dirección tributaria y comuna.</li>
                </ul>
              </div>

              <div className="border border-[#E6E2DD] p-4 bg-[#FAF9F6]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] mb-2">
                  Datos de Contacto
                </h4>
                <ul className="text-xs text-[#5C5A55] space-y-1.5 list-disc pl-4">
                  <li>Nombre del encargado de compras u óptico.</li>
                  <li>Teléfono y WhatsApp corporativo.</li>
                  <li>Correo electrónico de intercambio DTE.</li>
                  <li>Dirección física de entrega / despacho.</li>
                </ul>
              </div>

              <div className="border border-[#E6E2DD] p-4 bg-[#FAF9F6]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] mb-2">
                  Historial de Operaciones
                </h4>
                <ul className="text-xs text-[#5C5A55] space-y-1.5 list-disc pl-4">
                  <li>Historial de órdenes B2B y compras.</li>
                  <li>Copias de Facturas Electrónicas (XML y PDF).</li>
                  <li>Registros de guías de despacho y tracking.</li>
                  <li>Trazabilidad técnica de garantías.</li>
                </ul>
              </div>
            </div>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* SECCIÓN 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                3. BASE LEGAL Y FINALIDAD DEL TRATAMIENTO
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Finalidades Específicas del Tratamiento
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              De conformidad con las disposiciones de la Ley 19.628 y el marco de licitud instituido por la Ley 21.719, el tratamiento de sus datos se fundamenta en la <strong className="text-[#0F0F0F]">ejecución del contrato comercial de compraventa mayorista</strong> y en el cumplimiento de <strong className="text-[#0F0F0F]">obligaciones legales imperativas</strong>:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>
                <strong className="text-[#0F0F0F]">Calificación y Validación KYC Óptica:</strong> Verificar que la entidad adquirente pertenezca efectivamente a la industria óptica o de la salud, preservando los márgenes y condiciones del canal mayorista frente al público general.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Facturación y Cumplimiento Tributario ante el SII:</strong> Emisión formal y oportuna del Documento Tributario Electrónico (DTE) con crédito fiscal en Pesos Chilenos (CLP).
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Gestión Logística y Despacho Aduanero:</strong> Tramitación de manifiestos aéreos de internación, desaduanamiento ante el Servicio Nacional de Aduanas y entrega física en el establecimiento comercial del cliente.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Atención de Postventa y Garantías:</strong> Gestión de incidencias técnicas, trazabilidad de números de serie y activación de coberturas de fábrica.
              </li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* SECCIÓN 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                4. SEGURIDAD Y RESGUARDO DE LA INFORMACIÓN
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Protocolos Técnicos y Organizativos de Seguridad
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              OPTICA MULTIFOCUS LIMITADA aplica las medidas técnicas y organizativas adecuadas para prevenir la pérdida, mal uso, alteración, acceso no autorizado o sustracción de los datos:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>
                <strong className="text-[#0F0F0F]">Cifrado en Tránsito y Reposo:</strong> Todas las comunicaciones se realizan bajo canales cifrados mediante protocolo HTTPS con certificados TLS 1.3 y algoritmos de cifrado simétrico de grado bancario (AES-256).
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Aislamiento de Bases de Datos con Políticas RLS:</strong> Nuestra infraestructura tecnológica cuenta con políticas de seguridad a nivel de filas (<em className="font-serif">Row-Level Security</em>), garantizando que ninguna óptica pueda acceder a la información comercial, pedidos o facturas de otra empresa.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Contraseñas Hash Criptográficas:</strong> Las credenciales de acceso se almacenan utilizando algoritmos de derivación de claves criptográficas seguras (Argon2 / Bcrypt) imposibles de descifrar por el personal administrativo.
              </li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* SECCIÓN 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                5. POLÍTICA DE NO DIVULGACIÓN A TERCEROS
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Confidencialidad de la Cartera de Clientes Ópticos
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              OPTIHUB no comercializa, no arrienda ni cede bajo ningún concepto la base de datos de sus clientes ópticos a terceros con fines publicitarios. Sus datos únicamente son comunicados a:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li><strong className="text-[#0F0F0F]">Servicio de Impuestos Internos (SII):</strong> En cumplimiento estricto de las leyes tributarias aplicables a la facturación electrónica en Chile.</li>
              <li><strong className="text-[#0F0F0F]">Operadores Logísticos y Couriers Certificados:</strong> Exclusivamente la información de entrega (Nombre, Dirección de Destino, Teléfono de Contacto) indispensable para completar el reparto físico de los armazones en Chile.</li>
              <li><strong className="text-[#0F0F0F]">Pasarelas de Pago Certificadas (PCI-DSS):</strong> Información necesaria para procesar la transacción bancaria. OPTIHUB nunca almacena datos completos de tarjetas de crédito o débito en sus servidores.</li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* SECCIÓN 6 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                6. DERECHOS DE LOS TITULARES (DERECHOS ARCO)
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Ejercicio de Acceso, Rectificación, Supresión y Oposición
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              En virtud de la Ley N° 19.628 y la Ley N° 21.719, las personas naturales titulares de los datos y los representantes de las ópticas tienen derecho a ejercer de manera expedita y gratuita sus derechos:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 border border-[#E6E2DD] bg-[#FAF9F6]">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] block">Acceso y Rectificación</span>
                <p className="text-xs text-[#5C5A55] mt-1">Conocer qué datos obran en nuestros registros y solicitar la actualización inmediata de datos tributarios inexactos o desactualizados.</p>
              </div>
              <div className="p-4 border border-[#E6E2DD] bg-[#FAF9F6]">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] block">Supresión y Bloqueo</span>
                <p className="text-xs text-[#5C5A55] mt-1">Solicitar la eliminación de su cuenta una vez vencidos los plazos legales de conservación tributaria exigidos por el SII (6 años conforme al Código Tributario).</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed pt-2">
              Para formalizar cualquier solicitud relativa a sus datos personales, el titular debe remitir un requerimiento por escrito a nuestro Encargado de Protección de Datos al correo <a href="mailto:privacidad@optihub.cl" className="text-[#9E8256] underline font-semibold">privacidad@optihub.cl</a>, adjuntando acreditación de su personería jurídica o mandato, respondiéndose dentro del plazo legal máximo fijado por la normativa chilena.
            </p>
          </section>

          {/* TARJETA CONTACTO */}
          <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">
                Oficial de Cumplimiento y Protección de Datos
              </h4>
              <p className="text-xs text-[#5C5A55]">
                Para resolver cualquier consulta respecto al resguardo de su información tributaria, escríbanos directamente.
              </p>
            </div>
            <a
              href="mailto:privacidad@optihub.cl"
              className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <Mail className="w-3.5 h-3.5 text-[#9E8256]" />
              <span>Contactar Privacidad</span>
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
