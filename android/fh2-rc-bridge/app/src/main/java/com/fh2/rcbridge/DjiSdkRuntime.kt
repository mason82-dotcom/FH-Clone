package com.fh2.rcbridge

import android.content.Context
import android.os.Handler
import android.os.Looper
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
    val runtimeReady: Boolean = false,
    val registrationError: String? = null,
    val runtimeError: String? = null,
    val productConnected: Boolean = false,
    val productId: Int? = null
)

object DjiSdkRuntime {
    private const val TAG = "DjiSdkRuntime"
    private const val RUNTIME_START_DELAY_MS = 5_000L

    private val listeners = CopyOnWriteArrayList<(DjiSdkSnapshot) -> Unit>()
    private val mainHandler = Handler(Looper.getMainLooper())

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
                                runtimeReady = false,
                                registrationError = null,
                                runtimeError = null
                            )
                        }

                        mainHandler.removeCallbacksAndMessages(RUNTIME_CALLBACK_TOKEN)
                        mainHandler.postAtTime(
                            { initializeRuntimeComponents() },
                            RUNTIME_CALLBACK_TOKEN,
                            android.os.SystemClock.uptimeMillis() +
                                RUNTIME_START_DELAY_MS
                        )
                    }

                    override fun onRegisterFailure(error: IDJIError) {
                        update {
                            copy(
                                registered = false,
                                runtimeReady = false,
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

                        if (snapshot.runtimeReady) {
                            runCatching {
                                MsdkKeyManagerRuntime.onProductDisconnected()
                            }.onFailure {
                                recordRuntimeFailure(
                                    "PRODUCT_DISCONNECT_HANDLER_FAILED",
                                    it
                                )
                            }
                        }
                    }

                    override fun onProductConnect(productId: Int) {
                        update {
                            copy(
                                productConnected = true,
                                productId = productId
                            )
                        }

                        if (snapshot.runtimeReady) {
                            runCatching {
                                MsdkKeyManagerRuntime.onProductConnected()
                                Fh2BridgeClient.tryResume()
                            }.onFailure {
                                recordRuntimeFailure(
                                    "PRODUCT_CONNECT_HANDLER_FAILED",
                                    it
                                )
                            }
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
                                initialized =
                                    event == DJISDKInitEvent.INITIALIZE_COMPLETE,
                                initEvent = event.name,
                                initProgress = totalProcess
                            )
                        }

                        if (event == DJISDKInitEvent.INITIALIZE_COMPLETE) {
                            try {
                                SDKManager.getInstance().registerApp()
                            } catch (error: Throwable) {
                                recordStartupFailure(
                                    "REGISTER_APP_FAILED",
                                    error
                                )
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

    private fun initializeRuntimeComponents() {
        if (!snapshot.registered || snapshot.runtimeReady) return

        runCatching {
            RemoteControllerIdentitySource.start()
            AircraftTelemetrySource.start()
            SensorInventorySource.start()
            RtkTelemetrySource.start()
            CameraGimbalController.start()
            VirtualStickController.startObserving()
            MsdkKeyManagerRuntime.start()

            // Force creation only after DJI registration. These managers are
            // backed by runtime classes that are not safe to touch earlier on
            // the RC Pro Enterprise Android image.
            WaylineMissionController.snapshot

            update {
                copy(
                    runtimeReady = true,
                    runtimeError = null
                )
            }

            if (snapshot.productConnected) {
                MsdkKeyManagerRuntime.onProductConnected()
            }
            Fh2BridgeClient.tryResume()
        }.onFailure {
            recordRuntimeFailure("RUNTIME_COMPONENT_INIT_FAILED", it)
        }
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
                runtimeReady = false,
                registrationError =
                    error.message ?: error.javaClass.simpleName
            )
        }
    }

    private fun recordRuntimeFailure(
        event: String,
        error: Throwable
    ) {
        Log.e(TAG, "DJI MSDK runtime failed at $event", error)
        update {
            copy(
                runtimeReady = false,
                runtimeError =
                    "$event: " +
                        (error.message ?: error.javaClass.simpleName)
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

    private object RUNTIME_CALLBACK_TOKEN
}
