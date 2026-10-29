'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ArrowRight, HelpCircle } from 'lucide-react';
import { trackB2BEvent } from '@/lib/analytics';

interface FaqItem {
  question: string;
  answer: string;
  linkText?: string;
  linkHref?: string;
}

const FAQS: FaqItem[] = [
  {
    question: '¿Puedo mezclar distintas marcas y modelos para cumplir el mínimo de 10 unidades?',
    answer:
      'Sí, el pedido mínimo de 10 unidades es 100% combinable. Tu óptica no tiene obligación de comprar cantidades mínimas de un mismo modelo o marca. Puedes elegir libremente armazones de alta gama, sport o best sellers (ej. Tom Ford, Burberry, Guess, Nike, Ferragamo, etc.) hasta sumar 10 piezas en tu pedido mayorista.',
    linkText: 'Conocer política de compra mínima (MOQ)',
    linkHref: '/terminos-y-condiciones',
  },
  {
    question: '¿Los armazones incluyen su estuche y accesorios originales?',
    answer:
      'Sí, todos los armazones se entregan como producto completo de vitrina con su estuche oficial de la marca, paño de microfibra serigrafiado y folletería de fábrica garantizada. Todos los productos son 100% auténticos con trazabilidad directa desde distribuidores matrices en EE. UU.',
    linkText: 'Ver garantía de autenticidad y packaging',
    linkHref: '/politicas-importacion-y-garantia',
  },
  {
    question: '¿Debo hacer algún trámite en Aduana o pagar impuestos extra al recibir en Chile?',
    answer:
      'No. El valor B2B facturado en pesos chilenos es el costo final nacionalizado bajo modalidad DDP ("llave en mano"). OPTIHUB gestiona íntegramente el flete aéreo internacional, la internación aduanera y el pago de aranceles ante el Servicio Nacional de Aduanas. Recibes en tu óptica con Factura Electrónica SII afecta a IVA para deducir crédito fiscal.',
    linkText: 'Revisar políticas de importación DDP',
    linkHref: '/politicas-importacion-y-garantia',
  },
  {
    question: '¿Por qué los precios mayoristas están ocultos al público general?',
    answer:
      'Para resguardar la rentabilidad y los márgenes de nuestras ópticas asociadas frente al cliente final. Solo profesionales, laboratorios y empresas del rubro con RUT y giro comercial activo verificado ante el Servicio de Impuestos Internos (SII) pueden acceder a la lista de precios netos por volumen.',
    linkText: 'Registrar óptica para ver precios netos',
    linkHref: '/registro',
  },
  {
    question: '¿Cómo opera la garantía y devoluciones ante defectos de fábrica o transporte?',
    answer:
      'Operamos bajo una política estricta de venta firme B2B: cada armazón atraviesa un riguroso control de calidad unitario en Chile antes de su despacho, y debido a la logística internacional no existen cambios por rotación de stock, cambio de opinión ni retracto. Únicamente se aceptan reportes por daños evidentes de transporte o defectos de fábrica informados obligatoriamente dentro de los primeros 5 días hábiles desde la recepción física, respaldados por fotos o video a nuestro WhatsApp B2B (+56 9 8933 8537), procediendo a reposición prioritaria o Nota de Crédito Electrónica SII.',
    linkText: 'Ver políticas de venta firme y garantías B2B',
    linkHref: '/politicas-importacion-y-garantia',
  },
  {
    question: '¿Despachan a todas las regiones de Chile?',
    answer:
      'Sí, despachamos pedidos consolidados puerta a puerta a las 16 regiones de Chile (de Arica a Magallanes). Cada embarque cuenta con número de seguimiento en línea y seguro de transporte para resguardar la carga hasta su entrega física en tu óptica o taller.',
    linkText: 'Consultar cobertura de envíos',
    linkHref: '/terminos-y-condiciones',
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  // Datos estructurados JSON-LD (Schema.org / FAQPage)
  const faqJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer,
        },
      })),
    }),
    []
  );

  return (
    <section id="faq" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto scroll-mt-20">
      {/* JSON-LD Script para SEO de Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="border border-[#E6E2DD] bg-[#FFFFFF] p-8 sm:p-14">
        {/* ENCABEZADO DE SECCIÓN */}
        <div className="max-w-3xl mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold">
              RESOLUCIÓN DE DUDAS B2B
            </span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
            Preguntas Frecuentes
          </h2>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 leading-relaxed max-w-2xl">
            Todo lo que tu óptica necesita saber sobre la regla de lote mínimo (MOQ 10 u.), facturación SII, internación consolidada desde EE. UU. y garantías de fábrica.
          </p>
        </div>

        {/* ACORDEÓN INTERACTIVO DE 6 PREGUNTAS */}
        <div className="divide-y divide-[#E6E2DD] border-y border-[#E6E2DD]">
          {FAQS.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={faq.question} className="py-5 transition-colors">
                <button
                  type="button"
                  onClick={() => toggle(index)}
                  className="w-full flex items-center justify-between text-left gap-4 focus:outline-none group cursor-pointer"
                  aria-expanded={isOpen}
                >
                  <span className="font-serif text-base sm:text-lg text-[#0F0F0F] group-hover:text-[#9E8256] transition-colors leading-snug">
                    {faq.question}
                  </span>
                  <div
                    className={`w-7 h-7 border border-[#E6E2DD] flex items-center justify-center shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 bg-[#FAF9F6] text-[#9E8256]' : 'text-[#787670]'
                    }`}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3.5 pr-8 space-y-3">
                    <p className="text-xs sm:text-sm text-[#5C5A55] leading-relaxed">
                      {faq.answer}
                    </p>
                    {faq.linkHref && faq.linkText && (
                      <div>
                        <Link
                          href={faq.linkHref}
                          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-semibold text-[#9E8256] hover:text-[#0F0F0F] transition-colors"
                        >
                          <span>{faq.linkText}</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ASISTENCIA DIRECTA WHATSAPP */}
        <div className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#FAF9F6] border border-[#E6E2DD] p-5 text-center sm:text-left">
          <div className="text-xs text-[#5C5A55]">
            <strong className="text-[#0F0F0F] block">¿Tienes una consulta específica sobre tu óptica o RUT tributario?</strong>
            <span>Atención comercial directa de lunes a viernes con nuestro equipo en Santiago de Chile.</span>
          </div>
          <a
            href="https://wa.me/56989338537?text=Hola%20equipo%20OPTIHUB%2C%20escribo%20desde%20una%20%C3%B3ptica%20en%20Chile%20y%20tengo%20una%20consulta%20sobre%20el%20abastecimiento%20mayorista"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackB2BEvent('click_whatsapp_b2b', {
                source: 'faq',
              });
            }}
            className="inline-flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-5 py-2.5 text-[10px] uppercase tracking-[0.18em] transition-colors shrink-0"
          >
            <span>Consultar al WhatsApp B2B</span>
            <ArrowRight className="w-3 h-3 text-[#9E8256]" />
          </a>
        </div>

      </div>
    </section>
  );
}
