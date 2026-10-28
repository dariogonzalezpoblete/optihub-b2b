'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowRight, 
  Building2, 
  Lock
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabaseClient';
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

const BRAND_MAISONS = [
  'BURBERRY',
  'CARRERA',
  'GUESS',
  'CALVIN KLEIN',
  'LACOSTE',
  'NIKE',
  'TOMMY HILFIGER',
];

export default function Home() {
  const { isLoggedIn } = useAuth();
  const [destacados, setDestacados] = useState<MarcoDestacado[]>([]);
  const [totalModelos, setTotalModelos] = useState<number | null>(null);
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

        const [{ data, error }, { count }] = await Promise.all([
          query.limit(16),
          supabase.from('marcos').select('*', { count: 'exact', head: true }).gt('stock', 0),
        ]);

        if (!cancelled && !error && data) {
          setDestacados(data as unknown as MarcoDestacado[]);
        }
        if (!cancelled && count !== null && count !== undefined) {
          setTotalModelos(count);
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

  const heroArmazonImg = destacados[0]?.imagen_principal || 'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=85';

  return (
    <div className="bg-[#FAF9F6] text-[#0F0F0F] overflow-x-hidden min-h-screen">
      
      {/* 1. HERO EDITORIAL ASIMÉTRICO (GRID 12 COLUMNAS CON BORDES ARQUITECTÓNICOS) */}
      <section className="pt-6 sm:pt-10 pb-0 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="border border-[#E6E2DD] bg-[#FFFFFF] grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#E6E2DD]">
          
          {/* Columna Izquierda: Editorial y Llamado a la Acción (7 u 8 columnas) */}
          <div className="lg:col-span-7 xl:col-span-8 p-8 sm:p-12 lg:p-16 flex flex-col justify-between">
            <div>
              {/* Eyebrow Superior Arquitectónico */}
              <div className="flex items-center gap-3 mb-6">
                <span className="w-6 h-[1px] bg-[#9E8256]" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#9E8256] font-medium">
                  DISTRIBUCIÓN EXCLUSIVA B2B PARA ÓPTICAS · IMPORTACIÓN USA
                </span>
              </div>

              {/* Titular Principal en Serif */}
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.06] text-[#0F0F0F] font-normal tracking-tight max-w-2xl">
                Catálogo Mayorista de Armazones de{' '}
                <span className="text-[#9E8256] font-normal">Alta Gama</span>
              </h1>

              {/* Párrafo Descriptivo */}
              <p className="mt-6 text-sm sm:text-base text-[#5C5A55] leading-relaxed max-w-xl">
                Importación directa consolidada desde EE.UU. con inventario autenticado en origen. Precios netos en CLP, factura electrónica SII y compra mínima de{' '}
                <strong className="text-[#0F0F0F] font-medium">10 unidades combinables</strong> entre cualquier modelo y firma oficial.
              </p>
            </div>

            {/* Acciones CTA Rectangulares */}
            <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href="/catalogo"
                className="bg-[#0F0F0F] text-white px-8 py-4 text-[11px] uppercase tracking-[0.2em] hover:bg-[#262626] transition-colors rounded-none text-center flex items-center justify-center gap-2 border border-[#0F0F0F]"
              >
                <span>EXPLORAR CATÁLOGO MAYORISTA</span>
                <ArrowRight className="w-4 h-4 text-[#9E8256]" />
              </Link>

              {!isLoggedIn && (
                <Link
                  href="/registro"
                  className="border border-[#0F0F0F] text-[#0F0F0F] bg-transparent hover:bg-[#0F0F0F] hover:text-white px-8 py-4 text-[11px] uppercase tracking-[0.2em] transition-colors rounded-none text-center flex items-center justify-center gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  <span>REGISTRAR ÓPTICA</span>
                </Link>
              )}
            </div>
          </div>

          {/* Columna Derecha: Panel Visual Editorial Galería (Superficie #F4F2ED) */}
          <div className="lg:col-span-5 xl:col-span-4 bg-[#F4F2ED] p-8 sm:p-12 flex flex-col justify-between relative overflow-hidden min-h-[380px] lg:min-h-auto">
            {/* Etiqueta Técnica Flotante */}
            <div className="flex justify-between items-start z-10">
              <span className="text-[9px] uppercase tracking-[0.25em] text-[#5C5A55] border border-[#E6E2DD] bg-[#FFFFFF]/90 px-3 py-1 font-mono">
                CURADURÍA OFICIAL · ORIGEN EE.UU.
              </span>
              <span className="text-[10px] font-mono text-[#9E8256] uppercase tracking-wider">
                LOTE 2026/04
              </span>
            </div>

            {/* Fotografía de Armazón con mix-blend-multiply */}
            <div className="relative my-auto py-8 flex items-center justify-center">
              <div className="relative w-full aspect-[4/3] max-w-sm">
                <Image
                  unoptimized
                  src={heroArmazonImg}
                  alt="Armazón de alta gama"
                  fill
                  priority
                  className="object-contain mix-blend-multiply filter contrast-[1.05]"
                  sizes="(max-width: 1024px) 100vw, 35vw"
                />
              </div>
            </div>

            {/* Metadato inferior del marco */}
            <div className="z-10 pt-4 border-t border-[#E6E2DD]/70 flex justify-between items-end">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-[#5C5A55]">Muestra Destacada</p>
                <p className="font-serif text-lg text-[#0F0F0F] font-normal leading-tight">
                  {destacados[0]?.marca || 'Luxury Eyewear'} · {destacados[0]?.modelo || 'Iconic Model'}
                </p>
              </div>
              <span className="text-[10px] uppercase font-mono tracking-wider text-[#9E8256]">
                DISPONIBLE
              </span>
            </div>
          </div>

        </div>

        {/* 2. FRANJA DE MÉTRICAS B2B INMEDIATAMENTE DEBAJO DEL HERO */}
        <div className="border-x border-b border-[#E6E2DD] bg-[#FFFFFF] grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#E6E2DD]">
          <div className="p-8 sm:p-10 flex flex-col items-center md:items-start text-center md:text-left">
            <span className="font-serif text-4xl lg:text-5xl font-light text-[#0F0F0F] leading-none mb-2">
              10 un.
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5C5A55]">
              MÍNIMO MAYORISTA COMBINABLE
            </span>
          </div>

          <div className="p-8 sm:p-10 flex flex-col items-center md:items-start text-center md:text-left">
            <span className="font-serif text-4xl lg:text-5xl font-light text-[#0F0F0F] leading-none mb-2">
              10–15
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5C5A55]">
              DÍAS HÁBILES DE ENTREGA A CHILE
            </span>
          </div>

          <div className="p-8 sm:p-10 flex flex-col items-center md:items-start text-center md:text-left">
            <span className="font-serif text-4xl lg:text-5xl font-light text-[#0F0F0F] leading-none mb-2">
              100%
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[#5C5A55]">
              FACTURA ELECTRÓNICA SII (IVA CRÉDITO)
            </span>
          </div>
        </div>
      </section>

      {/* 3. VITRINA DE CASAS OFICIALES (BRAND MAISONS BAR) */}
      <section className="mt-14 border-y border-[#E6E2DD] bg-[#FFFFFF] py-6 overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-8 min-w-max">
          <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium pr-6 border-r border-[#E6E2DD]">
            MAISONS OFICIALES
          </span>
          <div className="flex items-center gap-10 lg:gap-14">
            {BRAND_MAISONS.map((brand) => (
              <Link
                key={brand}
                href={`/catalogo?marca=${encodeURIComponent(brand)}`}
                className="text-[12px] uppercase tracking-[0.24em] text-[#5C5A55] hover:text-[#0F0F0F] hover:tracking-[0.28em] transition-all font-sans"
              >
                {brand}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* 4. CURADURÍA POR ESPECIALIDAD (LÍNEAS OFTÁLMICAS Y SOLARES CON BORDES ARQUITECTÓNICOS) */}
      <section className="py-16 sm:py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8 pb-4 border-b border-[#E6E2DD]">
          <div>
            <span className="text-[10px] font-semibold text-[#9E8256] uppercase tracking-[0.22em] block mb-1">
              CURADURÍA POR ESPECIALIDAD
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
              Líneas para Vitrina Óptica
            </h2>
          </div>
          <Link
            href="/catalogo"
            className="text-[11px] font-medium text-[#0F0F0F] hover:text-[#9E8256] flex items-center gap-2 transition tracking-[0.18em] uppercase"
          >
            VER CATÁLOGO COMPLETO <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Card 01 / Línea Oftálmica */}
          <Link
            href="/catalogo?tipo=optico"
            className="group relative border border-[#E6E2DD] hover:border-[#0F0F0F] transition-all duration-300 bg-[#0F0F0F] overflow-hidden min-h-[420px] sm:min-h-[480px] p-8 sm:p-12 flex flex-col justify-between"
          >
            <div className="absolute inset-0 z-0 overflow-hidden">
              <Image
                unoptimized
                src="https://images.unsplash.com/photo-1591076482161-42ce6da69f67?auto=format&fit=crop&w=1200&q=85"
                alt="Monturas Ópticas"
                fill
                priority
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out opacity-65"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            </div>

            <div className="relative z-10 flex justify-between items-start">
              <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#9E8256] border border-[#9E8256]/40 px-2.5 py-1 bg-black/40 backdrop-blur-sm">
                01 / LÍNEA OFTÁLMICA
              </span>
              <span className="text-white text-xs font-mono">USA · CHILE</span>
            </div>

            <div className="relative z-10">
              <h3 className="font-serif text-3xl sm:text-4xl font-normal text-white tracking-tight">
                Monturas Ópticas
              </h3>
              <p className="text-[#E6E2DD] text-xs sm:text-sm mt-2 max-w-md font-sans">
                Armazones para recetas en acetato italiano, titanio pulido y aleaciones de alta resistencia.
              </p>
              <div className="mt-5 flex items-center gap-2 text-[11px] font-medium text-white uppercase tracking-[0.2em] group-hover:text-[#9E8256] transition-colors">
                <span>EXPLORAR MONTURAS</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9E8256] group-hover:translate-x-1.5 transition-transform duration-300" />
              </div>
            </div>
          </Link>

          {/* Card 02 / Línea Solar */}
          <Link
            href="/catalogo?tipo=sol"
            className="group relative border border-[#E6E2DD] hover:border-[#0F0F0F] transition-all duration-300 bg-[#0F0F0F] overflow-hidden min-h-[420px] sm:min-h-[480px] p-8 sm:p-12 flex flex-col justify-between"
          >
            <div className="absolute inset-0 z-0 overflow-hidden">
              <Image
                unoptimized
                src="https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=1200&q=85"
                alt="Gafas de Sol"
                fill
                priority
                className="object-cover object-center group-hover:scale-105 transition-transform duration-700 ease-out opacity-65"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
            </div>

            <div className="relative z-10 flex justify-between items-start">
              <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#9E8256] border border-[#9E8256]/40 px-2.5 py-1 bg-black/40 backdrop-blur-sm">
                02 / LÍNEA SOLAR
              </span>
              <span className="text-white text-xs font-mono">USA · CHILE</span>
            </div>

            <div className="relative z-10">
              <h3 className="font-serif text-3xl sm:text-4xl font-normal text-white tracking-tight">
                Gafas de Sol
              </h3>
              <p className="text-[#E6E2DD] text-xs sm:text-sm mt-2 max-w-md font-sans">
                Protección UV400, cristales polarizados y diseños icónicos de casas de moda internacionales.
              </p>
              <div className="mt-5 flex items-center gap-2 text-[11px] font-medium text-white uppercase tracking-[0.2em] group-hover:text-[#9E8256] transition-colors">
                <span>EXPLORAR SOLARES</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9E8256] group-hover:translate-x-1.5 transition-transform duration-300" />
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 5. ARMAZONES SELECCIONADOS (TARJETAS ARQUITECTÓNICAS SOBRE SUPERFICIE PIEDRA) */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pb-4 border-b border-[#E6E2DD]">
          <div>
            <span className="text-[10px] font-semibold text-[#9E8256] uppercase tracking-[0.22em] mb-1 block">
              DISPONIBILIDAD INMEDIATA EN ORIGEN
            </span>
            <h2 className="font-serif text-3xl font-normal text-[#0F0F0F] tracking-tight">
              Armazones Seleccionados del Catálogo
            </h2>
            <p className="text-[#5C5A55] text-xs sm:text-sm mt-1">
              Modelos listos para incorporar a tu orden mayorista de 10 unidades combinables
            </p>
          </div>

          {/* Filtros rápidos con bordes rectos */}
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
                className={`px-4 py-2 text-[11px] uppercase tracking-[0.16em] font-medium transition-all border rounded-none ${
                  activeFilter === tab.id
                    ? 'bg-[#0F0F0F] text-white border-[#0F0F0F]'
                    : 'bg-[#FFFFFF] border-[#E6E2DD] text-[#5C5A55] hover:text-[#0F0F0F] hover:border-[#0F0F0F]'
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
              <div key={n} className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 h-80 animate-pulse" />
            ))}
          </div>
        ) : filteredDestacados.length === 0 ? (
          <div className="text-center py-16 bg-[#FFFFFF] border border-[#E6E2DD] text-[#5C5A55] text-xs uppercase tracking-wider">
            No se encontraron armazones para este filtro.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredDestacados.map((marco) => (
              <Link
                key={marco.id_ext}
                href={`/producto/${encodeURIComponent(marco.marca)}/${encodeURIComponent(marco.modelo)}`}
                className="bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] group transition-all duration-300 flex flex-col justify-between"
              >
                {/* Zona de Imagen sobre piedra cálida (#F4F2ED) con mix-blend-multiply */}
                <div className="relative aspect-[4/3] bg-[#F4F2ED] flex items-center justify-center p-6 overflow-hidden border-b border-[#E6E2DD]">
                  <Image
                    unoptimized
                    src={marco.imagen_principal || '/placeholder.png'}
                    alt={marco.modelo}
                    fill
                    sizes="(max-width: 640px) 100vw, 25vw"
                    className="object-contain p-4 mix-blend-multiply group-hover:scale-[1.04] transition-transform duration-500 ease-out"
                  />
                  <span className="absolute top-3 left-3 text-[10px] uppercase tracking-[0.2em] font-semibold text-[#0F0F0F] bg-[#FFFFFF]/90 border border-[#E6E2DD] px-2 py-0.5">
                    {marco.marca}
                  </span>
                </div>

                {/* Contenido Editorial Limpio */}
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between bg-[#FFFFFF]">
                  <div>
                    <h3 className="font-serif text-xl font-normal text-[#0F0F0F] group-hover:text-[#9E8256] transition-colors line-clamp-1">
                      {marco.modelo}
                    </h3>
                    <div className="flex justify-between items-center text-xs text-[#5C5A55] mt-1.5">
                      <span className="text-[11px] font-mono text-[#787670] tabular-nums">
                        COL {marco.codigo_color || 'N/A'}
                      </span>
                      {marco.forma && (
                        <span className="text-[10px] uppercase tracking-wider text-[#5C5A55]">
                          {marco.forma}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#E6E2DD] flex justify-between items-end">
                    {isLoggedIn ? (
                      <div>
                        <span className="text-[9px] text-[#787670] uppercase block font-semibold tracking-wider">
                          Neto B2B
                        </span>
                        <span className="text-[#0F0F0F] font-bold text-base font-mono tabular-nums">
                          ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[#846C44] bg-[#F7F3EB] border border-[#9E8256]/30 px-2.5 py-1">
                        <Lock className="w-3 h-3 text-[#9E8256]" />
                        <span>Precio B2B</span>
                      </span>
                    )}

                    {isLoggedIn && typeof marco.stock === 'number' && (
                      <span className="text-[10px] font-mono text-[#5C5A55] bg-[#F4F2ED] border border-[#E6E2DD] px-2 py-0.5 tabular-nums">
                        {marco.stock >= 50 ? '50+ un.' : `${marco.stock} un.`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-12 text-center">
          <Link
            href="/catalogo"
            className="border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-8 py-4 text-[11px] uppercase tracking-[0.2em] transition-colors inline-flex items-center gap-2 rounded-none"
          >
            <span>
              {totalModelos
                ? `VER LOS ${totalModelos.toLocaleString('es-CL')} MODELOS DISPONIBLES EN EL CATÁLOGO`
                : 'VER TODOS LOS MODELOS DISPONIBLES EN EL CATÁLOGO'}
            </span>
            <ArrowRight className="w-4 h-4 text-[#9E8256]" />
          </Link>
        </div>
      </section>

      {/* 6. VISTOS RECIENTEMENTE */}
      <RecentlyViewed />

      {/* 7. BANNER FINAL CTA DE CONVERSIÓN MINIMALISTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="border border-[#E6E2DD] bg-[#FFFFFF] p-8 sm:p-14 text-center sm:text-left flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="max-w-xl">
            <span className="text-[10px] font-semibold text-[#9E8256] uppercase tracking-[0.22em] block mb-2">
              DISTRIBUCIÓN EXCLUSIVA MAYORISTA
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-normal text-[#0F0F0F] tracking-tight">
              Abastece tu óptica con precios directos de fábrica
            </h2>
            <p className="text-[#5C5A55] text-sm mt-3 leading-relaxed font-sans">
              Crea tu cuenta comercial en segundos para ver precios netos y comenzar tu orden de 10 armazones combinables.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-shrink-0">
            <Link
              href="/catalogo"
              className="bg-[#0F0F0F] text-white hover:bg-[#262626] px-8 py-4 text-[11px] uppercase tracking-[0.2em] transition-colors rounded-none text-center"
            >
              Explorar Catálogo
            </Link>
            {!isLoggedIn && (
              <Link
                href="/registro"
                className="border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-8 py-4 text-[11px] uppercase tracking-[0.2em] transition-colors rounded-none text-center"
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
