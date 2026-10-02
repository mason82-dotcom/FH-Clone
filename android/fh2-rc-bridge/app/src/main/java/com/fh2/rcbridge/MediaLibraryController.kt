package com.fh2.rcbridge

import android.content.Context
import dji.sdk.keyvalue.value.common.ComponentIndexType
import dji.v5.common.callback.CommonCallbacks
import dji.v5.common.error.IDJIError
import dji.v5.manager.datacenter.MediaDataCenter
import dji.v5.manager.datacenter.media.MediaFile
import dji.v5.manager.datacenter.media.MediaFileDownloadListener
import dji.v5.manager.datacenter.media.MediaFileListDataSource
import dji.v5.manager.datacenter.media.MediaFileListState
import dji.v5.manager.datacenter.media.MediaFileListStateListener
import dji.v5.manager.datacenter.media.PullMediaFileListParam
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicBoolean

data class MediaItemSnapshot(
    val fileIndex: Int,
    val fileName: String
)

data class MediaLibrarySnapshot(
    val enabled: Boolean = false,
    val listState: String = "idle",
    val items: List<MediaItemSnapshot> = emptyList(),
    val downloadingFile: String? = null,
    val downloadProgress: Double? = null,
    val lastDownloadPath: String? = null,
    val uploadingFile: String? = null,
    val uploadProgress: Double? = null,
    val lastUploadedAssetId: String? = null,
    val lastUploadedObjectKey: String? = null,
    val lastError: String? = null
)

object MediaLibraryController {
    private val manager
        get() = MediaDataCenter.getInstance().mediaManager

    private val active = AtomicBoolean(false)
    private val uploadActive = AtomicBoolean(false)
    private val listeners =
        CopyOnWriteArrayList<(MediaLibrarySnapshot) -> Unit>()

    private val filesByIndex = linkedMapOf<Int, MediaFile>()

    @Volatile
    var snapshot = MediaLibrarySnapshot()
        private set

    private var activeDownload: MediaFile? = null
    private var activeOutput: BufferedOutputStream? = null

    @Volatile
    private var lastDownloadedFileIndex: Int? = null

    private val stateListener =
        object : MediaFileListStateListener {
            override fun onUpdate(state: MediaFileListState) {
                update {
                    copy(listState = state.name)
                }

                if (state == MediaFileListState.UP_TO_DATE) {
                    val files = manager.mediaFileListData.data
                    filesByIndex.clear()
                    files.forEach { file ->
                        filesByIndex[file.fileIndex] = file
                    }

                    update {
                        copy(
                            items = files.map { file ->
                                MediaItemSnapshot(
                                    fileIndex = file.fileIndex,
                                    fileName = file.fileName
                                )
                            },
                            lastError = null
                        )
                    }
                }
            }
        }

    fun start(
        index: ComponentIndexType =
            ComponentIndexType.LEFT_OR_MAIN
    ) {
        if (!active.compareAndSet(false, true)) return

        manager.setMediaFileDataSource(
            MediaFileListDataSource.Builder()
                .setIndexType(index)
                .build()
        )
        manager.addMediaFileListStateListener(stateListener)

        manager.enable(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    update {
                        copy(
                            enabled = true,
                            lastError = null
                        )
                    }
                    refresh()
                }

                override fun onFailure(error: IDJIError) {
                    runCatching {
                        manager.removeAllMediaFileListStateListener()
                    }
                    filesByIndex.clear()
                    active.set(false)
                    update {
                        copy(
                            enabled = false,
                            lastError = error.toString()
                        )
                    }
                }
            }
        )
    }

    fun refresh(
        firstIndex: Int = 0,
        count: Int = 100
    ) {
        if (!active.get()) return

        manager.pullMediaFileListFromCamera(
            PullMediaFileListParam.Builder()
                .mediaFileIndex(firstIndex.coerceAtLeast(0))
                .count(count.coerceIn(1, 500))
                .build(),
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() {
                    update { copy(lastError = null) }
                }

                override fun onFailure(error: IDJIError) {
                    update {
                        copy(lastError = error.toString())
                    }
                }
            }
        )
    }

    fun download(
        context: Context,
        fileIndex: Int
    ) {
        check(activeDownload == null) {
            "media_download_in_progress"
        }
        check(!uploadActive.get()) {
            "media_upload_in_progress"
        }

        val mediaFile =
            filesByIndex[fileIndex]
                ?: error("media_file_not_found")

        val directory =
            requireNotNull(context.getExternalFilesDir("media")) {
                "external_media_storage_unavailable"
            }

        if (!directory.exists() && !directory.mkdirs()) {
            error("media_directory_create_failed")
        }

        val target = File(
            directory,
            sanitizeFileName(mediaFile.fileName)
        )

        val output =
            BufferedOutputStream(
                FileOutputStream(target, false)
            )

        activeDownload = mediaFile
        activeOutput = output
        lastDownloadedFileIndex = null

        update {
            copy(
                downloadingFile = mediaFile.fileName,
                downloadProgress = 0.0,
                lastDownloadPath = null,
                lastError = null
            )
        }

        mediaFile.pullOriginalMediaFileFromCamera(
            0L,
            object : MediaFileDownloadListener {
                override fun onStart() = Unit

                override fun onProgress(
                    total: Long,
                    current: Long
                ) {
                    val progress =
                        if (total > 0L) {
                            current.toDouble() / total.toDouble()
                        } else {
                            0.0
                        }

                    update {
                        copy(
                            downloadProgress =
                                progress.coerceIn(0.0, 1.0)
                        )
                    }
                }

                override fun onRealtimeDataUpdate(
                    data: ByteArray,
                    position: Long
                ) {
                    activeOutput?.apply {
                        write(data)
                        flush()
                    }
                }

                override fun onFinish() {
                    closeDownloadOutput()
                    activeDownload = null
                    lastDownloadedFileIndex = fileIndex
                    update {
                        copy(
                            downloadingFile = null,
                            downloadProgress = 1.0,
                            lastDownloadPath = target.absolutePath,
                            lastError = null
                        )
                    }
                }

                override fun onFailure(error: IDJIError?) {
                    closeDownloadOutput()
                    activeDownload = null
                    target.delete()
                    update {
                        copy(
                            downloadingFile = null,
                            downloadProgress = null,
                            lastError = error?.toString()
                                ?: "media_download_failed"
                        )
                    }
                }
            }
        )
    }

    fun uploadLastDownload() {
        check(activeDownload == null) {
            "media_download_in_progress"
        }
        check(uploadActive.compareAndSet(false, true)) {
            "media_upload_in_progress"
        }

        val path = snapshot.lastDownloadPath
        val fileIndex = lastDownloadedFileIndex
        if (path == null || fileIndex == null) {
            uploadActive.set(false)
            error("media_download_required")
        }

        val file = File(path)
        if (!file.isFile || file.length() <= 0L) {
            uploadActive.set(false)
            error("media_download_missing")
        }

        update {
            copy(
                uploadingFile = file.name,
                uploadProgress = 0.0,
                lastError = null
            )
        }

        Fh2BridgeClient.uploadMedia(
            file = file,
            fileIndex = fileIndex,
            onProgress = { progress ->
                update {
                    copy(
                        uploadingFile = file.name,
                        uploadProgress =
                            progress.coerceIn(0.0, 1.0)
                    )
                }
            },
            onResult = { result ->
                uploadActive.set(false)
                result.onSuccess { uploaded ->
                    update {
                        copy(
                            uploadingFile = null,
                            uploadProgress = 1.0,
                            lastUploadedAssetId = uploaded.assetId,
                            lastUploadedObjectKey = uploaded.objectKey,
                            lastError = null
                        )
                    }
                }.onFailure { error ->
                    update {
                        copy(
                            uploadingFile = null,
                            uploadProgress = null,
                            lastError =
                                "media_upload_failed:" +
                                    (error.message ?: error.toString())
                        )
                    }
                }
            }
        )
    }

    fun stop() {
        if (!active.getAndSet(false)) return

        activeDownload?.stopPullOriginalMediaFileFromCamera(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() = Unit
                override fun onFailure(error: IDJIError) = Unit
            }
        )
        activeDownload = null
        closeDownloadOutput()

        manager.stopPullMediaFileListFromCamera()
        manager.removeAllMediaFileListStateListener()
        manager.disable(
            object : CommonCallbacks.CompletionCallback {
                override fun onSuccess() = Unit
                override fun onFailure(error: IDJIError) = Unit
            }
        )

        filesByIndex.clear()
        update {
            MediaLibrarySnapshot()
        }
    }

    fun addListener(
        listener: (MediaLibrarySnapshot) -> Unit
    ) {
        listeners += listener
        listener(snapshot)
    }

    fun removeListener(
        listener: (MediaLibrarySnapshot) -> Unit
    ) {
        listeners -= listener
    }

    private fun closeDownloadOutput() {
        runCatching {
            activeOutput?.flush()
            activeOutput?.close()
        }
        activeOutput = null
    }

    private fun sanitizeFileName(value: String): String =
        value.replace(Regex("[^A-Za-z0-9._-]"), "_")
            .take(160)
            .ifBlank { "dji-media.bin" }

    private inline fun update(
        transform: MediaLibrarySnapshot.() ->
            MediaLibrarySnapshot
    ) {
        snapshot = snapshot.transform()
        val current = snapshot
        listeners.forEach { it(current) }
    }
}
