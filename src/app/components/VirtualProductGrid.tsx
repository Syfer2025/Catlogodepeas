import { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "./ProductCard";
import type { ProdutoItem } from "./ProductCard";
import type { ProductBalance, ProductPrice } from "../services/api";
import { ProductCardSkeleton } from "./ProductCardSkeleton";

interface VirtualProductGridProps {
  products: ProdutoItem[];
  balanceMap: Record<string, ProductBalance>;
  priceMap: Record<string, ProductPrice>;
  /** Review summaries map */
  reviewMap?: Record<string, { averageRating: number; totalReviews: number }>;
  /**
   * Grid columns CSS class.
   * Default: "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"
   */
  gridClass?: string;
}

/**
 * VirtualProductGrid — Renders a product grid with native virtualization.
 *
 * Uses IntersectionObserver + content-visibility to:
 * - Only mount ProductCard components that are near the viewport
 * - Skip rendering (and API calls for images/prices) for off-screen cards
 * - Maintain correct scroll position and grid layout
 *
 * For < 16 items, renders all cards immediately (no overhead).
 * For 16+ items, virtualizes with a 600px rootMargin buffer.
 */
export function VirtualProductGrid({
  products,
  balanceMap,
  priceMap,
  reviewMap,
  gridClass,
}: VirtualProductGridProps) {
  var cols = gridClass || "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

  // For small lists, skip virtualization entirely
  if (products.length < 16) {
    return (
      <div className={"grid gap-3 sm:gap-5 " + cols}>
        {products.map(function (produto) {
          return (
            <ProductCard
              key={produto.sku}
              product={produto}
              balance={balanceMap[produto.sku]}
              preloadedPrice={priceMap[produto.sku]}
              reviewSummary={reviewMap ? reviewMap[produto.sku] || null : null}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={"grid gap-3 sm:gap-5 " + cols}>
      {products.map(function (produto) {
        return (
          <VirtualCard
            key={produto.sku}
            product={produto}
            balance={balanceMap[produto.sku]}
            priceData={priceMap[produto.sku]}
            reviewSummary={reviewMap ? reviewMap[produto.sku] || null : null}
          />
        );
      })}
    </div>
  );
}

/**
 * VirtualCard — Wrapper that defers rendering until the element
 * is within 600px of the viewport (rootMargin). Uses native
 * content-visibility for browser-level render skipping, plus
 * IntersectionObserver for React-level lazy mounting.
 */
function VirtualCard({
  product,
  balance,
  priceData,
  reviewSummary,
}: {
  product: ProdutoItem;
  balance?: ProductBalance;
  priceData?: ProductPrice;
  reviewSummary?: { averageRating: number; totalReviews: number } | null;
}) {
  var ref = useRef<HTMLDivElement>(null);
  var [isNear, setIsNear] = useState(false);
  var [wasVisible, setWasVisible] = useState(false);

  useEffect(function () {
    var el = ref.current;
    if (!el) return;

    // If IntersectionObserver not supported, render immediately
    if (typeof IntersectionObserver === "undefined") {
      setIsNear(true);
      setWasVisible(true);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (entries[i].isIntersecting) {
            setIsNear(true);
            setWasVisible(true);
            // Once visible, keep it rendered (don't unmount on scroll away)
            observer.disconnect();
          }
        }
      },
      {
        // Start rendering when card is within 600px of viewport
        rootMargin: "600px 0px 600px 0px",
        threshold: 0,
      }
    );

    observer.observe(el);
    return function () { observer.disconnect(); };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        // Native browser virtualization — skips layout/paint for off-screen
        contentVisibility: "auto" as any,
        // Approximate card height for layout stability (prevents CLS)
        containIntrinsicSize: "auto 420px",
      }}
    >
      {wasVisible ? (
        <ProductCard
          product={product}
          balance={balance}
          preloadedPrice={priceData}
          reviewSummary={reviewSummary}
        />
      ) : (
        <ProductCardSkeleton />
      )}
    </div>
  );
}