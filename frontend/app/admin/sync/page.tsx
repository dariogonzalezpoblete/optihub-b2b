'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface SyncItem {
  id_ext: string;
  status: 'updated' | 'unchanged' | 'out_of_stock';
  oldStock?: number;
  newStock?: number;
  oldPriceNeto?: number;
  newPriceNeto?: number;
  oldPriceUsd?: number;
  newPriceUsd?: number;
  changeReason?: string;
}

interface BrandReport {
  brand: string;
  totalScanned: number;
  updated: number;
  outOfStock: number;
  unchanged: number;
  items: SyncItem[];
}

interface SyncSummary {
  timestamp: string;
  durationSeconds: number;
  brandsProcessed: string[];
  totalScanned: number;
  totalUpdated: number;
  totalOutOfStock: number;
  totalUnchanged: number;
  brandReports: BrandReport[];
}

const POPULAR_BRANDS = [
  'TODAS',
  'Guess',
  'Nike',
  'Adidas',
  'Tom Ford',
  'Calvin Klein',
  'Lacoste',
  'Bolle',
  'BMW',
  'DKNY',
  'IC! Berlin',
];

export default function AdminSyncPage() {
  const [selectedBrand, setSelectedBrand] = useState('Guess');
  const [headless, setHeadless] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [dolar, setDolar] = useState('950');
  const [margin, setMargin] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'updated' | 'out_of_stock' | 'unchanged'>('all');

  // Load latest report on mount
  useEffect(() => {
    async function fetchLatest() {
      try {
        const res = await fetch('/api/admin/sync');
        if (res.ok) {
          const data = await res.json();
          if (data.latest_summary) {
            setSummary(data.latest_summary);
          }
        }
      } catch {}
    }
    fetchLatest();
  }, []);

  const handleRunSync = async () => {
    setLoading(true);
    setStatusMessage('Ejecutando sincronización rápida de stock y precios...');
    setErrorMessage(null);

    const isAll = selectedBrand === 'TODAS';
    const payload = {
      brand: isAll ? undefined : selectedBrand,
      all_brands: isAll,
      headless,
      dry_run: dryRun,
      dolar: dolar ? parseFloat(dolar) : 950,
      margin_percentage: margin ? parseFloat(margin) : undefined,
      background: false,
    };

    try {
      const res = await fetch('/api/admin/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.detail || 'Error al ejecutar sincronización');
      }

      if (data.summary) {
        setSummary(data.summary);
        setStatusMessage(
          `Sincronización completada con éxito: ${data.summary.totalUpdated} productos actualizados, ${data.summary.totalOutOfStock} sin stock (0), ${data.summary.totalUnchanged} sin cambios.`
        );
      } else {
        setStatusMessage(data.message || 'Sincronización completada.');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  };

  // Flatten items for reporting table
  const allItems: SyncItem[] = [];
  if (summary?.brandReports) {
    summary.brandReports.forEach((br) => {
      if (br.items) allItems.push(...br.items);
    });
  }

  const filteredItems = allItems.filter((item) => {
    if (filterStatus === 'all') return true;
    return item.status === filterStatus;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Breadcrumb */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center space-x-2 text-xs font-mono text-amber-400 uppercase tracking-widest">
              <Link href="/" className="hover:underline">Inicio</Link>
              <span>/</span>
              <span>Backend Admin</span>
            </div>
            <h1 className="text-3xl font-serif font-bold text-white mt-1">
              Sincronización Rápida de Stock y Precios
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Actualización masiva de inventario y costo de proveedores en Supabase con recálculo automático de reglas comerciales B2B.
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
              ⚡ Modo Inventario Acelerado
            </span>
          </div>
        </div>

        {/* Configuration Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            ⚙️ Configuración del Proceso
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Brand Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                Marca a Sincronizar
              </label>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              >
                {POPULAR_BRANDS.map((b) => (
                  <option key={b} value={b}>
                    {b === 'TODAS' ? '🌟 TODAS LAS MARCAS' : b}
                  </option>
                ))}
              </select>
            </div>

            {/* Dólar CLP */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                Tipo de Cambio Dólar (CLP)
              </label>
              <input
                type="number"
                value={dolar}
                onChange={(e) => setDolar(e.target.value)}
                disabled={loading}
                placeholder="950"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Custom Margin % (Optional) */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wide">
                Margen Comercial Extra % <span className="text-slate-500">(Opcional)</span>
              </label>
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                disabled={loading}
                placeholder="Regla B2B Estándar"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* Execution Toggles */}
            <div className="flex flex-col justify-center space-y-2 pt-2">
              <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={headless}
                  onChange={(e) => setHeadless(e.target.checked)}
                  disabled={loading}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-800"
                />
                <span>Modo Headless (Invisible)</span>
              </label>

              <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={loading}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-400 bg-slate-800"
                />
                <span>Dry-Run (Simular sin guardar)</span>
              </label>
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              💡 Este proceso extrae solo stock y costos, protegiendo imágenes, descripciones y atributos ya registrados.
            </div>
            <button
              onClick={handleRunSync}
              disabled={loading}
              className={`w-full sm:w-auto px-6 py-2.5 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 shadow-lg ${
                loading
                  ? 'bg-amber-600/50 cursor-not-allowed text-amber-200'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 hover:shadow-amber-500/20 active:scale-95'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-slate-950" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Sincronizando inventario...</span>
                </>
              ) : (
                <>
                  <span>⚡ Sincronizar Stock y Precios Ahora</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {statusMessage && (
          <div className="bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 px-4 py-3 rounded-lg flex items-center gap-3">
            <span>✅</span>
            <span className="text-sm">{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-600/50 text-rose-300 px-4 py-3 rounded-lg flex items-center gap-3">
            <span>❌</span>
            <span className="text-sm">{errorMessage}</span>
          </div>
        )}

        {/* KPI Metrics Summary */}
        {summary && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <span className="text-xs font-mono text-slate-400 uppercase">Escaneados</span>
                <p className="text-2xl font-bold text-white mt-1">{summary.totalScanned}</p>
              </div>

              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 text-center bg-emerald-950/10">
                <span className="text-xs font-mono text-emerald-400 uppercase">Actualizados</span>
                <p className="text-2xl font-bold text-emerald-300 mt-1">{summary.totalUpdated}</p>
              </div>

              <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 text-center bg-amber-950/10">
                <span className="text-xs font-mono text-amber-400 uppercase">Sin Stock (0)</span>
                <p className="text-2xl font-bold text-amber-300 mt-1">{summary.totalOutOfStock}</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                <span className="text-xs font-mono text-slate-400 uppercase">Sin Cambios</span>
                <p className="text-2xl font-bold text-slate-300 mt-1">{summary.totalUnchanged}</p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center col-span-2 md:col-span-1">
                <span className="text-xs font-mono text-slate-400 uppercase">Duración</span>
                <p className="text-2xl font-bold text-indigo-300 mt-1">{summary.durationSeconds}s</p>
              </div>
            </div>

            {/* Changes Log Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
                  Detalle de Variaciones ({filteredItems.length} ítems)
                </h3>

                <div className="flex items-center gap-1.5 text-xs font-mono">
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-2.5 py-1 rounded ${filterStatus === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    Todos ({allItems.length})
                  </button>
                  <button
                    onClick={() => setFilterStatus('updated')}
                    className={`px-2.5 py-1 rounded ${filterStatus === 'updated' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    Actualizados ({summary.totalUpdated})
                  </button>
                  <button
                    onClick={() => setFilterStatus('out_of_stock')}
                    className={`px-2.5 py-1 rounded ${filterStatus === 'out_of_stock' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    Sin Stock ({summary.totalOutOfStock})
                  </button>
                  <button
                    onClick={() => setFilterStatus('unchanged')}
                    className={`px-2.5 py-1 rounded ${filterStatus === 'unchanged' ? 'bg-slate-700 text-white font-bold' : 'text-slate-400 hover:bg-slate-800'}`}
                  >
                    Sin Cambios ({summary.totalUnchanged})
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[480px]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/80 text-slate-400 font-mono uppercase sticky top-0">
                    <tr>
                      <th className="py-2.5 px-4">SKU / ID Ext</th>
                      <th className="py-2.5 px-4">Estado</th>
                      <th className="py-2.5 px-4 text-center">Stock</th>
                      <th className="py-2.5 px-4 text-right">Precio Neto (CLP)</th>
                      <th className="py-2.5 px-4">Detalle / Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-sans">
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No hay registros con el filtro seleccionado.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="py-2.5 px-4 font-mono font-medium text-amber-200">
                            {item.id_ext}
                          </td>
                          <td className="py-2.5 px-4">
                            {item.status === 'updated' && (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                Actualizado
                              </span>
                            )}
                            {item.status === 'out_of_stock' && (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Sin Stock (0)
                              </span>
                            )}
                            {item.status === 'unchanged' && (
                              <span className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
                                Sin Cambios
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono">
                            {item.status === 'updated' || item.status === 'out_of_stock' ? (
                              <span className="text-slate-300">
                                <span className="line-through text-slate-500 mr-1.5">{item.oldStock ?? 0}</span>
                                <span className="font-bold text-emerald-400">→ {item.newStock ?? 0}</span>
                              </span>
                            ) : (
                              <span>{item.newStock ?? item.oldStock ?? 0}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono">
                            {item.status === 'updated' ? (
                              <span>
                                <span className="line-through text-slate-500 mr-1.5">
                                  ${item.oldPriceNeto ? item.oldPriceNeto.toLocaleString('es-CL') : '0'}
                                </span>
                                <span className="font-bold text-emerald-400">
                                  → ${item.newPriceNeto ? item.newPriceNeto.toLocaleString('es-CL') : '0'}
                                </span>
                              </span>
                            ) : (
                              <span>
                                ${item.newPriceNeto
                                  ? item.newPriceNeto.toLocaleString('es-CL')
                                  : (item.oldPriceNeto || 0).toLocaleString('es-CL')}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">
                            {item.changeReason || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
