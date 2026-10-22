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
      tag: 'Garantía de Fábrica'
    },
    {
      icon: CheckCircle2,
      title: 'Inspección de Calidad en Miami',
      desc: 'Revisión óptica unitaria previa al embarque: verificación de bisagras, calibración de varillas y estado impecable del acetato o titanio.',
      tag: 'Control Pre-Despacho'
    },
    {
      icon: FileText,
      title: 'Facturación Legal Chilena (SII)',
      desc: 'Todas las compras se respaldan con Factura Electrónica legal con IVA (19%) deducible para tu empresa o sociedad médica.',
      tag: 'Crédito Fiscal 100%'
    }
  ];

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-emerald-500/30 p-8 sm:p-12 lg:p-14 shadow-2xl overflow-hidden">
        
        {/* Glow ambiental decorativo */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-cyan-500/10 blur-[130px] rounded-full pointer-events-none" />

        <div className="relative z-10 space-y-10">
          
          {/* Cabecera del Banner */}
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Garantía de Autenticidad B2B & Origen Oficial</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight uppercase">
              100% Originales con Empaque y Certificaciones de Fábrica
            </h2>

            <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
              En <strong className="text-white font-semibold">OptiHub B2B</strong> eliminamos intermediarios sin comprometer la legitimidad. Todos nuestros armazones proceden de distribuidores certificados internacionales y se despachan en su presentación de vitrina original para que tu óptica entregue la máxima confianza al paciente final.
            </p>
          </div>

          {/* Cuadrícula de 4 Pilares de Garantía */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {guarantees.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div 
                  key={idx}
                  className="bg-slate-950/80 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 group"
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500 group-hover:text-slate-950 transition-colors">
                        <Icon className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] font-bold text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider">
                        {item.tag}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-white font-bold text-base group-hover:text-emerald-300 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-slate-400 text-xs sm:text-sm mt-2 leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-900 flex items-center gap-1.5 text-xs text-slate-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Estándar Óptico Certificado</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Barra inferior de sellos y CTA */}
          <div className="pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-slate-300">
                <Truck className="w-4 h-4 text-emerald-400" /> Despacho consolidado Miami - Chile
              </span>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <FileText className="w-4 h-4 text-emerald-400" /> Trámite aduanero y aranceles resueltos
              </span>
              <span className="hidden sm:inline text-slate-600">•</span>
              <span className="text-emerald-400 font-bold">
                Pedido mínimo: 10 unidades combinables
              </span>
            </div>

            <Link
              href="/catalogo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 flex-shrink-0"
            >
              <span>Ver Catálogo con Stock</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}
