import React from "react";
import ReactDOM from "react-dom/client";
import { designTokens } from "@chatgpt-mcp-dynamic/shared";
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
            fontFamily: designTokens.fontSans,
            background:
              "radial-gradient(circle at top left, rgba(255,255,255,0.88), transparent 36%), linear-gradient(180deg, #f5f5f4 0%, #efefec 100%)",
            color: designTokens.colorText
          }}
        >
          <section
            style={{
              borderRadius: designTokens.radiusCard,
              border: `1px solid ${designTokens.colorBorder}`,
              background: "rgba(255,255,255,0.92)",
              padding: "20px",
              boxShadow: designTokens.shadowCard
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: "12px", letterSpacing: "0.12em", textTransform: "uppercase", color: designTokens.colorWarning }}>
              Workspace Error
            </p>
            <h1 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 500, letterSpacing: "-0.02em" }}>
              The workspace could not render.
            </h1>
            <p style={{ margin: 0, lineHeight: 1.6, color: designTokens.colorTextSecondary }}>{this.state.error}</p>
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
