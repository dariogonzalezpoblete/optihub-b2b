'use client';

import React from 'react';
import Link from 'next/link';
import { Package, Plane, CheckCircle2, Building, ShieldCheck, ArrowRight, Clock } from 'lucide-react';

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
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="text-center max-w-3xl mx-auto mb-14">
        <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-2">
          Cadena Logística Internacional
        </span>
        <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
          ¿Cómo Funciona la Importación para tu Óptica?
        </h2>
        <p className="text-slate-400 text-sm mt-3 leading-relaxed">
          Sin intermediarios ni sorpresas de aduana. Un proceso transparente y automatizado desde Miami hasta tu vitrina.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div
              key={s.step}
              className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 flex flex-col justify-between hover:border-emerald-500/40 hover:bg-slate-900 transition-all duration-300 shadow-xl group relative overflow-hidden"
            >
              {/* Marca de agua de paso */}
              <span className="absolute top-4 right-4 text-4xl font-black text-slate-800/40 group-hover:text-emerald-500/10 transition-colors font-mono pointer-events-none">
                {s.step}
              </span>

              <div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mb-5 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                  <Icon className="w-6 h-6" />
                </div>

                <span className="inline-block px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-emerald-300 text-[10px] font-bold uppercase tracking-wider mb-2">
                  {s.badge}
                </span>

                <h3 className="text-lg font-black text-white uppercase tracking-tight mt-1">
                  {s.title}
                </h3>
                <span className="text-xs text-slate-400 font-semibold block mb-2">
                  {s.subtitle}
                </span>

                <p className="text-slate-400 text-xs leading-relaxed">
                  {s.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800/70 flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paso {idx + 1} de 4</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
