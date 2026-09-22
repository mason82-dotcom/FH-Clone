# DJI Matrice 4D/4TD und Dock 3

## Zweck

Dieses Dokument beschreibt den in FH2 integrierten **Dock-to-Cloud-Property-
Vertrag** für DJI Matrice 4D und Matrice 4TD hinter DJI Dock 3.

Er ist ausdrücklich getrennt vom Pilot-to-Cloud-Profil der Matrice 4E/4T
hinter RC Plus 2.

```text
M4E / M4T   -> RC Plus 2 -> Pilot-to-Cloud
M4D / M4TD  -> Dock 3    -> Dock-to-Cloud
```

Aus der Unterstützung eines DJI-Properties wird keine schreibende FH2-
Capability abgeleitet. Die aktuelle V3-Integration ist **read-only für
Properties/Telemetrie**.

## Produktidentitäten

DJI bestimmt Geräte über `domain + type + sub_type`.

| Produkt | domain | type | sub_type |
| --- | ---: | ---: | ---: |
| DJI Dock 3 | 3 | 3 | 0 |
| DJI Matrice 4D | 0 | 100 | 0 |
| DJI Matrice 4TD | 0 | 100 | 1 |

Die integrierten Kamera-Payload-Identitäten sind:

| Kamera | payload_index |
| --- | --- |
| Matrice 4D Camera | `98-0-0` |
| Matrice 4TD Camera | `99-0-0` |

DJI führt für Vision Assist bei M3D/M3TD/M4D/M4TD zusätzlich
`176-0-0`. FH2 hält diesen Wert als dokumentierte Konstante, behandelt ihn
aber nicht automatisch als Hauptkamera.

## MQTT-Property-Vertrag

DJI unterscheidet beim M4D/M4TD-Thing-Model drei Property-Wege:

```text
pushMode 0:
thing/product/{device_sn}/osd
periodische Properties, typischerweise 0,5 Hz

pushMode 1:
thing/product/{device_sn}/state
Änderungsereignisse

read/write:
thing/product/{gateway_sn}/property/set
Property-Set über das Dock-Gateway
```

FH2 abonniert `osd` und `state` bereits als Basic-Link-Telemetrie.

Der dokumentierte `property/set`-Vertrag wird in V3 **nicht** automatisch
als öffentliche oder ausführbare Schreibfunktion freigeschaltet.

## Integrierte Property-Gruppen

### Link und Dock-Topologie

- `best_link_gateway`
- `wireless_link_topo`
- Center-/Leaf-Nodes der Funklink-Topologie

`wireless_link_topo.secret_code` ist ein DJI-Link-Verschlüsselungscode.
FH2 redigiert diesen Wert vor `RawMessage`, Normalisierung, Logging oder
späterer Persistenz.

### Kamera, Gimbal, Thermal und LRF

FH2 verarbeitet insbesondere:

- `cameras[]`
- `payload_index`
- `camera_mode`
- `photo_state`
- `recording_state`
- `screen_split_enable`
- `zoom_factor`
- `ir_zoom_factor`
- Foto-/Video-Speichereinstellungen
- Wide-/Zoom-Exposure, ISO, Shutter und Fokus
- `ir_metering_mode`
- `ir_metering_point`
- `ir_metering_area`
- `gimbal_pitch`
- `gimbal_roll`
- `gimbal_yaw`
- Laser-Rangefinder-Zielposition/-höhe/-distanz
- Thermal Palette
- Thermal Gain Mode
- Isotherm-Zustand und Grenzwerte
- globale Thermal-Min-/Max-Temperaturen

DJI beschreibt die dynamische Kamera-/Gimbal-Struktur mit einem
`type_subtype_gimbalindex`-Platzhalter. FH2 verlässt sich nicht auf diesen
Text als literal festen JSON-Key; die Blattfelder werden unabhängig vom
konkreten Parent-Pfad normalisiert beziehungsweise als Rohfeld erhalten.

### Flug, GNSS und RTK

Unter anderem:

- `track_id`
- `position_state.is_fixed`
- `position_state.quality`
- `gps_number`
- `rtk_number`
- `latitude` / `longitude`
- `height` / `elevation`
- `horizontal_speed` / `vertical_speed`
- `attitude_head`
- `attitude_pitch`
- `attitude_roll`
- Home-Position/-Distanz
- Wind
- `mode_code`
- `mode_code_reason`
- `control_source`
- `current_rth_mode`
- `rth_mode`

Für den M4D/M4TD-Property-Vertrag dokumentiert DJI
`position_state.quality = 10` ausdrücklich als RTK Fixed.
`position_state.is_fixed` bleibt der allgemeine Fixvorgang und wird nicht
allein als RTK-Fixed-Beweis interpretiert.

## Kanonische FH2-Normalisierung

Bekannte Blätter werden stabil normalisiert:

```text
latitude       -> flight.position.latitude_deg
longitude      -> flight.position.longitude_deg
height         -> flight.altitude.ellipsoid_m
elevation      -> flight.altitude.relative_m

attitude_head  -> flight.attitude.yaw_deg
attitude_pitch -> flight.attitude.pitch_deg
attitude_roll  -> flight.attitude.roll_deg

gimbal_pitch   -> payload.gimbal.pitch_deg
gimbal_roll    -> payload.gimbal.roll_deg
gimbal_yaw     -> payload.gimbal.yaw_deg
```

Unbekannte DJI-Felder bleiben unter:

```text
raw.dji-cloud.<rawKey>
```

Arrays werden indexiert rekursiv zerlegt. Beispiele:

```text
cameras[0].payload_index
  -> raw.dji-cloud.cameras.0.payload_index

battery.batteries[0].temperature
  -> raw.dji-cloud.battery.batteries.0.temperature
```

Dadurch bleiben Camera-, Batterie-, PSDK- und Link-Strukturen einzeln
auswertbar, ohne neue DJI-Semantik zu erfinden.

## Batterie und Energie

Der Vertrag umfasst unter anderem:

- `battery`
- einzelne `batteries[]`
- `total_flight_distance`
- `total_flight_time`
- Low-/Serious-Low-Battery-Warnschwellen
- `remaining_power_for_return_home`

DJI hat `remaining_power_for_return_home` mit Cloud API 1.16.1 als
read/write Property für Dock-Szenarien ergänzt. FH2 liest den Wert, führt
aber derzeit keinen Property-Set aus.

## Fluggrenzen und Safety-nahe Properties

Erfasst werden unter anderem:

- `obstacle_avoidance`
- `height_limit`
- `is_near_area_limit`
- `is_near_height_limit`
- `distance_limit_status`
- `rth_altitude`
- `night_lights_state`

Dass DJI ein Feld als `rw` dokumentiert, hebt die FH2-Safety-Stufe nicht an
und erzeugt keine `control.*`-Capability.

## PSDK, Firmware und Wartung

FH2 erhält unter anderem:

- `psdk_ui_resource[]`
- `psdk_widget_values[]`
- `activation_time`
- Maintenance-Status
- Gesamtzahl der Sorties
- Firmware-Version/-Upgrade-Status
- Compatibility-Status
- `gear`

## Connectivity und sensible Identifikatoren

Weitere DJI-Properties umfassen:

- `flysafe_database_version`
- `offline_map_enable`
- `dongle_infos[]`

`dongle_infos[]` kann IMEI, EID und ICCID enthalten. Diese Werte sind
sensible Geräte-/SIM-Identifikatoren. Sie sind keine FH2-Credentials, dürfen
aber nicht ungefiltert in öffentliche APIs, Telemetrie-UIs oder Logs gelangen.

Der Verschlüsselungswert `wireless_link_topo.secret_code` wird dagegen
bereits auf Adapterebene vollständig redigiert.

## Schreibbare DJI-Properties

FH2 führt die offiziell als schreibbar dokumentierten Pfade explizit als
Vertrag, unter anderem:

- `obstacle_avoidance`
- `height_limit`
- `night_lights_state`
- `distance_limit_status`
- `rth_altitude`
- `remaining_power_for_return_home`
- Thermal Palette/Gain/Isotherm-Werte

Aktueller FH2-Status:

```text
DJI Property ist rw
  !=
FH2 Property-Write ist freigegeben
```

Für V3 bleiben diese Schreibpfade gesperrt, bis ein eigener ausführbarer Pfad,
Safety-Gating, AuthZ und reale Dock-3-Abnahme vorhanden sind.

## Cloud-API- und Firmware-Baseline

FH2 verwendet weiterhin die verifizierte Cloud-API-Baseline **1.16.1**.

DJI nennt für die mit 1.16.1 hinzugekommenen Dock-3-Funktionen als
Mindestfirmware:

```text
Matrice 4D/4TD: 14.03.00.03
DJI Dock 3:     14.03.00.03
```

Firmwarewerte werden nicht als globale Core-Konstante verwendet. Reale
Hardwareabnahmen dokumentieren die tatsächlich eingesetzte Firmware.

## Noch real zu verifizieren

Vor einer Freigabe über den reinen Property-Vertrag hinaus fehlen reale
Dock-3/M4D-Nachweise für:

- `update_topo` von Dock 3
- reale `osd`-/`state`-Payloads
- `cameras[]` von M4D und M4TD
- `type_subtype_gimbalindex` in der tatsächlich ausgesendeten JSON-Form
- `wireless_link_topo`
- `best_link_gateway`
- PSDK-Arrays
- RTK Fix/No-Fix
- Batteriearray
- Verhalten der dokumentierten `property/set`-Properties

Bis dahin bleibt die Integration read-only und fail-closed.

## Offizielle DJI-Referenzen

- M4D/M4TD Properties:
  https://developer.dji.com/doc/cloud-api-tutorial/en/api-reference/dock-to-cloud/mqtt/aircraft/m4d-properties.html
- Produktunterstützung:
  https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html
- Cloud API Release-History:
  https://developer.dji.com/doc/cloud-api-tutorial/cn/
