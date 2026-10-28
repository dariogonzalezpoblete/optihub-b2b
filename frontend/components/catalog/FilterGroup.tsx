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

  const visible =
    variant === 'chips' || expanded || options.length <= initialVisible
      ? options
      : options.filter((o, i) => i < initialVisible || selected.includes(o.key));
  const hiddenCount = options.length - visible.length;

  return (
    <div className="border-b border-[#E6E2DD] last:border-b-0 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 group text-left cursor-pointer"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5C5A55] group-hover:text-[#0F0F0F] transition">
            {title}
          </span>
          {selected.length > 0 && (
            <span className="min-w-4 h-4 px-1 bg-[#0F0F0F] text-white text-[9px] font-mono font-bold flex items-center justify-center">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#787670] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 animate-fade-in">
          {subtitle && <p className="text-[10px] text-[#787670] mb-2 font-mono uppercase">{subtitle}</p>}

          {variant === 'chips' ? (
            <div className="grid grid-cols-2 gap-1.5">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    onClick={() => onToggle(o.key)}
                    aria-pressed={checked}
                    className={`text-left border px-2.5 py-1.5 transition rounded-none cursor-pointer ${
                      checked
                        ? 'border-[#0F0F0F] bg-[#0F0F0F] text-white'
                        : 'border-[#E6E2DD] bg-[#FAF9F6] hover:border-[#0F0F0F] text-[#0F0F0F]'
                    }`}
                  >
                    <span className="block text-xs font-mono font-medium">
                      {o.label}
                    </span>
                    <span className={`block text-[9px] uppercase tracking-wider mt-0.5 ${checked ? 'text-white/70' : 'text-[#787670]'}`}>
                      {o.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <ul className="space-y-0.5">
              {visible.map((o) => {
                const checked = selected.includes(o.key);
                return (
                  <li key={o.key}>
                    <label
                      className="flex items-center gap-2.5 px-1 py-1.5 transition select-none cursor-pointer hover:bg-[#F4F2ED]"
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={checked}
                        onChange={() => onToggle(o.key)}
                      />
                      <span
                        className={`w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 transition rounded-none ${
                          checked ? 'bg-[#0F0F0F] border-[#0F0F0F]' : 'border-[#D5D0C8] bg-[#FFFFFF]'
                        }`}
                      >
                        {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </span>
                      <span className={`flex-1 text-xs ${checked ? 'text-[#0F0F0F] font-semibold' : 'text-[#5C5A55]'}`}>
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
              className="mt-2 text-[10px] font-medium text-[#9E8256] hover:text-[#0F0F0F] uppercase tracking-[0.16em] transition cursor-pointer"
            >
              {expanded ? 'Ver menos' : `Ver ${hiddenCount} más`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
