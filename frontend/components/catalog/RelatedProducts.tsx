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
    <section className="mt-20 pt-12 border-t border-[#E6E2DD] max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 mb-8">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-[#9E8256] block mb-1">
            Colección {brand}
          </span>
          <h2 className="font-editorial font-serif text-2xl sm:text-3xl text-[#0F0F0F]">
            Más armazones {brand} para su óptica
          </h2>
        </div>
        <Link
          href={`/catalogo?marca=${encodeURIComponent(brand.toLowerCase())}`}
          className="text-xs font-semibold text-[#9E8256] hover:text-[#846C44] flex items-center gap-1.5 transition tracking-wide"
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
            className="group bg-[#FFFFFF] border border-[#E6E2DD] rounded-2xl overflow-hidden hover:border-[#9E8256] hover:shadow-lg transition-all duration-300 flex flex-col"
          >
            <div className="relative aspect-[4/3] bg-[#FFFFFF] p-6 flex items-center justify-center border-b border-[#E6E2DD]/60">
              <span className="absolute top-3 left-3 z-10 text-[10px] font-semibold uppercase tracking-wider text-[#888888] bg-[#FAF9F6] px-2 py-0.5 rounded border border-[#E6E2DD]">
                {item.marca}
              </span>
              <Image
                unoptimized
                src={item.imagen_principal || '/placeholder.png'}
                alt={`${item.marca} ${item.modelo}`}
                fill
                sizes="(max-width: 640px) 50vw, 25vw"
                className="object-contain p-4 group-hover:scale-105 transition-transform duration-300"
              />
            </div>

            <div className="p-4 flex-1 flex flex-col justify-between">
              <div>
                <h3 className="font-editorial font-serif text-base text-[#0F0F0F] group-hover:text-[#9E8256] transition-colors line-clamp-1">
                  {item.modelo}
                </h3>
                <p className="text-[11px] text-[#888888] font-mono mt-0.5">
                  SKU: {item.id_ext}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[#E6E2DD]/60 flex items-center justify-between text-xs text-[#888888] group-hover:text-[#9E8256] transition-colors">
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
