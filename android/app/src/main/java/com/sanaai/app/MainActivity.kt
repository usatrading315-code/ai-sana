package com.sanaai.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.sanaai.app.bridge.SanaBridge
import com.sanaai.app.voice.SpeechInputController
import com.sanaai.app.voice.TtsController
import org.json.JSONObject
import java.net.URI

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var speech: SpeechInputController
    private lateinit var tts: TtsController
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        callJs("onPermission", if (granted) "granted" else "denied")
        if (!granted) {
            callJs("onError", "Microphone permission is off. You can still type to Sana.")
        }
    }

    private val fileChooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileCallback
        fileCallback = null
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        callback?.onReceiveValue(uris)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        speech = SpeechInputController(
            activity = this,
            onPartial = { callJs("onPartial", it) },
            onFinal = { callJs("onFinal", it) },
            onError = { callJs("onError", it) },
            onEnd = { callJs("onEnd", "") },
        )
        tts = TtsController(
            context = this,
            onStart = { callJs("onTtsStart", "") },
            onDone = { callJs("onTtsDone", "") },
            onError = { callJs("onTtsError", it) },
        )
        tts.init()
        tts.setPreferredVoice(prefs().getString(KEY_VOICE, null))

        val bridge = SanaBridge(this, speech, tts)
        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = true
            allowContentAccess = true
            useWideViewPort = true
            loadWithOverviewMode = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mixedContentMode = if (BuildConfig.DEBUG) {
                WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            } else {
                WebSettings.MIXED_CONTENT_NEVER_ALLOW
            }
            @Suppress("DEPRECATION")
            allowUniversalAccessFromFileURLs = true
        }
        webView.addJavascriptInterface(bridge, "SanaNative")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url ?: return false
                val scheme = uri.scheme.orEmpty()
                if (scheme == "file" || scheme == "about") return false
                val apiHost = runCatching { URI(apiBase()).host }.getOrNull()
                if (uri.host != null && uri.host == apiHost) return false
                if (scheme == "http" || scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    return true
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                view.evaluateJavascript(
                    "window.SanaApp && window.SanaApp.onNativeReady && window.SanaApp.onNativeReady();",
                    null
                )
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = filePathCallback
                val intent = try {
                    fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                    }
                } catch (_: Exception) {
                    fileCallback = null
                    return false
                }
                return try {
                    fileChooser.launch(Intent.createChooser(intent, getString(R.string.attach_title)))
                    true
                } catch (_: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(
                    "(function(){return !!(window.SanaApp && window.SanaApp.handleBack && window.SanaApp.handleBack());})()"
                ) { result ->
                    if (result != "true") finish()
                }
            }
        })

        webView.loadUrl("file:///android_asset/www/index.html")
    }

    fun callJs(fn: String, arg: String) {
        val quoted = JSONObject.quote(arg)
        webView.post {
            webView.evaluateJavascript("window.SanaVoice && window.SanaVoice.$fn && window.SanaVoice.$fn($quoted);", null)
        }
    }

    fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun requestMicPermission() {
        micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    fun openAppSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        }
        startActivity(intent)
    }

    fun apiBase(): String {
        val saved = prefs().getString(KEY_API, "").orEmpty()
        val candidate = saved.ifBlank { BuildConfig.BACKEND_URL }
        if (!BuildConfig.DEBUG && unusableReleaseUrl(candidate)) {
            return PRODUCTION_BACKEND
        }
        return candidate
    }

    private fun unusableReleaseUrl(value: String): Boolean {
        if (!value.startsWith("https://")) return true
        val host = runCatching { URI(value).host?.lowercase().orEmpty() }.getOrDefault("")
        if (host.isBlank()) return true
        if (host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "::1") return true
        if (host == "trycloudflare.com" || host.endsWith(".trycloudflare.com")) return true
        return false
    }

    fun saveApiBase(raw: String): String {
        val value = raw.trim()
        if (value.isEmpty()) return "Enter the server address. Not an API key."
        val uri = runCatching { Uri.parse(value) }.getOrNull()
            ?: return "Enter a server address starting with https://"
        val scheme = uri.scheme?.lowercase().orEmpty()
        if (scheme != "https" && scheme != "http") return "Enter a server address starting with https://"
        val host = uri.host?.lowercase().orEmpty()
        val localHost = host == "localhost" || host == "127.0.0.1" || host == "10.0.2.2" || host == "::1"
        val tunnel = host.endsWith(".trycloudflare.com") || host == "trycloudflare.com"
        if (!BuildConfig.DEBUG && (scheme != "https" || localHost || tunnel)) {
            return "This install uses the public Sana server. Do not use localhost or a temporary tunnel."
        }
        if (!uri.userInfo.isNullOrBlank()) return "Do not put a password or key in the server address."
        val query = uri.query.orEmpty()
        if (Regex("api[_-]?key|token|secret|password", RegexOption.IGNORE_CASE).containsMatchIn(query)) {
            return "Do not put an API key in the server address."
        }
        if (Regex("sk-[A-Za-z0-9_\\-]{8,}").containsMatchIn(value) ||
            Regex("AIza[0-9A-Za-z\\-_]{10,}").containsMatchIn(value)
        ) {
            return "That looks like a secret. Set GEMINI_API_KEY on the server, not in the app."
        }
        prefs().edit().putString(KEY_API, uri.toString().trimEnd('/')).apply()
        return "ok"
    }

    fun saveVoice(name: String) {
        prefs().edit().putString(KEY_VOICE, name).apply()
    }

    private fun prefs() = getSharedPreferences("sana", MODE_PRIVATE)

    override fun onDestroy() {
        speech.stop()
        tts.shutdown()
        webView.removeJavascriptInterface("SanaNative")
        webView.destroy()
        super.onDestroy()
    }

    companion object {
        private const val KEY_API = "api_base"
        private const val KEY_VOICE = "voice_name"
        private const val PRODUCTION_BACKEND = "https://sana-ai-0ejd.onrender.com"
    }
}
