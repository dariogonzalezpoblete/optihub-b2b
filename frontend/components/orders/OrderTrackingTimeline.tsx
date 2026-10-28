"use client";

import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Plane, 
  ShieldCheck, 
  Truck, 
  CheckCircle2, 
  ExternalLink, 
  Copy, 
  Check, 
  Settings, 
  Clock, 
  AlertCircle,
  Save,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { 
  IMPORT_STAGES, 
  COURIER_OPTIONS, 
  parseOrderTracking, 
  ImportStageKey,
  ParsedTracking
} from '@/lib/trackingUtils';
import type { Order } from '@/lib/catalog/types';
import { useAuth } from '@/context/AuthContext';

interface OrderTrackingTimelineProps {
  order: Order;
  onOrderUpdated?: (updatedOrder: Order) => void;
  isAdmin?: boolean;
}

export default function OrderTrackingTimeline({ 
  order, 
  onOrderUpdated,
  isAdmin = false 
}: OrderTrackingTimelineProps) {
  const { session } = useAuth();
  const [copied, setCopied] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  const tracking: ParsedTracking = parseOrderTracking(order);

  // Admin form state
  const [selectedStage, setSelectedStage] = useState<ImportStageKey>(tracking.currentStageKey);
  const [selectedCourier, setSelectedCourier] = useState(tracking.courier || 'DHL Express');
  const [trackingInput, setTrackingInput] = useState(tracking.trackingNumber || '');
  const [noteInput, setNoteInput] = useState(tracking.customNote || '');

  useEffect(() => {
    setSelectedStage(tracking.currentStageKey);
    setSelectedCourier(tracking.courier || 'DHL Express');
    setTrackingInput(tracking.trackingNumber || '');
    setNoteInput(tracking.customNote || '');
  }, [order]);

  const handleCopy = () => {
    if (!tracking.trackingNumber) return;
    navigator.clipboard.writeText(tracking.trackingNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAdminSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);

    if (!session?.access_token) {
      setSaveError('Sesión no disponible o expirada. Por favor recarga la página o inicia sesión.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/orders/update-tracking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          orderId: order.id,
          shipping_provider: selectedCourier,
          tracking_number: trackingInput,
          stage: selectedStage,
          customNote: noteInput
        })
      });

      const result = await res.json();
      if (!res.ok || result.error) {
        throw new Error(result.error || 'Error al actualizar el seguimiento');
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      if (onOrderUpdated && result.order) {
        onOrderUpdated(result.order);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  // Helper to get step icon
  const getStepIcon = (key: ImportStageKey, isCurrent: boolean, isCompleted: boolean) => {
    const iconClass = isCompleted 
      ? 'text-emerald-700' 
      : isCurrent 
        ? 'text-[#9E8256]' 
        : 'text-[#A8A6A1]';

    switch (key) {
      case 'logistica_usa':
        return <Building2 className={`w-5 h-5 ${iconClass}`} />;
      case 'viajando':
        return <Plane className={`w-5 h-5 ${iconClass}`} />;
      case 'desaduanamiento':
        return <ShieldCheck className={`w-5 h-5 ${iconClass}`} />;
      case 'reparto_chile':
        return <Truck className={`w-5 h-5 ${iconClass}`} />;
      case 'entregado':
        return <CheckCircle2 className={`w-5 h-5 ${iconClass}`} />;
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E6E2DD] rounded-3xl p-6 md:p-8 space-y-8 shadow-sm">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6E2DD] pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF6EF] border border-[#EADFC9] text-[#846C44] text-[10px] font-semibold uppercase tracking-[0.18em] mb-2">
            <span className="w-2 h-2 rounded-full bg-[#846C44] animate-pulse" />
            <span>Seguimiento de Importación en Tiempo Real</span>
          </div>
          
          <h2 className="font-editorial font-serif text-2xl md:text-3xl font-semibold text-[#0F0F0F] tracking-tight">
            Estado de su Embarque Mayorista
          </h2>
          
          <p className="text-xs sm:text-sm text-[#575551] mt-1">
            Etapa actual: <strong className="text-[#0F0F0F] font-semibold">{tracking.stageInfo.label}</strong> ({tracking.stageInfo.location})
          </p>
        </div>

        {/* Admin Toggle Button */}
        {isAdmin && (
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="self-start sm:self-center flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#0F0F0F] transition border border-[#E6E2DD] shadow-sm"
          >
            <Settings className="w-4 h-4 text-[#846C44]" />
            <span>{showAdminPanel ? 'Ocultar Panel Admin' : 'Gestionar Envío (Admin)'}</span>
            {showAdminPanel ? <ChevronUp className="w-3.5 h-3.5 text-[#575551]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#575551]" />}
          </button>
        )}
      </div>

      {/* Admin Panel Drawer */}
      {isAdmin && showAdminPanel && (
        <form onSubmit={handleAdminSave} className="bg-[#FAF9F6] border border-[#E6E2DD] rounded-2xl p-6 space-y-5 animate-in fade-in duration-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E6E2DD] pb-3">
            <h3 className="text-xs font-bold text-[#0F0F0F] uppercase tracking-wider flex items-center gap-2">
              <Settings className="w-4 h-4 text-[#846C44]" />
              Panel de Actualización Logística (Exclusivo Administrador)
            </h3>
            <span className="text-[10px] font-semibold text-[#846C44] bg-[#FAF6EF] px-2.5 py-0.5 rounded-full border border-[#EADFC9]">
              Conexión Directa Courier
            </span>
          </div>

          {/* Selector de Etapa 1-Click */}
          <div>
            <label className="block text-[11px] font-semibold text-[#575551] mb-2 uppercase tracking-wider">
              1. Seleccione la Etapa de Importación:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {IMPORT_STAGES.map((s) => {
                const isSelected = selectedStage === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSelectedStage(s.key)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected 
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-[#0F0F0F] font-bold shadow-sm' 
                        : 'bg-[#FFFFFF] border-[#E6E2DD] text-[#575551] hover:border-[#C8C5BD]'
                    }`}
                  >
                    <div className={`text-[9px] uppercase font-semibold tracking-wider ${isSelected ? 'text-[#9E8256]' : 'text-[#7A7873]'}`}>
                      Paso {s.step}
                    </div>
                    <div className="text-xs font-semibold mt-0.5 line-clamp-1">
                      {s.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Courier Selection */}
            <div>
              <label className="block text-[11px] font-semibold text-[#575551] mb-1.5 uppercase tracking-wider">
                2. Empresa de Envíos / Courier:
              </label>
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E6E2DD] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[#0F0F0F] focus:outline-none focus:border-[#846C44] font-medium shadow-sm"
              >
                {COURIER_OPTIONS.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tracking Number Input */}
            <div>
              <label className="block text-[11px] font-semibold text-[#575551] mb-1.5 uppercase tracking-wider">
                3. Número de Seguimiento / Guía de Flete:
              </label>
              <input
                type="text"
                placeholder="Ej: DHL-8492019482 o 98273645"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E6E2DD] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[#0F0F0F] focus:outline-none focus:border-[#846C44] font-mono shadow-sm"
              />
            </div>
          </div>

          {/* Custom status message */}
          <div>
            <label className="block text-[11px] font-semibold text-[#575551] mb-1.5 uppercase tracking-wider">
              4. Nota / Actualización para el Cliente (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ej: Embarque arribado al Aeropuerto de Santiago. Iniciando aforo aduanero."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#E6E2DD] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-[#0F0F0F] focus:outline-none focus:border-[#846C44] shadow-sm"
            />
          </div>

          {/* Actions & Feedback */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                  <Check className="w-3.5 h-3.5 text-emerald-600" /> ¡Seguimiento actualizado con éxito!
                </span>
              )}
              {saveError && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-800 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> {saveError}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-[#0F0F0F] hover:bg-[#222222] disabled:opacity-50 text-[#FFFFFF] font-semibold px-5 py-2.5 rounded-xl transition text-xs uppercase tracking-widest shadow-sm ml-auto"
            >
              <Save className="w-3.5 h-3.5 text-[#9E8256]" />
              <span>{saving ? 'Guardando...' : 'Guardar y Actualizar Seguimiento'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 5-Stage Visual Timeline (Horizontal on desktop, vertical on mobile) */}
      <div className="relative pt-2">
        {/* Horizontal connector line on desktop */}
        <div className="hidden md:block absolute top-9 left-12 right-12 h-0.5 bg-[#E6E2DD] z-0" />
        
        {/* Dynamic progress highlight line on desktop */}
        <div 
          className="hidden md:block absolute top-9 left-12 h-0.5 bg-[#846C44] z-0 transition-all duration-500"
          style={{ width: `${Math.max(0, ((tracking.currentStep - 1) / (IMPORT_STAGES.length - 1)) * 100)}%` }}
        />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-3 relative z-10">
          {IMPORT_STAGES.map((s) => {
            const isCompleted = s.step < tracking.currentStep;
            const isCurrent = s.step === tracking.currentStep;

            return (
              <div 
                key={s.key} 
                className={`flex md:flex-col items-start md:items-center text-left md:text-center gap-4 md:gap-2.5 p-3.5 md:p-3 rounded-2xl transition-all ${
                  isCurrent 
                    ? 'bg-[#FAF9F6] border border-[#E6E2DD] shadow-sm' 
                    : isCompleted 
                      ? 'bg-[#FFFFFF] opacity-95' 
                      : 'opacity-50'
                }`}
              >
                {/* Step Circle */}
                <div 
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                    isCompleted 
                      ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-700 shadow-sm' 
                      : isCurrent 
                        ? 'bg-[#0F0F0F] text-[#FFFFFF] border-2 border-[#846C44] ring-4 ring-[#846C44]/20 scale-105 shadow-sm' 
                        : 'bg-[#FAF9F6] border-2 border-[#E6E2DD] text-[#A8A6A1]'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 stroke-[2.5]" />
                  ) : (
                    getStepIcon(s.key, isCurrent, isCompleted)
                  )}
                </div>

                {/* Step Details */}
                <div className="space-y-0.5 flex-1">
                  <div className="flex md:justify-center items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7A7873] font-mono">
                      Paso {s.step}
                    </span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#FAF6EF] text-[#846C44] border border-[#EADFC9] uppercase tracking-wider">
                        En Curso
                      </span>
                    )}
                  </div>
                  
                  <h4 className={`text-xs sm:text-sm font-semibold leading-snug ${isCurrent ? 'text-[#0F0F0F]' : isCompleted ? 'text-[#0F0F0F]' : 'text-[#7A7873]'}`}>
                    {s.label}
                  </h4>
                  
                  <p className="text-[11px] text-[#7A7873]">
                    {s.location}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Courier & Tracking Information Box */}
      <div className="bg-[#FAF9F6] border border-[#E6E2DD] rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[#575551]">
              Courier Responsable:
            </span>
            <span className="px-3 py-1 rounded-lg bg-[#FFFFFF] border border-[#E6E2DD] text-[#0F0F0F] text-xs font-semibold">
              {tracking.courier || 'Asignación Internacional'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-[#575551] font-medium uppercase tracking-wider">
              Guía de Seguimiento:
            </span>
            {tracking.trackingNumber ? (
              <div className="flex items-center gap-2 bg-[#FFFFFF] border border-[#E6E2DD] px-3.5 py-1.5 rounded-xl shadow-sm">
                <span className="font-mono font-bold text-[#0F0F0F] text-sm sm:text-base">
                  {tracking.trackingNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 hover:text-[#846C44] text-[#7A7873] transition"
                  title="Copiar número de guía"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <span className="text-xs text-[#7A7873] italic">
                En preparación de rotulado
              </span>
            )}
          </div>
        </div>

        {/* Action Button: Direct Courier Link */}
        {tracking.trackingUrl && (
          <a
            href={tracking.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 bg-[#0F0F0F] hover:bg-[#222222] text-[#FFFFFF] font-semibold px-6 py-3.5 rounded-xl transition text-xs uppercase tracking-widest shadow-sm group shrink-0"
          >
            <span>Rastrear en {tracking.courier || 'Portal de Envíos'}</span>
            <ExternalLink className="w-4 h-4 text-[#9E8256] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        )}
      </div>

      {/* Real-time Status Note Box */}
      {(tracking.customNote || tracking.stageInfo.description) && (
        <div className="bg-[#FAF9F6] border border-[#E6E2DD] rounded-2xl p-5 flex items-start gap-3.5 text-xs text-[#575551]">
          <Clock className="w-4 h-4 text-[#846C44] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <strong className="text-[#0F0F0F] font-semibold">Detalle de Operaciones:</strong>
              {tracking.updatedAt && (
                <span className="text-[11px] text-[#7A7873]">
                  Actualizado: {new Date(tracking.updatedAt).toLocaleDateString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="leading-relaxed">
              {tracking.customNote || tracking.stageInfo.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
