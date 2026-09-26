package com.webvcandroid.browser

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.reactnativecommunity.webview.RNCWebViewPackage

/** Retain the upstream module and Fabric component; customize only its manager. */
class MediaWebViewPackage : RNCWebViewPackage() {
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
    listOf(MediaWebViewManager())
}
