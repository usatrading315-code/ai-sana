package com.sanaai.app.voice

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class SpeechInputController(
    private val activity: Activity,
    private val onPartial: (String) -> Unit,
    private val onFinal: (String) -> Unit,
    private val onError: (String) -> Unit,
    private val onEnd: () -> Unit,
) {
    private var recognizer: SpeechRecognizer? = null
    private var stopping = false

    fun available(): Boolean = SpeechRecognizer.isRecognitionAvailable(activity)

    fun start(lang: String) {
        stop()
        stopping = false
        if (!available()) {
            onError("Speech recognition is not available on this phone. You can still type.")
            onEnd()
            return
        }
        val rec = try {
            SpeechRecognizer.createSpeechRecognizer(activity)
        } catch (_: Exception) {
            onError("Speech recognition could not start. You can still type.")
            onEnd()
            return
        }
        recognizer = rec
        rec.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = Unit
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onEvent(eventType: Int, params: Bundle?) = Unit

            override fun onError(error: Int) {
                if (stopping) {
                    onEnd()
                    release()
                    return
                }
                onError(messageFor(error))
                onEnd()
                release()
            }

            override fun onResults(results: Bundle?) {
                val text = results
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (text.isNotBlank()) onFinal(text) else onError("Didn't catch that. Try again, or type instead.")
                onEnd()
                release()
            }

            override fun onPartialResults(partialResults: Bundle?) {
                val text = partialResults
                    ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    ?.firstOrNull()
                    .orEmpty()
                if (text.isNotBlank()) onPartial(text)
            }
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
        }
        try {
            rec.startListening(intent)
        } catch (_: Exception) {
            onError("The microphone could not start. You can still type.")
            onEnd()
            release()
        }
    }

    fun stop() {
        stopping = true
        try {
            recognizer?.stopListening()
        } catch (_: Exception) {
        }
        try {
            recognizer?.cancel()
        } catch (_: Exception) {
        }
        release()
    }

    private fun release() {
        try {
            recognizer?.destroy()
        } catch (_: Exception) {
        }
        recognizer = null
    }

    private fun messageFor(error: Int): String = when (error) {
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
            "Microphone permission is off. You can still type to Sana."
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
            "Speech recognition needs a network connection. You can still type."
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT ->
            "Didn't catch that. Try again, or type instead."
        SpeechRecognizer.ERROR_AUDIO -> "The microphone could not be opened."
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Speech recognition is busy. Try again in a moment."
        else -> "Voice input stopped. You can still type."
    }
}
