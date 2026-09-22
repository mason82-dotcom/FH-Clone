import { RtkDashboard } from "./components/rtk/RtkDashboard.js";

export function App() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">FH</span>
          <div>
            <strong>FH-Clone Flight Console</strong>
            <span className="muted">DJI Cloud API · UgCS · RTK</span>
          </div>
        </div>
        <span className="safety-badge">FC0 · READ ONLY</span>
      </header>

      <RtkDashboard />
    </main>
  );
}
