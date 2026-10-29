'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { trackB2BEvent } from '@/lib/analytics';
import {
  ShieldCheck,
  Truck,
  FileText,
  MessageCircle,
  Building2,
  Mail,
  MapPin,
  CreditCard,
  CheckCircle2,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

export default function Footer() {
  const { isLoggedIn } = useAuth();

  return (
    <footer className="bg-[#FFFFFF] border-t border-[#E6E2DD] text-[#0F0F0F] mt-24">
      {/* FRANJA SUPERIOR DE GARANTÍAS ESENCIALES */}
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
                  Estuche rígido oficial, paño de microfibra y folletería de fábrica garantizada por unidad.
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
                  Entrega nacionalizada puerta a puerta en 10 a 15 días hábiles sin trámites aduaneros.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ESTRUCTURA PRINCIPAL EN 4 COLUMNAS PROFESIONALES */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          
          {/* COLUMNA 1: IDENTIDAD Y RESPALDO */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex flex-col group">
              <span className="font-serif text-2xl tracking-[0.22em] uppercase text-[#0F0F0F] font-normal group-hover:text-[#9E8256] transition-colors leading-tight">
                OPTIHUB
              </span>
              <span className="text-[9px] tracking-[0.25em] text-[#5C5A55] uppercase font-sans mt-0.5">
                MAYORISTA ÓPTICO · USA
              </span>
            </Link>

            <p className="text-xs text-[#5C5A55] leading-relaxed">
              Plataforma B2B de aprovisionamiento e importación directa de armazones oftálmicos y solares originales desde Estados Unidos para ópticas establecidas en Chile.
            </p>

            <div className="pt-2 border-t border-[#E6E2DD] space-y-2 text-xs text-[#5C5A55]">
              <div className="flex items-start gap-2">
                <Building2 className="w-3.5 h-3.5 text-[#9E8256] shrink-0 mt-0.5" />
                <span className="leading-tight">
                  <strong className="text-[#0F0F0F] font-medium">OPTICA MULTIFOCUS LIMITADA</strong>
                  <br />
                  <span className="font-mono text-[11px] text-[#787670]">RUT: 78.044.452-5</span>
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#9E8256] shrink-0" />
                <a
                  href="mailto:contacto@optihub.cl"
                  className="hover:text-[#0F0F0F] underline-offset-2 hover:underline transition-colors font-mono text-[11px]"
                >
                  contacto@optihub.cl
                </a>
              </div>
            </div>
          </div>

          {/* COLUMNA 2: NAVEGACIÓN B2B */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0F0F0F] border-b border-[#E6E2DD] pb-2">
              Navegación B2B
            </h3>
            <ul className="space-y-2.5 text-xs text-[#5C5A55]">
              <li>
                <Link href="/" className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group">
                  <span>Inicio</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              <li>
                <Link href="/catalogo" className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group">
                  <span>Catálogo Mayorista</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              <li>
                <Link
                  href={isLoggedIn ? "/mis-pedidos" : "/login"}
                  className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group"
                >
                  <span>{isLoggedIn ? "Mi Portal Óptica" : "Acceso Ópticas"}</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              <li>
                <Link href="/registro" className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group">
                  <span>Registrar Óptica</span>
                  <span className="text-[9px] uppercase tracking-wider text-[#9E8256] font-semibold bg-[#FAF6ED] px-1.5 py-0.5 border border-[#E6D7B8]">
                    Alta B2B
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/carrito" className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group">
                  <span>Pedido B2B</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              {isLoggedIn && (
                <li>
                  <Link href="/mis-pedidos" className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group">
                    <span>Mis Pedidos & Facturas</span>
                    <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* COLUMNA 3: MARCO LEGAL Y SOPORTE */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0F0F0F] border-b border-[#E6E2DD] pb-2">
              Marco Legal y Soporte
            </h3>
            <ul className="space-y-2.5 text-xs text-[#5C5A55]">
              <li>
                <Link
                  href="/terminos-y-condiciones"
                  className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group"
                >
                  <span>Términos y Condiciones</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              <li>
                <Link
                  href="/politica-de-privacidad"
                  className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group"
                >
                  <span>Política de Privacidad</span>
                  <span className="text-[9px] uppercase tracking-wider text-[#5C5A55] font-mono bg-[#FAF9F6] px-1 border border-[#E6E2DD]">
                    Leyes 19.628 / 21.719
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/politicas-importacion-y-garantia"
                  className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group"
                >
                  <span>Importación y Garantía</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
              <li>
                <Link
                  href="/#faq"
                  className="hover:text-[#0F0F0F] transition-colors flex items-center justify-between group"
                >
                  <span>Preguntas Frecuentes (FAQ)</span>
                  <ArrowRight className="w-3 h-3 text-[#9E8256] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
            </ul>

            <div className="pt-2">
              <a
                href="https://wa.me/56989338537?text=Hola%2C%20necesito%20asistencia%20comercial%20en%20Optihub%20B2B"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  trackB2BEvent('click_whatsapp_b2b', {
                    source: 'footer',
                  });
                }}
                className="inline-flex items-center gap-2 bg-[#FAF9F6] hover:bg-[#F4F2ED] text-[#0F0F0F] border border-[#E6E2DD] px-3.5 py-2.5 transition-colors font-medium text-[10px] uppercase tracking-[0.16em] w-full justify-center"
              >
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                <span>WhatsApp Soporte Ópticas</span>
              </a>
            </div>
          </div>

          {/* COLUMNA 4: SELLOS DE CONFIANZA Y MEDIOS DE PAGO */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0F0F0F] border-b border-[#E6E2DD] pb-2">
              Garantías y Pagos
            </h3>

            {/* DISTINTIVOS VISUALES DE CONFIANZA */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-[#E6E2DD]">
                <FileText className="w-4 h-4 text-[#9E8256] shrink-0" />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-[#0F0F0F] block">Factura Electrónica SII</span>
                  <span className="text-[#5C5A55] text-[10px]">100% Crédito Fiscal IVA en CLP</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-[#E6E2DD]">
                <ShieldCheck className="w-4 h-4 text-[#9E8256] shrink-0" />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-[#0F0F0F] block">Trazabilidad Oficial USA</span>
                  <span className="text-[#5C5A55] text-[10px]">100% Original con Estuche & Folletería</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-[#E6E2DD]">
                <Truck className="w-4 h-4 text-[#9E8256] shrink-0" />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-[#0F0F0F] block">Tránsito 10-15 Días Hábiles</span>
                  <span className="text-[#5C5A55] text-[10px]">Despacho Nacionalizado DDP</span>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 bg-[#FAF9F6] border border-[#E6E2DD]">
                <Layers className="w-4 h-4 text-[#9E8256] shrink-0" />
                <div className="text-[11px] leading-tight">
                  <span className="font-semibold text-[#0F0F0F] block">MOQ 10 Unidades</span>
                  <span className="text-[#5C5A55] text-[10px]">Combinables libremente por pedido</span>
                </div>
              </div>
            </div>

            {/* MEDIOS DE PAGO ACEPTADOS EN CHILE */}
            <div className="pt-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#787670] block mb-2">
                Medios de Pago en Chile
              </span>
              <div className="grid grid-cols-2 gap-1.5 text-[10px] uppercase font-mono text-[#5C5A55]">
                <div className="border border-[#E6E2DD] bg-[#FFFFFF] px-2 py-1 text-center font-medium">
                  Transferencia Bancaria
                </div>
                <div className="border border-[#E6E2DD] bg-[#FFFFFF] px-2 py-1 text-center font-medium">
                  Webpay Plus
                </div>
                <div className="border border-[#E6E2DD] bg-[#FFFFFF] px-2 py-1 text-center font-medium">
                  Redcompra / Débito
                </div>
                <div className="border border-[#E6E2DD] bg-[#FFFFFF] px-2 py-1 text-center font-medium">
                  Mercado Pago
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* LÍNEA FINAL DE COPYRIGHT Y CUMPLIMIENTO */}
        <div className="mt-14 pt-8 border-t border-[#E6E2DD] flex flex-col md:flex-row items-center justify-between gap-4 text-[10px] uppercase tracking-[0.18em] text-[#787670] text-center md:text-left">
          <p>© {new Date().getFullYear()} OPTIHUB · OPTICA MULTIFOCUS LIMITADA. TODOS LOS DERECHOS RESERVADOS.</p>
          <p className="normal-case tracking-normal text-xs text-[#787670]">
            Cumplimiento Ley N° 19.628 & N° 21.719 de Protección de Datos Personales · Servicio de Impuestos Internos (SII) de Chile.
          </p>
        </div>
      </div>
    </footer>
  );
}
