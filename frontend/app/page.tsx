'use client';

import React from 'react';
import Link from 'next/link';
import { ShoppingBag, ArrowRight, ShieldCheck, Truck, RefreshCw } from 'lucide-react';

const TODAS_LAS_MARCAS = [
  "Emporio Armani", "Gap", "Lacoste", "Nike Clip On", "Palm Angels", 
  "Kate Spade", "Zeiss", "Tom Ford", "Chopard", "Barton Perreira", 
  "Balenciaga", "Bollé", "Burberry", "Charriol", "Coach", 
  "Cutler and Gross", "DKNY", "Fila", "Flexon", "Fossil", 
  "Furla", "Gant", "Harley Davidson", "IC! Berlin", "Longchamp", 
  "Missoni", "Off-White", "Porsche Design", "Silhouette", "Versace", 
  "Karl Lagerfeld", "Nike"
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* HERO SECTION */}
      <section className="relative py-24 px-4 sm:px-8 max-w-7xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold text-sm mb-6">
          <ShieldCheck className="w-4 h-4" /> Distribución Exclusiva B2B para Ópticas
        </div>
        <h1 className="text-4xl sm:text-6xl font-black text-white uppercase tracking-tight max-w-4xl mx-auto leading-tight">
          Catálogo Mayorista de Armazones y Cristales
        </h1>
        <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mt-6 font-normal">
          Abastécete directamente con precios netos en CLP actualizados en tiempo real. Mínimo de pedido flexibilizado.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Link
            href="/catalogo"
            className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black uppercase text-base transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            Ver Catálogo Completo
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* MARCAS EXCLUSIVAS (31 MARCAS) */}
      <section id="marcas" className="py-16 px-4 max-w-7xl mx-auto">
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 sm:p-12">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">
              Nuestras Marcas Exclusivas ({TODAS_LAS_MARCAS.length})
            </h2>
            <p className="text-slate-400 mt-2">
              Selecciona una marca para explorar su catálogo mayorista
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {TODAS_LAS_MARCAS.map((marca) => (
              <Link
                key={marca}
                href={`/catalogo?marca=${encodeURIComponent(marca)}`}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center hover:border-emerald-500 transition-all hover:-translate-y-1 block group"
              >
                <h3 className="text-sm font-black text-white uppercase tracking-wider group-hover:text-emerald-400 transition-colors">
                  {marca}
                </h3>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CARACTERÍSTICAS DE SERVICIO */}
      <section className="py-16 px-4 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-white text-lg">Despacho Nacional</h4>
            <p className="text-slate-400 text-sm mt-1">Envíos coordinados directos a tu óptica en todo Chile.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-white text-lg">Mínimo Flexibilizado</h4>
            <p className="text-slate-400 text-sm mt-1">Arma tu pedido variado a partir de 10 unidades.</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-start gap-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-white text-lg">Stock en Tiempo Real</h4>
            <p className="text-slate-400 text-sm mt-1">Sincronización directa con inventario disponible.</p>
          </div>
        </div>
      </section>
    </div>
  );
}