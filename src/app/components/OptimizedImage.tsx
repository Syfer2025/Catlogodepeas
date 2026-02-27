import { useState } from "react";

/**
 * OptimizedImage — Progressive image component with Supabase Storage transformations.
 *
 * Features:
 * - Uses Supabase `render/image` endpoint for server-side resizing
 * - Generates responsive `srcset` with multiple widths
 * - Falls back to original URL on error
 * - Supports `loading="lazy"` and `decoding="async"` by default
 * - Adds `sizes` attribute for responsive layout hints
 *
 * Supabase render endpoint:
 *   /storage/v1/render/image/public/{bucket}/{path}?width=X&quality=Q&resize=contain
 */

const SUPABASE_STORAGE_HOST = "https://aztdgagxvrlylszieujs.supabase.co";
const STORAGE_PUBLIC_PREFIX = SUPABASE_STORAGE_HOST + "/storage/v1/object/public/";
const RENDER_PREFIX = SUPABASE_STORAGE_HOST + "/storage/v1/render/image/public/";

/** Standard breakpoint widths for srcset */
const SRCSET_WIDTHS = [200, 400, 600, 800, 1200];
/** Banner-specific widths (larger) */
const BANNER_WIDTHS = [480, 768, 1024, 1440, 1920];

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Original public Supabase Storage URL */
  src: string;
  alt: string;
  /** Variant determines srcset widths */
  variant?: "product" | "banner" | "thumbnail";
  /** Quality for Supabase render (1-100), default 75 */
  quality?: number;
  /** Custom sizes attribute — if not provided, a sensible default is generated */
  sizes?: string;
  /** Fallback element when image fails to load */
  fallback?: React.ReactNode;
  /** External onError handler */
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

/**
 * Checks if a URL is a Supabase Storage public URL that can be transformed
 */
function isSupabasePublicUrl(url: string): boolean {
  return url.startsWith(STORAGE_PUBLIC_PREFIX);
}

/**
 * Converts a Supabase public storage URL to a render/transform URL
 * with the given width and quality.
 */
function getTransformUrl(originalUrl: string, width: number, quality: number): string {
  if (!isSupabasePublicUrl(originalUrl)) return originalUrl;
  // Extract the bucket/path portion after /object/public/
  var pathPart = originalUrl.slice(STORAGE_PUBLIC_PREFIX.length);
  return RENDER_PREFIX + pathPart + "?width=" + width + "&quality=" + quality + "&resize=contain";
}

/**
 * Builds a srcset string with multiple widths
 */
function buildSrcSet(originalUrl: string, widths: number[], quality: number): string {
  if (!isSupabasePublicUrl(originalUrl)) return "";
  return widths
    .map(function (w) {
      return getTransformUrl(originalUrl, w, quality) + " " + w + "w";
    })
    .join(", ");
}

/**
 * Default sizes hints per variant
 */
function getDefaultSizes(variant: string): string {
  switch (variant) {
    case "thumbnail":
      return "(max-width: 640px) 120px, 200px";
    case "banner":
      return "100vw";
    case "product":
    default:
      return "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw";
  }
}

export function OptimizedImage({
  src,
  alt,
  variant = "product",
  quality = 75,
  sizes,
  fallback,
  loading = "lazy",
  decoding = "async",
  onError: externalOnError,
  ...rest
}: OptimizedImageProps) {
  var [error, setError] = useState(false);
  var [useFallbackSrc, setUseFallbackSrc] = useState(false);

  if (error && fallback) {
    return <>{fallback}</>;
  }

  var widths = variant === "banner" ? BANNER_WIDTHS : variant === "thumbnail" ? [120, 200, 400] : SRCSET_WIDTHS;
  var canTransform = isSupabasePublicUrl(src);
  var srcSet = canTransform ? buildSrcSet(src, widths, quality) : undefined;
  var sizesAttr = sizes || getDefaultSizes(variant);

  // For the main src, use a medium-sized version if transformable
  var mainSrc = src;
  if (canTransform && !useFallbackSrc) {
    var defaultWidth = variant === "banner" ? 1200 : variant === "thumbnail" ? 200 : 400;
    mainSrc = getTransformUrl(src, defaultWidth, quality);
  }

  return (
    <img
      src={mainSrc}
      srcSet={!useFallbackSrc ? srcSet : undefined}
      sizes={!useFallbackSrc ? sizesAttr : undefined}
      alt={alt}
      loading={loading}
      decoding={decoding}
      {...rest}
      onError={function (e) {
        if (!useFallbackSrc && canTransform) {
          // Transform endpoint might not be available (free tier) — fall back to original
          setUseFallbackSrc(true);
        } else {
          setError(true);
        }
        // Also call external onError if provided
        if (externalOnError) externalOnError(e);
      }}
    />
  );
}

/**
 * Utility: get an optimized URL for a Supabase Storage image at a given width.
 * Falls back to the original URL if not a Supabase URL.
 */
export function getOptimizedUrl(originalUrl: string, width: number, quality?: number): string {
  return getTransformUrl(originalUrl, width, quality || 75);
}

/**
 * Utility: build a srcset string for any Supabase Storage URL.
 */
export function getOptimizedSrcSet(
  originalUrl: string,
  variant?: "product" | "banner" | "thumbnail",
  quality?: number
): string {
  var widths = variant === "banner" ? BANNER_WIDTHS : variant === "thumbnail" ? [120, 200, 400] : SRCSET_WIDTHS;
  return buildSrcSet(originalUrl, widths, quality || 75);
}