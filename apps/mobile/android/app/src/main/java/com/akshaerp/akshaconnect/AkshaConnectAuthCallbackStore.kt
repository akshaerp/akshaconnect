package com.akshaerp.akshaconnect

import android.content.Intent
import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

object AkshaConnectAuthCallbackStore {
  private const val TAG = "AkshaConnectAuth"
  private const val CALLBACK_SCHEME = "akshaconnect"
  private const val CALLBACK_HOST = "auth"
  private const val CALLBACK_PATH = "/callback"

  private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

  @Volatile
  private var pendingCallbackUrl: String? = null

  fun capture(intent: Intent?): Boolean {
    val uri = intent?.data ?: return false
    if (!uri.scheme.equals(CALLBACK_SCHEME, ignoreCase = true)) return false
    if (!uri.host.equals(CALLBACK_HOST, ignoreCase = true)) return false
    if (uri.path != CALLBACK_PATH) return false

    val callbackUrl = uri.toString()
    pendingCallbackUrl = callbackUrl
    Log.i(TAG, "Mobile auth callback captured.")
    notifyPending()
    return true
  }

  fun peek(): String? = pendingCallbackUrl

  fun notifyPending(): Boolean {
    val callbackUrl = pendingCallbackUrl ?: return false
    Log.i(TAG, "Notifying ${listeners.size} native callback listener(s).")

    listeners.forEach { listener ->
      try {
        listener(callbackUrl)
      } catch (error: RuntimeException) {
        Log.w(TAG, "Mobile auth callback listener failed; callback remains pending.", error)
      }
    }

    return true
  }

  @Synchronized
  fun acknowledge(callbackUrl: String?): Boolean {
    val pending = pendingCallbackUrl ?: return false
    if (callbackUrl.isNullOrBlank() || callbackUrl != pending) return false

    pendingCallbackUrl = null
    Log.i(TAG, "Mobile auth callback acknowledged and cleared.")
    return true
  }

  fun addListener(listener: (String) -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: (String) -> Unit) {
    listeners.remove(listener)
  }
}
