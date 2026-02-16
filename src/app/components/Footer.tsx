import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Phone,
  Mail,
  Clock,
  Lock,
  MessageCircle,
  ExternalLink,
  ArrowUpRight,
} from "lucide-react";
import * as api from "../services/api";

const FOOTER_LOGO_CACHE_KEY = "carretao_footer_logo_url";

const UNIDADES = [
  { nome: "Matriz / Televendas", tel: "0800 643 1170", href: "tel:08006431170" },
  { nome: "Maringá-PR", tel: "(44) 3123-3000", href: "tel:+554431233000" },
  { nome: "Curitiba-PR", tel: "(41) 3123-8900", href: "tel:+554131238900" },
  { nome: "Itajaí-SC", tel: "(47) 3248-2100", href: "tel:+554732482100" },
  { nome: "Sinop-MT (Loja 1)", tel: "(66) 3515-5115", href: "tel:+556635155115" },
  { nome: "Sinop-MT (Loja 2)", tel: "(66) 99673-6133", href: "tel:+5566996736133" },
  { nome: "Matupá-MT", tel: "(66) 99201-7474", href: "tel:+5566992017474" },
  { nome: "Várzea Grande-MT", tel: "(65) 2193-8550", href: "tel:+556521938550" },
];

const QUICK_LINKS = [
  { label: "Catálogo Completo", path: "/catalogo" },
  { label: "Fale Conosco", path: "/contato" },
  { label: "Política de Troca", path: "/contato" },
  { label: "Garantia", path: "/contato" },
  { label: "Sobre Nós", path: "/contato" },
];

export function Footer() {
  const [footerLogoUrl, setFooterLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem(FOOTER_LOGO_CACHE_KEY); } catch { return null; }
  });
  const [footerLogoLoading, setFooterLogoLoading] = useState(true);

  useEffect(() => {
    api.getFooterLogo()
      .then((data) => {
        if (data?.hasLogo && data.url) {
          setFooterLogoUrl(data.url);
          try { localStorage.setItem(FOOTER_LOGO_CACHE_KEY, data.url); } catch {}
        } else {
          setFooterLogoUrl(null);
          try { localStorage.removeItem(FOOTER_LOGO_CACHE_KEY); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setFooterLogoLoading(false));
  }, []);

  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="h-1 bg-gradient-to-r from-red-600 via-red-500 to-red-600" />

      <div className="max-w-7xl mx-auto px-4 py-12 lg:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10 lg:gap-8">

          {/* Col 1 — Empresa + Contato */}
          <div className="lg:col-span-4">
            <div className="flex items-center gap-2.5 mb-5">
              {footerLogoUrl ? (
                <img
                  src={footerLogoUrl}
                  alt="Carretão Auto Peças"
                  className="h-24 w-auto max-w-[300px] object-contain"
                  onError={() => {
                    setFooterLogoUrl(null);
                    try { localStorage.removeItem(FOOTER_LOGO_CACHE_KEY); } catch {}
                  }}
                  loading="lazy"
                  decoding="async"
                  width={300}
                  height={96}
                />
              ) : footerLogoLoading ? (
                <div className="h-24 w-[200px] bg-gray-800 rounded-lg animate-pulse" />
              ) : null}
            </div>
            <p className="text-gray-400 mb-5 leading-relaxed" style={{ fontSize: "0.85rem" }}>
              Especialistas em peças para caminhões. Qualidade, garantia e entrega rápida para todo o Brasil.
            </p>

            {/* Contato */}
            <ul className="space-y-3">
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Mail className="w-3.5 h-3.5 text-red-500" />
                </div>
                <a href="mailto:rh@autopecascarretao.com.br" className="hover:text-white transition-colors" style={{ fontSize: "0.85rem" }}>
                  rh@autopecascarretao.com.br
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Phone className="w-3.5 h-3.5 text-red-500" />
                </div>
                <a href="tel:08006431170" className="hover:text-white transition-colors" style={{ fontSize: "0.85rem" }}>
                  0800 643 1170
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <div className="bg-gray-800 rounded-lg p-1.5 shrink-0">
                  <Clock className="w-3.5 h-3.5 text-red-500" />
                </div>
                <span style={{ fontSize: "0.85rem" }}>Seg–Sex 8h–18h · Sáb 8h–13h</span>
              </li>
            </ul>

            {/* WhatsApp */}
            <a
              href="https://wa.me/5544997330202"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-green-900/30 hover:bg-green-900/50 border border-green-800/40 hover:border-green-700/50 rounded-xl px-4 py-3 transition-all group mt-5"
            >
              <div className="bg-green-500 rounded-full p-2 shrink-0 group-hover:scale-105 transition-transform">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-green-400" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  WhatsApp
                </p>
                <p className="text-white" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                  (44) 99733-0202
                </p>
              </div>
              <ExternalLink className="w-3.5 h-3.5 text-green-600 group-hover:text-green-400 ml-auto transition-colors" />
            </a>
          </div>

          {/* Col 2 — Links Rápidos */}
          <div className="lg:col-span-2">
            <h3 className="text-white mb-4 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <span className="w-5 h-0.5 bg-red-600 rounded-full" />
              Links Rápidos
            </h3>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.path}
                    className="text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 group"
                    style={{ fontSize: "0.85rem" }}
                  >
                    <ArrowUpRight className="w-3 h-3 text-gray-600 group-hover:text-red-500 transition-colors" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Nossas Unidades (2 colunas) */}
          <div className="lg:col-span-6">
            <h3 className="text-white mb-4 flex items-center gap-2" style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              <span className="w-5 h-0.5 bg-red-600 rounded-full" />
              Nossas Unidades
            </h3>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3.5">
              {UNIDADES.map((u, i) => (
                <a key={i} href={u.href} className="group block">
                  <span className="text-gray-500 group-hover:text-gray-300 block transition-colors" style={{ fontSize: "0.73rem" }}>
                    {u.nome}
                  </span>
                  <span className="text-gray-300 group-hover:text-white font-mono transition-colors" style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    {u.tel}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-gray-800/60">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <p className="text-gray-500" style={{ fontSize: "0.78rem" }}>
            © 2026 Carretão Auto Peças. Todos os direitos reservados.
          </p>
          <Link
            to="/admin"
            className="flex items-center gap-1.5 text-gray-600 hover:text-red-500 transition-colors"
            style={{ fontSize: "0.73rem" }}
          >
            <Lock className="w-3 h-3" />
            Painel Admin
          </Link>
        </div>
      </div>
    </footer>
  );
}