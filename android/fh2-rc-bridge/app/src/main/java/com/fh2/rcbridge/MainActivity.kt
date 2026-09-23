package com.fh2.rcbridge

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import android.text.InputType
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var sdkText: TextView
    private lateinit var controlText: TextView
    private lateinit var telemetryText: TextView
    private lateinit var gatewayText: TextView
    private lateinit var sensorText: TextView
    private lateinit var rtkText: TextView
    private lateinit var enableButton: Button
    private lateinit var disableButton: Button
    private lateinit var evidenceButton: Button
    private lateinit var bridgeText: TextView
    private lateinit var baseUrlInput: EditText
    private lateinit var pairingTokenInput: EditText
    private lateinit var pairButton: Button
    private lateinit var unpairButton: Button

    private val sdkListener: (DjiSdkSnapshot) -> Unit = { state ->
        runOnUiThread {
            sdkText.text = buildString {
                appendLine("DJI MSDK 5.18.0")
                appendLine("Init: ${state.initEvent} (${state.initProgress})")
                appendLine("Registriert: ${state.registered}")
                appendLine("Produkt verbunden: ${state.productConnected}")
                append("Product-ID: ${state.productId ?: "-"}")
                state.registrationError?.let {
                    appendLine()
                    append("Registrierungsfehler: $it")
                }
            }

            enableButton.isEnabled =
                state.registered && state.productConnected
        }
    }

    private val gatewayListener:
        (RemoteControllerIdentitySnapshot) -> Unit = { state ->
        runOnUiThread {
            gatewayText.text = buildString {
                appendLine("Gateway / Remote Controller")
                appendLine("Verbunden: ${state.connected}")
                appendLine("RC-SN: ${state.serialNumber ?: "-"}")
                append("Firmware: ${state.firmwareVersion ?: "-"}")
            }
        }
    }

    private val telemetryListener: (AircraftTelemetrySnapshot) -> Unit = { state ->
        runOnUiThread {
            telemetryText.text = buildString {
                appendLine("Aircraft: ${state.productType}")
                appendLine("Firmware: ${state.firmwareVersion ?: "-"}")
                appendLine("FC-SN: ${state.flightControllerSerial ?: "-"}")
                appendLine("FC verbunden: ${state.flightControllerConnected}")
                appendLine("Lat: ${state.latitude ?: "-"}")
                appendLine("Lon: ${state.longitude ?: "-"}")
                append("Altitude(raw): ${state.altitudeM ?: "-"} m")
            }
        }
    }

    private val sensorListener: (SensorInventorySnapshot) -> Unit = { state ->
        runOnUiThread {
            sensorText.text = buildString {
                appendLine("Sensorik")
                state.components.forEach { component ->
                    appendLine(
                        "${component.index}: camera=${component.cameraConnected} " +
                            "type=${component.cameraType ?: "-"} " +
                            "gimbal=${component.gimbalConnected}"
                    )
                    if (component.cameraSerial != null) {
                        appendLine("  cameraSn=${component.cameraSerial}")
                    }
                    if (component.streamSources.isNotEmpty()) {
                        appendLine(
                            "  sources=${component.streamSources.joinToString()}"
                        )
                    }
                    if (component.payloadConnected) {
                        appendLine(
                            "  payload=${component.payloadProductName ?: "connected"}"
                        )
                    }
                }
            }.trimEnd()
        }
    }

    private val rtkListener: (RtkSnapshot) -> Unit = { state ->
        runOnUiThread {
            rtkText.text = buildString {
                appendLine("RTK")
                appendLine("Enabled: ${state.enabled}")
                appendLine("Healthy: ${state.healthy}")
                appendLine("Solution: ${state.positioningSolution ?: "-"}")
                appendLine("Source: ${state.referenceStationSource ?: "-"}")
                appendLine(
                    "Mobile: ${state.mobileLatitude ?: "-"}, " +
                        "${state.mobileLongitude ?: "-"}, " +
                        "${state.mobileAltitudeM ?: "-"}"
                )
                appendLine(
                    "Std: lon=${state.stdLongitude ?: "-"} " +
                        "lat=${state.stdLatitude ?: "-"} " +
                        "alt=${state.stdAltitude ?: "-"}"
                )
                if (state.satelliteCounts.isNotEmpty()) {
                    appendLine(
                        "Satelliten: " +
                            state.satelliteCounts.entries.joinToString {
                                "${it.key}=${it.value}"
                            }
                    )
                }
                state.error?.let { append("Fehler: $it") }
            }.trimEnd()
        }
    }

    private val bridgeListener: (Fh2BridgeConnectionSnapshot) -> Unit = { state ->
        runOnUiThread {
            bridgeText.text = buildString {
                appendLine("FH2 Bridge")
                appendLine("Status: ${state.status}")
                appendLine("Server: ${state.baseUrl ?: "-"}")
                appendLine("Gateway: ${state.gatewaySn ?: "-"}")
                appendLine("Aircraft: ${state.aircraftSn ?: "-"}")
                appendLine("Token gültig bis: ${state.expiresAt ?: "-"}")
                append("Letzter Heartbeat: ${state.lastHeartbeatAt ?: "-"}")
                state.lastError?.let {
                    appendLine()
                    append("Fehler: $it")
                }
            }
            unpairButton.isEnabled = state.status == "paired"
        }
    }

    private val controlListener: (VirtualStickSnapshot) -> Unit = { state ->
        runOnUiThread {
            controlText.text = buildString {
                appendLine("Virtual Stick: ${state.enabled}")
                appendLine("Advanced Mode: ${state.advancedMode}")
                appendLine("Authority: ${state.authorityOwner}")
                append("Grund: ${state.changeReason}")
                state.lastError?.let {
                    appendLine()
                    append("Fehler: $it")
                }
            }

            disableButton.isEnabled = state.enabled
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        sdkText = TextView(this).apply {
            textSize = 18f
        }
        controlText = TextView(this).apply {
            textSize = 18f
        }
        telemetryText = TextView(this).apply {
            textSize = 18f
        }
        gatewayText = TextView(this).apply {
            textSize = 18f
        }
        sensorText = TextView(this).apply {
            textSize = 18f
        }
        rtkText = TextView(this).apply {
            textSize = 18f
        }
        bridgeText = TextView(this).apply {
            textSize = 18f
        }
        baseUrlInput = EditText(this).apply {
            hint = "FH2 URL, z. B. https://fh2.example:8080"
            inputType =
                InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
        }
        pairingTokenInput = EditText(this).apply {
            hint = "Pairing-Token"
            inputType =
                InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }

        enableButton = Button(this).apply {
            text = "Virtual Stick anfordern"
            isEnabled = false
            setOnClickListener {
                VirtualStickController.enable { result ->
                    result.exceptionOrNull()?.let { error ->
                        runOnUiThread {
                            controlText.append(
                                "\nEnable fehlgeschlagen: ${error.message}"
                            )
                        }
                    }
                }
            }
        }

        disableButton = Button(this).apply {
            text = "Virtual Stick freigeben"
            isEnabled = false
            setOnClickListener {
                VirtualStickController.disable { result ->
                    result.exceptionOrNull()?.let { error ->
                        runOnUiThread {
                            controlText.append(
                                "\nDisable fehlgeschlagen: ${error.message}"
                            )
                        }
                    }
                }
            }
        }

        evidenceButton = Button(this).apply {
            text = "Hardware-Evidence speichern"
            setOnClickListener {
                runCatching {
                    HardwareEvidenceExporter.export(this@MainActivity)
                }.onSuccess { file ->
                    Toast.makeText(
                        this@MainActivity,
                        "Gespeichert: ${file.absolutePath}",
                        Toast.LENGTH_LONG
                    ).show()
                }.onFailure { error ->
                    Toast.makeText(
                        this@MainActivity,
                        "Export fehlgeschlagen: ${error.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        pairButton = Button(this).apply {
            text = "Mit FH2 pairen"
            setOnClickListener {
                val baseUrl = baseUrlInput.text.toString().trim()
                val pairingToken = pairingTokenInput.text.toString()
                pairingTokenInput.text.clear()

                Fh2BridgeClient.pair(baseUrl, pairingToken) { result ->
                    result.exceptionOrNull()?.let { error ->
                        runOnUiThread {
                            Toast.makeText(
                                this@MainActivity,
                                "Pairing fehlgeschlagen: ${error.message}",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }
            }
        }

        unpairButton = Button(this).apply {
            text = "FH2 Verbindung trennen"
            isEnabled = false
            setOnClickListener {
                Fh2BridgeClient.disconnect()
            }
        }

        val notice = TextView(this).apply {
            text =
                "MSDK-Modus: DJI Pilot 2 muss auf RC Pro Enterprise beendet " +
                "sein. Remote-Steuerung ist in diesem Build noch nicht " +
                "freigeschaltet."
            textSize = 16f
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(32, 32, 32, 32)
            addView(notice, matchWidth())
            addView(sdkText, matchWidth(top = 24))
            addView(gatewayText, matchWidth(top = 24))
            addView(telemetryText, matchWidth(top = 24))
            addView(sensorText, matchWidth(top = 24))
            addView(rtkText, matchWidth(top = 24))
            addView(bridgeText, matchWidth(top = 24))
            addView(baseUrlInput, matchWidth(top = 12))
            addView(pairingTokenInput, matchWidth(top = 12))
            addView(pairButton, matchWidth(top = 12))
            addView(unpairButton, matchWidth(top = 12))
            addView(controlText, matchWidth(top = 24))
            addView(enableButton, matchWidth(top = 24))
            addView(disableButton, matchWidth(top = 12))
            addView(evidenceButton, matchWidth(top = 24))
        }

        setContentView(
            ScrollView(this).apply {
                addView(
                    content,
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT
                    )
                )
            }
        )

        DjiSdkRuntime.addListener(sdkListener)
        RemoteControllerIdentitySource.addListener(gatewayListener)
        AircraftTelemetrySource.addListener(telemetryListener)
        SensorInventorySource.addListener(sensorListener)
        RtkTelemetrySource.addListener(rtkListener)
        Fh2BridgeClient.addListener(bridgeListener)
        VirtualStickController.addListener(controlListener)
    }

    override fun onDestroy() {
        DjiSdkRuntime.removeListener(sdkListener)
        RemoteControllerIdentitySource.removeListener(gatewayListener)
        AircraftTelemetrySource.removeListener(telemetryListener)
        SensorInventorySource.removeListener(sensorListener)
        RtkTelemetrySource.removeListener(rtkListener)
        Fh2BridgeClient.removeListener(bridgeListener)
        VirtualStickController.removeListener(controlListener)
        super.onDestroy()
    }

    private fun matchWidth(top: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            topMargin = top
        }
}
