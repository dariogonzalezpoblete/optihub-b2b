'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ShieldCheck, Truck, FileText, MessageCircle } from 'lucide-react';
import { OptiHubEmblem } from '@/components/ui/OptiHubLogo';

export default function Footer() {
  const { isLoggedIn } = useAuth();

  return (
    <footer className="bg-[#FFFFFF] border-t border-[#E5E4DF] text-[#111111] mt-20">
      
      {/* FRANJA DE GARANTÍAS ESENCIALES */}
      <div className="border-b border-[#E5E4DF] bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E4DF] flex items-center justify-center text-[#B89768] shrink-0">
                <ShieldCheck className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">100% Originales de Fábrica</h4>
                <p className="text-xs text-[#575551]">Estuche rígido oficial, paño y folletería de fábrica.</p>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E4DF] flex items-center justify-center text-[#B89768] shrink-0">
                <FileText className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Factura Electrónica SII</h4>
                <p className="text-xs text-[#575551]">IVA (19%) 100% deducible como crédito fiscal.</p>
              </div>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FFFFFF] border border-[#E5E4DF] flex items-center justify-center text-[#B89768] shrink-0">
                <Truck className="w-5 h-5 stroke-[1.8]" />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#111111]">Importación Directa USA</h4>
                <p className="text-xs text-[#575551]">Entrega en 10 a 15 días hábiles a todo Chile.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* NAVEGACIÓN Y CRÉDITOS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          
          {/* IDENTIDAD */}
          <div className="space-y-2">
            <Link href="/" className="inline-flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-[#FAF9F6] border border-[#E5E4DF] flex items-center justify-center p-1.5 shadow-2xs group-hover:border-[#B89768] transition-colors">
                <OptiHubEmblem className="w-full h-full" />
              </div>
              <span className="font-editorial text-2xl font-semibold tracking-tight text-[#111111]">
                Opti<span className="text-[#B89768]">Hub</span>
              </span>
            </Link>
            <p className="text-xs text-[#82807A]">
              Plataforma de abastecimiento e importación mayorista de armazones para ópticas en Chile.
            </p>
          </div>

          {/* ENLACES ESENCIALES Y WHATSAPP */}
          <nav className="flex flex-wrap justify-center items-center gap-6 text-xs font-medium text-[#575551]">
            <Link href="/" className="hover:text-[#111111] transition-colors">
              Inicio
            </Link>
            <Link href="/catalogo" className="hover:text-[#111111] transition-colors">
              Catálogo
            </Link>
            <Link href={isLoggedIn ? "/mis-pedidos" : "/login"} className="hover:text-[#111111] transition-colors">
              {isLoggedIn ? "Mi Cuenta" : "Iniciar Sesión"}
            </Link>
            <Link href="/carrito" className="hover:text-[#111111] transition-colors">
              Carro
            </Link>
            <a
              href="https://wa.me/569989338537"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-[#FAF9F6] hover:bg-[#F4EFE6] text-[#111111] border border-[#E5E4DF] hover:border-[#B89768] px-3.5 py-2 rounded-full transition-all font-semibold"
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#B89768]" />
              <span>Soporte Mayorista y Consultas por WhatsApp</span>
            </a>
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-[#E5E4DF] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-[#82807A]">
          <p>© {new Date().getFullYear()} OptiHub B2B SpA. Todos los derechos reservados.</p>
          <a
            href="https://wa.me/569989338537"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-[#575551] hover:text-[#B89768] transition-colors"
          >
            WhatsApp Directo: +56 9 9893 38537
          </a>
        </div>
      </div>

    </footer>
  );
}
