package com.akshaerp.akshaconnect

import android.content.Intent
import android.net.Uri
import java.util.concurrent.CopyOnWriteArraySet

object AkshaConnectInboundShareStore {
  data class PendingShare(
    val contentType: String,
    val uris: List<Uri>,
  )

  private val listeners = CopyOnWriteArraySet<() -> Unit>()

  @Volatile
  private var pending: PendingShare? = null

  @Suppress("DEPRECATION")
  fun capture(intent: Intent?): Boolean {
    val value = intent ?: return false
    val action = value.action ?: return false

    val uris =
      when (action) {
        Intent.ACTION_SEND -> {
          listOfNotNull(
            value.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
          )
        }

        Intent.ACTION_SEND_MULTIPLE -> {
          value.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
            ?.filterNotNull()
            ?.take(4)
            ?: emptyList()
        }

        else -> emptyList()
      }

    if (uris.isEmpty()) return false

    val type =
      value.type
        ?.substringBefore(';')
        ?.trim()
        ?.lowercase()
        .orEmpty()

    if (!type.startsWith("image/")) return false

    pending = PendingShare(
      contentType = type,
      uris = uris,
    )

    notifyPending()
    return true
  }

  @Synchronized
  fun take(): PendingShare? {
    val value = pending
    pending = null
    return value
  }

  fun notifyPending() {
    if (pending == null) return
    listeners.forEach { listener ->
      runCatching { listener() }
    }
  }

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
  }
}
