import { useMemo, useState } from "react";

import {
  useDjiPilotBridge
} from "../pilot-bridge/DjiPilotBridgeProvider.js";

type CaptureStage = "idle" | "capturing" | "captured" | "error";

interface RedactedEvidenceResponse {
  schema?: string;
  topologyPairMatch?: boolean;
  platformVersion?: string;
  thingConnected?: boolean;
  modules?: Record<string, boolean>;
  error?: string;
}

export function PilotJsbridgeEvidence() {
  const pilot = useDjiPilotBridge();
  const [stage, setStage] = useState<CaptureStage>("idle");
  const [message, setMessage] = useState(
    "Bereit für einen redigierten Pilot-2-JSBridge-Hardware-Capture."
  );
  const [result, setResult] = useState<RedactedEvidenceResponse | null>(null);

  const readiness = useMemo(() => ({
    jsbridge: pilot.state === "ready",
    license: pilot.snapshot.verified,
    version: Boolean(pilot.snapshot.version),
    remoteController: Boolean(
      pilot.snapshot.identity.remoteControllerSn
    ),
    aircraft: Boolean(pilot.snapshot.identity.aircraftSn)
  }), [
    pilot.snapshot.identity.aircraftSn,
    pilot.snapshot.identity.remoteControllerSn,
    pilot.snapshot.verified,
    pilot.snapshot.version,
    pilot.state
  ]);

  const canCapture = Object.values(readiness).every(Boolean);
  const missingRequirements = Object.entries(readiness)
    .filter(([, available]) => !available)
    .map(([name]) => name);
  const displayedMessage =
    stage === "idle"
      ? canCapture
        ? "Bereit für einen redigierten Pilot-2-JSBridge-Hardware-Capture."
        : `Warte auf JSBridge-Pflichtdaten: ${missingRequirements.join(", ")}.`
      : message;

  async function capture() {
    if (!canCapture) {
      setStage("error");
      setMessage(
        "Pilot 2 ist noch nicht vollständig bereit: License, Version sowie RC- und Aircraft-Identität müssen verfügbar sein."
      );
      return;
    }

    const remoteControllerSn =
      pilot.snapshot.identity.remoteControllerSn;
    const aircraftSn = pilot.snapshot.identity.aircraftSn;
    const version = pilot.snapshot.version;
    if (!remoteControllerSn || !aircraftSn || !version) return;

    setStage("capturing");
    setMessage(
      "JSBridge-Runtime wird mit der aktuellen FH2-Topologie abgeglichen und serverseitig redigiert …"
    );
    setResult(null);

    try {
      const response = await fetch("/api/dji/pilot2/evidence", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          bridgePresent: true,
          platformIsVerified: pilot.snapshot.verified,
          version,
          remoteControllerSn,
          aircraftSn,
          modules: pilot.snapshot.modules,
          ...(pilot.snapshot.thingConnected !== undefined
            ? { thingConnected: pilot.snapshot.thingConnected }
            : {}),
          ...(pilot.snapshot.wsConnected !== undefined
            ? { wsConnected: pilot.snapshot.wsConnected }
            : {})
        })
      });

      const payload = (await response.json()) as RedactedEvidenceResponse;
      if (!response.ok) {
        throw new Error(
          payload.error ?? `Pilot-2-Evidence HTTP ${response.status}`
        );
      }

      setResult(payload);
      setStage("captured");
      setMessage(
        "Redigierter JSBridge-Capture wurde serverseitig erzeugt. Roh-Seriennummern werden nicht im Evidence-Endpunkt gespeichert oder ausgegeben."
      );
    } catch (error) {
      setStage("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="pilot-bootstrap">
      <section className="pilot-bootstrap__card">
        <h1>FH2 · Pilot 2 JSBridge Evidence</h1>

        <p>
          Dieser Hardware-Capture liest ausschließlich den bereits
          verifizierten, read-only DJI-Pilot-2-JSBridge-Zustand. Er lädt keine
          Module und erteilt keine Flight-Control-, Lease- oder DRC-Rechte.
        </p>

        <div className="pilot-bootstrap__status" data-stage={stage}>
          <strong>JSBridge:</strong> {pilot.state}
          <br />
          <strong>License:</strong>{" "}
          {pilot.snapshot.verified ? "verifiziert" : "nicht verifiziert"}
          <br />
          <strong>Thing:</strong>{" "}
          {pilot.snapshot.modules.thing
            ? pilot.snapshot.thingConnected
              ? "verbunden"
              : "geladen, nicht verbunden"
            : "nicht geladen"}
          <br />
          <strong>Pilot-Version:</strong>{" "}
          {readiness.version ? "verfügbar" : "fehlt"}
          <br />
          <strong>RC-Identität:</strong>{" "}
          {readiness.remoteController ? "verfügbar" : "fehlt"}
          <br />
          <strong>Aircraft-Identität:</strong>{" "}
          {readiness.aircraft ? "verfügbar" : "fehlt"}
          <br />
          <strong>Status:</strong> {displayedMessage}
          {pilot.error && (
            <>
              <br />
              <strong>JSBridge-Fehler:</strong> {pilot.error}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => void capture()}
          disabled={!canCapture || stage === "capturing"}
          title={
            canCapture
              ? "Capture bereit"
              : `Fehlt: ${missingRequirements.join(", ")}`
          }
        >
          Redigierte JSBridge-Evidence erfassen
        </button>

        {result && (
          <div className="pilot-bootstrap__status" data-stage="captured">
            <strong>Schema:</strong> {result.schema ?? "–"}
            <br />
            <strong>Topologie:</strong>{" "}
            {result.topologyPairMatch ? "exakt bestätigt" : "nicht bestätigt"}
            <br />
            <strong>Pilot-Version:</strong>{" "}
            {result.platformVersion ?? "–"}
            <br />
            <strong>Thing-Verbindung:</strong>{" "}
            {result.thingConnected === true
              ? "aktiv"
              : result.thingConnected === false
                ? "inaktiv"
                : "nicht erfasst"}
          </div>
        )}

        <p className="muted">
          Der Control-API-Endpunkt hasht RC- und Aircraft-Identitäten sofort
          per SHA-256 und speichert nur die redigierte Evidence im
          Arbeitsspeicher. Die Rohidentitäten werden weder in dieses UI
          zurückgegeben noch in das öffentliche Fixture geschrieben.
        </p>
      </section>
    </main>
  );
}
