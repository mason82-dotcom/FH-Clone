import { useEffect, useMemo, useState } from "react";

export interface TelemetryParameterSample {
  adapterId: string;
  deviceId: string;
  key: string;
  rawKey?: string;
  value: unknown;
  unit?: string;
  sampledAt: number;
  quality?: "good" | "stale" | "invalid" | "unknown";
}

export type TelemetrySnapshot = Record<
  string,
  TelemetryParameterSample
>;

export type TelemetrySourceSnapshot = Record<
  string,
  Record<string, TelemetryParameterSample>
>;

export interface DroneTelemetryState {
  telemetry: TelemetrySnapshot;
  sources: TelemetrySourceSnapshot;
  connected: boolean;
  loading: boolean;
  error: string | null;
  refreshedAt?: number;
}

export function useDroneTelemetry(
  deviceId: string,
  refreshMs = 1_000
): DroneTelemetryState {
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>({});
  const [sources, setSources] = useState<TelemetrySourceSnapshot>({});
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(Boolean(deviceId));
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<number | undefined>();

  useEffect(() => {
    if (!deviceId) {
      setTelemetry({});
      setSources({});
      setConnected(false);
      setLoading(false);
      setError(null);
      setRefreshedAt(undefined);
      return;
    }

    setTelemetry({});
    setSources({});
    setConnected(false);
    setLoading(true);
    setError(null);
    setRefreshedAt(undefined);

    let cancelled = false;
    let controller: AbortController | undefined;

    const refresh = async () => {
      if (controller) return;
      const request = new AbortController();
      controller = request;

      try {
        const encoded = encodeURIComponent(deviceId);
        const [telemetryResponse, sourcesResponse] = await Promise.all([
          fetch(`/api/devices/${encoded}/telemetry`, {
            headers: { accept: "application/json" },
            signal: request.signal
          }),
          fetch(`/api/devices/${encoded}/telemetry/sources`, {
            headers: { accept: "application/json" },
            signal: request.signal
          })
        ]);

        if (!telemetryResponse.ok) {
          throw new Error(
            `Telemetry HTTP ${telemetryResponse.status}`
          );
        }
        if (!sourcesResponse.ok) {
          throw new Error(
            `Telemetry sources HTTP ${sourcesResponse.status}`
          );
        }

        const nextTelemetry =
          (await telemetryResponse.json()) as TelemetrySnapshot;
        const nextSources =
          (await sourcesResponse.json()) as TelemetrySourceSnapshot;

        if (!cancelled && controller === request) {
          setTelemetry(isRecord(nextTelemetry) ? nextTelemetry : {});
          setSources(isRecord(nextSources) ? nextSources : {});
          setConnected(true);
          setLoading(false);
          setError(null);
          setRefreshedAt(Date.now());
        }
      } catch (error) {
        if (
          cancelled ||
          request.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        if (!cancelled && controller === request) {
          setConnected(false);
          setLoading(false);
          setError(
            error instanceof Error
              ? error.message
              : "Telemetrie konnte nicht aktualisiert werden"
          );
        }
      } finally {
        if (controller === request) controller = undefined;
      }
    };

    setLoading(true);
    void refresh();
    const timer = window.setInterval(
      () => void refresh(),
      Math.max(500, refreshMs)
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      controller?.abort();
    };
  }, [deviceId, refreshMs]);

  return useMemo(
    () => ({
      telemetry,
      sources,
      connected,
      loading,
      error,
      ...(refreshedAt !== undefined ? { refreshedAt } : {})
    }),
    [
      telemetry,
      sources,
      connected,
      loading,
      error,
      refreshedAt
    ]
  );
}

function isRecord(
  value: unknown
): value is Record<string, any> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}
