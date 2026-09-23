import { useEffect, useMemo, useState } from "react";
import type {
  RtkDeviceSnapshot,
  RtkHistorySample,
  RtkStatusEvent,
  RtkTransitionEvent
} from "../types/rtk.js";
import {
  asRtkSnapshotPayload,
  isRtkStatusEvent,
  isRtkTransitionEvent,
  parseSseJsonEvent
} from "./rtkSseGuards.js";

export interface RtkLiveState {
  devices: RtkDeviceSnapshot[];
  transitions: RtkTransitionEvent[];
  history: Record<string, RtkHistorySample[]>;
  connected: boolean;
  error: string | null;
}

export function useRtkLive(): RtkLiveState {
  const [devices, setDevices] = useState<Record<string, RtkDeviceSnapshot>>({});
  const [transitions, setTransitions] = useState<RtkTransitionEvent[]>([]);
  const [history, setHistory] = useState<Record<string, RtkHistorySample[]>>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/events/rtk");

    source.onopen = () => {
      setConnected(true);
      setError(null);
    };

    source.onerror = () => {
      setConnected(false);
      setError("RTK-Liveverbindung unterbrochen");
    };

    source.addEventListener("snapshot", (event) => {
      const list = asRtkSnapshotPayload(parseSseJsonEvent(event));
      if (!list) return;
      setDevices(
        Object.fromEntries(list.map((snapshot) => [snapshot.deviceId, snapshot]))
      );

      setHistory(
        Object.fromEntries(
          list.map((snapshot) => [
            snapshot.deviceId,
            [
              {
                sampledAt: snapshot.sampledAt,
                fixState: snapshot.fixState,
                ...(snapshot.gpsSatellites !== undefined
                  ? { gpsSatellites: snapshot.gpsSatellites }
                  : {}),
                ...(snapshot.rtkSatellites !== undefined
                  ? { rtkSatellites: snapshot.rtkSatellites }
                  : {}),
                ...(snapshot.isFixed !== undefined
                  ? { isFixed: snapshot.isFixed }
                  : {})
              }
            ]
          ])
        )
      );
    });

    source.addEventListener("rtk-status", (event) => {
      const candidate = parseSseJsonEvent(event);
      if (!isRtkStatusEvent(candidate)) return;
      const payload = candidate;

      setDevices((current) => {
        const previous = current[payload.deviceId];
        const sampledAt = payload.status.sampledAt;
        const ageMs = Math.max(0, Date.now() - sampledAt);

        return {
          ...current,
          [payload.deviceId]: {
            deviceId: payload.deviceId,
            ...(payload.gatewaySn ? { gatewaySn: payload.gatewaySn } : {}),
            ...(payload.missionId ? { missionId: payload.missionId } : {}),
            ...payload.status,
            stale: ageMs > 5_000,
            ageMs,
            ...(previous?.gatewaySn && !payload.gatewaySn
              ? { gatewaySn: previous.gatewaySn }
              : {}),
            ...(previous?.missionId && !payload.missionId
              ? { missionId: previous.missionId }
              : {})
          }
        };
      });

      setHistory((current) => {
        const nextSample: RtkHistorySample = {
          sampledAt: payload.status.sampledAt,
          fixState: payload.status.fixState,
          ...(payload.status.gpsSatellites !== undefined
            ? { gpsSatellites: payload.status.gpsSatellites }
            : {}),
          ...(payload.status.rtkSatellites !== undefined
            ? { rtkSatellites: payload.status.rtkSatellites }
            : {}),
          ...(payload.status.isFixed !== undefined
            ? { isFixed: payload.status.isFixed }
            : {})
        };

        const previous = current[payload.deviceId] ?? [];
        const deduplicated =
          previous.at(-1)?.sampledAt === nextSample.sampledAt
            ? previous
            : [...previous, nextSample];

        return {
          ...current,
          [payload.deviceId]: deduplicated.slice(-120)
        };
      });
    });

    source.addEventListener("rtk-fix-transition", (event) => {
      const candidate = parseSseJsonEvent(event);
      if (!isRtkTransitionEvent(candidate)) return;
      const payload = candidate;

      setTransitions((current) => [payload, ...current].slice(0, 20));
    });

    return () => source.close();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDevices((current) => {
        const now = Date.now();
        return Object.fromEntries(
          Object.entries(current).map(([key, snapshot]) => {
            const ageMs = Math.max(0, now - snapshot.sampledAt);
            return [
              key,
              {
                ...snapshot,
                ageMs,
                stale: ageMs > 5_000
              }
            ];
          })
        );
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, []);

  const sortedDevices = useMemo(
    () => Object.values(devices).sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
    [devices]
  );

  return {
    devices: sortedDevices,
    transitions,
    history,
    connected,
    error
  };
}

