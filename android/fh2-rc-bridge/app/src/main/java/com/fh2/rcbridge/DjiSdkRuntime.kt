package com.fh2.rcbridge

import android.content.Context
import android.util.Log
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
    private const val TAG = "DjiSdkRuntime"

    private val listeners = CopyOnWriteArrayList<(DjiSdkSnapshot) -> Unit>()

    @Volatile
    private var started = false

    @Volatile
    var snapshot: DjiSdkSnapshot = DjiSdkSnapshot()
        private set

    fun start(context: Context) {
        if (started) return
        started = true

        try {
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
                        MsdkKeyManagerRuntime.start()
                        Fh2BridgeClient.tryResume()
                    }

                    override fun onRegisterFailure(error: IDJIError) {
                        MsdkKeyManagerRuntime.stop()
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
                        MsdkKeyManagerRuntime.onProductDisconnected()
                    }

                    override fun onProductConnect(productId: Int) {
                        update {
                            copy(
                                productConnected = true,
                                productId = productId
                            )
                        }
                        MsdkKeyManagerRuntime.onProductConnected()
                        Fh2BridgeClient.tryResume()
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
                            try {
                                SDKManager.getInstance().registerApp()
                            } catch (error: Throwable) {
                                recordStartupFailure("REGISTER_APP_FAILED", error)
                            }
                        }
                    }

                    override fun onDatabaseDownloadProgress(
                        current: Long,
                        total: Long
                    ) = Unit
                }
            )
        } catch (error: Throwable) {
            recordStartupFailure("INIT_FAILED", error)
        }
    }

    fun addListener(listener: (DjiSdkSnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (DjiSdkSnapshot) -> Unit) {
        listeners -= listener
    }

    private fun recordStartupFailure(
        event: String,
        error: Throwable
    ) {
        Log.e(TAG, "DJI MSDK startup failed at $event", error)
        update {
            copy(
                initialized = false,
                initEvent = event,
                registered = false,
                registrationError =
                    error.message ?: error.javaClass.simpleName
            )
        }
    }

    private inline fun update(
        transform: DjiSdkSnapshot.() -> DjiSdkSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
