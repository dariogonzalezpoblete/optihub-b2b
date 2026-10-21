'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowRight, 
  ShieldCheck, 
  Truck, 
  Building2, 
  Sparkles, 
  CheckCircle2, 
  Lock, 
  Glasses, 
  Layers, 
  Clock, 
  FileText,
  BadgePercent,
  SlidersHorizontal,
  Eye,
  Check
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import HeroSpotlight from '@/components/home/HeroSpotlight';
import ProfitSimulator from '@/components/home/ProfitSimulator';
import ImportSteps from '@/components/home/ImportSteps';
import RecentlyViewed from '@/components/catalog/RecentlyViewed';

interface MarcoDestacado {
  id_ext: string;
  marca: string;
  modelo: string;
  codigo_color?: string;
  precio_neto_clp: number;
  stock: number;
  imagen_principal?: string;
  material?: string;
  forma?: string;
}

export default function Home() {
  const { isLoggedIn, opticaData } = useAuth();
  const [destacados, setDestacados] = useState<MarcoDestacado[]>([]);
  const [loadingDestacados, setLoadingDestacados] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('todos');

  useEffect(() => {
    async function loadFeatured() {
      try {
        const { data, error } = await supabase
          .from('marcos')
          .select('id_ext, marca, modelo, codigo_color, precio_neto_clp, stock, imagen_principal, material, forma')
          .not('imagen_principal', 'is', null)
          .limit(16);

        if (!error && data) {
          setDestacados(data);
        }
      } catch (err) {
        console.error('Error cargando destacados:', err);
      } finally {
        setLoadingDestacados(false);
      }
    }

    loadFeatured();
  }, []);

  const filteredDestacados = useMemo(() => {
    if (activeFilter === 'todos') return destacados.slice(0, 8);
    if (activeFilter === 'guess') {
      return destacados.filter((d) => d.marca.toLowerCase().includes('guess')).slice(0, 8);
    }
    if (activeFilter === 'nike') {
      return destacados.filter((d) => d.marca.toLowerCase().includes('nike')).slice(0, 8);
    }
    if (activeFilter === 'acetato') {
      return destacados.filter((d) => (d.material || '').toLowerCase().includes('acetat')).slice(0, 8);
    }
    if (activeFilter === 'metal') {
      return destacados.filter((d) => (d.material || '').toLowerCase().includes('metal')).slice(0, 8);
    }
    return destacados.slice(0, 8);
  }, [destacados, activeFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      
      {/* 1. SECCIÓN HERO INTERACTIVA CON VITRINA 3D */}
      <section className="relative pt-6 sm:pt-10 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Glow de acento esmeralda */}
        <div className="absolute top-1/4 left-1/3 -translate-x-1/2 w-[650px] h-[350px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none -z-10" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Columna Izquierda: Mensaje Central B2B (7 columnas) */}
          <div className="lg:col-span-7 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-slate-950 border border-slate-800/90 rounded-3xl p-8 sm:p-12 flex flex-col justify-between shadow-2xl relative overflow-hidden">
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide uppercase mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Distribución Exclusiva B2B para Ópticas</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[1.06]">
                Catálogo Mayorista de Armazones de <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Primer Nivel</span>
              </h1>

              <p className="mt-6 text-slate-300 text-base sm:text-lg font-normal leading-relaxed max-w-xl">
                Importación directa desde EE.UU. con stock verificado en origen en tiempo real. Precios netos en CLP, factura electrónica SII y compra mínima de <strong className="text-emerald-400">10 unidades combinables</strong> entre cualquier modelo y marca.
              </p>
            </div>

            {/* CTAs y Resumen de Métricas */}
            <div className="relative z-10 mt-10 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Link
                  href="/catalogo"
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
                >
                  <span>Explorar Catálogo</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                {!isLoggedIn && (
                  <Link
                    href="/registro"
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm uppercase tracking-wider transition-all border border-slate-700/80 flex items-center justify-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>Registrar mi Óptica</span>
                  </Link>
                )}
              </div>

              {/* Métricas clave */}
              <div className="flex items-center gap-6 text-xs text-slate-400 font-semibold">
                <div>
                  <span className="block text-2xl font-black text-white font-mono">10 un.</span>
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Mínimo Combinable</span>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <span className="block text-2xl font-black text-emerald-400 font-mono">10-15</span>
                  <span className="text-[11px] text-slate-400 uppercase font-medium">Días Entrega</span>
                </div>
              </div>
            </div>

          </div>

          {/* Columna Derecha: Vitrina Interactiva de Monturas (5 columnas) */}
          <div className="lg:col-span-5 min-h-[460px]">
            <HeroSpotlight />
          </div>

        </div>
      </section>

      {/* 2. CATEGORÍAS B2B CON FOTOGRAFÍA EDITORIAL */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-10 pb-4 border-b border-slate-800/80">
          <div>
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-1">
              Segmentos de Especialidad
            </span>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">
              Categorías Principales para tu Vitrina
            </h2>
          </div>
          <Link
            href="/catalogo"
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition"
          >
            Ver catálogo completo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Card Oftálmicos con Imagen de Fondo */}
          <div className="group relative rounded-3xl overflow-hidden border border-slate-800 min-h-[380px] p-8 sm:p-10 flex flex-col justify-between shadow-2xl hover:border-emerald-500/50 transition-all duration-500">
            {/* Imagen Fotográfica de Fondo con Gradiente Oscuro */}
            <div className="absolute inset-0 -z-10">
              <Image
                src="https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=80"
                alt="Monturas Oftálmicas Recetables"
                fill
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700 brightness-[0.35]"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold tracking-wide uppercase mb-4 backdrop-blur-md">
                Uso Clínico y Receta
              </span>
              <h3 className="text-3xl font-black text-white uppercase tracking-tight leading-tight">
                Monturas Oftálmicas
              </h3>
              <p className="text-slate-300 text-sm mt-3 leading-relaxed max-w-md">
                Armazones graduables en acetato de celulosa, metal y aleaciones ligeras. Diseñados para montaje de cristales monofocales y multifocales de alta gama.
              </p>
            </div>

            <div className="pt-6 border-t border-slate-700/60 flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-[10px] bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-300 font-medium">
                  Acetato Premium
                </span>
                <span className="text-[10px] bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-300 font-medium">
                  Titanio
                </span>
              </div>
              <Link
                href="/catalogo?q=optico"
                className="inline-flex items-center gap-2 text-xs font-black text-emerald-400 group-hover:text-emerald-300 uppercase tracking-wider transition"
              >
                <span>Explorar oftálmicos</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

          {/* Card Solares con Imagen de Fondo */}
          <div className="group relative rounded-3xl overflow-hidden border border-slate-800 min-h-[380px] p-8 sm:p-10 flex flex-col justify-between shadow-2xl hover:border-emerald-500/50 transition-all duration-500">
            {/* Imagen Fotográfica de Fondo con Gradiente Oscuro */}
            <div className="absolute inset-0 -z-10">
              <Image
                src="https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=80"
                alt="Gafas de Sol Premium Mayoristas"
                fill
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700 brightness-[0.35]"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold tracking-wide uppercase mb-4 backdrop-blur-md">
                Protección UV400
              </span>
              <h3 className="text-3xl font-black text-white uppercase tracking-tight leading-tight">
                Lentes de Sol
              </h3>
              <p className="text-slate-300 text-sm mt-3 leading-relaxed max-w-md">
                Gafas solares con cristales polarizados y protección total contra rayos UV. Modelos deportivos, urbanos y de pasarela de marcas líderes mundiales.
              </p>
            </div>

            <div className="pt-6 border-t border-slate-700/60 flex items-center justify-between">
              <div className="flex gap-2">
                <span className="text-[10px] bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-300 font-medium">
                  Polarizados
                </span>
                <span className="text-[10px] bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded-md text-slate-300 font-medium">
                  Filtro UV400
                </span>
              </div>
              <Link
                href="/catalogo?q=sol"
                className="inline-flex items-center gap-2 text-xs font-black text-emerald-400 group-hover:text-emerald-300 uppercase tracking-wider transition"
              >
                <span>Explorar solares</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>

        </div>
      </section>

      {/* 3. ARMAZONES DESTACADOS CON FILTROS EN TIEMPO REAL */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-4 border-b border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Disponibilidad Inmediata en Origen
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">
              Armazones Destacados del Catálogo
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Modelos listos para incorporar a tu orden de 10 unidades combinables
            </p>
          </div>

          {/* Filtros rápidos interactivos */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'todos', label: 'Todos' },
              { id: 'guess', label: 'Guess' },
              { id: 'nike', label: 'Nike' },
              { id: 'acetato', label: 'Acetato' },
              { id: 'metal', label: 'Metal' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeFilter === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadingDestacados ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 h-72 animate-pulse" />
            ))}
          </div>
        ) : filteredDestacados.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/30 border border-slate-800 rounded-3xl text-slate-400">
            No se encontraron armazones para este filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredDestacados.map((marco) => (
              <Link
                key={marco.id_ext}
                href={`/producto/${encodeURIComponent(marco.marca)}/${encodeURIComponent(marco.modelo)}`}
                className="bg-slate-900/80 border border-slate-800/80 hover:border-emerald-500/50 rounded-2xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-500/5 flex flex-col justify-between"
              >
                {/* Imagen limpia del marco */}
                <div className="relative aspect-[4/3] bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center p-4 overflow-hidden">
                  <Image
                    unoptimized
                    src={marco.imagen_principal || '/placeholder.png'}
                    alt={marco.modelo}
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="badge-brand absolute top-3 left-3 text-[10px] font-bold">
                    {marco.marca}
                  </span>
                </div>

                {/* Contenido */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between border-t border-slate-800/80">
                  <div>
                    <h3 className="font-bold text-white text-base group-hover:text-emerald-400 transition-colors line-clamp-1">
                      {marco.modelo}
                    </h3>
                    <div className="flex justify-between items-center text-xs text-slate-400 mt-1">
                      <span className="font-mono text-[11px]">SKU: {marco.id_ext}</span>
                      {marco.forma && <span className="font-medium text-[11px]">{marco.forma}</span>}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center">
                    {isLoggedIn ? (
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-bold tracking-wider">Neto B2B</span>
                        <span className="text-emerald-400 font-black text-base">
                          ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                        <Lock className="w-3 h-3" />
                        <span>Precio B2B</span>
                      </div>
                    )}

                    {isLoggedIn && (
                      <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-md text-slate-300 font-medium">
                        Stock en origen: {marco.stock} un.
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/catalogo"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-white font-bold text-xs uppercase tracking-wider transition"
          >
            <span>Ver los más de 400 modelos en el catálogo</span>
            <ArrowRight className="w-4 h-4 text-emerald-400" />
          </Link>
        </div>
      </section>

      {/* 4. SIMULADOR DE RENTABILIDAD B2B INTERACTIVO */}
      <ProfitSimulator />

      {/* 5. PROCESO DE IMPORTACIÓN TRANSPARENTE (PASO A PASO) */}
      <ImportSteps />

      {/* 6. VISTOS RECIENTEMENTE */}
      <RecentlyViewed />

      {/* 7. BANNER FINAL CTA DE CONVERSIÓN */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-8 sm:p-14 text-center sm:text-left flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl overflow-hidden">
          
          <div className="max-w-xl">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-2">
              Comienza hoy mismo
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
              Abastece tu óptica con precios mayoristas directos
            </h2>
            <p className="text-slate-300 text-sm mt-3 leading-relaxed">
              Crea tu cuenta comercial en segundos para ver precios netos y comenzar tu orden de 10 armazones combinables.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-shrink-0">
            <Link
              href="/catalogo"
              className="px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 text-center"
            >
              Explorar Catálogo
            </Link>
            {!isLoggedIn && (
              <Link
                href="/registro"
                className="px-8 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm uppercase tracking-wider transition-all border border-slate-700 text-center"
              >
                Registrar mi Óptica
              </Link>
            )}
          </div>

        </div>
      </section>

    </div>
  );
}
