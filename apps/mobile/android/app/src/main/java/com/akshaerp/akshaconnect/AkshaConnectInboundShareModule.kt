package com.akshaerp.akshaconnect

import android.net.Uri
import android.provider.OpenableColumns
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class AkshaConnectInboundShareModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val EVENT_NAME = "AkshaConnectInboundShare"
    private const val CACHE_DIRECTORY = "akshaconnect-inbound-share"
  }

  private val listener: () -> Unit = {
    emitPending()
  }

  override fun getName(): String = "AkshaConnectInboundShare"

  override fun initialize() {
    super.initialize()
    AkshaConnectInboundShareStore.addListener(listener)
    AkshaConnectInboundShareStore.notifyPending()
  }

  override fun invalidate() {
    AkshaConnectInboundShareStore.removeListener(listener)
    super.invalidate()
  }

  private fun emitPending() {
    runCatching {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(EVENT_NAME, true)
    }
  }

  private fun displayName(uri: Uri, fallback: String): String {
    return runCatching {
      reactApplicationContext.contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null,
      )?.use { cursor ->
        if (
          cursor.moveToFirst() &&
          cursor.columnCount > 0
        ) {
          cursor.getString(0)
        } else {
          null
        }
      }
    }.getOrNull()
      ?.takeIf { it.isNotBlank() }
      ?: fallback
  }

  private fun safeName(value: String): String =
    value
      .replace(Regex("[^A-Za-z0-9._-]"), "_")
      .takeLast(180)
      .ifBlank { "shared-image" }

  @ReactMethod
  fun consumePendingShare(promise: Promise) {
    val pending = AkshaConnectInboundShareStore.take()

    if (pending == null) {
      promise.resolve(null)
      return
    }

    Thread {
      try {
        val directory =
          File(
            reactApplicationContext.cacheDir,
            CACHE_DIRECTORY,
          )

        if (!directory.exists() && !directory.mkdirs()) {
          throw IllegalStateException("Could not prepare incoming share cache.")
        }

        val files = Arguments.createArray()

        pending.uris.take(4).forEachIndexed { index, uri ->
          val type =
            reactApplicationContext.contentResolver
              .getType(uri)
              ?.substringBefore(';')
              ?.trim()
              ?.lowercase()
              ?.takeIf { it.startsWith("image/") }
              ?: pending.contentType

          val fallback =
            when (type) {
              "image/png" -> "shared-image-${index + 1}.png"
              "image/webp" -> "shared-image-${index + 1}.webp"
              else -> "shared-image-${index + 1}.jpg"
            }

          val name = safeName(displayName(uri, fallback))
          val destination =
            File(
              directory,
              "${System.currentTimeMillis()}-$index-$name",
            )

          reactApplicationContext.contentResolver
            .openInputStream(uri)
            ?.use { input ->
              destination.outputStream().use { output ->
                input.copyTo(output)
                output.flush()
              }
            }
            ?: throw IllegalStateException("Shared image could not be opened.")

          if (destination.length() <= 0L) {
            runCatching { destination.delete() }
            throw IllegalStateException("Shared image was empty.")
          }

          val map = Arguments.createMap()
          map.putString("localPath", destination.absolutePath)
          map.putString("fileName", name)
          map.putString("contentType", type)
          map.putDouble("sizeBytes", destination.length().toDouble())
          files.pushMap(map)
        }

        val result = Arguments.createMap()
        result.putArray("files", files)
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject(
          "AKSHACONNECT_INBOUND_SHARE_FAILED",
          error.message ?: "Could not prepare the shared image.",
          error,
        )
      }
    }.start()
  }

  @ReactMethod
  fun cleanupFiles(paths: ReadableArray, promise: Promise) {
    try {
      val root =
        File(
          reactApplicationContext.cacheDir,
          CACHE_DIRECTORY,
        ).canonicalFile

      for (index in 0 until paths.size()) {
        val value = paths.getString(index) ?: continue
        val file = File(value).canonicalFile

        if (
          file.path.startsWith(root.path) &&
          file.isFile
        ) {
          runCatching { file.delete() }
        }
      }

      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject(
        "AKSHACONNECT_INBOUND_CLEANUP_FAILED",
        error.message ?: "Could not clean shared image cache.",
        error,
      )
    }
  }
}
