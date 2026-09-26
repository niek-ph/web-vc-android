package com.webvcandroid.browser

import android.graphics.Bitmap
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.facebook.react.uimanager.ThemedReactContext
import com.reactnativecommunity.webview.RNCWebView
import com.reactnativecommunity.webview.RNCWebViewClient
import com.reactnativecommunity.webview.RNCWebViewManager
import com.reactnativecommunity.webview.RNCWebViewWrapper
import org.json.JSONObject
import java.util.UUID

class MediaWebViewManager : RNCWebViewManager() {
  override fun addEventEmitters(context: ThemedReactContext, wrapper: RNCWebViewWrapper) {
    val view = wrapper.webView
    val script = context.assets.open("media-detector.js").bufferedReader().use { it.readText() }
    val client = MediaClient(script)
    view.webViewClient = client
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(view, "WebVCScanner", setOf("*")) { _, message, _, _, _ ->
        // This bridge accepts discovery data only, never commands or credentials.
        val data = message.data
        if (data != null && data.length <= 262144) {
          try { client.emit(view, JSONObject(data)) } catch (_: Exception) { }
        }
      }
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
      WebViewCompat.addDocumentStartJavaScript(view, script, setOf("*"))
    }
  }

  private class MediaClient(val script: String) : RNCWebViewClient() {
    @Volatile private var generation = UUID.randomUUID().toString()
    private val seen = mutableSetOf<String>()

    fun emit(view: RNCWebView, payload: JSONObject) {
      if (!view.messagingEnabled) return
      view.onMessage(JSONObject().put("channel", "webvc").put("generation", generation)
        .put("pageUrl", view.url).put("payload", payload).toString(), view.url ?: "")
    }

    override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
      generation = UUID.randomUUID().toString()
      seen.clear()
      super.onPageStarted(view, url, favicon)
      emit(view as RNCWebView, JSONObject().put("type", "navigation"))
    }

    override fun onPageFinished(view: WebView, url: String) {
      super.onPageFinished(view, url)
      // Idempotent fallback for older WebViews; scans same-origin subframes too.
      view.evaluateJavascript(script, null)
    }

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
      val url = request.url.toString()
      if (request.method == "GET" && url.length <= 8192 &&
          Regex("\\.(mp4|m4v|webm|m3u8|mpd)([?#]|$)", RegexOption.IGNORE_CASE).containsMatchIn(url)) {
        // Passive observation: leave cookies, redirects, CORS and playback to WebView.
        val requestGeneration = generation
        view.post {
          if (generation == requestGeneration && seen.size < 300 && seen.add(url)) {
            emit(view as RNCWebView, JSONObject().put("type", "media").put("url", url)
              .put("frameUrl", request.requestHeaders["Referer"] ?: view.url).put("source", "network"))
          }
        }
      }
      return super.shouldInterceptRequest(view, request)
    }
  }
}
