# RTK und NTRIP

## Zweck

FH-Clone normalisiert und überwacht RTK-/GNSS-Zustände, ohne für nicht
dokumentierte Produkte eigene NTRIP-Konfigurationsschnittstellen zu erfinden.

## Zuständigkeitsgrenze für M3E/M3T/M3M

Für die Mavic-3-Enterprise-Familie gilt:

- NTRIP-Zugangsdaten werden nicht durch FH-Clone gesetzt.
- Host, Port, Mountpoint, Benutzername und Passwort werden nicht in FH2
  gespeichert.
- Die Konfiguration erfolgt über den von DJI vorgesehenen Controller-/Pilot-2-
  Pfad.
- FH-Clone verarbeitet den resultierenden RTK-/GNSS-Zustand lesend.

PSDK- oder Edge-SDK-Funktionen anderer Produktfamilien werden nicht auf M3E,
M3T oder M3M übertragen, wenn DJI dies nicht ausdrücklich dokumentiert.

## Normalisierte RTK-Felder

| DJI-Feld | FH2-Schlüssel | Bedeutung |
| --- | --- | --- |
| `position_state.is_fixed` | `navigation.gnss.fix_state_code` | allgemeiner DJI-Satelliten-Fixstatus |
| `position_state.quality` | `navigation.gnss.quality_code` | Satelliten-Akquisitionsmodus; Wert 10 = RTK fixed |
| `gps_number` | `navigation.gnss.gps_satellites` | GPS-Satelliten; allein kein RTK-Nachweis |
| `rtk_number` | `navigation.rtk.satellites` | RTK-Satelliten und RTK-spezifische Evidenz |
| abgeleitet | `navigation.rtk.fix_status` | Akquisitionsstatus im beobachteten RTK-Kontext |
| abgeleitet | `navigation.rtk.fixed` | boolescher RTK-Fixindikator, nur aus RTK-spezifischer Evidenz |
| `mode_code` | `flight.mode.code` | Aircraft-Betriebsmodus |
| abgeleitet | `navigation.rtk.airborne_fixing_mode` | RTK-Fixing-Modus |

## Fix-Zustand

`is_fixed` ist kein Boolean.

Verwendete Interpretation:

```text
0 = nicht gestartet
1 = Fix läuft
2 = Fix erfolgreich
3 = Fix fehlgeschlagen
```

Diese Enum beschreibt den allgemeinen Satelliten-Fixvorgang. Sie ist allein
**kein Nachweis eines RTK-Fixes**.

Für FH2 gilt deshalb:

```text
gps_number vorhanden
  -> GNSS-/Flight-Telemetrie

rtk_number vorhanden
  -> RTK-Telemetrie beobachtet

quality == 10
  -> DJI kennzeichnet den Zustand als RTK fixed

mode_code == 18
  -> Airborne-RTK-Fixing-Modus, aber noch kein erfolgreicher Fix
```

`navigation.rtk.fixed=true` wird nur gesetzt, wenn DJI mit `quality=10`
RTK fixed meldet und der allgemeine Fixstatus dem nicht widerspricht.

## Höhe

Für Mapping und Medien ist die Höhenreferenz entscheidend.

FH-Clone trennt:

```text
Ellipsoidhöhe
relative Höhe zum Start-/Takeoff-Bezug
```

Die normalisierten Keys dürfen nicht ohne dokumentierte Quelle
untereinander ersetzt werden.

## Fix-Verlust

Der RTK-Monitor erzeugt nur bei echten Zustandswechseln Ereignisse:

```text
false -> true  = acquired
true  -> false = lost
```

Der Initialwert erzeugt kein künstliches Ereignis.

## Öffentliche API

```http
GET /api/rtk
GET /api/devices/{device_sn}/rtk
GET /api/rtk/transitions
GET /api/events/rtk
```

Der Live-Stream läuft über Server-Sent Events und benötigt keine
MQTT-Credentials im Browser.

## Weboberfläche

Die vorhandene React-Ansicht zeigt unter anderem:

- aktuellen Fix-Zustand
- GPS-Satelliten
- RTK-Satelliten
- zeitlichen Verlauf
- Fix-Verlust-Ereignisse

Der Verlauf ist derzeit flüchtig. Persistente Historie gehört zum
V3-Persistenz-Gate.

## Sichere Missionsmetadaten

Missionskontext darf eine nicht-sensitive Referenz auf die Korrekturquelle
enthalten:

```json
{
  "label": "SAPOS BW",
  "provider": "Landesdienst",
  "configuredVia": "dji-pilot-2",
  "note": "Projektstandard"
}
```

Zulässig:

- `label`
- `provider`
- `note`
- `configuredVia`

Nicht zulässig:

- Host
- IP
- Port
- Mountpoint
- Benutzername
- Passwort
- Token

Diese Geheimnisse sind im typisierten Core-Modell absichtlich nicht
repräsentierbar.

## Missionskontext

Der Core kann sichere RTK-Snapshots für Start/Landung sowie aggregierte Werte
führen, zum Beispiel:

- minimale RTK-Satellitenzahl
- Fix-Loss-Anzahl
- Takeoff-Snapshot
- Landing-Snapshot
- beschreibende Korrekturquellenreferenz

## Produktgrenze

M3E/M3T benötigen die entsprechende RTK-Hardwareausstattung. M3M besitzt RTK
im Produktkonzept.

Trotzdem soll die Anwendung die tatsächliche Capability aus realen Geräte- und
Telemetriedaten ableiten und nicht allein aus dem Modellnamen.

## V3-Abnahme

Zu testen:

- GPS-only erzeugt keine `telemetry.rtk`-Capability
- `rtk_number` erzeugt RTK-Telemetrie, aber nicht automatisch einen Fix
- `quality == 10` wird als RTK-fixed-Nachweis verwendet
- widersprüchliche Fix-/Quality-Werte bleiben fail-closed
- Fix-Verlust korrekt erkannt
- Stale-Status
- Reconnect
- Missionssnapshot
- keine NTRIP-Secrets in API, Log oder Persistenz
