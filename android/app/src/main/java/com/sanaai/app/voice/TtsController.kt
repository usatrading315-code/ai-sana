package com.sanaai.app.voice

import android.content.Context
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import java.util.Locale

class TtsController(
    context: Context,
    private val onStart: () -> Unit,
    private val onDone: () -> Unit,
    private val onError: (String) -> Unit,
) : TextToSpeech.OnInitListener {
    private val appContext = context.applicationContext
    private var engine: TextToSpeech? = null
    private var ready = false
    private var pending: SpeakRequest? = null
    private var preferredName: String? = null
    var rate: Float = 1f

    data class SpeakRequest(val text: String, val lang: String)

    fun init() {
        if (engine == null) engine = TextToSpeech(appContext, this)
    }

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (!ready) {
            onError("Text to speech is not available on this phone. You can still read replies.")
            return
        }
        pending?.let { speak(it.text, it.lang) }
        pending = null
    }

    fun available(): Boolean = engine != null

    fun voices(): List<Map<String, String>> {
        val current = engine ?: return emptyList()
        return current.voices.orEmpty().map { voice ->
            mapOf(
                "name" to voice.name,
                "lang" to voice.locale.toLanguageTag(),
                "label" to "${voice.locale.displayName} · ${voice.name}",
            )
        }
    }

    fun setPreferredVoice(name: String?) {
        preferredName = name?.takeIf { it.isNotBlank() }
    }

    fun speak(text: String, lang: String) {
        val current = engine
        if (current == null || !ready) {
            pending = SpeakRequest(text, lang)
            init()
            return
        }
        val locale = localeFor(lang)
        current.language = locale
        current.setSpeechRate(rate.coerceIn(0.6f, 1.6f))
        selectVoice(current, locale)
        val parts = chunk(text)
        if (parts.isEmpty()) return
        current.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                if (utteranceId?.startsWith("sana-0-") == true) onStart()
            }

            override fun onDone(utteranceId: String?) {
                if (utteranceId?.endsWith("-last") == true) onDone()
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                onError("Could not play speech. You can still read the reply.")
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                onError("Could not play speech. You can still read the reply.")
            }
        })
        current.stop()
        parts.forEachIndexed { index, part ->
            val mode = if (index == 0) TextToSpeech.QUEUE_FLUSH else TextToSpeech.QUEUE_ADD
            val id = if (index == parts.lastIndex) "sana-$index-last" else "sana-$index-0"
            current.speak(part, mode, Bundle(), id)
        }
    }

    fun stop() {
        pending = null
        engine?.stop()
    }

    fun shutdown() {
        pending = null
        engine?.stop()
        engine?.shutdown()
        engine = null
        ready = false
    }

    private fun selectVoice(tts: TextToSpeech, locale: Locale) {
        val voices = tts.voices ?: return
        val preferred = preferredName
        if (!preferred.isNullOrBlank()) {
            voices.firstOrNull { it.name == preferred }?.let {
                tts.voice = it
                return
            }
        }
        val best = voices
            .filter { it.locale.language.equals(locale.language, ignoreCase = true) }
            .maxByOrNull { voiceScore(it, locale) }
        if (best != null) tts.voice = best
    }

    private fun voiceScore(voice: Voice, locale: Locale): Int {
        val name = voice.name.lowercase(Locale.ROOT)
        var score = 0
        if (voice.locale.country.equals(locale.country, ignoreCase = true)) score += 2
        if (name.contains("female") || name.contains("-f") || name.contains("_f") || name.contains("fem")) score += 8
        if (name.contains("male") && !name.contains("female")) score -= 6
        if (voice.quality >= Voice.QUALITY_HIGH) score += 1
        return score
    }

    private fun localeFor(lang: String): Locale {
        val tag = lang.replace('_', '-')
        val parsed = Locale.forLanguageTag(tag)
        if (parsed.language.isNotBlank()) return parsed
        return if (lang.startsWith("hi")) Locale("hi", "IN") else Locale("en", "IN")
    }

    private fun chunk(text: String, size: Int = 180): List<String> {
        val clean = text.replace(Regex("\\s+"), " ").trim()
        if (clean.isEmpty()) return emptyList()
        if (clean.length <= size) return listOf(clean)
        val parts = mutableListOf<String>()
        var rest = clean
        while (rest.length > size) {
            var cut = rest.lastIndexOf(". ", size - 1)
            if (cut < (size * 0.4)) cut = rest.lastIndexOf(' ', size - 1)
            if (cut < 40) cut = size
            parts += rest.substring(0, cut + 1).trim()
            rest = rest.substring(cut + 1).trim()
        }
        if (rest.isNotEmpty()) parts += rest
        return parts
    }
}
