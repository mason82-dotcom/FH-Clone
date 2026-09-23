package com.fh2.rcbridge

import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.GimbalKey
import dji.sdk.keyvalue.key.PayloadKey
import dji.sdk.keyvalue.value.camera.CameraType
import dji.sdk.keyvalue.value.camera.CameraVideoStreamSourceType
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.et.create
import dji.v5.et.listen
import dji.v5.manager.KeyManager
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class SensorComponentSnapshot(
    val index: String,
    val cameraConnected: Boolean = false,
    val cameraType: String? = null,
    val cameraSerial: String? = null,
    val streamSources: List<String> = emptyList(),
    val gimbalConnected: Boolean = false,
    val payloadConnected: Boolean = false,
    val payloadProductName: String? = null
)

data class SensorInventorySnapshot(
    val components: List<SensorComponentSnapshot> = emptyList()
)

object SensorInventorySource {
    private val indices = listOf(
        ComponentIndexType.LEFT_OR_MAIN,
        ComponentIndexType.RIGHT,
        ComponentIndexType.UP
    )

    private val started = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(SensorInventorySnapshot) -> Unit>()

    private val components =
        linkedMapOf<ComponentIndexType, SensorComponentSnapshot>()

    @Volatile
    var snapshot = SensorInventorySnapshot()
        private set

    fun start() {
        if (started.getAndSet(true)) return

        indices.forEach { index ->
            components[index] = SensorComponentSnapshot(index = index.name)

            CameraKey.KeyConnection.create(index).listen(this) { connected ->
                mutate(index) {
                    copy(cameraConnected = connected == true)
                }
            }

            CameraKey.KeyCameraType.create(index).listen(this) { type ->
                mutate(index) {
                    copy(
                        cameraType =
                            (type ?: CameraType.NOT_SUPPORTED).name
                    )
                }
            }

            CameraKey.KeySerialNumber.create(index).listen(this) { serial ->
                mutate(index) {
                    copy(cameraSerial = serial)
                }
            }

            CameraKey.KeyCameraVideoStreamSourceRange
                .create(index)
                .listen(this) { sources ->
                    val names =
                        (sources
                            ?: emptyList<CameraVideoStreamSourceType>())
                            .map { it.name }
                            .distinct()
                    mutate(index) {
                        copy(streamSources = names)
                    }
                }

            GimbalKey.KeyConnection.create(index).listen(this) { connected ->
                mutate(index) {
                    copy(gimbalConnected = connected == true)
                }
            }

            PayloadKey.KeyConnection.create(index).listen(this) { connected ->
                mutate(index) {
                    copy(payloadConnected = connected == true)
                }
            }

            PayloadKey.KeyPayloadProductName
                .create(index)
                .listen(this) { productName ->
                    mutate(index) {
                        copy(payloadProductName = productName)
                    }
                }
        }

        publish()
    }

    fun addListener(listener: (SensorInventorySnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (SensorInventorySnapshot) -> Unit) {
        listeners -= listener
    }

    fun stop() {
        if (!started.getAndSet(false)) return
        KeyManager.getInstance().cancelListen(this)
        components.clear()
        publish()
    }

    private fun mutate(
        index: ComponentIndexType,
        transform: SensorComponentSnapshot.() ->
            SensorComponentSnapshot
    ) {
        val current =
            components[index] ?: SensorComponentSnapshot(index = index.name)
        components[index] = current.transform()
        publish()
    }

    private fun publish() {
        snapshot = SensorInventorySnapshot(
            components = indices.mapNotNull(components::get)
        )
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
