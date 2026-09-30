# Observability und interne Metriken

## Ziel

FH2 stellt Betriebsmetriken ausschließlich über die **interne** Control API
bereit. Der Endpunkt dient Monitoring und Diagnose; er verändert keinen
Runtime-, AuthZ- oder Control-Zustand.

```text
GET http://control-api:8081/metrics
Content-Type: text/plain; version=0.0.4
```

Port `8081` wird im Root-Compose nicht als Host-Port veröffentlicht. Ein
Prometheus-/Monitoring-System muss deshalb innerhalb einer ausdrücklich
freigegebenen internen Netzwerkgrenze auf den Endpunkt zugreifen.

## Metriken

Der aktuelle Satz umfasst unter anderem:

- `fh2_process_uptime_seconds`
- `fh2_dji_mqtt_configured`
- `fh2_dji_mqtt_connected`
- `fh2_active_missions`
- `fh2_media_assets`
- `fh2_drc_active_sessions`
- `fh2_msdk_agents`
- `fh2_msdk_control_sessions`
- Mission-/Telemetry-/Topology-Persistenzqueue: `*_pending`, `*_dropped_total`, `*_healthy`
- `fh2_mqtt_outbound_total{transport,method}`
- `fh2_authz_decisions_total{decision,reason}`

## Datenschutz und Kardinalität

Metriklabels enthalten absichtlich keine Gateway- oder Aircraft-Seriennummern,
MQTT-Usernames oder Client-IDs, IP-Adressen, Mission-IDs, Tokens oder
Credentials. Variable Textlabels werden auf ein enges technisch zulässiges
Format begrenzt; nicht passende Werte werden als `other` zusammengefasst.

## Sicherheitsgrenze

Der Metrikpfad ist rein beobachtend. Er erzeugt keine AuthZ-Entscheidung,
Control Authority, FC-Stufe, Lease, DRC-Sitzung oder MQTT-Publish-Aktion.
Ein Monitoring-Ausfall darf daher keinen Flug-/Steuerpfad aktivieren oder
deaktivieren.

## Runtime-Gate

`scripts/verify.sh` ruft den Endpunkt aus dem Control-API-Container auf und
prüft HTTP 200, zentrale Gauge-/Counter-Namen, das Fehlen
identitätsbezogener Labels und weiterhin die Nicht-Exposition von Port 8081.
