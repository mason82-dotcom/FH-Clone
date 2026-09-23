package com.fh2.rcbridge

import dji.sdk.keyvalue.key.CameraKey
import dji.sdk.keyvalue.key.DJIActionKeyInfo
import dji.sdk.keyvalue.key.DJIKey
import dji.sdk.keyvalue.key.DJIKeyInfo
import dji.sdk.keyvalue.key.FlightControllerKey
import dji.sdk.keyvalue.key.GimbalKey
import dji.sdk.keyvalue.key.KeyTools
import dji.sdk.keyvalue.key.PayloadKey
import dji.sdk.keyvalue.key.ProductKey
import dji.sdk.keyvalue.key.RemoteControllerKey
import dji.sdk.keyvalue.value.camera.CameraLensType
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.KeyManager
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

enum class MsdkKeyRuntimeStatus(val wireValue: String) {
    SUPPORTED("supported"),
    UNSUPPORTED_ON_PRODUCT("unsupported_on_product"),
    TEMPORARILY_UNAVAILABLE("temporarily_unavailable"),
    DISCONNECTED("disconnected"),
    ERROR("error")
}

data class MsdkKeyOperations(
    val canGet: Boolean,
    val canSet: Boolean,
    val canListen: Boolean,
    val canPerformAction: Boolean
)

data class MsdkKeyDescriptor(
    val identifier: String,
    val family: String,
    val componentIndex: String? = null,
    val cameraLensType: String? = null,
    val subComponentType: Int? = null,
    val operations: MsdkKeyOperations,
    val isEvent: Boolean? = null,
    val valueType: String? = null,
    val concreteKeyType: String? = null,
    val probeMode: String,
    val runtimeStatus: String,
    val lastObservedAt: Long? = null,
    val lastError: String? = null
)

data class MsdkKeyManagerSnapshot(
    val active: Boolean = false,
    val productConnected: Boolean = false,
    val probedAt: Long? = null,
    val keys: List<MsdkKeyDescriptor> = emptyList()
)

object MsdkKeyManagerRuntime {
    private val manager = KeyManager.getInstance()
    private val started = AtomicBoolean(false)
    private val lock = Any()
    private val descriptors = linkedMapOf<String, MsdkKeyDescriptor>()
    private val listeners =
        CopyOnWriteArrayList<(MsdkKeyManagerSnapshot) -> Unit>()

    private val componentIndices = listOf(
        ComponentIndexType.LEFT_OR_MAIN,
        ComponentIndexType.RIGHT,
        ComponentIndexType.UP
    )

    @Volatile
    var snapshot = MsdkKeyManagerSnapshot()
        private set

    fun start() {
        if (!started.compareAndSet(false, true)) return
        refresh()
    }

    fun refresh() {
        if (!started.get()) return

        manager.cancelListen(this)
        synchronized(lock) {
            descriptors.clear()
        }

        registerInventory()
        publish()
    }

    fun onProductConnected() {
        if (!started.get()) {
            start()
            return
        }
        refresh()
    }

    fun onProductDisconnected() {
        manager.cancelListen(this)
        synchronized(lock) {
            descriptors.replaceAll { _, descriptor ->
                descriptor.copy(
                    runtimeStatus = MsdkKeyRuntimeStatus.DISCONNECTED.wireValue,
                    lastObservedAt = null,
                    lastError = null
                )
            }
        }
        publish()
    }

    fun stop() {
        if (!started.compareAndSet(true, false)) return
        manager.cancelListen(this)
        synchronized(lock) {
            descriptors.clear()
        }
        snapshot = MsdkKeyManagerSnapshot()
        notifyListeners()
    }

    fun addListener(listener: (MsdkKeyManagerSnapshot) -> Unit) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(listener: (MsdkKeyManagerSnapshot) -> Unit) {
        listeners -= listener
    }

    private fun registerInventory() {
        observe(
            family = "product",
            info = ProductKey.KeyConnection,
            key = KeyTools.createKey(ProductKey.KeyConnection)
        )
        observe(
            family = "product",
            info = ProductKey.KeyProductType,
            key = KeyTools.createKey(ProductKey.KeyProductType)
        )
        observe(
            family = "product",
            info = ProductKey.KeyFirmwareVersion,
            key = KeyTools.createKey(ProductKey.KeyFirmwareVersion)
        )

        observe(
            family = "flight_controller",
            info = FlightControllerKey.KeyConnection,
            key = KeyTools.createKey(FlightControllerKey.KeyConnection)
        )
        observe(
            family = "flight_controller",
            info = FlightControllerKey.KeySerialNumber,
            key = KeyTools.createKey(FlightControllerKey.KeySerialNumber)
        )
        observe(
            family = "flight_controller",
            info = FlightControllerKey.KeyAircraftLocation3D,
            key = KeyTools.createKey(FlightControllerKey.KeyAircraftLocation3D)
        )
        observe(
            family = "flight_controller",
            info = FlightControllerKey.KeyHomeLocation,
            key = KeyTools.createKey(FlightControllerKey.KeyHomeLocation)
        )
        observe(
            family = "flight_controller",
            info = FlightControllerKey.KeyCompassHeading,
            key = KeyTools.createKey(FlightControllerKey.KeyCompassHeading)
        )

        observe(
            family = "remote_controller",
            info = RemoteControllerKey.KeyConnection,
            key = KeyTools.createKey(
                RemoteControllerKey.KeyConnection,
                ComponentIndexType.LEFT_OR_MAIN
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name
        )
        observe(
            family = "remote_controller",
            info = RemoteControllerKey.KeyRcRK3399SirialNumber,
            key = KeyTools.createKey(RemoteControllerKey.KeyRcRK3399SirialNumber)
        )
        observe(
            family = "remote_controller",
            info = RemoteControllerKey.KeyFirmwareVersion,
            key = KeyTools.createKey(RemoteControllerKey.KeyFirmwareVersion)
        )
        observe(
            family = "remote_controller",
            info = RemoteControllerKey.KeyRcGPSInfo,
            key = KeyTools.createKey(RemoteControllerKey.KeyRcGPSInfo)
        )
        // Representative writable key. The runtime only probes it read-only.
        // canSet=true is inventory evidence, never a FH2 write grant.
        observe(
            family = "remote_controller",
            info = RemoteControllerKey.KeyControlMode,
            key = KeyTools.createKey(RemoteControllerKey.KeyControlMode)
        )

        componentIndices.forEach { index ->
            observe(
                family = "camera",
                info = CameraKey.KeyConnection,
                key = KeyTools.createKey(CameraKey.KeyConnection, index),
                componentIndex = index.name
            )
            observe(
                family = "camera",
                info = CameraKey.KeyCameraType,
                key = KeyTools.createKey(CameraKey.KeyCameraType, index),
                componentIndex = index.name
            )
            observe(
                family = "camera",
                info = CameraKey.KeySerialNumber,
                key = KeyTools.createKey(CameraKey.KeySerialNumber, index),
                componentIndex = index.name
            )
            observe(
                family = "camera",
                info = CameraKey.KeyCameraMode,
                key = KeyTools.createKey(CameraKey.KeyCameraMode, index),
                componentIndex = index.name
            )
            observe(
                family = "camera",
                info = CameraKey.KeyCameraVideoStreamSourceRange,
                key = KeyTools.createKey(
                    CameraKey.KeyCameraVideoStreamSourceRange,
                    index
                ),
                componentIndex = index.name
            )

            observe(
                family = "gimbal",
                info = GimbalKey.KeyConnection,
                key = KeyTools.createKey(GimbalKey.KeyConnection, index),
                componentIndex = index.name
            )

            observe(
                family = "payload",
                info = PayloadKey.KeyConnection,
                key = KeyTools.createKey(PayloadKey.KeyConnection, index),
                componentIndex = index.name
            )
            observe(
                family = "payload",
                info = PayloadKey.KeyPayloadProductName,
                key = KeyTools.createKey(
                    PayloadKey.KeyPayloadProductName,
                    index
                ),
                componentIndex = index.name
            )
        }

        // Lens-scoped key proves that lens identity is part of the concrete
        // runtime key. Unsupported products are expected to fail closed.
        observe(
            family = "camera",
            info = CameraKey.KeyCameraZoomRatios,
            key = KeyTools.createCameraKey(
                CameraKey.KeyCameraZoomRatios,
                ComponentIndexType.LEFT_OR_MAIN,
                CameraLensType.CAMERA_LENS_ZOOM
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name,
            cameraLensType = CameraLensType.CAMERA_LENS_ZOOM.name
        )

        registerAction(
            family = "camera",
            info = CameraKey.KeyStartShootPhoto,
            key = KeyTools.createKey(
                CameraKey.KeyStartShootPhoto,
                ComponentIndexType.LEFT_OR_MAIN
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name
        )
        registerAction(
            family = "camera",
            info = CameraKey.KeyStartRecord,
            key = KeyTools.createKey(
                CameraKey.KeyStartRecord,
                ComponentIndexType.LEFT_OR_MAIN
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name
        )
        registerAction(
            family = "camera",
            info = CameraKey.KeyStopRecord,
            key = KeyTools.createKey(
                CameraKey.KeyStopRecord,
                ComponentIndexType.LEFT_OR_MAIN
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name
        )
        registerAction(
            family = "gimbal",
            info = GimbalKey.KeyRotateBySpeed,
            key = KeyTools.createKey(
                GimbalKey.KeyRotateBySpeed,
                ComponentIndexType.LEFT_OR_MAIN
            ),
            componentIndex = ComponentIndexType.LEFT_OR_MAIN.name
        )
    }

    private fun <T> observe(
        family: String,
        info: DJIKeyInfo<T>,
        key: DJIKey<T>,
        componentIndex: String? = null,
        cameraLensType: String? = null,
        subComponentType: Int? = null
    ) {
        val id = descriptorId(
            family,
            info.getIdentifier(),
            componentIndex,
            cameraLensType
        )
        val connected = runtimeConnected()
        val operations = MsdkKeyOperations(
            canGet = info.isCanGet(),
            canSet = info.isCanSet(),
            canListen = info.isCanListen(),
            canPerformAction = info.isCanPerformAction()
        )

        upsert(
            id,
            MsdkKeyDescriptor(
                identifier = info.getIdentifier(),
                family = family,
                componentIndex = componentIndex,
                cameraLensType = cameraLensType,
                subComponentType = subComponentType,
                operations = operations,
                isEvent = reflectedBoolean(info, "isEvent"),
                concreteKeyType = key.javaClass.name,
                probeMode =
                    if (operations.canGet) {
                        "cache+hardware_read"
                    } else if (operations.canListen) {
                        "listen"
                    } else {
                        "metadata_only"
                    },
                runtimeStatus =
                    if (connected) {
                        MsdkKeyRuntimeStatus.TEMPORARILY_UNAVAILABLE.wireValue
                    } else {
                        MsdkKeyRuntimeStatus.DISCONNECTED.wireValue
                    }
            )
        )

        if (!connected) return

        if (operations.canGet) {
            runCatching {
                manager.getValue(key)
            }.onSuccess { cached ->
                if (cached != null) {
                    markSupported(id, cached)
                }
            }.onFailure { error ->
                markFailure(id, error.toString())
            }

            runCatching {
                manager.getValue(
                    key,
                    object : CommonCallbacks.CompletionCallbackWithParam<T> {
                        override fun onSuccess(value: T?) {
                            markSupported(id, value)
                        }

                        override fun onFailure(error: IDJIError) {
                            markFailure(id, error.toString())
                        }
                    }
                )
            }.onFailure { error ->
                markFailure(id, error.toString())
            }
        }

        if (operations.canListen) {
            runCatching {
                manager.listen(key, this) { _, newValue ->
                    markSupported(id, newValue)
                }
            }.onFailure { error ->
                markFailure(id, error.toString())
            }
        }
    }

    private fun <P, R> registerAction(
        family: String,
        info: DJIActionKeyInfo<P, R>,
        key: DJIKey.ActionKey<P, R>,
        componentIndex: String? = null,
        cameraLensType: String? = null
    ) {
        val id = descriptorId(
            family,
            info.getIdentifier(),
            componentIndex,
            cameraLensType
        )
        val connected = runtimeConnected()

        upsert(
            id,
            MsdkKeyDescriptor(
                identifier = info.getIdentifier(),
                family = family,
                componentIndex = componentIndex,
                cameraLensType = cameraLensType,
                operations = MsdkKeyOperations(
                    canGet = info.isCanGet(),
                    canSet = info.isCanSet(),
                    canListen = info.isCanListen(),
                    canPerformAction = info.isCanPerformAction()
                ),
                isEvent = reflectedBoolean(info, "isEvent"),
                concreteKeyType = key.javaClass.name,
                probeMode = "metadata_only",
                runtimeStatus =
                    if (connected) {
                        MsdkKeyRuntimeStatus.TEMPORARILY_UNAVAILABLE.wireValue
                    } else {
                        MsdkKeyRuntimeStatus.DISCONNECTED.wireValue
                    }
            )
        )
    }

    private fun markSupported(id: String, value: Any?) {
        synchronized(lock) {
            val current = descriptors[id] ?: return
            descriptors[id] = current.copy(
                valueType = value?.javaClass?.name ?: current.valueType,
                runtimeStatus = MsdkKeyRuntimeStatus.SUPPORTED.wireValue,
                lastObservedAt = System.currentTimeMillis(),
                lastError = null
            )
        }
        publish()
    }

    private fun markFailure(id: String, message: String) {
        synchronized(lock) {
            val current = descriptors[id] ?: return
            descriptors[id] = current.copy(
                runtimeStatus = classifyFailure(message).wireValue,
                lastObservedAt = System.currentTimeMillis(),
                lastError = message.take(256)
            )
        }
        publish()
    }

    private fun classifyFailure(message: String): MsdkKeyRuntimeStatus {
        if (!runtimeConnected()) {
            return MsdkKeyRuntimeStatus.DISCONNECTED
        }

        val normalized = message.uppercase()
        if (
            "NOT_SUPPORTED" in normalized ||
            "NOT SUPPORT" in normalized ||
            "UNSUPPORTED" in normalized
        ) {
            return MsdkKeyRuntimeStatus.UNSUPPORTED_ON_PRODUCT
        }
        if (
            "TIMEOUT" in normalized ||
            "BUSY" in normalized ||
            "NOT_READY" in normalized ||
            "TEMPORAR" in normalized
        ) {
            return MsdkKeyRuntimeStatus.TEMPORARILY_UNAVAILABLE
        }
        return MsdkKeyRuntimeStatus.ERROR
    }

    private fun runtimeConnected(): Boolean {
        val sdk = DjiSdkRuntime.snapshot
        return sdk.registered && sdk.productConnected
    }

    private fun descriptorId(
        family: String,
        identifier: String,
        componentIndex: String?,
        cameraLensType: String?
    ): String =
        listOfNotNull(
            family,
            identifier,
            componentIndex,
            cameraLensType
        ).joinToString(":")

    private fun reflectedBoolean(
        target: Any,
        methodName: String
    ): Boolean? =
        runCatching {
            val method =
                target.javaClass.methods.firstOrNull {
                    it.name == methodName && it.parameterCount == 0
                } ?: return@runCatching null
            method.invoke(target) as? Boolean
        }.getOrNull()

    private fun upsert(id: String, descriptor: MsdkKeyDescriptor) {
        synchronized(lock) {
            descriptors[id] = descriptor
        }
    }

    private fun publish() {
        val currentKeys =
            synchronized(lock) {
                descriptors.values.sortedWith(
                    compareBy<MsdkKeyDescriptor>(
                        { it.family },
                        { it.componentIndex ?: "" },
                        { it.cameraLensType ?: "" },
                        { it.identifier }
                    )
                )
            }

        snapshot = MsdkKeyManagerSnapshot(
            active = started.get(),
            productConnected = runtimeConnected(),
            probedAt =
                if (started.get()) System.currentTimeMillis() else null,
            keys = currentKeys
        )
        notifyListeners()
    }

    private fun notifyListeners() {
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
