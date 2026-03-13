import React, { useState, useEffect, useMemo } from "react";
import { Package } from "lucide-react";

/**
 * ProductImage — Multi-format fallback image component for product photos.
 *
 * Uses HEAD-based probing (fetch) to find the correct image extension silently,
 * avoiding browser console "Failed to load resource" errors that the old
 * <img> onError chain produced.
 *
 * A **module-level cache** ensures each SKU is only resolved once per page
 * session — subsequent renders skip straight to the working URL.
 *
 * After implementing WebP conversion on upload, all NEW images will be `.webp`
 * and resolve on the first try. This fallback chain is for backward
 * compatibility with existing images in other formats.
 */

var STORAGE_BASE = "https://aztdgagxvrlylszieujs.supabase.co/storage/v1/object/public/produtos";

/** Extensions to try, in priority order */
var EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif"];

/** Module-level cache: cacheKey -> resolved URL (string) or null (no image found) */
var _resolved: Record<string, string | null> = {};

/** In-flight probe promises — prevents duplicate HEAD requests for the same key */
var _inflight: Record<string, Promise<string | null>> = {};

/** Build a candidate URL for a given SKU, image number, and extension */
function buildCandidateUrl(sku: string, num: number, ext: string): string {
  var s = encodeURIComponent(sku);
  return STORAGE_BASE + "/" + s + "/" + s + "." + String(num) + ext;
}

/** Get all candidate URLs for image #N of a SKU */
export function getProductImageCandidates(sku: string, num?: number): string[] {
  var n = num || 1;
  var result: string[] = [];
  for (var i = 0; i < EXTENSIONS.length; i++) {
    result.push(buildCandidateUrl(sku, n, EXTENSIONS[i]));
  }
  return result;
}

/**
 * Probe URLs via HEAD requests (silent — no console errors).
 * Returns the first URL that responds with 2xx, or null if all fail.
 */
async function _probeUrls(candidates: string[]): Promise<string | null> {
  for (var i = 0; i < candidates.length; i++) {
    try {
      var resp = await fetch(candidates[i], { method: "HEAD", mode: "cors" });
      if (resp.ok) return candidates[i];
    } catch {
      // Network error — skip to next
    }
  }
  return null;
}

/**
 * Resolve the working URL for a given cache key + candidates.
 * Deduplicates in-flight requests so multiple components rendering the
 * same SKU don't fire parallel HEAD chains.
 */
function resolveImageUrl(cacheKey: string, candidates: string[]): Promise<string | null> {
  // Already resolved
  if (cacheKey in _resolved) return Promise.resolve(_resolved[cacheKey]);

  // Already probing
  if (cacheKey in _inflight) return _inflight[cacheKey];

  var promise = _probeUrls(candidates).then(function (url) {
    _resolved[cacheKey] = url;
    delete _inflight[cacheKey];
    return url;
  });
  _inflight[cacheKey] = promise;
  return promise;
}

/** Read from the resolution cache (used by AddToCartButton etc.) */
export function getResolvedProductImageUrl(sku: string): string | null {
  if (sku in _resolved) return _resolved[sku];
  // Not resolved yet — return WebP URL as best guess
  return buildCandidateUrl(sku, 1, ".webp");
}

/** Pre-seed the cache (e.g. when ProductDetailPage gets real URLs from API) */
export function seedProductImageCache(sku: string, url: string): void {
  _resolved[sku] = url;
}

interface ProductImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  /** Product SKU */
  sku: string;
  /** Alt text */
  alt: string;
  /** Image number (default 1 = primary) */
  imageNumber?: number;
  /** Element to show if no image is found */
  fallback?: React.ReactNode;
}

function ProductImageInner({
  sku,
  alt,
  imageNumber,
  fallback,
  className,
  style,
  onLoad: externalOnLoad,
  onError: externalOnError,
  ...rest
}: ProductImageProps) {
  var num = imageNumber || 1;
  var cacheKey = num === 1 ? sku : sku + ":" + String(num);

  // Check module-level cache synchronously
  var cachedUrl = cacheKey in _resolved ? _resolved[cacheKey] : undefined;

  // State for async probe result
  var [resolvedUrl, setResolvedUrl] = useState<string | null | undefined>(cachedUrl);

  var candidates = useMemo(function () { return getProductImageCandidates(sku, num); }, [sku, num]);

  // Run HEAD probe when not cached
  useEffect(function () {
    // Already cached
    if (cacheKey in _resolved) {
      setResolvedUrl(_resolved[cacheKey]);
      return;
    }

    var cancelled = false;
    resolveImageUrl(cacheKey, candidates).then(function (url) {
      if (!cancelled) setResolvedUrl(url);
    });
    return function () { cancelled = true; };
  }, [cacheKey, candidates]);

  // Reset when SKU changes and cache doesn't have it
  useEffect(function () {
    if (cacheKey in _resolved) {
      setResolvedUrl(_resolved[cacheKey]);
    } else {
      setResolvedUrl(undefined);
    }
  }, [cacheKey]);

  // ── Case 1: Probe complete, no image found ──
  if (resolvedUrl === null) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-gray-200">
        <Package className="w-14 h-14" />
        <span style={{ fontSize: "0.72rem" }} className="text-gray-300">Sem imagem</span>
      </div>
    );
  }

  // ── Case 2: Probe complete, image found ──
  if (resolvedUrl) {
    return (
      <img
        src={resolvedUrl}
        alt={alt}
        className={className}
        style={style}
        loading="lazy"
        decoding="async"
        {...rest}
        onLoad={externalOnLoad}
        onError={function (e) {
          // Cached URL no longer works — clear cache and re-probe
          delete _resolved[cacheKey];
          setResolvedUrl(undefined);
          if (externalOnError) externalOnError(e);
        }}
      />
    );
  }

  // ── Case 3: Still probing (loading state) ──
  return (
    <div
      className={"flex items-center justify-center bg-gray-50 animate-pulse " + (className || "")}
      style={style}
    >
      <Package className="w-10 h-10 text-gray-200" />
    </div>
  );
}

export const ProductImage = React.memo(ProductImageInner);

/**
 * Utility: Convert any image File to WebP format using Canvas API.
 * Returns a new File with .webp extension and image/webp MIME type.
 * Used by admin upload to ensure all product images are stored as WebP.
 *
 * @param file - The original image file (png, jpg, gif, bmp, etc.)
 * @param quality - WebP quality 0-1 (default 0.85)
 * @returns Promise<File> - The converted WebP file
 */
export function convertImageToWebP(file: File, quality?: number): Promise<File> {
  var q = quality != null ? quality : 0.85;

  return new Promise(function (resolve, reject) {
    // If already WebP, return as-is
    if (file.type === "image/webp") {
      resolve(file);
      return;
    }

    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        try {
          var canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          var ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Falha ao criar contexto Canvas 2D"));
            return;
          }
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            function (blob) {
              if (!blob) {
                reject(new Error("Falha na conversao para WebP"));
                return;
              }
              // Build new filename with .webp extension
              var baseName = file.name.replace(/\.[^.]+$/, "");
              var newFile = new File([blob], baseName + ".webp", {
                type: "image/webp",
                lastModified: Date.now(),
              });
              resolve(newFile);
            },
            "image/webp",
            q
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error("Falha ao carregar imagem para conversao"));
      };
      img.src = reader.result as string;
    };
    reader.onerror = function () {
      reject(new Error("Falha ao ler arquivo de imagem"));
    };
    reader.readAsDataURL(file);
  });
}