# WPML / Pilot 2 Hardware-Evidence

Dieses Verzeichnis enthält ausschließlich das **redigierte öffentliche Manifest**
für den realen DJI-Pilot-2-/WPML-Nachweis.

Das originale DJI-Pilot-2-KMZ bleibt außerhalb des Repositories, zum Beispiel:

```bash
mkdir -p ~/fh2-evidence/wpml
chmod 700 ~/fh2-evidence/wpml
```

## Voraussetzungen

Vor dem Export müssen beide Teile real beobachtet sein:

1. DJI Pilot 2 hat den self-hosted read-only Wayline-Listenpfad tatsächlich
   aufgerufen. Der Serverstatus muss mindestens
   `pilotWebViewListRequests >= 1` zeigen.
2. Ein echtes, von DJI Pilot 2 erzeugtes KMZ liegt lokal vor und enthält
   `wpmz/template.kml` und `wpmz/waylines.wpml`.

Lokale `curl`-Aufrufe zählen **nicht** als Pilot-Hardware-Evidence.

Der Control-API-Status enthält keine Tokens, Workspace-ID, Seriennummern,
Koordinaten oder vollständigen User-Agent-Strings. Für den Pilot-2-Nachweis
wird nur gezählt, ob ein erfolgreicher Listenabruf mit der in der realen
DJI-Pilot-WebView beobachteten `dji-open-platform`-Signatur angekommen ist.

## Status prüfen

```bash
curl -sS \
  http://127.0.0.1:8082/api/dji/pilot/wayline-server/status \
  | jq .
```

Erwartet nach einem realen Pilot-2-Listenabruf:

```json
{
  "enabled": true,
  "configured": true,
  "readOnly": true,
  "listRequests": 1,
  "pilotWebViewListRequests": 1,
  "lastPilotWebViewListRequestAt": "..."
}
```

Die Zähler sind Prozessspeicher. Ein Neustart der Control API setzt sie zurück.

## Redigiertes Evidence-Manifest erzeugen

```bash
npm run export:wpml-evidence -- \
  --real-hardware \
  --kmz ~/fh2-evidence/wpml/pilot2-real.kmz \
  --status-url http://127.0.0.1:8082/api/dji/pilot/wayline-server/status \
  --out docs/fixtures/wpml/evidence.json
```

Alternativ kann ein zuvor lokal gespeicherter Status verwendet werden:

```bash
curl -sS \
  http://127.0.0.1:8082/api/dji/pilot/wayline-server/status \
  > ~/fh2-evidence/wpml/wayline-server-status.json

npm run export:wpml-evidence -- \
  --real-hardware \
  --kmz ~/fh2-evidence/wpml/pilot2-real.kmz \
  --status-file ~/fh2-evidence/wpml/wayline-server-status.json
```

Der Exporter:

- liest das originale KMZ mit dem FH2-WPML-Reader,
- verweigert KMZs mit Parser-/Strukturfehlern,
- prüft MissionConfig, Produkt-/Payload-Enums, Höhenmodi,
  Template-/Wayline-Zuordnung und lückenlose Waypoint-Indizes,
- prüft im XML referenzierte `res/`-Ressourcen gegen das Archiv,
- speichert nur den SHA-256 des Original-KMZ und strukturelle Metadaten,
- übernimmt keine XML-Inhalte, Koordinaten, Workspace-ID oder Tokens,
- akzeptiert den Pilot-Katalogteil nur nach real beobachtetem
  DJI-Pilot-WebView-Abruf.

Anschließend:

```bash
node scripts/hardware-evidence-audit.mjs \
  | grep 'WPML_PILOT'
```

Das öffentliche Fixture ist erst dann Hardware-Evidence, wenn es
`realHardware=true`, `synthetic=false` und `redacted=true` enthält.
