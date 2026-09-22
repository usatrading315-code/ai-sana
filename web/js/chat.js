(function (S) {
  const ALLOWED = {
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/webp': 'image',
    'image/gif': 'image',
    'application/pdf': 'file',
    'text/plain': 'file',
    'text/markdown': 'file',
    'text/csv': 'file',
    'application/json': 'file',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'file',
  };
  const EXT = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  let attachments = [];
  let generating = false;
  let run = null;
  let voiceState = 'idle';
  let lastSpoken = '';
  let health = null;
  let stick = true;
  let booted = false;

  const $ = (id) => document.getElementById(id);

  function t(key) {
    return S.i18n.t(key);
  }

  function setVoiceState(next, detail) {
    voiceState = next;
    const pill = $('voice-state');
    const label =
      next === 'listening'
        ? t('listening')
        : next === 'processing'
          ? t('thinking')
          : next === 'speaking'
            ? t('speaking')
            : next === 'error'
              ? t('voiceIssue')
              : t('ready');
    if (pill) {
      pill.dataset.state = next;
      pill.textContent = label;
    }
    const live = $('live-bar');
    const liveLabel = $('live-label');
    const stopVoice = $('btn-stop-voice');
    const replay = $('btn-replay');
    if (live) {
      const show = next === 'listening' || next === 'speaking' || next === 'error';
      live.hidden = !show;
      if (liveLabel) liveLabel.textContent = detail || label;
      if (stopVoice) stopVoice.hidden = next === 'error';
      if (replay) replay.hidden = next !== 'speaking';
    }
    const sr = $('sr-status');
    if (sr) sr.textContent = detail || label;
    const mic = $('btn-mic');
    if (mic) mic.dataset.state = next === 'listening' ? 'on' : 'off';
    document.body.dataset.voice = next;
  }

  function taskLabel(conv) {
    if (conv.mode === 'study' && conv.studyTask) return `Study · ${pretty(conv.studyTask)} · ${pretty(conv.studyLevel)}`;
    if (conv.mode === 'study') return `Study · ${pretty(conv.studyLevel)}`;
    if (conv.mode === 'work' && conv.workTask) return `Work · ${pretty(conv.workTask)}`;
    if (conv.mode === 'work') return 'Work';
    return '';
  }

  function pretty(value) {
    return String(value || '').replace(/-/g, ' ');
  }

  function timeLabel(iso) {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function scrollIfNeeded() {
    const log = $('chat-log');
    if (!log || !stick) return;
    log.scrollTop = log.scrollHeight;
  }

  function renderEmpty() {
    const conv = S.store.active();
    const empty = $('empty-state');
    if (!empty) return;
    empty.hidden = conv.messages.length > 0;
    const title = empty.querySelector('h2');
    const body = empty.querySelector('p');
    if (title) title.textContent = t('emptyTitle');
    if (body) body.textContent = t('emptyBody');
  }

  function knowledgeHtml(msg) {
    if (msg.role !== 'assistant' || msg.error) return '';
    if (msg.knowledge === 'web' && msg.sources?.length) {
      const links = msg.sources
        .map((source) => {
          const href = /^https?:\/\//.test(source.url) ? source.url : '';
          if (!href) return '';
          return `<a href="${S.markdown.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${S.markdown.escapeHtml(source.title || href)}</a>`;
        })
        .join('');
      return `<div class="knowledge web"><span>${t('fromWeb')}</span>${links}</div>`;
    }
    if (msg.webStatus === 'empty' || msg.webStatus === 'error') {
      return `<div class="knowledge miss">${t('webMiss')}</div>`;
    }
    if (msg.role === 'assistant' && msg.text) {
      return `<div class="knowledge">${t('fromKnowledge')}</div>`;
    }
    return '';
  }

  function actionsHtml(msg, isLast) {
    if (msg.role === 'error' || msg.pending) return '';
    if (msg.role === 'user') {
      return `<button type="button" data-action="copy" data-id="${msg.id}">${t('copy')}</button>
        <button type="button" data-action="remember" data-id="${msg.id}">${t('remember')}</button>`;
    }
    return `<button type="button" data-action="copy" data-id="${msg.id}">${t('copy')}</button>
      <button type="button" data-action="share" data-id="${msg.id}">${t('share')}</button>
      <button type="button" data-action="replay" data-id="${msg.id}">${t('replay')}</button>
      ${isLast ? `<button type="button" data-action="regenerate" data-id="${msg.id}">${t('regenerate')}</button>` : ''}
      <button type="button" data-action="remember" data-id="${msg.id}">${t('remember')}</button>`;
  }

  function messageNode(msg, isLast) {
    const art = document.createElement('article');
    art.className = `msg ${msg.role === 'user' ? 'user' : 'sana'}${msg.error ? ' error' : ''}`;
    art.id = `msg-${msg.id}`;
    art.dataset.id = msg.id;
    const kicker = msg.taskLabel ? `<div class="kicker">${S.markdown.escapeHtml(msg.taskLabel)}</div>` : '';
    const names = (msg.attachmentNames || []).map((name) => `<span>${S.markdown.escapeHtml(name)}</span>`).join('');
    const body = msg.pending
      ? `<div class="dots" aria-hidden="true"><span></span><span></span><span></span></div><span class="sr-only">${t('thinking')}</span>`
      : msg.error
        ? `<p>${S.markdown.escapeHtml(msg.text)}</p><button type="button" class="retry" data-action="retry" data-id="${msg.id}">${t('retry')}</button>`
        : S.markdown.renderRich(msg.text || '');
    const avatar =
      msg.role === 'user'
        ? ''
        : `<img class="msg-avatar" src="icons/avatar.png" alt="" width="28" height="28">`;
    art.innerHTML = `${avatar}<div class="msg-col">${kicker}${names ? `<div class="file-pills">${names}</div>` : ''}<div class="bubble"><div class="bubble-body">${body}</div></div><div class="msg-meta"><time datetime="${msg.createdAt || ''}">${timeLabel(msg.createdAt)}</time><div class="msg-actions">${actionsHtml(msg, isLast)}</div></div>${knowledgeHtml(msg)}</div>`;
    return art;
  }

  function renderAll() {
    const log = $('chat-log');
    if (!log) return;
    const conv = S.store.active();
    const empty = $('empty-state');
    log.querySelectorAll('.msg').forEach((node) => node.remove());
    conv.messages.forEach((msg, index) => {
      log.appendChild(messageNode(msg, index === conv.messages.length - 1 && msg.role === 'assistant'));
    });
    if (empty) log.prepend(empty);
    renderEmpty();
    syncModeChips();
    stick = true;
    scrollIfNeeded();
  }

  function appendMessage(msg) {
    const log = $('chat-log');
    log.querySelectorAll('.msg.sana .msg-actions [data-action="regenerate"]').forEach((btn) => btn.remove());
    log.appendChild(messageNode(msg, msg.role === 'assistant'));
    renderEmpty();
    scrollIfNeeded();
  }

  function patchMessage(msg) {
    const node = document.getElementById(`msg-${msg.id}`);
    if (!node) {
      appendMessage(msg);
      return;
    }
    const body = node.querySelector('.bubble-body');
    if (body) body.innerHTML = S.markdown.renderRich(msg.text || '');
    const know = node.querySelector('.knowledge');
    const html = knowledgeHtml(msg);
    if (know) know.outerHTML = html;
    else if (html) node.querySelector('.msg-col').insertAdjacentHTML('beforeend', html);
    scrollIfNeeded();
  }

  function syncModeChips() {
    const conv = S.store.active();
    const study = $('chip-study');
    const work = $('chip-work');
    const web = $('chip-web');
    if (study) study.setAttribute('aria-pressed', conv.mode === 'study' ? 'true' : 'false');
    if (work) work.setAttribute('aria-pressed', conv.mode === 'work' ? 'true' : 'false');
    if (web) web.setAttribute('aria-pressed', conv.webSearch ? 'true' : 'false');
    const sub = $('header-sub');
    if (sub && voiceState === 'idle') {
      sub.textContent = conv.mode === 'study' ? 'Study companion' : conv.mode === 'work' ? 'Work assistant' : 'Study companion';
    }
  }

  function showTyping() {
    const id = `typing-${Date.now()}`;
    const msg = { id, role: 'assistant', pending: true, createdAt: new Date().toISOString(), text: '' };
    appendMessage(msg);
    return id;
  }

  function removeNode(id) {
    document.getElementById(`msg-${id}`)?.remove();
  }

  function setGenerating(on) {
    generating = on;
    const send = $('btn-send');
    const stop = $('btn-stop');
    if (send) send.hidden = on;
    if (stop) stop.hidden = !on;
    const input = $('composer-input');
    if (input) input.disabled = false;
  }

  async function refreshHealth() {
    try {
      health = await S.api.health();
      S.ui?.renderStatus?.(health);
      if (!health.aiConfigured) {
        S.ui?.banner?.(
          'Sana’s AI service isn’t configured on the server yet. Add GEMINI_API_KEY as a server environment variable, then tap Retry. The key is never shown here.',
          { action: 'retry-health', label: 'Retry' }
        );
      } else if (health) {
        S.ui?.banner?.(null);
      }
      const card = $('connect-card');
      if (card) card.hidden = !S.api.needsServer();
    } catch (error) {
      health = null;
      S.ui?.renderStatus?.(null, error.message);
      S.ui?.banner?.(error.message, { action: 'retry-health', label: 'Retry' });
      const card = $('connect-card');
      if (card) card.hidden = !S.api.needsServer();
    }
  }

  function fileToPayload(file) {
    return { name: file.name, mime: file.mime, dataBase64: file.dataBase64 };
  }

  async function send(options = {}) {
    if (generating && !options.force) return;
    const conv = S.store.active();
    const input = $('composer-input');
    const retryMsg = options.retryId ? conv.messages.find((item) => item.id === options.retryId) : null;
    const regenerate = Boolean(options.regenerate);
    let text = '';
    let files = [];
    let clientMessageId = S.store.uuid();
    let source = options.source || 'text';
    if (regenerate) {
      const lastAssistant = [...conv.messages].reverse().find((item) => item.role === 'assistant' && !item.error);
      if (lastAssistant) S.store.removeMessage(lastAssistant.id);
      document.getElementById(`msg-${lastAssistant?.id}`)?.remove();
    } else if (retryMsg) {
      text = retryMsg.text;
      clientMessageId = retryMsg.clientMessageId || clientMessageId;
      source = retryMsg.source || source;
      files = retryMsg.files || [];
      const doomed = conv.messages.filter((item) => item.id === retryMsg.id || item.retryId === retryMsg.id);
      doomed.forEach((item) => {
        removeNode(item.id);
        S.store.removeMessage(item.id);
      });
    } else {
      text = (input?.value || '').trim();
      files = attachments.slice();
      if (!text && !files.length) return;
    }
    const draftBackup = input ? input.value : '';
    const fileBackup = attachments.slice();
    if (!regenerate && !retryMsg) {
      const userMsg = {
        id: S.store.uuid(),
        role: 'user',
        text: text || (files.length ? 'Please look at the attachment.' : ''),
        createdAt: new Date().toISOString(),
        clientMessageId,
        source,
        taskLabel: taskLabel(conv),
        attachmentNames: files.map((file) => file.name),
        files,
      };
      S.store.addMessage(userMsg);
      appendMessage(userMsg);
      if (input) input.value = '';
      clearAttachments();
      S.store.setDraft('');
      growInput();
    }
    const typingId = showTyping();
    setGenerating(true);
    if (voiceState !== 'listening') setVoiceState('processing');
    const requestId = S.store.uuid();
    let assistantId = null;
    let acc = '';
    try {
      await S.api.chat(
        {
          requestId,
          deviceId: S.store.deviceId(),
          conversationId: conv.id,
          message: regenerate ? '' : text,
          clientMessageId: regenerate ? '' : clientMessageId,
          mode: conv.mode,
          language: S.store.settings().language,
          studyLevel: conv.studyLevel,
          studyTask: conv.studyTask,
          workTask: conv.workTask,
          webSearch: conv.webSearch,
          assistantName: S.store.settings().assistantName || 'Sana',
          regenerate,
          attachments: files.map(fileToPayload),
          history: regenerate
            ? []
            : conv.messages
                .filter((item) => !item.error && !item.pending && item.clientMessageId !== clientMessageId)
                .slice(-20)
                .map((item) => ({ role: item.role === 'user' ? 'user' : 'assistant', content: item.text })),
        },
        {
          onStarted(handle) {
            run = handle;
          },
          onStatus() {
            setVoiceState('processing');
          },
          onToken(token) {
            acc += token;
            removeNode(typingId);
            if (!assistantId) {
              assistantId = S.store.uuid();
              const msg = {
                id: assistantId,
                role: 'assistant',
                text: acc,
                createdAt: new Date().toISOString(),
              };
              S.store.addMessage(msg);
              appendMessage(msg);
            } else {
              const msg = S.store.updateMessage(assistantId, { text: acc });
              patchMessage(msg);
            }
          },
          onDone(meta) {
            removeNode(typingId);
            if (assistantId) {
              const msg = S.store.updateMessage(assistantId, {
                sources: meta.sources || [],
                webStatus: meta.webStatus || 'off',
                knowledge: meta.knowledge || 'model',
              });
              patchMessage(msg);
            }
          },
        }
      );
      setGenerating(false);
      run = null;
      const finalText = acc;
      lastSpoken = finalText;
      const settings = S.store.settings();
      const shouldSpeak = settings.voiceEnabled && finalText && (settings.autoRead || source === 'voice');
      if (shouldSpeak) {
        setVoiceState('speaking');
        S.tts.speak(finalText, {
          rate: settings.speechRate,
          voiceName: settings.voiceName,
          onStart() {
            setVoiceState('speaking');
          },
          onEnd() {
            if (voiceState === 'speaking') setVoiceState('idle');
          },
          onError(message) {
            setVoiceState('error', message);
            S.ui?.toast?.(message);
          },
        });
      } else if (voiceState !== 'listening') {
        setVoiceState('idle');
      }
    } catch (error) {
      setGenerating(false);
      run = null;
      removeNode(typingId);
      if (error.name === 'AbortError') {
        if (voiceState === 'processing') setVoiceState('idle');
        return;
      }
      if (!regenerate && !retryMsg && input && !input.value) input.value = draftBackup;
      if (!attachments.length && fileBackup.length && !retryMsg && !regenerate) {
        attachments = fileBackup;
        renderAttachments();
      }
      const errId = S.store.uuid();
      const err = {
        id: errId,
        role: 'assistant',
        error: true,
        code: error.code || '',
        text: error.message || 'Something went wrong. Tap Retry.',
        createdAt: new Date().toISOString(),
        retryId: retryMsg?.id,
        clientMessageId,
      };
      if (!retryMsg && !regenerate) {
        const user = [...S.store.active().messages].reverse().find((item) => item.clientMessageId === clientMessageId);
        if (user) err.retryId = user.id;
      }
      S.store.addMessage(err);
      appendMessage(err);
      setVoiceState('error', err.text);
      if (error.code === 'CONFIG' || error.code === 'NETWORK' || error.code === 'NO_SERVER') {
        S.ui?.banner?.(err.text, { action: 'retry-health', label: 'Retry' });
      }
    }
  }

  function stopGeneration() {
    if (run) run.cancel();
    setGenerating(false);
    if (voiceState === 'processing') setVoiceState('idle');
  }

  async function onMic() {
    const settings = S.store.settings();
    if (!settings.voiceEnabled) {
      S.ui?.toast?.(t('voiceOff'));
      setVoiceState('error', t('voiceOff'));
      return;
    }
    if (S.voice.isListening()) {
      S.voice.stop();
      setVoiceState('idle');
      return;
    }
    if (S.tts.isSpeaking()) S.tts.stop();
    if (generating) stopGeneration();
    if (!S.voice.supported()) {
      const message = 'Speech recognition isn’t available on this device. Text chat still works.';
      setVoiceState('error', message);
      S.ui?.toast?.(message);
      return;
    }
    const allowed = await S.voice.ensureMic();
    if (!allowed) {
      const message = 'Microphone permission is off. You can still type to Sana.';
      setVoiceState('error', message);
      S.ui?.toast?.(message);
      return;
    }
    const input = $('composer-input');
    setVoiceState('listening');
    S.voice.start({
      lang: S.voice.langFor(settings.language, input?.value || ''),
      onPartial(text) {
        if (input) input.value = text;
        const liveLabel = $('live-label');
        if (liveLabel) liveLabel.textContent = text || t('listening');
        growInput();
      },
      onFinal(text) {
        if (input) input.value = text;
        growInput();
        setVoiceState('processing');
        send({ source: 'voice' });
      },
      onError(message) {
        setVoiceState('error', message);
        S.ui?.toast?.(message);
      },
      onEnd() {
        if (voiceState === 'listening') setVoiceState('idle');
      },
    });
  }

  function growInput() {
    const input = $('composer-input');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  function renderAttachments() {
    const box = $('attachment-preview');
    if (!box) return;
    box.hidden = attachments.length === 0;
    box.innerHTML = attachments
      .map((file) => {
        const preview = file.url
          ? `<img src="${file.url}" alt="">`
          : `<span class="file-badge" aria-hidden="true">${S.markdown.escapeHtml((file.name.split('.').pop() || 'file').slice(0, 4))}</span>`;
        return `<div class="attach-chip">${preview}<span>${S.markdown.escapeHtml(file.name)}</span><button type="button" data-remove="${file.id}" aria-label="Remove ${S.markdown.escapeHtml(file.name)}">×</button></div>`;
      })
      .join('');
  }

  function clearAttachments() {
    attachments.forEach((file) => {
      if (file.url) URL.revokeObjectURL(file.url);
    });
    attachments = [];
    renderAttachments();
  }

  function mimeOf(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const fromType = (file.type || '').toLowerCase();
    if (ALLOWED[fromType]) return fromType;
    return EXT[ext] || fromType;
  }

  async function addFiles(fileList) {
    const incoming = [...fileList];
    for (const file of incoming) {
      if (attachments.length >= 3) {
        S.ui?.toast?.('You can attach up to 3 files.');
        break;
      }
      const mime = mimeOf(file);
      if (!ALLOWED[mime]) {
        const ext = (file.name.split('.').pop() || 'that type').toUpperCase();
        S.ui?.toast?.(
          ext === 'HEIC' || ext === 'HEIF'
            ? 'HEIC photos aren’t supported. Save the photo as JPG, or send a screenshot.'
            : `Sana can’t read .${ext.toLowerCase()} files. Use a photo, PDF, DOCX, TXT, MD, CSV, or JSON.`
        );
        continue;
      }
      if (file.size > 4 * 1024 * 1024) {
        S.ui?.toast?.(`${file.name} is over 4 MB. Send a smaller file.`);
        continue;
      }
      const dataBase64 = await readFile(file);
      attachments.push({
        id: S.store.uuid(),
        name: file.name,
        mime,
        dataBase64,
        url: ALLOWED[mime] === 'image' ? URL.createObjectURL(file) : '',
      });
    }
    renderAttachments();
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : '');
      };
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      S.ui?.toast?.(t('copied'));
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      S.ui?.toast?.(t('copied'));
    }
  }

  async function shareText(text) {
    if (window.SanaNative && window.SanaNative.share) {
      window.SanaNative.share(text);
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ text, title: S.store.settings().assistantName || 'Sana' });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    await copyText(text);
  }

  function replay(text) {
    if (!S.store.settings().voiceEnabled) {
      S.ui?.toast?.(t('voiceOff'));
      return;
    }
    lastSpoken = text;
    setVoiceState('speaking');
    S.tts.speak(text, {
      rate: S.store.settings().speechRate,
      voiceName: S.store.settings().voiceName,
      onEnd() {
        if (voiceState === 'speaking') setVoiceState('idle');
      },
      onError(message) {
        setVoiceState('error', message);
        S.ui?.toast?.(message);
      },
    });
  }

  function findMessage(id) {
    return S.store.active().messages.find((item) => item.id === id);
  }

  function bind() {
    $('composer')?.addEventListener('submit', (event) => event.preventDefault());
    const input = $('composer-input');
    input.value = S.store.state.draft || '';
    growInput();
    input.addEventListener('input', () => {
      S.store.setDraft(input.value);
      growInput();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    $('btn-send').addEventListener('click', () => send());
    $('btn-stop').addEventListener('click', stopGeneration);
    $('btn-mic').addEventListener('click', () => onMic());
    $('btn-stop-voice').addEventListener('click', () => {
      if (voiceState === 'speaking' || S.tts.isSpeaking()) {
        S.tts.stop();
        setVoiceState('idle');
        return;
      }
      S.voice.stop();
      setVoiceState('idle');
    });
    $('btn-replay').addEventListener('click', () => {
      if (lastSpoken) replay(lastSpoken);
    });
    $('btn-attach').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (event) => {
      addFiles(event.target.files || []);
      event.target.value = '';
    });
    $('attachment-preview').addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove]');
      if (!btn) return;
      const file = attachments.find((item) => item.id === btn.dataset.remove);
      if (file?.url) URL.revokeObjectURL(file.url);
      attachments = attachments.filter((item) => item.id !== btn.dataset.remove);
      renderAttachments();
    });
    $('chat-log').addEventListener('click', async (event) => {
      const flip = event.target.closest('[data-action="flip"]');
      if (flip) {
        flip.classList.toggle('flipped');
        return;
      }
      const quiz = event.target.closest('[data-action="quiz"]');
      if (quiz) {
        const card = quiz.closest('.quiz');
        const answer = Number(card.dataset.answer);
        const pick = Number(quiz.dataset.index);
        card.querySelectorAll('.quiz-opt').forEach((opt, index) => {
          opt.disabled = true;
          if (index === answer) opt.classList.add('correct');
          else if (index === pick) opt.classList.add('wrong');
        });
        const explain = card.querySelector('.quiz-explain');
        if (explain) explain.hidden = false;
        return;
      }
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const msg = findMessage(btn.dataset.id);
      if (btn.dataset.action === 'copy-code') {
        const code = btn.closest('.code')?.querySelector('code')?.textContent || '';
        copyText(code);
        return;
      }
      if (!msg) return;
      if (btn.dataset.action === 'copy') copyText(msg.text || '');
      if (btn.dataset.action === 'share') shareText(msg.text || '');
      if (btn.dataset.action === 'replay') replay(msg.text || '');
      if (btn.dataset.action === 'regenerate') send({ regenerate: true, source: 'text' });
      if (btn.dataset.action === 'retry') send({ retryId: msg.retryId || msg.id });
      if (btn.dataset.action === 'remember') {
        try {
          await S.api.addMemory((msg.text || '').slice(0, 500));
          S.ui?.toast?.('Saved to memory.');
        } catch (error) {
          S.ui?.toast?.(error.message);
        }
      }
    });
    $('chat-log').addEventListener('scroll', () => {
      const log = $('chat-log');
      stick = log.scrollHeight - log.scrollTop - log.clientHeight < 90;
    });
    document.querySelectorAll('[data-suggest]').forEach((btn) => {
      btn.addEventListener('click', () => {
        input.value = btn.dataset.suggest;
        S.store.setDraft(input.value);
        growInput();
        send();
      });
    });
    $('chip-web').addEventListener('click', () => {
      const conv = S.store.active();
      S.store.setMode({ webSearch: !conv.webSearch });
      syncModeChips();
    });
    const connect = $('connect-save');
    if (connect) {
      connect.addEventListener('click', () => S.ui?.saveServer?.($('connect-url').value));
    }
    window.addEventListener('online', refreshHealth);
    window.addEventListener('offline', () => {
      S.ui?.banner?.('You are offline. Messages you already have are still here. Retry when you are back online.', {
        action: 'retry-health',
        label: 'Retry',
      });
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        document.documentElement.style.setProperty('--vvh', `${window.visualViewport.height}px`);
        scrollIfNeeded();
      });
    }
  }

  function applyName() {
    const name = S.store.settings().assistantName || 'Sana';
    document.querySelectorAll('[data-assistant-name]').forEach((el) => {
      el.textContent = name;
    });
  }

  S.chat = {
    init() {
      if (booted) return;
      booted = true;
      bind();
      renderAll();
      applyName();
      setVoiceState('idle');
      refreshHealth();
    },
    send,
    newChat() {
      if (generating) stopGeneration();
      if (S.tts.isSpeaking()) S.tts.stop();
      if (S.voice.isListening()) S.voice.stop();
      setVoiceState('idle');
      clearAttachments();
      S.store.newChat();
      renderAll();
      $('composer-input')?.focus();
    },
    async clearActive() {
      const id = S.store.active().id;
      S.store.deleteConversation(id);
      try {
        await S.api.deleteConversation(id);
      } catch {
        /* local clear still stands */
      }
      renderAll();
    },
    async clearAll() {
      S.store.clearAll();
      try {
        await S.api.clearConversations();
      } catch {
        /* local clear still stands */
      }
      renderAll();
    },
    openConversation(id) {
      if (generating) stopGeneration();
      S.store.openChat(id);
      renderAll();
    },
    rerender() {
      renderAll();
      applyName();
    },
    refreshHealth,
    applyName,
    isSpeaking: () => voiceState === 'speaking' || S.tts.isSpeaking(),
    isListening: () => voiceState === 'listening' || S.voice.isListening(),
    stopSpeaking() {
      S.tts.stop();
      setVoiceState('idle');
    },
    stopListening() {
      S.voice.stop();
      setVoiceState('idle');
    },
    focusInput() {
      $('composer-input')?.focus();
    },
    useStudy(task) {
      S.store.setMode({ mode: 'study', studyTask: task || S.store.active().studyTask, workTask: '' });
      syncModeChips();
      const input = $('composer-input');
      if ((input?.value || '').trim() || attachments.length) send();
      else input?.focus();
    },
    useWork(task) {
      S.store.setMode({ mode: 'work', workTask: task || '', studyTask: '' });
      syncModeChips();
      const input = $('composer-input');
      if ((input?.value || '').trim() || attachments.length) send();
      else input?.focus();
    },
    setLevel(level) {
      S.store.setMode({ mode: 'study', studyLevel: level });
      syncModeChips();
    },
    exitMode() {
      S.store.setMode({ mode: 'chat', studyTask: '', workTask: '' });
      syncModeChips();
    },
    conversations: () => S.store.state.conversations,
  };
})(window.Sana = window.Sana || {});
