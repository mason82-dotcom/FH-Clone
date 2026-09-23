package com.fh2.rcbridge

import android.os.Bundle
import android.view.Gravity
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.value.camera.CameraVideoStreamSourceType
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.et.create
import dji.v5.et.set
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.interfaces.ICameraStreamManager

class VideoActivity : AppCompatActivity(), SurfaceHolder.Callback {
    private val streamManager
        get() = MediaDataCenter.getInstance().cameraStreamManager

    private lateinit var surfaceView: SurfaceView
    private lateinit var statusText: TextView
    private lateinit var cameraSpinner: Spinner
    private lateinit var sourceSpinner: Spinner

    private var selectedCamera =
        ComponentIndexType.LEFT_OR_MAIN
    private var selectedSource =
        CameraVideoStreamSourceType.DEFAULT_CAMERA

    private var surface: Surface? = null
    private var surfaceWidth = 0
    private var surfaceHeight = 0

    private var cameraOptions =
        listOf(ComponentIndexType.LEFT_OR_MAIN)
    private var sourceOptions =
        listOf(CameraVideoStreamSourceType.DEFAULT_CAMERA)

    private val sensorListener: (SensorInventorySnapshot) -> Unit = {
        snapshot ->
        runOnUiThread {
            refreshOptions(snapshot)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusText = TextView(this).apply {
            textSize = 16f
            text = "Warte auf DJI CameraStreamManager …"
        }

        cameraSpinner = Spinner(this)
        sourceSpinner = Spinner(this)

        surfaceView = SurfaceView(this).apply {
            holder.addCallback(this@VideoActivity)
        }

        val applySourceButton = Button(this).apply {
            text = "Videoquelle anwenden"
            setOnClickListener {
                applySelection()
            }
        }

        val fitButton = Button(this).apply {
            text = "Bild einpassen"
            setOnClickListener {
                bindSurface(ICameraStreamManager.ScaleType.CENTER_INSIDE)
            }
        }

        val cropButton = Button(this).apply {
            text = "Bild füllen"
            setOnClickListener {
                bindSurface(ICameraStreamManager.ScaleType.CENTER_CROP)
            }
        }

        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(
                cameraSpinner,
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
                )
            )
            addView(
                sourceSpinner,
                LinearLayout.LayoutParams(
                    0,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    1f
                )
            )
            addView(applySourceButton)
            addView(fitButton)
            addView(cropButton)
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)
            addView(
                statusText,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                controls,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                surfaceView,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                )
            )
        }

        setContentView(root)

        SensorInventorySource.addListener(sensorListener)
    }

    override fun onDestroy() {
        SensorInventorySource.removeListener(sensorListener)
        surface?.let(streamManager::removeCameraStreamSurface)
        surface = null
        surfaceView.holder.removeCallback(this)
        super.onDestroy()
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        surface = holder.surface
    }

    override fun surfaceChanged(
        holder: SurfaceHolder,
        format: Int,
        width: Int,
        height: Int
    ) {
        surface = holder.surface
        surfaceWidth = width
        surfaceHeight = height
        bindSurface(ICameraStreamManager.ScaleType.CENTER_INSIDE)
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        surface?.let(streamManager::removeCameraStreamSurface)
        surface = null
        surfaceWidth = 0
        surfaceHeight = 0
    }

    private fun refreshOptions(snapshot: SensorInventorySnapshot) {
        val connected = snapshot.components
            .filter { it.cameraConnected }
            .mapNotNull { component ->
                runCatching {
                    ComponentIndexType.valueOf(component.index)
                }.getOrNull()
            }
            .distinct()

        cameraOptions =
            connected.ifEmpty {
                listOf(ComponentIndexType.LEFT_OR_MAIN)
            }

        if (selectedCamera !in cameraOptions) {
            selectedCamera = cameraOptions.first()
        }

        cameraSpinner.adapter =
            ArrayAdapter(
                this,
                android.R.layout.simple_spinner_dropdown_item,
                cameraOptions.map(ComponentIndexType::name)
            )

        val cameraPosition =
            cameraOptions.indexOf(selectedCamera).coerceAtLeast(0)
        cameraSpinner.setSelection(cameraPosition)

        refreshSourceOptions(snapshot, selectedCamera)
    }

    private fun refreshSourceOptions(
        snapshot: SensorInventorySnapshot,
        camera: ComponentIndexType
    ) {
        val component =
            snapshot.components.firstOrNull {
                it.index == camera.name
            }

        val sources =
            component?.streamSources
                ?.mapNotNull { name ->
                    runCatching {
                        CameraVideoStreamSourceType.valueOf(name)
                    }.getOrNull()
                }
                ?.distinct()
                .orEmpty()

        sourceOptions =
            sources.ifEmpty {
                listOf(CameraVideoStreamSourceType.DEFAULT_CAMERA)
            }

        if (selectedSource !in sourceOptions) {
            selectedSource = sourceOptions.first()
        }

        sourceSpinner.adapter =
            ArrayAdapter(
                this,
                android.R.layout.simple_spinner_dropdown_item,
                sourceOptions.map(::sourceLabel)
            )

        val sourcePosition =
            sourceOptions.indexOf(selectedSource).coerceAtLeast(0)
        sourceSpinner.setSelection(sourcePosition)

        updateStatus()
    }

    private fun applySelection() {
        selectedCamera =
            cameraOptions.getOrNull(cameraSpinner.selectedItemPosition)
                ?: ComponentIndexType.LEFT_OR_MAIN

        val snapshot = SensorInventorySource.snapshot
        refreshSourceOptions(snapshot, selectedCamera)

        selectedSource =
            sourceOptions.getOrNull(sourceSpinner.selectedItemPosition)
                ?: CameraVideoStreamSourceType.DEFAULT_CAMERA

        CameraKey.KeyCameraVideoStreamSource
            .create(selectedCamera)
            .set(
                selectedSource,
                {
                    bindSurface(
                        ICameraStreamManager.ScaleType.CENTER_INSIDE
                    )
                    updateStatus()
                },
                { error ->
                    Toast.makeText(
                        this,
                        "Videoquelle fehlgeschlagen: $error",
                        Toast.LENGTH_LONG
                    ).show()
                }
            )
    }

    private fun bindSurface(
        scaleType: ICameraStreamManager.ScaleType
    ) {
        val currentSurface = surface ?: return
        if (surfaceWidth <= 0 || surfaceHeight <= 0) return

        streamManager.removeCameraStreamSurface(currentSurface)
        streamManager.putCameraStreamSurface(
            selectedCamera,
            currentSurface,
            surfaceWidth,
            surfaceHeight,
            scaleType
        )
        updateStatus()
    }

    private fun updateStatus() {
        statusText.text =
            "Kamera: ${selectedCamera.name} · " +
                "Quelle: ${sourceLabel(selectedSource)}"
    }

    private fun sourceLabel(
        source: CameraVideoStreamSourceType
    ): String =
        when (source) {
            CameraVideoStreamSourceType.WIDE_CAMERA ->
                "Wide"
            CameraVideoStreamSourceType.ZOOM_CAMERA ->
                "Zoom"
            CameraVideoStreamSourceType.INFRARED_CAMERA ->
                "Thermal / IR"
            CameraVideoStreamSourceType.NDVI_CAMERA ->
                "NDVI"
            CameraVideoStreamSourceType.MS_G_CAMERA ->
                "Multispektral G"
            CameraVideoStreamSourceType.MS_R_CAMERA ->
                "Multispektral R"
            CameraVideoStreamSourceType.MS_RE_CAMERA ->
                "Multispektral RE"
            CameraVideoStreamSourceType.MS_NIR_CAMERA ->
                "Multispektral NIR"
            CameraVideoStreamSourceType.RGB_CAMERA ->
                "RGB"
            else -> source.name
        }
}
