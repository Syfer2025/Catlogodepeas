/**
 * ROUTE ERROR FALLBACK — Exibido quando uma rota individual falha.
 * Diferente do ErrorBoundary raiz: mostra o erro dentro do Layout
 * (Header e Footer continuam visiveis) e oferece opcao de voltar
 * ou recarregar. Evita que um erro em uma pagina derrube o app inteiro.
 */
import { startTransition } from "react";
import { useRouteError, Link, useNavigate } from "react-router";

export function RouteErrorFallback() {
  const error = useRouteError() as any;
  const navigate = useNavigate();

  const message = error?.message || error?.statusText || "Erro desconhecido";
  const isNotFound = error?.status === 404;

  return (
    <div className="flex items-center justify-center py-24 px-4" style={{ minHeight: "50vh" }}>
      <div className="text-center max-w-lg">
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
          style={{
            background: isNotFound ? "#fef3c7" : "#fef2f2",
            fontSize: "1.5rem",
          }}
        >
          {isNotFound ? "🔍" : "⚠"}
        </div>
        <h2
          className="text-gray-900 mb-2"
          style={{ fontSize: "1.3rem", fontWeight: 700 }}
        >
          {isNotFound ? "Página não encontrada" : "Algo deu errado"}
        </h2>
        <p
          className="text-gray-500 mb-4"
          style={{ fontSize: "0.9rem", lineHeight: 1.6 }}
        >
          {isNotFound
            ? "A página que você procura não existe ou foi movida."
            : "Ocorreu um erro ao carregar esta página. Tente novamente."}
        </p>
        {!isNotFound && message && (
          <pre
            className="text-left mb-4 mx-auto"
            style={{
              fontSize: "0.72rem",
              color: "#dc2626",
              background: "#fef2f2",
              borderRadius: "8px",
              padding: "0.75rem",
              overflow: "auto",
              maxHeight: "100px",
              maxWidth: "400px",
              border: "1px solid #fee2e2",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {message}
          </pre>
        )}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={function () {
              startTransition(function () { navigate(-1); });
            }}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            Voltar
          </button>
          <Link
            to="/"
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            style={{ fontSize: "0.85rem", fontWeight: 600 }}
          >
            Ir para o início
          </Link>
          {!isNotFound && (
            <button
              onClick={function () {
                window.location.reload();
              }}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              style={{ fontSize: "0.85rem", fontWeight: 600 }}
            >
              Recarregar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}