'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Calculator, ArrowRight, TrendingUp, DollarSign, CheckCircle2, Sparkles } from 'lucide-react';

export default function ProfitSimulator() {
  const [units, setUnits] = useState<number>(20);
  const [costClp, setCostClp] = useState<number>(34000);
  const [retailClp, setRetailClp] = useState<number>(89000);

  const totalCost = units * costClp;
  const totalRevenue = units * retailClp;
  const netProfit = totalRevenue - totalCost;
  const marginPercent = Math.round((netProfit / totalCost) * 100);
  const ivaDeductible = Math.round(totalCost * 0.19);

  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-emerald-500/30 rounded-3xl p-8 sm:p-12 shadow-2xl relative overflow-hidden">
        
        {/* Glow decorativo de fondo */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
          
          {/* Lado izquierdo: Explicación y Controles */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wider uppercase mb-3">
                <Calculator className="w-3.5 h-3.5" />
                <span>Simulador de Rentabilidad Óptica</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
                Calcula el Retorno de tu Inversión
              </h2>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                Nuestros precios directos de importación en Miami permiten a tu óptica obtener márgenes comerciales de hasta +160% en marcas reconocidas.
              </p>
            </div>

            {/* Slider de unidades */}
            <div className="bg-slate-950/70 p-5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-300 font-semibold">Armazones a importar (combinables):</span>
                <span className="text-xl font-black text-emerald-400 font-mono">{units} unidades</span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="5"
                value={units}
                onChange={(e) => setUnits(parseInt(e.target.value, 10))}
                className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Mínimo 10 un.</span>
                <span>30 un. (Óptimo)</span>
                <span>60 un. (Mayorista)</span>
              </div>
            </div>

            {/* Ajustes de precios interactivos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  Costo promedio OptiHub (Neto):
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">$</span>
                  <input
                    type="number"
                    step="1000"
                    min="15000"
                    max="100000"
                    value={costClp}
                    onChange={(e) => setCostClp(Math.max(1000, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">CLP</span>
                </div>
              </div>

              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                <label className="text-xs text-slate-400 block mb-1.5 font-medium">
                  Precio de venta en tu óptica:
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">$</span>
                  <input
                    type="number"
                    step="1000"
                    min="20000"
                    max="200000"
                    value={retailClp}
                    onChange={(e) => setRetailClp(Math.max(1000, parseInt(e.target.value, 10) || 0))}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-sm focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">CLP</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-2">
              <div className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Factura SII con IVA crédito ({ivaDeductible.toLocaleString('es-CL')} CLP deducible)</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Despacho puerta a puerta asegurado</span>
              </div>
            </div>
          </div>

          {/* Lado derecho: Tarjeta de Resultados Visuales */}
          <div className="lg:col-span-5 bg-slate-950 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-emerald-500/5">
            <div className="space-y-5">
              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Inversión Neta</span>
                <span className="text-lg font-bold text-white font-mono">
                  ${totalCost.toLocaleString('es-CL')} CLP
                </span>
              </div>

              <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Venta Estimada en Óptica</span>
                <span className="text-lg font-bold text-white font-mono">
                  ${totalRevenue.toLocaleString('es-CL')} CLP
                </span>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-center">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 block mb-1">
                  Ganancia Neta Estimada para tu Óptica
                </span>
                <span className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono block">
                  +${netProfit.toLocaleString('es-CL')} CLP
                </span>
                <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>Margen de rentabilidad: +{marginPercent}%</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-5 border-t border-slate-800">
              <Link
                href="/catalogo"
                className="w-full py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5"
              >
                <span>Armar Orden en Catálogo</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
