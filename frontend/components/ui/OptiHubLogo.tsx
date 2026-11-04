'use client';

import React from 'react';

interface EmblemProps {
  className?: string;
  /**
   * 'brass' (default): Azul Marino (#263E55) + Latón (#B39058) — armoniza con el sistema Quiet Luxury del sitio
   * 'steel': Azul Marino (#263E55) + Azul Acero (#869BAE)
   * 'dark': Blanco (#FFFFFF) + Latón (#B39058) — para fondos oscuros o Azul Marino (#263E55)
   * 'gold' | 'white': alias de compatibilidad
   */
  theme?: 'brass' | 'steel' | 'dark' | 'gold' | 'white';
}

/**
 * Isotipo Monograma Doble M de MARCOS DE MARCA
 * Construido a partir de dos letras M conectadas en simetría vertical:
 * - Mitad superior: M en Azul Marino (#263E55) o Blanco (#FFFFFF) sobre fondos oscuros
 * - Mitad inferior: M invertida/conectada en Latón (#B39058) o Azul Acero (#869BAE)
 */
export function MarcosDeMarcaEmblem({ className = 'w-8 h-8', theme = 'brass' }: EmblemProps) {
  const topColor =
    theme === 'dark' || theme === 'white'
      ? '#FFFFFF'
      : '#263E55';

  const bottomColor =
    theme === 'steel'
      ? '#869BAE'
      : theme === 'white'
      ? '#FFFFFF'
      : '#B39058';

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Mitad Superior: Letra M en Azul Marino (#263E55) o Blanco */}
      <path
        d="M 14 6 H 24.2 L 50 40.8 L 75.8 6 H 86 V 50 H 77.2 V 19.8 L 56.6 50 H 43.4 L 22.8 19.8 V 50 H 14 V 6 Z"
        fill={topColor}
      />
      {/* Mitad Inferior: Letra M reflejada/conectada en Latón (#B39058) o Azul Acero */}
      <path
        d="M 14 94 H 24.2 L 50 59.2 L 75.8 94 H 86 V 50 H 77.2 V 80.2 L 56.6 50 H 43.4 L 22.8 80.2 V 50 H 14 V 94 Z"
        fill={bottomColor}
      />
    </svg>
  );
}

// Alias de compatibilidad hacia atrás para imports existentes
export const OptiHubEmblem = MarcosDeMarcaEmblem;

interface LogoProps {
  className?: string;
  emblemSize?: string;
  theme?: 'light' | 'dark';
  variant?: 'brass' | 'steel';
}

export function MarcosDeMarcaLogo({
  className = '',
  emblemSize = 'w-8 h-8',
  theme = 'light',
  variant = 'brass',
}: LogoProps) {
  const isDark = theme === 'dark';
  const emblemTheme = isDark ? 'dark' : variant;

  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <div
        className={`flex items-center justify-center p-1.5 border transition-colors ${
          isDark
            ? 'bg-[#263E55] border-[#35526E]'
            : 'bg-[#F3F1EC] border-[#E6E2DD]'
        }`}
      >
        <MarcosDeMarcaEmblem className={emblemSize} theme={emblemTheme} />
      </div>
      <div className="flex flex-col">
        <span
          className={`font-sans text-lg sm:text-xl font-medium tracking-[0.22em] uppercase leading-none ${
            isDark ? 'text-[#FFFFFF]' : 'text-[#263E55]'
          }`}
        >
          MARCOS DE MARCA
        </span>
        <span
          className={`font-sans text-[8px] sm:text-[9px] font-medium tracking-[0.26em] uppercase mt-1.5 ${
            isDark ? 'text-[#D5D0C8]' : 'text-[#5C5A55]'
          }`}
        >
          DISTRIBUCIÓN MAYORISTA ÓPTICA
        </span>
      </div>
    </div>
  );
}

export default MarcosDeMarcaLogo;

