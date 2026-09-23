package com.fh2.rcbridge

import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONArray
import org.json.JSONObject

private data class PairingTransportEvidenceEvent(
    val atMs: Long,
    val source: String,
    val event: String,
    val fields: Map<String, Any?>
)

object PairingTransportEvidenceRecorder {
    private const val MAX_EVENTS = 256
    private const val MAX_TEXT = 256

    private val initialized = AtomicBoolean(false)
    private val lock = Any()
    private val events = mutableListOf<PairingTransportEvidenceEvent>()
    private val processStartedAtMs = System.currentTimeMillis()

    private var lastBridgeFingerprint: String? = null
    private var lastControlFingerprint: String? = null
    private var heartbeatObserved = false

    fun initialize() {
        if (!initialized.compareAndSet(false, true)) return

        recordMarker("process_started")
        Fh2BridgeClient.addListener(::recordBridge)
        MsdkControlClient.addListener(::recordControl)
    }

    fun recordMarker(
        event: String,
        detail: String? = null
    ) {
        append(
            PairingTransportEvidenceEvent(
                atMs = System.currentTimeMillis(),
                source = "marker",
                event = event,
                fields =
                    if (detail == null) {
                        emptyMap()
                    } else {
                        mapOf("detail" to sanitize(detail))
                    }
            )
        )
    }

    fun toJson(
        nowMs: Long = System.currentTimeMillis()
    ): JSONObject {
        val eventSnapshot =
            synchronized(lock) {
                events.toList()
            }

        return JSONObject().apply {
            put("schema", "fh2.pairing-transport-evidence.v1")
            put("capturedAtMs", nowMs)
            put("processStartedAtMs", processStartedAtMs)
            put("eventCount", eventSnapshot.size)
            put("maxEvents", MAX_EVENTS)
            put("bridge", bridgeJson(Fh2BridgeClient.snapshot))
            put("controlChannel", controlJson(MsdkControlClient.snapshot))
            put(
                "events",
                JSONArray().apply {
                    eventSnapshot.forEach { item ->
                        put(
                            JSONObject().apply {
                                put("atMs", item.atMs)
                                put("source", item.source)
                                put("event", item.event)
                                item.fields.forEach { (key, value) ->
                                    putNullable(key, value)
                                }
                            }
                        )
                    }
                }
            )
        }
    }

    private fun recordBridge(
        state: Fh2BridgeConnectionSnapshot
    ) {
        val hasHeartbeat = state.lastHeartbeatAt != null
        val fingerprint =
            listOf(
                state.status,
                state.gatewaySn,
                state.aircraftSn,
                state.expiresAt,
                hasHeartbeat,
                state.lastError
            ).joinToString("|")

        synchronized(lock) {
            if (fingerprint == lastBridgeFingerprint) return
            lastBridgeFingerprint = fingerprint
        }

        append(
            PairingTransportEvidenceEvent(
                atMs = System.currentTimeMillis(),
                source = "bridge",
                event = "state_changed",
                fields = mapOf(
                    "status" to state.status,
                    "gatewaySn" to state.gatewaySn,
                    "aircraftSn" to state.aircraftSn,
                    "expiresAt" to state.expiresAt,
                    "heartbeatObserved" to hasHeartbeat,
                    "lastError" to sanitize(state.lastError)
                )
            )
        )

        if (hasHeartbeat) {
            synchronized(lock) {
                if (!heartbeatObserved) {
                    heartbeatObserved = true
                    appendLocked(
                        PairingTransportEvidenceEvent(
                            atMs = System.currentTimeMillis(),
                            source = "bridge",
                            event = "heartbeat_established",
                            fields = mapOf(
                                "gatewaySn" to state.gatewaySn,
                                "aircraftSn" to state.aircraftSn
                            )
                        )
                    )
                }
            }
        }
    }

    private fun recordControl(
        state: MsdkControlChannelSnapshot
    ) {
        val fingerprint =
            listOf(
                state.status,
                state.sessionId,
                state.holder,
                state.connectedAt,
                state.lastError
            ).joinToString("|")

        synchronized(lock) {
            if (fingerprint == lastControlFingerprint) return
            lastControlFingerprint = fingerprint
        }

        append(
            PairingTransportEvidenceEvent(
                atMs = System.currentTimeMillis(),
                source = "control",
                event = "state_changed",
                fields = mapOf(
                    "status" to state.status,
                    "sessionId" to state.sessionId,
                    "holder" to state.holder,
                    "connectedAt" to state.connectedAt,
                    "lastMessageAt" to state.lastMessageAt,
                    "lastSeq" to state.lastSeq,
                    "lastError" to sanitize(state.lastError)
                )
            )
        )
    }

    private fun bridgeJson(
        state: Fh2BridgeConnectionSnapshot
    ): JSONObject =
        JSONObject().apply {
            put("status", state.status)
            putNullable("baseUrl", state.baseUrl)
            putNullable("gatewaySn", state.gatewaySn)
            putNullable("aircraftSn", state.aircraftSn)
            putNullable("expiresAt", state.expiresAt)
            putNullable("lastHeartbeatAt", state.lastHeartbeatAt)
            putNullable("lastError", sanitize(state.lastError))
        }

    private fun controlJson(
        state: MsdkControlChannelSnapshot
    ): JSONObject =
        JSONObject().apply {
            put("status", state.status)
            putNullable("sessionId", state.sessionId)
            putNullable("holder", state.holder)
            put("lastSeq", state.lastSeq)
            putNullable("connectedAt", state.connectedAt)
            putNullable("lastMessageAt", state.lastMessageAt)
            putNullable("lastError", sanitize(state.lastError))
        }

    private fun append(
        event: PairingTransportEvidenceEvent
    ) {
        synchronized(lock) {
            appendLocked(event)
        }
    }

    private fun appendLocked(
        event: PairingTransportEvidenceEvent
    ) {
        if (events.size >= MAX_EVENTS) {
            events.removeAt(0)
        }
        events += event
    }

    private fun sanitize(value: String?): String? =
        value
            ?.replace(Regex("Bearer\\s+[^\\s]+", RegexOption.IGNORE_CASE), "Bearer <redacted>")
            ?.take(MAX_TEXT)

    private fun JSONObject.putNullable(
        key: String,
        value: Any?
    ): JSONObject =
        put(key, value ?: JSONObject.NULL)
}
