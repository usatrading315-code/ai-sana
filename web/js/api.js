(function (S) {
  function base() {
    try {
      if (window.SanaNative && window.SanaNative.getApiBase) {
        const native = window.SanaNative.getApiBase();
        if (native) return String(native).replace(/\/$/, '');
      }
    } catch {
      /* bridge not ready */
    }
    if (window.SANA_API_BASE) return String(window.SANA_API_BASE).replace(/\/$/, '');
    if (location.protocol === 'file:') return '';
    return '';
  }

  function url(path) {
    return `${base()}${path}`;
  }

  function needsServer() {
    return location.protocol === 'file:' && !base();
  }

  async function request(path, options = {}) {
    if (needsServer()) {
      const error = new Error('Connect Sana’s server in Settings. Do not paste an API key here.');
      error.code = 'NO_SERVER';
      throw error;
    }
    let response;
    try {
      response = await fetch(url(path), {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      });
    } catch (error) {
      const wrapped = new Error(
        navigator.onLine
          ? 'Can’t reach Sana’s server. Check the connection and try again.'
          : 'You are offline. This chat is still here. Retry when you are back online.'
      );
      wrapped.code = 'NETWORK';
      wrapped.cause = error;
      throw wrapped;
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Something went wrong. Tap Retry.');
        error.code = data.error?.code || 'SERVER';
        error.status = response.status;
        throw error;
      }
      return data;
    }
    if (!response.ok) {
      const error = new Error('Something went wrong. Tap Retry.');
      error.code = 'SERVER';
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function health() {
    return request('/api/v1/health', { method: 'GET', headers: { Accept: 'application/json' } });
  }

  async function chat(body, handlers) {
    const controller = new AbortController();
    const stream = typeof ReadableStream !== 'undefined';
    const payload = { ...body, stream };
    const responsePromise = fetch(url('/api/v1/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const handle = {
      cancel() {
        controller.abort();
        fetch(url('/api/v1/chat/cancel'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestId: body.requestId }),
        }).catch(() => {});
      },
    };
    handlers.onStarted?.(handle);
    let response;
    try {
      response = await responsePromise;
    } catch (error) {
      if (error.name === 'AbortError') {
        const aborted = new Error('Stopped');
        aborted.name = 'AbortError';
        throw aborted;
      }
      const wrapped = new Error(
        navigator.onLine
          ? 'Can’t reach Sana’s server. Your message is still here. Tap Retry.'
          : 'You are offline. Your message is still here. Tap Retry when you are back online.'
      );
      wrapped.code = 'NETWORK';
      throw wrapped;
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json') || !stream) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Sana couldn’t answer. Tap Retry.');
        error.code = data.error?.code || 'SERVER';
        throw error;
      }
      if (data.text) handlers.onToken?.(data.text);
      handlers.onDone?.(data);
      return data;
    }
    if (!response.ok || !response.body) {
      const error = new Error('Sana couldn’t answer. Tap Retry.');
      error.code = 'SERVER';
      throw error;
    }
    await readSse(response, handlers, controller.signal);
    return null;
  }

  async function readSse(response, handlers, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      if (signal.aborted) throw Object.assign(new Error('Stopped'), { name: 'AbortError' });
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf('\n\n');
      while (split >= 0) {
        const raw = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        let event = 'message';
        const dataLines = [];
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) {
          split = buffer.indexOf('\n\n');
          continue;
        }
        let json = {};
        try {
          json = JSON.parse(dataLines.join(''));
        } catch {
          split = buffer.indexOf('\n\n');
          continue;
        }
        if (event === 'token') handlers.onToken?.(json.text || '');
        else if (event === 'status') handlers.onStatus?.(json);
        else if (event === 'done') handlers.onDone?.(json);
        else if (event === 'error') {
          const error = new Error(json.message || 'Sana couldn’t answer. Tap Retry.');
          error.code = json.code || 'SERVER';
          throw error;
        }
        split = buffer.indexOf('\n\n');
      }
    }
  }

  function deviceQuery() {
    return `deviceId=${encodeURIComponent(S.store.deviceId())}`;
  }

  S.api = {
    base,
    needsServer,
    health,
    chat,
    conversations() {
      return request(`/api/v1/conversations?${deviceQuery()}`, { method: 'GET' });
    },
    conversation(id) {
      return request(`/api/v1/conversations/${id}?${deviceQuery()}`, { method: 'GET' });
    },
    deleteConversation(id) {
      return request(`/api/v1/conversations/${id}?${deviceQuery()}`, { method: 'DELETE' });
    },
    clearConversations() {
      return request(`/api/v1/conversations?${deviceQuery()}`, { method: 'DELETE' });
    },
    memories() {
      return request(`/api/v1/memory?${deviceQuery()}`, { method: 'GET' });
    },
    addMemory(content) {
      return request('/api/v1/memory', {
        method: 'POST',
        body: JSON.stringify({ deviceId: S.store.deviceId(), content }),
      });
    },
    updateMemory(id, content) {
      return request(`/api/v1/memory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ deviceId: S.store.deviceId(), content }),
      });
    },
    deleteMemory(id) {
      return request(`/api/v1/memory/${id}?${deviceQuery()}`, { method: 'DELETE' });
    },
    clearMemory() {
      return request(`/api/v1/memory?${deviceQuery()}`, { method: 'DELETE' });
    },
  };
})(window.Sana = window.Sana || {});
