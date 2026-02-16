import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";

/**
 * SYNCHRONOUS recovery redirect — runs at module load time, BEFORE React renders.
 * Handles the IMPLICIT flow where tokens arrive as #access_token=...&type=recovery
 */
(function recoveryRedirectSync() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (
    hash &&
    hash.includes("type=recovery") &&
    !window.location.pathname.startsWith("/admin/reset-password")
  ) {
    window.location.replace("/admin/reset-password" + hash);
  }
})();

export default function App() {

  /**
   * Handles the PKCE flow — Supabase uses ?code= in query string instead of hash.
   * We lazy-import the Supabase client ONLY when a code param is detected,
   * so public pages don't pay the bundle cost.
   * The Supabase client exchanges the code for a session and fires PASSWORD_RECOVERY.
   */
  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    const isOnResetPage = window.location.pathname.startsWith("/admin/reset-password");

    // Nothing to intercept if already on reset page
    if (isOnResetPage) return;

    // Check for PKCE code or hash tokens
    const hasCode = search.includes("code=");
    const hasHashRecovery = hash.includes("type=recovery");

    if (!hasCode && !hasHashRecovery) return;

    // Lazy-load supabase client to process the auth tokens
    let cancelled = false;
    import("./services/supabaseClient").then(({ supabase }) => {
      if (cancelled) return;

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, _session) => {
        console.log("[App] Auth event:", event);
        if (event === "PASSWORD_RECOVERY") {
          window.location.replace("/admin/reset-password");
        }
      });

      // Cleanup on unmount
      const cleanup = () => {
        cancelled = true;
        subscription.unsubscribe();
      };
      // Store cleanup for the effect's return
      (window as any).__recoveryCleanup = cleanup;
    });

    return () => {
      (window as any).__recoveryCleanup?.();
      delete (window as any).__recoveryCleanup;
    };
  }, []);

  return <RouterProvider router={router} />;
}