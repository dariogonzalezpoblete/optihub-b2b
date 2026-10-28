'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { EnrichedMarco } from '@/lib/catalog/types';

interface PredictiveSearchProps {
  items: EnrichedMarco[];
  value: string;
  onCommit: (q: string) => void;
  onSelect: (m: EnrichedMarco) => void;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'ig'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-[#F7F3EB] text-[#846C44] font-semibold px-0.5 rounded-none">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PredictiveSearch({ value, onCommit, onSelect }: PredictiveSearchProps) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommitted = useRef(value);

  const [suggestions, setSuggestions] = useState<EnrichedMarco[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (value !== lastCommitted.current) {
      lastCommitted.current = value;
      setInput(value);
    }
  }, [value]);

  const commit = (q: string) => {
    const trimmed = q.trim();
    lastCommitted.current = trimmed;
    onCommit(trimmed);
  };

  useEffect(() => {
    let isMounted = true;
    if (!input.trim()) {
      setSuggestions([]);
      setTotal(0);
      return;
    }
    const fetchSearch = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(input.trim())}&limit=6`);
        const data = await res.json();
        if (isMounted && data.items) {
          setSuggestions(data.items);
          setTotal(data.total);
        }
      } catch(err) { console.error(err); }
    };
    const t = setTimeout(fetchSearch, 300);
    return () => { isMounted = false; clearTimeout(t); };
  }, [input]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showDropdown = open && input.trim().length > 0;

  const choose = (m: EnrichedMarco) => {
    setOpen(false);
    setActive(-1);
    onSelect(m);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && active >= 0 && suggestions[active]) choose(suggestions[active]);
      else {
        commit(input);
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const clear = () => {
    setInput('');
    commit('');
    setActive(-1);
    inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#787670] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="catalog-search-listbox"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="BUSCAR POR SKU, MODELO O MARCA…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-[#FFFFFF] border border-[#E6E2DD] hover:border-[#0F0F0F] rounded-none pl-11 pr-20 py-3 text-xs tracking-wider uppercase text-[#0F0F0F] placeholder-[#787670] focus:outline-none focus:border-[#0F0F0F] transition"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {input ? (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 text-[#787670] hover:text-[#0F0F0F] flex items-center justify-center transition cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 border border-[#E6E2DD] bg-[#FAF9F6] text-[10px] font-mono text-[#787670]">
              /
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full bg-[#FFFFFF] border border-[#0F0F0F] rounded-none overflow-hidden animate-slide-down shadow-none">
          {suggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs uppercase tracking-wider text-[#787670]">
              Sin coincidencias para <span className="text-[#0F0F0F] font-semibold">“{input.trim()}”</span>
            </div>
          ) : (
            <>
              <ul id="catalog-search-listbox" role="listbox" className="max-h-[22rem] overflow-y-auto scrollbar-thin divide-y divide-[#E6E2DD]">
                {suggestions.map((m, i) => (
                  <li key={m.id_ext} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(m)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition cursor-pointer ${
                        i === active ? 'bg-[#F4F2ED]' : 'hover:bg-[#F4F2ED]'
                      }`}
                    >
                      <span className="w-14 h-10 bg-[#FFFFFF] border border-[#E6E2DD] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.imagen_principal && (
                          <img src={m.imagen_principal} alt="" className="max-w-full max-h-full object-contain mix-blend-multiply" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-[#0F0F0F] truncate">
                          <span className="text-[#9E8256] text-[10px] uppercase tracking-wider mr-1.5 font-mono">
                            {m.marca}
                          </span>
                          <Highlight text={m.modelo} query={input} />
                        </span>
                        <span className="block text-[10px] font-mono text-[#787670] truncate">
                          SKU <Highlight text={m.id_ext} query={input} />
                          {m.color && <span className="font-sans"> · {m.color}</span>}
                        </span>
                      </span>
                      {typeof m.stock === 'number' && (
                        <span className="text-[10px] font-mono text-[#5C5A55] flex-shrink-0 tabular-nums">{m.stock} un.</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  commit(input);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 border-t border-[#E6E2DD] bg-[#FAF9F6] text-[10px] uppercase tracking-[0.18em] font-semibold text-[#0F0F0F] hover:text-[#9E8256] transition cursor-pointer"
              >
                <span>
                  Ver los {total} {total === 1 ? 'resultado' : 'resultados'} para “{input.trim()}”
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-[#9E8256]" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
