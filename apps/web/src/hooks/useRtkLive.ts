import { useEffect, useMemo, useState } from "react";
import type {
  RtkDeviceSnapshot,
  RtkStatusEvent,
  RtkTransitionEvent
} from "../types/rtk.js";

export interface RtkLiveState {
  devices: RtkDeviceSnapshot[];
  transitions: RtkTransitionEvent[];
  connected: boolean;
  error: string | null;
}

export function useRtkLive(): RtkLiveState {
  const [devices, setDevices] = useState<Record<string, RtkDeviceSnapshot>>({});
  const [transitions, setTransitions] = useState<RtkTransitionEvent[]>([]);
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
      const payload = JSON.parse((event as MessageEvent<string>).data) as
        | RtkDeviceSnapshot
        | RtkDeviceSnapshot[]
        | undefined;

      const list = Array.isArray(payload) ? payload : payload ? [payload] : [];
      setDevices(
        Object.fromEntries(list.map((snapshot) => [snapshot.deviceId, snapshot]))
      );
    });

    source.addEventListener("rtk-status", (event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data
      ) as RtkStatusEvent;

      setDevices((current) => {
        const previous = current[payload.deviceId];
        const sampledAt = payload.status.sampledAt;
        const ageMs = Math.max(0, Date.now() - sampledAt);

        return {
          ...current,
          [payload.deviceId]: {
            deviceId: payload.deviceId,
            ...(payload.gatewaySn ? { gatewaySn: payload.gatewaySn } : {}),
            ...payload.status,
            stale: ageMs > 5_000,
            ageMs,
            ...(previous?.gatewaySn && !payload.gatewaySn
              ? { gatewaySn: previous.gatewaySn }
              : {})
          }
        };
      });
    });

    source.addEventListener("rtk-fix-transition", (event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data
      ) as RtkTransitionEvent;

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
    connected,
    error
  };
}
