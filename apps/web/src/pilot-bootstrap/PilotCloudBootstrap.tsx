import { useEffect, useMemo, useState, type FormEvent } from "react";

type Stage =
  | "idle"
  | "verifying"
  | "loading"
  | "connected"
  | "waiting"
  | "error";

interface BridgeEnvelope {
  code: number;
  message?: string;
  data?: unknown;
}

function decodeEnvelope(raw: unknown, operation: string): unknown {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      value = raw;
    }
  }

  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { code?: unknown }).code === "number"
  ) {
    const envelope = value as BridgeEnvelope;
    if (envelope.code !== 0) {
      throw new Error(
        `${operation} fehlgeschlagen (${envelope.code}): ${envelope.message ?? "ohne Fehlermeldung"}`
      );
    }
    return envelope.data;
  }

  return value;
}

function asBoolean(raw: unknown): boolean {
  const value = decodeEnvelope(raw, "boolean");
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function PilotCloudBootstrap() {
  const workspaceId = String(
    import.meta.env.VITE_DJI_PILOT_WORKSPACE_ID ?? ""
  ).trim();

  const defaultHost = useMemo(() => {
    const hostname = window.location.hostname || "192.168.178.63";
    return `tcp://${hostname}:1885`;
  }, []);

  const [appId, setAppId] = useState("");
  const [appKey, setAppKey] = useState("");
  const [license, setLicense] = useState("");
  const [mqttHost, setMqttHost] = useState(defaultHost);
  const [mqttUsername, setMqttUsername] = useState("dji-gateway-rcpro1");
  const [mqttPassword, setMqttPassword] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState(
    "Bereit. Zugangsdaten werden nur an DJI Pilot 2 JSBridge übergeben und nicht im Browser gespeichert."
  );

  const bridgeAvailable = Boolean(window.djiBridge);

  function configurePilotWorkspace(bridge: NonNullable<typeof window.djiBridge>): void {
    if (!workspaceId || !UUID_PATTERN.test(workspaceId)) {
      throw new Error(
        "DJI Pilot Workspace-ID fehlt oder ist keine UUID. " +
        "Setze DJI_PILOT_WORKSPACE_ID auf dem Pi und baue das Web-Image neu."
      );
    }

    decodeEnvelope(
      bridge.platformSetWorkspaceId(workspaceId),
      "platformSetWorkspaceId"
    );
    decodeEnvelope(
      bridge.platformSetInformation(
        "FH2",
        "FH2 On-Premises",
        "FH2 Pilot-to-Cloud"
      ),
      "platformSetInformation"
    );
  }

  useEffect(() => {
    const bridge = window.djiBridge;
    if (!bridge) return;

    // Match DJI's documented/default root-WebView behavior. Persistence of the
    // native cloud session is verified independently on real hardware.
    bridge.onBackClick = () => false;

    try {
      const verified = asBoolean(bridge.platformIsVerified());
      const thingLoaded = verified
        ? asBoolean(bridge.platformIsComponentLoaded("thing"))
        : false;
      const thingConnected = thingLoaded
        ? asBoolean(bridge.thingGetConnectState())
        : false;

      if (thingConnected) {
        configurePilotWorkspace(bridge);
        setStage("connected");
        setMessage(
          "DJI Pilot 2 ist mit dem FH2-MQTT-Broker verbunden und der " +
          "FH2-Workspace ist registriert."
        );
      } else if (thingLoaded) {
        setStage("waiting");
        setMessage(
          "Das DJI-Thing-Modul ist weiterhin geladen, meldet den MQTT-Link " +
          "aber derzeit nicht als verbunden."
        );
      }
    } catch (error) {
      setStage("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const bridge = window.djiBridge;
    if (!bridge) {
      setStage("error");
      setMessage("DJI Pilot 2 JSBridge ist in diesem Browser nicht verfügbar.");
      return;
    }

    const normalizedAppId = appId.trim();
    const normalizedAppKey = appKey.trim();
    const normalizedLicense = license.trim();
    const normalizedMqttHost = mqttHost.trim();
    const normalizedMqttUsername = mqttUsername.trim();

    if (
      !normalizedAppId ||
      !normalizedAppKey ||
      !normalizedLicense ||
      !normalizedMqttHost ||
      !normalizedMqttUsername ||
      !mqttPassword
    ) {
      setStage("error");
      setMessage("Alle Felder sind erforderlich.");
      return;
    }

    if (!/^(tcp|ws):\/\//i.test(normalizedMqttHost)) {
      setStage("error");
      setMessage("DJI Pilot 2 erwartet für das Thing-Modul tcp:// oder ws://.");
      return;
    }

    try {
      setStage("verifying");
      setMessage("DJI Cloud API License wird in Pilot 2 verifiziert …");
      decodeEnvelope(
        bridge.platformVerifyLicense(
          normalizedAppId,
          normalizedAppKey,
          normalizedLicense
        ),
        "platformVerifyLicense"
      );

      const verified = asBoolean(bridge.platformIsVerified());
      if (!verified) {
        throw new Error("Pilot 2 meldet die Cloud-API-Lizenz weiterhin als unverifiziert.");
      }

      const remoteControllerSn = String(
        decodeEnvelope(
          bridge.platformGetRemoteControllerSN(),
          "platformGetRemoteControllerSN"
        ) ?? ""
      ).trim();
      if (!remoteControllerSn) {
        throw new Error("Pilot 2 liefert keine RC-Seriennummer.");
      }

      configurePilotWorkspace(bridge);

      setStage("loading");
      setMessage(
        "FH2-Workspace registriert; Thing-Modul wird mit dem FH2-MQTT-Broker verbunden …"
      );

      window.fh2ThingConnectCallback = (raw: unknown) => {
        try {
          const connected = asBoolean(raw);
          if (connected) {
            setStage("connected");
            setMessage(
              "DJI Pilot 2 ist mit dem FH2-MQTT-Broker verbunden und der " +
              "FH2-Workspace ist registriert."
            );
          } else {
            setStage("waiting");
            setMessage("Pilot 2 hat den MQTT-Link noch nicht als verbunden gemeldet.");
          }
        } catch (error) {
          setStage("error");
          setMessage(error instanceof Error ? error.message : String(error));
        }
      };

      decodeEnvelope(
        bridge.platformLoadComponent(
          "thing",
          JSON.stringify({
            host: normalizedMqttHost,
            connectCallback: "fh2ThingConnectCallback",
            username: normalizedMqttUsername,
            password: mqttPassword
          })
        ),
        "platformLoadComponent(thing)"
      );

      // Secrets are intentionally discarded from component state immediately
      // after handing them to DJI Pilot 2.
      setAppKey("");
      setLicense("");
      setMqttPassword("");

      await new Promise((resolve) => window.setTimeout(resolve, 750));
      const connected = asBoolean(bridge.thingGetConnectState());
      if (connected) {
        setStage("connected");
        setMessage(
          "DJI Pilot 2 ist mit dem FH2-MQTT-Broker verbunden und der " +
          "FH2-Workspace ist registriert."
        );
      } else {
        setStage("waiting");
        setMessage(
          "Thing-Modul geladen. Pilot 2 verbindet noch; prüfe danach EMQX/AuthZ auf dem Pi."
        );
      }
    } catch (error) {
      setStage("error");
      const detail = error instanceof Error ? error.message : String(error);
      if (/bad base-64/i.test(detail)) {
        setMessage(
          "DJI Pilot 2 hat die Cloud-API-Lizenzdaten abgelehnt (bad base-64). " +
          "App ID, App Key und App Basic License müssen unverändert aus derselben " +
          "Cloud-API-App stammen. Keine Base64-Konvertierung vornehmen."
        );
      } else {
        setMessage(detail);
      }
    }
  }

  return (
    <main className="pilot-bootstrap">
      <section className="pilot-bootstrap__card">
        <h1>FH2 · DJI Pilot 2 Cloud Bootstrap</h1>
        <p>
          Dieser Bildschirm verbindet ausschließlich das DJI-Pilot-2-Thing-Modul
          mit dem FH2-MQTT-Broker. Er erteilt keine Flight-Control-Rechte.
        </p>

        <div className="pilot-bootstrap__status" data-stage={stage}>
          <strong>JSBridge:</strong> {bridgeAvailable ? "verfügbar" : "nicht verfügbar"}
          <br />
          <strong>Status:</strong> {message}
        </div>

        <form onSubmit={connect} autoComplete="off">
          <fieldset>
            <legend>DJI Cloud API License</legend>

            <label>
              App ID
              <input
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
                inputMode="text"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>

            <label>
              App Key
              <input
                type="password"
                value={appKey}
                onChange={(event) => setAppKey(event.target.value)}
                autoComplete="new-password"
              />
            </label>

            <label>
              License
              <input
                type="password"
                value={license}
                onChange={(event) => setLicense(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </fieldset>

          <fieldset>
            <legend>FH2 MQTT</legend>

            <label>
              Broker
              <input
                value={mqttHost}
                onChange={(event) => setMqttHost(event.target.value)}
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>

            <label>
              Username
              <input
                value={mqttUsername}
                onChange={(event) => setMqttUsername(event.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </label>

            <label>
              Passwort
              <input
                type="password"
                value={mqttPassword}
                onChange={(event) => setMqttPassword(event.target.value)}
                autoComplete="new-password"
              />
            </label>
          </fieldset>

          <button type="submit" disabled={!bridgeAvailable || stage === "verifying" || stage === "loading"}>
            License verifizieren und MQTT verbinden
          </button>
        </form>

        <p className="muted">
          App Key, License und MQTT-Passwort werden von dieser Seite an keinen
          FH2-HTTP-Endpunkt gesendet und nicht in Browser-Storage gespeichert.
          Das MQTT-Passwort wird von Pilot 2 anschließend für die Broker-
          Authentifizierung verwendet.
        </p>

        <p className="muted">
          FH2 registriert Workspace-ID und Plattforminformation vor dem Laden
          des DJI-Thing-Moduls. Diese Reihenfolge entspricht dem offiziellen
          DJI-Cloud-API-Demo. Die Persistenz nach Wechsel in die
          Pilot-2-Flugansicht bleibt trotzdem ein separates Hardware-Gate.
          <strong> Abmelden</strong> beendet die Cloud-Plattform ausdrücklich.
        </p>
      </section>
    </main>
  );
}
