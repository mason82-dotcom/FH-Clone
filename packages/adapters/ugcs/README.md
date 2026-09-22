# UgCS Adapter

UgCS ist die primäre Groundstation-Integration von FH-Clone.

## Ziel

Der Adapter kapselt Groundstation-Funktionen wie:

- verbundene Fahrzeuge lesen,
- Groundstation-Telemetrie anbinden,
- Missionen/Routen importieren und exportieren,
- Missionen an ein Fahrzeug übertragen,
- später Groundstation-spezifische Missionsausführung.

## Transport

FH-Clone nimmt **keinen nicht dokumentierten UgCS-Endpunkt an**.

Die TypeScript-Schicht definiert deshalb nur `UgcsBridgeTransport`. Eine konkrete Bridge kann separat implementiert werden, sobald die eingesetzte UgCS-Version und ihr unterstützter Integrationsweg feststehen.

Verifizierter Integrationspfad:

- UgCS Client / UCS als Groundsoftware
- UgCS SkyHub SDK 1.4.0 für SkyHub v3
- ROS 2 Galactic / C++ auf der SkyHub-Seite

Der native SkyHub-Agent bleibt damit von der Web-/Backend-Anwendung getrennt.
