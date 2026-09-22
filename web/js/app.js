(function (S) {
  const $ = (id) => document.getElementById(id);
  let dialogResolve = null;
  let sheetName = '';

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 3200);
  }

  function confirmDialog({ title, body, ok, danger }) {
    $('dialog-title').textContent = title;
    $('dialog-body').textContent = body;
    $('dialog-ok').textContent = ok || 'Confirm';
    $('dialog-ok').classList.toggle('danger', Boolean(danger));
    $('dialog').hidden = false;
    $('dialog-ok').focus();
    return new Promise((resolve) => {
      dialogResolve = resolve;
    });
  }

  function closeDialog(result) {
    $('dialog').hidden = true;
    if (dialogResolve) dialogResolve(result);
    dialogResolve = null;
  }

  function banner(message, action) {
    const el = $('banner');
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML = `<p>${S.markdown.escapeHtml(message)}</p>${
      action ? `<button type="button" data-banner="${action.action}">${S.markdown.escapeHtml(action.label || 'Retry')}</button>` : ''
    }`;
  }

  function renderStatus(health, failure) {
    const box = $('api-status');
    if (!box) return;
    if (!health) {
      box.innerHTML = `<p class="status-bad">Unreachable</p><p>${S.markdown.escapeHtml(failure || 'Sana’s server did not respond.')}</p>`;
      return;
    }
    const configured = health.aiConfigured ? 'Configured' : 'Not configured';
    const vision =
      health.vision === 'off' || health.vision === 'unlikely'
        ? 'Images need a vision model'
        : 'Images supported or likely supported';
    const web =
      health.webSearch === 'fallback'
        ? 'Web search fallback ready — results are labeled, never invented'
        : health.webSearch && health.webSearch !== 'off'
          ? `Web search: ${health.webSearch}`
          : 'Web search off';
    box.innerHTML = `<p class="${health.aiConfigured ? 'status-ok' : 'status-bad'}">${configured}</p>
      <dl>
        <div><dt>Provider</dt><dd>${S.markdown.escapeHtml(health.provider || '—')}</dd></div>
        <div><dt>Model</dt><dd>${S.markdown.escapeHtml(health.model || '—')}</dd></div>
        <div><dt>Vision</dt><dd>${vision}</dd></div>
        <div><dt>Web</dt><dd>${S.markdown.escapeHtml(web)}</dd></div>
      </dl>
      <p class="hint">The API key stays on the server and is never shown here.</p>`;
  }

  function applyTheme(theme) {
    const resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme;
    document.documentElement.setAttribute('data-theme', resolved === 'light' ? 'light' : 'dark');
    const color = resolved === 'light' ? '#f3f6f8' : '#071018';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.querySelectorAll('#setting-theme [data-theme]').forEach((btn) => {
      btn.setAttribute('aria-checked', btn.dataset.theme === theme ? 'true' : 'false');
    });
  }

  function fillVoices() {
    const select = $('setting-voice-name');
    if (!select) return;
    const current = S.store.settings().voiceName;
    const list = S.tts.voices();
    const female = list.filter((voice) => voice.female);
    const options = [`<option value="">Female voice if the device has one</option>`]
      .concat(list.map((voice) => `<option value="${S.markdown.escapeHtml(voice.name)}">${S.markdown.escapeHtml(voice.label)}${voice.female ? ' · female' : ''}</option>`));
    select.innerHTML = options.join('');
    select.value = current;
    const note = $('voice-note');
    if (note) {
      note.textContent = female.length
        ? 'Sana prefers a female device voice. This is not a celebrity or a specific person’s voice.'
        : 'No voice was marked female. Sana will use the closest device voice. This is not a celebrity voice.';
    }
  }

  function showScreen(name) {
    document.querySelectorAll('.subscreen').forEach((el) => {
      el.hidden = el.id !== `screen-${name}`;
    });
    const chat = $('chat-screen');
    const header = $('chat-header');
    const onChat = name === 'chat';
    if (chat) chat.hidden = !onChat;
    if (header) header.hidden = !onChat;
    if (name === 'memory') loadMemory();
    if (name === 'settings') {
      fillSettings();
      S.chat.refreshHealth();
    }
  }

  function openScreen(name) {
    closeSheet(true);
    history.pushState({ sana: true, screen: name }, '');
    showScreen(name);
  }

  function openSheet(name) {
    sheetName = name;
    const body = $('sheet-body');
    const tpl = document.getElementById(`tpl-${name}`);
    body.innerHTML = '';
    if (tpl) body.appendChild(tpl.content.cloneNode(true));
    if (name === 'history') fillHistory();
    if (name === 'study') markLevel();
    $('overlay').hidden = false;
    $('sheet').setAttribute('aria-label', name);
    const close = body.querySelector('[data-sheet-close]');
    (close || body.querySelector('button'))?.focus();
  }

  function closeSheet(silent) {
    sheetName = '';
    $('overlay').hidden = true;
    $('sheet-body').innerHTML = '';
    if (!silent) {
      /* state already matches */
    }
  }

  function showSheet(name) {
    if (!name) {
      closeSheet(true);
      return;
    }
    openSheet(name);
  }

  function fillHistory() {
    const list = $('sheet-body').querySelector('[data-history]');
    if (!list) return;
    const items = S.chat.conversations();
    if (!items.length) {
      list.innerHTML = '<p class="hint">No chats yet.</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (conv) => `<button type="button" class="history-item" data-open="${conv.id}">
          <strong>${S.markdown.escapeHtml(conv.title || 'New chat')}</strong>
          <span>${S.markdown.escapeHtml((conv.messages || []).slice(-1)[0]?.text || '').slice(0, 72)}</span>
        </button>`
      )
      .join('');
  }

  function markLevel() {
    const level = S.store.active().studyLevel || 'normal';
    $('sheet-body').querySelectorAll('[data-level]').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.level === level ? 'true' : 'false');
    });
  }

  function fillSettings() {
    const settings = S.store.settings();
    $('setting-name').value = settings.assistantName || 'Sana';
    $('setting-language').value = settings.language || 'auto';
    $('setting-voice').checked = settings.voiceEnabled !== false;
    $('setting-rate').value = String(settings.speechRate || 1);
    $('rate-value').textContent = Number(settings.speechRate || 1).toFixed(1);
    $('setting-autoread').checked = Boolean(settings.autoRead);
    applyTheme(settings.theme || 'dark');
    fillVoices();
    const serverGroup = $('server-group');
    const native = Boolean(window.SANA_NATIVE || window.SanaNative || location.protocol === 'file:');
    if (serverGroup) serverGroup.hidden = !native;
    if (native && $('setting-server')) {
      $('setting-server').value = S.api.base() || '';
    }
    const mic = $('btn-mic');
    if (mic) mic.disabled = settings.voiceEnabled === false;
  }

  async function loadMemory() {
    const list = $('memory-list');
    list.innerHTML = '<p class="hint">Loading…</p>';
    try {
      const data = await S.api.memories();
      const items = data.memories || [];
      if (!items.length) {
        list.innerHTML = '<p class="hint">Sana only keeps what you explicitly ask her to remember. Passwords and keys are refused.</p>';
        return;
      }
      list.innerHTML = items
        .map(
          (item) => `<article class="memory-item" data-id="${item.id}">
            <p>${S.markdown.escapeHtml(item.content)}</p>
            <div class="row-actions">
              <button type="button" data-mem="edit">Edit</button>
              <button type="button" data-mem="delete">Delete</button>
            </div>
          </article>`
        )
        .join('');
    } catch (error) {
      list.innerHTML = `<p class="hint">${S.markdown.escapeHtml(error.message)}</p>`;
    }
  }

  async function saveServer(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      toast('Enter the server address. Not an API key.');
      return;
    }
    if (/AIza[0-9A-Za-z\-_]{10,}|sk-[A-Za-z0-9_\-]{8,}/.test(raw)) {
      toast('That looks like a secret. Set GEMINI_API_KEY on the server, not in the app.');
      return;
    }
    if (/sk-|api[_-]?key|AIza/i.test(raw) && !/^https?:\/\//i.test(raw)) {
      toast('That looks like a secret. Set GEMINI_API_KEY on the server, not in the app.');
      return;
    }
    let origin = raw;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad');
      if (url.username || url.password || /api[_-]?key|token|secret/i.test(url.search)) {
        toast('Do not put a key in the server address.');
        return;
      }
      origin = url.origin;
    } catch {
      toast('Enter a server address starting with https://');
      return;
    }
    if (window.SanaNative && window.SanaNative.setApiBase) {
      const result = window.SanaNative.setApiBase(origin);
      if (result && result !== 'ok') {
        toast(result);
        return;
      }
    }
    window.SANA_API_BASE = origin;
    toast('Server saved.');
    S.chat.refreshHealth();
  }

  function handleBack() {
    if (S.chat.isSpeaking()) {
      S.chat.stopSpeaking();
      return true;
    }
    if (S.chat.isListening()) {
      S.chat.stopListening();
      return true;
    }
    if (!$('dialog').hidden) {
      closeDialog(false);
      return true;
    }
    if (history.state && (history.state.screen || history.state.sheet)) {
      history.back();
      return true;
    }
    return false;
  }

  function bindSheet() {
    $('sheet-body').addEventListener('click', async (event) => {
      const level = event.target.closest('[data-level]');
      if (level) {
        S.chat.setLevel(level.dataset.level);
        markLevel();
        return;
      }
      const study = event.target.closest('[data-study]');
      if (study) {
        history.back();
        S.chat.useStudy(study.dataset.study);
        return;
      }
      const work = event.target.closest('[data-work]');
      if (work) {
        history.back();
        S.chat.useWork(work.dataset.work);
        return;
      }
      const open = event.target.closest('[data-open]');
      if (open) {
        history.back();
        S.chat.openConversation(open.dataset.open);
        return;
      }
      const sheetJump = event.target.closest('[data-open-sheet]');
      if (sheetJump) {
        const name = sheetJump.dataset.openSheet;
        history.replaceState({ sana: true, sheet: name }, '');
        openSheet(name);
        return;
      }
      const nav = event.target.closest('[data-go]');
      if (nav) {
        closeSheet(true);
        history.replaceState({ sana: true, screen: nav.dataset.go }, '');
        showScreen(nav.dataset.go);
        return;
      }
      if (event.target.closest('[data-action="exit-mode"]')) {
        S.chat.exitMode();
        history.back();
      }
    });
  }

  function bind() {
    history.replaceState({ sana: true }, '');
    window.addEventListener('popstate', (event) => {
      const state = event.state || {};
      if (state.sheet) showSheet(state.sheet);
      else closeSheet(true);
      showScreen(state.screen || 'chat');
    });
    document.querySelectorAll('[data-nav="back"]').forEach((btn) => {
      btn.addEventListener('click', () => history.back());
    });
    $('btn-menu').addEventListener('click', () => {
      history.pushState({ sana: true, sheet: 'menu' }, '');
      openSheet('menu');
    });
    $('btn-new-chat').addEventListener('click', () => S.chat.newChat());
    $('chip-study').addEventListener('click', () => {
      history.pushState({ sana: true, sheet: 'study' }, '');
      openSheet('study');
    });
    $('chip-work').addEventListener('click', () => {
      history.pushState({ sana: true, sheet: 'work' }, '');
      openSheet('work');
    });
    $('overlay').addEventListener('click', (event) => {
      if (event.target.id === 'overlay') history.back();
    });
    bindSheet();
    $('dialog-cancel').addEventListener('click', () => closeDialog(false));
    $('dialog-ok').addEventListener('click', () => closeDialog(true));
    $('btn-onboard').addEventListener('click', () => {
      $('onboarding').hidden = true;
      $('mic-ask').hidden = false;
    });
    $('btn-allow-mic').addEventListener('click', async () => {
      S.store.markOnboarded();
      $('mic-ask').hidden = true;
      const ok = await S.voice.ensureMic();
      if (!ok) toast('Microphone is off. You can still type, and turn voice on later in Settings.');
      S.chat.focusInput();
    });
    $('btn-skip-mic').addEventListener('click', () => {
      S.store.markOnboarded();
      $('mic-ask').hidden = true;
      S.chat.focusInput();
    });
    $('setting-name').addEventListener('change', () => {
      const name = $('setting-name').value.trim() || 'Sana';
      S.store.setSettings({ assistantName: name });
      S.chat.applyName();
    });
    $('setting-language').addEventListener('change', () => {
      S.store.setSettings({ language: $('setting-language').value });
      S.i18n.apply();
      S.chat.rerender();
    });
    $('setting-voice').addEventListener('change', () => {
      S.store.setSettings({ voiceEnabled: $('setting-voice').checked });
      $('btn-mic').disabled = !$('setting-voice').checked;
    });
    $('setting-voice-name').addEventListener('change', () => {
      S.store.setSettings({ voiceName: $('setting-voice-name').value });
      if (window.SanaNative && window.SanaNative.setVoice) window.SanaNative.setVoice($('setting-voice-name').value);
    });
    $('setting-rate').addEventListener('input', () => {
      const rate = Number($('setting-rate').value);
      $('rate-value').textContent = rate.toFixed(1);
      S.store.setSettings({ speechRate: rate });
    });
    $('setting-autoread').addEventListener('change', () => {
      S.store.setSettings({ autoRead: $('setting-autoread').checked });
    });
    $('setting-theme').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-theme]');
      if (!btn) return;
      S.store.setSettings({ theme: btn.dataset.theme });
      applyTheme(btn.dataset.theme);
    });
    $('open-memory').addEventListener('click', () => openScreen('memory'));
    $('open-about').addEventListener('click', () => openScreen('about'));
    $('open-privacy').addEventListener('click', () => openScreen('privacy'));
    $('btn-clear-chat').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Clear this conversation?',
        body: 'Sana will forget this chat’s context. Other chats stay.',
        ok: 'Clear',
        danger: true,
      });
      if (ok) S.chat.clearActive();
    });
    $('btn-clear-chats').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Clear all conversations?',
        body: 'This removes chats on this phone and on the Sana server for this device. Memory is kept until you clear it.',
        ok: 'Clear all',
        danger: true,
      });
      if (ok) S.chat.clearAll();
    });
    $('btn-clear-memory').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Clear memory?',
        body: 'Sana will forget the facts you asked her to remember.',
        ok: 'Clear memory',
        danger: true,
      });
      if (!ok) return;
      try {
        await S.api.clearMemory();
        toast('Memory cleared.');
        if (!$('screen-memory').hidden) loadMemory();
      } catch (error) {
        toast(error.message);
      }
    });
    $('btn-refresh-status').addEventListener('click', () => S.chat.refreshHealth());
    $('btn-save-server').addEventListener('click', () => saveServer($('setting-server').value));
    $('memory-add').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('memory-input');
      try {
        await S.api.addMemory(input.value.trim());
        input.value = '';
        loadMemory();
      } catch (error) {
        toast(error.message);
      }
    });
    $('memory-list').addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-mem]');
      if (!btn) return;
      const card = btn.closest('.memory-item');
      const id = card.dataset.id;
      if (btn.dataset.mem === 'delete') {
        try {
          await S.api.deleteMemory(id);
          loadMemory();
        } catch (error) {
          toast(error.message);
        }
        return;
      }
      const current = card.querySelector('p')?.textContent || '';
      const next = window.prompt('Edit memory', current);
      if (next == null) return;
      try {
        await S.api.updateMemory(id, next.trim());
        loadMemory();
      } catch (error) {
        toast(error.message);
      }
    });
    $('banner').addEventListener('click', (event) => {
      if (event.target.closest('[data-banner="retry-health"]')) S.chat.refreshHealth();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') handleBack();
    });
    document.addEventListener('sana-voices', fillVoices);
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (S.store.settings().theme === 'system') applyTheme('system');
    });
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      const btn = $('btn-install');
      if (btn) btn.hidden = false;
    });
    $('btn-install')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('btn-install').hidden = true;
    });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.SanaApp = {
      handleBack,
      onNativeReady() {
        try {
          window.SANA_NATIVE = true;
          const base = window.SanaNative && window.SanaNative.getApiBase && window.SanaNative.getApiBase();
          if (base) window.SANA_API_BASE = base;
        } catch {
          /* ignore */
        }
        fillSettings();
        S.chat.refreshHealth();
      },
    };
  }

  document.addEventListener('DOMContentLoaded', () => {
    S.ui = { toast, confirm: confirmDialog, banner, renderStatus, saveServer };
    bind();
    S.i18n.apply();
    applyTheme(S.store.settings().theme || 'dark');
    S.chat.init();
    fillSettings();
    if (!S.store.state.onboarded) {
      $('onboarding').hidden = false;
      $('mic-ask').hidden = true;
    } else {
      $('onboarding').hidden = true;
      $('mic-ask').hidden = true;
    }
    fillVoices();
    setTimeout(fillVoices, 600);
  });
})(window.Sana = window.Sana || {});
