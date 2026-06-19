package xyz.seer2.nextclient.tauri

import android.app.AlertDialog
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var loadFailureDialog: AlertDialog? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    enterImmersiveMode()
    showHealthAdvice()
  }

  override fun onResume() {
    super.onResume()
    enterImmersiveMode()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      enterImmersiveMode()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.setBackgroundColor(Color.BLACK)
    webView.addJavascriptInterface(AndroidBridge(this), "AndroidSeer2")
  }

  private fun enterImmersiveMode() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    WindowInsetsControllerCompat(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.systemBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  private fun showHealthAdvice() {
    val overlay = TextView(this).apply {
      text = HEALTH_ADVICE_TEXT
      setTextColor(Color.WHITE)
      setBackgroundColor(Color.BLACK)
      gravity = Gravity.CENTER
      textSize = 20f
      setLineSpacing(4f, 1.0f)
      isClickable = true
      isFocusable = true
    }
    val params = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    addContentView(overlay, params)
    overlay.bringToFront()
    mainHandler.postDelayed({
      (overlay.parent as? ViewGroup)?.removeView(overlay)
      enterImmersiveMode()
    }, HEALTH_ADVICE_DURATION_MS)
  }

  private fun showLoadFailureDialog(message: String) {
    if (isFinishing || isDestroyed || loadFailureDialog?.isShowing == true) {
      return
    }
    val text = message.ifBlank { LOAD_FAILED_FALLBACK }
    loadFailureDialog = AlertDialog.Builder(this)
      .setTitle(LOAD_FAILED_TITLE)
      .setMessage(text)
      .setPositiveButton(CONFIRM_TEXT) { dialog, _ ->
        dialog.dismiss()
        finishGame()
      }
      .setOnCancelListener {
        finishGame()
      }
      .create()
    loadFailureDialog?.show()
  }

  private fun finishGame() {
    if (!isFinishing) {
      finishAndRemoveTask()
    }
  }

  class AndroidBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun exitGame() {
      activity.runOnUiThread {
        activity.finishGame()
      }
    }

    @JavascriptInterface
    fun showLoadFailureAndExit(message: String) {
      activity.runOnUiThread {
        activity.showLoadFailureDialog(message)
      }
    }
  }

  private companion object {
    const val HEALTH_ADVICE_DURATION_MS = 3000L
    const val HEALTH_ADVICE_TEXT =
      "\u6e38\u620f\u5065\u5eb7\u5fe0\u544a\n\n" +
        "\u62b5\u5236\u4e0d\u826f\u6e38\u620f\uff0c\u62d2\u7edd\u76d7\u7248\u6e38\u620f\u3002\n" +
        "\u6ce8\u610f\u81ea\u6211\u4fdd\u62a4\uff0c\u8c28\u9632\u53d7\u9a97\u4e0a\u5f53\u3002\n" +
        "\u9002\u5ea6\u6e38\u620f\u76ca\u8111\uff0c\u6c89\u8ff7\u6e38\u620f\u4f24\u8eab\u3002\n" +
        "\u5408\u7406\u5b89\u6392\u65f6\u95f4\uff0c\u4eab\u53d7\u5065\u5eb7\u751f\u6d3b\u3002"
    const val LOAD_FAILED_TITLE = "\u6e38\u620f\u52a0\u8f7d\u5931\u8d25"
    const val LOAD_FAILED_FALLBACK =
      "\u6e38\u620f\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u7f51\u7edc\u540e\u91cd\u8bd5\u3002"
    const val CONFIRM_TEXT = "\u786e\u5b9a"
  }
}
