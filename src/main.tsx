
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

var PRELOAD_RELOAD_MARKER = "__vite_preload_reload_once__";

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", function (event: any) {
    event?.preventDefault?.();
    try {
      var currentPath = window.location.pathname + window.location.search;
      if (sessionStorage.getItem(PRELOAD_RELOAD_MARKER) === currentPath) {
        sessionStorage.removeItem(PRELOAD_RELOAD_MARKER);
        return;
      }
      sessionStorage.setItem(PRELOAD_RELOAD_MARKER, currentPath);
    } catch {}
    console.warn("[main] Vite preload error detected. Reloading page once to refresh stale assets.");
    window.location.reload();
  });
}

createRoot(document.getElementById("root")!).render(<App />);
  