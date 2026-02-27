import { useState, useEffect } from "react";
import { Package } from "lucide-react";

/**
 * ProductImage — Multi-format fallback image component for product photos.
 *
 * Problem: `getProductMainImageUrl()` hardcodes `.1.webp` extension, but many
 * existing images are stored as `.png`, `.jpg`, or `.jpeg` in the Storage bucket.
 *
 * Solution: This component tries each extension in sequence (webp, png, jpg, jpeg)
 * using native `<img>` onError. A **module-level cache** ensures each SKU is only
 * resolved once per page session — subsequent renders skip straight to the working URL.
 *
 * After implementing WebP conversion on upload, all NEW images will be `.webp` and
 * resolve on the first try. This fallback chain is for backward compatibility with
 * existing images in other formats.
 */

var STORAGE_BASE = "https://aztdgagxvrlylszieujs.supabase.co/storage/v1/object/public/produtos";

/** Extensions to try, in priority order */
var EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".gif"];

/** Module-level cache: sku -> resolved URL (string) or null (no image found) */
var _resolved: Record<string, string | null> = {};

/** Build a candidate URL for a given SKU, image number, and extension */
function buildCandidateUrl(sku: string, num: number, ext: string): string {
  var s = encodeURIComponent(sku);
  return STORAGE_BASE + "/" + s + "/" + s + "." + String(num) + ext;
}

/** Get all candidate URLs for image #1 of a SKU */
export function getProductImageCandidates(sku: string, num?: number): string[] {
  var n = num || 1;
  var result: string[] = [];
  for (var i = 0; i < EXTENSIONS.length; i++) {
    result.push(buildCandidateUrl(sku, n, EXTENSIONS[i]));
  }
  return result;
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

export function ProductImage({
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

  // Check module-level cache
  var cachedUrl = cacheKey in _resolved ? _resolved[cacheKey] : undefined;

  var [extIdx, setExtIdx] = useState(0);
  var [allFailed, setAllFailed] = useState(false);

  // Reset state when SKU changes
  useEffect(function () {
    setExtIdx(0);
    setAllFailed(false);
  }, [sku, num]);

  // ── Case 1: Cached as null (no image) ──
  if (cachedUrl === null || allFailed) {
    if (fallback) return <>{fallback}</>;
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-gray-200">
        <Package className="w-14 h-14" />
        <span style={{ fontSize: "0.72rem" }} className="text-gray-300">Sem imagem</span>
      </div>
    );
  }

  // ── Case 2: Cached with a valid URL ──
  if (cachedUrl !== undefined) {
    return (
      <img
        src={cachedUrl}
        alt={alt}
        className={className}
        style={style}
        loading="lazy"
        decoding="async"
        {...rest}
        onLoad={externalOnLoad}
        onError={function (e) {
          // Cached URL no longer works — clear and retry
          delete _resolved[cacheKey];
          setExtIdx(0);
          setAllFailed(false);
          if (externalOnError) externalOnError(e);
        }}
      />
    );
  }

  // ── Case 3: Not cached — try extensions in sequence ──
  var candidates = getProductImageCandidates(sku, num);
  var currentUrl = candidates[extIdx];

  return (
    <img
      src={currentUrl}
      alt={alt}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
      {...rest}
      onLoad={function (e) {
        // Success! Cache the working URL
        _resolved[cacheKey] = currentUrl;
        if (externalOnLoad) externalOnLoad(e);
      }}
      onError={function (e) {
        var nextIdx = extIdx + 1;
        if (nextIdx < candidates.length) {
          setExtIdx(nextIdx);
        } else {
          // All extensions failed
          _resolved[cacheKey] = null;
          setAllFailed(true);
        }
        if (externalOnError) externalOnError(e);
      }}
    />
  );
}

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
