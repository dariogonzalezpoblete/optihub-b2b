'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, Truck, FileText, MessageCircle } from 'lucide-react';

export default function Footer() {
  const { isLoggedIn } = useAuth();

  return (
    <footer className="bg-[#FFFFFF] border-t border-[#E6E2DD] text-[#0F0F0F] mt-24">
      
      {/* FRANJA DE GARANTÍAS ESENCIALES */}
      <div className="border-b border-[#E6E2DD] bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left divide-y md:divide-y-0 md:divide-x divide-[#E6E2DD]">
            
            <div className="flex items-start justify-center md:justify-start gap-4 pt-4 md:pt-0">
              <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FFFFFF] flex items-center justify-center text-[#9E8256] shrink-0">
                <ShieldCheck className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">
                  100% Originales de Fábrica
                </h4>
                <p className="text-xs text-[#5C5A55] mt-1 leading-relaxed">
                  Estuche rígido oficial, paño de microfibra y folletería de fábrica garantizada.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-center md:justify-start gap-4 pt-6 md:pt-0 md:pl-8">
              <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FFFFFF] flex items-center justify-center text-[#9E8256] shrink-0">
                <FileText className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">
                  Factura Electrónica SII
                </h4>
                <p className="text-xs text-[#5C5A55] mt-1 leading-relaxed">
                  IVA (19%) 100% deducible como crédito fiscal para su óptica comercial en Chile.
                </p>
              </div>
            </div>

            <div className="flex items-start justify-center md:justify-start gap-4 pt-6 md:pt-0 md:pl-8">
              <div className="w-10 h-10 border border-[#E6E2DD] bg-[#FFFFFF] flex items-center justify-center text-[#9E8256] shrink-0">
                <Truck className="w-4 h-4 stroke-[1.5]" />
              </div>
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0F0F0F]">
                  Importación Directa USA
                </h4>
                <p className="text-xs text-[#5C5A55] mt-1 leading-relaxed">
                  Entrega consolidada en 10 a 15 días hábiles con trazabilidad en todo Chile.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* NAVEGACIÓN Y CRÉDITOS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          
          {/* IDENTIDAD MAISON */}
          <div className="space-y-2">
            <Link href="/" className="inline-flex flex-col group">
              <span className="font-serif text-2xl tracking-[0.22em] uppercase text-[#0F0F0F] font-normal group-hover:text-[#9E8256] transition-colors leading-tight">
                OPTIHUB
              </span>
              <span className="text-[9px] tracking-[0.25em] text-[#5C5A55] uppercase font-sans mt-0.5">
                MAISON MAYORISTA ÓPTICA · USA
              </span>
            </Link>
            <p className="text-xs text-[#5C5A55] max-w-sm">
              Plataforma de abastecimiento e importación mayorista de armazones para ópticas autorizadas en Chile.
            </p>
          </div>

          {/* ENLACES ESENCIALES Y WHATSAPP */}
          <nav className="flex flex-wrap justify-center items-center gap-6 text-[11px] uppercase tracking-[0.18em] text-[#5C5A55]">
            <Link href="/" className="hover:text-[#0F0F0F] transition-colors">
              Inicio
            </Link>
            <Link href="/catalogo" className="hover:text-[#0F0F0F] transition-colors">
              Catálogo
            </Link>
            <Link href={isLoggedIn ? "/mis-pedidos" : "/login"} className="hover:text-[#0F0F0F] transition-colors">
              {isLoggedIn ? "Mi Cuenta" : "Acceso Ópticas"}
            </Link>
            <Link href="/carrito" className="hover:text-[#0F0F0F] transition-colors">
              Pedido B2B
            </Link>
            <a
              href="https://wa.me/56989338537"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#FAF9F6] hover:bg-[#F4F2ED] text-[#0F0F0F] border border-[#E6E2DD] px-4 py-2.5 transition-colors font-medium text-[10px] uppercase tracking-[0.16em]"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#9E8256]" />
              <span>Soporte Mayorista WhatsApp</span>
            </a>
          </nav>
        </div>

        <div className="mt-12 pt-8 border-t border-[#E6E2DD] flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] uppercase tracking-[0.18em] text-[#787670]">
          <p>© {new Date().getFullYear()} OPTIHUB B2B. TODOS LOS DERECHOS RESERVADOS.</p>
        </div>
      </div>

    </footer>
  );
}
