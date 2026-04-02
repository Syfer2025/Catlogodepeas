import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { lazyWithRetry } from "../../utils/lazyWithRetry";
import { AdminLoginPage } from "./AdminLoginPage";
import { getValidAdminToken } from "./adminAuth";

const AdminShellPage = lazyWithRetry(() =>
  import("./AdminPage").then((module) => ({ default: module.AdminPage }))
);

function AdminFullscreenLoader({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-10 h-10 text-red-600 animate-spin mx-auto mb-4" />
        <p className="text-gray-400" style={{ fontSize: "0.9rem" }}>
          {message}
        </p>
      </div>
    </div>
  );
}

export function AdminEntryPage() {
  const [shouldLoadShell, setShouldLoadShell] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    getValidAdminToken()
      .then((token) => {
        if (mounted) {
          setShouldLoadShell(Boolean(token));
        }
      })
      .catch(() => {
        if (mounted) {
          setShouldLoadShell(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (shouldLoadShell === null) {
    return <AdminFullscreenLoader message="Verificando sessao..." />;
  }

  if (!shouldLoadShell) {
    return <AdminLoginPage onLoginSuccess={() => setShouldLoadShell(true)} />;
  }

  return (
    <Suspense fallback={<AdminFullscreenLoader message="Carregando painel administrativo..." />}>
      <AdminShellPage />
    </Suspense>
  );
}