"use client";

import React, { useState, useEffect, useRef } from "react";

const FALLBACK_SRC = "/placeholder.svg";

/**
 * Validates whether a product image URL is usable.
 * Rejects empty strings, known broken/truncated external provider URLs, or non-URLs.
 */
export function normalizeProductImageUrl(src?: string | null): string {
  if (!src || typeof src !== "string") return FALLBACK_SRC;
  const trimmed = src.trim();
  if (!trimmed) return FALLBACK_SRC;
  if (trimmed === "/placeholder.png" || trimmed === "/placeholder.svg") {
    return FALLBACK_SRC;
  }
  // Detect truncated external URLs that have no image extension and aren't from Supabase storage
  if (
    trimmed.startsWith("http") &&
    !trimmed.includes("supabase.co") &&
    !/\.(webp|jpg|jpeg|png|avif|gif|svg)(\?.*)?$/i.test(trimmed)
  ) {
    return FALLBACK_SRC;
  }
  return trimmed;
}

export interface ProductImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src?: string | null;
  fallbackSrc?: string;
  /** Optional secondary image URL to try before falling back to placeholder */
  secondarySrc?: string | null;
  /** Show subtle loading skeleton while image loads (default: true) */
  showSpinner?: boolean;
  /** Maximum time in ms to wait before forcing load completion (default: 7000ms) */
  loadTimeoutMs?: number;
  containerClassName?: string;
}

export default function ProductImage({
  src,
  secondarySrc,
  fallbackSrc = FALLBACK_SRC,
  alt = "Armazón óptico",
  className = "",
  containerClassName = "",
  loading = "lazy",
  decoding = "async",
  showSpinner = true,
  loadTimeoutMs = 7000,
  onLoad,
  onError,
  ...rest
}: ProductImageProps) {
  const initialSrc = normalizeProductImageUrl(src);
  const normalizedSecondary = secondarySrc ? normalizeProductImageUrl(secondarySrc) : null;

  const [currentSrc, setCurrentSrc] = useState<string>(
    initialSrc === FALLBACK_SRC && normalizedSecondary && normalizedSecondary !== FALLBACK_SRC
      ? normalizedSecondary
      : initialSrc
  );
  const [isLoaded, setIsLoaded] = useState<boolean>(currentSrc === fallbackSrc);
  const [triedSecondary, setTriedSecondary] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Sync state when prop `src` or `secondarySrc` changes (e.g. switching color variant)
  useEffect(() => {
    const nextPrimary = normalizeProductImageUrl(src);
    const nextSecondary = secondarySrc ? normalizeProductImageUrl(secondarySrc) : null;
    const targetSrc =
      nextPrimary === FALLBACK_SRC && nextSecondary && nextSecondary !== FALLBACK_SRC
        ? nextSecondary
        : nextPrimary;

    setCurrentSrc(targetSrc);
    setTriedSecondary(targetSrc === nextSecondary);

    if (targetSrc === fallbackSrc) {
      setIsLoaded(true);
      return;
    }

    // Check if image is already in browser cache
    if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
  }, [src, secondarySrc, fallbackSrc]);

  // Check cache immediately after mount/render and enforce a timeout guard so no spinner ever hangs infinitely
  useEffect(() => {
    const imgEl = imgRef.current;
    if (imgEl && imgEl.complete) {
      if (imgEl.naturalWidth > 0) {
        setIsLoaded(true);
        return;
      }
    }

    if (isLoaded) return;

    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, loadTimeoutMs);

    return () => clearTimeout(timer);
  }, [currentSrc, isLoaded, loadTimeoutMs]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setIsLoaded(true);
    onLoad?.(e);
  };

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Prevent infinite retry loops
    if (
      !triedSecondary &&
      normalizedSecondary &&
      normalizedSecondary !== FALLBACK_SRC &&
      normalizedSecondary !== currentSrc
    ) {
      setTriedSecondary(true);
      setCurrentSrc(normalizedSecondary);
      return;
    }

    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
    }
    setIsLoaded(true);
    onError?.(e);
  };

  return (
    <>
      {showSpinner && !isLoaded && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center bg-[#F4F2ED]/60 pointer-events-none z-[1] ${containerClassName}`}
        >
          <div className="w-5 h-5 border-2 border-[#E5E2DC] border-t-[#9E8256] rounded-full animate-spin" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        onLoad={handleLoad}
        onError={handleError}
        className={`${className} transition-opacity duration-300 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        {...rest}
      />
    </>
  );
}
