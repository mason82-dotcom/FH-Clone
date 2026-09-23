package com.fh2.rcbridge

import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var sdkText: TextView
    private lateinit var controlText: TextView
    private lateinit var telemetryText: TextView
    private lateinit var enableButton: Button
    private lateinit var disableButton: Button

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
            addView(telemetryText, matchWidth(top = 24))
            addView(controlText, matchWidth(top = 24))
            addView(enableButton, matchWidth(top = 24))
            addView(disableButton, matchWidth(top = 12))
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
        AircraftTelemetrySource.addListener(telemetryListener)
        VirtualStickController.addListener(controlListener)
    }

    override fun onDestroy() {
        DjiSdkRuntime.removeListener(sdkListener)
        AircraftTelemetrySource.removeListener(telemetryListener)
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
