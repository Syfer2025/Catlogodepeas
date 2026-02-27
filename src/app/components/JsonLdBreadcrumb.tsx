import { useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════
// JSON-LD BreadcrumbList — injects Schema.org BreadcrumbList structured
// data into <head> for Google rich results (breadcrumb trails in SERPs).
// ═══════════════════════════════════════════════════════════════════════

export interface BreadcrumbItem {
  name: string;
  url?: string;
}

interface Props {
  items: BreadcrumbItem[];
}

export function JsonLdBreadcrumb({ items }: Props) {
  useEffect(function () {
    if (!items || items.length === 0) return;

    var origin = window.location.origin;
    var listItems = items.map(function (item, idx) {
      return {
        "@type": "ListItem",
        "position": idx + 1,
        "name": item.name,
        "item": item.url ? (item.url.startsWith("http") ? item.url : origin + item.url) : undefined,
      };
    });

    var jsonLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": listItems,
    };

    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.setAttribute("data-breadcrumb-jsonld", "true");
    script.textContent = JSON.stringify(jsonLd);
    document.head.appendChild(script);

    return function () {
      var el = document.querySelector('script[data-breadcrumb-jsonld="true"]');
      if (el) el.remove();
    };
  }, [items]);

  return null;
}
