import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Component error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f3f4f6",
            fontFamily: "Inter, sans-serif",
            padding: "2rem",
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              width: "100%",
              background: "#fff",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              padding: "2rem",
              textAlign: "center",
              boxShadow: "0 4px 6px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                background: "#fef2f2",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
                fontSize: "1.5rem",
              }}
            >
              !
            </div>
            <h2
              style={{
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#1f2937",
                marginBottom: "0.5rem",
              }}
            >
              Erro na aplicacao
            </h2>
            <p
              style={{
                fontSize: "0.85rem",
                color: "#6b7280",
                marginBottom: "1rem",
                lineHeight: 1.5,
              }}
            >
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            {this.state.error && (
              <pre
                style={{
                  fontSize: "0.72rem",
                  color: "#dc2626",
                  background: "#fef2f2",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  textAlign: "left",
                  overflow: "auto",
                  maxHeight: "120px",
                  marginBottom: "1rem",
                  border: "1px solid #fee2e2",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                padding: "0.6rem 1.5rem",
                background: "#dc2626",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}