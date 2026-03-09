import React from "react";

// ─── Global error storage (singleton, survives re-renders) ───
interface CapturedError {
  id: number;
  timestamp: Date;
  type: "runtime" | "unhandled-rejection" | "react-boundary" | "resource" | "console-error";
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  componentStack?: string;
}

var errorCounter = 0;
var globalErrors: CapturedError[] = [];
var errorListeners: Array<() => void> = [];

function addGlobalError(err: CapturedError) {
  // Deduplicate by message (within last 5 seconds)
  var now = Date.now();
  var isDupe = false;
  for (var i = globalErrors.length - 1; i >= 0 && i >= globalErrors.length - 10; i--) {
    var existing = globalErrors[i];
    if (existing.message === err.message && now - existing.timestamp.getTime() < 5000) {
      isDupe = true;
      break;
    }
  }
  if (isDupe) return;

  globalErrors.push(err);
  // Keep max 200 errors
  if (globalErrors.length > 200) {
    globalErrors = globalErrors.slice(-200);
  }
  for (var j = 0; j < errorListeners.length; j++) {
    errorListeners[j]();
  }
}

export function getGlobalErrors(): CapturedError[] {
  return globalErrors;
}

export function clearGlobalErrors() {
  globalErrors = [];
  for (var j = 0; j < errorListeners.length; j++) {
    errorListeners[j]();
  }
}

// ─── Error interceptor setup (runs once) ───
var interceptorInstalled = false;

function installInterceptor() {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  // 1. window.onerror — catches runtime JS errors
  var origOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    addGlobalError({
      id: ++errorCounter,
      timestamp: new Date(),
      type: "runtime",
      message: String(message),
      stack: error?.stack,
      source: source || undefined,
      line: lineno || undefined,
      col: colno || undefined,
    });
    if (origOnError) {
      return (origOnError as any).call(window, message, source, lineno, colno, error);
    }
    return false;
  };

  // 2. unhandledrejection — catches unhandled promise rejections
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    var message = "Unhandled Promise Rejection";
    var stack: string | undefined;
    if (reason instanceof Error) {
      message = reason.message;
      stack = reason.stack;
    } else if (typeof reason === "string") {
      message = reason;
    } else {
      try { message = JSON.stringify(reason); } catch (_e) { /* ignore */ }
    }
    addGlobalError({
      id: ++errorCounter,
      timestamp: new Date(),
      type: "unhandled-rejection",
      message: message,
      stack: stack,
    });
  });

  // 3. Resource load errors (images, scripts, etc.)
  window.addEventListener("error", function (event) {
    var target = event.target as HTMLElement | null;
    if (target && target !== window && (target as any).tagName) {
      var tagName = (target as any).tagName;
      var src = (target as any).src || (target as any).href || "";
      addGlobalError({
        id: ++errorCounter,
        timestamp: new Date(),
        type: "resource",
        message: "Failed to load " + tagName + ": " + src,
        source: src,
      });
    }
  }, true); // Capture phase to catch resource errors

  // 4. Intercept console.error to catch React & library errors
  var origConsoleError = console.error;
  console.error = function (...args: any[]) {
    origConsoleError.apply(console, args);
    // Ignore React internal messages (dev mode warnings, etc.)
    var firstArg = args[0];
    if (typeof firstArg === "string") {
      // Skip React's own error boundary logs to avoid duplicates
      if (firstArg.indexOf("The above error occurred") !== -1) return;
      if (firstArg.indexOf("Warning:") === 0) return;
      if (firstArg.indexOf("%c") !== -1 && firstArg.indexOf("color:") !== -1) return;
    }
    var message = args.map(function (a) {
      if (a instanceof Error) return a.message;
      if (typeof a === "string") return a;
      try { return JSON.stringify(a); } catch (_e) { return String(a); }
    }).join(" ");
    var stack: string | undefined;
    for (var i = 0; i < args.length; i++) {
      if (args[i] instanceof Error) {
        stack = args[i].stack;
        break;
      }
    }
    addGlobalError({
      id: ++errorCounter,
      timestamp: new Date(),
      type: "console-error",
      message: message.slice(0, 500),
      stack: stack,
    });
  };
}

// ─── React ErrorBoundary that feeds into global collector ───
interface ErrorCollectorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorCollectorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorCollectorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorCollectorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    addGlobalError({
      id: ++errorCounter,
      timestamp: new Date(),
      type: "react-boundary",
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack || undefined,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: "2rem", textAlign: "center", background: "#fef2f2",
          borderRadius: "8px", margin: "1rem", border: "1px solid #fee2e2"
        }}>
          <p style={{ color: "#dc2626", fontWeight: 600, marginBottom: "0.5rem" }}>
            Erro no componente
          </p>
          <p style={{ color: "#6b7280", fontSize: "0.8rem", marginBottom: "1rem" }}>
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "0.4rem 1rem", background: "#dc2626", color: "#fff",
              border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem"
            }}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Floating Debug Panel removed — errors are only viewable via AdminErrorScanner ───
// Install interceptor eagerly so errors are still collected for the admin scanner
installInterceptor();