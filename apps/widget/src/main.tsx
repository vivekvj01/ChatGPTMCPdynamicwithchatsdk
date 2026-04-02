import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown) {
    console.error("Widget render failed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            padding: "24px",
            fontFamily:
              '"Geist", Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
            background: "#f8fafc",
            color: "#0f172a"
          }}
        >
          <section
            style={{
              borderRadius: "20px",
              border: "1px solid rgba(15, 23, 42, 0.08)",
              background: "#ffffff",
              padding: "20px"
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#b45309" }}>
              Widget Error
            </p>
            <h1 style={{ margin: "0 0 8px", fontSize: "20px", fontWeight: 500 }}>
              The ChatGPT widget failed to render.
            </h1>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{this.state.error}</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WidgetErrorBoundary>
      <App />
    </WidgetErrorBoundary>
  </React.StrictMode>
);
