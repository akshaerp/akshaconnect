package com.akshaerp.akshaconnect

import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AkshaConnectAppInfoModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "AkshaConnectAppInfo"

  @ReactMethod
  fun getVersion(promise: Promise) {
    try {
      val packageInfo =
        reactApplicationContext.packageManager.getPackageInfo(
          reactApplicationContext.packageName,
          0,
        )

      val result = Arguments.createMap()
      val versionCode =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          packageInfo.longVersionCode
        } else {
          @Suppress("DEPRECATION")
          packageInfo.versionCode.toLong()
        }

      result.putDouble("versionCode", versionCode.toDouble())
      result.putString("versionName", packageInfo.versionName ?: "")
      promise.resolve(result)
    } catch (error: Exception) {
      promise.reject(
        "AKSHACONNECT_APP_INFO_FAILED",
        "Could not read AkshaConnect application version.",
        error,
      )
    }
  }
}
