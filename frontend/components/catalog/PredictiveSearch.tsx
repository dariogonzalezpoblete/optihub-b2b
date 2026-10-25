'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Search, X } from 'lucide-react';
import type { EnrichedMarco } from '@/lib/catalog/types';
import { searchSuggestions } from '@/lib/catalog/filterEngine';

interface PredictiveSearchProps {
  items: EnrichedMarco[];
  /** Búsqueda confirmada (la que filtra la grilla, viene de la URL) */
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
          <mark key={i} className="bg-[#F7F3EB] text-[#9E7D4F] font-semibold rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function PredictiveSearch({ items, value, onCommit, onSelect }: PredictiveSearchProps) {
  const [input, setInput] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommitted = useRef(value);

  // Sincronizar solo si el cambio vino de afuera (ej: "Limpiar todo"), no del propio debounce
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

  // Filtrar la grilla 300 ms después de dejar de escribir
  useEffect(() => {
    if (input === lastCommitted.current) return;
    const timer = setTimeout(() => {
      commit(input);
    }, 300);
    return () => clearTimeout(timer);
  }, [input]);

  // Autocompletado rápido
  const [suggestions, setSuggestions] = useState<EnrichedMarco[]>([]);
  const [total, setTotal] = useState(0);

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

  // Cerrar al hacer click afuera
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Atajo "/" para enfocar el buscador
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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#82807A] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="catalog-search-listbox"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Buscar por SKU, modelo o marca…"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-[#FFFFFF] border border-[#E5E4DF] hover:border-[#82807A] rounded-xl pl-11 pr-20 py-3 text-sm text-[#111111] placeholder-[#82807A] focus:outline-none focus:border-[#B89768] focus:ring-3 focus:ring-[#B89768]/15 transition shadow-2xs"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {input ? (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 rounded-md text-[#82807A] hover:text-[#111111] hover:bg-[#FAF9F6] flex items-center justify-center transition"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md border border-[#E5E4DF] bg-[#FAF9F6] text-[11px] font-tech text-[#82807A]">
              /
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full bg-[#FFFFFF] border border-[#E5E4DF] rounded-2xl shadow-xl overflow-hidden animate-slide-down">
          {suggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-[#82807A]">
              Sin coincidencias para <span className="text-[#111111] font-semibold">“{input.trim()}”</span>
            </div>
          ) : (
            <>
              <ul id="catalog-search-listbox" role="listbox" className="max-h-[22rem] overflow-y-auto scrollbar-thin py-1.5">
                {suggestions.map((m, i) => (
                  <li key={m.id_ext} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(m)}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition ${
                        i === active ? 'bg-[#FAF9F6]' : 'hover:bg-[#FAF9F6]'
                      }`}
                    >
                      <span className="w-14 h-10 rounded-lg bg-[#FFFFFF] border border-[#E5E4DF] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.imagen_principal && (
                          <img src={m.imagen_principal} alt="" className="max-w-full max-h-full object-contain" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-[#111111] truncate">
                          <span className="text-[#B89768] text-[10px] font-bold uppercase tracking-wider mr-1.5 font-editorial">
                            {m.marca}
                          </span>
                          <Highlight text={m.modelo} query={input} />
                        </span>
                        <span className="block text-[11px] font-tech text-[#82807A] truncate">
                          SKU <Highlight text={m.id_ext} query={input} />
                          {m.color && <span className="font-sans"> · {m.color}</span>}
                        </span>
                      </span>
                      {typeof m.stock === 'number' && (
                        <span className="text-[10px] font-tech text-[#575551] flex-shrink-0">{m.stock} un.</span>
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
                className="w-full flex items-center justify-between px-4 py-3 border-t border-[#E5E4DF] bg-[#FAF9F6] text-xs font-bold text-[#111111] hover:text-[#B89768] transition"
              >
                <span>
                  Ver los {total} {total === 1 ? 'resultado' : 'resultados'} para “{input.trim()}”
                </span>
                <ArrowRight className="w-4 h-4 text-[#B89768]" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
