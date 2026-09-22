import { useEffect, useMemo, useState } from "react";

import { RtkDashboard } from "../rtk/RtkDashboard.js";
import { useFh2 } from "../../fh2/Fh2Provider.js";
import { useFh2CesiumViewer } from "../../fh2/useFh2CesiumViewer.js";
import {
  Fh2OverlayController,
  type Fh2OverlayTopology
} from "../../fh2/Fh2OverlayController.js";
import {
  Fh2FlightPathViewer,
  Fh2ProjectMap,
  Fh2VirtualCockpit,
  Fh2WaylineCreation,
  Fh2WaylineEditor
} from "./Fh2Views.js";

type WorkspaceView =
  | "project"
  | "route-create"
  | "route-edit"
  | "flight-history"
  | "cockpit"
  | "rtk";

interface DevicePair {
  gatewaySn: string;
  droneSn: string;
  label: string;
}

function productName(type: number, subType: number): string {
  if (type === 144 && subType === 0) return "RC Pro Enterprise";
  if (type === 174 && subType === 0) return "RC Plus 2";
  if (type === 77 && subType === 0) return "Mavic 3E";
  if (type === 77 && subType === 1) return "Mavic 3T";
  if (type === 99 && subType === 0) return "Matrice 4E";
  if (type === 99 && subType === 1) return "Matrice 4T";
  return `DJI ${type}/${subType}`;
}

export function Fh2Workspace() {
  const { config, state } = useFh2();
  const cesiumViewer = useFh2CesiumViewer("global");
  const [view, setView] = useState<WorkspaceView>("project");
  const [topology, setTopology] = useState<Fh2OverlayTopology[]>([]);
  const [selectedPair, setSelectedPair] = useState("");
  const [waylineId, setWaylineId] = useState(config.defaultWaylineId);
  const [flightPathId, setFlightPathId] = useState(config.defaultFlightPathId);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/dji/topology", {
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Topology HTTP ${response.status}`);
        }
        return response.json() as Promise<Fh2OverlayTopology[]>;
      })
      .then((data) => {
        if (!cancelled) setTopology(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTopology([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const pairs = useMemo<DevicePair[]>(() => {
    return topology.flatMap((gateway) =>
      gateway.subDevices.map((device) => ({
        gatewaySn: gateway.gatewaySn,
        droneSn: device.sn,
        label: `${productName(device.product.type, device.product.subType)} · ${device.sn} via ${productName(gateway.product.type, gateway.product.subType)}`
      }))
    );
  }, [topology]);

  useEffect(() => {
    if (selectedPair) return;

    const configured =
      config.defaultGatewaySn && config.defaultDroneSn
        ? `${config.defaultGatewaySn}::${config.defaultDroneSn}`
        : "";

    if (configured) {
      setSelectedPair(configured);
      return;
    }

    const first = pairs[0];
    if (first) {
      setSelectedPair(`${first.gatewaySn}::${first.droneSn}`);
    }
  }, [
    config.defaultDroneSn,
    config.defaultGatewaySn,
    pairs,
    selectedPair
  ]);

  const [gatewaySn = "", droneSn = ""] = selectedPair.split("::");

  return (
    <section className="fh2-workspace">
      <div className="fh2-workspace__toolbar">
        <div className="fh2-view-tabs" role="tablist" aria-label="FH2 Bereiche">
          <ViewButton active={view === "project"} onClick={() => setView("project")}>
            Projektkarte
          </ViewButton>
          <ViewButton active={view === "route-create"} onClick={() => setView("route-create")}>
            Route anlegen
          </ViewButton>
          <ViewButton active={view === "route-edit"} onClick={() => setView("route-edit")}>
            Route bearbeiten
          </ViewButton>
          <ViewButton active={view === "flight-history"} onClick={() => setView("flight-history")}>
            Flugverlauf
          </ViewButton>
          <ViewButton active={view === "cockpit"} onClick={() => setView("cockpit")}>
            Virtual Cockpit
          </ViewButton>
          <ViewButton active={view === "rtk"} onClick={() => setView("rtk")}>
            RTK
          </ViewButton>
        </div>

        <div className="fh2-runtime-indicators">
          <span className={`fh2-runtime-pill fh2-runtime-pill--${state}`}>
            FH2 {state}
          </span>
          <span className="fh2-runtime-pill">
            Cesium {cesiumViewer ? "bereit" : "–"}
          </span>
        </div>
      </div>

      <div className="fh2-context-bar">
        <label>
          <span>Gateway + Aircraft</span>
          <select
            value={selectedPair}
            onChange={(event) => setSelectedPair(event.target.value)}
          >
            {!selectedPair && <option value="">Keine Topologie erkannt</option>}
            {pairs.map((pair) => {
              const value = `${pair.gatewaySn}::${pair.droneSn}`;
              return (
                <option key={value} value={value}>
                  {pair.label}
                </option>
              );
            })}
            {selectedPair &&
              !pairs.some(
                (pair) => `${pair.gatewaySn}::${pair.droneSn}` === selectedPair
              ) && (
                <option value={selectedPair}>
                  {droneSn || "Aircraft"} via {gatewaySn || "Gateway"} · konfiguriert
                </option>
              )}
          </select>
        </label>

        {view === "route-edit" && (
          <label>
            <span>Wayline-ID</span>
            <input
              value={waylineId}
              onChange={(event) => setWaylineId(event.target.value.trim())}
              placeholder="Wayline UUID"
            />
          </label>
        )}

        {view === "flight-history" && (
          <label>
            <span>Flight-Path-ID</span>
            <input
              value={flightPathId}
              onChange={(event) => setFlightPathId(event.target.value.trim())}
              placeholder="Flight Path UUID"
            />
          </label>
        )}
        <Fh2OverlayController topology={topology} />
      </div>

      <div className="fh2-workspace__content">
        {view === "project" && <Fh2ProjectMap />}
        {view === "route-create" && <Fh2WaylineCreation />}
        {view === "route-edit" && <Fh2WaylineEditor waylineId={waylineId} />}
        {view === "flight-history" && (
          <Fh2FlightPathViewer flightPathId={flightPathId} />
        )}
        {view === "cockpit" && (
          <Fh2VirtualCockpit gatewaySn={gatewaySn} droneSn={droneSn} />
        )}
        {view === "rtk" && <RtkDashboard />}
      </div>
    </section>
  );
}

function ViewButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className={active ? "fh2-view-tab is-active" : "fh2-view-tab"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
