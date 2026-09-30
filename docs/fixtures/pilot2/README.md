# Pilot 2 JSBridge Hardware Evidence

Dieser Ordner enthält ausschließlich redigierte reale Hardware-Evidence für
die DJI-Pilot-2-JSBridge-Runtime.

Erzeugung:

1. Pilot-to-Cloud/MQTT in DJI Pilot 2 verbinden.
2. In derselben WebView `/pilot-evidence` öffnen.
3. **Redigierte JSBridge-Evidence erfassen** auslösen.
4. Auf dem Pi:

```bash
npm run export:pilot2-evidence -- --real-hardware
node scripts/hardware-evidence-audit.mjs | grep 'PILOT2_JSBRIDGE'
```

Der öffentliche Capture darf ausschließlich SHA-256-Hashes der RC-/Aircraft-
Identitäten enthalten. Roh-Seriennummern, App-Key, License, MQTT-Passwort,
API-/WS-Token und sonstige Secrets dürfen nicht committed werden.

Der Control-API-Capture-Store ist nur In-Memory. Ein Neustart verwirft den
letzten Capture und erfordert eine neue reale Pilot-2-Aufnahme.
