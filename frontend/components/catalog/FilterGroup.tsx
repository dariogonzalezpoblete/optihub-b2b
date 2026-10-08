'use client';

import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { FacetOption } from '@/lib/catalog/types';

interface FilterGroupProps {
  title: string;
  subtitle?: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (key: string) => void;
  variant?: 'list' | 'chips';
  initialVisible?: number;
  defaultOpen?: boolean;
}

export default function FilterGroup({
  title,
  subtitle,
  options,
  selected,
  onToggle,
  variant = 'list',
  initialVisible = 6,
  defaultOpen = true,
}: FilterGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [expanded, setExpanded] = useState(false);

  if (!options.length) return null;

  // Las opciones marcadas siempre quedan visibles aunque estén "ocultas" por el límite
  const visible =
    variant === 'chips' || expanded || options.length <= initialVisible
      ? options
      : options.filter((o, i) => i < initialVisible || selected.includes(o.key));
  const hiddenCount = options.length - visible.length;

  return (
    <div className="border-b border-slate-800/80 last:border-b-0 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 group"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300 group-hover:text-white transition">
            {title}
          </span>
          {selected.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black flex items-center justify-center">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 animate-fade-in">
          {subtitle && <p className="text-[11px] text-slate-500 mb-2.5">{subtitle}</p>}

          {variant === 'chips' ? (
            <div className="grid grid-cols-2 gap-2">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                const disabled = o.count === 0 && !checked;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(o.key)}
                    aria-pressed={checked}
                    className={`text-left rounded-xl border px-3 py-2 transition ${
                      checked
                        ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm shadow-emerald-500/10'
                        : disabled
                          ? 'border-slate-800/60 opacity-35 cursor-not-allowed'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                    }`}
                  >
                    <span className={`block text-xs font-bold ${checked ? 'text-emerald-300' : 'text-white'}`}>
                      {o.label}
                    </span>
                    <span className="flex justify-between items-center text-[10px] text-slate-500 mt-0.5">
                      <span>{o.hint}</span>
                      <span className="tabular-nums">{o.count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                const disabled = o.count === 0 && !checked;
                return (
                  <li key={o.key}>
                    <label
                      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition select-none ${
                        disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-800/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => onToggle(o.key)}
                      />
                      <span
                        className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50 ${
                          checked ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600 bg-slate-950'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 text-slate-950" strokeWidth={3.5} />}
                      </span>
                      <span className={`flex-1 text-sm ${checked ? 'text-white font-semibold' : 'text-slate-300'}`}>
                        {o.label}
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums">{o.count}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {variant === 'list' && options.length > initialVisible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 uppercase tracking-wider transition"
            >
              {expanded ? 'Ver menos' : `Ver ${hiddenCount} más`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
