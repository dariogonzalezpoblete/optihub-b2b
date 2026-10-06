"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useCartStore } from "@/store/useCartStore";
import { useAuth } from "@/context/AuthContext";
import { Check, ShoppingBag, ArrowRight, Lock, Search, X } from "lucide-react";

interface Marco {
  id?: number;
  id_ext: string;
  marca: string;
  modelo: string;
  color: string;
  codigo_color: string;
  genero: string;
  forma: string;
  material: string;
  tamano: string;
  upc: string;
  origen: string;
  stock: number;
  precio_usd: number;
  precio_bruto_clp: number;
  precio_neto_clp: number;
  ganancia_clp: number;
  imagen_principal: string;
  imagenes_secundarias: string;
  url_origen: string;
}

function CatalogoContent() {
  const searchParams = useSearchParams();
  const [marcos, setMarcos] = useState<Marco[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBrand, setSelectedBrand] = useState("TODAS");
  const [selectedProduct, setSelectedProduct] = useState<Marco | null>(null);
  const [activeImage, setActiveImage] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  // Auth Context
  const { isLoggedIn, opticaData, user } = useAuth();

  // Store global de Zustand
  const addToCart = useCartStore((state) => state.addToCart);
  const clearCart = useCartStore((state) => state.clearCart);
  const getTotalUnits = useCartStore((state) => state.getTotalUnits);
  const getMontoNeto = useCartStore((state) => state.getMontoNeto);

  useEffect(() => {
    setMounted(true);
    fetchMarcos();
  }, []);

  useEffect(() => {
    const marcaParam = searchParams.get("marca");
    if (marcaParam) {
      setSelectedBrand(marcaParam.toUpperCase());
    }
  }, [searchParams]);

  const fetchMarcos = async () => {
    try {
      const { data, error } = await supabase
        .from("marcos") 
        .select("*");

      if (error) {
        console.error("❌ Error de Supabase:", error.message);
      } else if (data) {
        setMarcos(data);
      }
    } catch (error) {
      console.error("❌ Error inesperado:", error);
    } finally {
      setLoading(false);
    }
  };

  const agregarAlCarrito = (producto: Marco, cantidadSeleccionada: number) => {
    if (!isLoggedIn) return;

    addToCart(producto, cantidadSeleccionada);
    setSelectedProduct(null);
    setToastMessage(`✓ ${cantidadSeleccionada}x ${producto.marca} ${producto.modelo} añadido al carrito`);
    setTimeout(() => {
      setToastMessage("");
    }, 4000);
  };

  const filteredMarcos = marcos.filter((m) => {
    const matchesSearch = 
      (m.modelo?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (m.id_ext?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      (m.marca?.toLowerCase() || "").includes(searchTerm.toLowerCase());
    
    const matchesBrand = selectedBrand === "TODAS" || m.marca?.toUpperCase() === selectedBrand.toUpperCase();
    
    return matchesSearch && matchesBrand;
  });

  const brands = ["TODAS", ...Array.from(new Set(marcos.map(m => m.marca).filter(Boolean)))];

  const totalUnidades = mounted ? getTotalUnits() : 0;
  const montoNeto = mounted ? getMontoNeto() : 0;
  const moqAlcanzado = totalUnidades >= 10;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-32">
      
      {/* Toast flotante de confirmación */}
      {toastMessage && (
        <div className="fixed top-24 right-4 z-50 bg-emerald-500 text-slate-950 font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
          <Check className="w-5 h-5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* --- ENCABEZADO DE CATÁLOGO --- */}
      <div className="bg-slate-900/50 border-b border-slate-800/80 py-8 px-4 sm:px-6 lg:px-8 mb-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Distribución Exclusiva B2B para Ópticas
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Catálogo Mayorista de Armazones
            </h1>
            <p className="mt-2 text-base text-slate-300 max-w-2xl">
              Importación directa desde EE.UU. con sincronización en tiempo real. 
              <span className="text-emerald-400 font-semibold"> Compra mínima de 10 unidades</span> combinables entre cualquier marca.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 p-4 rounded-xl shadow-lg flex items-center gap-3 backdrop-blur-sm">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Plazo de entrega</p>
              <p className="text-sm font-bold text-white">10 a 15 días hábiles</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8">
        
        {/* BANNER INFORMATIVO PARA USUARIOS NO LOGUEADOS (GATEKEEPING B2B) */}
        {mounted && !isLoggedIn && (
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900/80 to-slate-900/60 border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30 flex-shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Precios Mayoristas Reservados para Ópticas</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full uppercase">
                    Exclusivo B2B
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Para proteger los márgenes comerciales de nuestros clientes, los precios netos en CLP y el pedido mayorista solo son visibles para ópticas registradas.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <Link
                href="/login?redirect=/catalogo"
                className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs px-5 py-3 rounded-xl transition uppercase tracking-wider text-center shadow-lg shadow-emerald-500/20"
              >
                Iniciar Sesión
              </Link>
              <Link
                href="/registro?redirect=/catalogo"
                className="flex-1 md:flex-none bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-5 py-3 rounded-xl transition uppercase tracking-wider text-center border border-slate-700"
              >
                Registrar Óptica
              </Link>
            </div>
          </div>
        )}

        {/* Buscador */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Buscador y Filtros</h2>
            <p className="text-sm text-slate-400">Armazones ópticos originales sincronizados en tiempo real</p>
          </div>
          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search className="w-4 h-4" />
            </div>
            <input 
              type="text"
              placeholder="Modelo, SKU o marca..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 pl-10 pr-9 py-2.5 rounded-xl text-sm focus:outline-none focus:border-emerald-500 text-white placeholder-slate-500 transition"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Marcas */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {brands.map((brand) => (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider transition uppercase whitespace-nowrap ${
                selectedBrand.toUpperCase() === brand.toUpperCase()
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20 font-black' 
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>

        {/* Grid de Productos */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg animate-pulse">
                <div className="h-48 bg-slate-800/60" />
                <div className="p-4 space-y-3">
                  <div className="h-3 skeleton w-1/3" />
                  <div className="h-4 skeleton w-3/4" />
                  <div className="h-3 skeleton w-1/2" />
                  <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
                    <div className="h-4 skeleton w-20" />
                    <div className="h-6 skeleton w-14" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredMarcos.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/30 border border-slate-800/80 rounded-2xl">
            <Search className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">No se encontraron armazones con los filtros seleccionados.</p>
            <button
              onClick={() => { setSearchTerm(''); setSelectedBrand('TODAS'); }}
              className="mt-4 text-xs text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider transition"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filteredMarcos.map((marco, idx) => (
              <div 
                key={marco.id_ext}
                onClick={() => {
                  setSelectedProduct(marco);
                  setActiveImage(marco.imagen_principal);
                }}
                className="card-product group animate-slide-up"
                style={{ animationDelay: `${Math.min(idx, 7) * 30}ms` }}
              >
                <div className="relative h-48 bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
                  <img 
                    src={marco.imagen_principal || "/placeholder.png"} 
                    alt={marco.modelo}
                    className="max-h-full object-contain group-hover:scale-105 transition duration-300"
                  />
                  <span className="badge-brand absolute top-3 left-3">
                    {marco.marca}
                  </span>
                  {/* Overlay sutil al hover */}
                  <div className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/5 transition duration-300 rounded-t-2xl" />
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-white text-base leading-tight group-hover:text-emerald-400 transition-colors line-clamp-2">{marco.modelo}</h3>
                      <span className="text-[10px] text-slate-500 font-mono flex-shrink-0">{marco.codigo_color}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 font-mono">SKU: {marco.id_ext}</p>
                    {marco.material && (
                      <p className="text-[11px] text-slate-600 mt-0.5">{marco.material}</p>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center">
                    {isLoggedIn ? (
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase font-medium tracking-wide">Neto B2B</span>
                        <span className="text-emerald-400 font-black text-sm">
                          ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                        </span>
                      </div>
                    ) : (
                      <span className="badge-b2b-locked">
                        <Lock className="w-3 h-3" />
                        Precio B2B
                      </span>
                    )}

                    <span className="badge-stock">
                      {marco.stock} un.
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de Detalle de Producto */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]">
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 z-10 bg-slate-800 hover:bg-slate-700 text-slate-300 w-9 h-9 rounded-full flex items-center justify-center transition border border-slate-700"
              >
                ✕
              </button>

              <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col gap-4 justify-between border-b md:border-b-0 md:border-r border-slate-800">
                <div className="relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center p-4 h-[300px] md:h-[360px] shadow-inner group">
                  <img 
                    src={activeImage || selectedProduct.imagen_principal} 
                    alt={selectedProduct.modelo} 
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  <div 
                    onClick={() => setActiveImage(selectedProduct.imagen_principal)}
                    className={`cursor-pointer border-2 rounded-xl overflow-hidden w-16 h-16 flex-shrink-0 bg-slate-900 transition ${
                      activeImage === selectedProduct.imagen_principal ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={selectedProduct.imagen_principal} alt="Principal" className="w-full h-full object-cover" />
                  </div>
                  {selectedProduct.imagenes_secundarias && (
                    <div 
                      onClick={() => setActiveImage(selectedProduct.imagenes_secundarias)}
                      className={`cursor-pointer border-2 rounded-xl overflow-hidden w-16 h-16 flex-shrink-0 bg-slate-900 transition ${
                        activeImage === selectedProduct.imagenes_secundarias ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={selectedProduct.imagenes_secundarias} alt="Secundaria" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto space-y-6">
                <div>
                  <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">{selectedProduct.marca}</span>
                  <h2 className="text-3xl font-extrabold text-white mt-1">{selectedProduct.modelo}</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1">SKU: {selectedProduct.id_ext}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Color</span>
                    <span className="font-semibold text-slate-200">{selectedProduct.color || selectedProduct.codigo_color}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Material</span>
                    <span className="font-semibold text-slate-200">{selectedProduct.material || 'Estándar'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Medidas</span>
                    <span className="font-semibold text-slate-200">{selectedProduct.tamano || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Forma</span>
                    <span className="font-semibold text-slate-200">{selectedProduct.forma || 'N/A'}</span>
                  </div>
                </div>

                {/* BLOQUE DE PRECIO / GATEKEEPING */}
                {isLoggedIn ? (
                  <>
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                      <span className="text-xs text-slate-400 block font-medium uppercase">Precio Neto B2B (más IVA)</span>
                      <div className="text-3xl font-black text-emerald-400 mt-0.5">
                        ${selectedProduct.precio_neto_clp?.toLocaleString('es-CL')} <span className="text-xs font-normal text-slate-400">CLP</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-400">Stock Mayorista Disponible</span>
                        <span className="text-sm font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1 rounded-xl">
                          {selectedProduct.stock} Unidades
                        </span>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <input 
                          type="number" 
                          min="1" 
                          max={selectedProduct.stock} 
                          defaultValue="1" 
                          id="cantidad-input"
                          className="bg-slate-950 border border-slate-800 text-center w-20 rounded-xl text-white font-bold focus:outline-none focus:border-emerald-500"
                        />
                        <button 
                          onClick={() => {
                            const inputEl = document.getElementById('cantidad-input') as HTMLInputElement;
                            const cant = inputEl ? parseInt(inputEl.value) || 1 : 1;
                            agregarAlCarrito(selectedProduct, cant);
                          }}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-4 rounded-xl transition shadow-lg shadow-emerald-500/20 text-sm flex items-center justify-center gap-2"
                        >
                          <ShoppingBag className="w-4 h-4" />
                          Agregar al Carrito B2B
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-slate-950 p-5 rounded-2xl border border-amber-500/30 space-y-3">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                      <Lock className="w-4 h-4" />
                      <span>Precios y Compras Restringidos</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Para ver los precios netos mayoristas y agregar este modelo a tu orden de importación directa, inicia sesión con tu cuenta de óptica.
                    </p>
                    <div className="pt-2 flex flex-col sm:flex-row gap-2">
                      <Link
                        href="/login?redirect=/catalogo"
                        className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 px-4 rounded-xl text-center text-xs uppercase tracking-wider transition shadow-lg shadow-emerald-500/20"
                      >
                        Iniciar Sesión
                      </Link>
                      <Link
                        href="/registro?redirect=/catalogo"
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 px-4 rounded-xl text-center text-xs uppercase tracking-wider border border-slate-700 transition"
                      >
                        Registrar Óptica
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* --- BARRA FLOTANTE INFERIOR SINCRONIZADA CON EL STORE --- */}
      {mounted && totalUnidades > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md p-4 z-40 shadow-2xl">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-emerald-500/20 text-emerald-400 p-3 rounded-xl border border-emerald-500/30">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Carrito B2B: {totalUnidades} {totalUnidades === 1 ? 'unidad' : 'unidades'}</span>
                  {isLoggedIn && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span className="text-emerald-400 font-extrabold">${montoNeto.toLocaleString('es-CL')} CLP Neto</span>
                    </>
                  )}
                </p>
                <p className="text-xs text-slate-400">
                  {!moqAlcanzado ? (
                    <span className="text-amber-400 font-semibold">
                      ⚠️ Faltan {10 - totalUnidades} unidades para el mínimo B2B (10 un.)
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold">
                      ✅ ¡Mínimo de 10 unidades cumplido!
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => clearCart()}
                className="text-xs text-slate-400 hover:text-rose-400 px-3 py-2 transition"
              >
                Vaciar
              </button>
              <Link 
                href="/carrito"
                className="flex-1 sm:flex-none font-black px-6 py-3 rounded-xl transition text-sm flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20"
              >
                Revisar Carrito B2B
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function CatalogoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando catálogo OptiHub...</div>}>
      <CatalogoContent />
    </Suspense>
  );
}