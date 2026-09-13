"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

// Definición de la interfaz del producto según Supabase
interface Marco {
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
  
  // Estado para manejar la imagen activa en el modal
  const [activeImage, setActiveImage] = useState<string>("");

  useEffect(() => {
    fetchMarcos();
  }, []);

  const fetchMarcos = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/marcos");
      if (response.ok) {
        const data = await response.json();
        setMarcos(data);
      }
    } catch (error) {
      console.error("Error al conectar con el backend:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrado de productos
  const filteredMarcos = marcos.filter((m) => {
    const matchesSearch = 
      m.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.id_ext.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.marca.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBrand = selectedBrand === "TODAS" || m.marca.toUpperCase() === selectedBrand.toUpperCase();
    
    return matchesSearch && matchesBrand;
  });

  const brands = ["TODAS", ...Array.from(new Set(marcos.map(m => m.marca)))];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      
      {/* --- ENCABEZADO DE CATÁLOGO MODERNO Y PERSUASIVO --- */}
      <div className="bg-slate-900 border-b border-slate-800 py-8 px-4 sm:px-6 lg:px-8 mb-6">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
              
              {/* Títulos y propuesta de valor comercial */}
              <div className="text-center md:text-left">
                  <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full mb-3">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Distribución Exclusiva B2B para Ópticas
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                      Catálogo Mayorista de Armazones
                  </h1>
                  <p className="mt-2 text-base text-slate-300 max-w-2xl">
                      Importación directa desde EE.UU. con precios netos en CLP sincronizados en tiempo real. 
                      <span className="text-emerald-400 font-semibold"> Compra mínima de 10 unidades</span> combinables entre cualquier marca.
                  </p>
              </div>

              {/* Tarjeta destacada de plazos de entrega */}
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

      <div className="max-w-7xl mx-auto space-y-6 px-4 sm:px-6 lg:px-8 pb-16">
        
        {/* Cabecera interna y Buscador */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">Buscador y Filtros</h2>
            <p className="text-sm text-slate-400">Marcos ópticos sincronizados sin cruce de colores</p>
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <input 
              type="text"
              placeholder="Buscar por modelo, SKU o marca..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-sm w-full md:w-80 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* Filtros por Marca */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {brands.map((brand) => (
            <button
              key={brand}
              onClick={() => setSelectedBrand(brand)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider transition uppercase whitespace-nowrap ${
                selectedBrand === brand 
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20' 
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {brand}
            </button>
          ))}
        </div>

        {/* Listado / Grid de Productos */}
        {loading ? (
          <div className="text-center py-20 text-slate-500 animate-pulse">Cargando catálogo sincronizado...</div>
        ) : filteredMarcos.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/30 border border-slate-800/80 rounded-2xl text-slate-400">
            No se encontraron marcos ópticos con los filtros seleccionados.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredMarcos.map((marco) => (
              <div 
                key={marco.id_ext}
                onClick={() => {
                  setSelectedProduct(marco);
                  setActiveImage(marco.imagen_principal);
                }}
                className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden cursor-pointer hover:border-emerald-500/50 transition group flex flex-col justify-between shadow-lg"
              >
                <div className="relative h-48 bg-slate-950 flex items-center justify-center p-4 overflow-hidden">
                  <img 
                    src={marco.imagen_principal || "/placeholder.png"} 
                    alt={marco.modelo}
                    className="max-h-full object-contain group-hover:scale-105 transition duration-300"
                  />
                  <span className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-emerald-400 text-[10px] px-2.5 py-1 rounded-lg font-semibold uppercase">
                    {marco.marca}
                  </span>
                </div>

                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <h3 className="font-bold text-white text-base">{marco.modelo}</h3>
                      <span className="text-xs text-slate-400 font-mono">{marco.codigo_color}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">SKU: {marco.id_ext}</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex justify-between items-center">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Precio Neto B2B</span>
                      <span className="text-emerald-400 font-bold text-sm">
                        ${marco.precio_neto_clp?.toLocaleString('es-CL')} CLP
                      </span>
                    </div>
                    <span className="text-xs bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-medium">
                      {marco.stock} un.
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de Detalle con Galerías Limitadas a 2 Imágenes */}
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row max-h-[90vh]">
              
              {/* Botón Cerrar */}
              <button 
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 right-4 z-10 bg-slate-800 hover:bg-slate-700 text-slate-300 w-9 h-9 rounded-full flex items-center justify-center transition border border-slate-700"
              >
                ✕
              </button>

              {/* Columna Izquierda: Visor de Imágenes HD */}
              <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col gap-4 justify-between border-b md:border-b-0 md:border-r border-slate-800">
                <div className="relative bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex items-center justify-center p-4 h-[320px] md:h-[380px] shadow-inner group">
                  <img 
                    src={activeImage || selectedProduct.imagen_principal} 
                    alt={selectedProduct.modelo} 
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                  {/* Botón flotante para abrir en pestaña nueva en HD */}
                  <a 
                    href={activeImage || selectedProduct.imagen_principal} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="absolute bottom-4 right-4 bg-slate-800/90 hover:bg-emerald-600 hover:text-white text-slate-200 text-xs px-3.5 py-2 rounded-xl backdrop-blur-md border border-slate-700 transition shadow-lg flex items-center gap-1.5 font-medium"
                  >
                    🔍 Abrir HD en pestaña nueva
                  </a>
                </div>

                {/* Miniaturas (Limitadas estrictamente a las 2 primeras: Principal + 1era Secundaria) */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {/* 1. Imagen Principal */}
                  <div 
                    onClick={() => setActiveImage(selectedProduct.imagen_principal)}
                    className={`cursor-pointer border-2 rounded-xl overflow-hidden w-16 h-16 flex-shrink-0 bg-slate-900 transition ${
                      activeImage === selectedProduct.imagen_principal ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={selectedProduct.imagen_principal} alt="Principal" className="w-full h-full object-cover" />
                  </div>

                  {/* 2. Primera Imagen Secundaria (Limitada con .slice(0, 1)) */}
                  {selectedProduct.imagenes_secundarias && selectedProduct.imagenes_secundarias.split('|').slice(0, 1).map((imgUrl, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setActiveImage(imgUrl)}
                      className={`cursor-pointer border-2 rounded-xl overflow-hidden w-16 h-16 flex-shrink-0 bg-slate-900 transition ${
                        activeImage === imgUrl ? 'border-emerald-500 scale-105' : 'border-slate-800 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={imgUrl} alt="Secundaria 1" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Columna Derecha: Información del Producto */}
              <div className="w-full md:w-1/2 p-6 md:p-8 overflow-y-auto space-y-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-400 tracking-wider uppercase">{selectedProduct.marca}</span>
                  </div>
                  <h2 className="text-3xl font-extrabold text-white mt-1">{selectedProduct.modelo}</h2>
                  <p className="text-xs text-slate-400 font-mono mt-1">ID Ext: {selectedProduct.id_ext}</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                  <span className="text-xs text-slate-400 block font-medium">Precio Neto B2B</span>
                  <div className="text-2xl font-black text-emerald-400 mt-0.5">
                    ${selectedProduct.precio_neto_clp?.toLocaleString('es-CL')} <span className="text-xs font-normal text-slate-400">CLP</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Especificaciones Técnicas</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <div>
                      <span className="text-slate-500 block">Color / Variante</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.color || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Código Color</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.codigo_color || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Género</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.genero || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Forma</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.forma || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Material</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.material || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Tamaño</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.tamano || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">UPC</span>
                      <span className="text-slate-200 font-mono text-[11px]">{selectedProduct.upc || "N/A"}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Origen</span>
                      <span className="text-slate-200 font-semibold">{selectedProduct.origen || "N/A"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <span className="text-xs text-slate-400">Stock Disponible</span>
                  <span className="text-sm font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-900/50 px-3 py-1 rounded-xl">
                    {selectedProduct.stock} Unidades
                  </span>
                </div>

              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default function CatalogoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Cargando módulo de catálogo...</div>}>
      <CatalogoContent />
    </Suspense>
  );
}