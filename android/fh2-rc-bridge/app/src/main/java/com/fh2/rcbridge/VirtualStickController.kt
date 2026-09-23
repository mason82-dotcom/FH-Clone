package com.fh2.rcbridge

import dji.sdk.keyvalue.value.flightcontroller.FlightControlAuthorityChangeReason
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.virtualstick.VirtualStickManager
import dji.v5.manager.aircraft.virtualstick.VirtualStickState
import dji.v5.manager.aircraft.virtualstick.VirtualStickStateListener
import java.util.concurrent.CopyOnWriteArrayList

data class VirtualStickSnapshot(
    val enabled: Boolean = false,
    val advancedMode: Boolean = false,
    val authorityOwner: String = "UNKNOWN",
    val changeReason: String = "UNKNOWN",
    val lastError: String? = null
)

object VirtualStickController {
    private val manager = VirtualStickManager.getInstance()
    private val listeners =
        CopyOnWriteArrayList<(VirtualStickSnapshot) -> Unit>()

    @Volatile
    var snapshot = VirtualStickSnapshot()
        private set

    private var observing = false

    fun startObserving() {
        if (observing) return
        observing = true

        manager.setVirtualStickStateListener(
            object : VirtualStickStateListener {
                override fun onVirtualStickStateUpdate(
                    stickState: VirtualStickState
                ) {
                    update {
                        copy(
                            enabled = stickState.isVirtualStickEnable,
                            advancedMode =
                                stickState.isVirtualStickAdvancedModeEnabled,
                            authorityOwner =
                                stickState.currentFlightControlAuthorityOwner
                                    .toString(),
                            lastError = null
                        )
                    }
                }

                override fun onChangeReasonUpdate(
                    reason: FlightControlAuthorityChangeReason
                ) {
                    update { copy(changeReason = reason.toString()) }
                }
            }
        )
    }

    fun enable(onResult: (Result<Unit>) -> Unit) {
        manager.enableVirtualStick(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    update { copy(lastError = null) }
                    onResult(Result.success(Unit))
                }

                override fun onFailure(error: IDJIError) {
                    update { copy(lastError = error.toString()) }
                    onResult(Result.failure(IllegalStateException(error.toString())))
                }
            }
        )
    }

    fun disable(onResult: (Result<Unit>) -> Unit) {
        manager.disableVirtualStick(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    update { copy(lastError = null) }
                    onResult(Result.success(Unit))
                }

                override fun onFailure(error: IDJIError) {
                    update { copy(lastError = error.toString()) }
                    onResult(Result.failure(IllegalStateException(error.toString())))
                }
            }
        )
    }

    fun addListener(listener: (VirtualStickSnapshot) -> Unit) {
        startObserving()
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (VirtualStickSnapshot) -> Unit) {
        listeners -= listener
    }

    private inline fun update(
        transform: VirtualStickSnapshot.() -> VirtualStickSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
