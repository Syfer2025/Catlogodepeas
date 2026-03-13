src/app/components/AddToCartButton.tsx:135:9 - error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.

135         imageUrl: getResolvedProductImageUrl(sku),
            ~~~~~~~~

  src/app/contexts/CartContext.tsx:8:3
    8   imageUrl: string;
        ~~~~~~~~
    The expected type comes from property 'imageUrl' which is declared here on type 'Omit<CartItem, "quantidade"> & { quantidade?: number | undefined; }'

src/app/components/AddToCartButton.tsx:156:9 - error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.

156         imageUrl: getResolvedProductImageUrl(sku),
            ~~~~~~~~

  src/app/contexts/CartContext.tsx:8:3
    8   imageUrl: string;
        ~~~~~~~~
    The expected type comes from property 'imageUrl' which is declared here on type 'Omit<CartItem, "quantidade"> & { quantidade?: number | undefined; }'

src/app/components/CategoryMegaMenu.tsx:457:17 - error TS2353: Object literal may only specify known properties, and 'WebkitColumnBreakInside' does not exist in type 'Properties<string | number, string & {}>'.

457                 WebkitColumnBreakInside: "avoid",
                    ~~~~~~~~~~~~~~~~~~~~~~~

  node_modules/@types/react/index.d.ts:2808:9
    2808         style?: CSSProperties | undefined;
                 ~~~~~
    The expected type comes from property 'style' which is declared here on type 'DetailedHTMLProps<HTMLAttributes<HTMLDivElement>, HTMLDivElement>'

src/app/components/GlobalErrorCollector.tsx:105:19 - error TS2367: This comparison appears to be unintentional because the types 'HTMLElement' and 'Window & typeof globalThis' have no overlap.

105     if (target && target !== window && (target as any).tagName) {
                      ~~~~~~~~~~~~~~~~~

src/app/components/ProductReviews.tsx:660:36 - error TS18047: 'summary' is possibly 'null'.

660                             count={summary.distribution[s] || 0}
                                       ~~~~~~~

src/app/pages/admin/AdminApiSige.tsx:36:31 - error TS2307: Cannot find module '/utils/supabase/info' or its corresponding type declarations.

36 import { publicAnonKey } from "/utils/supabase/info";
                                 ~~~~~~~~~~~~~~~~~~~~~~

src/app/pages/admin/adminAuth.ts:10:27 - error TS2307: Cannot find module '/utils/supabase/info' or its corresponding type declarations.

10 import { projectId } from "/utils/supabase/info";
                             ~~~~~~~~~~~~~~~~~~~~~~

src/app/pages/admin/AdminFooterBadges.tsx:62:46 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

62       var result = await api.getFooterBadges(token);
                                                ~~~~~

src/app/pages/admin/AdminFooterBadges.tsx:120:48 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

120       await api.saveFooterBadge(key, formData, token);
                                                   ~~~~~

src/app/pages/admin/AdminFooterBadges.tsx:137:40 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

137       await api.deleteFooterBadge(key, token);
                                           ~~~~~

src/app/pages/admin/AdminMidBanners.tsx:48:44 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

48       var result = await api.getMidBanners(token);
                                              ~~~~~

src/app/pages/admin/AdminMidBanners.tsx:111:54 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

111       await api.saveMidBanner(slotIdx + 1, formData, token);
                                                         ~~~~~

src/app/pages/admin/AdminMidBanners.tsx:128:46 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'.
  Type 'null' is not assignable to type 'string'.

128       await api.deleteMidBanner(slotIdx + 1, token);
                                                 ~~~~~

src/app/pages/admin/AdminPage.tsx:244:16 - error TS2339: Property 'affiliates' does not exist on type 'AdminPendingCounts'.

244       if (data.affiliates && data.affiliates > 0) counts["affiliates"] = data.affiliates;
                   ~~~~~~~~~~

src/app/pages/admin/AdminPage.tsx:244:35 - error TS2339: Property 'affiliates' does not exist on type 'AdminPendingCounts'.

244       if (data.affiliates && data.affiliates > 0) counts["affiliates"] = data.affiliates;
                                      ~~~~~~~~~~

src/app/pages/admin/AdminPage.tsx:244:79 - error TS2339: Property 'affiliates' does not exist on type 'AdminPendingCounts'.

244       if (data.affiliates && data.affiliates > 0) counts["affiliates"] = data.affiliates;
                                                                                  ~~~~~~~~~~

src/app/pages/admin/AdminReviews.tsx:709:28 - error TS18047: 'selectedReview' is possibly 'null'.

709             handleModerate(selectedReview.id, action, note, imageActions);
                               ~~~~~~~~~~~~~~

src/app/pages/admin/AdminReviews.tsx:711:48 - error TS18047: 'selectedReview' is possibly 'null'.

711           onDelete={function () { handleDelete(selectedReview.id); }}
                                                   ~~~~~~~~~~~~~~

src/app/pages/admin/AdminSafrapay.tsx:38:42 - error TS2307: Cannot find module '/utils/supabase/info' or its corresponding type declarations.

38 import { projectId, publicAnonKey } from "/utils/supabase/info";
                                            ~~~~~~~~~~~~~~~~~~~~~~

src/app/pages/admin/AdminSettings.tsx:1435:31 - error TS2339: Property 'message' does not exist on type '{ ok: boolean; cleared: number; }'.

1435       setCacheClearMsg(result.message || `${result.cleared} caches removidos.`);
                                   ~~~~~~~

src/app/pages/BrandPage.tsx:41:28 - error TS2551: Property 'getProductDetail' does not exist on type 'typeof import("/Users/alexmeiradossantos/Documents/Cata\u0301logo de Pec\u0327as last v/src/app/services/api")'. Did you mean 'getProductDetailInit'?

41                 return api.getProductDetail(sku)
                              ~~~~~~~~~~~~~~~~

  src/app/services/api.ts:1710:14
    1710 export const getProductDetailInit = (sku: string, options?: { signal?: AbortSignal }) =>
                      ~~~~~~~~~~~~~~~~~~~~
    'getProductDetailInit' is declared here.

src/app/pages/BrandPage.tsx:42:35 - error TS7006: Parameter 'detail' implicitly has an 'any' type.

42                   .then(function (detail) {
                                     ~~~~~~

src/app/pages/CatalogPage.tsx:199:40 - error TS2367: This comparison appears to be unintentional because the types '"outOfStock" | "inStock"' and '"all"' have no overlap.

199         if (!bal || !bal.found) return stockFilter === "all";
                                           ~~~~~~~~~~~~~~~~~~~~~

src/app/pages/CatalogPage.tsx:300:15 - error TS2769: No overload matches this call.
  Overload 1 of 2, '(...items: ConcatArray<{ name: string; url: string; }>[]): { name: string; url: string; }[]', gave the following error.
    Argument of type '{ name: string; url: undefined; }[]' is not assignable to parameter of type 'ConcatArray<{ name: string; url: string; }>'.
      The types returned by 'slice(...)' are incompatible between these types.
        Type '{ name: string; url: undefined; }[]' is not assignable to type '{ name: string; url: string; }[]'.
          Type '{ name: string; url: undefined; }' is not assignable to type '{ name: string; url: string; }'.
            Types of property 'url' are incompatible.
              Type 'undefined' is not assignable to type 'string'.
  Overload 2 of 2, '(...items: ({ name: string; url: string; } | ConcatArray<{ name: string; url: string; }>)[]): { name: string; url: string; }[]', gave the following error.
    Argument of type '{ name: string; url: undefined; }[]' is not assignable to parameter of type '{ name: string; url: string; } | ConcatArray<{ name: string; url: string; }>'.
      Type '{ name: string; url: undefined; }[]' is not assignable to type 'ConcatArray<{ name: string; url: string; }>'.
        The types returned by 'slice(...)' are incompatible between these types.
          Type '{ name: string; url: undefined; }[]' is not assignable to type '{ name: string; url: string; }[]'.
            Type '{ name: string; url: undefined; }' is not assignable to type '{ name: string; url: string; }'.
              Types of property 'url' are incompatible.
                Type 'undefined' is not assignable to type 'string'.

300               categoryBreadcrumb.map(function (crumb, idx) {
                  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
301                 return { name: crumb, url: idx === categoryBreadcrumb.length - 1 ? undefined : undefined };
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
302               })
    ~~~~~~~~~~~~~~~~


src/app/pages/CheckoutPage.tsx:1461:55 - error TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string | undefined'.
  Type 'null' is not assignable to type 'string | undefined'.

1461                     startPolling(txId, paymentMethod, orderId, accessToken || undefined);
                                                           ~~~~~~~

src/app/pages/ProductDetailPage.tsx:1083:130 - error TS18047: 'product' is possibly 'null'.

1083                 href={`https://wa.me/5544997330202?text=${encodeURIComponent(`Olá! Gostaria de informações sobre a peça:\n\n📦 ${product.titulo}\n🔖 SKU: ${product.sku}\n\n${window.location.href}`)}`}
                                                                                                                                      ~~~~~~~

src/app/pages/ProductDetailPage.tsx:1083:157 - error TS18047: 'product' is possibly 'null'.

1083                 href={`https://wa.me/5544997330202?text=${encodeURIComponent(`Olá! Gostaria de informações sobre a peça:\n\n📦 ${product.titulo}\n🔖 SKU: ${product.sku}\n\n${window.location.href}`)}`}
                                                                                                                                                                 ~~~~~~~

src/app/services/api.ts:1:42 - error TS2307: Cannot find module '/utils/supabase/info' or its corresponding type declarations.

1 import { projectId, publicAnonKey } from "/utils/supabase/info";
                                           ~~~~~~~~~~~~~~~~~~~~~~

src/app/services/api.ts:2626:12 - error TS2352: Conversion of type '{ sku: string; found: false; source: "error"; price: null; v1: null; v2: null; v3: null; tier: string; showPrice: true; }' to type 'ProductPrice' may be a mistake because neither type sufficiently overlaps with the other. If this was intentional, convert the expression to 'unknown' first.
  Types of property 'source' are incompatible.
    Type '"error"' is not comparable to type '"sige" | "custom" | "none"'.

2626     return { sku: sku, found: false, source: "error", price: null, v1: null, v2: null, v3: null, tier: "v2", showPrice: true } as ProductPrice;
                ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

src/app/services/supabaseClient.ts:2:42 - error TS2307: Cannot find module '/utils/supabase/info' or its corresponding type declarations.

2 import { projectId, publicAnonKey } from "/utils/supabase/info";
                                           ~~~~~~~~~~~~~~~~~~~~~~

src/main.tsx:3:19 - error TS5097: An import path can only end with a '.tsx' extension when 'allowImportingTsExtensions' is enabled.

3   import App from "./app/App.tsx";
                    ~~~~~~~~~~~~~~~


Found 31 errors in 19 files.

Errors  Files
     2  src/app/components/AddToCartButton.tsx:135
     1  src/app/components/CategoryMegaMenu.tsx:457
     1  src/app/components/GlobalErrorCollector.tsx:105
     1  src/app/components/ProductReviews.tsx:660
     1  src/app/pages/admin/AdminApiSige.tsx:36
     1  src/app/pages/admin/adminAuth.ts:10
     3  src/app/pages/admin/AdminFooterBadges.tsx:62
     3  src/app/pages/admin/AdminMidBanners.tsx:48
     3  src/app/pages/admin/AdminPage.tsx:244
     2  src/app/pages/admin/AdminReviews.tsx:709
     1  src/app/pages/admin/AdminSafrapay.tsx:38
     1  src/app/pages/admin/AdminSettings.tsx:1435
     2  src/app/pages/BrandPage.tsx:41
     2  src/app/pages/CatalogPage.tsx:199
     1  src/app/pages/CheckoutPage.tsx:1461
     2  src/app/pages/ProductDetailPage.tsx:1083
     2  src/app/services/api.ts:1
     1  src/app/services/supabaseClient.ts:2
     1  src/main.tsx:3
alexmeiradossantos@MacBook-Air-de-Maria Catálogo de Peças last v % 
