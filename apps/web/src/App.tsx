import { useEffect, useState } from "react";
import { Fh2Workspace } from "./components/fh2/Fh2Workspace.js";
import { PilotCloudBootstrap } from "./pilot-bootstrap/PilotCloudBootstrap.js";
import { PilotJsbridgeEvidence } from "./pilot-evidence/PilotJsbridgeEvidence.js";

export function App() {
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string): void {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setPathname(path);
  }

  if (pathname === "/pilot-login") {
    return (
      <PilotCloudBootstrap
        onOpenEvidence={() => navigate("/pilot-evidence")}
      />
    );
  }

  if (pathname === "/pilot-evidence") {
    return <PilotJsbridgeEvidence />;
  }

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
