package com.fh2.rcbridge

import org.json.JSONArray
import org.json.JSONObject

data class BridgeCapabilities(
    val camera: Boolean,
    val gimbal: Boolean,
    val thermal: Boolean,
    val multispectral: Boolean,
    val rtk: Boolean,
    val wayline: Boolean,
    val virtualStick: Boolean
)

data class BridgeControlSnapshot(
    val virtualStick: VirtualStickSnapshot,
    val networkArmed: Boolean,
    val networkArmedAt: Long?
)

data class BridgeSnapshot(
    val schema: String = "fh2.msdk.v1",
    val timestampMs: Long,
    val sdk: DjiSdkSnapshot,
    val gateway: RemoteControllerIdentitySnapshot,
    val aircraft: AircraftTelemetrySnapshot,
    val sensors: SensorInventorySnapshot,
    val rtk: RtkSnapshot,
    val payloadControl: CameraGimbalControlSnapshot,
    val wayline: WaylineMissionSnapshot,
    val control: BridgeControlSnapshot,
    val keyManager: MsdkKeyManagerSnapshot,
    val capabilities: BridgeCapabilities
) {
    fun toJson(): JSONObject =
        JSONObject().apply {
            put("schema", schema)
            put("timestampMs", timestampMs)
            put("sdk", sdk.toJson())
            put("gateway", gateway.toJson())
            put("aircraft", aircraft.toJson())
            put(
                "sensors",
                JSONArray().apply {
                    sensors.components.forEach { put(it.toJson()) }
                }
            )
            put("rtk", rtk.toJson())
            put("payloadControl", payloadControl.toJson())
            put("wayline", wayline.toJson())
            put("control", control.toJson())
            put("keyManager", keyManager.toJson())
            put("capabilities", capabilities.toJson())
        }
}

object BridgeSnapshotProvider {
    fun current(nowMs: Long = System.currentTimeMillis()): BridgeSnapshot {
        val sensors = SensorInventorySource.snapshot

        val cameraTypes =
            sensors.components
                .mapNotNull { it.cameraType }
                .toSet()

        val capabilities = BridgeCapabilities(
            camera = sensors.components.any { it.cameraConnected },
            gimbal = sensors.components.any { it.gimbalConnected },
            thermal =
                "M3T" in cameraTypes ||
                    "M3TA" in cameraTypes,
            multispectral = "M3M" in cameraTypes,
            rtk =
                RtkTelemetrySource.snapshot.enabled != null ||
                    RtkTelemetrySource.snapshot.healthy != null ||
                    RtkTelemetrySource.snapshot.positioningSolution != null,
            wayline = cameraTypes.any {
                it == "M3E" ||
                    it == "M3T" ||
                    it == "M3TA" ||
                    it == "M3M"
            },
            virtualStick =
                cameraTypes.any {
                    it == "M3E" ||
                        it == "M3T" ||
                        it == "M3TA" ||
                        it == "M3M"
                }
        )

        return BridgeSnapshot(
            timestampMs = nowMs,
            sdk = DjiSdkRuntime.snapshot,
            gateway = RemoteControllerIdentitySource.snapshot,
            aircraft = AircraftTelemetrySource.snapshot,
            sensors = sensors,
            rtk = RtkTelemetrySource.snapshot,
            payloadControl = CameraGimbalController.snapshot,
            wayline = WaylineMissionController.snapshot,
            control = BridgeControlSnapshot(
                virtualStick = VirtualStickController.snapshot,
                networkArmed = NetworkControlArm.snapshot.armed,
                networkArmedAt = NetworkControlArm.snapshot.armedAt
            ),
            keyManager = MsdkKeyManagerRuntime.snapshot,
            capabilities = capabilities
        )
    }
}

private fun DjiSdkSnapshot.toJson() =
    JSONObject().apply {
        put("initialized", initialized)
        put("initEvent", initEvent)
        put("initProgress", initProgress)
        put("registered", registered)
        putNullable("registrationError", registrationError)
        put("productConnected", productConnected)
        putNullable("productId", productId)
    }


private fun RemoteControllerIdentitySnapshot.toJson() =
    JSONObject().apply {
        put("connected", connected)
        putNullable("serialNumber", serialNumber)
        putNullable("firmwareVersion", firmwareVersion)
        put("rcGpsValid", rcGpsValid)
        putNullable("rcLatitude", rcLatitude)
        putNullable("rcLongitude", rcLongitude)
        putNullable("rcAccuracyM", rcAccuracyM)
        put("componentIndex", componentIndex)
    }

private fun AircraftTelemetrySnapshot.toJson() =
    JSONObject().apply {
        put("flightControllerConnected", flightControllerConnected)
        put("productType", productType)
        putNullable("firmwareVersion", firmwareVersion)
        putNullable("flightControllerSerial", flightControllerSerial)
        putNullable("latitude", latitude)
        putNullable("longitude", longitude)
        putNullable("altitudeM", altitudeM)
        putNullable("homeLatitude", homeLatitude)
        putNullable("homeLongitude", homeLongitude)
        putNullable("headingDeg", headingDeg)
    }

private fun SensorComponentSnapshot.toJson() =
    JSONObject().apply {
        put("index", index)
        put("cameraConnected", cameraConnected)
        putNullable("cameraType", cameraType)
        putNullable("cameraSerial", cameraSerial)
        put(
            "streamSources",
            JSONArray().apply {
                streamSources.forEach(::put)
            }
        )
        put("gimbalConnected", gimbalConnected)
        put("payloadConnected", payloadConnected)
        putNullable("payloadProductName", payloadProductName)
    }

private fun RtkSnapshot.toJson() =
    JSONObject().apply {
        putNullable("enabled", enabled)
        putNullable("healthy", healthy)
        putNullable(
            "maintainAccuracyEnabled",
            maintainAccuracyEnabled
        )
        putNullable(
            "referenceStationSource",
            referenceStationSource
        )
        putNullable("positioningSolution", positioningSolution)
        putNullable("mobileLatitude", mobileLatitude)
        putNullable("mobileLongitude", mobileLongitude)
        putNullable("mobileAltitudeM", mobileAltitudeM)
        putNullable("baseLatitude", baseLatitude)
        putNullable("baseLongitude", baseLongitude)
        putNullable("baseAltitudeM", baseAltitudeM)
        putNullable("stdLongitude", stdLongitude)
        putNullable("stdLatitude", stdLatitude)
        putNullable("stdAltitude", stdAltitude)
        putNullable("rtkHeading", rtkHeading)
        putNullable("realHeading", realHeading)
        put(
            "satelliteCounts",
            JSONObject().apply {
                satelliteCounts.forEach { (key, value) ->
                    put(key, value)
                }
            }
        )
        putNullable("error", error)
    }

private fun CameraGimbalControlSnapshot.toJson() =
    JSONObject().apply {
        put("cameraIndex", cameraIndex)
        put("isShootingPhoto", isShootingPhoto)
        put("isRecording", isRecording)
        putNullable("lastAction", lastAction)
        putNullable("lastError", lastError)
    }

private fun WaylineMissionSnapshot.toJson() =
    JSONObject().apply {
        put("supported", supported)
        putNullable("selectedFileName", selectedFileName)
        put(
            "availableWaylineIds",
            JSONArray().apply {
                availableWaylineIds.forEach(::put)
            }
        )
        put("uploadState", uploadState)
        put("uploadProgress", uploadProgress)
        putNullable("uploadedAt", uploadedAt)
        putNullable("lastError", lastError)
    }

private fun BridgeControlSnapshot.toJson() =
    JSONObject().apply {
        put("networkArmed", networkArmed)
        putNullable("networkArmedAt", networkArmedAt)
        put("virtualStick", virtualStick.toJson())
    }

private fun VirtualStickSnapshot.toJson() =
    JSONObject().apply {
        put("enabled", enabled)
        put("advancedMode", advancedMode)
        put("authorityOwner", authorityOwner)
        put("changeReason", changeReason)
        putNullable("lastError", lastError)
    }

private fun MsdkKeyManagerSnapshot.toJson() =
    JSONObject().apply {
        put("active", active)
        put("productConnected", productConnected)
        putNullable("probedAt", probedAt)
        put(
            "keys",
            JSONArray().apply {
                keys.forEach { put(it.toJson()) }
            }
        )
    }

private fun MsdkKeyDescriptor.toJson() =
    JSONObject().apply {
        put("identifier", identifier)
        put("family", family)
        putNullable("componentIndex", componentIndex)
        putNullable("cameraLensType", cameraLensType)
        putNullable("subComponentType", subComponentType)
        put(
            "operations",
            JSONObject().apply {
                put("canGet", operations.canGet)
                put("canSet", operations.canSet)
                put("canListen", operations.canListen)
                put("canPerformAction", operations.canPerformAction)
            }
        )
        putNullable("isEvent", isEvent)
        putNullable("valueType", valueType)
        putNullable("concreteKeyType", concreteKeyType)
        put("probeMode", probeMode)
        put("runtimeStatus", runtimeStatus)
        putNullable("lastObservedAt", lastObservedAt)
        putNullable("lastError", lastError)
    }

private fun BridgeCapabilities.toJson() =
    JSONObject().apply {
        put("camera", camera)
        put("gimbal", gimbal)
        put("thermal", thermal)
        put("multispectral", multispectral)
        put("rtk", rtk)
        put("wayline", wayline)
        put("virtualStick", virtualStick)
    }

private fun JSONObject.putNullable(
    key: String,
    value: Any?
): JSONObject =
    put(key, value ?: JSONObject.NULL)
