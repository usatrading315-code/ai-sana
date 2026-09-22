(function (S) {
  window.SanaVoice = window.SanaVoice || {};
  let recognition = null;
  let listening = false;
  let wantStop = false;

  function Recog() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function supported() {
    if (window.SanaNative && window.SanaNative.isSpeechAvailable) {
      try {
        return Boolean(window.SanaNative.isSpeechAvailable());
      } catch {
        return false;
      }
    }
    return Boolean(Recog());
  }

  function langFor(language, draft) {
    if (language === 'hi' || language === 'hinglish') return 'hi-IN';
    if (language === 'en') return 'en-IN';
    if (/[\u0900-\u097F]/.test(draft || '')) return 'hi-IN';
    return 'en-IN';
  }

  function ensureMic() {
    if (window.SanaNative && window.SanaNative.hasMicPermission) {
      if (window.SanaNative.hasMicPermission()) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 20000);
        window.SanaVoice.onPermission = (state) => {
          clearTimeout(timer);
          resolve(state === 'granted');
        };
        window.SanaNative.requestMicPermission();
      });
    }
    const Ctor = Recog();
    if (!Ctor) return Promise.resolve(false);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(true);
    return navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        return true;
      })
      .catch(() => false);
  }

  function start(options) {
    wantStop = false;
    if (window.SanaNative && window.SanaNative.startListening) {
      listening = true;
      window.SanaVoice.onPartial = (text) => options.onPartial?.(String(text || ''));
      window.SanaVoice.onFinal = (text) => {
        listening = false;
        options.onFinal?.(String(text || ''));
      };
      window.SanaVoice.onError = (message) => {
        listening = false;
        options.onError?.(String(message || 'Voice input stopped. You can still type.'));
      };
      window.SanaVoice.onEnd = () => {
        listening = false;
        options.onEnd?.();
      };
      window.SanaNative.startListening(options.lang || 'en-IN');
      return;
    }
    const Ctor = Recog();
    if (!Ctor) {
      options.onError?.('Speech recognition isn’t available here. You can still type to Sana.');
      return;
    }
    if (recognition) {
      try {
        recognition.onend = null;
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
    const rec = new Ctor();
    recognition = rec;
    rec.lang = options.lang || 'en-IN';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    listening = true;
    rec.onresult = (event) => {
      let finalText = '';
      let partial = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) finalText += piece;
        else partial += piece;
      }
      if (partial) options.onPartial?.(partial);
      if (finalText.trim()) options.onFinal?.(finalText.trim());
    };
    rec.onerror = (event) => {
      listening = false;
      const code = event.error || '';
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        options.onError?.('Microphone permission is off. You can still type to Sana.');
      } else if (code === 'network') {
        options.onError?.('Speech recognition needs a connection. You can still type.');
      } else if (code === 'no-speech') {
        options.onError?.('Didn’t catch that. Try again, or type instead.');
      } else if (code === 'aborted' && wantStop) {
        options.onEnd?.();
        return;
      } else {
        options.onError?.('Voice input stopped. You can still type.');
      }
    };
    rec.onend = () => {
      listening = false;
      options.onEnd?.();
    };
    try {
      rec.start();
    } catch {
      listening = false;
      options.onError?.('The microphone could not start. You can still type.');
    }
  }

  function stop() {
    wantStop = true;
    listening = false;
    if (window.SanaNative && window.SanaNative.stopListening) {
      try {
        window.SanaNative.stopListening();
      } catch {
        /* ignore */
      }
      return;
    }
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
  }

  S.voice = { supported, ensureMic, start, stop, langFor, isListening: () => listening };
})(window.Sana = window.Sana || {});
