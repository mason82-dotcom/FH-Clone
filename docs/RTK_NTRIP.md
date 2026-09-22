# Mavic 3 Enterprise Series – RTK / NTRIP

## Sicherheits- und Zuständigkeitsgrenze

Für FH-Clone gilt für M3E/M3T/M3M:

- **NTRIP-Zugangsdaten werden nicht durch FH-Clone gesetzt.**
- Host, Port, Mountpoint, Benutzername und Passwort werden nicht über eine eigene Cloud-API-Methode erfunden.
- Die Konfiguration erfolgt am DJI-Controller/Pilot-2-Pfad.
- FH-Clone verarbeitet RTK/GNSS über die dokumentierten read-only Telemetriedaten.

Die DJI Cloud API dokumentiert für die Mavic-3-Enterprise-Pilot-Cloud keinen NTRIP-Konfigurationsdienst.

DJI PSDK stellt inzwischen Network-RTK-Konfigurationsschnittstellen bereit, diese aktuelle Funktion ist jedoch ausdrücklich für **Matrice 400 + Manifold 3** dokumentiert und wird nicht auf M3E/M3T/M3M übertragen.

## Cloud-Telemetrie

Die DJI Cloud API liefert RTK/GNSS-Zustand in Aircraft Properties/OSD.

Relevante Felder:

| DJI-Feld | FH-Clone-Key | Bedeutung |
| --- | --- | --- |
| `position_state.is_fixed` | `navigation.rtk.fix_state_code` | RTK-Fix-Zustand als Enum |
| derived | `navigation.rtk.fix_status` | normalisierter String |
| derived | `navigation.rtk.fixed` | boolescher Fix-Indikator |
| `position_state.quality` | `navigation.rtk.quality_code` | Satellite-acquisition quality |
| `gps_number` / `position_state.gps_number` | `navigation.gnss.gps_satellites` | GPS-Satelliten |
| `rtk_number` / `position_state.rtk_number` | `navigation.rtk.satellites` | RTK-Satelliten |
| `mode_code` | `flight.mode.code` | Aircraft-Betriebszustand |
| derived from `mode_code == 18` | `navigation.rtk.airborne_fixing_mode` | Aircraft ist im Airborne-RTK-Fixing-Modus |

### is_fixed ist kein Boolean

DJI definiert:

```text
0 = Not started
1 = Fixing
2 = Fixing successful
3 = Fixing failed
```

Deshalb ist diese Logik falsch:

```text
is_fixed === 1 -> FIX
```

FH-Clone verwendet:

```text
is_fixed == 2 -> fixed
quality == 10 -> RTK fixed acquisition mode
```

### mode_code 18

`mode_code = 18` bedeutet `Airborne RTK fixing mode`.

Das ist ein Aircraft-Modus und wird **nicht** als alleiniger Beweis für einen erfolgreichen RTK-Fix verwendet.

## Fix-Verlust

`RtkFixMonitor` beobachtet den abgeleiteten booleschen Fix-Zustand.

Ein Initialwert erzeugt keine Meldung. Nur echte Zustandswechsel erzeugen Events:

```text
false -> true  = acquired
true  -> false = lost
```

Damit kann die WebUI später einen Fix-Verlust-Alert erzeugen, ohne einzelne OSD-Pakete fälschlich als Ereignis zu behandeln.

## Höhe

Für Mapping und RTK ist die Höhenreferenz entscheidend.

DJI Cloud API:

- `height` -> Ellipsoidhöhe
- `elevation` -> Höhe relativ zum Start-/Takeoff-Punkt

FH-Clone normalisiert daher:

```text
height    -> flight.altitude.ellipsoid_m
elevation -> flight.altitude.relative_m
```

## Missions-/Media-Metadaten

RTK-Status darf bei einer Aufnahme/Mission als Snapshot mitgeführt werden, z. B.:

```text
device_sn
timestamp
navigation.rtk.fix_status
navigation.rtk.fixed
navigation.rtk.quality_code
navigation.rtk.satellites
navigation.gnss.gps_satellites
flight.altitude.ellipsoid_m
flight.altitude.relative_m
```

NTRIP-Credentials werden niemals in Mission-, Media- oder Audit-Metadaten gespeichert.

Eine frei eingegebene Bezeichnung der verwendeten RTK-/CORS-Quelle kann später als nicht-geheimes Missionsmetadatum ergänzt werden. Sie ist keine aus der Cloud API abgeleitete Information.

## Produktgrenze

M3E/M3T benötigen für RTK die entsprechende Hardwareausstattung; M3M besitzt RTK-Funktionalität bereits im Produktkonzept.

Die tatsächliche Capability wird in FH-Clone trotzdem aus realer Geräte-/Telemetrieinformation abgeleitet und nicht allein anhand des Modellnamens angenommen.


## Live-Verlauf in der WebUI

Die React-WebUI hält pro Aircraft die letzten 120 RTK/GNSS-Samples im Speicher und visualisiert:

- RTK-Satelliten
- GPS-Satelliten
- aktuellen Fix-Zustand
- Fix-Verlust-Zeitpunkte

Der Verlauf ist bewusst flüchtig. Persistente Flugauswertung wird später über die zentrale Telemetrie-/Timeseries-Schicht realisiert.

## Sichere RTK-Quellenreferenz in Missionsmetadaten

FH-Clone kann eine **nicht-sensitive** Referenz auf die verwendete Korrekturquelle dokumentieren.

Beispiel:

```json
{
  "label": "SAPOS BW",
  "provider": "Landesdienst",
  "configuredVia": "dji-pilot-2",
  "note": "Projektstandard"
}
```

Erlaubt sind nur beschreibende Felder:

- `label`
- optional `provider`
- optional `note`
- `configuredVia = dji-pilot-2`

Nicht Bestandteil dieses Modells sind:

- Host/IP
- Port
- Mountpoint
- Benutzername
- Passwort
- Token

Diese Felder sind im typisierten Core-Modell absichtlich nicht repräsentierbar.

Der Missionskontext kann zusätzlich sichere RTK-Snapshots für Start/Landung sowie aggregierte Werte wie minimale RTK-Satellitenzahl und Fix-Loss-Anzahl tragen.
