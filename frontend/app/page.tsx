'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  BadgePercent
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import BrandMarquee from '@/components/brands/BrandMarquee';
import BrandDirectory from '@/components/brands/BrandDirectory';

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



const CATEGORIAS_B2B = [
  {
    titulo: 'LÃ­nea OftÃ¡lmica & Titanio',
    descripcion: 'Monturas ultra livianas y resistentes diseÃ±adas para montaje de recetas de alta graduaciÃ³n.',
    badge: 'Alta Durabilidad',
    filtro: 'Titanium',
  },
  {
    titulo: 'Performance & Sport',
    descripcion: 'Armazones anatÃ³micos de alto impacto con soporte para cristales graduados y clips solares.',
    badge: 'Uso Diario / Deportivo',
    filtro: 'Nike',
  },
  {
    titulo: 'Acetato de DiseÃ±ador',
    descripcion: 'DiseÃ±o italiano y acabados pulidos para vitrinas premium de Ã³pticas independientes.',
    badge: 'Lujo & Estilo',
    filtro: 'Hugo Boss',
  },
];

export default function Home() {
  const { isLoggedIn, opticaData } = useAuth();
  const [destacados, setDestacados] = useState<MarcoDestacado[]>([]);
  const [loadingDestacados, setLoadingDestacados] = useState(true);

  useEffect(() => {
    async function loadFeatured() {
      try {
        const { data, error } = await supabase
          .from('marcos')
          .select('id_ext, marca, modelo, codigo_color, precio_neto_clp, stock, imagen_principal, material, forma')
          .limit(8);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      
      {/* 1. SECCIÃ“N HERO / BENTO GRID PRINCIPAL */}
      <section className="relative pt-8 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* Glow de fondo decorativo */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none -z-10" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Bento Principal (8 columnas) */}
          <div className="lg:col-span-8 bg-gradient-to-br from-slate-900/95 via-slate-900/80 to-slate-950 border border-slate-800/90 rounded-3xl p-8 sm:p-12 flex flex-col justify-between shadow-2xl relative overflow-hidden group">
            
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold tracking-wide uppercase mb-6">
                <Sparkles className="w-3.5 h-3.5" />
                <span>DistribuciÃ³n Exclusiva B2B para Ã“pticas</span>
              </div>

              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[1.08] max-w-2xl">
                CatÃ¡logo Mayorista de Armazones de <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">Primer Nivel</span>
              </h1>

              <p className="mt-6 text-slate-300 text-base sm:text-lg max-w-xl font-normal leading-relaxed">
                ImportaciÃ³n directa desde EE.UU. con stock verificado en tiempo real. Precios netos en CLP, factura electrÃ³nica SII y compra mÃ­nima flexibilizada de <strong className="text-emerald-400">10 unidades combinables</strong> entre todas las marcas.
              </p>
            </div>

            {/* CTAs y EstadÃ­sticas */}
            <div className="relative z-10 mt-10 pt-8 border-t border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Link
                  href="/catalogo"
                  className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
                >
                  <span>Explorar CatÃ¡logo</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>

                {!isLoggedIn && (
                  <Link
                    href="/registro"
                    className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm uppercase tracking-wider transition-all border border-slate-700/80 flex items-center justify-center gap-2"
                  >
                    <Building2 className="w-4 h-4 text-emerald-400" />
                    <span>Registrar mi Ã“ptica</span>
                  </Link>
                )}
              </div>

              {/* Badges rÃ¡pidos */}
              <div className="flex items-center gap-6 text-xs text-slate-400 font-semibold">
                <div>
                  <span className="block text-xl font-black text-white">10 un.</span>
                  <span className="text-[11px] text-slate-400 uppercase">MÃ­nimo Combinable</span>
                </div>
                <div className="w-px h-8 bg-slate-800" />
                <div>
                  <span className="block text-xl font-black text-emerald-400">10-15</span>
                  <span className="text-[11px] text-slate-400 uppercase">DÃ­as HÃ¡biles</span>
                </div>
              </div>
            </div>

          </div>

          {/* Bento Lateral (4 columnas, 2 cards apiladas) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Card 1: ImportaciÃ³n Directa EE.UU. */}
            <div className="flex-1 bg-slate-900/70 border border-slate-800/90 rounded-3xl p-6 sm:p-7 flex flex-col justify-between hover:border-emerald-500/40 transition-all duration-300 shadow-xl group">
              <div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
                  <Glasses className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">
                  Miami Optical Logistics
                </span>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  ImportaciÃ³n Directa USA
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
                  ConexiÃ³n directa con proveedores de Nueva York y Miami sin intermediarios. Armazones 100% autÃ©nticos con estuche de fÃ¡brica.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Autenticidad 100%</span>
                <Link
                  href="/catalogo"
                  className="text-xs font-black text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 transition"
                >
                  Ver modelos <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Card 2: Condiciones B2B */}
            <div className="flex-1 bg-slate-900/70 border border-slate-800/90 rounded-3xl p-6 sm:p-7 flex flex-col justify-between hover:border-emerald-500/40 transition-all duration-300 shadow-xl group">
              <div>
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4 border border-emerald-500/20">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block mb-1">
                  Cumplimiento Tributario
                </span>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  FacturaciÃ³n ElectrÃ³nica SII
                </h3>
                <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
                  Todos los valores publicados son netos en CLP. Emitimos factura electrÃ³nica con IVA 19% deducible para tu Ã³ptica.
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Pago Seguro Webpay</span>
                <Link
                  href="/carrito"
                  className="text-xs font-black text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 transition"
                >
                  Ir al Carrito <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

          </div>

        </div>
      </section>

      <BrandMarquee />

      <BrandDirectory />

      {/* 3. SECCI�N DE CATEGOR�AS PRINCIPALES B2B */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-2">
            Segmentos Ã“pticos
          </span>
          <h2 className="text-3xl font-black text-white uppercase tracking-tight">
            CategorÃ­as EstratÃ©gicas para tu Ã“ptica
          </h2>
          <p className="text-slate-400 text-sm mt-2">
            Gama seleccionada segÃºn las exigencias clÃ­nicas y comerciales del mercado chileno
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CATEGORIAS_B2B.map((cat, i) => (
            <div
              key={i}
              className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between relative overflow-hidden group hover:border-slate-700 transition-all duration-300"
            >
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold mb-4">
                  {cat.badge}
                </span>
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">
                  {cat.titulo}
                </h3>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  {cat.descripcion}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-800/80">
                <Link
                  href={`/catalogo?marca=${encodeURIComponent(cat.filtro)}`}
                  className="inline-flex items-center gap-2 text-xs font-black text-emerald-400 hover:text-emerald-300 uppercase tracking-wider transition"
                >
                  <span>Explorar categorÃ­a</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. ARMAZONES DESTACADOS DEL CATÃLOGO EN TIEMPO REAL */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-10 pb-6 border-b border-slate-800/80">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Inventario Activo
            </div>
            <h2 className="text-3xl font-black text-white uppercase tracking-tight">
              Armazones Destacados
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Modelos listos para incorporar a tu orden de 10 unidades
            </p>
          </div>

          <Link
            href="/catalogo"
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-850 text-white font-bold text-xs uppercase tracking-wider border border-slate-800 hover:border-emerald-500/50 transition flex items-center gap-2"
          >
            <span>Ver CatÃ¡logo Completo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loadingDestacados ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 h-72 animate-pulse" />
            ))}
          </div>
        ) : destacados.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/30 border border-slate-800 rounded-3xl text-slate-400">
            No hay armazones destacados disponibles en este momento.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {destacados.map((marco) => (
              <Link
                key={marco.id_ext}
                href="/catalogo"
                className="bg-slate-900/70 border border-slate-800/80 hover:border-emerald-500/50 rounded-2xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex flex-col justify-between"
              >
                {/* Imagen */}
                <div className="relative h-48 bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
                  <img
                    src={marco.imagen_principal || '/placeholder.png'}
                    alt={marco.modelo}
                    className="max-h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/placeholder.png';
                    }}
                  />
                  <span className="absolute top-3 left-3 bg-slate-900/90 backdrop-blur-md border border-slate-700/60 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase">
                    {marco.marca}
                  </span>
                </div>

                {/* Contenido */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base group-hover:text-emerald-400 transition-colors">
                      {marco.modelo}
                    </h3>
                    <div className="flex justify-between items-center text-xs text-slate-400 mt-1">
                      <span>SKU: {marco.id_ext}</span>
                      {marco.forma && <span className="font-medium">{marco.forma}</span>}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center">
                    {isLoggedIn ? (
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase block font-medium">Neto Mayorista</span>
                        <span className="text-emerald-400 font-black text-sm">
                          ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
                        <Lock className="w-3 h-3" />
                        <span>Precio Protegido</span>
                      </div>
                    )}

                    <span className="text-xs bg-slate-800 px-2 py-0.5 rounded-md text-slate-300 font-medium">
                      {marco.stock} un.
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 5. PILARES CORPORATIVOS Y GARANTÃAS B2B */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 sm:p-12">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Â¿Por quÃ© las Ã“pticas Eligen OptiHub?
            </h2>
            <p className="text-slate-400 text-sm mt-2">
              Infraestructura mayorista diseÃ±ada para simplificar el abastecimiento de armazones en Chile
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <Truck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Despacho en 16 Regiones</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                Coordinamos envÃ­os asegurados directo a tu local u Ã³ptica en cualquier punto de Chile.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <Layers className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">MÃ­nimo 10 Unidades</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                Sin exigencias de docenas por modelo. Puedes mezclar libremente armazones de cualquier marca.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <FileText className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">Factura ElectrÃ³nica</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                EmisiÃ³n inmediata del DTE con IVA 19% recuperable por la contabilidad de tu Ã³ptica.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-white text-base">GarantÃ­a de Origen</h4>
              <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                Armazones nuevos, certificados y originales suministrados con su estuche y paÃ±o de fÃ¡brica.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. BANNER FINAL CTA DE CONVERSIÃ“N */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative bg-gradient-to-r from-emerald-950/60 via-slate-900 to-slate-900 border border-emerald-500/30 rounded-3xl p-8 sm:p-14 text-center sm:text-left flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl overflow-hidden">
          
          <div className="max-w-xl">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-2">
              Comienza hoy mismo
            </span>
            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">
              Abastece tu Ã³ptica con precios mayoristas directos
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
              Explorar CatÃ¡logo
            </Link>
            {!isLoggedIn && (
              <Link
                href="/registro"
                className="px-8 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm uppercase tracking-wider transition-all border border-slate-700 text-center"
              >
                Registrar mi Ã“ptica
              </Link>
            )}
          </div>

        </div>
      </section>

    </div>
  );
}
