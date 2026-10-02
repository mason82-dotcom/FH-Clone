import { useEffect, useMemo, useState } from "react";

import { useRtkLive } from "../../hooks/useRtkLive.js";
import {
  useDroneTelemetry,
  type TelemetryParameterSample,
  type TelemetrySourceSnapshot
} from "../../hooks/useDroneTelemetry.js";
import { RtkSatelliteChart } from "../rtk/RtkSatelliteChart.js";

export interface DroneStatusDashboardProps {
  droneSn: string;
  gatewaySn: string;
}

interface TelemetryRow {
  key: string;
  adapterId: string;
  sample: TelemetryParameterSample;
}

interface MetricSpec {
  key: string;
  label: string;
  digits?: number;
  value?: (sample: TelemetryParameterSample) => string;
}

const SUMMARY_GROUPS: Array<{
  id: string;
  title: string;
  eyebrow: string;
  metrics: MetricSpec[];
}> = [
  {
    id: "position",
    title: "Position & Höhe",
    eyebrow: "Navigation",
    metrics: [
      { key: "flight.position.latitude_deg", label: "Breitengrad", digits: 7 },
      { key: "flight.position.longitude_deg", label: "Längengrad", digits: 7 },
      { key: "flight.altitude.ellipsoid_m", label: "Ellipsoid-Höhe", digits: 2 },
      { key: "flight.altitude.relative_m", label: "Relative Höhe", digits: 2 },
      { key: "raw.msdk.flight.location.altitude_m", label: "MSDK Raw-Höhe", digits: 2 }
    ]
  },
  {
    id: "motion",
    title: "Fluglage & Bewegung",
    eyebrow: "Flight Controller",
    metrics: [
      { key: "flight.attitude.yaw_deg", label: "Yaw", digits: 1 },
      { key: "flight.attitude.pitch_deg", label: "Pitch", digits: 1 },
      { key: "flight.attitude.roll_deg", label: "Roll", digits: 1 },
      { key: "flight.velocity.horizontal_mps", label: "Horizontal", digits: 2 },
      { key: "flight.velocity.vertical_mps", label: "Vertikal", digits: 2 },
      { key: "flight.mode.code", label: "Flight Mode Code" }
    ]
  },
  {
    id: "rtk",
    title: "GNSS & RTK",
    eyebrow: "Positionierung",
    metrics: [
      { key: "navigation.rtk.fix_status", label: "RTK Fix" },
      { key: "navigation.rtk.solution", label: "RTK Lösung" },
      { key: "navigation.rtk.fixed", label: "RTK Fixed" },
      { key: "navigation.rtk.satellites", label: "RTK-Satelliten" },
      { key: "navigation.gnss.gps_satellites", label: "GPS-Satelliten" },
      { key: "navigation.gnss.satellites", label: "GNSS-Satelliten" },
      { key: "navigation.gnss.quality_code", label: "GNSS Quality" },
      { key: "navigation.rtk.std.latitude_m", label: "RTK σ Lat", digits: 4 },
      { key: "navigation.rtk.std.longitude_m", label: "RTK σ Lon", digits: 4 },
      { key: "navigation.rtk.std.altitude_m", label: "RTK σ Höhe", digits: 4 }
    ]
  }
];

export function DroneStatusDashboard({
  droneSn,
  gatewaySn
}: DroneStatusDashboardProps) {
  const {
    telemetry,
    sources,
    connected,
    loading,
    error,
    refreshedAt
  } = useDroneTelemetry(droneSn, 1_000);
  const { devices: rtkDevices, history } = useRtkLive();
  const [filter, setFilter] = useState("");
  const [showRawOnly, setShowRawOnly] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1_000
    );
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(
    () => telemetryRows(sources),
    [sources]
  );
  const adapters = useMemo(
    () => [...new Set(rows.map((row) => row.adapterId))].sort(),
    [rows]
  );
  const latestSampleAt = useMemo(
    () => Math.max(
      0,
      ...rows.map((row) => row.sample.sampledAt)
    ),
    [rows]
  );
  const visibleRows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (showRawOnly && !row.key.startsWith("raw.")) return false;
      if (!needle) return true;
      return [
        row.key,
        row.sample.rawKey ?? "",
        row.adapterId,
        formatValue(row.sample.value)
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [filter, rows, showRawOnly]);

  const rtk = rtkDevices.find(
    (device) => device.deviceId === droneSn
  );

  if (!droneSn) {
    return (
      <section className="drone-status">
        <div className="empty-state">
          <strong>Kein Aircraft ausgewählt</strong>
          <span>
            Wähle oben ein Gateway/Aircraft-Paar aus.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="drone-status">
      <div className="drone-status__heading">
        <div>
          <p className="eyebrow">Aircraft Live Telemetry</p>
          <h1>Drohnenstatus</h1>
          <p className="subtitle">
            Vollständiger aktueller Parametersnapshot · {droneSn}
          </p>
          <p className="muted drone-status__identity">
            Gateway {gatewaySn || "–"} · Quellen {adapters.join(", ") || "noch keine"}
          </p>
        </div>

        <div className="drone-status__connection">
          <span
            className={
              "connection-dot " +
              (connected ? "is-online" : "is-offline")
            }
          />
          <div>
            <strong>
              {connected ? "Live" : loading ? "Verbinde…" : "Getrennt"}
            </strong>
            <span className="muted">
              {latestSampleAt > 0
                ? `jüngster Wert ${formatAge(now - latestSampleAt)}`
                : "noch keine Werte"}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="alert alert--warning">
          {error}. Letzter gültiger Snapshot bleibt sichtbar.
        </div>
      ) : null}

      <div className="drone-status__overview">
        <OverviewMetric label="Parameter" value={String(Object.keys(telemetry).length)} />
        <OverviewMetric label="Quellwerte" value={String(rows.length)} />
        <OverviewMetric label="Adapter" value={String(adapters.length)} />
        <OverviewMetric
          label="API Update"
          value={
            refreshedAt
              ? formatAge(now - refreshedAt)
              : "–"
          }
        />
      </div>

      <div className="drone-status__cards">
        {SUMMARY_GROUPS.map((group) => (
          <StatusGroup
            key={group.id}
            title={group.title}
            eyebrow={group.eyebrow}
            metrics={group.metrics}
            telemetry={telemetry}
            now={now}
          />
        ))}

        <DynamicStatusGroup
          title="Batterie"
          eyebrow="Energy"
          prefix="battery"
          telemetry={telemetry}
          now={now}
        />
        <DynamicStatusGroup
          title="Kamera"
          eyebrow="Payload"
          prefix="camera."
          telemetry={telemetry}
          now={now}
        />
        <DynamicStatusGroup
          title="Gimbal"
          eyebrow="Payload"
          prefix="gimbal."
          telemetry={telemetry}
          now={now}
        />
      </div>

      {rtk ? (
        <section className="drone-status__panel">
          <div className="events-panel__header">
            <div>
              <p className="eyebrow">RTK Verlauf</p>
              <h2>Satelliten & Fix-Stabilität</h2>
            </div>
            <span
              className={
                "status-pill status-pill--" +
                (rtk.stale
                  ? "stale"
                  : rtk.isFixed
                    ? "good"
                    : "warn")
              }
            >
              {rtk.stale
                ? "STALE"
                : rtk.isFixed
                  ? "FIX"
                  : rtk.fixState.toUpperCase()}
            </span>
          </div>
          <RtkSatelliteChart
            samples={history[droneSn] ?? []}
          />
        </section>
      ) : null}

      <section className="drone-status__panel">
        <div className="drone-status__table-header">
          <div>
            <p className="eyebrow">Alle übermittelten Werte</p>
            <h2>Parameter & Provenienz</h2>
            <p className="muted">
              Neu auftauchende DJI-/MSDK-Schlüssel erscheinen automatisch.
            </p>
          </div>
          <div className="drone-status__filters">
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Key, Rohschlüssel, Adapter oder Wert filtern"
              aria-label="Telemetrie filtern"
            />
            <label className="drone-status__raw-toggle">
              <input
                type="checkbox"
                checked={showRawOnly}
                onChange={(event) => setShowRawOnly(event.target.checked)}
              />
              <span>nur raw.*</span>
            </label>
          </div>
        </div>

        {visibleRows.length === 0 ? (
          <div className="drone-status__empty">
            {rows.length === 0
              ? "Noch keine Telemetrie für dieses Aircraft empfangen."
              : "Keine Werte entsprechen dem Filter."}
          </div>
        ) : (
          <div className="drone-status__table-wrap">
            <table className="drone-status__table">
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Wert</th>
                  <th>Einheit</th>
                  <th>Quelle</th>
                  <th>Qualität</th>
                  <th>Alter</th>
                  <th>Rohschlüssel</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => {
                  const age = Math.max(0, now - row.sample.sampledAt);
                  return (
                    <tr
                      key={`${row.key}::${row.adapterId}`}
                      className={age > 5_000 ? "is-stale" : ""}
                    >
                      <td>
                        <code>{row.key}</code>
                      </td>
                      <td className="drone-status__value-cell">
                        {formatValue(row.sample.value)}
                      </td>
                      <td>{row.sample.unit ?? "–"}</td>
                      <td>
                        <span className="drone-status__adapter">
                          {row.adapterId}
                        </span>
                      </td>
                      <td>
                        <QualityBadge quality={row.sample.quality} />
                      </td>
                      <td>{formatAge(age)}</td>
                      <td>
                        <code className="muted">
                          {row.sample.rawKey ?? "–"}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function StatusGroup({
  title,
  eyebrow,
  metrics,
  telemetry,
  now
}: {
  title: string;
  eyebrow: string;
  metrics: MetricSpec[];
  telemetry: Record<string, TelemetryParameterSample>;
  now: number;
}) {
  const available = metrics
    .map((metric) => ({
      metric,
      sample: telemetry[metric.key]
    }))
    .filter(
      (
        entry
      ): entry is {
        metric: MetricSpec;
        sample: TelemetryParameterSample;
      } => Boolean(entry.sample)
    );

  return (
    <article className="drone-status-card">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      {available.length === 0 ? (
        <p className="muted drone-status-card__empty">
          Noch keine Werte empfangen.
        </p>
      ) : (
        <div className="drone-status-card__metrics">
          {available.map(({ metric, sample }) => (
            <StatusMetric
              key={metric.key}
              label={metric.label}
              sample={sample}
              now={now}
              digits={metric.digits}
              format={metric.value}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function DynamicStatusGroup({
  title,
  eyebrow,
  prefix,
  telemetry,
  now
}: {
  title: string;
  eyebrow: string;
  prefix: string;
  telemetry: Record<string, TelemetryParameterSample>;
  now: number;
}) {
  const entries = Object.entries(telemetry)
    .filter(([key]) =>
      prefix === "battery"
        ? key.toLowerCase().includes("battery")
        : key.startsWith(prefix)
    )
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 12);

  if (entries.length === 0) return null;

  return (
    <article className="drone-status-card">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <div className="drone-status-card__metrics">
        {entries.map(([key, sample]) => (
          <StatusMetric
            key={key}
            label={shortLabel(key, prefix)}
            sample={sample}
            now={now}
          />
        ))}
      </div>
    </article>
  );
}

function StatusMetric({
  label,
  sample,
  now,
  digits,
  format
}: {
  label: string;
  sample: TelemetryParameterSample;
  now: number;
  digits?: number;
  format?: (sample: TelemetryParameterSample) => string;
}) {
  const age = Math.max(0, now - sample.sampledAt);
  return (
    <div className={age > 5_000 ? "status-metric is-stale" : "status-metric"}>
      <span className="status-metric__label">{label}</span>
      <strong className="status-metric__value">
        {format
          ? format(sample)
          : formatMetricValue(sample.value, digits)}
        {sample.unit ? (
          <small>{sample.unit}</small>
        ) : null}
      </strong>
      <span className="status-metric__meta">
        {sample.adapterId} · {formatAge(age)}
      </span>
    </div>
  );
}

function OverviewMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="drone-status__overview-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QualityBadge({
  quality
}: {
  quality?: TelemetryParameterSample["quality"];
}) {
  const label = quality ?? "unknown";
  return (
    <span className={`telemetry-quality telemetry-quality--${label}`}>
      {label}
    </span>
  );
}

function telemetryRows(
  sources: TelemetrySourceSnapshot
): TelemetryRow[] {
  return Object.entries(sources)
    .flatMap(([key, byAdapter]) =>
      Object.entries(byAdapter).map(
        ([adapterId, sample]) => ({
          key,
          adapterId,
          sample
        })
      )
    )
    .sort((left, right) =>
      left.key.localeCompare(right.key) ||
      left.adapterId.localeCompare(right.adapterId)
    );
}

function formatMetricValue(
  value: unknown,
  digits?: number
): string {
  if (typeof value === "number") {
    return digits === undefined
      ? String(value)
      : value.toFixed(digits);
  }
  if (typeof value === "boolean") {
    return value ? "ja" : "nein";
  }
  if (typeof value === "string") {
    return humanize(value);
  }
  return formatValue(value);
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "–";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "–";
  }
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function shortLabel(key: string, prefix: string): string {
  const normalized =
    prefix === "battery"
      ? key.replace(/^raw\.dji-cloud\./, "")
      : key.startsWith(prefix)
        ? key.slice(prefix.length)
        : key;
  return normalized
    .replaceAll(".", " · ")
    .replaceAll("_", " ");
}

function formatAge(ageMs: number): string {
  if (ageMs < 1_000) return "jetzt";
  if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)} s`;
  return `${Math.round(ageMs / 60_000)} min`;
}
