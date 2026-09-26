package com.akshaerp.akshaconnect

import android.content.Intent
import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "AkshaConnectMobile"

  override fun onCreate(savedInstanceState: Bundle?) {
    // Cold-start callbacks are captured before React Native initializes.
    AkshaConnectAuthCallbackStore.capture(intent)
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent) {
    // Warm/resumed browser callbacks are persisted independently of React Native Linking.
    AkshaConnectAuthCallbackStore.capture(intent)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    // Native lifecycle retry: do not depend on React Native AppState/focus delivery.
    AkshaConnectAuthCallbackStore.notifyPending()
  }

  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
