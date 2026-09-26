package com.akshaerp.akshaconnect

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class AkshaConnectAuthBridgeModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val TAG = "AkshaConnectAuth"
    private const val CALLBACK_EVENT = "AkshaConnectAuthCallback"
  }

  private val callbackListener: (String) -> Unit = { callbackUrl ->
    emitCallback(callbackUrl)
  }

  override fun getName(): String = "AkshaConnectAuthBridge"

  override fun initialize() {
    super.initialize()
    AkshaConnectAuthCallbackStore.addListener(callbackListener)
    Log.i(TAG, "Native mobile auth callback bridge initialized.")
    AkshaConnectAuthCallbackStore.notifyPending()
  }

  override fun invalidate() {
    AkshaConnectAuthCallbackStore.removeListener(callbackListener)
    Log.i(TAG, "Native mobile auth callback bridge invalidated.")
    super.invalidate()
  }

  private fun emitCallback(callbackUrl: String) {
    try {
      reactApplicationContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(CALLBACK_EVENT, callbackUrl)
      Log.i(TAG, "Mobile auth callback event emitted to React Native.")
    } catch (error: RuntimeException) {
      Log.w(TAG, "React Native callback event unavailable; callback remains pending.", error)
    }
  }

  @ReactMethod
  fun getPendingCallback(promise: Promise) {
    promise.resolve(AkshaConnectAuthCallbackStore.peek())
  }

  @ReactMethod
  fun acknowledgePendingCallback(callbackUrl: String, promise: Promise) {
    promise.resolve(AkshaConnectAuthCallbackStore.acknowledge(callbackUrl))
  }
}
