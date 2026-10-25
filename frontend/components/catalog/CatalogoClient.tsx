"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
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
import QuickViewModal from "@/components/catalog/QuickViewModal";
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
  const [marcos, setMarcos] = useState<Marco[]>(initialMarcos);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<EnrichedMarco | null>(null);
  const [activeImage, setActiveImage] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string>("");
  const [toastType, setToastType] = useState<"success" | "warning">("success");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Auth Context
  const { isLoggedIn } = useAuth();

  // Store global de Zustand
  const addToCart = useCartStore((state) => state.addToCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);

  // Filtros sincronizados con la URL
  const { state: filters, toggle, setFacet, setQuery, setSort, clearAll, setPage } = useCatalogFilters();

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

  const fetchMarcos = async () => {
    try {
      const projection = isLoggedIn ? MARCOS_B2B_COLUMNS : MARCOS_PUBLIC_COLUMNS;
      const { data, error } = await supabase
        .from("marcos")
        .select(projection);

      if (error) {
        console.error("❌ Error de Supabase:", error.message);
      } else if (data) {
        setMarcos(data as unknown as Marco[]);
      }
    } catch (error) {
      console.error("❌ Error inesperado:", error);
    } finally {
      setLoading(false);
    }
  };

  // Datos derivados (memoizados: se recalculan solo cuando cambian datos o filtros)
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

  // Agrupación de resultados por marca y modelo para las ProductCards interactiva (PASO 2)
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
    setSelectedProduct(m);
    setActiveImage(m.imagen_principal);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const agregarAlCarrito = (producto: EnrichedMarco, cantidadSeleccionada: number) => {
    if (!isLoggedIn) return;
    const res = addToCart(stripEnriched(producto), cantidadSeleccionada);
    setSelectedProduct(null);
    if (res.message) {
      setToastType("warning");
      setToastMessage(res.message);
    } else {
      setToastType("success");
      setToastMessage(`✓ ${res.added}x ${producto.marca} ${producto.modelo} añadido al carrito`);
    }
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  const totalUnidades = mounted ? getTotalUnits() : 0;
  const montoNeto = mounted ? getMontoNeto() : 0;

  const filterPanelProps = { facets, state: filters, onToggle: toggle };

  return (
    <div className="min-h-screen bg-[#F7F6F2] text-[#111111] pb-32">
      
      {/* Toast flotante de confirmación / advertencia */}
      {toastMessage && (
        <div className={`fixed top-24 right-4 z-50 font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-slide-down ${
          toastType === "warning" ? "bg-[#B89768] text-[#111111]" : "bg-[#111111] text-[#FFFFFF]"
        }`}>
          {toastType === "warning" ? <AlertCircle className="w-5 h-5 shrink-0" /> : <Check className="w-5 h-5 shrink-0 text-[#B89768]" />}
          <span className="text-xs tracking-wide">{toastMessage}</span>
        </div>
      )}

      {/* --- ENCABEZADO DE CATÁLOGO EDITORIAL --- */}
      <div className="bg-[#FFFFFF] border-b border-[#E5E4DF] py-10 px-4 sm:px-6 lg:px-8 mb-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="text-left">
            <div className="inline-flex items-center gap-2 bg-[#F7F3EB] border border-[#B89768]/40 text-[#9E7D4F] text-xs font-semibold px-3 py-1 rounded-full mb-3 tracking-wide uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B89768]" />
              Maison B2B • Distribución Mayorista Oficial
            </div>
            <h1 className="font-editorial text-3xl sm:text-5xl font-semibold text-[#111111] tracking-tight">
              Catálogo de Armazones & Gafas
            </h1>
            <p className="mt-2 text-sm sm:text-base text-[#575551] max-w-2xl font-sans">
              Importación directa desde EE.UU. con stock verificado en origen. 
              <span className="text-[#111111] font-semibold"> Mínimo mayorista de 10 unidades combinables</span> entre cualquier marca y modelo.
            </p>
          </div>

          <div className="bg-[#FAF9F6] border border-[#E5E4DF] p-4 rounded-2xl flex items-center gap-3.5 shadow-2xs">
            <div className="p-2.5 bg-[#FFFFFF] border border-[#E5E4DF] text-[#B89768] rounded-xl shadow-xs">
              <svg className="w-5 h-5 stroke-[1.8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <p className="text-[11px] text-[#82807A] uppercase font-bold tracking-wider">Tránsito de Importación</p>
              <p className="text-sm font-bold text-[#111111] font-tech">10 a 15 días hábiles</p>
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
          <div className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3.5 bg-[#FAF9F6] text-[#B89768] rounded-2xl border border-[#E5E4DF] flex-shrink-0">
                <Lock className="w-6 h-6 stroke-[1.8]" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[#111111] flex items-center gap-2">
                  <span>Precios Mayoristas Reservados para Ópticas</span>
                  <span className="text-[10px] bg-[#F7F3EB] text-[#9E7D4F] border border-[#B89768]/30 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                    Exclusivo B2B
                  </span>
                </h3>
                <p className="text-xs sm:text-sm text-[#575551] mt-1 max-w-2xl leading-relaxed">
                  Para proteger la rentabilidad y los márgenes de nuestros clientes comerciales, las tarifas netas en CLP y la orden de importación solo están habilitadas para ópticas acreditadas.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/login?redirect=/catalogo"
                className="btn-primary flex-1 md:flex-none text-center"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro?redirect=/catalogo"
                className="btn-secondary flex-1 md:flex-none text-center"
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
                  className="lg:hidden flex-1 sm:flex-none inline-flex items-center justify-center gap-2 bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#82807A] rounded-xl px-4 py-2.5 text-xs font-bold text-[#111111] transition shadow-2xs"
                >
                  <SlidersHorizontal className="w-4 h-4 text-[#B89768]" />
                  Filtros
                  {activeCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#111111] text-white text-[10px] font-tech font-bold flex items-center justify-center">
                      {activeCount}
                    </span>
                  )}
                </button>
                <SortSelect value={filters.sort} onChange={setSort} canSeePrices={mounted && isLoggedIn} />
              </div>
            </div>

            {/* Conteo de resultados + chips de filtros activos */}
            <div className="space-y-3">
              <p className="text-sm text-[#575551]">
                {loading ? (
                  "Cargando catálogo…"
                ) : (
                  <>
                    <span className="text-[#111111] font-bold font-tech text-base">{totalCount}</span>{" "}
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
              />
            </div>

            {/* Grid de Productos Impecable en Blanco Puro */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl overflow-hidden shadow-xs animate-pulse">
                    <div className="h-60 bg-[#FAF9F6]" />
                    <div className="p-5 space-y-3">
                      <div className="h-3 skeleton w-1/3" />
                      <div className="h-5 skeleton w-3/4" />
                      <div className="h-3 skeleton w-1/2" />
                      <div className="pt-3 border-t border-[#E5E4DF] flex justify-between items-center">
                        <div className="h-4 skeleton w-20" />
                        <div className="h-6 skeleton w-14" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : totalCount === 0 ? (
              <div className="text-center py-20 bg-[#FFFFFF] border border-[#E5E4DF] rounded-3xl p-8">
                <Search className="w-10 h-10 text-[#82807A] mx-auto mb-3" />
                <p className="text-[#111111] font-semibold text-base font-editorial">No hay armazones con esta combinación de filtros.</p>
                <p className="text-[#575551] text-xs mt-1">Prueba quitando algún filtro o ampliando el término de búsqueda.</p>
                <button
                  onClick={() => clearAll()}
                  className="mt-5 btn-secondary !py-2.5 !text-xs"
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
              <div className="flex justify-center items-center gap-4 mt-12 pt-8 border-t border-[#E5E4DF]">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="px-5 py-2.5 bg-[#FFFFFF] text-[#111111] border border-[#E5E4DF] rounded-xl disabled:opacity-40 hover:bg-[#FAF9F6] transition font-semibold text-xs uppercase tracking-wider shadow-2xs"
                >
                  Anterior
                </button>
                <span className="text-xs text-[#575551] font-medium font-tech">
                  Página <span className="text-[#111111] font-bold">{currentPage}</span> de {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="px-5 py-2.5 bg-[#FFFFFF] text-[#111111] border border-[#E5E4DF] rounded-xl disabled:opacity-40 hover:bg-[#FAF9F6] transition font-semibold text-xs uppercase tracking-wider shadow-2xs"
                >
                  Siguiente
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Modal de Vista Rapida (Quick View) */}
        <QuickViewModal 
          variants={selectedProduct ? groupedResults.find((g: EnrichedMarco[]) => g[0].modelo === selectedProduct.modelo && g[0].marca === selectedProduct.marca) || [selectedProduct] : []}
          isOpen={!!selectedProduct} 
          onClose={() => setSelectedProduct(null)} 
        />

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

      {/* --- BARRA FLOTANTE DE PROGRESO MOQ EN NEGRO OBSIDIANA / CHAMPAGNE --- */}
      {mounted && totalUnidades > 0 && (
        <MoqProgressBar variant="floating" isLoggedIn={isLoggedIn} />
      )}

    </div>
  );
}
