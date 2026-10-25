'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Truck, 
  FileText, 
  Building2, 
  Phone, 
  Mail, 
  MapPin, 
  HelpCircle,
  MessageCircle
} from 'lucide-react';

export default function Footer() {
  const faqs = [
    {
      q: '¿Cómo funciona la emisión de Factura?',
      a: 'Emitimos Factura Electrónica legal chilena (SII) con IVA 19% 100% deducible como crédito fiscal para tu óptica o sociedad médica.'
    },
    {
      q: '¿Qué incluye cada armazón?',
      a: 'Cada pieza incluye su estuche rígido original de la marca, paño de microfibra oficial y folletería de certificación de fábrica.'
    },
    {
      q: '¿Cómo se asegura el estado del producto?',
      a: 'Todos los armazones son piezas nuevas de vitrina original de distribuidores autorizados internacionales, despachados en su empaque completo de fábrica y verificados al momento de la entrega.'
    },
    {
      q: '¿Plazo de entrega?',
      a: '10 a 15 días hábiles vía flete aéreo prioritario consolidado desde Miami directamente a la dirección de tu óptica en Chile.'
    }
  ];

  return (
    <footer className="bg-[#111111] border-t border-[#242424] text-[#E5E4DF] relative z-10">
      
      {/* SECCIÓN 1: FAQ B2B Y GARANTÍAS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-b border-[#242424]">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#242424] border border-[#B89768]/30 text-[#B89768] text-xs font-semibold uppercase tracking-wider mb-2">
            <HelpCircle className="w-3.5 h-3.5 text-[#B89768]" />
            <span>Preguntas Frecuentes B2B</span>
          </div>
          <h2 className="font-editorial text-2xl sm:text-3xl font-normal text-white tracking-tight">
            Transparencia y Respaldo Local en Cada Importación
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {faqs.map((faq, idx) => (
            <div key={idx} className="bg-[#1A1918] border border-[#2A2825] p-5 rounded-2xl space-y-2">
              <h3 className="font-editorial text-white text-base font-semibold flex items-start gap-2">
                <span className="text-[#B89768] font-tech text-xs mt-1">0{idx + 1}.</span>
                <span>{faq.q}</span>
              </h3>
              <p className="text-[#82807A] text-xs leading-relaxed pl-6 font-sans">
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* SECCIÓN 2: DATOS DE LA EMPRESA, CONTACTO Y MEDIOS DE PAGO */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          
          {/* Columna 1: Identidad Corporativa (5 columnas) */}
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#B89768] flex items-center justify-center text-[#111111] font-bold text-sm shadow-xs">
                👓
              </div>
              <span className="font-editorial text-2xl font-bold text-white tracking-wide uppercase">
                OptiHub <span className="text-[#B89768] text-xs font-bold px-2 py-0.5 rounded-full bg-[#242424] border border-[#B89768]/30 font-tech">B2B</span>
              </span>
            </div>

            <p className="text-[#82807A] text-xs leading-relaxed max-w-sm">
              Plataforma de abastecimiento y distribución mayorista de armazones oftálmicos y de sol para ópticas en Chile. Importación directa desde Estados Unidos sin intermediarios locales.
            </p>

            <div className="pt-2 text-xs space-y-1 text-[#82807A] font-tech">
              <p><strong className="text-[#E5E4DF]">Razón Social:</strong> OptiHub SpA</p>
              <p><strong className="text-[#E5E4DF]">RUT:</strong> 77.892.341-K</p>
              <p><strong className="text-[#E5E4DF]">Giro:</strong> Distribución Mayorista de Artículos Ópticos</p>
            </div>
          </div>

          {/* Columna 2: Ubicación y Contacto Directo (4 columnas) */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#B89768] font-mono">
              Contacto y Oficinas Comerciales
            </h3>

            <div className="space-y-2 text-xs text-[#82807A]">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-[#B89768] shrink-0 mt-0.5" />
                <span>Huérfanos 1160, Oficina 802, Santiago Centro, Región Metropolitana, Chile</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-[#B89768] shrink-0" />
                <span>contacto@optihub.cl • ventas@optihub.cl</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-[#B89768] shrink-0" />
                <span>+56 9 8765 4321 (Lunes a Viernes 09:00 - 18:30 hrs)</span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://wa.me/56987654321?text=Hola%20OptiHub,%20solicito%20asesor%C3%ADa%20comercial%20para%20mi%20%C3%B3ptica."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#242424] hover:bg-[#2A2825] text-[#B89768] border border-[#B89768]/30 text-xs font-bold transition"
              >
                <MessageCircle className="w-4 h-4 text-[#B89768]" />
                <span>Hablar con un Ejecutivo en WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Columna 3: Medios de Pago y Seguridad (3 columnas) */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#B89768] font-mono">
              Medios de Pago Autorizados
            </h3>

            <div className="space-y-2 text-xs text-[#82807A]">
              <div className="bg-[#1A1918] border border-[#2A2825] p-3 rounded-xl space-y-1">
                <span className="font-bold text-[#E5E4DF] block">Webpay Plus & Transbank</span>
                <span className="text-[11px] text-[#82807A] block">Tarjetas de Débito, Crédito y Prepago en cuotas.</span>
              </div>

              <div className="bg-[#1A1918] border border-[#2A2825] p-3 rounded-xl space-y-1">
                <span className="font-bold text-[#E5E4DF] block">Transferencia Bancaria Directa</span>
                <span className="text-[11px] text-[#82807A] block">Cuenta Corriente Banco Santander / Banco de Chile.</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* BARRA INFERIOR DE COPYRIGHT */}
      <div className="border-t border-[#242424] bg-[#0C0C0C] py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-[#82807A] flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
        <span>
          © {new Date().getFullYear()} OptiHub B2B SpA. Todos los derechos reservados.
        </span>
        <div className="flex gap-4 text-[#82807A]">
          <Link href="/catalogo" className="hover:text-[#B89768] transition">Catálogo</Link>
          <span>•</span>
          <Link href="/carrito" className="hover:text-[#B89768] transition">Carrito Mayorista</Link>
          <span>•</span>
          <Link href="/login" className="hover:text-[#B89768] transition">Acceso Ópticas</Link>
        </div>
      </div>

    </footer>
  );
}
