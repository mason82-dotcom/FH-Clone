# EMQX in FH-Clone

## Aufgabe

EMQX transportiert den DJI-Basic-Link und interne MQTT-Kommunikation.

Die Broker-Konfiguration ist Teil des Sicherheitsmodells und darf nicht als
reiner Nachrichtenbus betrachtet werden.

Für das verbindliche EMQX-5.7-Profil wird `emqx.conf` verwendet. Das von
neueren EMQX-Versionen bekannte `base.hocon` ist in 5.7 noch nicht der
Konfigurationspfad und wird deshalb nicht als V3-Quelle verwendet.

## Warum dynamische Autorisierung?

DJI Pilot 2 meldet ein Gateway und untergeordnete Geräte getrennt.

```text
Gateway / Controller -> gateway_sn
Aircraft             -> device_sn
```

Beispiele:

```text
sys/product/{gateway_sn}/status
thing/product/{device_sn}/osd
thing/product/{device_sn}/state
thing/product/{gateway_sn}/services
```

Eine statische Regel `thing/product/{clientid}/#` ist deshalb ungeeignet.
Eine globale Freigabe wie `thing/product/+/osd` pro Gateway wäre dagegen zu
breit.

FH-Clone kombiniert daher dynamische und statische Regeln.

## Authorizer-Kette

```text
EMQX HTTP AuthN        V3-Ziel
      |
      v
EMQX HTTP AuthZ
      |
      +-- allow / deny
      |
      +-- ignore
            |
            v
       Datei-ACL
            |
            v
           DENY
```

`authorization.no_match = deny` bleibt verbindlich.

## Sicherheitsidentität

Die MQTT-Client-ID ist **nicht** die Sicherheitsidentität.

V3 verwendet serverseitig gebundene Gateway-Credentials und
`client_attrs.gateway_sn`.

Die reale Client-ID bleibt wichtig für:

- Sitzungsdiagnose
- Reconnect
- Duplicate-Client-Erkennung
- Hardwaretests

Sie darf jedoch keine Gateway-SN frei bestimmen.

## Topologie

`update_topo` füllt die `DjiTopologyRegistry`.

Danach darf ein authentifiziertes Gateway nur für aktuell zugeordnete
Sub-Devices die bestätigten Device-Topics verwenden.

Entfernte Sub-Devices müssen ihre dynamischen Rechte wieder verlieren.

## Rollen

### DJI-Gateway

Dynamisch autorisiert. Rechte basieren auf:

- authentifiziertem Principal
- trusted `gateway_sn`
- gelernter Topologie
- Topic-Richtung

### Backend-Service

Interner FH2-Dienst für notwendige Cloud-Downlinks und Brokerdiagnose.
Schreibende Funktionen bleiben zusätzlich durch Safety und Control Authority
geschützt.

### Diagnose/Dashboard

Nur lesend. Produktive Weboberflächen verwenden vorzugsweise HTTP/SSE statt
direkter MQTT-Zugangsdaten.

## Basic Link und DRC

DRC ist absichtlich nicht Bestandteil der permanenten Basic-Link-ACL.

```text
Basic Link -> dauerhaft, geräte-/topologiebezogen
DRC        -> separate FC3-Sitzung mit eigenen Credentials
```

## Interner Control-API-Port

```text
control-api:8081
```

ist ausschließlich für Broker-/Infrastrukturzugriffe vorgesehen und darf nicht
öffentlich veröffentlicht werden.

## Dateien

- `emqx.conf` – statische EMQX-5.7-Konfiguration für AuthN/AuthZ
- `acl.conf` – statische Fallback-ACL
- `../../docs/EMQX-AUTHZ.md` – detaillierter Vertrag
- `../../docs/DJI_MQTT_SECURITY.md` – V3-Sicherheitsarchitektur
