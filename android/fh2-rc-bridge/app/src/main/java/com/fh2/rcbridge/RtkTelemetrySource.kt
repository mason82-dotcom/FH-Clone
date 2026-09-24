package com.fh2.rcbridge

import dji.v5.manager.aircraft.rtk.RTKCenter
import dji.v5.manager.aircraft.rtk.RTKLocationInfo
import dji.v5.manager.aircraft.rtk.RTKLocationInfoListener
import dji.v5.manager.aircraft.rtk.RTKSystemState
import dji.v5.manager.aircraft.rtk.RTKSystemStateListener
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class RtkSnapshot(
    val enabled: Boolean? = null,
    val healthy: Boolean? = null,
    val maintainAccuracyEnabled: Boolean? = null,
    val referenceStationSource: String? = null,
    val positioningSolution: String? = null,
    val mobileLatitude: Double? = null,
    val mobileLongitude: Double? = null,
    val mobileAltitudeM: Double? = null,
    val baseLatitude: Double? = null,
    val baseLongitude: Double? = null,
    val baseAltitudeM: Double? = null,
    val stdLongitude: Double? = null,
    val stdLatitude: Double? = null,
    val stdAltitude: Double? = null,
    val rtkHeading: String? = null,
    val realHeading: String? = null,
    val satelliteCounts: Map<String, Int> = emptyMap(),
    val error: String? = null
)

object RtkTelemetrySource {
    private val center = RTKCenter.getInstance()
    private val started = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(RtkSnapshot) -> Unit>()

    @Volatile
    var snapshot = RtkSnapshot()
        private set

    private val systemListener = RTKSystemStateListener { state ->
        if (state != null) {
            runCatching {
                updateSystemState(state)
            }.onFailure {
                recordError("RTK_SYSTEM_STATE_FAILED", it)
            }
        }
    }

    private val locationListener = RTKLocationInfoListener { info ->
        if (info != null) {
            runCatching {
                updateLocation(info)
            }.onFailure {
                recordError("RTK_LOCATION_INFO_FAILED", it)
            }
        }
    }

    fun start() {
        if (!started.compareAndSet(false, true)) return

        runCatching {
            center.addRTKSystemStateListener(systemListener)
            center.addRTKLocationInfoListener(locationListener)
        }.onFailure {
            runCatching {
                center.removeRTKSystemStateListener(systemListener)
            }
            runCatching {
                center.removeRTKLocationInfoListener(locationListener)
            }
            started.set(false)
            recordError("RTK_LISTENER_INIT_FAILED", it)
        }
    }

    fun addListener(listener: (RtkSnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (RtkSnapshot) -> Unit) {
        listeners -= listener
    }

    fun stop() {
        if (!started.getAndSet(false)) return
        runCatching {
            center.removeRTKSystemStateListener(systemListener)
        }
        runCatching {
            center.removeRTKLocationInfoListener(locationListener)
        }
    }

    private fun updateSystemState(state: RTKSystemState) {
        val counts = linkedMapOf<String, Int>()
        val satelliteInfo = state.satelliteInfo

        satelliteInfo?.mobileStationReceiver1Info?.forEach { receiver ->
            counts["mobile1.${receiver.type?.name ?: "UNKNOWN"}"] =
                receiver.count
        }
        satelliteInfo?.mobileStationReceiver2Info?.forEach { receiver ->
            counts["mobile2.${receiver.type?.name ?: "UNKNOWN"}"] =
                receiver.count
        }
        satelliteInfo?.baseStationReceiverInfo?.forEach { receiver ->
            counts["base.${receiver.type?.name ?: "UNKNOWN"}"] =
                receiver.count
        }

        update {
            copy(
                enabled = state.isRTKEnabled,
                healthy = state.rtkHealthy,
                maintainAccuracyEnabled =
                    state.rtkMaintainAccuracyEnabled,
                referenceStationSource =
                    state.rtkReferenceStationSource?.name,
                satelliteCounts = counts,
                error = state.error?.toString()
            )
        }
    }

    private fun updateLocation(info: RTKLocationInfo) {
        val rtk = info.rtkLocation
        val mobile = rtk?.mobileStationLocation
        val base = rtk?.baseStationLocation

        update {
            copy(
                positioningSolution =
                    rtk?.positioningSolution?.name,
                mobileLatitude = mobile?.latitude,
                mobileLongitude = mobile?.longitude,
                mobileAltitudeM = mobile?.altitude,
                baseLatitude = base?.latitude,
                baseLongitude = base?.longitude,
                baseAltitudeM = base?.altitude,
                stdLongitude = rtk?.stdLongitude,
                stdLatitude = rtk?.stdLatitude,
                stdAltitude = rtk?.stdAltitude,
                rtkHeading = info.rtkHeading?.toString(),
                realHeading = info.realHeading?.toString()
            )
        }
    }

    private fun recordError(
        event: String,
        error: Throwable
    ) {
        update {
            copy(
                error =
                    "$event: " +
                        (error.message ?: error.javaClass.simpleName)
            )
        }
    }

    private inline fun update(
        transform: RtkSnapshot.() -> RtkSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
