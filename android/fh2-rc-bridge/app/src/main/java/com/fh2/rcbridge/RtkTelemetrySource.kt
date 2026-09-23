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
        if (state != null) updateSystemState(state)
    }

    private val locationListener = RTKLocationInfoListener { info ->
        if (info != null) updateLocation(info)
    }

    fun start() {
        if (started.getAndSet(true)) return
        center.addRTKSystemStateListener(systemListener)
        center.addRTKLocationInfoListener(locationListener)
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
        center.removeRTKSystemStateListener(systemListener)
        center.removeRTKLocationInfoListener(locationListener)
    }

    private fun updateSystemState(state: RTKSystemState) {
        val counts = linkedMapOf<String, Int>()

        state.satelliteInfo.mobileStationReceiver1Info.forEach {
            counts["mobile1.${it.type.name}"] = it.count
        }
        state.satelliteInfo.mobileStationReceiver2Info.forEach {
            counts["mobile2.${it.type.name}"] = it.count
        }
        state.satelliteInfo.baseStationReceiverInfo.forEach {
            counts["base.${it.type.name}"] = it.count
        }

        update {
            copy(
                enabled = state.isRTKEnabled,
                healthy = state.rtkHealthy,
                maintainAccuracyEnabled =
                    state.rtkMaintainAccuracyEnabled,
                referenceStationSource =
                    state.rtkReferenceStationSource.name,
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

    private inline fun update(
        transform: RtkSnapshot.() -> RtkSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
