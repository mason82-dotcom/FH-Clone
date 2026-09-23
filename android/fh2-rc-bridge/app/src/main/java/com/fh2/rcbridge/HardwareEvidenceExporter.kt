package com.fh2.rcbridge

import android.content.Context
import java.io.File

object HardwareEvidenceExporter {
    fun export(
        context: Context,
        nowMs: Long = System.currentTimeMillis()
    ): File {
        val root =
            requireNotNull(context.getExternalFilesDir("evidence")) {
                "external_app_storage_unavailable"
            }

        if (!root.exists() && !root.mkdirs()) {
            error("evidence_directory_create_failed")
        }

        val file = File(
            root,
            "fh2-msdk-evidence-$nowMs.json"
        )

        PairingTransportEvidenceRecorder.recordMarker(
            "hardware_evidence_export"
        )

        val payload =
            BridgeSnapshotProvider
                .current(nowMs)
                .toJson()
                .put(
                    "evidence",
                    PairingTransportEvidenceRecorder.toJson(nowMs)
                )
                .toString(2)

        file.writeText(payload, Charsets.UTF_8)
        return file
    }
}
