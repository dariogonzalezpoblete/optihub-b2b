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
      ? 'text-emerald-400' 
      : isCurrent 
        ? 'text-white' 
        : 'text-slate-500';

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
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Seguimiento de Importación en Tiempo Real
            </span>
          </div>
          <h2 className="text-xl md:text-2xl font-black text-white">
            Estado de tu Embarque B2B
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Etapa actual: <span className="text-white font-bold">{tracking.stageInfo.label}</span> ({tracking.stageInfo.location})
          </p>
        </div>

        {/* Admin Toggle Button */}
        {isAdmin && (
          <button
            onClick={() => setShowAdminPanel(!showAdminPanel)}
            className="self-start sm:self-center flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition border border-slate-700"
          >
            <Settings className="w-4 h-4 text-emerald-400" />
            <span>{showAdminPanel ? 'Ocultar Panel Admin' : 'Gestionar Tracking (Admin)'}</span>
            {showAdminPanel ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Admin Panel Drawer */}
      {isAdmin && showAdminPanel && (
        <form onSubmit={handleAdminSave} className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-6 space-y-5 animate-in fade-in duration-200">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              Panel de Actualización Rápida de Seguimiento (Solo Admin)
            </h3>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Conexión Directa Courier
            </span>
          </div>

          {/* 1-Click Stage Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
              1. Selecciona la Etapa de Importación:
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
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black shadow-lg shadow-emerald-500/20' 
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                      Paso {s.step}
                    </div>
                    <div className="text-xs font-bold mt-1 line-clamp-1">
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
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                2. Empresa de Envíos / Courier:
              </label>
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-medium"
              >
                {COURIER_OPTIONS.map((c) => (
                  <option key={c.id} value={c.name} className="bg-slate-900 text-white">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Tracking Number Input */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                3. Número de Seguimiento / Guía de Flete:
              </label>
              <input
                type="text"
                placeholder="Ej: DHL-8492019482 o 98273645"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
          </div>

          {/* Custom status message */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
              4. Nota / Actualización para el Cliente (Opcional):
            </label>
            <input
              type="text"
              placeholder="Ej: Embarque arribado al Aeropuerto de Santiago. Iniciando aforo aduanero."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Actions & Feedback */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                  <Check className="w-4 h-4" /> ¡Seguimiento guardado exitosamente!
                </span>
              )}
              {saveError && (
                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 px-3 py-1.5 rounded-lg border border-rose-500/20">
                  <AlertCircle className="w-4 h-4" /> {saveError}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black px-5 py-2.5 rounded-xl transition text-sm shadow-md shadow-emerald-500/20 ml-auto"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Guardar y Actualizar Seguimiento'}</span>
            </button>
          </div>
        </form>
      )}

      {/* 5-Stage Visual Timeline (Horizontal on desktop, vertical on mobile) */}
      <div className="relative">
        {/* Horizontal connector line on desktop */}
        <div className="hidden md:block absolute top-6 left-10 right-10 h-0.5 bg-slate-800 z-0" />
        
        {/* Dynamic progress highlight line on desktop */}
        <div 
          className="hidden md:block absolute top-6 left-10 h-0.5 bg-gradient-to-r from-emerald-500 to-emerald-400 z-0 transition-all duration-500"
          style={{ width: `${Math.max(0, ((tracking.currentStep - 1) / (IMPORT_STAGES.length - 1)) * 100)}%` }}
        />

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-3 relative z-10">
          {IMPORT_STAGES.map((s) => {
            const isCompleted = s.step < tracking.currentStep;
            const isCurrent = s.step === tracking.currentStep;
            const isUpcoming = s.step > tracking.currentStep;

            return (
              <div 
                key={s.key} 
                className={`flex md:flex-col items-start md:items-center text-left md:text-center gap-4 md:gap-3 p-4 md:p-3 rounded-2xl transition-all ${
                  isCurrent 
                    ? 'bg-slate-800/80 border border-emerald-500/40 shadow-lg shadow-emerald-500/10' 
                    : isCompleted 
                      ? 'bg-slate-900/60 border border-slate-800/80' 
                      : 'opacity-50 border border-transparent'
                }`}
              >
                {/* Step Circle */}
                <div 
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all ${
                    isCompleted 
                      ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/20' 
                      : isCurrent 
                        ? 'bg-emerald-500 text-slate-950 border-2 border-white ring-4 ring-emerald-500/30 scale-105' 
                        : 'bg-slate-800 border-2 border-slate-700 text-slate-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-6 h-6 stroke-[3]" />
                  ) : (
                    getStepIcon(s.key, isCurrent, isCompleted)
                  )}
                </div>

                {/* Step Details */}
                <div className="space-y-1 flex-1">
                  <div className="flex md:justify-center items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">
                      Paso {s.step}
                    </span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-400 text-slate-950 uppercase">
                        En Curso
                      </span>
                    )}
                  </div>
                  <h4 className={`text-sm font-black leading-tight ${isCurrent ? 'text-white' : isCompleted ? 'text-slate-200' : 'text-slate-500'}`}>
                    {s.label}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">
                    {s.location}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Courier & Tracking Information Box */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Courier Responsable:
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
              {tracking.courier || 'Asignación Internacional'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Guía de Seguimiento:
            </span>
            {tracking.trackingNumber ? (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                <span className="font-mono font-bold text-white text-base">
                  {tracking.trackingNumber}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="p-1 hover:text-emerald-400 text-slate-400 transition"
                  title="Copiar número de guía"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <span className="text-sm text-slate-400 italic">
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
            className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-3 rounded-xl transition text-sm shadow-lg shadow-emerald-500/20 group shrink-0"
          >
            <span>Rastrear en {tracking.courier || 'Portal de Envíos'}</span>
            <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        )}
      </div>

      {/* Real-time Status Note Box */}
      {(tracking.customNote || tracking.stageInfo.description) && (
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-5 flex items-start gap-4">
          <Clock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-bold text-white">Detalle de Operaciones:</span>
              {tracking.updatedAt && (
                <span className="text-xs text-slate-500">
                  Actualizado: {new Date(tracking.updatedAt).toLocaleDateString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            <p className="text-slate-300">
              {tracking.customNote || tracking.stageInfo.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
