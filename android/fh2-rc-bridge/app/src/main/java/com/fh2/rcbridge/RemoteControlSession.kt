package com.fh2.rcbridge

import android.os.Handler
import android.os.Looper
import android.os.SystemClock

data class NormalizedStickFrame(
    val leftHorizontal: Float,
    val leftVertical: Float,
    val rightHorizontal: Float,
    val rightVertical: Float
)

class RemoteControlSession(
    private val degradeAfterMs: Long = 500,
    private val closeAfterMs: Long = 2_000,
    private val checkIntervalMs: Long = 100
) {
    private val handler = Handler(Looper.getMainLooper())

    @Volatile
    private var active = false

    @Volatile
    private var lastFrameAt = 0L

    @Volatile
    private var neutralSent = false

    private val watchdog = object : Runnable {
        override fun run() {
            if (!active) return

            val silence = SystemClock.elapsedRealtime() - lastFrameAt

            if (silence >= closeAfterMs) {
                VirtualStickController.neutral()
                VirtualStickController.disable { }
                active = false
                return
            }

            if (silence >= degradeAfterMs && !neutralSent) {
                VirtualStickController.neutral()
                neutralSent = true
            }

            handler.postDelayed(this, checkIntervalMs)
        }
    }

    fun start() {
        check(VirtualStickController.snapshot.enabled) {
            "virtual_stick_not_enabled"
        }
        check(
            VirtualStickController.snapshot.authorityOwner == "MSDK"
        ) {
            "flight_control_authority_not_owned_by_msdk"
        }

        lastFrameAt = SystemClock.elapsedRealtime()
        neutralSent = false
        active = true
        handler.removeCallbacks(watchdog)
        handler.postDelayed(watchdog, checkIntervalMs)
    }

    fun accept(frame: NormalizedStickFrame) {
        check(active) { "remote_control_session_not_active" }

        VirtualStickController.sendNormalized(
            frame.leftHorizontal,
            frame.leftVertical,
            frame.rightHorizontal,
            frame.rightVertical
        )

        lastFrameAt = SystemClock.elapsedRealtime()
        neutralSent = false
    }

    fun stop(releaseAuthority: Boolean = true) {
        handler.removeCallbacks(watchdog)
        if (!active) return

        active = false
        VirtualStickController.neutral()

        if (releaseAuthority) {
            VirtualStickController.disable { }
        }
    }

    fun isActive(): Boolean = active
}
