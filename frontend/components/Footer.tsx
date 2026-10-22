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
  CreditCard,
  MessageCircle,
  ArrowRight
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
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-300 relative z-10">
      
      {/* SECCIÓN 1: FAQ B2B Y GARANTÍAS */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-b border-slate-800/80">
        <div className="mb-10 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Preguntas Frecuentes B2B</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
            Transparencia y Respaldo Local en Cada Importación
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {faqs.map((faq, idx) => (
            <div key={idx} className="bg-slate-900/60 border border-slate-800 p-5 rounded-2xl space-y-2">
              <h3 className="font-bold text-white text-sm flex items-start gap-2">
                <span className="text-emerald-400 font-mono">0{idx + 1}.</span>
                <span>{faq.q}</span>
              </h3>
              <p className="text-slate-400 text-xs leading-relaxed pl-6">
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
              <div className="w-8 h-8 rounded-xl bg-emerald-500 flex items-center justify-center text-slate-950 font-black text-lg shadow-lg shadow-emerald-500/20">
                👓
              </div>
              <span className="text-xl font-black text-white tracking-tight uppercase">
                OptiHub <span className="text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">B2B</span>
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              Plataforma de abastecimiento y distribución mayorista de armazones oftálmicos y de sol para ópticas en Chile. Importación directa desde Estados Unidos sin intermediarios locales.
            </p>

            <div className="pt-2 text-xs space-y-1 text-slate-400 font-mono">
              <p><strong className="text-slate-300">Razón Social:</strong> OptiHub SpA</p>
              <p><strong className="text-slate-300">RUT:</strong> 77.892.341-K</p>
              <p><strong className="text-slate-300">Giro:</strong> Distribución Mayorista de Artículos Ópticos</p>
            </div>
          </div>

          {/* Columna 2: Ubicación y Contacto Directo (4 columnas) */}
          <div className="md:col-span-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Contacto y Oficinas Comerciales
            </h3>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="flex items-start gap-2.5">
                <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Huérfanos 1160, Oficina 802, Santiago Centro, Región Metropolitana, Chile</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>contacto@optihub.cl • ventas@optihub.cl</span>
              </div>
              <div className="flex items-center gap-2.5">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>+56 9 8765 4321 (Lunes a Viernes 09:00 - 18:30 hrs)</span>
              </div>
            </div>

            <div className="pt-2">
              <a
                href="https://wa.me/56987654321?text=Hola%20OptiHub,%20solicito%20asesor%C3%ADa%20comercial%20para%20mi%20%C3%B3ptica."
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>Hablar con un Ejecutivo en WhatsApp</span>
              </a>
            </div>
          </div>

          {/* Columna 3: Medios de Pago y Seguridad (3 columnas) */}
          <div className="md:col-span-3 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">
              Medios de Pago Autorizados
            </h3>

            <div className="space-y-2 text-xs text-slate-400">
              <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="font-bold text-slate-200 block">Webpay Plus & Transbank</span>
                <span className="text-[11px] text-slate-400 block">Tarjetas de Débito, Crédito y Prepago en cuotas.</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-1">
                <span className="font-bold text-slate-200 block">Transferencia Bancaria Directa</span>
                <span className="text-[11px] text-slate-400 block">Cuenta Corriente Banco Santander / Banco de Chile.</span>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* BARRA INFERIOR DE COPYRIGHT */}
      <div className="border-t border-slate-900 bg-slate-950/80 py-6 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto">
        <span>
          © {new Date().getFullYear()} OptiHub B2B SpA. Todos los derechos reservados.
        </span>
        <div className="flex gap-4 text-slate-500">
          <Link href="/catalogo" className="hover:text-emerald-400 transition">Catálogo</Link>
          <span>•</span>
          <Link href="/carrito" className="hover:text-emerald-400 transition">Carrito Mayorista</Link>
          <span>•</span>
          <Link href="/login" className="hover:text-emerald-400 transition">Acceso Ópticas</Link>
        </div>
      </div>

    </footer>
  );
}
