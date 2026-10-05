package com.akshaerp.akshaconnect

import android.content.ClipData
import android.content.Intent
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileInputStream

class AkshaConnectMediaModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AkshaConnectMedia"

  @ReactMethod
  fun shareRemoteImage(
    remoteUrl: String,
    bearerToken: String,
    contentType: String,
    fileName: String,
    promise: Promise,
  ) {
    try {
      if (remoteUrl.isBlank() || bearerToken.isBlank()) {
        promise.reject(
          "AKSHACONNECT_REMOTE_SHARE_INVALID",
          "The image share session is unavailable.",
        )
        return
      }

      val authority =
        "${reactApplicationContext.packageName}.remote-share"

      val uri =
        AkshaConnectRemoteShareRegistry.register(
          authority = authority,
          remoteUrl = remoteUrl,
          bearerToken = bearerToken,
          contentType = contentType.ifBlank { "image/*" },
          fileName = fileName.ifBlank { "akshaconnect-image" },
        )

      val sendIntent =
        Intent(Intent.ACTION_SEND).apply {
          type = contentType.ifBlank { "image/*" }
          putExtra(Intent.EXTRA_STREAM, uri)
          clipData = ClipData.newRawUri(fileName, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

      val chooser =
        Intent.createChooser(
          sendIntent,
          "Share image",
        ).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }

      reactApplicationContext.startActivity(chooser)
      promise.resolve(uri.toString())
    } catch (error: Exception) {
      promise.reject(
        "AKSHACONNECT_REMOTE_SHARE_FAILED",
        error.message ?: "Could not open Android sharing.",
        error,
      )
    }
  }

  @ReactMethod
  fun shareFile(
    sourcePath: String,
    contentType: String,
    fileName: String,
    promise: Promise,
  ) {
    try {
      val source = File(sourcePath)

      if (!source.exists() || !source.isFile || source.length() <= 0L) {
        promise.reject(
          "AKSHACONNECT_SHARE_FILE_MISSING",
          "The image is no longer available for sharing.",
        )
        return
      }

      val directory =
        File(
          reactApplicationContext.cacheDir,
          "akshaconnect-share",
        )

      if (!directory.exists() && !directory.mkdirs()) {
        promise.reject(
          "AKSHACONNECT_SHARE_CACHE_FAILED",
          "Could not prepare image sharing.",
        )
        return
      }

      val safeName =
        fileName
          .ifBlank {
            "akshaconnect-image"
          }
          .replace(
            Regex("[^A-Za-z0-9._-]"),
            "_",
          )
          .takeLast(180)

      val destination =
        File(
          directory,
          "${System.currentTimeMillis()}-$safeName",
        )

      FileInputStream(source).use { input ->
        destination.outputStream().use { output ->
          input.copyTo(output)
          output.flush()
        }
      }

      val uri =
        FileProvider.getUriForFile(
          reactApplicationContext,
          "${reactApplicationContext.packageName}.clipboard.fileprovider",
          destination,
        )

      val sendIntent =
        Intent(
          Intent.ACTION_SEND,
        ).apply {
          type =
            contentType
              .ifBlank {
                "image/*"
              }

          putExtra(
            Intent.EXTRA_STREAM,
            uri,
          )

          clipData =
            ClipData.newRawUri(
              safeName,
              uri,
            )

          addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
          )
        }

      val chooser =
        Intent.createChooser(
          sendIntent,
          "Share image",
        ).apply {
          addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK,
          )

          addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION,
          )
        }

      reactApplicationContext
        .startActivity(
          chooser
        )

      promise.resolve(
        uri.toString()
      )
    } catch (
      error: Exception
    ) {
      promise.reject(
        "AKSHACONNECT_SHARE_FAILED",
        error.message
          ?: "Could not share the image.",
        error,
      )
    }
  }
}
