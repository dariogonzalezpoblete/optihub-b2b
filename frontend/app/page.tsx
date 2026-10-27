'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowRight, 
  Building2, 
  Sparkles, 
  Lock
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import HeroSpotlight from '@/components/home/HeroSpotlight';
import RecentlyViewed from '@/components/catalog/RecentlyViewed';

interface MarcoDestacado {
  id_ext: string;
  marca: string;
  modelo: string;
  codigo_color?: string;
  precio_neto_clp?: number;
  stock?: number;
  imagen_principal?: string;
  material?: string;
  forma?: string;
}

export default function Home() {
  const { isLoggedIn } = useAuth();
  const [destacados, setDestacados] = useState<MarcoDestacado[]>([]);
  const [loadingDestacados, setLoadingDestacados] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>('todos');

  useEffect(() => {
    let cancelled = false;
    async function loadFeatured() {
      try {
        const columns = isLoggedIn
          ? 'id_ext, marca, modelo, codigo_color, precio_neto_clp, stock, imagen_principal, material, forma'
          : 'id_ext, marca, modelo, codigo_color, imagen_principal, material, forma';

        let query = supabase
          .from('marcos')
          .select(columns)
          .not('imagen_principal', 'is', null);

        if (isLoggedIn) {
          query = query.gt('stock', 0);
        }

        const { data, error } = await query.limit(16);

        if (!cancelled && !error && data) {
          setDestacados(data as unknown as MarcoDestacado[]);
        }
      } catch (err) {
        console.error('Error cargando destacados:', err);
      } finally {
        if (!cancelled) {
          setLoadingDestacados(false);
        }
      }
    }

    loadFeatured();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

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
    <div className="bg-[#F7F6F2] text-[#111111] overflow-x-hidden">
      
      {/* 1. SECCIÓN HERO EDITORIAL */}
      <section className="relative pt-6 sm:pt-10 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Mensaje Central B2B (7 columnas) */}
          <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-8 sm:p-12 flex flex-col justify-between shadow-xs">
            <div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FAF9F6] border border-[#E5E4DF] text-[#9E7D4F] text-xs font-semibold tracking-wider uppercase mb-6">
                <Sparkles className="w-3.5 h-3.5 text-[#B89768]" />
                <span>Distribución Exclusiva B2B para Ópticas</span>
              </div>

              <h1 className="font-editorial text-4xl sm:text-5xl lg:text-6xl font-normal text-[#111111] tracking-tight leading-[1.08]">
                Catálogo Mayorista de Armazones de <span className="text-[#B89768] italic font-serif">Alta Gama</span>
              </h1>

              <p className="mt-6 text-[#575551] text-base sm:text-lg font-normal leading-relaxed max-w-xl">
                Importación directa consolidada desde EE.UU. con inventario autenticado en origen. Precios netos en CLP, factura electrónica SII y compra mínima de <strong className="text-[#111111] font-semibold">10 unidades combinables</strong> entre cualquier modelo y firma.
              </p>
            </div>

            {/* CTAs y Métricas */}
            <div className="mt-10 pt-8 border-t border-[#E5E4DF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                <Link
                  href="/catalogo"
                  className="btn-primary w-full sm:w-auto text-center"
                >
                  <span>Explorar Catálogo</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Link>

                {!isLoggedIn && (
                  <Link
                    href="/registro"
                    className="btn-secondary w-full sm:w-auto text-center"
                  >
                    <Building2 className="w-4 h-4 text-[#B89768] mr-1.5" />
                    <span>Registrar Óptica</span>
                  </Link>
                )}
              </div>

              {/* Métricas clave */}
              <div className="flex items-center gap-6 text-xs text-[#575551] font-semibold">
                <div>
                  <span className="block text-2xl font-bold text-[#111111] font-tech">10 un.</span>
                  <span className="text-[10px] text-[#82807A] uppercase tracking-wider font-medium">Mínimo Combinable</span>
                </div>
                <div className="w-px h-8 bg-[#E5E4DF]" />
                <div>
                  <span className="block text-2xl font-bold text-[#B89768] font-tech">10-15</span>
                  <span className="text-[10px] text-[#82807A] uppercase tracking-wider font-medium">Días Entrega</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vitrina Interactiva de Monturas (5 columnas) */}
          <div className="lg:col-span-5 min-h-[460px]">
            <HeroSpotlight />
          </div>

        </div>
      </section>

      {/* 2. LÍNEAS PRINCIPALES (OFTÁLMICOS Y SOLARES) */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8 pb-4 border-b border-[#E5E4DF]">
          <div>
            <span className="text-xs font-bold text-[#B89768] uppercase tracking-widest block mb-1">
              Curaduría por Especialidad
            </span>
            <h2 className="font-editorial text-3xl font-semibold text-[#111111] tracking-tight">
              Líneas para Vitrina Óptica
            </h2>
          </div>
          <Link
            href="/catalogo"
            className="text-xs font-bold text-[#111111] hover:text-[#B89768] flex items-center gap-1.5 transition tracking-wider uppercase"
          >
            Ver catálogo completo <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card Monturas Ópticas */}
          <Link
            href="/catalogo?tipo=optico"
            className="group relative rounded-3xl overflow-hidden min-h-[380px] sm:min-h-[440px] p-8 sm:p-12 flex flex-col justify-end border border-[#E5E4DF] shadow-md hover:shadow-2xl hover:border-[#B89768] transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          >
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=85"
                alt="Monturas Ópticas"
                fill
                priority
                className="object-cover object-center group-hover:scale-108 transition-transform duration-700 ease-out"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25 group-hover:from-black/90 transition-colors duration-300" />
            </div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white/90 text-[11px] font-semibold tracking-widest uppercase mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B89768]" />
                Línea Oftálmica
              </div>
              <h3 className="font-editorial text-4xl sm:text-5xl font-semibold text-white tracking-tight drop-shadow-md">
                Monturas Ópticas
              </h3>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/95 uppercase tracking-widest group-hover:text-[#B89768] transition-colors">
                <span>Explorar Catálogo</span>
                <ArrowRight className="w-4 h-4 text-[#B89768] group-hover:translate-x-1.5 transition-transform duration-300" />
              </div>
            </div>
          </Link>

          {/* Card Gafas de Sol */}
          <Link
            href="/catalogo?tipo=sol"
            className="group relative rounded-3xl overflow-hidden min-h-[380px] sm:min-h-[440px] p-8 sm:p-12 flex flex-col justify-end border border-[#E5E4DF] shadow-md hover:shadow-2xl hover:border-[#B89768] transition-all duration-300 hover:scale-[1.02] cursor-pointer"
          >
            <div className="absolute inset-0 -z-10 overflow-hidden">
              <Image
                src="https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=85"
                alt="Gafas de Sol"
                fill
                priority
                className="object-cover object-center group-hover:scale-108 transition-transform duration-700 ease-out"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/25 group-hover:from-black/90 transition-colors duration-300" />
            </div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white/90 text-[11px] font-semibold tracking-widest uppercase mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#B89768]" />
                Línea Solar
              </div>
              <h3 className="font-editorial text-4xl sm:text-5xl font-semibold text-white tracking-tight drop-shadow-md">
                Gafas de Sol
              </h3>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-white/95 uppercase tracking-widest group-hover:text-[#B89768] transition-colors">
                <span>Explorar Catálogo</span>
                <ArrowRight className="w-4 h-4 text-[#B89768] group-hover:translate-x-1.5 transition-transform duration-300" />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. ARMAZONES SELECCIONADOS (TARJETAS BLANCAS CON FOTOGRAFÍA DESTACADA) */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-4 border-b border-[#E5E4DF]">
          <div>
            <span className="text-xs font-bold text-[#B89768] uppercase tracking-wider mb-2 block font-mono">
              Disponibilidad Inmediata en Origen
            </span>
            <h2 className="font-editorial text-3xl font-semibold text-[#111111] tracking-tight">
              Armazones Seleccionados del Catálogo
            </h2>
            <p className="text-[#575551] text-xs sm:text-sm mt-1">
              Modelos listos para incorporar a tu orden mayorista de 10 unidades combinables
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
                className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all border ${
                  activeFilter === tab.id
                    ? 'bg-[#111111] text-white border-[#111111] shadow-2xs'
                    : 'bg-[#FFFFFF] border-[#E5E4DF] text-[#575551] hover:text-[#111111] hover:border-[#82807A]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loadingDestacados ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div key={n} className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl p-6 h-80 animate-pulse shadow-xs" />
            ))}
          </div>
        ) : filteredDestacados.length === 0 ? (
          <div className="text-center py-16 bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl text-[#575551]">
            No se encontraron armazones para este filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredDestacados.map((marco) => (
              <Link
                key={marco.id_ext}
                href={`/producto/${encodeURIComponent(marco.marca)}/${encodeURIComponent(marco.modelo)}`}
                className="bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#B89768] rounded-2xl overflow-hidden group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between"
              >
                {/* Imagen limpia del marco sobre blanco puro */}
                <div className="relative aspect-[4/3] bg-[#FFFFFF] flex items-center justify-center p-4 overflow-hidden border-b border-[#E5E4DF]">
                  <Image
                    unoptimized
                    src={marco.imagen_principal || '/placeholder.png'}
                    alt={marco.modelo}
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
                  />
                  <span className="badge-brand absolute top-3 left-3 text-[10px]">
                    {marco.marca}
                  </span>
                </div>

                {/* Contenido Editorial */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between bg-[#FFFFFF]">
                  <div>
                    <h3 className="font-editorial text-lg font-semibold text-[#111111] group-hover:text-[#B89768] transition-colors line-clamp-1">
                      {marco.modelo}
                    </h3>
                    <div className="flex justify-between items-center text-xs text-[#575551] mt-1 font-tech">
                      <span className="text-[11px] text-[#82807A]">SKU: {marco.id_ext}</span>
                      {marco.forma && <span className="text-[11px] font-sans uppercase">{marco.forma}</span>}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E5E4DF] flex justify-between items-center">
                    {isLoggedIn ? (
                      <div>
                        <span className="text-[9px] text-[#82807A] uppercase block font-bold tracking-wider">Neto B2B</span>
                        <span className="text-[#111111] font-bold text-base font-tech">
                          ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                        </span>
                      </div>
                    ) : (
                      <span className="badge-b2b-locked">
                        <Lock className="w-3 h-3 text-[#B89768]" />
                        <span>Precio B2B</span>
                      </span>
                    )}

                    {isLoggedIn && typeof marco.stock === 'number' && (
                      <span className="badge-stock">
                        {marco.stock >= 50 ? '50+ un.' : `${marco.stock} un.`}
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
            className="btn-secondary !py-3.5 !px-8 text-xs font-bold"
          >
            <span>Ver los más de 1.000 modelos en el catálogo</span>
            <ArrowRight className="w-4 h-4 ml-1 text-[#B89768]" />
          </Link>
        </div>
      </section>

      {/* 4. VISTOS RECIENTEMENTE */}
      <RecentlyViewed />

      {/* 5. BANNER FINAL CTA DE CONVERSIÓN MINIMALISTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="relative bg-[#111111] border border-[#242424] rounded-3xl p-8 sm:p-12 text-center sm:text-left flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl overflow-hidden text-white">
          <div className="max-w-xl">
            <span className="text-xs font-bold text-[#B89768] uppercase tracking-widest block mb-2 font-mono">
              Distribución Exclusiva Mayorista
            </span>
            <h2 className="font-editorial text-3xl sm:text-4xl font-normal text-white tracking-tight">
              Abastece tu óptica con precios directos de fábrica
            </h2>
            <p className="text-[#E5E4DF] text-sm mt-3 leading-relaxed font-sans">
              Crea tu cuenta comercial en segundos para ver precios netos y comenzar tu orden de 10 armazones combinables.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto flex-shrink-0">
            <Link
              href="/catalogo"
              className="btn-champagne px-8 py-3.5 text-center"
            >
              Explorar Catálogo
            </Link>
            {!isLoggedIn && (
              <Link
                href="/registro"
                className="btn-secondary !bg-[#242424] !text-white !border-[#3A3936] hover:!border-[#B89768] px-8 py-3.5 text-center"
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
