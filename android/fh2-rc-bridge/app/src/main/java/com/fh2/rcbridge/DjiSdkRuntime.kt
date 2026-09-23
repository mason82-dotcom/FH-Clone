package com.fh2.rcbridge

import android.content.Context
import dji.v5.common.error.IDJIError
import dji.v5.common.register.DJISDKInitEvent
import dji.v5.manager.SDKManager
import dji.v5.manager.interfaces.SDKManagerCallback
import java.util.concurrent.CopyOnWriteArrayList

data class DjiSdkSnapshot(
    val initialized: Boolean = false,
    val initEvent: String = "NOT_STARTED",
    val initProgress: Int = 0,
    val registered: Boolean = false,
    val registrationError: String? = null,
    val productConnected: Boolean = false,
    val productId: Int? = null
)

object DjiSdkRuntime {
    private val listeners = CopyOnWriteArrayList<(DjiSdkSnapshot) -> Unit>()

    @Volatile
    private var started = false

    @Volatile
    var snapshot: DjiSdkSnapshot = DjiSdkSnapshot()
        private set

    fun start(context: Context) {
        if (started) return
        started = true

        SDKManager.getInstance().init(
            context.applicationContext,
            object : SDKManagerCallback {
                override fun onRegisterSuccess() {
                    update {
                        copy(
                            registered = true,
                            registrationError = null
                        )
                    }
                    RemoteControllerIdentitySource.start()
                    AircraftTelemetrySource.start()
                    SensorInventorySource.start()
                    RtkTelemetrySource.start()
                    CameraGimbalController.start()
                }

                override fun onRegisterFailure(error: IDJIError) {
                    update {
                        copy(
                            registered = false,
                            registrationError = error.toString()
                        )
                    }
                }

                override fun onProductDisconnect(productId: Int) {
                    update {
                        copy(
                            productConnected = false,
                            productId = productId
                        )
                    }
                }

                override fun onProductConnect(productId: Int) {
                    update {
                        copy(
                            productConnected = true,
                            productId = productId
                        )
                    }
                }

                override fun onProductChanged(productId: Int) {
                    update { copy(productId = productId) }
                }

                override fun onInitProcess(
                    event: DJISDKInitEvent,
                    totalProcess: Int
                ) {
                    update {
                        copy(
                            initialized = event == DJISDKInitEvent.INITIALIZE_COMPLETE,
                            initEvent = event.name,
                            initProgress = totalProcess
                        )
                    }

                    if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
                        SDKManager.getInstance().registerApp()
                    }
                }

                override fun onDatabaseDownloadProgress(
                    current: Long,
                    total: Long
                ) = Unit
            }
        )
    }

    fun addListener(listener: (DjiSdkSnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (DjiSdkSnapshot) -> Unit) {
        listeners -= listener
    }

    private inline fun update(
        transform: DjiSdkSnapshot.() -> DjiSdkSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
