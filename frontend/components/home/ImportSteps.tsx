'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Building2, 
  Layers, 
  Receipt, 
  Truck, 
  ArrowRight, 
  ShieldCheck, 
  CheckCircle2 
} from 'lucide-react';

const STEPS = [
  {
    step: '01',
    icon: Building2,
    title: 'Registra tu Óptica',
    desc: 'Validación rápida de RUT y giro comercial en el SII para proteger los márgenes del canal óptico.',
    badge: 'Validación SII',
    highlight: 'Acceso exclusivo B2B',
  },
  {
    step: '02',
    icon: Layers,
    title: 'Arma tu Lote Combinable (MOQ 10 u.)',
    desc: 'Elige libremente entre más de 1,870 armazones de alta gama, sport y best sellers sin obligación de repetir modelo.',
    badge: '100% Combinable',
    highlight: 'Sin mínimos por modelo',
  },
  {
    step: '03',
    icon: Receipt,
    title: 'Pago Nacional y Factura SII',
    desc: 'Paga en pesos chilenos y recibe tu Factura Electrónica afecta a IVA para aprovechar el crédito fiscal.',
    badge: 'Crédito Fiscal IVA',
    highlight: 'En Pesos Chilenos (CLP)',
  },
  {
    step: '04',
    icon: Truck,
    title: 'Recepción Puerta a Puerta (10-15 días hábiles)',
    desc: 'Despacho consolidado desde EE. UU. directo a tu óptica en cualquiera de las 16 regiones de Chile, con aduana e internación 100% gestionadas por OPTIHUB.',
    badge: 'Modalidad DDP',
    highlight: '16 regiones de Chile',
  },
];

export default function ImportSteps() {
  return (
    <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="border border-[#E6E2DD] bg-[#FFFFFF] p-8 sm:p-14">
        
        {/* ENCABEZADO EDITORIAL DE SECCIÓN */}
        <div className="max-w-3xl mb-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-6 h-[1px] bg-[#9E8256]" />
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-semibold">
              LOGÍSTICA MAYORISTA USA-CHILE LLAVE EN MANO
            </span>
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
            ¿Cómo funciona la importación consolidada OPTIHUB?
          </h2>
          <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 leading-relaxed max-w-2xl">
            Abastece tu óptica con precios directos de origen en Estados Unidos a través de un flujo estructurado, seguro y con respaldo tributario chileno.
          </p>
        </div>

        {/* GRILLA DE 4 PASOS NUMERADOS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {STEPS.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div
                key={s.step}
                className="bg-[#FAF9F6] border border-[#E6E2DD] hover:border-[#0F0F0F] transition-all duration-300 p-6 sm:p-7 flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Marca de agua elegante con el número de paso */}
                <span className="absolute top-3 right-4 font-serif text-5xl font-light text-[#E6E2DD]/70 group-hover:text-[#9E8256]/30 transition-colors pointer-events-none select-none">
                  {s.step}
                </span>

                <div>
                  {/* Ícono contenedor sobrio */}
                  <div className="w-11 h-11 border border-[#E6E2DD] bg-[#FFFFFF] text-[#9E8256] flex items-center justify-center mb-5 group-hover:border-[#0F0F0F] group-hover:text-[#0F0F0F] transition-colors">
                    <Icon className="w-5 h-5 stroke-[1.7]" />
                  </div>

                  {/* Badge de estado */}
                  <span className="inline-block text-[9px] uppercase tracking-[0.18em] font-semibold text-[#846C44] bg-[#FAF6ED] border border-[#E6D7B8] px-2 py-0.5 mb-2.5 font-mono">
                    {s.badge}
                  </span>

                  {/* Título de Paso */}
                  <h3 className="font-serif text-lg sm:text-xl font-normal text-[#0F0F0F] tracking-tight leading-snug">
                    <span className="text-[#9E8256] font-mono text-sm block font-medium mb-0.5">
                      Paso {s.step}
                    </span>
                    {s.title}
                  </h3>

                  {/* Descripción detallada */}
                  <p className="text-[#5C5A55] text-xs leading-relaxed mt-2.5">
                    {s.desc}
                  </p>
                </div>

                {/* Sub-indicador inferior */}
                <div className="mt-6 pt-4 border-t border-[#E6E2DD] flex items-center justify-between text-[10px] text-[#787670] font-mono uppercase tracking-wider">
                  <span className="flex items-center gap-1.5 text-[#2D6A4F] font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-[#2D6A4F]" />
                    {s.highlight}
                  </span>
                  <span>{idx + 1}/4</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* BARRA INFERIOR DE ACCIÓN RÁPIDA B2B */}
        <div className="mt-10 pt-8 border-t border-[#E6E2DD] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="text-xs text-[#5C5A55]">
            <strong className="text-[#0F0F0F] block font-semibold">¿Listo para comenzar a cotizar armazones para tu óptica?</strong>
            <span>Sin costos de membresía ni contratos forzados. Comienza con solo 10 piezas combinables.</span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto flex-shrink-0">
            <Link
              href="/registro"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-[#0F0F0F] hover:bg-[#262626] text-white px-6 py-3 text-[11px] uppercase tracking-[0.2em] transition-colors border border-[#0F0F0F]"
            >
              <span>Registrar mi Óptica</span>
              <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
            </Link>
            <Link
              href="/catalogo"
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 bg-transparent hover:bg-[#FAF9F6] text-[#0F0F0F] px-6 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors border border-[#D5D0C8]"
            >
              <span>Ver Catálogo</span>
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}
