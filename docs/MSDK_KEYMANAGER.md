# DJI Mobile SDK V5 – KeyManager / DJIKey Vertrag

## Zweck

Dieses Dokument definiert den verbindlichen FH2-Vertrag für eine spätere
Android-/RC-basierte DJI-MSDK-V5-Bridge.

Die MSDK-Key-Schicht bleibt strikt getrennt von DJI Cloud API / MQTT:

```text
DJI Cloud API Property / Service
  !=
MSDK DJIKey / IKeyManager

beide
  -> herstellerspezifischer Adapter
  -> SDK-neutraler FH2 Aircraft Core
```

Ein vorhandener DJI-Key erzeugt deshalb weder automatisch eine Cloud-
Capability noch eine FH2-Schreibfreigabe.

## Normative DJI-Bausteine

MSDK V5 verwendet:

- `DJIKeyInfo<T>` bzw. `DJIActionKeyInfo<P,R>` als Beschreibung eines Keys
- `DJIKey<T>` bzw. `DJIKey.ActionKey<P,R>` als konkrete Key-Instanz
- `KeyTools` zur Instanziierung
- `KeyManager` / `IKeyManager` für Get, Set, Listen und Action

Der `KeyManager` ist seit MSDK 5.0.0 dokumentiert.

## Capability-Prüfung pro Key

FH2 darf niemals allein aus dem Namen oder der Existenz eines Keys ableiten,
welche Operationen erlaubt sind.

Die DJI-Key-Definition trägt explizite Operationsmerkmale:

```text
DJIKeyInfo.isCanGet()
DJIKeyInfo.isCanSet()
DJIKeyInfo.isCanListen()
DJIKeyInfo.isCanPerformAction()
```

Der offizielle DJI-Samplecode verwendet genau diese Werte, um die verfügbaren
Operationen pro Key zu aktivieren oder zu deaktivieren.

Verbindliche FH2-Regel:

```text
Key vorhanden
  !=
Get + Set + Listen + Action unterstützt
```

Beispiele aus der DJI-API:

- `ProductKey.KeyConnection`:
  Get = ja, Set = nein, Listen = ja, Action = nein
- `CameraKey.KeyCameraMode`:
  Get = ja, Set = ja, Listen = ja, Action = nein
- `RemoteControllerKey.KeyControlMode`:
  Get = ja, Set = ja, Listen = nein, Action = nein
- `RemoteControllerKey.KeyRebootDevice`:
  Action = ja; normale Get-/Set-/Listen-Operationen sind nicht der Vertrag

Zusätzlich bleibt die reale Produkt-/Firmware-/Index-Unterstützung relevant.
Ein statisches `isCan*`-Merkmal ist keine Garantie, dass die Operation auf
jedem verbundenen Produkt erfolgreich ausgeführt wird.

## IKeyManager-Operationen

### Synchrones Get aus dem MSDK-Cache

```java
<R> R getValue(DJIKey<R> key)
<R> R getValue(DJIKey<R> key, R defaultValue)
```

Diese Varianten lesen den aktuellen MSDK-Cache.

FH2-Regel:

- geeignet für bereits beobachtete Zustände und UI-Snapshots
- ein fehlender Cachewert ist kein Hardwarefehler
- `defaultValue` ist ein Fallback und keine echte Gerätebeobachtung
- ein Defaultwert darf nicht als Telemetrie mit Qualität `good` persistiert
  werden

### Asynchrones Get vom Gerät

```java
<R> void getValue(
    DJIKey<R> key,
    CompletionCallbackWithParam<R> callback
)
```

DJI beschreibt diese Variante als asynchronen Wertabruf vom Hardwaregerät.

FH2-Regel:

- für explizite Refresh-/Probe-Operationen bevorzugen
- Callback-Fehler unverändert als Adapterfehler behandeln
- keinen erfolgreichen Wert erfinden, wenn der Callback fehlschlägt

### Set

```java
<P> void setValue(
    DJIKey<P> key,
    P param,
    CompletionCallback callback
)
```

Nur zulässig, wenn:

1. `DJIKeyInfo.isCanSet() == true`
2. der verbundene Produkttyp den konkreten Key unterstützt
3. FH2 die zugehörige schreibende Capability tatsächlich implementiert
4. die benötigte Safety-Stufe aktiv ist
5. Control Authority / Lease / produktspezifische Vorbedingungen erfüllt sind

Ein `canSet=true` hebt keine FH2-Safety-Regel auf.

### Action

DJI unterscheidet Actions ohne und mit Parameter:

```java
<R> void performAction(
    DJIKey.ActionKey<?, R> key,
    CompletionCallbackWithParam<R> callback
)

<P,R> void performAction(
    DJIKey.ActionKey<P,R> key,
    P param,
    CompletionCallbackWithParam<R> callback
)
```

FH2 behandelt Actions als eigene schreibende Operationsklasse.
Sie dürfen nicht als normales `setValue` modelliert werden.

### Listen

```java
<R> void listen(
    DJIKey<R> key,
    Object listenHolder,
    KeyListener<R> callback
)

<R> void listen(
    DJIKey<R> key,
    Object listenHolder,
    boolean getOnce,
    KeyListener<R> callback
)
```

`getOnce=true` kombiniert die Listener-Registrierung mit einem einmaligen
asynchronen Wertabruf.

FH2-Regel:

- Listener benötigen einen stabilen Lifecycle-Holder
- `oldValue` und `newValue` bleiben Adapterdetails; normalisiert wird nur
  der tatsächlich relevante neue Zustand
- Listener dürfen nach Adapter-/ViewModel-/Bridge-Shutdown nicht weiterleben

### Cancel Listen

DJI bietet drei Varianten:

```java
cancelListen(DJIKey<?> key, Object listenHolder)
cancelListen(DJIKey<?> key)
cancelListen(Object listenHolder)
```

Der offizielle DJI-Samplecode verwendet insbesondere
`KeyManager.getInstance().cancelListen(this)` beim Lifecycle-Cleanup.

Verbindliche FH2-Regel:

```text
Bridge/Scope stop
  -> cancelListen(holder)
  -> keine verwaisten MSDK-Listener
```

## KeyTools und Key-Identität

### Nicht kamera-/gimbalgebundene Keys

```java
KeyTools.createKey(DJIKeyInfo<T> keyInfo)
```

Beispiel: FlightController-/Product-Keys.

### Gimbalgebundene Keys

```java
KeyTools.createKey(
    DJIKeyInfo<T> keyInfo,
    ComponentIndexType componentIndexType
)
```

Der Komponentenindex gehört zur Identität des konkreten Keys.

### Kameragebundene Keys

```java
KeyTools.createCameraKey(
    DJIKeyInfo<T> keyInfo,
    ComponentIndexType componentIndexType,
    CameraLensType cameraLensType
)
```

Damit werden bei Mehrfachkamera-/Multilens-Systemen Gimbalposition und
Linsentyp explizit adressiert.

### Vollständige Low-Level-Variante

```java
KeyTools.createKey(
    DJIKeyInfo<T> keyInfo,
    int productId,
    int componentIndex,
    int subComponentType,
    int subComponentIndex
)
```

DJI dokumentiert:

- `productId`: Produkt-ID, Standard 0
- `componentIndex`: Gimbal-/Payload-Position
- `subComponentType`: Kamera-/Linsentyp
- `subComponentIndex`: reserviert

Der gleiche Mechanismus existiert auch für `DJIActionKeyInfo`.

FH2 soll die typsicheren `ComponentIndexType`-/`CameraLensType`-
Varianten bevorzugen, sofern der konkrete Key damit erzeugt werden kann.
Die Low-Level-Integer-Variante bleibt für generische Bridge-Introspektion
möglich.

## FH2 Bridge-Vertrag

Die spätere Android-Bridge meldet pro konkret instanziiertem Key mindestens:

```text
identifier
componentIndex
cameraLensType / subComponentType
canGet
canSet
canListen
canPerformAction
isEvent
valueType
runtimeStatus
```

`runtimeStatus` unterscheidet mindestens:

```text
supported
unsupported_on_product
temporarily_unavailable
disconnected
error
```

Wichtig:

```text
DJIKeyInfo capability
  -> statische Operationsfähigkeit des Key-Vertrags

Runtime Probe / Callback
  -> tatsächliche Verfügbarkeit auf Gerät + Firmware + Index/Linse

FH2 AdapterDevice.capabilities[]
  -> nur wirklich implementierte und routbare FH2-Funktion
```

Diese drei Ebenen dürfen nicht zusammengelegt werden.

## Empfohlene Capability-Ableitung

Beispiele:

| MSDK-Key-Evidenz | mögliche FH2-Evidenz | automatische Schreibfreigabe |
| --- | --- | --- |
| FlightController Position/Attitude Get/Listen | `telemetry.flight` | nein |
| Battery Get/Listen | `telemetry.battery` | nein |
| Camera Get/Listen | `telemetry.camera` | nein |
| Gimbal Get/Listen | `telemetry.gimbal` | nein |
| RTK Key/Manager | `telemetry.rtk` | nein |
| Camera Key mit `canSet` | Produktsupport für Camera-Write | **nein** |
| ActionKey | Produktsupport für Action | **nein** |

Eine schreibende Core-Capability entsteht erst, wenn der MSDK-Adapter den
Befehl wirklich ausführen kann und die FH2-Safety-/Authority-Regeln erfüllt.

## Komponentenfamilien

Der KeyManager ist unter anderem für folgende Key-Familien relevant:

- `ProductKey`
- `AirLinkKey`
- `CameraKey`
- `GimbalKey`
- `FlightControllerKey`
- `RemoteControllerKey`
- `BatteryKey`

Weitere MSDK-Manager wie RTK-, Media-, Waypoint-, Virtual-Stick- oder
Intelligent-Flight-Manager bleiben separate APIs. Sie werden nicht künstlich
als KeyManager-Key modelliert, wenn DJI dafür einen eigenen Managervertrag
vorsieht.

## Fehler- und Lifecycle-Regeln

1. MSDK-Callbackfehler unverändert erfassen; keine Success-Fallbacks erfinden.
2. Cache-Read und Hardware-Read unterscheiden.
3. Defaultwerte als `fallback` kennzeichnen, nicht als reale Telemetrie.
4. Listener immer an einen Holder binden.
5. Beim Scope-/Adapter-Shutdown alle Listener des Holders abbrechen.
6. Kamera-/Gimbal-Key nie ohne korrekten Component-/Lens-Kontext erzeugen.
7. `isCanSet/isCanPerformAction` sind notwendige, aber nicht hinreichende
   Bedingungen für FH2-Write.
8. Cloud-API-Capabilities und MSDK-Capabilities getrennt halten.
9. Keine DJI-Java-/Kotlin-Typen über die Bridge in den Aircraft Core leaken.

## Projektstatus

Aktuell ist dies ein **verbindlicher Integrationsvertrag**, noch kein
ausführbarer Android-MSDK-Adapter.

Für einen produktiven Bridge-Adapter fehlen weiterhin:

- Android-Modul / RC-Laufzeit
- konkrete Bridge-Transportdefinition
- Geräte-/Key-Inventarisierung
- Mapping DJI-Werte -> Core-`ParameterSample`
- Callback-/Fehler-Mapping
- reale Geräte- und Firmwaretests
- Safety-/Authority-Anbindung für schreibende Keys

Bis dahin darf FH2 keine `msdk.*`-Schreibfähigkeit als verfügbar melden.

## Offizielle DJI-Referenzen

- KeyManager und DJIKey:
  https://sdk-forum.dji.net/hc/en-us/articles/6392364742809-Chapter-4-The-KeyManager-and-the-DJIKey
- Operationsunterstützung pro Key:
  https://sdk-forum.dji.net/hc/en-us/articles/15152468943641-How-to-check-which-KeyManager-interfaces-are-supported-by-a-Key
- IKeyManager:
  https://developer.dji.com/api-reference-v5/android-api/Components/IKeyManager/IKeyManager.html
- KeyTools:
  https://developer.dji.com/api-reference-v5/android-api/Components/IKeyManager/KeyTools.html
- DJI Mobile SDK V5 Sample:
  https://github.com/dji-sdk/Mobile-SDK-Android-V5
