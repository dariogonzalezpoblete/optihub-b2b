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
    <div className="border-b border-[#E5E4DF] last:border-b-0 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 group text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#575551] group-hover:text-[#111111] transition">
            {title}
          </span>
          {selected.length > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-[#111111] text-white text-[10px] font-tech font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#82807A] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 animate-fade-in">
          {subtitle && <p className="text-[11px] text-[#82807A] mb-2.5">{subtitle}</p>}

          {variant === 'chips' ? (
            <div className="grid grid-cols-2 gap-2">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                const disabled = false;
                return (
                  <button
                    key={o.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onToggle(o.key)}
                    aria-pressed={checked}
                    className={`text-left rounded-xl border px-3 py-2 transition ${
                      checked
                        ? 'border-[#B89768] bg-[#F7F3EB] shadow-xs'
                        : disabled
                          ? 'border-[#E5E4DF] opacity-35 cursor-not-allowed bg-[#FFFFFF]'
                          : 'border-[#E5E4DF] bg-[#FAF9F6] hover:border-[#B89768]/60 hover:bg-[#FFFFFF]'
                    }`}
                  >
                    <span className={`block text-xs font-bold ${checked ? 'text-[#9E7D4F]' : 'text-[#111111]'}`}>
                      {o.label}
                    </span>
                    <span className="flex justify-between items-center text-[10px] text-[#82807A] mt-0.5">
                      <span>{o.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                const disabled = false;
                return (
                  <li key={o.key}>
                    <label
                      className={`flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 transition select-none ${
                        disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer hover:bg-[#FAF9F6]'
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
                        className={`w-4 h-4 rounded-[4px] border flex items-center justify-center flex-shrink-0 transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#B89768]/50 ${
                          checked ? 'bg-[#111111] border-[#111111]' : 'border-[#E5E4DF] bg-[#FFFFFF]'
                        }`}
                      >
                        {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 text-sm ${checked ? 'text-[#111111] font-semibold' : 'text-[#575551]'}`}>
                        {o.label}
                      </span>
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
              className="mt-2 text-[11px] font-bold text-[#B89768] hover:text-[#9E7D4F] uppercase tracking-wider transition"
            >
              {expanded ? 'Ver menos' : `Ver ${hiddenCount} más`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
