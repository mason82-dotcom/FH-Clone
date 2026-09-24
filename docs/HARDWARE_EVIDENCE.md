# Hardware-Evidence-Vertrag für V3

Stand: 24.09.2026

Dieses Dokument definiert, welche **realen** DJI-Hardware-/Pilot-2-Nachweise die
zentrale Direktor-CI auswertet. Synthetische Payloads bleiben für
Regressionstests zulässig, zählen aber niemals als Hardwarebeleg.

Die Einteilung lautet:

- **REQUIRED_MAIN**: muss vor dem V3-Basisrelease belegt sein, weil `main`
  diese Runtime-/Hardwarefunktion bereits beansprucht.
- **REQUIRED_DRAFT**: muss vor Promotion des betreffenden Draft-PRs belegt sein.
- **REQUIRED_HARDWARE**: Softwarepfad ist integriert, die konkrete Produkt-/Firmware-Supportzusage benötigt aber noch reale Hardwareevidenz.
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

## 1. RC Pro Enterprise + M3T — REQUIRED_HARDWARE

DJI trennt Gateway-Topologie und Aircraft Properties. Für RC Pro Enterprise ist
der reale `update_topo`-Upstream auf dem Gateway-Statuspfad zu erfassen. Für
die M3-Serie kommen OSD-Daten mit stabiler Frequenz und State-Daten bei
Änderungen.

Erforderlich:

1. realer, redigierter `update_topo`-Capture mit RC Pro Enterprise und M3T
   auf dem kanonischen DJI-Pilot-to-Cloud-Upstream
   `sys/product/{gateway_sn}/status`. Die CI akzeptiert für den
   Topologie-Bootstrap **keine** `thing/.../status`-Variante und verlangt
   zusätzlich die dokumentierte Antwort auf
   `sys/product/{gateway_sn}/status_reply`. Maßgeblich ist die aktuelle
   DJI-Cloud-API-Topicdefinition für Pilot-to-Cloud,
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

## 2. RC Plus 2 + M4T Cloud-Flight-Control — REQUIRED_HARDWARE

DJI dokumentiert für Matrice 4 Cloud-Flight-Control und Payload-Control. FH2
führt dafür das M4-/RC-Plus-2-Profil mit `stick_control` und dem getrennten
`drone_control`-Kompatibilitätspfad. Diese Flugsteuerpfade sind **nicht Teil
der V3.0.0-Hardware-Supportzusage**, solange die nachfolgenden realen Nachweise
fehlen. Die Belege bleiben vor produktiver Flugsteuerung verpflichtend. Die CI
**führt keine Flugbefehle aus**; sie analysiert ausschließlich vorher
aufgezeichnete, redigierte Captures.

Erforderlich:

1. `update_topo` für RC Plus 2 + M4T auf
   `sys/product/{gateway_sn}/status`,
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

## 3. Mavic 3M Multispektral — REQUIRED_HARDWARE

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

## 4. Global deaktivierte Funktionen

Die folgenden DJI-Funktionsfamilien sind in FH2 **projektweit deaktiviert** und
besitzen deshalb weder Hardware-Gates noch freigabefähige Fixtures:

- DJI Dock 1
- DJI Dock 2
- DJI Dock 3
- Multi-Dock
- PSDK-Payloads und PSDK-Widget-/DRC-Kommandos

Die Runtime behandelt die komplette DJI-Dock-Domain `domain=3` fail-closed.
Ein erkanntes Dock-Gateway und seine Sub-Devices werden nicht in die aktive
FH2-Topologie übernommen. PSDK-Methoden `psdk_*` und `drc_psdk_*` werden
nicht ausgeführt; PSDK-spezifische Telemetriefelder werden vor Raw-Persistenz,
Normalisierung und Frontend-Ausgabe entfernt.

Multi-Dock-Felder wie `multi_dock_task`, `multi_dock_home_info`,
`wireless_link_topo` und `best_link_gateway` werden ebenfalls verworfen
beziehungsweise bei schreibenden Service-Anfragen abgelehnt.

Diese Sperren haben **keinen Runtime-Schalter und keine Umgebungsvariable**.
Eine spätere Reaktivierung erfordert eine bewusste Code- und Policy-Änderung
mit neuer Review-/CI-Abnahme.

Wichtig: Eingebaute DJI-Kameras wie M3T/M4T bleiben davon unberührt. Die
globale PSDK-Sperre richtet sich gegen PSDK-spezifische Erweiterungspayloads,
nicht gegen die dokumentierten nativen Kamera-`payload_index`-Werte.

## 5. WPML / Pilot Wayline — REQUIRED_HARDWARE

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

## 6. Pilot 2 JSBridge — REQUIRED_HARDWARE

Der read-only JSBridge-Softwarepfad ist integriert. Eine reale
Pilot-2-Hardware-/WebView-Supportzusage benötigt weiterhin ein redigiertes
Runtime-Fixture unter `docs/fixtures/pilot2/jsbridge-session.json`.

Erforderlich:

1. `window.djiBridge` ist in einer realen Pilot-2-WebView vorhanden,
2. `platformIsVerified() == true`,
3. Pilot-2-Version ist erfasst,
4. RC- und Aircraft-Identität werden im Fixture ausschließlich als SHA-256
   veröffentlicht,
5. RC + Aircraft entsprechen zusammen exakt einem FH2-`update_topo`-Paar,
6. der read-only Status der DJI-Module wurde erfasst,
7. der Browser-Safety-/Secret-Scan ist grün,
8. im veröffentlichten Fixture befinden sich keine produktiven Secrets.

Der integrierte Softwarepfad führt **keine** License-Verifikation, keine
Modulkonfiguration und keine MQTT/API/WS-Anmeldung aus. Deshalb sind
Thing-Verbindung, Workspace-Konfiguration oder Feature-Module kein Pflichtbeleg
für diesen read-only Runtimeblock.

Ein späterer schreibender Pilot-2-Bootstrap benötigt einen eigenen
authentisierten Backendvertrag und eine neue Abnahme.

Details: [DJI_JSBRIDGE.md](DJI_JSBRIDGE.md).

## 7. MSDK KeyManager — REQUIRED_HARDWARE

Der KeyManager-Vertrag ist als Android-MSDK-Runtime implementiert. Die
Software-CI prüft Build, Snapshot-Vertrag und die Trennung von Key-Metadaten
und FH2-Control-Capabilities. Eine Hardware-Supportzusage benötigt zusätzlich
einen realen, redigierten Capture unter
`docs/fixtures/msdk/keymanager-evidence.json`.

Der reale Capture muss mindestens zeigen:

1. registrierte und verbundene MSDK-Runtime,
2. nicht leeres `keyManager.keys[]`-Inventar,
3. mindestens einen erfolgreich beobachteten Key mit
   `runtimeStatus=supported`,
4. mindestens einen Key mit `canSet=true` oder
   `canPerformAction=true` als **Metadatenbeleg**, ohne automatische
   FH2-Control-Freigabe,
5. mindestens einen kamera-linsengebundenen Key mit `cameraLensType`,
6. Component-/Lens-Kontext und Callback-/Fehlerstatus,
7. Listener-Cleanup nach Disconnect/Refresh.

Die App-Ausgabe kann zusätzlich lokal geprüft werden mit:

```bash
node scripts/verify-msdk-evidence.mjs --keymanager <evidence.json>
```

Synthetische Inventare zählen nicht als reale Hardwareevidenz.

## CI-Regel

Die zentrale Direktor-CI besitzt zwei Evidence-Sichten:

- `main`: nur echte `REQUIRED_MAIN`-Gates sind blockierend.
- `all`: zusätzlich werden `REQUIRED_DRAFT` und `REQUIRED_HARDWARE`
  blockierend ausgewertet.

Die M3T-, M4T-, M3M-, WPML-, Pilot-2-JSBridge- und MSDK-KeyManager-Nachweise
sind Produkt-/Hardware-Supportgates. Fehlende reale Fixtures bleiben in der
normalen Software-CI als `PENDING` sichtbar, blockieren den FC0-Basisrelease
aber nicht. Für eine konkrete Hardware-Supportfreigabe ist der strikte
`all`-Scope zu verwenden.

CONDITIONAL-Nachweise werden nur für weiterhin unterstützte Profile aktiviert.
Dock-, Multi-Dock- und PSDK-Nachweise sind ausdrücklich **keine** Conditional-
Gates mehr, weil diese Funktionsfamilien global deaktiviert sind. Fehlende
Hardware wird nie durch synthetische Fixtures oder Annahmen ersetzt.
