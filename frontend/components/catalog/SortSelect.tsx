'use client';

import { ArrowUpDown } from 'lucide-react';
import type { SortKey } from '@/lib/catalog/types';

const OPTIONS: { value: SortKey; label: string; requiresLogin?: boolean }[] = [
  { value: 'relevancia', label: 'Relevancia' },
  { value: 'stock', label: 'Mayor stock' },
  { value: 'precio-asc', label: 'Precio: menor a mayor', requiresLogin: true },
  { value: 'precio-desc', label: 'Precio: mayor a menor', requiresLogin: true },
  { value: 'modelo', label: 'Marca y modelo (A–Z)' },
];

interface SortSelectProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
  canSeePrices: boolean;
}

export default function SortSelect({ value, onChange, canSeePrices }: SortSelectProps) {
  const options = OPTIONS.filter((o) => !o.requiresLogin || canSeePrices);
  const current = options.some((o) => o.value === value) ? value : 'relevancia';

  return (
    <label className="relative flex items-center">
      <span className="sr-only">Ordenar por</span>
      <ArrowUpDown className="absolute left-3 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="appearance-none bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl pl-9 pr-8 py-2.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-emerald-500 transition cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-slate-900">
            {o.label}
          </option>
        ))}
      </select>
      <svg className="absolute right-3 w-3 h-3 text-slate-500 pointer-events-none" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
