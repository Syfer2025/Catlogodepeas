import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Menu,
  X,
  Phone,
  Wrench,
  Headset,
  ChevronDown,
  MapPin,
  Clock,
  MessageCircle,
  Building2,
} from "lucide-react";
import { SearchAutocomplete } from "./SearchAutocomplete";
import { CategoryMegaMenu, MobileCategoryMenu } from "./CategoryMegaMenu";
import * as api from "../services/api";

const UNIDADES = [
  { nome: "Matriz", tel: "0800 643 1170", href: "tel:08006431170" },
  { nome: "Maringa-PR", tel: "(44) 3123-3000", href: "tel:+554431233000" },
  { nome: "Curitiba-PR", tel: "(41) 3123-8900", href: "tel:+554131238900" },
  { nome: "Itajai-SC", tel: "(47) 3248-2100", href: "tel:+554732482100" },
  { nome: "Sinop-MT", tel: "(66) 3515-5115", href: "tel:+556635155115" },
  { nome: "Sinop-MT", tel: "(66) 99673-6133", href: "tel:+5566996736133", isMobile: true },
  { nome: "Matupa-MT", tel: "(66) 99201-7474", href: "tel:+5566992017474", isMobile: true },
  { nome: "Varzea Grande-MT", tel: "(65) 2193-8550", href: "tel:+556521938550" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileContactOpen, setMobileContactOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.getLogo()
      .then((data) => {
        if (data?.hasLogo && data.url) {
          // Add cache-buster to avoid stale cached 404s
          const sep = data.url.includes("?") ? "&" : "?";
          setLogoUrl(`${data.url}${sep}v=${Date.now()}`);
        }
      })
      .catch((err) => {
        console.error("Header logo fetch error:", err);
      });
  }, []);

  return (
    <header className="w-full sticky top-0 z-50">
      {/* Main header */}
      <div className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Carretão Auto Peças"
                className="h-14 w-auto max-w-[220px] object-contain"
                onError={() => setLogoUrl(null)}
                width={220}
                height={56}
                decoding="async"
              />
            ) : (
              <>
                <div className="bg-gradient-to-br from-red-600 to-red-700 rounded-xl p-2 shadow-sm group-hover:shadow-md transition-shadow">
                  <Wrench className="w-6 h-6 text-white" />
                </div>
                <div className="hidden sm:block">
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-red-600" style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                      Auto
                    </span>
                    <span className="text-gray-800" style={{ fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
                      Parts
                    </span>
                  </div>
                  <p
                    className="text-gray-400"
                    style={{ fontSize: "0.62rem", lineHeight: 1, marginTop: "-3px", letterSpacing: "0.08em", textTransform: "uppercase" }}
                  >
                    Catalogo de Pecas
                  </p>
                </div>
              </>
            )}
          </Link>

          {/* Search bar — desktop */}
          <div className="flex-1 max-w-xl hidden md:block">
            <SearchAutocomplete variant="header" />
          </div>

          {/* Central de Atendimento — desktop */}
          <div className="hidden lg:block relative group shrink-0">
            {/* Trigger */}
            <button className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50/70 transition-all cursor-pointer">
              <div className="bg-red-50 group-hover:bg-red-100 rounded-full p-2 transition-colors">
                <Headset className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-left">
                <p style={{ fontSize: "0.8rem", fontWeight: 600 }} className="text-gray-800 group-hover:text-red-600 transition-colors leading-tight">
                  Fale Conosco
                </p>
                <p style={{ fontSize: "0.65rem" }} className="text-gray-400 leading-tight">
                  Central de Atendimento
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-transform group-hover:rotate-180" />
            </button>

            {/* Dropdown — hover */}
            <div className="absolute right-0 top-full pt-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-[200]">
              <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-[370px] overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-red-700 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 rounded-full p-2">
                      <Headset className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-white" style={{ fontSize: "1rem", fontWeight: 700 }}>
                        Fale Conosco
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock className="w-3 h-3 text-red-200" />
                        <p className="text-red-100" style={{ fontSize: "0.72rem" }}>
                          Seg. a Sex. 8h as 18h &bull; Sab. 8h as 12h
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* WhatsApp */}
                <div className="px-5 py-3.5 border-b border-gray-100">
                  <a
                    href="https://wa.me/5544997330202"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg px-4 py-3 transition-colors group/wa"
                  >
                    <div className="bg-green-500 rounded-full p-2 shrink-0">
                      <MessageCircle className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="flex-1">
                      <p
                        className="text-green-800"
                        style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}
                      >
                        WhatsApp Oficial
                      </p>
                      <p className="text-green-700" style={{ fontSize: "1rem", fontWeight: 700 }}>
                        (44) 99733-0202
                      </p>
                    </div>
                    <span
                      className="text-green-600 group-hover/wa:translate-x-0.5 transition-transform"
                      style={{ fontSize: "0.75rem", fontWeight: 500 }}
                    >
                      Chamar &rarr;
                    </span>
                  </a>
                </div>

                {/* Nossas Unidades */}
                <div className="px-5 py-3">
                  <div className="flex items-center gap-2 mb-2.5">
                    <Building2 className="w-3.5 h-3.5 text-red-600" />
                    <h4
                      className="text-gray-800"
                      style={{ fontSize: "0.78rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}
                    >
                      Nossas Unidades
                    </h4>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {UNIDADES.map((u, i) => (
                      <a
                        key={`${u.nome}-${i}`}
                        href={u.href}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 transition-colors group/unit"
                      >
                        <MapPin
                          className="w-3 h-3 text-gray-300 group-hover/unit:text-red-500 mt-0.5 shrink-0 transition-colors"
                        />
                        <div className="min-w-0">
                          <p
                            className="text-gray-500 group-hover/unit:text-gray-700 truncate transition-colors"
                            style={{ fontSize: "0.68rem", fontWeight: 500, lineHeight: 1.3 }}
                          >
                            {u.nome}
                          </p>
                          <p
                            className="text-gray-800 group-hover/unit:text-red-600 font-mono transition-colors"
                            style={{ fontSize: "0.75rem", fontWeight: 600, lineHeight: 1.3 }}
                          >
                            {u.tel}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Navigation — only Categories */}
        <nav className="bg-gray-50/80 border-t border-gray-100 hidden md:block">
          <div className="max-w-7xl mx-auto px-4">
            <CategoryMegaMenu />
          </div>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-gray-200 shadow-lg animate-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-3">
            {/* Search — mobile */}
            <div className="mb-3">
              <SearchAutocomplete
                variant="mobile"
                onSelect={() => setMobileMenuOpen(false)}
                placeholder="Buscar pecas..."
              />
            </div>

            {/* Mobile Categories (no extra wrapper needed) */}
            <MobileCategoryMenu onNavigate={() => setMobileMenuOpen(false)} />

            {/* Central de Atendimento — mobile */}
            <div className="border-t border-gray-100 pt-3 mt-2">
              <button
                onClick={() => setMobileContactOpen(!mobileContactOpen)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="bg-red-50 rounded-full p-1.5">
                    <Headset className="w-4 h-4 text-red-600" />
                  </div>
                  <span className="text-gray-800" style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                    Central de Atendimento
                  </span>
                </div>
                <ChevronDown
                  className={`w-4 h-4 text-gray-400 transition-transform ${mobileContactOpen ? "rotate-180" : ""}`}
                />
              </button>

              {mobileContactOpen && (
                <div className="mt-2 mx-2 bg-gray-50 rounded-lg overflow-hidden border border-gray-200">
                  {/* Horario */}
                  <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <p className="text-gray-500" style={{ fontSize: "0.75rem" }}>
                      Seg. a Sex. 8h as 18h &bull; Sab. 8h as 12h
                    </p>
                  </div>

                  {/* WhatsApp */}
                  <a
                    href="https://wa.me/5544997330202"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 bg-green-50 border-b border-gray-200"
                  >
                    <div className="bg-green-500 rounded-full p-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-green-700" style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase" }}>
                        WhatsApp Oficial
                      </p>
                      <p className="text-green-800" style={{ fontSize: "0.95rem", fontWeight: 700 }}>
                        (44) 99733-0202
                      </p>
                    </div>
                  </a>

                  {/* Unidades */}
                  <div className="px-4 py-2.5">
                    <p className="text-gray-500 mb-2" style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      Nossas Unidades
                    </p>
                    <div className="space-y-1.5">
                      {UNIDADES.map((u, i) => (
                        <a
                          key={`mob-${u.nome}-${i}`}
                          href={u.href}
                          className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-white transition-colors"
                        >
                          <span className="text-gray-500" style={{ fontSize: "0.78rem" }}>
                            {u.nome}
                          </span>
                          <span className="font-mono text-gray-800" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                            {u.tel}
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}