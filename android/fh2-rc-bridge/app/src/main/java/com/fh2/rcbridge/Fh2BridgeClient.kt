package com.fh2.rcbridge

import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import org.json.JSONObject

data class Fh2BridgeConnectionSnapshot(
    val status: String = "disconnected",
    val baseUrl: String? = null,
    val gatewaySn: String? = null,
    val aircraftSn: String? = null,
    val expiresAt: Long? = null,
    val lastHeartbeatAt: Long? = null,
    val lastError: String? = null
)

object Fh2BridgeClient {
    private val executor =
        Executors.newSingleThreadScheduledExecutor()
    private val listeners =
        CopyOnWriteArrayList<(Fh2BridgeConnectionSnapshot) -> Unit>()

    @Volatile
    var snapshot = Fh2BridgeConnectionSnapshot()
        private set

    @Volatile
    private var agentToken: String? = null

    private var heartbeatTask: ScheduledFuture<*>? = null

    fun pair(
        baseUrlInput: String,
        pairingToken: String,
        onResult: (Result<Unit>) -> Unit
    ) {
        executor.execute {
            runCatching {
                stopHeartbeat()
                MsdkControlClient.disconnect("re_pair")
                require(pairingToken.isNotBlank()) {
                    "pairing_token_required"
                }
                val baseUrl = normalizeBaseUrl(baseUrlInput)
                update {
                    copy(
                        status = "pairing",
                        baseUrl = baseUrl,
                        lastError = null
                    )
                }

                val response = postJson(
                    "$baseUrl/api/msdk/pair",
                    pairingToken,
                    BridgeSnapshotProvider.current().toJson()
                )

                val token = response.getString("agentToken")
                val gatewaySn = response.getString("gatewaySn")
                val aircraftSn = response.getString("aircraftSn")
                val expiresAt = response.getLong("expiresAt")

                agentToken = token
                update {
                    Fh2BridgeConnectionSnapshot(
                        status = "paired",
                        baseUrl = baseUrl,
                        gatewaySn = gatewaySn,
                        aircraftSn = aircraftSn,
                        expiresAt = expiresAt
                    )
                }
                MsdkControlClient.connect(
                    baseUrl = baseUrl,
                    agentToken = token,
                    aircraftSn = aircraftSn
                )
                startHeartbeat()
            }.onSuccess {
                onResult(Result.success(Unit))
            }.onFailure { error ->
                agentToken = null
                stopHeartbeat()
                MsdkControlClient.disconnect("pairing_failed")
                update {
                    copy(
                        status = "error",
                        lastError = error.message ?: error.toString()
                    )
                }
                onResult(Result.failure(error))
            }
        }
    }

    fun disconnect() {
        executor.execute {
            stopHeartbeat()
            MsdkControlClient.disconnect("bridge_disconnect")
            NetworkControlArm.disarm()
            agentToken = null
            update { Fh2BridgeConnectionSnapshot() }
        }
    }

    fun addListener(
        listener: (Fh2BridgeConnectionSnapshot) -> Unit
    ) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (Fh2BridgeConnectionSnapshot) -> Unit
    ) {
        listeners -= listener
    }

    private fun startHeartbeat() {
        stopHeartbeat()
        heartbeatTask =
            executor.scheduleAtFixedRate(
                {
                    val current = snapshot
                    val token = agentToken
                    val baseUrl = current.baseUrl
                    if (
                        current.status != "paired" ||
                        token == null ||
                        baseUrl == null
                    ) {
                        return@scheduleAtFixedRate
                    }

                    runCatching {
                        postJson(
                            "$baseUrl/api/msdk/heartbeat",
                            token,
                            BridgeSnapshotProvider.current().toJson()
                        )
                    }.onSuccess {
                        update {
                            copy(
                                lastHeartbeatAt =
                                    System.currentTimeMillis(),
                                lastError = null
                            )
                        }
                    }.onFailure { error ->
                        val message =
                            error.message ?: error.toString()
                        update { copy(lastError = message) }

                        if (
                            message.startsWith("http_401") ||
                            message.startsWith("http_403")
                        ) {
                            agentToken = null
                            stopHeartbeat()
                            MsdkControlClient.disconnect("agent_token_expired")
                            NetworkControlArm.disarm()
                            update {
                                copy(
                                    status = "expired",
                                    lastError = message
                                )
                            }
                        }
                    }
                },
                0,
                1,
                TimeUnit.SECONDS
            )
    }

    private fun stopHeartbeat() {
        heartbeatTask?.cancel(false)
        heartbeatTask = null
    }

    private fun normalizeBaseUrl(input: String): String {
        val trimmed = input.trim().trimEnd('/')
        require(trimmed.isNotBlank()) { "fh2_base_url_required" }

        val uri = URI(trimmed)
        val scheme = uri.scheme?.lowercase()
        val host = uri.host
        require(host != null) { "fh2_base_url_invalid" }

        val secure = scheme == "https"
        val debugLan =
            BuildConfig.DEBUG &&
                scheme == "http" &&
                isPrivateHost(host)

        require(secure || debugLan) {
            "fh2_https_required"
        }

        return trimmed
    }

    private fun isPrivateHost(host: String): Boolean {
        if (host == "localhost" || host == "127.0.0.1") return true
        if (host.startsWith("10.")) return true
        if (host.startsWith("192.168.")) return true

        if (host.startsWith("172.")) {
            val second =
                host.split(".").getOrNull(1)?.toIntOrNull()
                    ?: return false
            return second in 16..31
        }

        return false
    }

    private fun postJson(
        url: String,
        bearerToken: String,
        body: JSONObject
    ): JSONObject {
        val connection =
            URL(url).openConnection() as HttpURLConnection

        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 5_000
            connection.readTimeout = 5_000
            connection.doOutput = true
            connection.setRequestProperty(
                "Content-Type",
                "application/json"
            )
            connection.setRequestProperty(
                "Authorization",
                "Bearer $bearerToken"
            )

            connection.outputStream.bufferedWriter(Charsets.UTF_8).use {
                it.write(body.toString())
            }

            val status = connection.responseCode
            val stream =
                if (status in 200..299) {
                    connection.inputStream
                } else {
                    connection.errorStream
                }

            val responseText =
                stream
                    ?.bufferedReader(Charsets.UTF_8)
                    ?.use { reader -> reader.readText() }
                    .orEmpty()

            if (status !in 200..299) {
                throw IllegalStateException(
                    "http_$status:${responseText.take(256)}"
                )
            }

            if (responseText.isBlank()) {
                JSONObject()
            } else {
                JSONObject(responseText)
            }
        } finally {
            connection.disconnect()
        }
    }

    private inline fun update(
        transform: Fh2BridgeConnectionSnapshot.() ->
            Fh2BridgeConnectionSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
