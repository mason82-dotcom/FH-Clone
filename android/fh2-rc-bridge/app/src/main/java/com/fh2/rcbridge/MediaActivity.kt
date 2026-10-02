package com.fh2.rcbridge

import android.os.Bundle
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class MediaActivity : AppCompatActivity() {
    private lateinit var statusText: TextView
    private lateinit var listView: ListView
    private lateinit var uploadButton: Button

    private var items: List<MediaItemSnapshot> = emptyList()

    private val listener: (MediaLibrarySnapshot) -> Unit = { state ->
        runOnUiThread {
            items = state.items

            listView.adapter =
                ArrayAdapter(
                    this,
                    android.R.layout.simple_list_item_1,
                    items.map { item ->
                        "#${item.fileIndex} · ${item.fileName}"
                    }
                )

            val progress =
                state.downloadProgress?.let {
                    String.format("%.1f%%", it * 100.0)
                } ?: "-"
            val uploadProgress =
                state.uploadProgress?.let {
                    String.format("%.1f%%", it * 100.0)
                } ?: "-"

            uploadButton.isEnabled =
                state.lastDownloadPath != null &&
                    state.uploadingFile == null &&
                    Fh2BridgeClient.snapshot.status == "paired"

            statusText.text = buildString {
                appendLine("DJI Media")
                appendLine("Enabled: ${state.enabled}")
                appendLine("List state: ${state.listState}")
                appendLine("Dateien: ${state.items.size}")
                appendLine(
                    "Download: ${state.downloadingFile ?: "-"} · $progress"
                )
                state.lastDownloadPath?.let {
                    appendLine("Gespeichert: $it")
                }
                appendLine(
                    "FH2 Upload: ${state.uploadingFile ?: "-"} · $uploadProgress"
                )
                state.lastUploadedAssetId?.let {
                    appendLine("FH2 Asset: $it")
                }
                state.lastUploadedObjectKey?.let {
                    appendLine("Object-Key: $it")
                }
                state.lastError?.let {
                    append("Fehler: $it")
                }
            }.trimEnd()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusText = TextView(this).apply {
            textSize = 16f
        }

        listView = ListView(this).apply {
            setOnItemClickListener { _, _, position, _ ->
                val item = items.getOrNull(position)
                    ?: return@setOnItemClickListener

                runCatching {
                    MediaLibraryController.download(
                        this@MediaActivity,
                        item.fileIndex
                    )
                }.onFailure { error ->
                    Toast.makeText(
                        this@MediaActivity,
                        "Download fehlgeschlagen: ${error.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        val refreshButton = Button(this).apply {
            text = "Medien aktualisieren"
            setOnClickListener {
                MediaLibraryController.refresh()
            }
        }


        uploadButton = Button(this).apply {
            text = "Letzten Download zu FH2 hochladen"
            isEnabled = false
            setOnClickListener {
                runCatching {
                    MediaLibraryController.uploadLastDownload()
                }.onFailure { error ->
                    Toast.makeText(
                        this@MediaActivity,
                        "FH2 Upload fehlgeschlagen: ${error.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 16, 16, 16)

            addView(
                statusText,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                refreshButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                uploadButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
            addView(
                listView,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                )
            )
        }

        setContentView(root)

        MediaLibraryController.addListener(listener)
        MediaLibraryController.start()
    }

    override fun onDestroy() {
        MediaLibraryController.removeListener(listener)
        MediaLibraryController.stop()
        super.onDestroy()
    }
}
