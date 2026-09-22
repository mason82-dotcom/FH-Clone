# FlightHub 2 OpenAPI – Fehlerreferenz

## Zweck

Dieses Dokument hinterlegt den vom Projektinhaber bereitgestellten
Referenzsnapshot `OpenAPI_related_errorcodes.txt` für FlightHub-2-/OpenAPI-nahe
DJI-Fehlercodes.

Die Codes werden hier als **Referenz** geführt. Sie erzeugen nicht automatisch
Retry-, Safety-, FC- oder UI-Logik. Vor einer produktiven Reaktion muss der
konkrete API-/Gerätekontext eindeutig sein.

Wichtige Trennung:

```text
HTTP-Status / FH2-Control-API-Fehler
!=
DJI OpenAPI Businesscode
!=
DJI Geräte-/Missionsfehlercode
```

Die englischen Beschreibungen bleiben unverändert, damit Logmeldungen und
Herstellerreferenzen direkt abgeglichen werden können.

## I. Flight Mission & Route Execution Related

| Error Code | Description (English) |
| --- | --- |
| 321531 - 321534 | Approach/Departure route execution failed. Please contact DJI Support. |
| 321563 | Route generation failed. Please check if the aircraft's vision lenses are dirty or restart the aircraft. If the error persists, contact DJI Support. |
| 321769 | Poor satellite signal. Unable to execute the flight mission. Please restart the Dock and retry. |
| 321770 | Incorrect aircraft gear mode. Unable to execute the flight mission. Please restart the Dock and retry. |
| 321771 | Aircraft home point not set. Unable to execute the flight mission. Please restart the Dock and retry. |
| 321772 | Aircraft battery level is below 30%. Unable to execute the flight mission. Please recharge (recommended ≥50%). |
| 321773 | Aircraft returned to home due to low battery during the mission. Could not complete the route flight. |
| 321775 | Aircraft lost connection during route flight. Could not complete the route flight. |
| 321776 | Aircraft RTK convergence failed. Unable to execute the flight mission. Please restart the Dock and retry. |
| 321777 | Aircraft is not hovering. Unable to start the flight mission. |
| 321778 | The user started the propellers using Remote Controller B, preventing the Dock from executing the flight mission. |
| 321779 | Ambient environment is too bright/dark or has excessive light contrast, preventing the camera from assessing terrain for real-time terrain following. |
| 321784 | Emergency return to home due to strong winds encountered during the mission. |
| 321788 | Mission failed. Aircraft returned abnormally due to signal interference. |
| 322023 | Critical aircraft fault occurred. Unable to execute the flight mission. |
| 322281 | Mission failed. The Dock's mission execution was manually interrupted by the user. |
| 322282 | Mission execution was interrupted as the aircraft was taken over by a cloud user or the remote controller. |
| 322283 | Mission execution was interrupted as the user triggered return to home. Could not complete the route flight. |
| 322539 | Incorrect route breakpoint information. The Dock cannot execute the flight mission. |
| 322550 | Route execution failed. Abnormal turn entry distance. |

## II. Device Logs & File Operations Related

| Error Code | Description (English) |
| --- | --- |
| 324012 | Log compression timeout. Too many logs selected. Please reduce the selection and retry. |
| 324013 | Failed to get device log list. Please try again later. |
| 324014 | Device log list is empty. Please refresh the page or restart the Dock and retry. |
| 324015 | Aircraft is powered off or not connected. Cannot get log list. Please ensure the aircraft is in the Dock, power it on via remote debugging, and retry. |
| 324016 | Insufficient Dock storage space. Log compression failed. Please free up space or try again later. |
| 324017 | Log compression failed. Could not get the selected aircraft logs. Please refresh the page or restart the Dock and retry. |
| 324018 | Failed to fetch log files, causing this device exception feedback upload to fail. Please try again later or restart the Dock. |
| 324019 | Log upload failed due to Dock network anomaly. Please try again later. If this occurs repeatedly, contact your dealer or DJI Support for network troubleshooting. |
| 324021 | Log export failed because it was interrupted by a Dock power outage or restart. Please try again later. |
| 324022 | Log export failed because it was interrupted by device disconnection or restart. Please try again later. |
| 324030 | Media files are temporarily unavailable for upload, or files were uploaded but could not be read by the cloud, due to Dock network anomaly or aircraft video transmission link anomaly. |
| 324040 - 324054, 324060 - 324063 | Request failed. Please try again later. |
| 324064 | Request failed. Please refresh the onboard certificate and retry. |
| 324065 | Certificate is not available for this Dock. Please refresh the page and retry. |
| 324066 - 324067 | Request failed. Please refresh and retry. |
| 324071 - 324076 | Operation failed. Please try again later. |
| 324080 - 324083 | Flight safety database update failed. Please try again later. |
| 324084 | Flight safety database update abnormal. Please upgrade the aircraft firmware again. |

## III. Device Health Assessment & Algorithm Management

| Error Code | Description (English) |
| --- | --- |
| 324100 - 324102 | Device health assessment failed. Please try again later. |
| 324103 | Device health assessment is in progress. Please wait for it to complete. |
| 324104 | Device health assessment failed. Please do not disable the Dock's remote debugging mode during self-check. |
| 324105 | Device health assessment failed. Please do not restart the Dock during the assessment. |
| 324106 | Device health assessment timeout. Please try again later. |
| 324110 - 324114 | Failed to configure access point settings (SSID, password, broadcast interval, hide/unhide, allow connection). |
| 324116 | Remote access point search failed. |
| 324117 | Relay connection failed. |
| 324118 | Relay disconnection failed. |
| 324130 - 324132, 324139 | Operation failed. Please restart the aircraft and retry. |
| 324134 | Operation failed. Please power on the aircraft manually or try again later. |
| 324135 | Operation failed. Please check the network connection. |
| 324136 | Operation failed. Please restart the Dock and retry. |
| 324137 | Operation failed. Algorithm file format error. Please contact the algorithm provider. |
| 324138 | Operation failed. Insufficient aircraft storage space. Please uninstall other algorithms on this aircraft and retry. |
| 324140 | Operation failed. Please do not restart the Dock while loading or updating onboard algorithms. |

## IV. Live Streaming, Sharing & System Configuration

| Error Code | Description (English) |
| --- | --- |
| 228612 | Control link abnormal. Please try again later. |
| 228703 | Cannot switch live stream because the aircraft is being controlled remotely. |
| 228800 | Please take off first to use this function. |
| 229001 | No available RTK account currently. Please try again later. |
| 229025 | Activation code is not for the current region. Activation failed. |
| 229031 | Illegal PSDK command. Send failed. |
| 229032 | Server access error. |
| 229033 | Current device cannot be cloud-bound due to device abnormality. |
| 229034 | Failed to get device SN. |
| 231001 - 231019, 231100, 231201 - 231206 | Share creation/cancellation/viewing/modification failed, or share has expired/been canceled. |
| 233300 - 233309 | Parameter configuration error, e.g., failed to generate temporary credentials, config query/deletion failed, organization key does not exist, etc. |
| 238001 | Server error. Please try again later. |
| 238002 | Operation not supported. Only available when the device is idle. |
| 238003 | Operation failed. The device is loading/updating/unloading other algorithms. Please try again later. |
| 238004 - 238008 | Algorithm import/creation failed (already exists, status changed, not distributed by organization, file format error, etc.). |
| 239001 - 239014 | Algorithm vendor service error, stream push failed, instance creation limit reached, third-party API request error, etc. |
| 241001 - 241007 | DJI SkySync server error, file sync timeout, target bucket error, network error, file format error, etc. |
| 242001 | Analyzer name already exists. Please modify it and retry. |
| 243001 - 243002 | Volume calculation failed. No intersection found in the model. |
| 246003 | Uploaded metadata file size exceeds the limit (5MB). |
| 246007 - 246008 | Invalid name_id or account format in metadata file. Only email addresses are supported. |
| 246009 | No matching domain information found. |
| 246010 | Failed to generate SSO login link. Please check the metadata and re-upload. |
| 246011 | The entity_id in the metadata file is already configured in DJI SkySync. |
| 246013 | Enterprise plan not activated. |
| 246014 | Enterprise plan has expired. |

## V. Device Upgrade & General Errors

| Error Code | Description (English) |
| --- | --- |
| 312001, 312003, 312010 | Upgrade failed. Please retry. |
| 312011 | Operation too frequent. Please do not repeat the operation. |
| 312014 | Device upgrade in progress. Please do not repeat the operation. |
| 312015 | Upgrade failed. Dock is busy. Please retry when the Dock is idle. |
| 312016 | Upgrade failed due to abnormal video transmission link between Dock and payload. Please restart the Dock and payload and retry. |
| 312022 | Aircraft power-on failed or not connected. Check if the aircraft is in the Dock, battery is installed, and Dock/aircraft are paired. |
| 312023 | Upgrade failed because the hold-down arm could not close. Check if the emergency stop button is pressed or if the arm is obstructed. |
| 312027 | Upgrade failed. Dock did not detect the payload. |
| 312028 | Upgrade failed because the device was restarted during the process. |
| 312029 | Upgrade not possible while device is restarting. Wait for restart completion. |
| 312030 | Upgrade failed. Please try again later. |
| 312031 | Upgrade failed. Failed to disable Enhanced Transmission. Please disable it manually and retry. |
| 312032 | Upgrade failed. Please try again later. |
| 312033 | Relay upgrade failed. Please try again later. |
| 325001, 238001 | Server error. |

## Verwendung in FH2

Die Referenz dient zunächst für:

- Diagnose und Log-Korrelation
- Anzeige verständlicher Herstellerfehler in der WebUI
- Zuordnung von Mission-/Task-Abbrüchen
- spätere HMS-/OpenAPI-Auswertung
- Testfixtures für bekannte Business-/Gerätefehler

Nicht automatisch daraus ableiten:

- Retry ohne Kontext
- automatische Wiederaufnahme einer Mission
- Änderung der Safety Stage
- Aktivierung von FC1/FC2/FC3
- automatisches RTH
- DRC-/Control-Authority-Änderungen

Ein späterer maschinenlesbarer Fehlerkatalog darf diese Tabelle übernehmen,
muss aber den originalen DJI-Code, die Rohmeldung und den konkreten
Quellendpunkt im Audit erhalten.
