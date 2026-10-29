import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import {
  FileText,
  ShieldCheck,
  Building2,
  Truck,
  Layers,
  Receipt,
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Términos y Condiciones Mayoristas B2B | OPTIHUB Chile',
  description:
    'Condiciones generales de contratación y venta mayorista B2B para ópticas en Chile. Regla de compra mínima (MOQ) de 10 unidades, Factura Electrónica SII en CLP y logística directa desde EE. UU.',
  alternates: {
    canonical: '/terminos-y-condiciones',
  },
};

export default function TerminosYCondicionesPage() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F]">
      {/* HEADER EDITORIAL */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-8 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold">
              MARCO REGULATORIO Y COMERCIAL B2B
            </span>
          </div>
          <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
            Términos y Condiciones Mayoristas
          </h1>
          <p className="text-[#5C5A55] text-sm sm:text-base mt-4 max-w-3xl leading-relaxed">
            Las presentes estipulaciones rigen de manera exclusiva los actos y contratos comerciales de abastecimiento celebrados entre <strong className="text-[#0F0F0F] font-semibold">OPTICA MULTIFOCUS LIMITADA</strong> (RUT 78.044.452-5, operadora comercial de la plataforma mayorista <strong className="text-[#0F0F0F]">OPTIHUB</strong>) y las ópticas, profesionales de la salud visual y personas jurídicas del rubro acreditadas en el territorio de la República de Chile.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-wider text-[#787670] font-mono">
            <span>Última actualización: Octubre 2026</span>
            <span>•</span>
            <span>Versión 2.4 - República de Chile</span>
            <span>•</span>
            <span className="text-[#2D6A4F] font-semibold">Vigente</span>
          </div>
        </div>
      </div>

      {/* TARJETAS RESUMEN EJECUTIVO */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Building2 className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Exclusivo B2B</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Venta restringida a ópticas con RUT y Giro comercial acreditado ante el SII.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">MOQ 10 Unidades</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Lote mínimo de 10 armazones con total libertad de combinar marcas y modelos.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Receipt className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">Factura SII (CLP)</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              DTE formal con IVA (19%) 100% deducible como crédito fiscal para su empresa.
            </p>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-5 shadow-xs">
            <div className="w-8 h-8 bg-[#F7F3EB] border border-[#9E8256]/30 flex items-center justify-center text-[#9E8256] mb-3">
              <Truck className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">10-15 Días Hábiles</h3>
            <p className="text-[11px] text-[#5C5A55] mt-1 leading-relaxed">
              Tránsito internacional USA-Chile consolidado y nacionalizado puerta a puerta.
            </p>
          </div>
        </div>
      </div>

      {/* CONTENIDO DEL MARCO CONTRACTUAL */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-14 space-y-12 shadow-xs">

          {/* CLÁUSULA 1 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA PRIMERA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Naturaleza de la Plataforma y Restricción Exclusiva B2B
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              <strong className="text-[#0F0F0F]">OPTIHUB</strong> opera en Chile de forma exclusiva como un hub digital de abastecimiento mayorista de óptica orientado a transacciones entre empresas (<em className="font-serif">Business-to-Business</em>). En consecuencia:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>
                <strong className="text-[#0F0F0F]">No se comercializan productos a consumidores finales (B2C):</strong> Queda estrictamente excluida la venta a personas naturales que adquieran productos para uso o consumo particular.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Inaplicabilidad de Normativa SERNAC / Retracto:</strong> Por tratarse de contratos de compraventa mercantil entre personas jurídicas o comerciantes para su reventa o inserción productiva, <strong className="text-[#0F0F0F]">no aplican las disposiciones sobre derecho a retracto unilateral de la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores</strong>, rigiéndose íntegramente por el Código de Comercio de Chile.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Validación KYC (Know Your Customer) Óptico:</strong> Para habilitar la visualización de valores netos mayoristas y procesar órdenes de compra, la entidad solicitante debe acreditar un RUT de persona jurídica o natural con inicio de actividades vigente ante el Servicio de Impuestos Internos (SII) en giros afines (venta minorista de artículos ópticos, consultas oftalmológicas, centros médicos, talleres de biselado o distribución afín).
              </li>
              <li>
                OPTICA MULTIFOCUS LIMITADA se reserva la facultad de suspender o revocar el acceso a aquellas cuentas que no suministren acreditación tributaria verosímil.
              </li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 2 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA SEGUNDA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Regla de Compra Mínima (MOQ) y Flexibilidad de Lote
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Con el propósito de garantizar economías de escala en el flete aéreo internacional y brindar tarifas directas de origen:
            </p>
            <div className="bg-[#FAF9F6] border-l-2 border-[#9E8256] p-4 text-xs sm:text-sm text-[#0F0F0F] space-y-2">
              <p className="font-semibold">
                Cantidad Mínima de Pedido (MOQ): 10 Unidades Combinables por Orden.
              </p>
              <p className="text-[#5C5A55]">
                La óptica cliente <strong className="text-[#0F0F0F]">no está obligada</strong> a adquirir 10 armazones del mismo modelo o marca. El carro de compras mayorista permite combinar libremente marcas (ej. Tom Ford, Burberry, Ferragamo, Guess, Nike, etc.), modelos oftálmicos, solares, materiales y calibres hasta alcanzar o superar el umbral mínimo de diez (10) piezas.
              </p>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              El motor de compras de OPTIHUB bloquea automáticamente el paso a checkout si la suma total de piezas es inferior a 10 unidades. Pedidos de mayor volumen (50, 100 o más piezas) pueden ser coordinados con condiciones comerciales preferenciales mediante nuestro canal corporativo.
            </p>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 3 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA TERCERA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Facturación Electrónica SII, Moneda y Régimen Tributario
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Todas las operaciones celebradas en la plataforma se rigen íntegramente por la legislación tributaria chilena (D.L. 825 sobre Impuesto a las Ventas y Servicios y D.L. 824 sobre Impuesto a la Renta):
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>
                <strong className="text-[#0F0F0F]">Moneda de Transacción:</strong> Los precios mayoristas se visualizan y liquidan en <strong className="text-[#0F0F0F]">Pesos Chilenos (CLP)</strong>.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Factura Electrónica (DTE):</strong> Toda compra genera la emisión legal de una Factura Electrónica emitida por OPTICA MULTIFOCUS LIMITADA (RUT 78.044.452-5), informada oportunamente al SII y transmitida vía correo electrónico de intercambio DTE al cliente.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Crédito Fiscal IVA 19%:</strong> El Impuesto al Valor Agregado (19%) desglosado en la factura constituye crédito fiscal deducible íntegramente por la óptica adquirente contra sus débitos fiscales mensuales (Formulario 29 SII).
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Sin Sorpresas Aduaneras:</strong> El valor facturado es el costo final nacionalizado. El comprador no deberá sufragar ningún tributo aduanero adicional ni honorarios de agentes despachadores al recibir su encargo.
              </li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 4 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA CUARTA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Logística Internacional USA-Chile y Plazos de Tránsito
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Los productos ofrecidos en el catálogo mayorista se encuentran resguardados en depósitos autorizados y centros de acopio en los Estados Unidos de América (Miami, FL):
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>
                <strong className="text-[#0F0F0F]">Plazo de Tránsito Estimado:</strong> El plazo ordinario de consolidación aérea, traslado internacional, internación aduanera y despacho final puerta a puerta comprende un rango de <strong className="text-[#0F0F0F]">10 a 15 días hábiles</strong> contados desde la confirmación del pago del pedido.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Entrega Nacionalizada Puerta a Puerta:</strong> OPTIHUB coordina la entrega en la dirección comercial declarada por la óptica en cualquier comuna de Chile mediante operadores logísticos certificados con guía de despacho y seguimiento en línea.
              </li>
              <li>
                <strong className="text-[#0F0F0F]">Fuerza Mayor y Contingencias Aduaneras:</strong> Eventuales retrasos originados por inspecciones extraordinarias del Servicio Nacional de Aduanas de Chile, fiscalizaciones sanitarias, cancelaciones de vuelos internacionales o catástrofes naturales serán informados prontamente al cliente, sin que ello constituya incumplimiento imputable a OPTIHUB.
              </li>
            </ul>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 5 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA QUINTA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Medios de Pago y Formalización del Pedido
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              La formalización del pedido requiere la recepción conforme de los fondos a través de los canales autorizados en la plataforma:
            </p>
            <ul className="list-disc pl-5 text-xs sm:text-sm text-[#5C5A55] space-y-2">
              <li>Transferencia electrónica de fondos directa a la cuenta corriente bancaria de OPTICA MULTIFOCUS LIMITADA en Chile.</li>
              <li>Pasarelas seguras habilitadas (Mercado Pago, tarjetas de débito/crédito con protocolo Webpay / 3D Secure).</li>
            </ul>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Una vez acreditado el pago, se procede a la emisión inmediata de la orden de consolidación logística en origen y asignación de código único de seguimiento.
            </p>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 6 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA SEXTA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Política Estricta de Venta Firme, Control de Calidad y Régimen de Garantías
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Las adquisiciones realizadas en OPTIHUB constituyen contratos de compraventa mercantil entre partes comerciales regulados por el Código de Comercio de la República de Chile (artículos 130, 144, 158 y siguientes). Conforme a la legislación chilena y a las características técnicas y logísticas de la importación internacional consolidada, las partes estipulan expresamente las siguientes condiciones esenciales:
            </p>

            <div className="bg-[#FAF9F6] border-l-2 border-[#9E8256] p-4 text-xs sm:text-sm text-[#0F0F0F] space-y-2">
              <p className="font-semibold uppercase tracking-wider text-[11px] text-[#846C44]">
                1. Naturaleza Jurídica de Venta Firme (Firm Sale) e Inviabilidad de Retorno a Origen
              </p>
              <p className="text-[#5C5A55] leading-relaxed">
                Toda orden confirmada y facturada opera bajo el principio comercial vinculante de <strong className="text-[#0F0F0F]">VENTA FIRME</strong>. Debido a los elevados costos de flete aéreo internacional, aranceles aduaneros de internación en Chile (DDP) y la complejidad logística de reexportación internacional hacia Estados Unidos, <strong className="text-[#0F0F0F]">es absolutamente inviable realizar devoluciones de mercadería o despachos de retorno hacia origen</strong>.
              </p>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              <div className="p-4 border border-[#E6E2DD] bg-[#FFFFFF] space-y-2">
                <strong className="text-[#0F0F0F] block uppercase tracking-wider text-[11px]">
                  2. Riguroso Control de Calidad Unitario en Chile Previo al Despacho
                </strong>
                <p>
                  Para salvaguardar la confianza de las ópticas asociadas, <strong className="text-[#0F0F0F]">el 100% de los armazones importados es sometido en Chile a una inspección física y técnica individual antes de ser entregado al operador logístico nacional</strong>. Este control unitario audita:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Alineación estructural de aros, puente, varillas y plaquetas.</li>
                  <li>Tensión, fijación y recorrido mecánico de bisagras rígidas y sistemas flex.</li>
                  <li>Ausencia absoluta de rayas, fisuras, porosidades o astilladuras en frentes y terminales.</li>
                  <li>Inclusión íntegra del empaque oficial de vitrina por unidad: estuche rígido original de la marca, paño de microfibra oficial y folletería técnica de fábrica.</li>
                </ul>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FAF4F4]/40 space-y-2">
                <strong className="text-[#9E3838] block uppercase tracking-wider text-[11px]">
                  3. Exclusiones Absolutas de Cambio o Devolución (Inaplicabilidad de Retracto SERNAC)
                </strong>
                <p>
                  En conformidad con la legislación mercantil chilena —en la cual la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores y las facultades de retracto unilateral del SERNAC <strong className="text-[#0F0F0F]">no aplican a transacciones entre empresas (B2B)</strong> para la reventa o integración en actividades comerciales—, <strong className="text-[#0F0F0F]">queda estrictamente prohibido y no procederá cambio ni devolución alguna fundado en</strong>:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[#5C5A55]">
                  <li><strong className="text-[#0F0F0F]">Baja rotación de inventario:</strong> La óptica adquirente asume íntegramente el riesgo comercial de rotación y venta en sus locales.</li>
                  <li><strong className="text-[#0F0F0F]">Cambio de opinión o arrepentimiento:</strong> No se admiten cancelaciones ni retractos una vez emitida la Factura Electrónica.</li>
                  <li><strong className="text-[#0F0F0F]">Errores de elección atribuibles a la óptica:</strong> Siendo el catálogo mayorista 100% combinable y configurable por la óptica (marcas, modelos, calibres, colores), cualquier error al conformar el lote es de responsabilidad exclusiva del comprador.</li>
                </ul>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FFFFFF] space-y-2">
                <strong className="text-[#0F0F0F] block uppercase tracking-wider text-[11px]">
                  4. Únicas Causales Admitidas: Daño Evidente de Transporte o Defecto de Fábrica
                </strong>
                <p>
                  Únicamente serán admitidos reportes comerciales por:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong className="text-[#0F0F0F]">Daño evidente originado en el transporte nacional:</strong> Deformación, quiebre o aplastamiento derivado del traslado.</li>
                  <li><strong className="text-[#0F0F0F]">Vicio o defecto estructural de fabricación:</strong> Fallas no imputables a manipulación en taller óptico, forzamiento de bisagras o biselado de cristales.</li>
                </ul>
                <div className="mt-3 p-3.5 bg-[#FAF6ED] border border-[#E6D7B8] space-y-2">
                  <p className="font-semibold text-[#846C44] uppercase tracking-wider text-[10px]">
                    Requisitos Formales y Plazo Fatal para la Notificación:
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#5C5A55]">
                    <li>
                      <strong className="text-[#0F0F0F]">Plazo Fatal Improrrogable:</strong> Máximo de <strong className="text-[#0F0F0F]">cinco (5) días hábiles</strong> contados exactamente desde la recepción física del bulto según la guía del transportista.
                    </li>
                    <li>
                      <strong className="text-[#0F0F0F]">Canal Obligatorio:</strong> Comunicación remitida formalmente vía WhatsApp B2B corporativo al <strong className="text-[#0F0F0F]">+56 9 8933 8537</strong> o al correo <a href="mailto:contacto@optihub.cl" className="text-[#9E8256] underline font-medium">contacto@optihub.cl</a>.
                    </li>
                    <li>
                      <strong className="text-[#0F0F0F]">Respaldo Audiovisual Indispensable:</strong> Registro fotográfico en alta resolución y/o video continuo del desempaque y del daño/defecto, individualizando el SKU y adjuntando la Factura Electrónica emitida por OPTICA MULTIFOCUS LIMITADA.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 border border-[#E6E2DD] bg-[#FAF9F6] space-y-2">
                <strong className="text-[#0F0F0F] block uppercase tracking-wider text-[11px]">
                  5. Firmeza Definitiva y Caducidad
                </strong>
                <p className="leading-relaxed">
                  Vencido el plazo fatal de cinco (5) días hábiles sin recepción de reclamo formal respaldado, o verificado en nuestros registros que la pieza egresó en perfectas condiciones del control de calidad unitario en Chile, <strong className="text-[#0F0F0F]">la venta es jurídicamente firme y definitiva, extinguiéndose toda acción ulterior y no existiendo bajo ningún concepto devoluciones de piezas ni reembolsos de dinero</strong>.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 7 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA SÉPTIMA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Propiedad Intelectual y Marcas Comerciales
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Todas las marcas, logos, denominaciones de modelos e insignias de diseñador exhibidos en el catálogo corresponden a la propiedad industrial e intelectual exclusiva de sus respectivos titulares y fabricantes mundiales. La exhibición de las mismas en el portal OPTIHUB responde exclusivamente a fines informativos de identificación y comercialización legítima de productos originales adquiridos en los canales mayoristas autorizados de Estados Unidos.
            </p>
          </section>

          <hr className="border-[#E6E2DD]" />

          {/* CLÁUSULA 8 */}
          <section className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[#9E8256] px-2 py-0.5 bg-[#FAF6ED] border border-[#E6D7B8]">
                CLÁUSULA OCTAVA
              </span>
              <h2 className="font-serif text-xl sm:text-2xl text-[#0F0F0F] font-normal">
                Legislación Aplicable, Jurisdicción y Contacto
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
              Las presentes estipulaciones contractuales se rigen e interpretan con arreglo a las leyes de la <strong className="text-[#0F0F0F]">República de Chile</strong>. Para todos los efectos legales que pudieran derivarse de los actos y contratos celebrados a través de la plataforma, las partes se someten expresamente a la competencia de los Tribunales Ordinarios de Justicia de Santiago de Chile. Toda comunicación o notificación formal debe dirigirse al canal oficial: <a href="mailto:contacto@optihub.cl" className="text-[#9E8256] underline font-medium">contacto@optihub.cl</a>.
            </p>
          </section>

          {/* ATENCIÓN AL CLIENTE B2B */}
          <div className="bg-[#FAF9F6] border border-[#E6E2DD] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center sm:text-left">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F0F0F]">
                ¿Requiere asesoría legal o comercial personalizada?
              </h4>
              <p className="text-xs text-[#5C5A55]">
                Nuestro equipo legal y de cuentas corporativas está disponible de lunes a viernes de 09:00 a 18:30 hrs.
              </p>
            </div>
            <a
              href="https://wa.me/56989338537?text=Hola%2C%20requiero%20asistencia%20respecto%20a%20los%20T%C3%A9rminos%20y%20Condiciones%20B2B"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors whitespace-nowrap"
            >
              <span>Consultar por WhatsApp</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
            </a>
          </div>

        </div>
      </div>
    </div>
  );
}
