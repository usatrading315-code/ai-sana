package com.sanaai.app.bridge

import android.content.Intent
import android.webkit.JavascriptInterface
import com.sanaai.app.MainActivity
import com.sanaai.app.voice.SpeechInputController
import com.sanaai.app.voice.TtsController
import org.json.JSONArray
import org.json.JSONObject

class SanaBridge(
    private val activity: MainActivity,
    private val speech: SpeechInputController,
    private val tts: TtsController,
) {
    @JavascriptInterface
    fun hasMicPermission(): Boolean = activity.hasMicPermission()

    @JavascriptInterface
    fun requestMicPermission() {
        activity.runOnUiThread { activity.requestMicPermission() }
    }

    @JavascriptInterface
    fun startListening(lang: String?) {
        activity.runOnUiThread {
            if (!activity.hasMicPermission()) {
                activity.callJs("onError", "Microphone permission is off. You can still type to Sana.")
                activity.callJs("onEnd", "")
                return@runOnUiThread
            }
            speech.start(lang?.ifBlank { "en-IN" } ?: "en-IN")
        }
    }

    @JavascriptInterface
    fun stopListening() {
        activity.runOnUiThread { speech.stop() }
    }

    @JavascriptInterface
    fun speak(text: String?, lang: String?, rate: Double) {
        activity.runOnUiThread {
            tts.rate = rate.toFloat()
            tts.speak(text.orEmpty(), lang?.ifBlank { "en-IN" } ?: "en-IN")
        }
    }

    @JavascriptInterface
    fun stopSpeaking() {
        activity.runOnUiThread { tts.stop() }
    }

    @JavascriptInterface
    fun getVoices(): String {
        val array = JSONArray()
        tts.voices().forEach { voice ->
            array.put(
                JSONObject()
                    .put("name", voice["name"])
                    .put("lang", voice["lang"])
                    .put("label", voice["label"])
            )
        }
        return array.toString()
    }

    @JavascriptInterface
    fun setVoice(name: String?) {
        tts.setPreferredVoice(name)
        activity.saveVoice(name.orEmpty())
    }

    @JavascriptInterface
    fun share(text: String?) {
        val safe = text.orEmpty().take(8000)
        activity.runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, safe)
            }
            activity.startActivity(Intent.createChooser(send, "Share"))
        }
    }

    @JavascriptInterface
    fun getApiBase(): String = activity.apiBase()

    @JavascriptInterface
    fun setApiBase(url: String?): String = activity.saveApiBase(url.orEmpty())

    @JavascriptInterface
    fun isSpeechAvailable(): Boolean = speech.available()

    @JavascriptInterface
    fun isTtsAvailable(): Boolean = true

    @JavascriptInterface
    fun appVersion(): String = "1.0.0"

    @JavascriptInterface
    fun openAppSettings() {
        activity.runOnUiThread { activity.openAppSettings() }
    }
}
