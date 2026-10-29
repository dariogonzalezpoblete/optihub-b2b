"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/useCartStore";
import { useAuth } from "@/context/AuthContext";
import { Check, Lock, Search, SlidersHorizontal, AlertCircle, ArrowRight } from "lucide-react";

import {
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
import QuickAddDrawer from "@/components/catalog/QuickAddDrawer";
import QuickSegmentPills from "@/components/catalog/QuickSegmentPills";
import MoqProgressBar from "@/components/catalog/MoqProgressBar";
import { normalizeText } from "@/lib/catalog/normalize";
import { trackB2BEvent } from "@/lib/analytics";

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
  const [quickAddVariants, setQuickAddVariants] = useState<EnrichedMarco[] | null>(null);
  const [mounted, setMounted] = useState(false);

  // Auth Context: Seguridad B2B
  const { isLoggedIn, isB2BApproved, isB2BPending, opticaData, session } = useAuth();

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

    // Protección en el cliente: SOLO solicitar tarifas si el usuario está autenticado y VERIFICADO B2B
    if (!mounted || !isLoggedIn || !isB2BApproved || !session?.access_token || !initialMarcos || initialMarcos.length === 0) {
      return;
    }

    const ids = Array.from(
      new Set(initialMarcos.map((m) => m?.id_ext).filter(Boolean))
    );
    if (ids.length === 0) return;

    let cancelled = false;
    fetch('/api/catalog/pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ids }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.items)) return;
        const b2bMap = new Map(
          (data.items as Array<{ id_ext: string; precio_neto_clp?: number | null; precio_bruto_clp?: number | null; stock?: number | null }>).map(
            (row) => [row.id_ext, row]
          )
        );
        setMarcos((prev) =>
          prev.map((item) => {
            const b2b = b2bMap.get(item.id_ext);
            return b2b
              ? {
                  ...item,
                  precio_neto_clp: typeof b2b.precio_neto_clp === 'number' ? b2b.precio_neto_clp : undefined,
                  precio_bruto_clp: typeof b2b.precio_bruto_clp === 'number' ? b2b.precio_bruto_clp : undefined,
                  stock: typeof b2b.stock === 'number' ? b2b.stock : undefined,
                }
              : item;
          })
        );
      })
      .catch((err) => {
        console.error('[CatalogoClient] Error al consultar tarifas B2B:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [initialMarcos, mounted, isLoggedIn, isB2BApproved, session?.access_token]);

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
    () => applyFilters(enriched, filters, mounted && isLoggedIn && isB2BApproved),
    [enriched, filters, mounted, isLoggedIn, isB2BApproved]
  );
  const activeCount = countActiveFilters(filters);

  // Telemetría B2B: Registrar navegación y filtros en el catálogo
  useEffect(() => {
    if (!mounted) return;
    const selectedBrand = filters.marca && filters.marca.length > 0 ? filters.marca.join(', ') : undefined;
    const selectedCategory = filters.tipo || (filters.material && filters.material.length > 0 ? filters.material.join(', ') : undefined);
    trackB2BEvent('view_catalog', {
      brand: selectedBrand,
      category: selectedCategory,
      search_term: filters.q || undefined,
      filter_count: activeCount,
    });
  }, [mounted, filters.marca, filters.tipo, filters.material, filters.q, activeCount]);

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

  const openProduct = useCallback((m: Marco) => {
    router.push(`/producto/${encodeURIComponent(m.marca)}/${encodeURIComponent(m.modelo)}`);
  }, [router]);

  const handleOpenQuickAdd = useCallback((variants: EnrichedMarco[]) => {
    setQuickAddVariants(variants);
  }, []);

  const handleCloseQuickAdd = useCallback(() => {
    setQuickAddVariants(null);
  }, []);

  const filterPanelProps = {
    filters,
    facets,
    onToggle: toggle,
    onSetQuery: setQuery,
    onSetSort: setSort,
    onClearAll: clearAll,
    onSetTipo: setTipo,
    tipo: filters.tipo,
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#0F0F0F] pb-24">
      {/* Toast Notificación */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
          <div
            className={`border px-5 py-3 shadow-lg flex items-center gap-3 text-xs tracking-wide uppercase font-medium ${
              toastType === "success"
                ? "bg-[#0F0F0F] text-white border-[#0F0F0F]"
                : "bg-[#FFFDF9] text-[#0F0F0F] border-[#9E8256]"
            }`}
          >
            {toastType === "success" ? (
              <Check className="w-4 h-4 text-[#9E8256]" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#9E8256]" />
            )}
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* CABECERA EDITORIAL Y PROPUESTA DE VALOR B2B */}
      <div className="border-b border-[#E6E2DD] bg-[#FFFFFF] py-12 px-4 sm:px-6 lg:px-8 mb-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-[1px] bg-[#9E8256]" />
              <span className="text-[10px] uppercase tracking-[0.25em] text-[#9E8256] font-medium">
                DISTRIBUCIÓN MAYORISTA EXCLUSIVA PARA ÓPTICAS
              </span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-normal text-[#0F0F0F] tracking-tight">
              Catálogo Oficial B2B
            </h1>
            <p className="text-[#5C5A55] text-xs sm:text-sm mt-3 max-w-2xl leading-relaxed">
              Armazones oftálmicos graduables y gafas de sol de primeras marcas importados desde EE.UU. Factura electrónica SII en pesos chilenos y compra mínima de 10 unidades combinables.
            </p>
          </div>

          <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-[#E6E2DD] pt-4 md:pt-0 md:pl-8 text-xs text-[#5C5A55]">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#787670] block font-medium">Compra Mínima</span>
              <p className="text-sm font-bold text-[#0F0F0F] font-mono tabular-nums">10 unidades</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#787670] block font-medium">Facturación</span>
              <p className="text-sm font-bold text-[#0F0F0F] font-mono">DTE / Factura SII</p>
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-wider text-[#787670] block font-medium">Plazo Entrega</span>
              <p className="text-sm font-bold text-[#0F0F0F] font-mono tabular-nums">10 a 15 días hábiles</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
        
        {/* BARRA DE PROGRESO DE MOQ EN VIVO (BANNER SUPERIOR) */}
        {mounted && (
          <MoqProgressBar variant="banner" isLoggedIn={isLoggedIn && isB2BApproved} className="mb-2" />
        )}

        {/* BANNER 1: INFORMATIVO PARA USUARIOS NO LOGUEADOS (GATEKEEPING B2B) */}
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

        {/* BANNER 2: INFORMATIVO ELEGANTE PARA ÓPTICAS LOGUEADAS CON VALIDACIÓN SII EN PROCESO */}
        {mounted && isLoggedIn && isB2BPending && (
          <div className="bg-[#FAF6ED] border border-[#E6D7B8] p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-2 shadow-xs">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-[#F3EAD3] text-[#846C44] border border-[#D9C496] flex-shrink-0 mt-0.5">
                <Lock className="w-5 h-5 text-[#846C44] stroke-[1.5]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-base font-semibold text-[#0F0F0F]">
                    Cuenta de Óptica en Validación Tributaria SII
                  </h3>
                  <span className="text-[10px] bg-[#EFE4C8] text-[#846C44] border border-[#D9C496] px-2 py-0.5 uppercase tracking-wider font-semibold font-mono">
                    VERIFICACIÓN EN CURSO
                  </span>
                  {opticaData?.rut_empresa && (
                    <span className="text-[10px] font-mono text-[#5C5A55] bg-white border border-[#E6D7B8] px-2 py-0.5">
                      RUT: {opticaData.rut_empresa}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#5C5A55] mt-1.5 max-w-2xl leading-relaxed">
                  Bienvenido a OptiHub. Su cuenta para <strong className="text-[#0F0F0F]">{opticaData?.nombre_optica || opticaData?.razon_social || 'su óptica'}</strong> está siendo verificada ante el Servicio de Impuestos Internos. Los precios mayoristas netos e importación directa se activarán una vez confirmado su giro comercial.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <a
                href={`https://wa.me/56989338537?text=${encodeURIComponent(
                  `Hola OptiHub B2B, acabo de ingresar a mi cuenta de óptica (${opticaData?.nombre_optica || 'Óptica'}, RUT: ${opticaData?.rut_empresa || ''}). Mi cuenta está en validación SII y solicito activación comercial prioritaria.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackB2BEvent('click_whatsapp_b2b', {
                    source: 'catalog',
                  });
                }}
                className="inline-flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1EBE5D] text-white px-6 py-3 text-[11px] uppercase tracking-[0.18em] font-semibold border border-[#20BA5A] transition-colors text-center flex-1 md:flex-none shadow-xs"
              >
                <span>Activar por WhatsApp</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* --- LAYOUT: SIDEBAR DE FILTROS + RESULTADOS --- */}
        <div className="flex gap-8 items-start">
          <FilterSidebar
            facets={facets}
            state={filters}
            onToggle={toggle}
            activeCount={activeCount}
            onClearAll={clearAll}
          />

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
                <SortSelect value={filters.sort} onChange={setSort} canSeePrices={mounted && isLoggedIn && isB2BApproved} />
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
                onClearQuery={() => setQuery('')}
                onClearAll={clearAll}
                onRemoveTipo={() => setTipo('')}
              />
            </div>

            {/* GRILLA DE PRODUCTOS */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-3/4 bg-[#E6E2DD]/40 animate-pulse border border-[#E6E2DD]" />
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
                    isLoggedIn={mounted && isLoggedIn && isB2BApproved}
                    onOpen={openProduct}
                    onQuickAdd={handleOpenQuickAdd}
                    materialLabels={facets.material}
                  />
                ))}
              </div>
            )}

            {/* Paginación SSR */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-12 pt-8 border-t border-[#E6E2DD]">
                {currentPage > 1 ? (
                  <button
                    onClick={() => setPage(currentPage - 1)}
                    className="border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-colors"
                  >
                    ← Anterior
                  </button>
                ) : (
                  <span className="border border-[#E6E2DD] text-[#787670] px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] cursor-not-allowed">
                    ← Anterior
                  </span>
                )}

                <span className="text-xs uppercase tracking-widest text-[#5C5A55] font-mono">
                  Página {currentPage} de {totalPages}
                </span>

                {currentPage < totalPages ? (
                  <button
                    onClick={() => setPage(currentPage + 1)}
                    className="border border-[#0F0F0F] text-[#0F0F0F] hover:bg-[#0F0F0F] hover:text-white px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] transition-colors"
                  >
                    Siguiente →
                  </button>
                ) : (
                  <span className="border border-[#E6E2DD] text-[#787670] px-5 py-2.5 text-[11px] uppercase tracking-[0.16em] cursor-not-allowed">
                    Siguiente →
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drawer Mobile de Filtros */}
      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        facets={facets}
        state={filters}
        onToggle={toggle}
        resultCount={totalCount}
        activeCount={activeCount}
        onClearAll={clearAll}
      />

      {/* Drawer de Compra Rápida por Matriz */}
      {quickAddVariants && (
        <QuickAddDrawer
          isOpen={!!quickAddVariants}
          onClose={handleCloseQuickAdd}
          variants={quickAddVariants}
        />
      )}

      {/* Barra Flotante Inferior de Progreso MOQ en Vivo */}
      {mounted && (
        <MoqProgressBar variant="floating" isLoggedIn={isLoggedIn && isB2BApproved} />
      )}
    </div>
  );
}
