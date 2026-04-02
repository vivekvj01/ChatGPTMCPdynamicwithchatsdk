import { useEffect, useMemo, useState } from "react";
import type { StreamEvent } from "@chatgpt-mcp-dynamic/shared";

function useRunId(): string {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("runId") || "";
  }, []);
}

export function App() {
  const runId = useRunId();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!runId) {
      return;
    }

    const source = new EventSource(`/api/runs/${runId}/stream`);
    setConnected(true);

    source.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as StreamEvent;
      setEvents((current) => [...current, parsed]);
    };

    source.onerror = () => {
      setConnected(false);
      source.close();
    };

    return () => {
      setConnected(false);
      source.close();
    };
  }, [runId]);

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">ChatGPT Dynamic UI</p>
        <h1>Widget Stream Shell</h1>
        <p className="copy">
          This scaffold is the host UI for streamed reasoning, text, and generated widget
          previews.
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <strong>Run ID</strong>
          <span>{runId || "Missing runId query param"}</span>
        </div>
        <div className="row">
          <strong>Stream</strong>
          <span>{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Events</h2>
        <pre>{JSON.stringify(events, null, 2)}</pre>
      </section>
    </main>
  );
}

