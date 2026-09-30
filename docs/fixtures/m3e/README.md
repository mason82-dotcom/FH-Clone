# M3E MQTT Hardware Evidence

Dieser Ordner enthält ausschließlich redigierte reale Hardwarebelege für:

- DJI RC Pro Enterprise: `domain=2, type=144, sub_type=0`
- DJI Mavic 3 Enterprise: `domain=0, type=77, sub_type=0`
- eingebaute M3E-Kamera: `payload_index=66-0-0`

Rohcaptures bleiben außerhalb des Repositories unter `~/fh2-evidence/`.
Seriennummern, genaue GPS-Koordinaten, Credentials und sonstige Secrets
dürfen nicht committed werden.

Erzeugung:

```bash
npm run redact:dji-mqtt-evidence -- --real-hardware --profile m3e \
  ~/fh2-evidence/m3e-mqtt-raw.json \
  docs/fixtures/m3e/mqtt-evidence.json
```

Der Redactor prüft das Produktprofil und bricht ab, wenn ein M3T- oder anderes
Aircraft-Capture fälschlich als M3E ausgegeben werden soll.
