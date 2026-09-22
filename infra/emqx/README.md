# EMQX für FH-Clone

## Sicherheitsmodell

Die Topic-Richtung folgt der DJI Cloud API:

| Pfad | Richtung aus Cloud-Sicht | Verwendung |
| --- | --- | --- |
| `thing/product/{sn}/drc/down` | Cloud → Gerät | DRC-Kommandos/Heartbeat |
| `thing/product/{sn}/drc/up` | Gerät → Cloud | DRC-Antworten/Push |
| `thing/product/{sn}/services` | Cloud → Gerät | Service-Kommandos |
| `thing/product/{sn}/services_reply` | Gerät → Cloud | Service-Antworten |
| `thing/product/{sn}/events` | Gerät → Cloud | Events/Fortschritt |

## Rollen

### `webui-operator`

Nur lesend. Die Browser-Anwendung darf keine DJI-Control-Topics publizieren.

Produktiv sollte die WebUI bevorzugt überhaupt keine MQTT-Credentials erhalten und Telemetrie über den FH-Clone-WebSocket konsumieren. Der Account bleibt nur für Diagnose-/Entwicklungsfälle vorgesehen.

### `backend-service`

Darf Telemetrie und Antworten abonnieren und die explizit freigegebenen Cloud→Device-Topics publizieren. Der Backend-Prozess muss vor DRC-Befehlen zusätzlich den FH-Clone-`ControlAuthority`/`CommandCoordinator` passieren.

### DJI-Gateway

Für file-basierte ACLs gilt der Provisioning-Vertrag:

```text
MQTT clientid = gateway_sn
username      = dji-gateway-<provisioned-id>
```

Die ACL verwendet anschließend `${clientid}` als Topic-Template. **Die Authentifizierung muss die ausgegebenen Zugangsdaten an genau diese Client-ID/Gateway-SN binden.** Eine ACL-Datei allein ist kein Ersatz für diese Identitätsbindung.

Client-ID und Benutzername dürfen keine MQTT-Wildcards enthalten.

## Installation

`acl.conf` wird read-only nach

```text
/opt/emqx/etc/fh-clone-acl.conf
```

gemountet. `base.hocon` wird in die EMQX-Konfiguration eingebunden.

Die Regeln werden von oben nach unten ausgewertet; die erste passende Regel entscheidet. Das Ende bleibt deshalb immer:

```erlang
{deny, all}.
```

und zusätzlich:

```hocon
authorization.no_match = deny
```

## Cache

Der Authorization-Cache verwendet nur 5 Sekunden TTL. Ein längerer Cache ist für Control-Topics ungünstig, weil geänderte/revozierte Berechtigungen sonst länger wirksam bleiben können.

## Keine Browser-Steuerung

DRC, Emergency Stop, FlyTo, RTH und spätere Mission-Control-Publishes laufen nicht direkt aus React/MQTT.js. Der Pfad ist:

```text
WebUI
  -> HTTPS/WebSocket
  -> Command Service
  -> ControlAuthority / CommandCoordinator
  -> DjiCloud DRC/Service Publisher
  -> EMQX
  -> DJI Gateway
```
