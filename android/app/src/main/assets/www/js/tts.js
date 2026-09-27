(function (S) {
  window.SanaVoice = window.SanaVoice || {};
  let speaking = false;
  let stopFlag = false;
  let queue = [];
  let utterance = null;

  const FEMALE = /female|woman|\bfem\b|heera|lekha|samantha|zira|susan|hazel|victoria|fiona|moira|veena|tessa|hi-in-x-hia|en-in-x-ena|en-gb-x-gba|en-us-x-sfg|hi-in-x-hic/;

  function supported() {
    if (window.SanaNative && window.SanaNative.isTtsAvailable) {
      try {
        return window.SanaNative.isTtsAvailable() !== false;
      } catch {
        return true;
      }
    }
    return typeof window.speechSynthesis !== 'undefined';
  }

  function webVoices() {
    if (!window.speechSynthesis) return [];
    return window.speechSynthesis.getVoices().map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      label: `${voice.name} · ${voice.lang}`,
      female: FEMALE.test(`${voice.name} ${voice.voiceURI || ''}`.toLowerCase()) && !/\bmale\b/.test(voice.name.toLowerCase()),
    }));
  }

  function voices() {
    if (window.SanaNative && window.SanaNative.getVoices) {
      try {
        const parsed = JSON.parse(window.SanaNative.getVoices() || '[]');
        if (Array.isArray(parsed) && parsed.length) {
          return parsed.map((voice) => ({
            name: voice.name,
            lang: voice.lang,
            label: voice.label || voice.name,
            female: FEMALE.test(String(voice.name || '').toLowerCase()),
          }));
        }
      } catch {
        /* fall through */
      }
    }
    return webVoices();
  }

  function pickVoice(preferred, lang) {
    const list = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    if (preferred) {
      const exact = list.find((voice) => voice.name === preferred);
      if (exact) return exact;
    }
    const prefix = (lang || 'en').slice(0, 2).toLowerCase();
    const ranked = list
      .map((voice) => {
        const blob = `${voice.name} ${voice.voiceURI || ''}`.toLowerCase();
        let score = 0;
        if ((voice.lang || '').toLowerCase().startsWith(prefix)) score += 6;
        if ((voice.lang || '').toLowerCase() === String(lang || '').toLowerCase()) score += 3;
        if (FEMALE.test(blob)) score += 8;
        if (/\bmale\b/.test(blob) && !blob.includes('female')) score -= 8;
        return { voice, score };
      })
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.voice || null;
  }

  function plain(text) {
    return String(text || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#>*_~]/g, ' ')
      .replace(/\$\$[\s\S]*?\$\$/g, ' formula ')
      .replace(/\$[^$\n]+\$/g, ' formula ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function langOf(text) {
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    const hinglish = (text.match(/\b(hai|hain|mujhe|kya|nahi|karo|mein|aur|ke|ka|ki)\b/gi) || []).length;
    if (hinglish >= 2) return 'hi-IN';
    return 'en-IN';
  }

  function chunks(text, size) {
    const clean = text.trim();
    if (clean.length <= size) return [clean];
    const parts = [];
    let rest = clean;
    while (rest.length > size) {
      let cut = rest.lastIndexOf('. ', size);
      if (cut < size * 0.45) cut = rest.lastIndexOf(' ', size);
      if (cut < 40) cut = size;
      parts.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if (rest) parts.push(rest);
    return parts.filter(Boolean);
  }

  function finish(handlers) {
    speaking = false;
    queue = [];
    handlers.onEnd?.();
  }

  function speakWeb(parts, lang, rate, voiceName, handlers) {
    const synth = window.speechSynthesis;
    stopFlag = false;
    const say = (index) => {
      if (stopFlag || index >= parts.length) {
        finish(handlers);
        return;
      }
      const utter = new SpeechSynthesisUtterance(parts[index]);
      utterance = utter;
      utter.lang = lang;
      utter.rate = rate;
      const voice = pickVoice(voiceName, lang);
      if (voice) utter.voice = voice;
      utter.onstart = () => {
        if (index === 0) handlers.onStart?.();
      };
      utter.onend = () => say(index + 1);
      utter.onerror = () => {
        if (stopFlag) finish(handlers);
        else {
          speaking = false;
          handlers.onError?.('Could not play speech. You can still read the reply.');
        }
      };
      synth.speak(utter);
    };
    say(0);
  }

  function speak(text, options = {}) {
    const spoken = plain(text);
    if (!spoken) return;
    stop();
    const limited = spoken.length > 1200 ? `${spoken.slice(0, 1200)}. The rest is on the screen.` : spoken;
    const lang = options.lang || langOf(spoken);
    const rate = Number(options.rate || 1);
    speaking = true;
    if (window.SanaNative && window.SanaNative.speak) {
      window.SanaVoice.onTtsStart = () => options.onStart?.();
      window.SanaVoice.onTtsDone = () => {
        speaking = false;
        options.onEnd?.();
      };
      window.SanaVoice.onTtsError = (message) => {
        speaking = false;
        options.onError?.(message || 'Could not play speech. You can still read the reply.');
      };
      if (options.voiceName && window.SanaNative.setVoice) window.SanaNative.setVoice(options.voiceName);
      window.SanaNative.speak(limited, lang, rate);
      return;
    }
    if (!window.speechSynthesis) {
      speaking = false;
      options.onError?.('Speech isn’t available on this device. You can still read the reply.');
      return;
    }
    window.speechSynthesis.cancel();
    queue = chunks(limited, 220);
    speakWeb(queue, lang, rate, options.voiceName, options);
  }

  function stop() {
    stopFlag = true;
    speaking = false;
    queue = [];
    if (window.SanaNative && window.SanaNative.stopSpeaking) {
      try {
        window.SanaNative.stopSpeaking();
      } catch {
        /* ignore */
      }
    }
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {
      document.dispatchEvent(new CustomEvent('sana-voices'));
    };
  }

  S.tts = { supported, voices, speak, stop, plain, langOf, isSpeaking: () => speaking };
})(window.Sana = window.Sana || {});
