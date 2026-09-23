package com.fh2.rcbridge

import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.value.common.LocationCoordinate3D
import dji.sdk.keyvalue.value.product.ProductType
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.listen
import dji.v5.manager.KeyManager
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class AircraftTelemetrySnapshot(
    val flightControllerConnected: Boolean = false,
    val productType: String = "UNKNOWN",
    val firmwareVersion: String? = null,
    val flightControllerSerial: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val altitudeM: Double? = null
)

object AircraftTelemetrySource {
    private val started = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(AircraftTelemetrySnapshot) -> Unit>()

    @Volatile
    var snapshot = AircraftTelemetrySnapshot()
        private set

    fun start() {
        if (started.getAndSet(true)) return

        FlightControllerKey.KeyConnection.create().listen(this) { connected ->
            update {
                copy(flightControllerConnected = connected == true)
            }

            if (connected == true) {
                refreshIdentity()
            }
        }

        ProductKey.KeyProductType.create().listen(this) { product ->
            update {
                copy(
                    productType =
                        (product ?: ProductType.UNKNOWN).name
                )
            }
        }

        FlightControllerKey.KeyAircraftLocation3D
            .create()
            .listen(this) { location ->
                location?.let(::updateLocation)
            }

        refreshIdentity()
    }

    fun addListener(listener: (AircraftTelemetrySnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (AircraftTelemetrySnapshot) -> Unit) {
        listeners -= listener
    }

    fun stop() {
        if (!started.getAndSet(false)) return
        KeyManager.getInstance().cancelListen(this)
    }

    private fun refreshIdentity() {
        ProductKey.KeyFirmwareVersion.create().get(
            { firmware ->
                update {
                    copy(firmwareVersion = firmware)
                }
            },
            {
                update { copy(firmwareVersion = null) }
            }
        )

        FlightControllerKey.KeySerialNumber.create().get(
            { serial ->
                update {
                    copy(flightControllerSerial = serial)
                }
            },
            {
                update { copy(flightControllerSerial = null) }
            }
        )
    }

    private fun updateLocation(location: LocationCoordinate3D) {
        update {
            copy(
                latitude = location.latitude,
                longitude = location.longitude,
                altitudeM = location.altitude
            )
        }
    }

    private inline fun update(
        transform: AircraftTelemetrySnapshot.() ->
            AircraftTelemetrySnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
