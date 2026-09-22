# Hardware-Evidence-Vertrag für V3

Stand: 23.09.2026

Dieses Dokument definiert, welche **realen** DJI-Hardware-/Pilot-2-Nachweise die
zentrale Direktor-CI auswertet. Synthetische Payloads bleiben für
Regressionstests zulässig, zählen aber niemals als Hardwarebeleg.

Die Einteilung lautet:

- **REQUIRED_MAIN**: muss vor dem V3-Basisrelease belegt sein, weil `main`
  diese Runtime-/Hardwarefunktion bereits beansprucht.
- **REQUIRED_DRAFT**: muss vor Promotion des betreffenden Draft-PRs belegt sein.
- **CONDITIONAL**: nur erforderlich, wenn das konkrete Einsatzprofil oder die
  betreffende Hardware tatsächlich verwendet/freigegeben wird.
- **INFORMATIONAL**: nützlich, aber kein Release-Gate.

## Datenschutz

Reale Captures dürfen keine produktiven Secrets veröffentlichen. Vor dem
Einchecken sind mindestens zu redigieren:

- Geräte-/Gateway-/Batterie-Seriennummern
- `device_secret`, `nonce`
- MQTT-/API-/WS-Credentials und Tokens
- `wireless_link_topo.secret_code`
- NTRIP-Zugangsdaten
- private GPS-/Projektkoordinaten, sofern sie nicht ausdrücklich freigegeben sind

Für Binär-/Medienquellen darf ein redigiertes Manifest mit SHA-256 der
authoritativen lokalen Originaldatei verwendet werden. Synthetische Daten dürfen
nicht als reale Quelle gekennzeichnet werden.

## 1. RC Pro Enterprise + M3T — REQUIRED_MAIN

DJI trennt Gateway-Topologie und Aircraft Properties. Für RC Pro Enterprise ist
der reale `update_topo`-Upstream auf dem Gateway-Statuspfad zu erfassen. Für
die M3-Serie kommen OSD-Daten mit stabiler Frequenz und State-Daten bei
Änderungen.

Erforderlich:

1. realer, redigierter `update_topo`-Capture mit RC Pro Enterprise und M3T
   auf `thing/product/{gateway_sn}/status`; die zugehörige Antwort läuft auf
   `sys/product/{gateway_sn}/status_reply`,
2. realer M3T-`osd`-Capture mit den tatsächlich gelieferten Grundfeldern:
   - `attitude_head`, `attitude_roll`, `attitude_pitch`
   - Position/Höhen/Speed
   - `position_state`
   - `battery.batteries[]`
   - `cameras[]` / M3T-Payload
3. realer `state`-Capture,
4. echtes MQTT-RTK-Paar:
   - Fixed über `position_state.is_fixed == 2`
   - ein separater Nicht-Fixed-Zustand `0`, `1` oder `3`
5. realer Tele-/Zoom-JPEG-Metadatenbeleg,
6. realer Thermal-R-JPEG-Metadatenbeleg.

Wichtig: Für die M3-Serie wird **nicht** `quality == 10` verlangt. Der aktuelle
M3-spezifische Vertrag verwendet `is_fixed` für den Fixzustand; die dortige
`quality`-Enumeration ist nicht mit anderen Produktfamilien gleichzusetzen.

`obstacle_avoidance.horizon/upside/downside` wird ausgewertet, wenn das
Zielfirmwareprofil es liefert, aber ein fehlendes optionales Feld macht einen
ansonsten echten Capture nicht künstlich ungültig.

Für M3E/M3T wird kein Flight-Control-DRC-Nachweis verlangt. DJI beschreibt für
die Mavic-3-Enterprise-Serie Cloud-Payload-Control, während Matrice 4 auch
Cloud-Flight-Control unterstützt.

Bereits vorhanden: zwei reale, redigiert dokumentierte M3T-Wide-Samples unter
`docs/fixtures/m3t/`. Diese schließen Tele, Thermal und MQTT nicht.

## 2. RC Plus 2 + M4T Flight Control — REQUIRED_MAIN

Da der aktuelle FH2-Core für Matrice 4 einen Flight-Control-/DRC-Pfad besitzt,
muss die reale Safety-Kette belegt werden. Die CI **führt keine Flugbefehle aus**;
sie analysiert ausschließlich vorher aufgezeichnete, redigierte Captures.

Erforderlich:

1. `update_topo` für RC Plus 2 + M4T,
2. erfolgreicher Cloud-Control-Authority-Nachweis,
3. erfolgreicher `drc_mode_enter`-Nachweis,
4. mindestens ein zusammengehöriges
   `thing/product/{gateway_sn}/drc/down` -> `drc/up` Heartbeat-Paar,
5. Nachweis, dass der Upstream dem aktiven Gateway/der aktiven Runtime-Session
   zugeordnet wurde,
6. ein echter `hsi_info_push`-Capture, **wenn** FH2 diese
   DRC-Hindernis-Telemetrie als Runtimefunktion freigibt,
7. ein realer M4T-Thermal-Medienbeleg für den bereits vorhandenen
   FH2-M4T-Thermal-Layer. Dieser ist ein **Projekt-Feature-Gate**, kein
   Cloud-API-Pflichtfeldvertrag. Es werden daher nur reale Herkunft,
   M4T-/Thermal-Zuordnung, Dateihash und die tatsächlich beobachteten
   Metadaten verlangt; keine undokumentierten EXIF-Tags werden erfunden.

`drc_status_notify` allein reicht nicht als DRC-Link-Liveness-Beleg. Der
Heartbeat-Upstream ist der maßgebliche Datenpfad für die aktive
DRC-Verbindung.

## 3. Mavic 3M Multispektral — REQUIRED_MAIN

Erforderlich ist mindestens ein realer Narrow-Band-Capture-Satz mit:

- Green
- Red
- RedEdge
- NIR

Pro Band werden aus dem echten EXIF/XMP-Vertrag ausgewertet:

- `BandName`
- `BandFreq`
- `SensorIndex`
- `CaptureUUID`
- `UTCAtExposure`
- `Irradiance`
- `SensorGain`
- `SensorGainAdjustment`
- `ExposureTime`
- `RawData`/Sonnenlichtsensorwerte
- vorhandene Vignetting-/Dewarp-/HMatrix-Kalibrierfelder

DJI dokumentiert die Sensorindizes als:

- Green = 1
- Red = 2
- RedEdge = 3
- NIR = 4

Die CI prüft die in einem **realen** Capture beobachtete
`CaptureUUID`-Gruppierung, erfindet aber keine zusätzliche Regel für die
RGB-Datei. Insbesondere wird nicht vorausgesetzt, dass RGB und alle vier
Narrow-Band-Dateien dieselbe UUID besitzen, solange dies nicht durch reale
Daten bestätigt ist.

Für NDVI reicht ein bloßes Vorhandensein von Red/NIR nicht als
Kalibrierungsnachweis. DJI beschreibt zusätzlich Sonnenlichtsensor-,
Empfindlichkeits-/Gain- und geometrische Korrekturen.

## 4. Dock 3 + M4D/M4TD — REQUIRED_DRAFT für PR #43

Vor Promotion von PR #43:

1. reales Dock-3-`update_topo`,
2. reales M4D oder M4TD `osd`,
3. reales `state`,
4. reales `cameras[]` mit dem beobachteten Payload,
5. reale Form der dynamischen Kamera-/Gimbal-Property-Keys,
6. `battery.batteries[]`,
7. RTK Fixed + Nicht-Fixed, wenn der PR diese Semantik als validiert ausweist,
8. Sanitization-Beleg: ein beobachtetes `secret_code` darf den öffentlichen
   FH2-Rawpfad nicht erreichen.

### Nur CONDITIONAL

- `wireless_link_topo` und `best_link_gateway` sind harte Gates **nur für
  Multi-Dock**. DJI beschreibt sie explizit im Multi-Dock-Vertrag.
- PSDK-Arrays sind nur erforderlich, wenn tatsächlich PSDK-Hardware angeschlossen
  ist oder FH2 diese Runtimeunterstützung freigibt.
- `property/set` wird für PR #43 **nicht ausgeführt**. Der Draft ist read-only;
  die DJI-`rw`-Kennzeichnung ist kein Grund, in CI schreibende Hardwaretests
  zu starten.

## 5. WPML / Pilot Wayline — REQUIRED_DRAFT für PR #45

Erforderlich:

1. ein tatsächlich von DJI Pilot 2 erzeugtes KMZ für eine unterstützte
   M3-/M4-Konfiguration,
2. `template.kml` **und** `waylines.wpml` aus diesem realen Standard-KMZ,
3. Parservergleich gegen das reale Artefakt:
   - MissionConfig
   - Produkt-/Payload-Enums
   - Höhenmodi
   - Template-/Wayline-IDs
   - kontinuierliche Waypoint-Indizes
   - ActionGroup/Trigger/Parameter, soweit im Fixture vorhanden
4. ein realer, redigierter Pilot-Wayline-List-Response aus einem Workspace.

DJI führt `template.kml`, `waylines.wpml` und den Ressourcenbereich
`res/` als Bestandteile der WPML-Dateistruktur. Für die CI gilt deshalb
präzise:

- ein **leerer** bzw. im ZIP nicht separat materialisierter `res/`-Ordner
  wird nicht pauschal erzwungen,
- sobald das reale WPML auf Ressourcen verweist (z. B. Referenzbilder oder
  andere Action-Ressourcen), müssen die referenzierten Dateien unter dem
  erwarteten Ressourcenpfad tatsächlich im KMZ vorhanden sein,
- Vorhandensein und Inhalt von `res/` werden im Evidence-Report immer
  protokolliert.

`narrow_band` und DJIs dokumentierte Schreibweise `visable` werden
verlustfrei behandelt, wenn sie im realen WPML vorkommen. WPML-Payload-Enums,
Pilot-`payload_model_key` und MQTT-`payload_index` bleiben getrennte
Identitätsräume.

## 6. Pilot 2 JSBridge — REQUIRED_DRAFT für PR #46

Erforderlich ist ein redigierter Runtime-Trace aus dem Pilot-2-WebView:

1. JSBridge vorhanden,
2. License-Verifikation erfolgreich,
3. Versionsinformation,
4. RC- und Aircraft-Identität als redigierte/Hash-Werte,
5. exakter Pair-Match gegen die FH2-`update_topo`-Identität,
6. Thing-Modul geladen und MQTT-Connect-Callback erfolgreich,
7. API-/WS-Module für die Funktionen geladen, die sie voraussetzen,
8. Workspace-ID/Plattforminfo gesetzt,
9. modulabhängige Features nur nach ihren dokumentierten Voraussetzungen,
10. Secret-Scan des Browser-Bundles: keine statischen Gateway-/MQTT-/API-/WS-
    Credentials.

DJI bezeichnet das Cloud-Modul in JSBridge als `thing`. Die kombinierte
Abhängigkeit aus JSBridge-API und den jeweiligen Feature-Flows wird wie folgt
geprüft:

- Map: `thing` + Workspace + API + WS + Map-Modul,
- TSA: `thing` + Workspace + API + WS + TSA-Modul,
- Mission/Wayline: `thing` + Workspace + API + WS + Mission-Modul,
- Media: `thing` + Workspace + API + Media-Modul,
- Live: Live-Modul, sofern der Livestream-Pfad im Draft aktiviert wird.

Damit wird weder eine schwächere Feature-Anleitung noch eine einzelne
JSBridge-Note isoliert als vollständiger Modulvertrag interpretiert.

## 7. MSDK KeyManager — kein Hardware-Gate für PR #44

PR #44 ist aktuell ein Dokumentations-/Vertrags-PR und enthält keinen
Android-MSDK-Runtime-Adapter. Deshalb wäre ein Hardware-Fixture-Gate hier
künstlich.

Erst bei einem späteren Runtime-Adapter werden reale Key-Probes pro
Produkt/Firmware für Get/Set/Listen/Action, Component-/Lens-Indizes,
Callback-/Error-Mapping und Listener-Cleanup verpflichtend.

## CI-Regel

Die zentrale Direktor-CI besitzt zwei Evidence-Sichten:

- `main`: REQUIRED_MAIN muss vollständig grün sein.
- `all`: zusätzlich müssen REQUIRED_DRAFT-Nachweise für die zu promotenden
  Drafts grün sein.

CONDITIONAL-Nachweise werden nur aktiviert, wenn das entsprechende Profil
explizit eingeschaltet wird. Fehlende Hardware wird nie durch synthetische
Fixtures oder Annahmen ersetzt.
