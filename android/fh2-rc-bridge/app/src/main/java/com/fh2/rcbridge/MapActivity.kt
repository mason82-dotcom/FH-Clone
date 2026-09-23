package com.fh2.rcbridge

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.maplibre.android.MapLibre
import org.maplibre.android.annotations.Marker
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.annotations.Polyline
import org.maplibre.android.annotations.PolylineOptions
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import kotlin.math.abs

class MapActivity : AppCompatActivity() {
    private lateinit var mapView: MapView
    private lateinit var statusText: TextView
    private lateinit var followButton: Button

    private var map: MapLibreMap? = null
    private var styleReady = false
    private var followAircraft = true

    private var aircraftMarker: Marker? = null
    private var homeMarker: Marker? = null
    private var rcMarker: Marker? = null
    private var rtkMarker: Marker? = null
    private var flightPathLine: Polyline? = null

    private val flightPath = ArrayList<LatLng>()
    private var lastAircraftPoint: LatLng? = null

    private val aircraftListener: (AircraftTelemetrySnapshot) -> Unit = { state ->
        runOnUiThread {
            renderAircraft(state)
        }
    }

    private val rcListener:
        (RemoteControllerIdentitySnapshot) -> Unit = { state ->
        runOnUiThread {
            renderRemoteController(state)
        }
    }

    private val rtkListener: (RtkSnapshot) -> Unit = { state ->
        runOnUiThread {
            renderRtk(state)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        MapLibre.getInstance(this)

        mapView = MapView(this)
        statusText = TextView(this).apply {
            setTextColor(Color.WHITE)
            setBackgroundColor(0xAA11171D.toInt())
            setPadding(16, 10, 16, 10)
            text = "Karte wird geladen …"
        }

        followButton = Button(this).apply {
            text = "Aircraft folgen: AN"
            setOnClickListener {
                followAircraft = !followAircraft
                text =
                    if (followAircraft) {
                        "Aircraft folgen: AN"
                    } else {
                        "Aircraft folgen: AUS"
                    }

                if (followAircraft) {
                    AircraftTelemetrySource.snapshot
                        .toAircraftLatLng()
                        ?.let(::centerAircraft)
                }
            }
        }

        val clearPathButton = Button(this).apply {
            text = "Flugspur löschen"
            setOnClickListener {
                flightPath.clear()
                lastAircraftPoint = null
                redrawFlightPath()
            }
        }

        val closeButton = Button(this).apply {
            text = "Zurück"
            setOnClickListener { finish() }
        }

        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(12, 12, 12, 12)
            setBackgroundColor(0xCC0D1117.toInt())

            addView(
                followButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                clearPathButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { marginStart = 8 }
            )
            addView(
                closeButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { marginStart = 8 }
            )
        }

        val root = FrameLayout(this).apply {
            addView(
                mapView,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            addView(
                toolbar,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP or Gravity.START
                )
            )
            addView(
                statusText,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.BOTTOM or Gravity.START
                ).apply {
                    leftMargin = 12
                    bottomMargin = 12
                }
            )
        }

        setContentView(root)

        mapView.onCreate(savedInstanceState)
        mapView.getMapAsync { readyMap ->
            map = readyMap
            readyMap.uiSettings.apply {
                isCompassEnabled = true
                isRotateGesturesEnabled = true
                isTiltGesturesEnabled = true
            }

            readyMap.setStyle(
                Style.Builder().fromUri(BuildConfig.FH2_MAP_STYLE_URL)
            ) {
                styleReady = true
                renderAll()
            }
        }

        AircraftTelemetrySource.addListener(aircraftListener)
        RemoteControllerIdentitySource.addListener(rcListener)
        RtkTelemetrySource.addListener(rtkListener)
    }

    private fun renderAll() {
        renderAircraft(AircraftTelemetrySource.snapshot)
        renderRemoteController(RemoteControllerIdentitySource.snapshot)
        renderRtk(RtkTelemetrySource.snapshot)
    }

    private fun renderAircraft(state: AircraftTelemetrySnapshot) {
        val readyMap = map ?: return
        if (!styleReady) return

        val aircraftPosition = state.toAircraftLatLng()
        val homePosition = state.toHomeLatLng()

        if (aircraftPosition != null) {
            if (aircraftMarker == null) {
                val snippet =
                    state.productType +
                        (state.altitudeM?.let {
                            " · " + String.format("%.1f m", it)
                        } ?: "")

                aircraftMarker =
                    readyMap.addMarker(
                        MarkerOptions()
                            .position(aircraftPosition)
                            .title("Aircraft")
                            .snippet(snippet)
                    )
            } else {
                aircraftMarker?.position = aircraftPosition
            }

            appendFlightPath(aircraftPosition)

            if (followAircraft) {
                centerAircraft(aircraftPosition)
            }
        }

        if (homePosition != null) {
            if (homeMarker == null) {
                homeMarker =
                    readyMap.addMarker(
                        MarkerOptions()
                            .position(homePosition)
                            .title("Home")
                    )
            } else {
                homeMarker?.position = homePosition
            }
        }

        statusText.text =
            "Aircraft " +
                state.productType +
                " · " +
                (
                    if (aircraftPosition != null) {
                        String.format(
                            "%.6f, %.6f",
                            aircraftPosition.latitude,
                            aircraftPosition.longitude
                        )
                    } else {
                        "keine Position"
                    }
                ) +
                (
                    state.headingDeg?.let {
                        " · " + String.format("%.0f°", it)
                    } ?: ""
                )
    }

    private fun renderRemoteController(
        state: RemoteControllerIdentitySnapshot
    ) {
        val readyMap = map ?: return
        if (!styleReady) return

        if (
            !state.rcGpsValid ||
            !isValidCoordinate(
                state.rcLatitude,
                state.rcLongitude
            )
        ) {
            rcMarker?.let(readyMap::removeMarker)
            rcMarker = null
            return
        }

        val position =
            LatLng(
                state.rcLatitude!!,
                state.rcLongitude!!
            )

        if (rcMarker == null) {
            rcMarker =
                readyMap.addMarker(
                    MarkerOptions()
                        .position(position)
                        .title("RC Pro")
                        .snippet(
                            state.rcAccuracyM?.let {
                                "GPS ±" +
                                    String.format("%.1f m", it)
                            } ?: "RC GPS"
                        )
                )
        } else {
            rcMarker?.position = position
        }
    }

    private fun renderRtk(state: RtkSnapshot) {
        val readyMap = map ?: return
        if (!styleReady) return

        val latitude = state.mobileLatitude
        val longitude = state.mobileLongitude

        if (!isValidCoordinate(latitude, longitude)) {
            rtkMarker?.let(readyMap::removeMarker)
            rtkMarker = null
            return
        }

        val position = LatLng(latitude!!, longitude!!)
        val title =
            "RTK " + (state.positioningSolution ?: "Position")

        if (rtkMarker == null) {
            val snippet =
                (state.referenceStationSource ?: "Quelle unbekannt") +
                    (
                        state.mobileAltitudeM?.let {
                            " · " + String.format("%.2f m", it)
                        } ?: ""
                    )

            rtkMarker =
                readyMap.addMarker(
                    MarkerOptions()
                        .position(position)
                        .title(title)
                        .snippet(snippet)
                )
        } else {
            rtkMarker?.position = position
        }
    }

    private fun appendFlightPath(position: LatLng) {
        val previous = lastAircraftPoint
        if (
            previous != null &&
            abs(previous.latitude - position.latitude) < 0.000001 &&
            abs(previous.longitude - position.longitude) < 0.000001
        ) {
            return
        }

        lastAircraftPoint = position
        flightPath += position

        if (flightPath.size > MAX_FLIGHT_PATH_POINTS) {
            flightPath.removeAt(0)
        }

        redrawFlightPath()
    }

    private fun redrawFlightPath() {
        val readyMap = map ?: return
        if (!styleReady) return

        flightPathLine?.let(readyMap::removePolyline)
        flightPathLine = null

        if (flightPath.size < 2) return

        flightPathLine =
            readyMap.addPolyline(
                PolylineOptions()
                    .addAll(flightPath)
                    .color(Color.rgb(85, 200, 149))
                    .width(4f)
            )
    }

    private fun centerAircraft(position: LatLng) {
        map?.animateCamera(
            CameraUpdateFactory.newLatLngZoom(
                position,
                AIRCRAFT_FOLLOW_ZOOM
            )
        )
    }

    override fun onStart() {
        super.onStart()
        mapView.onStart()
    }

    override fun onResume() {
        super.onResume()
        mapView.onResume()
    }

    override fun onPause() {
        mapView.onPause()
        super.onPause()
    }

    override fun onStop() {
        mapView.onStop()
        super.onStop()
    }

    override fun onLowMemory() {
        super.onLowMemory()
        mapView.onLowMemory()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        mapView.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        AircraftTelemetrySource.removeListener(aircraftListener)
        RemoteControllerIdentitySource.removeListener(rcListener)
        RtkTelemetrySource.removeListener(rtkListener)
        mapView.onDestroy()
        super.onDestroy()
    }

    private fun AircraftTelemetrySnapshot.toAircraftLatLng(): LatLng? {
        if (!isValidCoordinate(latitude, longitude)) return null
        return LatLng(latitude!!, longitude!!)
    }

    private fun AircraftTelemetrySnapshot.toHomeLatLng(): LatLng? {
        if (!isValidCoordinate(homeLatitude, homeLongitude)) return null
        return LatLng(homeLatitude!!, homeLongitude!!)
    }

    private fun isValidCoordinate(
        latitude: Double?,
        longitude: Double?
    ): Boolean =
        latitude != null &&
            longitude != null &&
            latitude.isFinite() &&
            longitude.isFinite() &&
            latitude in -90.0..90.0 &&
            longitude in -180.0..180.0

    companion object {
        private const val MAX_FLIGHT_PATH_POINTS = 1_500
        private const val AIRCRAFT_FOLLOW_ZOOM = 17.0
    }
}
