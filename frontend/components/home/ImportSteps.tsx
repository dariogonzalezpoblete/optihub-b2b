'use client';

import React from 'react';
import { Package, Plane, Building, ShieldCheck, Clock } from 'lucide-react';

const STEPS = [
  {
    step: '01',
    icon: Package,
    title: 'Selección Combinable',
    subtitle: 'Mínimo 10 unidades',
    desc: 'Elige armazones oftálmicos o solares de cualquier marca en el catálogo. Puedes mezclar 1 de cada una sin restricciones.',
    badge: 'Sin pedido forzado',
  },
  {
    step: '02',
    icon: ShieldCheck,
    title: 'Consolidación Miami',
    subtitle: 'Control de Calidad USA',
    desc: 'Nuestro centro logístico en Florida recibe las piezas, verifica autenticidad, estuches de fábrica y prepara el embarque aéreo.',
    badge: '100% Auténticos',
  },
  {
    step: '03',
    icon: Plane,
    title: 'Desaduanamiento SII',
    subtitle: 'Arancel e IVA Incluidos',
    desc: 'Gestionamos la internación legal en Santiago. Todos los impuestos aduaneros están calculados y emites factura con IVA crédito fiscal.',
    badge: 'DTE Factura Electrónica',
  },
  {
    step: '04',
    icon: Building,
    title: 'Entrega en tu Óptica',
    subtitle: '10 a 15 días hábiles',
    desc: 'Despacho asegurado puerta a puerta en tu local u óptica en cualquiera de las 16 regiones de Chile con número de seguimiento.',
    badge: 'Todo Chile',
  },
];

export default function ImportSteps() {
  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <span className="text-xs font-bold text-[#B89768] uppercase tracking-widest block mb-2 font-mono">
          Cadena Logística Internacional
        </span>
        <h2 className="font-editorial text-3xl sm:text-4xl font-normal text-[#111111] tracking-tight">
          ¿Cómo Funciona la Importación para tu Óptica?
        </h2>
        <p className="text-[#575551] text-sm mt-3 leading-relaxed">
          Sin intermediarios ni contingencias arancelarias. Un proceso transparente y consolidado desde Miami hasta tu vitrina.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.step}
              className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 flex flex-col justify-between hover:border-[#B89768] transition-all duration-300 shadow-xs group relative overflow-hidden"
            >
              {/* Marca de agua de paso */}
              <span className="absolute top-4 right-4 text-4xl font-black text-[#E5E4DF]/60 group-hover:text-[#B89768]/20 transition-colors font-tech pointer-events-none">
                {s.step}
              </span>

              <div>
                <div className="w-12 h-12 rounded-2xl bg-[#FAF9F6] text-[#B89768] border border-[#E5E4DF] flex items-center justify-center mb-5 group-hover:bg-[#111111] group-hover:text-white transition-colors shadow-2xs">
                  <Icon className="w-6 h-6 stroke-[1.8]" />
                </div>

                <span className="inline-block px-2.5 py-0.5 rounded-full bg-[#F7F3EB] border border-[#B89768]/30 text-[#9E7D4F] text-[10px] font-semibold uppercase tracking-wider mb-2">
                  {s.badge}
                </span>

                <h3 className="font-editorial text-xl font-semibold text-[#111111] tracking-tight mt-1">
                  {s.title}
                </h3>
                <span className="text-xs text-[#82807A] font-semibold block mb-2 font-tech">
                  {s.subtitle}
                </span>

                <p className="text-[#575551] text-xs leading-relaxed">
                  {s.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-[#E5E4DF] flex items-center gap-1.5 text-[11px] text-[#82807A] font-medium font-tech">
                <Clock className="w-3.5 h-3.5 text-[#B89768]" />
                <span>Paso {idx + 1} de 4</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
