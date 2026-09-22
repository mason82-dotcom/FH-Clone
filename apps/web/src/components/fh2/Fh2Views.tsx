import { useEffect, useState, type ReactNode } from "react";

import { subscribeFh2Event } from "../../fh2/events.js";
import { useFh2 } from "../../fh2/Fh2Provider.js";

function RuntimeBoundary({ children }: { children: ReactNode }) {
  const { state, error } = useFh2();

  if (state === "disabled") {
    return (
      <div className="fh2-runtime-state">
        <strong>DJI FlightHub 2 Standalone ist deaktiviert.</strong>
        <span>Aktiviere VITE_FH2_STANDALONE_ENABLED=true und hinterlege den On-Premises-Kontext.</span>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="fh2-runtime-state">
        <strong>FlightHub-2-Runtime wird geladen …</strong>
        <span>paas.js und Projektkontext werden initialisiert.</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="fh2-runtime-state fh2-runtime-state--error">
        <strong>FlightHub-2-Runtime nicht verfügbar</strong>
        <span>{error ?? "Unbekannter Initialisierungsfehler"}</span>
      </div>
    );
  }

  return <>{children}</>;
}

function ProjectDom() {
  return (
    <div className="fh2-official-shell">
      <div className="fh2-project-details">
        <div id="project-app-container" />
        <div id="project-middle-container" />
        <div id="project-right-micro-app" className="fh2-right-micro-app">
          <div className="fh2-maps-micro-app">
            <div id="project-map-app-placeholder" className="fh2-map-placeholder">
              <div id="map-app-global" className="fh2-map-app-container" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Fh2ProjectMap() {
  const { state } = useFh2();

  useEffect(() => {
    if (state !== "ready") return;
    window.FH2.loadProject("project-app-container");
    return () => {
      window.FH2.destroyProject();
    };
  }, [state]);

  return (
    <RuntimeBoundary>
      <ProjectDom />
    </RuntimeBoundary>
  );
}

export function Fh2WaylineCreation({ folderId = "" }: { folderId?: string }) {
  const { state } = useFh2();
  const [lastEvent, setLastEvent] = useState("Bereit zur Routenerstellung");

  useEffect(() => {
    if (state !== "ready") return;

    const offSaved = subscribeFh2Event("wayline-creation-saved", (payload) => {
      setLastEvent(`Route gespeichert: ${String(payload ?? "ID unbekannt")}`);
    });
    const offCancel = subscribeFh2Event("wayline-creation-cancel", () => {
      setLastEvent("Routenerstellung abgebrochen");
    });

    window.FH2.loadWaylineCreation(
      "wayline-create-app-container",
      folderId ? { folder_id: folderId } : undefined
    );

    return () => {
      offSaved();
      offCancel();
      window.FH2.destroyWaylineCreation();
    };
  }, [folderId, state]);

  return (
    <RuntimeBoundary>
      <div className="fh2-component-frame">
        <div className="fh2-component-meta">{lastEvent}</div>
        <div id="wayline-create-app-container" className="fh2-fill-container" />
      </div>
    </RuntimeBoundary>
  );
}

export function Fh2WaylineEditor({ waylineId }: { waylineId: string }) {
  const { state } = useFh2();
  const [lastEvent, setLastEvent] = useState("Route Editor bereit");

  useEffect(() => {
    if (state !== "ready" || !waylineId) return;

    const offSave = subscribeFh2Event("wayline-save", (payload) => {
      setLastEvent(`Route gespeichert: ${String(payload ?? waylineId)}`);
    });
    const offCancel = subscribeFh2Event("wayline-cancel", () => {
      setLastEvent("Speichern abgebrochen");
    });
    const offBack = subscribeFh2Event("wayline-back", () => {
      setLastEvent("Route Editor verlassen");
    });

    window.FH2.loadWayline("wayline-app-container", {
      wayline_id: waylineId
    });

    return () => {
      offSave();
      offCancel();
      offBack();
      window.FH2.destroyWayline(true);
    };
  }, [state, waylineId]);

  if (!waylineId) {
    return (
      <div className="fh2-runtime-state">
        <strong>Keine Wayline ausgewählt.</strong>
        <span>Wayline-ID eingeben oder aus der Routenerstellung übernehmen.</span>
      </div>
    );
  }

  return (
    <RuntimeBoundary>
      <div className="fh2-component-frame">
        <div className="fh2-component-meta">{lastEvent}</div>
        <div className="fh2-official-shell">
          <div id="wayline-header" />
          <div className="fh2-project-details">
            <div id="project-app-container" />
            <div id="project-middle-container" />
            <div id="project-right-micro-app" className="fh2-right-micro-app">
              <div className="fh2-maps-micro-app">
                <div id="project-map-app-placeholder" className="fh2-map-placeholder">
                  <div id="map-app-global" className="fh2-map-app-container" />
                </div>
              </div>
              <div id="wayline-app-container" className="fh2-wayline-overlay" />
            </div>
          </div>
        </div>
      </div>
    </RuntimeBoundary>
  );
}

export function Fh2FlightPathViewer({
  flightPathId
}: {
  flightPathId: string;
}) {
  const { state } = useFh2();
  const [lastEvent, setLastEvent] = useState("Flugverlauf bereit");

  useEffect(() => {
    if (state !== "ready" || !flightPathId) return;

    const offBack = subscribeFh2Event("flight-path-back", () => {
      setLastEvent("Flugverlauf verlassen");
      window.FH2.destroyFlightPath();
    });

    window.FH2.loadFlightPath("project-app-container", {
      flight_path_id: flightPathId
    });

    return () => {
      offBack();
      window.FH2.destroyFlightPath();
    };
  }, [flightPathId, state]);

  if (!flightPathId) {
    return (
      <div className="fh2-runtime-state">
        <strong>Kein Flugverlauf ausgewählt.</strong>
        <span>Flight-Path-ID eingeben, um einen tatsächlich geflogenen Pfad zu öffnen.</span>
      </div>
    );
  }

  return (
    <RuntimeBoundary>
      <div className="fh2-component-frame">
        <div className="fh2-component-meta">{lastEvent}</div>
        <ProjectDom />
      </div>
    </RuntimeBoundary>
  );
}

export function Fh2VirtualCockpit({
  gatewaySn,
  droneSn
}: {
  gatewaySn: string;
  droneSn: string;
}) {
  const { state, config } = useFh2();

  useEffect(() => {
    if (
      state !== "ready" ||
      !config.nativeCockpitEnabled ||
      !gatewaySn ||
      !droneSn
    ) {
      return;
    }

    if (config.cockpitPropStyle === "snake") {
      window.FH2.loadCockpit("cockpit-app-container", {
        gateway_sn: gatewaySn,
        drone_sn: droneSn,
        map: true
      });
    } else {
      window.FH2.loadCockpit("cockpit-app-container", {
        gatewaySn,
        droneSn,
        map: true
      });
    }

    return () => {
      window.FH2.destroyCockpit(true);
    };
  }, [
    config.cockpitPropStyle,
    config.nativeCockpitEnabled,
    droneSn,
    gatewaySn,
    state
  ]);

  if (!config.nativeCockpitEnabled) {
    return (
      <div className="fh2-runtime-state">
        <strong>DJI Virtual Cockpit ist vorhanden, aber nicht freigeschaltet.</strong>
        <span>
          Setze VITE_FH2_NATIVE_COCKPIT_ENABLED=true nur dann, wenn die native
          FlightHub-2-Steuerfläche bewusst verwendet werden soll.
        </span>
      </div>
    );
  }

  if (!gatewaySn || !droneSn) {
    return (
      <div className="fh2-runtime-state">
        <strong>Gateway/Aircraft-Zuordnung fehlt.</strong>
        <span>Wähle zuerst ein über update_topo erkanntes Gateway mit Aircraft.</span>
      </div>
    );
  }

  return (
    <RuntimeBoundary>
      <div className="fh2-official-shell fh2-cockpit-shell">
        <div id="cockpit-header-container" />
        <div className="fh2-project-details">
          <div id="project-app-container" />
          <div id="project-middle-container" />
          <div id="project-right-micro-app" className="fh2-right-micro-app">
            <div className="fh2-maps-micro-app">
              <div className="cockpit-left-border-container" />
              <div id="project-map-app-placeholder" className="fh2-map-placeholder">
                <div className="cockpit-dock-live-container" />
                <div id="map-app-global" className="fh2-map-app-container" />
                <div className="cockpit-bottom-border-container" />
              </div>
            </div>
            <div className="fh2-cockpit-panel">
              <div id="cockpit-app-container" className="fh2-fill-container" />
            </div>
          </div>
        </div>
      </div>
    </RuntimeBoundary>
  );
}
