import { Link } from "react-router";
import { ArrowLeft, Search, Home, MessageCircle, Sparkles } from "lucide-react";
import "../utils/emptyStateAnimations";

export function NotFoundPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        {/* Big 404 */}
        <div className="relative mb-6">
          <span
            className="text-transparent bg-clip-text bg-gradient-to-b from-red-200 to-red-100 select-none"
            style={{ fontSize: "8rem", fontWeight: 900, lineHeight: 1 }}
          >
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="bg-red-50 border border-red-100 rounded-2xl p-4"
              style={{ animation: "es-404-float 4s ease-in-out infinite" }}
            >
              <Search className="w-8 h-8 text-red-400" />
            </div>
          </div>
          {/* Floating sparkles */}
          <Sparkles
            className="w-5 h-5 text-red-300 absolute top-2 right-8"
            style={{ animation: "es-twinkle 2s ease-in-out infinite" }}
          />
          <Sparkles
            className="w-4 h-4 text-amber-300 absolute bottom-4 left-10"
            style={{ animation: "es-twinkle 2s ease-in-out 0.8s infinite" }}
          />
          <Sparkles
            className="w-3 h-3 text-red-200 absolute top-6 left-16"
            style={{ animation: "es-twinkle 2s ease-in-out 1.4s infinite" }}
          />
          {/* Pulse ring behind icon */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className="w-16 h-16 rounded-2xl border-2 border-red-200"
              style={{ animation: "es-ring 2.5s ease-out infinite" }}
            />
          </div>
        </div>

        <h1 className="text-gray-800 mb-2" style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Página não encontrada
        </h1>
        <p className="text-gray-400 mb-8" style={{ fontSize: "0.95rem", lineHeight: 1.6 }}>
          A página que você procura não existe ou foi movida. Verifique o endereço digitado.
        </p>

        <div
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
          style={{ animation: "es-fade-up 0.5s ease both 0.4s" }}
        >
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-all hover:shadow-lg hover:shadow-red-200 active:scale-[0.98] hover:-translate-y-0.5 w-full sm:w-auto justify-center"
            style={{ fontWeight: 600 }}
          >
            <Home className="w-4 h-4" />
            Ir para o Inicio
          </Link>
          <Link
            to="/catalogo"
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 px-6 py-3 rounded-xl transition-all hover:-translate-y-0.5 w-full sm:w-auto justify-center"
            style={{ fontWeight: 500 }}
          >
            <Search className="w-4 h-4" />
            Ver Catalogo
          </Link>
        </div>
      </div>
    </div>
  );
}
