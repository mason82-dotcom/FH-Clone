package com.fh2.rcbridge

import dji.sdk.keyvalue.key.RemoteControllerKey
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.et.create
import dji.v5.et.get
import dji.v5.et.listen
import dji.v5.manager.KeyManager
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class RemoteControllerIdentitySnapshot(
    val connected: Boolean = false,
    val serialNumber: String? = null,
    val firmwareVersion: String? = null,
    val componentIndex: String =
        ComponentIndexType.LEFT_OR_MAIN.name
)

object RemoteControllerIdentitySource {
    private val started = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(RemoteControllerIdentitySnapshot) -> Unit>()

    @Volatile
    var snapshot = RemoteControllerIdentitySnapshot()
        private set

    fun start() {
        if (started.getAndSet(true)) return

        RemoteControllerKey.KeyConnection
            .create(ComponentIndexType.LEFT_OR_MAIN)
            .listen(this) { connected ->
                update {
                    copy(connected = connected == true)
                }

                if (connected == true) {
                    refreshIdentity()
                }
            }

        RemoteControllerKey.KeyRcRK3399SirialNumber
            .create()
            .listen(this) { serial ->
                update { copy(serialNumber = serial) }
            }

        refreshIdentity()
    }

    fun addListener(
        listener: (RemoteControllerIdentitySnapshot) -> Unit
    ) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (RemoteControllerIdentitySnapshot) -> Unit
    ) {
        listeners -= listener
    }

    fun stop() {
        if (!started.getAndSet(false)) return
        KeyManager.getInstance().cancelListen(this)
    }

    private fun refreshIdentity() {
        RemoteControllerKey.KeyFirmwareVersion.create().get(
            { version ->
                update { copy(firmwareVersion = version) }
            },
            {
                update { copy(firmwareVersion = null) }
            }
        )
    }

    private inline fun update(
        transform: RemoteControllerIdentitySnapshot.() ->
            RemoteControllerIdentitySnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
