package com.fh2.rcbridge

import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

data class MsdkControlChannelSnapshot(
    val status: String = "disconnected",
    val sessionId: String? = null,
    val holder: String? = null,
    val lastSeq: Long = 0,
    val connectedAt: Long? = null,
    val lastMessageAt: Long? = null,
    val lastError: String? = null
)

private data class MsdkControlEndpoint(
    val baseUrl: String,
    val agentToken: String,
    val aircraftSn: String
)

object MsdkControlClient {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val listeners =
        CopyOnWriteArrayList<(MsdkControlChannelSnapshot) -> Unit>()
    private val http =
        OkHttpClient.Builder()
            .pingInterval(10, TimeUnit.SECONDS)
            .build()
    private val controlSession = RemoteControlSession()

    @Volatile
    var snapshot = MsdkControlChannelSnapshot()
        private set

    @Volatile
    private var socket: WebSocket? = null

    @Volatile
    private var sessionId: String? = null

    @Volatile
    private var lastSeq = 0L

    @Volatile
    private var desiredEndpoint: MsdkControlEndpoint? = null

    @Volatile
    private var connectionGeneration = 0L

    @Volatile
    private var reconnectAttempt = 0

    @Volatile
    private var reconnectScheduledGeneration: Long? = null

    private var armListenerRegistered = false

    private val armListener: (NetworkControlArmSnapshot) -> Unit = { arm ->
        if (!arm.armed) {
            failClosed("local_network_control_disarmed", notifyServer = true)
        }
    }

    fun connect(
        baseUrl: String,
        agentToken: String,
        aircraftSn: String
    ) {
        disconnect("reconnect")

        if (!armListenerRegistered) {
            NetworkControlArm.addListener(armListener)
            armListenerRegistered = true
        }

        val target =
            MsdkControlEndpoint(
                baseUrl = baseUrl,
                agentToken = agentToken,
                aircraftSn = aircraftSn
            )

        desiredEndpoint = target
        connectionGeneration += 1
        reconnectAttempt = 0
        reconnectScheduledGeneration = null
        openSocket(target, connectionGeneration)
    }

    fun disconnect(reason: String = "operator_disconnect") {
        desiredEndpoint = null
        connectionGeneration += 1
        reconnectAttempt = 0
        reconnectScheduledGeneration = null

        val current = socket
        failClosed(reason, notifyServer = current != null)
        socket = null
        current?.close(1000, reason)
        update { MsdkControlChannelSnapshot() }
    }

    private fun openSocket(
        target: MsdkControlEndpoint,
        generation: Long
    ) {
        if (
            desiredEndpoint != target ||
            generation != connectionGeneration
        ) {
            return
        }

        val wsUrl =
            controlWebSocketUrl(
                target.baseUrl,
                target.aircraftSn
            )
        val request =
            Request.Builder()
                .url(wsUrl)
                .header(
                    "Authorization",
                    "Bearer ${target.agentToken}"
                )
                .build()

        update {
            copy(
                status = "connecting",
                lastError = null
            )
        }

        val createdSocket =
            http.newWebSocket(
                request,
                object : WebSocketListener() {
                    override fun onOpen(
                        webSocket: WebSocket,
                        response: Response
                    ) {
                        if (
                            desiredEndpoint != target ||
                            generation != connectionGeneration
                        ) {
                            webSocket.close(
                                1000,
                                "stale_connection"
                            )
                            return
                        }

                        socket = webSocket
                        reconnectAttempt = 0
                        reconnectScheduledGeneration = null
                        update {
                            copy(
                                status = "connected",
                                connectedAt =
                                    System.currentTimeMillis(),
                                lastError = null
                            )
                        }
                    }

                    override fun onMessage(
                        webSocket: WebSocket,
                        text: String
                    ) {
                        if (
                            desiredEndpoint != target ||
                            generation != connectionGeneration
                        ) {
                            return
                        }

                        update {
                            copy(
                                lastMessageAt =
                                    System.currentTimeMillis()
                            )
                        }
                        runCatching {
                            handleMessage(text)
                        }.onFailure { error ->
                            update {
                                copy(
                                    lastError =
                                        error.message
                                            ?: error.toString()
                                )
                            }
                        }
                    }

                    override fun onClosed(
                        webSocket: WebSocket,
                        code: Int,
                        reason: String
                    ) {
                        if (socket === webSocket) socket = null
                        if (
                            desiredEndpoint != target ||
                            generation != connectionGeneration
                        ) {
                            return
                        }

                        val closeReason =
                            "socket_closed_$code:$reason"
                        failClosed(
                            closeReason,
                            notifyServer = false
                        )
                        update {
                            copy(status = "disconnected")
                        }
                        scheduleReconnect(
                            target,
                            generation,
                            closeReason
                        )
                    }

                    override fun onFailure(
                        webSocket: WebSocket,
                        t: Throwable,
                        response: Response?
                    ) {
                        if (socket === webSocket) socket = null
                        if (
                            desiredEndpoint != target ||
                            generation != connectionGeneration
                        ) {
                            return
                        }

                        if (
                            response?.code == 401 ||
                            response?.code == 403
                        ) {
                            desiredEndpoint = null
                            connectionGeneration += 1
                            reconnectScheduledGeneration = null
                            failClosed(
                                "socket_unauthorized",
                                notifyServer = false
                            )
                            update {
                                copy(
                                    status = "unauthorized",
                                    lastError =
                                        "http_${response.code}"
                                )
                            }
                            return
                        }

                        val failure =
                            t.message ?: t.toString()
                        failClosed(
                            "socket_failure",
                            notifyServer = false
                        )
                        update {
                            copy(
                                status = "error",
                                lastError = failure
                            )
                        }
                        scheduleReconnect(
                            target,
                            generation,
                            failure
                        )
                    }
                }
            )

        socket = createdSocket
    }

    private fun scheduleReconnect(
        target: MsdkControlEndpoint,
        generation: Long,
        reason: String
    ) {
        if (
            desiredEndpoint != target ||
            generation != connectionGeneration ||
            reconnectScheduledGeneration == generation
        ) {
            return
        }

        reconnectScheduledGeneration = generation
        val delayMs =
            when (reconnectAttempt.coerceAtMost(3)) {
                0 -> 1_000L
                1 -> 2_000L
                2 -> 5_000L
                else -> 10_000L
            }
        reconnectAttempt += 1

        update {
            copy(
                status = "reconnecting",
                lastError = reason
            )
        }

        mainHandler.postDelayed(
            {
                if (
                    reconnectScheduledGeneration == generation
                ) {
                    reconnectScheduledGeneration = null
                }

                if (
                    desiredEndpoint != target ||
                    generation != connectionGeneration ||
                    socket != null
                ) {
                    return@postDelayed
                }

                openSocket(target, generation)
            },
            delayMs
        )
    }

    fun addListener(
        listener: (MsdkControlChannelSnapshot) -> Unit
    ) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (MsdkControlChannelSnapshot) -> Unit
    ) {
        listeners -= listener
    }

    private fun handleMessage(text: String) {
        val message = JSONObject(text)
        when (message.getString("type")) {
            "connected" -> Unit
            "session_start" -> handleSessionStart(message)
            "stick" -> handleStick(message)
            "neutral" -> handleNeutral(message)
            "session_stop" -> handleSessionStop(message)
            "ping" -> send(
                JSONObject()
                    .put("type", "pong")
                    .put("at", System.currentTimeMillis())
            )
            "error" -> {
                update {
                    copy(
                        lastError =
                            message.optString(
                                "error",
                                "server_error"
                            )
                    )
                }
            }
            else -> throw IllegalArgumentException(
                "unsupported_control_message"
            )
        }
    }

    private fun handleSessionStart(message: JSONObject) {
        val requestedSessionId = message.getString("sessionId")
        val holder = message.getString("holder")

        if (!NetworkControlArm.snapshot.armed) {
            rejectSession(
                requestedSessionId,
                "local_network_control_not_armed"
            )
            return
        }
        if (!BridgeSnapshotProvider.current().capabilities.virtualStick) {
            rejectSession(
                requestedSessionId,
                "virtual_stick_not_supported"
            )
            return
        }
        if (sessionId != null || controlSession.isActive()) {
            rejectSession(requestedSessionId, "session_busy")
            return
        }

        sessionId = requestedSessionId
        lastSeq = 0L
        update {
            copy(
                status = "starting",
                sessionId = requestedSessionId,
                holder = holder,
                lastSeq = 0,
                lastError = null
            )
        }

        mainHandler.post {
            VirtualStickController.enable { result ->
                result.onFailure { error ->
                    rejectSession(
                        requestedSessionId,
                        error.message ?: "virtual_stick_enable_failed"
                    )
                    clearSession("enable_failed")
                }.onSuccess {
                    waitForMsdkAuthority(
                        requestedSessionId,
                        SystemClock.elapsedRealtime() + 3_000
                    )
                }
            }
        }
    }

    private fun waitForMsdkAuthority(
        expectedSessionId: String,
        deadline: Long
    ) {
        if (sessionId != expectedSessionId) return
        if (!NetworkControlArm.snapshot.armed) {
            rejectSession(
                expectedSessionId,
                "local_network_control_disarmed"
            )
            clearSession("local_disarmed")
            return
        }

        val state = VirtualStickController.snapshot
        if (state.enabled && state.authorityOwner == "MSDK") {
            runCatching {
                controlSession.start()
            }.onSuccess {
                update {
                    copy(
                        status = "active",
                        sessionId = expectedSessionId,
                        lastError = null
                    )
                }
                send(
                    JSONObject()
                        .put("type", "session_ready")
                        .put("sessionId", expectedSessionId)
                        .put("authorityOwner", "MSDK")
                )
            }.onFailure { error ->
                rejectSession(
                    expectedSessionId,
                    error.message ?: "control_session_start_failed"
                )
                clearSession("session_start_failed")
            }
            return
        }

        if (SystemClock.elapsedRealtime() >= deadline) {
            rejectSession(
                expectedSessionId,
                "msdk_authority_timeout"
            )
            clearSession("authority_timeout")
            return
        }

        mainHandler.postDelayed(
            {
                waitForMsdkAuthority(
                    expectedSessionId,
                    deadline
                )
            },
            100
        )
    }

    private fun handleStick(message: JSONObject) {
        val expectedSession = sessionId
            ?: throw IllegalStateException(
                "control_session_not_active"
            )
        if (message.getString("sessionId") != expectedSession) {
            throw IllegalArgumentException("control_session_mismatch")
        }
        if (!NetworkControlArm.snapshot.armed) {
            failClosed(
                "local_network_control_disarmed",
                notifyServer = true
            )
            return
        }

        val seq = message.getLong("seq")
        val expiresAt = message.getLong("expiresAt")
        if (seq <= lastSeq) return
        if (System.currentTimeMillis() > expiresAt) return

        val frame = message.getJSONObject("frame")
        val normalized =
            NormalizedStickFrame(
                leftHorizontal =
                    frame.getDouble("leftHorizontal").toFloat(),
                leftVertical =
                    frame.getDouble("leftVertical").toFloat(),
                rightHorizontal =
                    frame.getDouble("rightHorizontal").toFloat(),
                rightVertical =
                    frame.getDouble("rightVertical").toFloat()
            )

        validateNormalized(normalized)
        lastSeq = seq
        update { copy(lastSeq = seq) }

        mainHandler.post {
            runCatching {
                controlSession.accept(normalized)
            }.onFailure { error ->
                failClosed(
                    error.message ?: "stick_dispatch_failed",
                    notifyServer = true
                )
            }
        }
    }

    private fun handleNeutral(message: JSONObject) {
        val activeSession = sessionId ?: return
        if (
            message.optString("sessionId", activeSession) !=
                activeSession
        ) {
            return
        }
        mainHandler.post {
            VirtualStickController.neutral()
        }
    }

    private fun handleSessionStop(message: JSONObject) {
        val activeSession = sessionId ?: return
        if (message.getString("sessionId") != activeSession) return
        val reason = message.optString("reason", "server_stop")

        mainHandler.post {
            controlSession.stop(releaseAuthority = true)
            VirtualStickController.neutral()
            VirtualStickController.disable { }
        }

        send(
            JSONObject()
                .put("type", "session_stopped")
                .put("sessionId", activeSession)
                .put("reason", reason)
        )
        clearSession(reason, releaseAuthority = false)
    }

    private fun rejectSession(
        rejectedSessionId: String,
        reason: String
    ) {
        send(
            JSONObject()
                .put("type", "session_rejected")
                .put("sessionId", rejectedSessionId)
                .put("reason", reason)
        )
    }

    private fun failClosed(
        reason: String,
        notifyServer: Boolean
    ) {
        val activeSession = sessionId

        mainHandler.post {
            controlSession.stop(releaseAuthority = true)
            VirtualStickController.neutral()
            VirtualStickController.disable { }
        }

        if (notifyServer && activeSession != null) {
            send(
                JSONObject()
                    .put("type", "session_stopped")
                    .put("sessionId", activeSession)
                    .put("reason", reason)
            )
        }

        clearSession(reason, releaseAuthority = false)
    }

    private fun clearSession(
        reason: String,
        releaseAuthority: Boolean = true
    ) {
        if (releaseAuthority) {
            mainHandler.post {
                controlSession.stop(releaseAuthority = true)
                VirtualStickController.neutral()
                VirtualStickController.disable { }
            }
        }

        sessionId = null
        lastSeq = 0L
        update {
            copy(
                status =
                    if (socket != null) "connected"
                    else "disconnected",
                sessionId = null,
                holder = null,
                lastSeq = 0,
                lastError =
                    if (reason == "operator_disconnect") null
                    else reason
            )
        }
    }

    private fun send(body: JSONObject): Boolean =
        socket?.send(body.toString()) == true

    private fun controlWebSocketUrl(
        baseUrl: String,
        aircraftSn: String
    ): String {
        val uri = URI(baseUrl)
        val scheme =
            when (uri.scheme?.lowercase()) {
                "https" -> "wss"
                "http" -> "ws"
                else -> error("unsupported_fh2_scheme")
            }
        val encodedAircraft =
            URLEncoder.encode(
                aircraftSn,
                StandardCharsets.UTF_8.name()
            )
        val authority =
            buildString {
                append(uri.host)
                if (uri.port >= 0) append(":").append(uri.port)
            }

        return "$scheme://$authority/ws/msdk/control/$encodedAircraft"
    }

    private fun validateNormalized(frame: NormalizedStickFrame) {
        val values =
            listOf(
                frame.leftHorizontal,
                frame.leftVertical,
                frame.rightHorizontal,
                frame.rightVertical
            )
        require(
            values.all {
                it.isFinite() && it >= -1f && it <= 1f
            }
        ) {
            "normalized_stick_out_of_range"
        }
    }

    private inline fun update(
        transform: MsdkControlChannelSnapshot.() ->
            MsdkControlChannelSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
