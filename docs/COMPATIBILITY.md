# Kompatibilität

Diese Datei dokumentiert nur Versionen und Funktionen, die für FH-Clone gegen Herstellerdokumentation verifiziert wurden.

## DJI Cloud API

**Baseline: 1.16.1**

Verifizierte Release-Folge:

| Version | Veröffentlichung | Relevanz |
| --- | --- | --- |
| 1.15 | 2025-06-10 | u. a. Matrice 400 und MOP-Unterstützung im Pilot-Cloud-Pfad |
| 1.16 | 2025-11-26 | u. a. neue Dock-3-Funktionen |
| 1.16.1 | 2025-12-17 | aktuellste verifizierte Cloud-API-Freigabe |

Die allgemeine DJI-Developer-Startseite kann einen älteren Versionsstand anzeigen. Für FH-Clone ist die Release-History der Cloud-API-Dokumentation maßgeblich.

Die API-Version wird im Adapter als **Kompatibilitätsprofil** geführt. MQTT selbst verhandelt diese Produktversion nicht.

Offizielle Quellen:

- https://developer.dji.com/doc/cloud-api-tutorial/cn/
- https://developer.dji.com/doc/cloud-api-tutorial/en/overview/product-support.html

## Weitere DJI SDKs

Die Adapter bleiben voneinander entkoppelt. Zum Zeitpunkt der letzten Prüfung wurden u. a. folgende aktuelle Stände dokumentiert:

- Android Mobile SDK 5.18.0 (2026-05-22)
- Payload SDK 3.16.0 (2026-03-31)
- Edge SDK V2.0.0 (2026-06-16, produktspezifisch)

Versionsstände sind keine Aussage darüber, dass jedes SDK auf jedem Fluggerät verfügbar ist. Die tatsächlichen Capabilities werden deshalb zur Laufzeit pro Gerät/Adapter ermittelt.
