import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ShieldCheck,
  Package,
  Truck,
  RotateCcw,
  CheckCircle2,
  FileCheck,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Plane,
  BadgeCheck,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Políticas de Importación y Garantía de Fábrica | OPTIHUB Chile',
  description:
    'Garantía de autenticidad 100% original con trazabilidad USA-SII, empaque oficial completo por unidad, entrega nacionalizada puerta a puerta sin trámites aduaneros y protocolo formal de garantía técnica para ópticas en Chile.',
  alternates: {
    canonical: '/politicas-importacion-y-garantia',
  },
};

export default function PoliticasImportacionYGarantiaPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F]">
      {/* HEADER EDITORIAL */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold">
              TRAZABILIDAD OFICIAL, LOGÍSTICA DIRECTA & GARANTÍA
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
            Políticas de Importación y Garantía
          </h1>
          <p className="text-[#5C5A55] text-sm sm:text-base mt-4 max-w-3xl leading-relaxed">
            Estándares institucionales de aprovisionamiento internacional para ópticas en Chile. Trazabilidad integral de origen en Estados Unidos, internación aduanera nacionalizada llave en mano y cobertura técnica de fábrica con respaldo tributario SII.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-wider text-[#787670] font-mono">
            <span>Origen: Miami, Florida, USA</span>
            <span>•</span>
            <span>Régimen: Entrega DDP Nacionalizada en Chile</span>
            <span>•</span>
            <span className="text-[#2D6A4F] font-semibold">100% Original Garantizado</span>
          </div>
        </div>
      </div>

      {/* TARJETAS RESUMEN DE COMPROMISOS */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <BadgeCheck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">100% Auténticos</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Trazabilidad certificada desde distribuidores y casas matrices en EE. UU.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Package className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Empaque Oficial</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Cada pieza incluye estuche rígido original, microfibra y folletería.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Truck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Sin Trámites Aduaneros</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Recepción puerta a puerta con aranceles e internación resueltos por Optihub.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <RotateCcw className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Venta Firme B2B</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Control unitario en Chile. Reporte de daños o fallas en 5 días hábiles vía WhatsApp.
            </p>
          </div>
        </div>
      </div>

      {/* CUERPO PRINCIPAL */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-14 space-y-12 shadow-xs">

          {/* PILAR 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                PILAR I
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Garantía de Autenticidad 100% Original y Trazabilidad USA-SII
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              En el mercado óptico mayorista, la autenticidad y el prestigio de marca constituyen el activo más valioso de su óptica. Por ello, <strong className="text-[#0F0F0F]">OPTIHUB opera con una política estricta de tolerancia cero</strong> frente a falsificaciones, réplicas, saldos intervenidos o productos de procedencia dudosa:
            </p>
            <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-5 space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <strong className="text-[#0F0F0F] block">Canales Mayoristas Autorizados en USA:</strong>
                  <span className="text-[#5C5A55]">
                    Todos los lotes son adquiridos de manera directa a los centros de distribución oficial, licenciatarios autorizados y distribuidores matrices en Estados Unidos (marcas globales como Tom Ford, Burberry, Ferragamo, Guess, Calvin Klein, Swarovski, Zeiss, Nike, entre otras).
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#2D6A4F] shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm">
                  <strong className="text-[#0F0F0F] block">Trazabilidad Aduanera y Tributaria Respaldada:</strong>
                  <span className="text-[#5C5A55]">
                    Cada lote importado cuenta con Manifiesto Aéreo Internacional, Declaración de Ingreso aduanera (DIN) y la posterior emisión de su <strong className="text-[#0F0F0F]">Factura Electrónica SII emitida por OPTICA MULTIFOCUS LIMITADA (RUT 78.044.452-5)</strong>, garantizando que el 100% del stock en sus vitrinas cuente con respaldo tributario y aduanero legal ante cualquier fiscalización.
                  </span>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* PILAR 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                PILAR II
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Empaque Oficial Completo por Unidad (Packaging de Fábrica)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Entendemos que la experiencia del paciente en su óptica requiere una presentación impecable. Por esta razón, <strong className="text-[#0F0F0F]">cada armazón se entrega como producto completo de vitrina</strong>:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
              <div className="p-4 bg-[#FAF9F6] border border-[#E6E2DD] text-center">
                <div className="w-10 h-10 mx-auto bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center text-[#9E8256] mb-3">
                  <Package className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Estuche Rígido Oficial</h4>
                <p className="text-[11px] text-[#5C5A55] mt-1.5 leading-relaxed">
                  Estuche de la marca original (cuero, rígido o semirrígido según la colección de cada fabricante).
                </p>
              </div>

              <div className="p-4 bg-[#FAF9F6] border border-[#E6E2DD] text-center">
                <div className="w-10 h-10 mx-auto bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center text-[#9E8256] mb-3">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Paño de Microfibra</h4>
                <p className="text-[11px] text-[#5C5A55] mt-1.5 leading-relaxed">
                  Paño de limpieza original con logotipo serigrafiado o en bajo relieve oficial de la firma.
                </p>
              </div>

              <div className="p-4 bg-[#FAF9F6] border border-[#E6E2DD] text-center">
                <div className="w-10 h-10 mx-auto bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center text-[#9E8256] mb-3">
                  <FileCheck className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Folletería & Certificado</h4>
                <p className="text-[11px] text-[#5C5A55] mt-1.5 leading-relaxed">
                  Certificado de autenticidad, manual del fabricante y folleto técnico suministrado en caja.
                </p>
              </div>
            </div>
            <p className="text-xs text-[#787670] italic">
              * Nota: En colecciones o modelos específicos donde el fabricante provea cajas exteriores de cartón rígido (outer-box), estas también son suministradas en el lote original.
            </p>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* PILAR 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                PILAR III
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Recepción Nacionalizada Puerta a Puerta (DDP - Llave en Mano)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              La mayor barrera que enfrentan las ópticas chilenas al importar armazones desde Estados Unidos es la complejidad aduanera, las retenciones sorpresivas y los costos imprevistos de agentes de aduana. OPTIHUB elimina completamente esta fricción:
            </p>
            <div className="bg-[#FAF9F6] border-l-2 border-[#9E8256] p-5 space-y-2 text-xs sm:text-sm">
              <h4 className="font-bold text-[#0F0F0F] uppercase tracking-wider">
                Modalidad DDP (Delivered Duty Paid - Entrega con Derechos Pagados):
              </h4>
              <p className="text-[#5C5A55] leading-relaxed">
                Su óptica no efectúa ningún trámite aduanero, no contrata agentes externos y no realiza declaraciones de importación personales. OPTIHUB asume la internación consolidada en Santiago, liquida los aranceles de importación correspondientes y despacha el pedido nacionalizado directamente a la puerta de su local u óptica.
              </p>
            </div>
            <div className="space-y-2 text-xs sm:text-sm text-[#5C5A55] pt-1">
              <p><strong className="text-[#0F0F0F]">Plazo Ordinario de Tránsito:</strong> 10 a 15 días hábiles promedio desde la validación del pedido.</p>
              <p><strong className="text-[#0F0F0F]">Monitoreo en Tiempo Real:</strong> Asignación de código de seguimiento internacional y nacional habilitado en la sección "Mis Pedidos" y notificado vía WhatsApp / Email.</p>
              <p><strong className="text-[#0F0F0F]">Cobertura Nacional:</strong> Despacho a todas las regiones de Chile (Arica a Punta Arenas) mediante transporte terrestre o aéreo debidamente asegurado.</p>
            </div>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* PILAR 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                PILAR IV
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Protocolo Técnico de Garantía y Política Estricta de Venta Firme B2B
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Bajo nuestro modelo de abastecimiento mayorista, cada lote es importado de forma consolidada desde Estados Unidos e internado bajo régimen DDP en Chile. En virtud de los elevados costos aduaneros y fletes aéreos internacionales no recuperables, <strong className="text-[#0F0F0F]">es inviable efectuar devoluciones físicas o despachos de retorno hacia origen</strong>. Por ello, todas las transacciones operan bajo la modalidad comercial de <strong className="text-[#0F0F0F]">VENTA FIRME</strong>, regida por los siguientes principios imperativos:
            </p>

            <div className="space-y-4 pt-2">
              <div className="p-4 border border-[#E6E2DD] bg-[#FFFFFF] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] block">
                  1. Riguroso Control de Calidad Unitario en Chile Previo al Despacho
                </span>
                <p className="text-xs text-[#5C5A55] leading-relaxed">
                  Para brindar total certeza a las ópticas adquirentes, <strong className="text-[#0F0F0F]">el 100% de los armazones es sometido a un control de calidad técnico individual en Chile antes de su entrega al courier nacional</strong>. En este proceso se verifica la perfecta simetría de frentes y varillas, la calibración de bisagras o sistemas flex, la inexistencia de vicios superficiales o rayas y la presencia de su packaging oficial completo (estuche rígido, microfibra serigrafiada y folletería de fábrica).
                </p>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FAF4F4]/50 space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#9E3838] block">
                  2. Exclusiones Absolutas de Cambio o Devolución (Inaplicabilidad SERNAC B2B)
                </span>
                <p className="text-xs text-[#5C5A55] leading-relaxed">
                  Conforme a la normativa chilena para actos de comercio entre empresas (donde no aplican las normas de retracto de la Ley del Consumidor / SERNAC aplicables a consumidores finales), la política de Venta Firme establece que:
                </p>
                <ul className="list-disc pl-5 text-xs text-[#5C5A55] space-y-1">
                  <li><strong className="text-[#0F0F0F]">NO hay cambios por rotación de inventario:</strong> La óptica asume el riesgo comercial de venta en sus locales.</li>
                  <li><strong className="text-[#0F0F0F]">NO hay cambios por cambio de opinión o arrepentimiento:</strong> Una vez procesada la orden y emitida la Factura Electrónica, la venta es irrevocable.</li>
                  <li><strong className="text-[#0F0F0F]">NO hay cambios por errores de elección de la óptica:</strong> Siendo el pedido 100% combinable y seleccionado autónomamente en la plataforma, las equivocaciones en marca, modelo, calibre o color son de exclusiva responsabilidad del comprador.</li>
                </ul>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FFFFFF] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] block">
                  3. Únicas Causales Aceptadas y Plazo Fatal de Notificación (5 Días Hábiles)
                </span>
                <p className="text-xs text-[#5C5A55] leading-relaxed">
                  Solo se aceptan reportes derivados de <strong className="text-[#0F0F0F]">daños evidentes ocurridos durante el transporte nacional</strong> o <strong className="text-[#0F0F0F]">defectos estructurales de fábrica</strong>. Para que el reporte sea admisible, debe cumplirse obligatoriamente con:
                </p>
                <div className="mt-2 p-3.5 bg-[#FAF6ED] border border-[#E6D7B8] space-y-2">
                  <ul className="list-disc pl-5 text-xs text-[#5C5A55] space-y-1.5">
                    <li>
                      <strong className="text-[#0F0F0F]">Plazo Fatal Improrrogable:</strong> Debe ser informado dentro de los primeros <strong className="text-[#0F0F0F]">cinco (5) días hábiles</strong> contados exactamente desde la recepción física del pedido consignada por el transportista.
                    </li>
                    <li>
                      <strong className="text-[#0F0F0F]">Canal Exclusivo:</strong> Notificación vía WhatsApp B2B oficial (<strong className="text-[#0F0F0F]">+56 9 8933 8537</strong>) o correo <a href="mailto:contacto@optihub.cl" className="text-[#9E8256] underline font-medium">contacto@optihub.cl</a>.
                    </li>
                    <li>
                      <strong className="text-[#0F0F0F]">Respaldo Audiovisual Obligatorio:</strong> Envío de registro fotográfico nítido y/o video continuo del desempaque y del daño o defecto, adjuntando la Factura Electrónica emitida por OPTICA MULTIFOCUS LIMITADA y el código de SKU de la pieza.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FAF9F6] space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F] block">
                  4. Firmeza Definitiva y Resolución de Casos Válidos
                </span>
                <p className="text-xs text-[#5C5A55] leading-relaxed">
                  Vencido el plazo fatal de cinco (5) días hábiles, o verificado que la unidad egresó conforme de nuestro control unitario de calidad en Chile, <strong className="text-[#0F0F0F]">la venta es definitivamente firme y no existen devoluciones ni reembolsos de dinero bajo ningún concepto</strong>.
                </p>
                <p className="text-xs text-[#5C5A55] leading-relaxed">
                  En los casos que cumplan con todos los requisitos y resulten validados técnicamente por nuestro equipo, la óptica podrá optar por la <strong className="text-[#0F0F0F]">reposición prioritaria de la unidad en el siguiente embarque</strong> o la emisión de una <strong className="text-[#0F0F0F]">Nota de Crédito Electrónica SII en CLP</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* CONTACTO DE GARANTÍAS */}
          <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">
                Mesa de Soporte de Importaciones y Garantías
              </h4>
              <p className="text-xs text-[#5C5A55]">
                Canal exclusivo para ópticas y laboratorios con compras activas.
              </p>
            </div>
            <a
              href="https://wa.me/56989338537?text=Hola%2C%20requiero%20asistencia%20del%20departamento%20de%20Importaciones%20y%20Garant%C3%ADa%20Optihub"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <span>Contactar por WhatsApp</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
