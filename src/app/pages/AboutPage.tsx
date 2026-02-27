import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Home,
  ChevronRight,
  MapPin,
  Phone,
  Clock,
  MessageCircle,
  ExternalLink,
  Loader2,
  Building2,
} from "lucide-react";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import * as api from "../services/api";
import type { Branch } from "../services/api";

// Fallback branches when none are configured in admin
var FALLBACK_BRANCHES: Branch[] = [
  { id: "f0", nome: "Maringa (Matriz)", estado: "PR", endereco: "", telefone: "(44) 3123-3000", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: true, active: true, order: 0, mapQuery: "Carretao Auto Pecas Matriz Maringa PR" },
  { id: "f1", nome: "Maringa (Loja)", estado: "PR", endereco: "", telefone: "(44) 3123-3000", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 1, mapQuery: "Carretao Auto Pecas Maringa PR" },
  { id: "f2", nome: "Curitiba", estado: "PR", endereco: "", telefone: "(41) 3123-8900", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 2, mapQuery: "" },
  { id: "f3", nome: "Itajai", estado: "SC", endereco: "", telefone: "(47) 3248-2100", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 3, mapQuery: "" },
  { id: "f4", nome: "Sinop", estado: "MT", endereco: "", telefone: "(66) 3515-5115", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 4, mapQuery: "" },
  { id: "f5", nome: "Sinop (Loja 2)", estado: "MT", endereco: "", telefone: "(66) 99673-6133", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 5, mapQuery: "" },
  { id: "f6", nome: "Matupa", estado: "MT", endereco: "", telefone: "(66) 99201-7474", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 6, mapQuery: "" },
  { id: "f7", nome: "Varzea Grande", estado: "MT", endereco: "", telefone: "(65) 2193-8550", whatsapp: "", horario: "Seg a Sex: 8h - 18h | Sab: 8h - 12h", isMatriz: false, active: true, order: 7, mapQuery: "" },
];

function BranchRow({ branch }: { branch: Branch }) {
  var hasMap = !!branch.mapQuery;
  var mapQuery = branch.mapQuery || (branch.nome + " " + branch.estado);
  var hasImage = !!branch.imageUrl;

  return (
    <div className={"bg-white rounded-2xl border overflow-hidden hover:shadow-lg transition-all " + (branch.isMatriz ? "border-red-200 ring-1 ring-red-100" : "border-gray-200")}>
      <div className="flex flex-col lg:flex-row">
        {/* Left side: photo + info */}
        <div className="flex-1 flex flex-col">
          {/* Photo */}
          {hasImage && (
            <div className="relative">
              <img
                src={branch.imageUrl}
                alt={"Filial " + branch.nome + " - " + branch.estado}
                className="w-full h-auto block"
                loading="lazy"
              />
              {branch.isMatriz && (
                <div className="absolute top-3 left-3 bg-red-600 text-white px-2.5 py-1 rounded-lg shadow-sm" style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                  MATRIZ
                </div>
              )}
            </div>
          )}

          {/* Info */}
          <div className="p-5 lg:p-6 flex-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <h3 className="text-gray-900" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                {branch.nome}
              </h3>
              <span className="text-gray-400" style={{ fontSize: "0.85rem", fontWeight: 500 }}>
                - {branch.estado}
              </span>
              {!hasImage && branch.isMatriz && (
                <span className="bg-red-600 text-white px-2 py-0.5 rounded-md" style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.04em" }}>
                  MATRIZ
                </span>
              )}
            </div>

            {branch.endereco && (
              <div className="flex items-start gap-2 text-gray-500 mt-1.5" style={{ fontSize: "0.85rem" }}>
                <MapPin className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{branch.endereco}</span>
              </div>
            )}

            {branch.telefone && (
              <div className="flex items-center gap-2 text-gray-600 mt-2.5" style={{ fontSize: "0.9rem" }}>
                <Phone className="w-4 h-4 text-red-400 shrink-0" />
                <a
                  href={"tel:" + branch.telefone.replace(/\D/g, "")}
                  className="hover:text-red-600 transition-colors"
                  style={{ fontWeight: 600 }}
                >
                  {branch.telefone}
                </a>
              </div>
            )}

            {branch.whatsapp && (
              <div className="flex items-center gap-2 text-green-700 mt-2" style={{ fontSize: "0.88rem" }}>
                <MessageCircle className="w-4 h-4 shrink-0" />
                <a
                  href={"https://wa.me/55" + branch.whatsapp.replace(/\D/g, "")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-green-800 transition-colors"
                  style={{ fontWeight: 500 }}
                >
                  {branch.whatsapp}
                </a>
              </div>
            )}

            {branch.horario && (
              <div className="flex items-center gap-2 text-gray-400 mt-2" style={{ fontSize: "0.82rem" }}>
                <Clock className="w-4 h-4 shrink-0" />
                <span>{branch.horario}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
              {hasMap && (
                <a
                  href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(branch.mapQuery)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors"
                  style={{ fontSize: "0.8rem", fontWeight: 600 }}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ver no Maps
                </a>
              )}
              {branch.telefone && (
                <a
                  href={"tel:" + branch.telefone.replace(/\D/g, "")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg transition-colors"
                  style={{ fontSize: "0.8rem", fontWeight: 600 }}
                >
                  <Phone className="w-3.5 h-3.5" />
                  Ligar
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Map side */}
        <div className="lg:w-[420px] shrink-0 bg-gray-100" style={{ minHeight: "260px" }}>
          <iframe
            src={"https://maps.google.com/maps?q=" + encodeURIComponent(mapQuery) + "&output=embed&hl=pt-BR"}
            width="100%"
            height="100%"
            style={{ border: 0, minHeight: "260px" }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={"Mapa " + branch.nome + " - " + branch.estado}
          />
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  var [branches, setBranches] = useState<Branch[]>([]);
  var [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: "Nossas Filiais - Carretao Auto Pecas",
    description: "Conheca as filiais da Carretao Auto Pecas: 8 unidades no Parana, Santa Catarina e Mato Grosso.",
    ogTitle: "Nossas Filiais - Carretao Auto Pecas",
    ogDescription: "8 unidades estrategicamente localizadas para atender todo o Brasil.",
    canonical: window.location.origin + "/sobre",
  });

  useEffect(function () {
    api.getBranches()
      .then(function (data) {
        if (data.branches && data.branches.length > 0) {
          setBranches(data.branches);
        } else {
          setBranches(FALLBACK_BRANCHES);
        }
      })
      .catch(function (err) {
        console.error("[AboutPage] Failed to load branches:", err);
        setBranches(FALLBACK_BRANCHES);
      })
      .finally(function () { setLoading(false); });
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 text-gray-500" style={{ fontSize: "0.8rem" }}>
            <Link to="/" className="hover:text-red-600 transition-colors flex items-center gap-1">
              <Home className="w-3.5 h-3.5" />
              Inicio
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Nossas Filiais</span>
          </nav>
        </div>
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-8 pb-2 lg:pt-10">
        <div className="flex items-center gap-3 mb-2">
          <div className="bg-red-50 p-2.5 rounded-xl">
            <Building2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-gray-900" style={{ fontSize: "1.6rem", fontWeight: 800 }}>
              Nossas Filiais
            </h1>
            <p className="text-gray-500" style={{ fontSize: "0.9rem" }}>
              Estrategicamente localizadas para atender todo o Brasil
            </p>
          </div>
        </div>
      </div>

      {/* Branches */}
      <section className="max-w-6xl mx-auto px-4 py-6 lg:py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            {branches.map(function (branch) {
              return <BranchRow key={branch.id} branch={branch} />;
            })}

            {/* Televendas card */}
            <div className="bg-gradient-to-r from-red-600 to-red-700 rounded-2xl overflow-hidden text-white">
              <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 p-6">
                <div className="flex items-center justify-center w-14 h-14 bg-white/15 rounded-2xl shrink-0">
                  <Phone className="w-7 h-7 text-white" />
                </div>
                <div className="text-center sm:text-left flex-1">
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Televendas</h3>
                  <div className="mt-1" style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                    0800 643 1170
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-red-200 mt-1.5" style={{ fontSize: "0.85rem" }}>
                    <Clock className="w-4 h-4" />
                    Seg a Sex: 8h - 18h | Sab: 8h - 12h
                  </div>
                </div>
                <a
                  href="tel:08006431170"
                  className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-6 py-2.5 rounded-xl transition-colors shrink-0"
                  style={{ fontSize: "0.9rem", fontWeight: 600 }}
                >
                  <Phone className="w-4 h-4" />
                  Ligar Agora
                </a>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}