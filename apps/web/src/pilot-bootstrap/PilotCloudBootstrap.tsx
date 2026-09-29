import { useMemo, useState, type FormEvent } from "react";

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

export function PilotCloudBootstrap() {
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
    "Bereit. Zugangsdaten werden nur an DJI Pilot 2 JSBridge übergeben und nicht gespeichert."
  );

  const bridgeAvailable = Boolean(window.djiBridge);

  async function connect(event: FormEvent) {
    event.preventDefault();
    const bridge = window.djiBridge;
    if (!bridge) {
      setStage("error");
      setMessage("DJI Pilot 2 JSBridge ist in diesem Browser nicht verfügbar.");
      return;
    }

    if (!appId || !appKey || !license || !mqttHost || !mqttUsername || !mqttPassword) {
      setStage("error");
      setMessage("Alle Felder sind erforderlich.");
      return;
    }

    if (!/^(tcp|ws):\/\//i.test(mqttHost)) {
      setStage("error");
      setMessage("DJI Pilot 2 erwartet für das Thing-Modul tcp:// oder ws://.");
      return;
    }

    try {
      setStage("verifying");
      setMessage("DJI Cloud API License wird in Pilot 2 verifiziert …");
      decodeEnvelope(
        bridge.platformVerifyLicense(appId, appKey, license),
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

      setStage("loading");
      setMessage("Thing-Modul wird mit dem FH2-MQTT-Broker verbunden …");

      window.fh2ThingConnectCallback = (raw: unknown) => {
        try {
          const connected = asBoolean(raw);
          if (connected) {
            setStage("connected");
            setMessage("DJI Pilot 2 ist mit dem FH2-MQTT-Broker verbunden.");
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
            host: mqttHost,
            connectCallback: "fh2ThingConnectCallback",
            username: mqttUsername,
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
        setMessage("DJI Pilot 2 ist mit dem FH2-MQTT-Broker verbunden.");
      } else {
        setStage("waiting");
        setMessage(
          "Thing-Modul geladen. Pilot 2 verbindet noch; prüfe danach EMQX/AuthZ auf dem Pi."
        );
      }
    } catch (error) {
      setStage("error");
      setMessage(error instanceof Error ? error.message : String(error));
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
          App Key, License und MQTT-Passwort werden weder an FH2 übertragen noch
          in LocalStorage/SessionStorage gespeichert.
        </p>
      </section>
    </main>
  );
}
