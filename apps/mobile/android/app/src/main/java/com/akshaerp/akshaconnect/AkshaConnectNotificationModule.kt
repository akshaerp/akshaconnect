package com.akshaerp.akshaconnect

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AkshaConnectNotificationModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val CONVERSATION_TAG_PREFIX =
      "akshaconnect-conversation-"
  }

  override fun getName(): String =
    "AkshaConnectNotifications"

  @ReactMethod
  fun clearConversation(
    conversationId: String,
    promise: Promise,
  ) {
    try {
      val cleanId = conversationId.trim()

      if (cleanId.isEmpty()) {
        promise.resolve(0)
        return
      }

      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(0)
        return
      }

      val manager =
        reactApplicationContext
          .getSystemService(Context.NOTIFICATION_SERVICE)
          as NotificationManager

      val expectedTag =
        "$CONVERSATION_TAG_PREFIX$cleanId"

      var cancelled = 0

      manager.activeNotifications
        .filter { item ->
          item.tag == expectedTag
        }
        .forEach { item ->
          manager.cancel(
            item.tag,
            item.id,
          )
          cancelled += 1
        }

      promise.resolve(cancelled)
    } catch (error: Exception) {
      promise.reject(
        "AKSHACONNECT_NOTIFICATION_CLEAR_FAILED",
        error.message
          ?: "Could not clear conversation notifications.",
        error,
      )
    }
  }
}
