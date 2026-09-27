(function (S) {
  const packs = {
    en: {
      ready: 'Ready',
      listening: 'Listening',
      thinking: 'Thinking',
      speaking: 'Speaking',
      voiceIssue: 'Voice issue',
      newChat: 'New chat',
      menu: 'Menu',
      send: 'Send',
      stop: 'Stop',
      stopGenerating: 'Stop generating',
      mic: 'Microphone',
      attach: 'Attach image or document',
      study: 'Study',
      work: 'Work',
      web: 'Web',
      settings: 'Settings',
      memory: 'Memory',
      about: 'About Sana',
      privacy: 'Privacy',
      history: 'Chats',
      clearChat: 'Clear conversation',
      placeholder: 'Message Sana',
      emptyTitle: "Hi, I'm Sana",
      emptyBody: 'Ask a doubt, plan a study session, or just talk.',
      copy: 'Copy',
      share: 'Share',
      replay: 'Replay',
      regenerate: 'Regenerate',
      remember: 'Remember',
      copied: 'Copied',
      voiceOff: 'Voice is off. Turn it on in Settings. You can still type.',
      retry: 'Retry',
      back: 'Back',
      allowMic: 'Allow microphone',
      notNow: 'Not now',
      fromWeb: 'From the internet',
      fromKnowledge: "From Sana's knowledge",
      webMiss: 'Web search returned nothing. This is not a live internet result.',
    },
    hi: {
      ready: 'तैयार',
      listening: 'सुन रही हूँ',
      thinking: 'सोच रही हूँ',
      speaking: 'बोल रही हूँ',
      voiceIssue: 'आवाज़ में दिक्कत',
      newChat: 'नई चैट',
      menu: 'मेनू',
      send: 'भेजें',
      stop: 'रोकें',
      stopGenerating: 'उत्तर रोकें',
      mic: 'माइक्रोफ़ोन',
      attach: 'फ़ोटो या फ़ाइल जोड़ें',
      study: 'पढ़ाई',
      work: 'काम',
      web: 'वेब',
      settings: 'सेटिंग्स',
      memory: 'मेमोरी',
      about: 'सना के बारे में',
      privacy: 'गोपनीयता',
      history: 'चैट्स',
      clearChat: 'बातचीत मिटाएँ',
      placeholder: 'सना को लिखें',
      emptyTitle: 'नमस्ते, मैं सना हूँ',
      emptyBody: 'कोई डाउट पूछो, पढ़ाई का प्लान बनाओ, या बस बात करो।',
      copy: 'कॉपी',
      share: 'शेयर',
      replay: 'फिर सुनें',
      regenerate: 'फिर से',
      remember: 'याद रखो',
      copied: 'कॉपी हो गया',
      voiceOff: 'आवाज़ बंद है। सेटिंग्स में चालू करो। लिखकर बात कर सकते हो।',
      retry: 'फिर कोशिश',
      back: 'वापस',
      allowMic: 'माइक्रोफ़ोन की अनुमति दें',
      notNow: 'अभी नहीं',
      fromWeb: 'इंटरनेट से',
      fromKnowledge: 'सना की जानकारी से',
      webMiss: 'वेब खोज में कुछ नहीं मिला। यह लाइव इंटरनेट परिणाम नहीं है।',
    },
    hinglish: {
      ready: 'Ready',
      listening: 'Sun rahi hoon',
      thinking: 'Soch rahi hoon',
      speaking: 'Bol rahi hoon',
      voiceIssue: 'Voice issue',
      newChat: 'Nayi chat',
      menu: 'Menu',
      send: 'Bhejo',
      stop: 'Roko',
      stopGenerating: 'Jawab roko',
      mic: 'Microphone',
      attach: 'Photo ya file jodo',
      study: 'Padhai',
      work: 'Kaam',
      web: 'Web',
      settings: 'Settings',
      memory: 'Memory',
      about: 'Sana ke baare mein',
      privacy: 'Privacy',
      history: 'Chats',
      clearChat: 'Baat clear karo',
      placeholder: 'Sana ko likho',
      emptyTitle: "Hi, main Sana hoon",
      emptyBody: 'Doubt poocho, study plan banao, ya bas baat karo.',
      copy: 'Copy',
      share: 'Share',
      replay: 'Phir suno',
      regenerate: 'Phir se',
      remember: 'Yaad rakhna',
      copied: 'Copy ho gaya',
      voiceOff: 'Voice off hai. Settings mein on karo. Type karke baat kar sakte ho.',
      retry: 'Retry',
      back: 'Back',
      allowMic: 'Mic allow karo',
      notNow: 'Abhi nahi',
      fromWeb: 'Internet se',
      fromKnowledge: 'Sana ki knowledge se',
      webMiss: 'Web search mein kuch nahi mila. Yeh live internet result nahi hai.',
    },
  };

  function lang() {
    const choice = S.store ? S.store.settings().language : 'auto';
    if (choice === 'hi' || choice === 'hinglish' || choice === 'en') return choice;
    const nav = (navigator.language || 'en').toLowerCase();
    return nav.startsWith('hi') ? 'hi' : 'en';
  }

  function t(key) {
    const pack = packs[lang()] || packs.en;
    return pack[key] || packs.en[key] || key;
  }

  function apply() {
    document.documentElement.lang = lang() === 'hi' ? 'hi' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = t(key);
      else el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-label')));
    });
  }

  S.i18n = { t, apply, lang };
})(window.Sana = window.Sana || {});
