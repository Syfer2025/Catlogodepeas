import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Phone,
  Mail,
  Clock,
  MessageCircle,
  ExternalLink,
  ArrowUpRight,
  Cookie,
} from "lucide-react";
import { useHomepageInit } from "../contexts/HomepageInitContext";
import type { FooterBadge } from "../services/api";

var FOOTER_LOGO_CACHE_KEY = "carretao_footer_logo_url";

var UNIDADES = [
  { nome: "Matriz / Televendas", tel: "0800 643 1170", href: "tel:08006431170" },
  { nome: "Maringá-PR", tel: "(44) 3123-3000", href: "tel:+554431233000" },
  { nome: "Curitiba-PR", tel: "(41) 3123-8900", href: "tel:+554131238900" },
  { nome: "Itajaí-SC", tel: "(47) 3248-2100", href: "tel:+554732482100" },
  { nome: "Sinop-MT (Loja 1)", tel: "(66) 3515-5115", href: "tel:+556635155115" },
  { nome: "Sinop-MT (Loja 2)", tel: "(66) 99673-6133", href: "tel:+5566996736133" },
  { nome: "Matupá-MT", tel: "(66) 99201-7474", href: "tel:+5566992017474" },
  { nome: "Várzea Grande-MT", tel: "(65) 2193-8550", href: "tel:+556521938550" },
];

var QUICK_LINKS = [
  { label: "Catálogo Completo", path: "/catalogo" },
  { label: "Fale Conosco", path: "/contato" },
  { label: "Programa de Afiliados", path: "/afiliados" },
  { label: "Política de Privacidade", path: "/politica-de-privacidade" },
  { label: "Termos de Uso", path: "/termos-de-uso" },
  { label: "Exercício de Direitos (LGPD)", path: "/exercicio-de-direitos" },
  { label: "Nossas Filiais", path: "/sobre" },
];

export function Footer() {
  var [footerLogoUrl, setFooterLogoUrl] = useState<string | null>(function () {
    try { return localStorage.getItem(FOOTER_LOGO_CACHE_KEY); } catch { return null; }
  });
  var [footerLogoLoading, setFooterLogoLoading] = useState(true);
  var { data: initData, loading: initLoading } = useHomepageInit();

  useEffect(function () {
    if (initLoading) return;
    if (initData && initData.footerLogo) {
      if (initData.footerLogo.hasLogo && initData.footerLogo.url) {
        setFooterLogoUrl(initData.footerLogo.url);
        try { localStorage.setItem(FOOTER_LOGO_CACHE_KEY, initData.footerLogo.url); } catch {}
      } else {
        setFooterLogoUrl(null);
        try { localStorage.removeItem(FOOTER_LOGO_CACHE_KEY); } catch {}
      }
    }
    setFooterLogoLoading(false);
  }, [initData, initLoading]);

  var badges: FooterBadge[] = (initData && initData.footerBadges) ? initData.footerBadges : [];
  var payBadges = badges.filter(function (b) { return b.category === "payment" && b.active && b.imageUrl; });
  var shipBadges = badges.filter(function (b) { return b.category === "shipping" && b.active && b.imageUrl; });
  var raBadge = badges.find(function (b) { return b.category === "reclameaqui" && b.active && b.imageUrl; });

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

      {/* ═══════════ PARTE SUPERIOR — Contato, Links, Unidades ═══════════ */}
      <div className="max-w-7xl mx-auto px-4 pt-10 pb-8 lg:pt-12 lg:pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-6">

          {/* Col 1 — Contato + WhatsApp */}
          <div className="lg:col-span-4">
            <h3 className="text-white mb-4 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <span className="w-5 h-0.5 bg-red-600 rounded-full" />
              Fale Conosco
            </h3>
            <p className="text-gray-400 mb-4 leading-relaxed" style={{ fontSize: "0.84rem" }}>
              Especialistas em peças para caminhões. Qualidade, garantia e entrega rápida para todo o Brasil.
            </p>

            <ul className="space-y-2.5 mb-5">
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Mail className="w-3.5 h-3.5 text-red-500" />
                </div>
                <a href="mailto:rh@autopecascarretao.com.br" className="hover:text-white transition-colors" style={{ fontSize: "0.84rem" }}>
                  rh@autopecascarretao.com.br
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Phone className="w-3.5 h-3.5 text-red-500" />
                </div>
                <a href="tel:08006431170" className="hover:text-white transition-colors" style={{ fontSize: "0.84rem" }}>
                  0800 643 1170
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-red-500" />
                </div>
                <span style={{ fontSize: "0.84rem" }}>Seg-Sex 8h-18h &middot; Sab 8h-13h</span>
              </li>
            </ul>

            {/* WhatsApp */}
            <a
              href="https://wa.me/5544997330202"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-green-900/30 hover:bg-green-900/50 border border-green-800/40 hover:border-green-700/50 rounded-xl px-4 py-2.5 transition-all group"
            >
              <div className="bg-green-500 rounded-full p-2 shrink-0 group-hover:scale-105 transition-transform">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-green-400" style={{ fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  WhatsApp
                </p>
                <p className="text-white" style={{ fontSize: "0.92rem", fontWeight: 700 }}>
                  (44) 99733-0202
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-green-600 group-hover:text-green-400 ml-auto transition-colors" />
            </a>
          </div>

          {/* Col 2 — Links Rapidos */}
          <div className="lg:col-span-2">
            <h3 className="text-white mb-4 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <span className="w-5 h-0.5 bg-red-600 rounded-full" />
              Links Rapidos
            </h3>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map(function (item) {
                return (
                  <li key={item.label}>
                    <Link
                      to={item.path}
                      className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 group"
                      style={{ fontSize: "0.84rem" }}
                    >
                      <ArrowUpRight className="w-3 h-3 text-gray-600 group-hover:text-red-500 transition-colors" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Col 3 — Nossas Unidades (2 colunas) */}
          <div className="lg:col-span-6">
            <h3 className="text-white mb-4 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <span className="w-5 h-0.5 bg-red-600 rounded-full" />
              Nossas Unidades
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {UNIDADES.map(function (u, i) {
                return (
                  <a key={i} href={u.href} className="group block">
                    <span className="text-gray-400 group-hover:text-gray-200 block transition-colors" style={{ fontSize: "0.78rem" }}>
                      {u.nome}
                    </span>
                    <span className="text-gray-300 group-hover:text-white font-mono transition-colors" style={{ fontSize: "0.84rem", fontWeight: 600 }}>
                      {u.tel}
                    </span>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ SELOS — Logo + Pagamento + Frete + Reputacao ═══════════ */}
      <div className="border-t border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-row items-center justify-center gap-6 sm:gap-10 flex-wrap">

            {/* Logo Carretao */}
            {footerLogoUrl ? (
              <div className="shrink-0">
                <img
                  src={footerLogoUrl}
                  alt="Carretão Auto Peças"
                  className="h-14 w-auto max-w-[200px] object-contain opacity-80 hover:opacity-100 transition-opacity"
                  onError={function () {
                    setFooterLogoUrl(null);
                    try { localStorage.removeItem(FOOTER_LOGO_CACHE_KEY); } catch {}
                  }}
                  loading="lazy"
                  decoding="async"
                  width={200}
                  height={56}
                />
              </div>
            ) : footerLogoLoading ? (
              <div className="h-14 w-[140px] bg-gray-800 rounded-lg animate-pulse shrink-0" />
            ) : null}

            {/* Divider vertical (visible on sm+) */}
            {(footerLogoUrl || footerLogoLoading) && (payBadges.length > 0 || shipBadges.length > 0 || raBadge) && (
              <div className="hidden sm:block w-px h-10 bg-gray-700/50" />
            )}

            {/* Payment */}
            {payBadges.length > 0 && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-gray-500" style={{ fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Formas de Pagamento
                </span>
                <div className="flex items-center gap-2.5 flex-wrap justify-center">
                  {payBadges.map(function (badge) {
                    var img = (
                      <img
                        key={badge.key}
                        src={badge.imageUrl!}
                        alt={badge.alt || "Pagamento"}
                        className="h-7 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                        loading="lazy"
                        decoding="async"
                      />
                    );
                    if (badge.link) {
                      var isExt = badge.link.indexOf("http") === 0;
                      if (isExt) {
                        return (
                          <a key={badge.key} href={badge.link} target="_blank" rel="noopener noreferrer">
                            {img}
                          </a>
                        );
                      }
                      return <Link key={badge.key} to={badge.link}>{img}</Link>;
                    }
                    return img;
                  })}
                </div>
              </div>
            )}

            {/* Divider */}
            {payBadges.length > 0 && (shipBadges.length > 0 || raBadge) && (
              <div className="hidden sm:block w-px h-10 bg-gray-700/50" />
            )}

            {/* Shipping */}
            {shipBadges.length > 0 && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-gray-500" style={{ fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Envio e Frete
                </span>
                <div className="flex items-center gap-2.5 flex-wrap justify-center">
                  {shipBadges.map(function (badge) {
                    var img = (
                      <img
                        key={badge.key}
                        src={badge.imageUrl!}
                        alt={badge.alt || "Frete"}
                        className="h-7 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                        loading="lazy"
                        decoding="async"
                      />
                    );
                    if (badge.link) {
                      var isExt = badge.link.indexOf("http") === 0;
                      if (isExt) {
                        return (
                          <a key={badge.key} href={badge.link} target="_blank" rel="noopener noreferrer">
                            {img}
                          </a>
                        );
                      }
                      return <Link key={badge.key} to={badge.link}>{img}</Link>;
                    }
                    return img;
                  })}
                </div>
              </div>
            )}

            {/* Divider */}
            {shipBadges.length > 0 && raBadge && (
              <div className="hidden sm:block w-px h-10 bg-gray-700/50" />
            )}

            {/* Reclame Aqui */}
            {raBadge && (
              <div className="flex flex-col items-center gap-1.5">
                <span className="text-gray-500" style={{ fontSize: "0.62rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Reputacao
                </span>
                {raBadge.link ? (
                  <a href={raBadge.link} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90 transition-opacity">
                    <img
                      src={raBadge.imageUrl!}
                      alt={raBadge.alt || "Reclame Aqui"}
                      className="h-9 w-auto object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </a>
                ) : (
                  <img
                    src={raBadge.imageUrl!}
                    alt={raBadge.alt || "Reclame Aqui"}
                    className="h-9 w-auto object-contain"
                    loading="lazy"
                    decoding="async"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ BOTTOM BAR — Copyright + Cookies ═══════════ */}
      <div className="border-t border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col items-center gap-2 text-center">
          <p className="text-gray-400" style={{ fontSize: "0.78rem" }}>
            {/* © link to admin — desktop only */}
            <Link
              to="/admin"
              className="hidden md:inline-block hover:text-red-400 transition-colors cursor-pointer"
              style={{ textDecoration: "none", color: "inherit" }}
              aria-label="Painel administrativo"
              title=""
            >&copy;</Link>
            <span className="md:hidden">&copy;</span>{" "}
            2026 Carretão Auto Peças. Todos os direitos reservados.
            <span className="mx-2 text-gray-600">|</span>
            <a
              href="https://wa.me/5544998492172"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-red-400 transition-colors"
              style={{ textDecoration: "none" }}
            >
              Site desenvolvido por Alex Meira
            </a>
          </p>
          <button
            onClick={function () {
              try {
                localStorage.removeItem("lgpd_cookie_consent");
                localStorage.removeItem("lgpd_consent_date");
              } catch {}
              window.location.reload();
            }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-amber-400 transition-colors cursor-pointer"
            style={{ fontSize: "0.73rem" }}
            aria-label="Configurar preferências de cookies"
          >
            <Cookie className="w-3 h-3" />
            Configurar Cookies
          </button>
        </div>
      </div>
    </footer>
  );
}