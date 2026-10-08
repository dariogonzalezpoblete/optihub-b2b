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
          <mark key={i} className="bg-emerald-500/20 text-emerald-300 rounded px-0.5">
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
    if (input.trim() === lastCommitted.current) return;
    const t = setTimeout(() => commit(input), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  const { items: suggestions, total } = useMemo(() => searchSuggestions(items, input, 6), [items, input]);

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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
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
          className="w-full bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl pl-11 pr-20 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {input ? (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 rounded-md text-slate-500 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md border border-slate-700 bg-slate-800/60 text-[11px] font-mono text-slate-400">
              /
            </kbd>
          )}
        </div>
      </div>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-slide-down">
          {suggestions.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-400">
              Sin coincidencias para <span className="text-white font-semibold">“{input.trim()}”</span>
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
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${
                        i === active ? 'bg-slate-800/80' : 'hover:bg-slate-800/50'
                      }`}
                    >
                      <span className="w-14 h-10 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.imagen_principal && (
                          <img src={m.imagen_principal} alt="" className="max-w-full max-h-full object-contain" />
                        )}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-white truncate">
                          <span className="text-emerald-400/80 text-[10px] font-bold uppercase tracking-wider mr-1.5">
                            {m.marca}
                          </span>
                          <Highlight text={m.modelo} query={input} />
                        </span>
                        <span className="block text-[11px] font-mono text-slate-500 truncate">
                          SKU <Highlight text={m.id_ext} query={input} />
                          {m.color && <span className="font-sans"> · {m.color}</span>}
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-500 tabular-nums flex-shrink-0">{m.stock} un.</span>
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
                className="w-full flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/50 text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:bg-slate-950 transition"
              >
                <span>
                  Ver los {total} {total === 1 ? 'resultado' : 'resultados'} para “{input.trim()}”
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
