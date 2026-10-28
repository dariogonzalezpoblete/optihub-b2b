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
      <ArrowUpDown className="absolute left-3 w-3 h-3 text-[#787670] pointer-events-none" />
      <select
        value={current}
        onChange={(e) => onChange(e.target.value as SortKey)}
        className="appearance-none bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] rounded-none pl-8 pr-8 py-2.5 text-[11px] uppercase tracking-[0.14em] font-medium text-[#0F0F0F] focus:outline-none focus:border-[#0F0F0F] transition cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#FFFFFF] text-[#0F0F0F]">
            {o.label}
          </option>
        ))}
      </select>
      <svg className="absolute right-3 w-2.5 h-2.5 text-[#787670] pointer-events-none" viewBox="0 0 12 12" fill="none">
        <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
