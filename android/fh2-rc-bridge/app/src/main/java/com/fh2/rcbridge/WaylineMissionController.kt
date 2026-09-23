package com.fh2.rcbridge

import android.content.Context
import android.net.Uri
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.aircraft.waypoint3.WaypointMissionManager
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class WaylineMissionSnapshot(
    val supported: Boolean = true,
    val selectedFileName: String? = null,
    val selectedFilePath: String? = null,
    val availableWaylineIds: List<Int> = emptyList(),
    val uploadState: String = "idle",
    val uploadProgress: Double = 0.0,
    val uploadedAt: Long? = null,
    val lastError: String? = null
)

object WaylineMissionController {
    private val manager = WaypointMissionManager.getInstance()
    private val uploading = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(WaylineMissionSnapshot) -> Unit>()

    @Volatile
    var snapshot = WaylineMissionSnapshot()
        private set

    fun importKmz(
        context: Context,
        uri: Uri
    ): File {
        val name =
            queryDisplayName(context, uri)
                ?.takeIf { it.endsWith(".kmz", ignoreCase = true) }
                ?: "fh2-wayline-${System.currentTimeMillis()}.kmz"

        val directory = File(context.filesDir, "waylines")
        if (!directory.exists() && !directory.mkdirs()) {
            error("wayline_directory_create_failed")
        }

        val target = File(directory, sanitizeFileName(name))
        context.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output ->
                input.copyTo(output)
            }
        } ?: error("wayline_input_unavailable")

        require(target.length() > 0L) { "wayline_file_empty" }

        val ids = manager.getAvailableWaylineIDs(target.absolutePath)
        update {
            copy(
                selectedFileName = target.name,
                selectedFilePath = target.absolutePath,
                availableWaylineIds = ids,
                uploadState = "selected",
                uploadProgress = 0.0,
                uploadedAt = null,
                lastError = null
            )
        }
        return target
    }

    fun uploadSelected(onResult: (Result<Unit>) -> Unit) {
        val path = snapshot.selectedFilePath
            ?: return onResult(
                Result.failure(
                    IllegalStateException("wayline_not_selected")
                )
            )

        if (!uploading.compareAndSet(false, true)) {
            return onResult(
                Result.failure(
                    IllegalStateException("wayline_upload_in_progress")
                )
            )
        }

        update {
            copy(
                uploadState = "uploading",
                uploadProgress = 0.0,
                lastError = null
            )
        }

        manager.pushKMZFileToAircraft(
            path,
            object :
                CommonCallbacks.CompletionCallbackWithProgress<Double> {
                override fun onProgressUpdate(progress: Double) {
                    update {
                        copy(
                            uploadState = "uploading",
                            uploadProgress = progress
                        )
                    }
                }

                override fun onSuccess() {
                    uploading.set(false)
                    update {
                        copy(
                            uploadState = "uploaded",
                            uploadProgress = 1.0,
                            uploadedAt = System.currentTimeMillis(),
                            lastError = null
                        )
                    }
                    onResult(Result.success(Unit))
                }

                override fun onFailure(error: IDJIError) {
                    uploading.set(false)
                    update {
                        copy(
                            uploadState = "error",
                            lastError = error.toString()
                        )
                    }
                    onResult(
                        Result.failure(
                            IllegalStateException(error.toString())
                        )
                    )
                }
            }
        )
    }

    fun clearSelection() {
        if (uploading.get()) return
        snapshot.selectedFilePath
            ?.let(::File)
            ?.takeIf(File::exists)
            ?.delete()

        update { WaylineMissionSnapshot() }
    }

    fun addListener(
        listener: (WaylineMissionSnapshot) -> Unit
    ) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (WaylineMissionSnapshot) -> Unit
    ) {
        listeners -= listener
    }

    private fun queryDisplayName(
        context: Context,
        uri: Uri
    ): String? {
        val cursor = context.contentResolver.query(
            uri,
            arrayOf(android.provider.OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null
        ) ?: return null

        return cursor.use {
            if (!it.moveToFirst()) return@use null
            val index =
                it.getColumnIndex(
                    android.provider.OpenableColumns.DISPLAY_NAME
                )
            if (index < 0) null else it.getString(index)
        }
    }

    private fun sanitizeFileName(value: String): String =
        value.replace(Regex("[^A-Za-z0-9._-]"), "_")
            .take(120)
            .ifBlank { "fh2-wayline.kmz" }

    private inline fun update(
        transform: WaylineMissionSnapshot.() ->
            WaylineMissionSnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
