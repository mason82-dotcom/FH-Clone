package com.fh2.rcbridge

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

data class StoredPairing(
    val baseUrl: String,
    val agentToken: String,
    val gatewaySn: String,
    val aircraftSn: String,
    val expiresAt: Long
)

class SecurePairingStore(context: Context) {
    private val appContext = context.applicationContext
    private val preferences =
        appContext.getSharedPreferences(
            "fh2_secure_pairing",
            Context.MODE_PRIVATE
        )

    fun save(pairing: StoredPairing) {
        val payload =
            JSONObject().apply {
                put("baseUrl", pairing.baseUrl)
                put("agentToken", pairing.agentToken)
                put("gatewaySn", pairing.gatewaySn)
                put("aircraftSn", pairing.aircraftSn)
                put("expiresAt", pairing.expiresAt)
            }.toString().toByteArray(Charsets.UTF_8)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())

        preferences.edit()
            .putString(
                KEY_IV,
                Base64.encodeToString(
                    cipher.iv,
                    Base64.NO_WRAP
                )
            )
            .putString(
                KEY_PAYLOAD,
                Base64.encodeToString(
                    cipher.doFinal(payload),
                    Base64.NO_WRAP
                )
            )
            .apply()
    }

    fun load(nowMs: Long = System.currentTimeMillis()): StoredPairing? {
        val ivEncoded = preferences.getString(KEY_IV, null) ?: return null
        val payloadEncoded =
            preferences.getString(KEY_PAYLOAD, null) ?: return null

        return runCatching {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(
                    128,
                    Base64.decode(ivEncoded, Base64.NO_WRAP)
                )
            )

            val json =
                JSONObject(
                    cipher.doFinal(
                        Base64.decode(
                            payloadEncoded,
                            Base64.NO_WRAP
                        )
                    ).toString(Charsets.UTF_8)
                )

            StoredPairing(
                baseUrl = json.getString("baseUrl"),
                agentToken = json.getString("agentToken"),
                gatewaySn = json.getString("gatewaySn"),
                aircraftSn = json.getString("aircraftSn"),
                expiresAt = json.getLong("expiresAt")
            )
        }.getOrNull()?.takeIf { it.expiresAt > nowMs }
            ?: run {
                clear()
                null
            }
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun secretKey(): SecretKey {
        val keyStore =
            KeyStore.getInstance(KEYSTORE).apply {
                load(null)
            }

        val existing =
            keyStore.getKey(KEY_ALIAS, null) as? SecretKey
        if (existing != null) return existing

        return KeyGenerator
            .getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEYSTORE
            )
            .apply {
                init(
                    KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or
                            KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(
                            KeyProperties.BLOCK_MODE_GCM
                        )
                        .setEncryptionPaddings(
                            KeyProperties.ENCRYPTION_PADDING_NONE
                        )
                        .setUserAuthenticationRequired(false)
                        .build()
                )
            }
            .generateKey()
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS =
            "fh2.rcbridge.agent-token.v1"
        const val TRANSFORMATION =
            "AES/GCM/NoPadding"
        const val KEY_IV = "iv"
        const val KEY_PAYLOAD = "payload"
    }
}
