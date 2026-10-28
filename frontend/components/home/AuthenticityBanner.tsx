'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  PackageCheck, 
  FileText, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight,
  Award,
  Truck
} from 'lucide-react';

export default function AuthenticityBanner() {
  const guarantees = [
    {
      icon: PackageCheck,
      title: 'Empaque Oficial Completo',
      desc: 'Cada armazón incluye su estuche rígido original de la marca, paño de microfibra de alta densidad y embalaje protector de fábrica.',
      tag: '100% Packaging Original'
    },
    {
      icon: Award,
      title: 'Certificación & Trazabilidad',
      desc: 'Productos con folletería de autenticidad del fabricante, código de barras y trazabilidad de lote directo desde distribuidores autorizados.',
      tag: 'Origen Autorizado'
    },
    {
      icon: CheckCircle2,
      title: 'Proceso Logístico en Origen',
      desc: 'Consolidación profesional, etiquetado y embalaje de seguridad en bodega de origen previo al embarque aéreo directo a Santiago.',
      tag: 'Logística en Origen'
    },
    {
      icon: FileText,
      title: 'Facturación Legal Chilena (SII)',
      desc: 'Todas las compras se respaldan con Factura Electrónica legal con IVA (19%) deducible para tu empresa o sociedad médica.',
      tag: 'Crédito Fiscal 100%'
    }
  ];

  return (
    <section className="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="relative rounded-3xl bg-[#FFFFFF] border border-[#E6E2DD] p-8 sm:p-12 lg:p-14 shadow-xs overflow-hidden">
        
        {/* Glow sutil champagne */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#9E8256]/5 blur-[130px] rounded-full pointer-events-none" />

        <div className="relative z-10 space-y-10">
          
          {/* Cabecera del Banner */}
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#F7F3EB] border border-[#9E8256]/30 text-[#846C44] text-xs font-semibold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-[#9E8256]" />
              <span>Garantía de Autenticidad B2B & Origen Oficial</span>
            </div>

            <h2 className="font-editorial text-3xl sm:text-4xl lg:text-5xl font-normal text-[#0F0F0F] tracking-tight leading-tight">
              100% Originales con Empaque y Certificaciones de Fábrica
            </h2>

            <p className="text-[#575551] text-base sm:text-lg leading-relaxed">
              En <strong className="text-[#0F0F0F] font-semibold">OptiHub B2B</strong> eliminamos intermediarios sin comprometer la legitimidad. Todos nuestros armazones proceden de distribuidores certificados internacionales y se despachan en su presentación de vitrina original para que tu óptica entregue la máxima confianza al paciente final.
            </p>
          </div>

          {/* Cuadrícula de 4 Pilares de Garantía */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {guarantees.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div 
                  key={idx}
                  className="bg-[#FAF9F6] border border-[#E6E2DD] hover:border-[#9E8256] rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-sm group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center text-[#9E8256] group-hover:bg-[#0F0F0F] group-hover:text-white transition-colors shadow-2xs">
                        <Icon className="w-6 h-6 stroke-[1.8]" />
                      </div>
                      <span className="text-[10px] font-semibold text-[#846C44] bg-[#F7F3EB] border border-[#9E8256]/30 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {item.tag}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-[#0F0F0F] font-editorial text-lg font-semibold group-hover:text-[#9E8256] transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-[#575551] text-xs sm:text-sm mt-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-[#E6E2DD] flex items-center gap-1.5 text-xs text-[#82807A] font-medium font-tech">
                    <Sparkles className="w-3.5 h-3.5 text-[#9E8256]" />
                    <span>Estándar Óptico Certificado</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra inferior de sellos y CTA */}
          <div className="pt-6 border-t border-[#E6E2DD] flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#575551]">
              <span className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#9E8256]" /> Despacho consolidado Miami - Chile
              </span>
              <span className="hidden sm:inline text-[#E6E2DD]">•</span>
              <span className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#9E8256]" /> Trámite aduanero y aranceles resueltos
              </span>
              <span className="hidden sm:inline text-[#E6E2DD]">•</span>
              <span className="text-[#0F0F0F] font-bold font-tech">
                Pedido mínimo: 10 unidades combinables
              </span>
            </div>

            <Link
              href="/catalogo"
              className="btn-primary w-full sm:w-auto text-xs"
            >
              <span>Ver Catálogo con Stock</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
