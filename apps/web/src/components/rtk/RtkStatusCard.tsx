import type { RtkDeviceSnapshot } from "../../types/rtk.js";

export interface RtkStatusCardProps {
  snapshot: RtkDeviceSnapshot;
}

export function RtkStatusCard({ snapshot }: RtkStatusCardProps) {
  const state = visualState(snapshot);

  return (
    <article className="rtk-card">
      <div className="rtk-card__header">
        <div>
          <p className="eyebrow">RTK / GNSS</p>
          <h2>{snapshot.deviceId}</h2>
          <p className="muted">
            Gateway: {snapshot.gatewaySn ?? "noch nicht zugeordnet"}
          </p>
          <p className="muted">
            Mission: {snapshot.missionId ?? "keine aktive Flugsession"}
          </p>
        </div>
        <span className={"status-pill status-pill--" + state.tone}>
          <span className="status-dot" aria-hidden="true" />
          {state.label}
        </span>
      </div>

      <div className="metric-grid">
        <Metric label="RTK-Satelliten" value={number(snapshot.rtkSatellites)} />
        <Metric label="GPS-Satelliten" value={number(snapshot.gpsSatellites)} />
        <Metric label="Fix-State" value={snapshot.fixState} />
        <Metric label="Quality" value={number(snapshot.qualityCode)} />
        <Metric label="Mode Code" value={number(snapshot.modeCode)} />
        <Metric
          label="Airborne RTK"
          value={snapshot.airborneRtkFixingMode ? "aktiv" : "nein"}
        />
      </div>

      <div className="rtk-card__footer">
        <span>
          Letztes Update: {formatAge(snapshot.ageMs)}
        </span>
        <span className="muted">
          NTRIP-Konfiguration erfolgt am RC Pro / DJI Pilot 2
        </span>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span className="metric__label">{label}</span>
      <strong className="metric__value">{value}</strong>
    </div>
  );
}

function visualState(snapshot: RtkDeviceSnapshot): {
  label: string;
  tone: "good" | "warn" | "bad" | "stale";
} {
  if (snapshot.stale) return { label: "STALE", tone: "stale" };
  if (snapshot.isFixed) return { label: "FIX", tone: "good" };
  if (snapshot.fixState === "fixing") return { label: "FIXING", tone: "warn" };
  if (snapshot.fixState === "failed") return { label: "FIX FAILED", tone: "bad" };
  return { label: "NO FIX", tone: "warn" };
}

function number(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function formatAge(ageMs: number): string {
  if (ageMs < 1_000) return "gerade eben";
  return "vor " + Math.round(ageMs / 1_000) + " s";
}
