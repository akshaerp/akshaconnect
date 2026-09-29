package com.akshaerp.akshaconnect

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

class AkshaConnectClipboardModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val CLIPBOARD_DIRECTORY = "akshaconnect-clipboard"
    private const val MAX_RETAINED_IMAGES = 8
  }

  override fun getName(): String = "AkshaConnectClipboard"

  @ReactMethod
  fun setText(value: String) {
    val clipboard =
      reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE)
        as ClipboardManager

    clipboard.setPrimaryClip(
      ClipData.newPlainText("AkshaConnect message", value),
    )
  }

  private fun normalizedImageType(value: String): String {
    val candidate =
      value.substringBefore(';').trim().lowercase()

    if (!candidate.startsWith("image/")) {
      throw IllegalArgumentException(
        "Only image content can be copied with setImage.",
      )
    }

    return candidate
  }

  private fun safeClipboardName(
    requestedName: String,
    contentType: String,
  ): String {
    val extension = when (contentType) {
      "image/jpeg" -> ".jpg"
      "image/png" -> ".png"
      "image/webp" -> ".webp"
      else -> ".img"
    }

    val raw =
      requestedName
        .ifBlank { "akshaconnect-image$extension" }
        .replace(Regex("[^A-Za-z0-9._-]"), "_")
        .takeLast(160)

    return if (raw.contains('.')) raw else "$raw$extension"
  }

  private fun pruneOldClipboardImages(
    directory: File,
    keep: File,
  ) {
    val candidates =
      directory.listFiles()
        ?.filter { it.isFile && it != keep }
        ?.sortedByDescending { it.lastModified() }
        ?: return

    candidates
      .drop(MAX_RETAINED_IMAGES - 1)
      .forEach { old -> runCatching { old.delete() } }
  }

  private fun verifyReadableUri(uri: Uri) {
    reactApplicationContext.contentResolver
      .openInputStream(uri)
      ?.use { stream ->
        if (stream.read() == -1) {
          throw IllegalStateException(
            "The copied image is empty.",
          )
        }
      }
      ?: throw IllegalStateException(
        "The copied image could not be opened through Android content sharing.",
      )
  }

  @ReactMethod
  fun setImage(
    sourcePath: String,
    contentType: String,
    fileName: String,
    promise: Promise,
  ) {
    try {
      val normalizedContentType = normalizedImageType(contentType)
      val source = File(sourcePath)

      if (!source.exists() || !source.isFile || source.length() <= 0L) {
        promise.reject(
          "AKSHACONNECT_CLIPBOARD_IMAGE_MISSING",
          "The image is no longer available for copying.",
        )
        return
      }

      val clipboardDirectory = File(
        reactApplicationContext.cacheDir,
        CLIPBOARD_DIRECTORY,
      )

      if (!clipboardDirectory.exists() && !clipboardDirectory.mkdirs()) {
        promise.reject(
          "AKSHACONNECT_CLIPBOARD_CACHE_FAILED",
          "Could not prepare the image clipboard cache.",
        )
        return
      }

      val safeName = safeClipboardName(
        fileName,
        normalizedContentType,
      )

      val destination = File(
        clipboardDirectory,
        "${System.currentTimeMillis()}-$safeName",
      )

      FileInputStream(source).use { input ->
        destination.outputStream().use { output ->
          input.copyTo(output)
          output.flush()
        }
      }

      if (destination.length() != source.length()) {
        runCatching { destination.delete() }
        promise.reject(
          "AKSHACONNECT_CLIPBOARD_IMAGE_COPY_FAILED",
          "Android could not prepare the complete image for the clipboard.",
        )
        return
      }

      val authority =
        "${reactApplicationContext.packageName}.clipboard.fileprovider"

      val uri = FileProvider.getUriForFile(
        reactApplicationContext,
        authority,
        destination,
      )

      // This verifies that FileProvider and its configured cache path are both
      // correct before the URI is handed to Android's clipboard service.
      verifyReadableUri(uri)

      val clipboard =
        reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE)
          as ClipboardManager

      // ClipData.newUri is intentional. Android can then inspect the provider
      // MIME type and transfer temporary URI read permission to a paste target.
      // A manually-constructed ClipData URI did not behave consistently across
      // Android clipboard consumers.
      val clip = ClipData.newUri(
        reactApplicationContext.contentResolver,
        safeName,
        uri,
      )

      clipboard.setPrimaryClip(clip)

      val activeClip = clipboard.primaryClip
      val activeUri =
        if (activeClip != null && activeClip.itemCount > 0) {
          activeClip.getItemAt(0).uri
        } else {
          null
        }

      if (activeUri != uri) {
        runCatching { destination.delete() }
        promise.reject(
          "AKSHACONNECT_CLIPBOARD_IMAGE_VERIFY_FAILED",
          "Android did not retain the copied image on the clipboard.",
        )
        return
      }

      // Keep the FileProvider source available after this method returns. The
      // receiving app may request clipboard content later, after our JS cache
      // file has already been deleted.
      pruneOldClipboardImages(clipboardDirectory, destination)

      promise.resolve(uri.toString())
    } catch (error: Exception) {
      promise.reject(
        "AKSHACONNECT_CLIPBOARD_IMAGE_FAILED",
        error.message ?: "Could not copy the image to the clipboard.",
        error,
      )
    }
  }
}
