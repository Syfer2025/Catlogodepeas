import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import { supabase } from "../services/supabaseClient";
import { TrackingPageContent } from "../components/TrackingTimeline";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
import { Loader2, LogIn } from "lucide-react";

export function TrackingPage() {
  var params = useParams<{ orderId: string }>();
  var navigate = useNavigate();
  var [accessToken, setAccessToken] = useState<string | null>(null);
  var [loading, setLoading] = useState(true);

  useDocumentMeta({
    title: "Rastreio do Pedido - Carretao Auto Pecas",
    description: "Acompanhe o status de entrega do seu pedido.",
  });

  useEffect(function () {
    supabase.auth.getSession().then(function (res) {
      var token = res.data?.session?.access_token || null;
      setAccessToken(token);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-red-600 animate-spin" />
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <LogIn className="w-8 h-8 text-red-500" />
        </div>
        <h1 className="text-gray-900 mb-2" style={{ fontSize: "1.2rem", fontWeight: 700 }}>
          Faca login para rastrear
        </h1>
        <p className="text-gray-500 mb-6" style={{ fontSize: "0.88rem" }}>
          Voce precisa estar logado para acompanhar seus pedidos.
        </p>
        <button
          onClick={function () { navigate("/conta"); }}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition-colors cursor-pointer"
          style={{ fontSize: "0.9rem", fontWeight: 600 }}
        >
          <LogIn className="w-4 h-4" />
          Fazer Login
        </button>
      </div>
    );
  }

  if (!params.orderId) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Pedido nao especificado.</p>
      </div>
    );
  }

  return (
    <TrackingPageContent
      accessToken={accessToken}
      localOrderId={params.orderId}
      onBack={function () { navigate("/minha-conta?tab=pedidos"); }}
    />
  );
}
