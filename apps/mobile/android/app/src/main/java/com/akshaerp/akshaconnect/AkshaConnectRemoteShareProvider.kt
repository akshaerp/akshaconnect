package com.akshaerp.akshaconnect

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

object AkshaConnectRemoteShareRegistry {
  data class Entry(
    val id: String,
    val remoteUrl: String,
    val bearerToken: String,
    val contentType: String,
    val fileName: String,
    val createdAt: Long,
  )

  private const val MAX_AGE_MS = 15L * 60L * 1000L
  private val entries = ConcurrentHashMap<String, Entry>()

  fun register(
    authority: String,
    remoteUrl: String,
    bearerToken: String,
    contentType: String,
    fileName: String,
  ): Uri {
    prune()

    val id = UUID.randomUUID().toString()
    entries[id] = Entry(
      id = id,
      remoteUrl = remoteUrl,
      bearerToken = bearerToken,
      contentType = contentType.ifBlank { "image/*" },
      fileName = fileName.ifBlank { "akshaconnect-image" },
      createdAt = System.currentTimeMillis(),
    )

    return Uri.parse("content://$authority/$id")
  }

  fun get(id: String?): Entry? {
    prune()
    return id?.let(entries::get)
  }

  private fun prune() {
    val cutoff = System.currentTimeMillis() - MAX_AGE_MS
    entries.entries.removeIf { (_, entry) ->
      entry.createdAt < cutoff
    }
  }
}

class AkshaConnectRemoteShareProvider : ContentProvider() {

  private fun entry(uri: Uri): AkshaConnectRemoteShareRegistry.Entry =
    AkshaConnectRemoteShareRegistry.get(uri.lastPathSegment)
      ?: throw IllegalArgumentException("Remote share is no longer available.")

  override fun onCreate(): Boolean = true

  override fun getType(uri: Uri): String = entry(uri).contentType

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor {
    val item = entry(uri)
    val columns =
      projection
        ?.takeIf { it.isNotEmpty() }
        ?: arrayOf(
          OpenableColumns.DISPLAY_NAME,
          OpenableColumns.SIZE,
        )

    val cursor = MatrixCursor(columns)
    val row = cursor.newRow()

    columns.forEach { column ->
      when (column) {
        OpenableColumns.DISPLAY_NAME -> row.add(item.fileName)
        OpenableColumns.SIZE -> row.add(null)
        else -> row.add(null)
      }
    }

    return cursor
  }

  override fun openFile(
    uri: Uri,
    mode: String,
  ): ParcelFileDescriptor {
    if (!mode.contains("r")) {
      throw IllegalArgumentException("Remote shares are read-only.")
    }

    val item = entry(uri)
    val pipe = ParcelFileDescriptor.createPipe()
    val reader = pipe[0]
    val writer = pipe[1]

    thread(
      name = "AkshaConnectRemoteShare",
      isDaemon = true,
    ) {
      try {
        val connection =
          (URL(item.remoteUrl).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", item.contentType)
            setRequestProperty("Authorization", "Bearer ${item.bearerToken}")
          }

        try {
          val status = connection.responseCode
          if (status !in 200..299) {
            throw IllegalStateException("Attachment download failed ($status).")
          }

          connection.inputStream.use { input ->
            ParcelFileDescriptor.AutoCloseOutputStream(writer).use { output ->
              input.copyTo(output)
              output.flush()
            }
          }
        } finally {
          connection.disconnect()
        }
      } catch (_: Exception) {
        runCatching { writer.closeWithError("Could not stream AkshaConnect image.") }
      }
    }

    return reader
  }

  override fun insert(uri: Uri, values: ContentValues?): Uri? =
    throw UnsupportedOperationException("Read-only provider.")

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0

  override fun delete(
    uri: Uri,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = 0
}
