import { Fh2Workspace } from "./components/fh2/Fh2Workspace.js";

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">FH</span>
          <div>
            <strong>FH-Clone Flight Console</strong>
            <span className="muted">
              DJI FlightHub 2 · Cloud API · UgCS · RTK
            </span>
          </div>
        </div>
        <span className="safety-badge">FC0 · Native FH2 optional</span>
      </header>

      <Fh2Workspace />
    </main>
  );
}
