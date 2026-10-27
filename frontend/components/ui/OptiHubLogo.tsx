'use client';

import React from 'react';

interface EmblemProps {
  className?: string;
  theme?: 'gold' | 'dark' | 'white';
}

/**
 * Emblema Monograma OH de OptiHub (Minimalista de Alta Gama)
 * Inspirado en la silueta editorial de armazón óptico / gafas de lujo:
 * Aro circular oftálmico 'O' que fluye a través del puente anatómico
 * hacia la terminal de varilla 'H' con remates estilizados.
 */
export function OptiHubEmblem({ className = 'w-7 h-7', theme = 'gold' }: EmblemProps) {
  const gradientId = `optihub-gold-grad-${theme}`;

  return (
    <svg
      viewBox="0 0 100 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#E5C78E" />
          <stop offset="40%" stopColor="#B89768" />
          <stop offset="75%" stopColor="#A58252" />
          <stop offset="100%" stopColor="#846537" />
        </linearGradient>
      </defs>

      <path
        d="M 51.5 20
           C 47 12 37.8 6.5 27 6.5
           C 12.1 6.5 0 18.6 0 33.5
           C 0 48.4 12.1 60.5 27 60.5
           C 39.5 60.5 50.1 52 53.2 40.5
           C 54.8 35 60.5 32 66.5 32
           L 75 32
           C 79 32 82 34 83 38
           C 84 43 85 52 86 56
           C 86.5 58 88 59 90 59
           L 95.5 59
           C 96.5 59 97 58 97 56.5
           L 97 10
           C 97 8.5 96.5 7.5 95 7.5
           L 89.5 7.5
           C 88 7.5 87 8.5 86.5 10
           C 85 14.5 84 22 76 22
           L 66.5 22
           C 60 22 55.5 19.5 52.8 15.5
           L 51.5 20 Z
           M 27 18
           C 35.6 18 42.5 24.9 42.5 33.5
           C 42.5 42.1 35.6 49 27 49
           C 18.4 49 11.5 42.1 11.5 33.5
           C 11.5 24.9 18.4 18 27 18 Z"
        fill={theme === 'white' ? '#FFFFFF' : theme === 'dark' ? '#111111' : `url(#${gradientId})`}
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  emblemSize?: string;
  theme?: 'light' | 'dark';
}

export default function OptiHubLogo({ className = '', emblemSize = 'w-7 h-7', theme = 'light' }: LogoProps) {
  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex items-center justify-center rounded-xl p-1.5 border transition-colors ${
        isDark 
          ? 'bg-[#1A1A1A] border-[#333333]' 
          : 'bg-[#FAF9F6] border-[#E5E4DF]'
      }`}>
        <OptiHubEmblem className={emblemSize} theme={isDark ? 'gold' : 'gold'} />
      </div>
      <div className="flex flex-col">
        <span className={`font-editorial text-2xl sm:text-3xl font-semibold tracking-tight leading-none ${
          isDark ? 'text-[#FFFFFF]' : 'text-[#111111]'
        }`}>
          Opti<span className="text-[#B89768]">Hub</span>
        </span>
        <span className={`font-sans text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase mt-1 ${
          isDark ? 'text-[#A09E96]' : 'text-[#82807A]'
        }`}>
          Importación Mayorista Óptica
        </span>
      </div>
    </div>
  );
}
