(function (S) {
  const SETTINGS_KEY = 'sana.settings.v1';
  const STATE_KEY = 'sana.state.v1';
  const ONBOARD_KEY = 'sana.onboarded.v1';

  const defaultSettings = {
    assistantName: 'Sana',
    language: 'auto',
    voiceEnabled: true,
    voiceName: '',
    speechRate: 1,
    autoRead: false,
    theme: 'dark',
  };

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  const saved = read(STATE_KEY, null);
  const state = {
    deviceId: saved?.deviceId || uuid(),
    activeId: saved?.activeId || '',
    conversations: Array.isArray(saved?.conversations) ? saved.conversations : [],
    draft: saved?.draft || '',
    settings: { ...defaultSettings, ...read(SETTINGS_KEY, {}) },
    onboarded: localStorage.getItem(ONBOARD_KEY) === '1',
  };
  if (!state.activeId) {
    const created = blankConversation();
    state.conversations.unshift(created);
    state.activeId = created.id;
  }

  const listeners = new Set();
  let timer = 0;

  function blankConversation() {
    return {
      id: uuid(),
      title: '',
      updatedAt: new Date().toISOString(),
      messages: [],
      mode: 'chat',
      studyLevel: 'normal',
      studyTask: '',
      workTask: '',
      webSearch: false,
    };
  }

  function persist() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const slim = {
        deviceId: state.deviceId,
        activeId: state.activeId,
        draft: state.draft,
        conversations: state.conversations.slice(0, 40).map((conv) => ({
          ...conv,
          messages: (conv.messages || []).slice(-150).map((msg) => ({
            id: msg.id,
            role: msg.role,
            text: String(msg.text || '').slice(0, 20000),
            createdAt: msg.createdAt,
            knowledge: msg.knowledge || null,
            webStatus: msg.webStatus || null,
            sources: msg.sources || [],
            error: Boolean(msg.error),
            code: msg.code || '',
            clientMessageId: msg.clientMessageId || '',
            source: msg.source || 'text',
            taskLabel: msg.taskLabel || '',
            attachmentNames: msg.attachmentNames || [],
          })),
        })),
      };
      try {
        localStorage.setItem(STATE_KEY, JSON.stringify(slim));
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
      } catch {
        /* storage full — keep going in memory */
      }
    }, 180);
  }

  function emit() {
    persist();
    listeners.forEach((fn) => fn(state));
  }

  function active() {
    return state.conversations.find((conv) => conv.id === state.activeId) || state.conversations[0];
  }

  function touch(conv) {
    conv.updatedAt = new Date().toISOString();
    state.conversations = [conv, ...state.conversations.filter((item) => item.id !== conv.id)];
  }

  S.store = {
    state,
    uuid,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    settings() {
      return state.settings;
    },
    setSettings(partial) {
      state.settings = { ...state.settings, ...partial };
      if (state.settings.assistantName) {
        state.settings.assistantName = String(state.settings.assistantName).slice(0, 24);
      }
      const rate = Number(state.settings.speechRate);
      state.settings.speechRate = Number.isFinite(rate) ? Math.min(1.4, Math.max(0.7, rate)) : 1;
      emit();
    },
    deviceId() {
      return state.deviceId;
    },
    active,
    setDraft(text) {
      state.draft = text;
      persist();
    },
    setMode(partial) {
      const conv = active();
      Object.assign(conv, partial);
      touch(conv);
      emit();
    },
    newChat() {
      const conv = active();
      if (conv && conv.messages.length === 0) return conv;
      const created = blankConversation();
      state.conversations.unshift(created);
      state.activeId = created.id;
      emit();
      return created;
    },
    openChat(id) {
      if (!state.conversations.some((conv) => conv.id === id)) return;
      state.activeId = id;
      emit();
    },
    addMessage(message) {
      const conv = active();
      conv.messages.push(message);
      if (!conv.title && message.role === 'user') {
        conv.title = String(message.text || 'Chat').replace(/\s+/g, ' ').slice(0, 48);
      }
      if (conv.messages.length > 150) conv.messages = conv.messages.slice(-150);
      touch(conv);
      emit();
      return message;
    },
    updateMessage(id, partial) {
      const conv = active();
      const msg = conv.messages.find((item) => item.id === id);
      if (!msg) return null;
      Object.assign(msg, partial);
      touch(conv);
      emit();
      return msg;
    },
    removeMessage(id) {
      const conv = active();
      conv.messages = conv.messages.filter((item) => item.id !== id);
      touch(conv);
      emit();
    },
    replaceActive(conv) {
      const idx = state.conversations.findIndex((item) => item.id === conv.id);
      if (idx >= 0) state.conversations[idx] = { ...state.conversations[idx], ...conv };
      else state.conversations.unshift(conv);
      emit();
    },
    deleteConversation(id) {
      state.conversations = state.conversations.filter((conv) => conv.id !== id);
      if (state.activeId === id) {
        if (!state.conversations.length) state.conversations.push(blankConversation());
        state.activeId = state.conversations[0].id;
      }
      emit();
    },
    clearAll() {
      const created = blankConversation();
      state.conversations = [created];
      state.activeId = created.id;
      emit();
    },
    markOnboarded() {
      state.onboarded = true;
      try {
        localStorage.setItem(ONBOARD_KEY, '1');
      } catch {
        /* ignore */
      }
      document.documentElement.classList.add('onboarded');
      emit();
    },
  };
})(window.Sana = window.Sana || {});
