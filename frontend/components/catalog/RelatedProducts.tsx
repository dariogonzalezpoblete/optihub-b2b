import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Eye } from 'lucide-react';

interface RelatedItem {
  id_ext: string;
  marca: string;
  modelo: string;
  imagen_principal?: string;
  codigo_color?: string;
  material?: string;
  forma?: string;
}

interface Props {
  brand: string;
  currentModel: string;
  items: RelatedItem[];
}

export default function RelatedProducts({ brand, currentModel, items }: Props) {
  if (!items || items.length === 0) return null;

  return (
    <section className="mt-16 pt-12 border-t border-slate-800/80 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 block mb-1">
            Explora más modelos
          </span>
          <h2 className="text-2xl font-black text-white">
            Más armazones {brand} para ópticas
          </h2>
        </div>
        <Link
          href={`/catalogo?marca=${encodeURIComponent(brand.toLowerCase())}`}
          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition"
        >
          Ver todo el catálogo de {brand}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {items.map((item) => (
          <Link
            key={item.id_ext}
            href={`/producto/${encodeURIComponent(item.marca)}/${encodeURIComponent(item.modelo)}`}
            className="group bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-emerald-500/50 hover:shadow-xl hover:shadow-emerald-500/5 transition-all duration-300 flex flex-col"
          >
            <div className="relative aspect-[4/3] bg-gradient-to-b from-slate-900 to-slate-950 p-4 flex items-center justify-center">
              <span className="badge-brand absolute top-3 left-3 z-10 text-[9px]">
                {item.marca}
              </span>
              <Image
                unoptimized
                src={item.imagen_principal || '/placeholder.png'}
                alt={`${item.marca} ${item.modelo}`}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-contain p-3 group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between border-t border-slate-800/60">
              <div>
                <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition-colors line-clamp-1">
                  {item.modelo}
                </h3>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  SKU: {item.id_ext}
                </p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 group-hover:text-emerald-300 transition-colors">
                <span className="text-[11px] font-medium">Ver especificaciones</span>
                <Eye className="w-3.5 h-3.5" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
