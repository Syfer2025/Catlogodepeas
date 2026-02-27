/**
 * ProductCardSkeleton — pulsing placeholder that matches the exact
 * layout of <ProductCard> to prevent CLS during loading.
 */
export function ProductCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden flex flex-col animate-pulse">
      {/* Image placeholder */}
      <div className="aspect-square bg-gray-100 flex items-center justify-center">
        <svg
          className="w-10 h-10 sm:w-14 sm:h-14 text-gray-200"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
          />
        </svg>
      </div>

      {/* Info section */}
      <div className="p-2.5 sm:p-4 flex flex-col flex-1 border-t border-gray-100">
        {/* Title placeholder — 2 lines */}
        <div className="mb-1.5 sm:mb-3 flex-1 space-y-1.5">
          <div className="h-3.5 bg-gray-100 rounded w-full" />
          <div className="h-3.5 bg-gray-100 rounded w-3/4" />
        </div>

        {/* Price placeholder */}
        <div className="mb-1.5 sm:mb-3">
          <div className="h-5 bg-gray-100 rounded w-24" />
        </div>

        {/* Stock bar placeholder */}
        <div className="hidden sm:block mb-1.5">
          <div className="h-1.5 bg-gray-100 rounded-full w-full" />
        </div>

        {/* SKU + stock placeholder */}
        <div className="flex items-center justify-between gap-1 pt-1.5 sm:pt-2.5 border-t border-gray-100">
          <div className="h-3 bg-gray-100 rounded w-20" />
          <div className="h-5 bg-gray-100 rounded-full w-16" />
        </div>

        {/* CTA button placeholder */}
        <div className="mt-2 sm:mt-3">
          <div className="h-8 sm:h-10 bg-gray-100 rounded-lg w-full" />
        </div>
      </div>
    </div>
  );
}

interface ProductCardSkeletonGridProps {
  count?: number;
  /** Grid columns class — defaults to home page grid */
  gridClass?: string;
}

/**
 * Renders a grid of skeleton cards.
 * Use this to replace loading spinners in product listing pages.
 */
export function ProductCardSkeletonGrid({ count = 10, gridClass }: ProductCardSkeletonGridProps) {
  var cols = gridClass || "grid-cols-2 sm:grid-cols-2 lg:grid-cols-5";
  var items: number[] = [];
  for (var i = 0; i < count; i++) items.push(i);
  return (
    <div className={"grid gap-3 sm:gap-5 " + cols}>
      {items.map(function (i) {
        return <ProductCardSkeleton key={i} />;
      })}
    </div>
  );
}
