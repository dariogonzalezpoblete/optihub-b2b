"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useCartStore } from "@/store/useCartStore";
import { useAuth } from "@/context/AuthContext";
import { Check, Lock, Search, SlidersHorizontal, AlertCircle } from "lucide-react";

import {
  MARCOS_B2B_COLUMNS,
  MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS,
  MARCOS_PUBLIC_COLUMNS,
  type EnrichedMarco,
  type Marco,
} from "@/lib/catalog/types";
import {
  applyFilters,
  countActiveFilters,
  enrichMarcos,
  getFacets,
  stripEnriched,
} from "@/lib/catalog/filterEngine";
import { useCatalogFilters } from "@/hooks/useCatalogFilters";
import FilterSidebar from "@/components/catalog/FilterSidebar";
import FilterDrawer from "@/components/catalog/FilterDrawer";
import ActiveFilterChips from "@/components/catalog/ActiveFilterChips";
import PredictiveSearch from "@/components/catalog/PredictiveSearch";
import SortSelect from "@/components/catalog/SortSelect";
import ProductCard from "@/components/catalog/ProductCard";
import QuickSegmentPills from "@/components/catalog/QuickSegmentPills";
import MoqProgressBar from "@/components/catalog/MoqProgressBar";
import { normalizeText } from "@/lib/catalog/normalize";

interface Props { 
  initialMarcos: any[]; 
  totalCount: number; 
  currentPage: number; 
  totalPages: number; 
  allFacetItems?: any[];
}
export default function CatalogoClient({ initialMarcos, totalCount, currentPage, totalPages, allFacetItems }: Props) {
  const router = useRouter();
  const [marcos, setMarcos] = useState<Marco[]>(initialMarcos);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>("");
  const [toastType, setToastType] = useState<"success" | "warning">("success");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Auth Context
  const { isLoggedIn } = useAuth();

  // Store global de Zustand
  const addToCart = useCartStore((state) => state.addToCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);

  // Filtros sincronizados con la URL
  const { state: filters, toggle, setFacet, setQuery, setSort, clearAll, setPage, setTipo } = useCatalogFilters();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMarcos(initialMarcos);
    setLoading(false);

    if (!mounted || !isLoggedIn || !initialMarcos || initialMarcos.length === 0) {
      return;
    }

    const ids = Array.from(
      new Set(initialMarcos.map((m) => m?.id_ext).filter(Boolean))
    );
    if (ids.length === 0) return;

    let cancelled = false;
    supabase
      .from("marcos")
      .select(MARCOS_B2B_COMMERCIAL_OVERLAY_COLUMNS)
      .in("id_ext", ids)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const b2bMap = new Map(
          (data as unknown as Array<{ id_ext: string; precio_neto_clp?: number; precio_bruto_clp?: number; stock?: number }>).map(
            (row) => [row.id_ext, row]
          )
        );
        setMarcos((prev) =>
          prev.map((item) => {
            const b2b = b2bMap.get(item.id_ext);
            return b2b ? { ...item, ...b2b } : item;
          })
        );
      });

    return () => {
      cancelled = true;
    };
  }, [initialMarcos, mounted, isLoggedIn]);

  // Datos derivados
  const enriched = useMemo(() => enrichMarcos(marcos), [marcos]);
  const facetSource = useMemo(() => {
    if (allFacetItems && allFacetItems.length > 0) {
      return enrichMarcos(allFacetItems);
    }
    return enriched;
  }, [allFacetItems, enriched]);
  const facets = useMemo(() => getFacets(facetSource, filters), [facetSource, filters]);
  const results = useMemo(
    () => applyFilters(enriched, filters, mounted && isLoggedIn),
    [enriched, filters, mounted, isLoggedIn]
  );
  const activeCount = countActiveFilters(filters);

  // Agrupación de resultados por marca y modelo
  const groupedResults = useMemo(() => {
    const map = new Map<string, EnrichedMarco[]>();
    for (const m of results) {
      const key = `${m.marca}:::${m.modelo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return Array.from(map.values());
  }, [results]);

  const openProduct = useCallback((m: EnrichedMarco) => {
    router.push('/producto/' + encodeURIComponent(m.marca) + '/' + encodeURIComponent(m.modelo) + (m.id_ext ? '?sku=' + encodeURIComponent(m.id_ext) : ''));
  }, [router]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const totalUnidades = mounted ? getTotalUnits() : 0;

  const filterPanelProps = { facets, state: filters, onToggle: toggle };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-32">
      
      {/* Toast flotante de confirmación / advertencia */}
      {toastMessage && (
        <div className={`fixed top-24 right-4 z-50 px-4 py-3 border flex items-center gap-2 animate-slide-down ${
          toastType === "warning" ? "bg-[#9E8256] text-white border-[#9E8256]" : "bg-[#0F0F0F] text-white border-[#E6E2DD]"
        }`}>
          {toastType === "warning" ? <AlertCircle className="w-4 h-4 shrink-0" /> : <Check className="w-4 h-4 shrink-0 text-[#9E8256]" />}
          <span className="text-xs tracking-wider uppercase font-medium">{toastMessage}</span>
        </div>
      )}

      {/* --- ENCABEZADO DE CATÁLOGO EDITORIAL --- */}
      <div className="bg-[#FFFFFF] border-b border-[#E6E2DD] py-12 px-4 sm:px-6 lg:px-8 mb-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="text-left">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-4 h-[1px] bg-[#9E8256]" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#9E8256] font-medium">
                DISTRIBUCIÓN MAYORISTA OFICIAL · USA
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-5xl font-normal text-[#0F0F0F] tracking-tight">
              Catálogo de Armazones & Gafas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-[#5C5A55] max-w-2xl font-sans">
              Importación directa desde EE.UU. con stock verificado en origen. 
              <span className="text-[#0F0F0F] font-medium"> Mínimo mayorista de 10 unidades combinables</span> entre cualquier marca y modelo.
            </p>
          </div>

          <div className="bg-[#F4F2ED] border border-[#E6E2DD] p-4 flex items-center gap-3.5">
            <div className="p-2.5 bg-[#FFFFFF] border border-[#E6E2DD] text-[#9E8256]">
              <svg className="w-4 h-4 stroke-[1.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <p className="text-[10px] text-[#5C5A55] uppercase tracking-[0.18em]">Tránsito de Importación</p>
              <p className="text-sm font-bold text-[#0F0F0F] font-mono tabular-nums">10 a 15 días hábiles</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
        
        {/* BARRA DE PROGRESO DE MOQ EN VIVO (BANNER SUPERIOR) */}
        {mounted && (
          <MoqProgressBar variant="banner" isLoggedIn={isLoggedIn} className="mb-2" />
        )}

        {/* BANNER INFORMATIVO PARA USUARIOS NO LOGUEADOS (GATEKEEPING B2B) */}
        {mounted && !isLoggedIn && (
          <div className="bg-[#FFFFFF] border border-[#E6E2DD] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-[#F4F2ED] text-[#9E8256] border border-[#E6E2DD] flex-shrink-0">
                <Lock className="w-5 h-5 stroke-[1.5]" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0F0F0F] flex items-center gap-2">
                  <span>Precios Mayoristas Reservados para Ópticas</span>
                  <span className="text-[10px] bg-[#F7F3EB] text-[#846C44] border border-[#9E8256]/30 px-2 py-0.5 uppercase tracking-wider font-semibold">
                    Exclusivo B2B
                  </span>
                </h3>
                <p className="text-xs text-[#5C5A55] mt-1 max-w-2xl leading-relaxed">
                  Para proteger la rentabilidad y los márgenes de nuestros clientes comerciales, las tarifas netas en CLP y la orden de importación solo están habilitadas para ópticas acreditadas.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/login?redirect=/catalogo"
                className="bg-[#0F0F0F] text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] border border-[#0F0F0F] hover:bg-[#262626] transition-colors text-center flex-1 md:flex-none"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro?redirect=/catalogo"
                className="border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors text-center flex-1 md:flex-none"
              >
                Registrar Óptica
              </Link>
            </div>
          </div>
        )}

        {/* --- LAYOUT: SIDEBAR DE FILTROS + RESULTADOS --- */}
        <div className="flex gap-8 items-start">
          <FilterSidebar {...filterPanelProps} activeCount={activeCount} onClearAll={clearAll} />

          <div className="flex-1 min-w-0 space-y-6">
            {/* Curaduría de Marcas: Pestañas Rápidas por Segmento */}
            <QuickSegmentPills
              selectedBrands={filters.marca}
              onSelectSegment={(brands) => setFacet('marca', brands.map(normalizeText))}
              onClear={() => setFacet('marca', [])}
            />

            {/* Barra de herramientas: buscador + filtros mobile + orden */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <PredictiveSearch
                  items={enriched}
                  value={filters.q}
                  onCommit={setQuery}
                  onSelect={openProduct}
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="lg:hidden flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] px-4 py-2.5 text-[11px] uppercase tracking-[0.14em] font-medium text-[#0F0F0F] transition"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#9E8256]" />
                  Filtros
                  {activeCount > 0 && (
                    <span className="min-w-5 h-5 px-1 bg-[#0F0F0F] text-white text-[10px] font-mono font-bold flex items-center justify-center">
                      {activeCount}
                    </span>
                  )}
                </button>
                <SortSelect value={filters.sort} onChange={setSort} canSeePrices={mounted && isLoggedIn} />
              </div>
            </div>

            {/* Conteo de resultados + chips de filtros activos */}
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.16em] text-[#5C5A55]">
                {loading ? (
                  "Cargando catálogo…"
                ) : (
                  <>
                    <span className="text-[#0F0F0F] font-bold font-mono text-sm tabular-nums">{totalCount}</span>{" "}
                    {totalCount === 1 ? "armazón disponible" : "armazones disponibles"}
                  </>
                )}
              </p>
              <ActiveFilterChips
                state={filters}
                facets={facets}
                onRemove={toggle}
                onClearQuery={() => setQuery("")}
                onClearAll={() => clearAll()}
                onRemoveTipo={() => setTipo("")}
              />
            </div>

            {/* Grid de Productos Impecable en Blanco Puro */}
            {loading || (groupedResults.length === 0 && totalCount > 0) ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="bg-[#FFFFFF] border border-[#E6E2DD] overflow-hidden animate-pulse">
                    <div className="aspect-[4/3] bg-[#F4F2ED]" />
                    <div className="p-6 space-y-3">
                      <div className="h-3 skeleton w-1/3" />
                      <div className="h-5 skeleton w-3/4" />
                      <div className="h-3 skeleton w-1/2" />
                      <div className="pt-3 border-t border-[#E6E2DD] flex justify-between items-center">
                        <div className="h-4 skeleton w-20" />
                        <div className="h-6 skeleton w-14" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : totalCount === 0 || groupedResults.length === 0 ? (
              <div className="text-center py-20 bg-[#FFFFFF] border border-[#E6E2DD] p-8">
                <Search className="w-8 h-8 text-[#787670] mx-auto mb-3" />
                <p className="text-[#0F0F0F] font-serif text-lg">No hay armazones con esta combinación de filtros.</p>
                <p className="text-[#5C5A55] text-xs mt-1">Prueba quitando algún filtro o ampliando el término de búsqueda.</p>
                <button
                  onClick={() => clearAll()}
                  className="mt-5 border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-6 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-colors"
                >
                  Limpiar filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
                {groupedResults.map((variants, idx) => (
                  <ProductCard 
                    key={`${variants[0].marca}-${variants[0].modelo}`}
                    variants={variants}
                    idx={idx}
                    isLoggedIn={mounted && isLoggedIn}
                    onOpen={openProduct}
                    materialLabels={facets.material}
                  />
                ))}
              </div>
            )}

            {/* Paginación SSR */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-12 pt-8 border-t border-[#E6E2DD]">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="px-6 py-3 bg-[#FFFFFF] text-[#0F0F0F] border border-[#E6E2DD] disabled:opacity-30 hover:border-[#0F0F0F] transition font-medium text-[11px] uppercase tracking-[0.16em]"
                >
                  Anterior
                </button>
                <span className="text-xs text-[#5C5A55] font-mono tabular-nums">
                  Página <span className="text-[#0F0F0F] font-bold">{currentPage}</span> de {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="px-6 py-3 bg-[#FFFFFF] text-[#0F0F0F] border border-[#E6E2DD] disabled:opacity-30 hover:border-[#0F0F0F] transition font-medium text-[11px] uppercase tracking-[0.16em]"
                >
                  Siguiente
                </button>
              </div>
            )}

          </div>
        </div>

      </div>

      {/* Drawer de filtros (mobile) */}
      <FilterDrawer
        {...filterPanelProps}
        open={drawerOpen}
        onClose={closeDrawer}
        resultCount={totalCount}
        activeCount={activeCount}
        onClearAll={clearAll}
      />

      {/* --- BARRA FLOTANTE DE PROGRESO MOQ EN NEGRO OBSIDIANA / BRONCE --- */}
      {mounted && totalUnidades > 0 && (
        <MoqProgressBar variant="floating" isLoggedIn={isLoggedIn} />
      )}

    </div>
  );
}
