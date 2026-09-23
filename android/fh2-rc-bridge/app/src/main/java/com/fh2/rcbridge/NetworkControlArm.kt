package com.fh2.rcbridge

import java.util.concurrent.CopyOnWriteArrayList

data class NetworkControlArmSnapshot(
    val armed: Boolean = false,
    val armedAt: Long? = null
)

object NetworkControlArm {
    private val listeners =
        CopyOnWriteArrayList<(NetworkControlArmSnapshot) -> Unit>()

    @Volatile
    var snapshot = NetworkControlArmSnapshot()
        private set

    fun arm() {
        snapshot = NetworkControlArmSnapshot(
            armed = true,
            armedAt = System.currentTimeMillis()
        )
        publish()
    }

    fun disarm() {
        snapshot = NetworkControlArmSnapshot()
        publish()
    }

    fun addListener(listener: (NetworkControlArmSnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (NetworkControlArmSnapshot) -> Unit) {
        listeners -= listener
    }

    private fun publish() {
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
