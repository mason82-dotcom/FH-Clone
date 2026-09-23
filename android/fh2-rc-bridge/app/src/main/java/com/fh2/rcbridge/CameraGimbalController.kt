package com.fh2.rcbridge

import android.os.Handler
import android.os.Looper
import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.GimbalKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.sdk.keyvalue.value.common.EmptyMsg
import dji.sdk.keyvalue.value.gimbal.CtrlInfo
import dji.sdk.keyvalue.value.gimbal.GimbalSpeedRotation
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class CameraGimbalControlSnapshot(
    val cameraIndex: String =
        ComponentIndexType.LEFT_OR_MAIN.name,
    val isShootingPhoto: Boolean = false,
    val isRecording: Boolean = false,
    val lastAction: String? = null,
    val lastError: String? = null
)

object CameraGimbalController {
    private val index = ComponentIndexType.LEFT_OR_MAIN
    private val handler = Handler(Looper.getMainLooper())
    private val started = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(CameraGimbalControlSnapshot) -> Unit>()

    @Volatile
    var snapshot = CameraGimbalControlSnapshot()
        private set

    fun start() {
        if (started.getAndSet(true)) return

        KeyManager.getInstance().listen(
            KeyTools.createKey(
                CameraKey.KeyIsShootingPhoto,
                index
            ),
            this
        ) { _, value ->
            update { copy(isShootingPhoto = value == true) }
        }

        KeyManager.getInstance().listen(
            KeyTools.createKey(
                CameraKey.KeyIsRecording,
                index
            ),
            this
        ) { _, value ->
            update { copy(isRecording = value == true) }
        }
    }

    fun shootPhoto(onResult: (Result<Unit>) -> Unit) {
        performWithoutParam(
            action = "shoot_photo",
            key = KeyTools.createKey(
                CameraKey.KeyStartShootPhoto,
                index
            ),
            onResult = onResult
        )
    }

    fun startRecording(onResult: (Result<Unit>) -> Unit) {
        performWithoutParam(
            action = "start_record",
            key = KeyTools.createKey(
                CameraKey.KeyStartRecord,
                index
            ),
            onResult = onResult
        )
    }

    fun stopRecording(onResult: (Result<Unit>) -> Unit) {
        performWithoutParam(
            action = "stop_record",
            key = KeyTools.createKey(
                CameraKey.KeyStopRecord,
                index
            ),
            onResult = onResult
        )
    }

    fun nudgeGimbal(
        pitchSpeedDegS: Double,
        yawSpeedDegS: Double,
        durationMs: Long = 250,
        onResult: (Result<Unit>) -> Unit
    ) {
        val safeDuration = durationMs.coerceIn(50, 1_000)
        val rotation = GimbalSpeedRotation(
            pitchSpeedDegS.coerceIn(-90.0, 90.0),
            yawSpeedDegS.coerceIn(-90.0, 90.0),
            0.0,
            CtrlInfo()
        )

        KeyManager.getInstance().performAction(
            KeyTools.createKey(
                GimbalKey.KeyRotateBySpeed,
                index
            ),
            rotation,
            callback(
                action = "gimbal_nudge",
                onSuccess = {
                    handler.postDelayed(
                        {
                            stopGimbal { }
                        },
                        safeDuration
                    )
                    onResult(Result.success(Unit))
                },
                onFailure = { error ->
                    onResult(
                        Result.failure(
                            IllegalStateException(error.toString())
                        )
                    )
                }
            )
        )
    }

    fun stopGimbal(onResult: (Result<Unit>) -> Unit) {
        val rotation = GimbalSpeedRotation(
            0.0,
            0.0,
            0.0,
            CtrlInfo()
        )

        KeyManager.getInstance().performAction(
            KeyTools.createKey(
                GimbalKey.KeyRotateBySpeed,
                index
            ),
            rotation,
            callback(
                action = "gimbal_stop",
                onSuccess = {
                    onResult(Result.success(Unit))
                },
                onFailure = { error ->
                    onResult(
                        Result.failure(
                            IllegalStateException(error.toString())
                        )
                    )
                }
            )
        )
    }

    fun addListener(
        listener: (CameraGimbalControlSnapshot) -> Unit
    ) {
        start()
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (CameraGimbalControlSnapshot) -> Unit
    ) {
        listeners -= listener
    }

    fun stop() {
        if (!started.getAndSet(false)) return
        handler.removeCallbacksAndMessages(null)
        KeyManager.getInstance().cancelListen(this)
        stopGimbal { }
    }

    private fun performWithoutParam(
        action: String,
        key: dji.sdk.keyvalue.key.DJIKey.ActionKey<*, EmptyMsg>,
        onResult: (Result<Unit>) -> Unit
    ) {
        KeyManager.getInstance().performAction(
            key,
            callback(
                action = action,
                onSuccess = {
                    onResult(Result.success(Unit))
                },
                onFailure = { error ->
                    onResult(
                        Result.failure(
                            IllegalStateException(error.toString())
                        )
                    )
                }
            )
        )
    }

    private fun callback(
        action: String,
        onSuccess: () -> Unit,
        onFailure: (IDJIError) -> Unit
    ) =
        object : CommonCallbacks.CompletionCallbackWithParam<EmptyMsg> {
            override fun onSuccess(value: EmptyMsg?) {
                update {
                    copy(
                        lastAction = action,
                        lastError = null
                    )
                }
                onSuccess()
            }

            override fun onFailure(error: IDJIError) {
                update {
                    copy(
                        lastAction = action,
                        lastError = error.toString()
                    )
                }
                onFailure(error)
            }
        }

    private inline fun update(
        transform: CameraGimbalControlSnapshot.() ->
            CameraGimbalControlSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
