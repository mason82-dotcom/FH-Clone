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
| `position_state.is_fixed` | `navigation.rtk.fix_state_code` | DJI-Fix-Statuscode |
| abgeleitet | `navigation.rtk.fix_status` | normalisierter Status |
| abgeleitet | `navigation.rtk.fixed` | boolescher Fixindikator |
| `position_state.quality` | `navigation.rtk.quality_code` | Qualitätscode |
| `gps_number` | `navigation.gnss.gps_satellites` | GPS-Satelliten |
| `rtk_number` | `navigation.rtk.satellites` | RTK-Satelliten |
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

Daher:

```text
is_fixed == 2 -> fixed
```

`mode_code == 18` wird separat als Airborne-RTK-Fixing-Modus geführt und
nicht allein als erfolgreicher Fix interpretiert.

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

- RTK-Fix korrekt erkannt
- Fix-Verlust korrekt erkannt
- Stale-Status
- Reconnect
- Missionssnapshot
- keine NTRIP-Secrets in API, Log oder Persistenz
