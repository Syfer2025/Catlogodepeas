import { useEffect } from "react";

/**
 * useDocumentMeta — Sets dynamic document title and meta tags.
 * Restores original title on unmount.
 *
 * Usage:
 *   useDocumentMeta({
 *     title: "Produto XYZ - Carretao Auto Pecas",
 *     description: "Compre Produto XYZ com desconto...",
 *     ogTitle: "Produto XYZ",
 *   });
 */

const BASE_TITLE = "Carretao Auto Pecas - Pecas para Caminhoes";

interface MetaOptions {
  title?: string;
  description?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageWidth?: string;
  ogImageHeight?: string;
  ogImageAlt?: string;
  ogUrl?: string;
  ogType?: string;
  canonical?: string;
  /** Product-specific: price amount in BRL */
  productPrice?: string;
  /** Product-specific: currency (default BRL) */
  productCurrency?: string;
  /** JSON-LD structured data (stringified) */
  jsonLd?: string;
}

function setMeta(name: string, content: string, isProperty?: boolean) {
  var attr = isProperty ? "property" : "name";
  var selector = (isProperty ? 'meta[property="' : 'meta[name="') + name + '"]';
  var el = document.querySelector(selector) as HTMLMetaElement | null;
  if (el) {
    el.content = content;
  } else {
    var meta = document.createElement("meta");
    meta.setAttribute(attr, name);
    meta.content = content;
    document.head.appendChild(meta);
  }
}

function setCanonical(url: string) {
  var el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (el) {
    el.href = url;
  } else {
    var link = document.createElement("link");
    link.rel = "canonical";
    link.href = url;
    document.head.appendChild(link);
  }
}

function removeCanonical() {
  var el = document.querySelector('link[rel="canonical"]');
  if (el) el.remove();
}

export function useDocumentMeta(opts: MetaOptions) {
  useEffect(function () {
    // Save originals
    var prevTitle = document.title;
    var descEl = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    var prevDesc = descEl ? descEl.content : "";
    var ogTitleEl = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
    var prevOgTitle = ogTitleEl ? ogTitleEl.content : "";
    var ogDescEl = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
    var prevOgDesc = ogDescEl ? ogDescEl.content : "";
    var ogImgEl = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
    var prevOgImg = ogImgEl ? ogImgEl.content : "";
    var ogUrlEl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    var prevOgUrl = ogUrlEl ? ogUrlEl.content : "";
    var ogTypeEl = document.querySelector('meta[property="og:type"]') as HTMLMetaElement | null;
    var prevOgType = ogTypeEl ? ogTypeEl.content : "";
    var twCardEl = document.querySelector('meta[name="twitter:card"]') as HTMLMetaElement | null;
    var prevTwCard = twCardEl ? twCardEl.content : "";
    var twTitleEl = document.querySelector('meta[name="twitter:title"]') as HTMLMetaElement | null;
    var prevTwTitle = twTitleEl ? twTitleEl.content : "";
    var twDescEl = document.querySelector('meta[name="twitter:description"]') as HTMLMetaElement | null;
    var prevTwDesc = twDescEl ? twDescEl.content : "";
    var twImgEl = document.querySelector('meta[name="twitter:image"]') as HTMLMetaElement | null;
    var prevTwImg = twImgEl ? twImgEl.content : "";
    var hadCanonical = !!document.querySelector('link[rel="canonical"]');
    var prevCanonical = "";
    if (hadCanonical) {
      prevCanonical = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement).href;
    }

    // Apply
    if (opts.title) {
      document.title = opts.title;
    }
    if (opts.description) {
      setMeta("description", opts.description);
    }
    if (opts.ogTitle) {
      setMeta("og:title", opts.ogTitle, true);
    }
    if (opts.ogDescription) {
      setMeta("og:description", opts.ogDescription, true);
    }
    if (opts.ogImage) {
      setMeta("og:image", opts.ogImage, true);
    }
    if (opts.ogImageWidth) {
      setMeta("og:image:width", opts.ogImageWidth, true);
    }
    if (opts.ogImageHeight) {
      setMeta("og:image:height", opts.ogImageHeight, true);
    }
    if (opts.ogImageAlt) {
      setMeta("og:image:alt", opts.ogImageAlt, true);
    }
    if (opts.ogUrl) {
      setMeta("og:url", opts.ogUrl, true);
    }
    if (opts.ogType) {
      setMeta("og:type", opts.ogType, true);
    }
    if (opts.canonical) {
      setCanonical(opts.canonical);
    }

    // Twitter Card tags (derived from OG if not already set)
    if (opts.ogTitle || opts.ogImage) {
      setMeta("twitter:card", opts.ogImage ? "summary_large_image" : "summary");
    }
    if (opts.ogTitle) {
      setMeta("twitter:title", opts.ogTitle);
    }
    if (opts.ogDescription) {
      setMeta("twitter:description", opts.ogDescription);
    }
    if (opts.ogImage) {
      setMeta("twitter:image", opts.ogImage);
    }

    // Cleanup — restore originals
    return function () {
      document.title = prevTitle || BASE_TITLE;
      if (opts.description && prevDesc) setMeta("description", prevDesc);
      if (opts.ogTitle && prevOgTitle) setMeta("og:title", prevOgTitle, true);
      if (opts.ogDescription && prevOgDesc) setMeta("og:description", prevOgDesc, true);
      if (opts.ogImage) {
        if (prevOgImg) {
          setMeta("og:image", prevOgImg, true);
        } else {
          var el = document.querySelector('meta[property="og:image"]');
          if (el) el.remove();
        }
      }
      // Cleanup og:image sub-properties
      if (opts.ogImageWidth) {
        var eiw = document.querySelector('meta[property="og:image:width"]');
        if (eiw) eiw.remove();
      }
      if (opts.ogImageHeight) {
        var eih = document.querySelector('meta[property="og:image:height"]');
        if (eih) eih.remove();
      }
      if (opts.ogImageAlt) {
        var eia = document.querySelector('meta[property="og:image:alt"]');
        if (eia) eia.remove();
      }
      if (opts.ogUrl) {
        if (prevOgUrl) {
          setMeta("og:url", prevOgUrl, true);
        } else {
          var el2 = document.querySelector('meta[property="og:url"]');
          if (el2) el2.remove();
        }
      }
      if (opts.ogType) {
        if (prevOgType) {
          setMeta("og:type", prevOgType, true);
        } else {
          var el3 = document.querySelector('meta[property="og:type"]');
          if (el3) el3.remove();
        }
      }
      // Restore Twitter cards
      if (opts.ogTitle || opts.ogImage) {
        if (prevTwCard) { setMeta("twitter:card", prevTwCard); } else { var t1 = document.querySelector('meta[name="twitter:card"]'); if (t1) t1.remove(); }
      }
      if (opts.ogTitle) {
        if (prevTwTitle) { setMeta("twitter:title", prevTwTitle); } else { var t2 = document.querySelector('meta[name="twitter:title"]'); if (t2) t2.remove(); }
      }
      if (opts.ogDescription) {
        if (prevTwDesc) { setMeta("twitter:description", prevTwDesc); } else { var t3 = document.querySelector('meta[name="twitter:description"]'); if (t3) t3.remove(); }
      }
      if (opts.ogImage) {
        if (prevTwImg) { setMeta("twitter:image", prevTwImg); } else { var t4 = document.querySelector('meta[name="twitter:image"]'); if (t4) t4.remove(); }
      }
      if (opts.canonical) {
        if (hadCanonical && prevCanonical) {
          setCanonical(prevCanonical);
        } else {
          removeCanonical();
        }
      }
    };
  }, [opts.title, opts.description, opts.ogTitle, opts.ogDescription, opts.ogImage, opts.ogImageWidth, opts.ogImageHeight, opts.ogImageAlt, opts.ogUrl, opts.ogType, opts.canonical]);

  // ── JSON-LD Structured Data ──
  useEffect(function () {
    if (!opts.jsonLd) return;
    var script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = opts.jsonLd;
    script.setAttribute("data-meta-jsonld", "true");
    document.head.appendChild(script);
    return function () {
      var el = document.querySelector('script[data-meta-jsonld="true"]');
      if (el) el.remove();
    };
  }, [opts.jsonLd]);

  // ── Product price meta (og:product) ──
  useEffect(function () {
    if (!opts.productPrice) return;
    setMeta("product:price:amount", opts.productPrice, true);
    setMeta("product:price:currency", opts.productCurrency || "BRL", true);
    return function () {
      var p1 = document.querySelector('meta[property="product:price:amount"]');
      if (p1) p1.remove();
      var p2 = document.querySelector('meta[property="product:price:currency"]');
      if (p2) p2.remove();
    };
  }, [opts.productPrice, opts.productCurrency]);
}