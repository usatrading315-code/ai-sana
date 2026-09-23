import { AppError, sanitizeError } from './security.js';

function withTimeout(userSignal, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), ms);
  const onAbort = () => controller.abort('cancel');
  if (userSignal) {
    if (userSignal.aborted) onAbort();
    else userSignal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
      userSignal?.removeEventListener('abort', onAbort);
    },
  };
}

function throwIfAborted(signal) {
  if (!signal?.aborted) return;
  if (signal.reason === 'timeout') {
    throw new AppError('TIMEOUT', 'The AI service took too long. Your message is still here — tap Retry.', 504);
  }
  throw abortError();
}

export async function streamCompletion({ cfg, messages, images, signal, onToken }) {
  if (cfg.provider === 'mock') return mockComplete({ messages, images, onToken });
  if (!cfg.apiKey) {
    throw new AppError(
      'CONFIG',
      'Sana is not configured yet. Set GEMINI_API_KEY (or AI_API_KEY) on the server. The key stays on the server and is never shown in the app.',
      503
    );
  }
  const model = images?.length && cfg.visionModel ? cfg.visionModel : cfg.model;
  const timed = withTimeout(signal, cfg.timeoutMs);
  try {
    throwIfAborted(timed.signal);
    if (cfg.provider === 'anthropic') {
      return await streamAnthropic({ cfg, model, messages, images, signal: timed.signal, onToken });
    }
    if (cfg.provider === 'gemini') {
      return await streamGemini({ cfg, model, messages, images, signal: timed.signal, onToken });
    }
    return await streamOpenAI({ cfg, model, messages, images, signal: timed.signal, onToken });
  } catch (error) {
    if (timed.signal.reason === 'timeout') {
      throw new AppError('TIMEOUT', 'The AI service took too long. Your message is still here — tap Retry.', 504);
    }
    if (error?.name === 'AbortError') throw error;
    if (error instanceof AppError) throw error;
    const message = sanitizeError(error?.message || '');
    if (/image|vision|multimodal|unsupported/i.test(message) && images?.length) {
      throw new AppError(
        'UNSUPPORTED_FILE',
        'The configured model refused the image. Set AI_VISION_MODEL to a vision-capable model. Sana did not pretend to see the image.',
        415
      );
    }
    throw new AppError('UPSTREAM', upstreamMessage(0, message), 502);
  } finally {
    timed.clear();
  }
}

async function streamOpenAI({ cfg, model, messages, images, signal, onToken, retried = false }) {
  const payload = {
    model,
    messages: toOpenAI(messages, images),
    stream: true,
    temperature: 0.7,
  };
  if (retried) payload.max_completion_tokens = cfg.maxTokens;
  else payload.max_tokens = cfg.maxTokens;
  const response = await fetch(openAIUrl(cfg.baseUrl), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const detail = sanitizeError(await response.text());
    if (!retried && /max_completion_tokens|max_tokens/i.test(detail)) {
      return streamOpenAI({ cfg, model, messages, images, signal, onToken, retried: true });
    }
    throw new AppError(codeForStatus(response.status), upstreamMessage(response.status, detail), statusFor(response.status));
  }
  await readSse(response, signal, (data) => {
    if (data === '[DONE]') return 'done';
    const json = parseJson(data);
    const token = json?.choices?.[0]?.delta?.content || '';
    if (token) onToken(token);
    return null;
  });
}

async function streamAnthropic({ cfg, model, messages, images, signal, onToken }) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
  const chat = toAnthropic(messages.filter((item) => item.role !== 'system'), images);
  const response = await fetch(joinUrl(cfg.baseUrl || 'https://api.anthropic.com', '/v1/messages'), {
    method: 'POST',
    headers: {
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: cfg.maxTokens,
      temperature: 0.7,
      system,
      messages: chat,
      stream: true,
    }),
    signal,
  });
  if (!response.ok) {
    const detail = sanitizeError(await response.text());
    throw new AppError(codeForStatus(response.status), upstreamMessage(response.status, detail), statusFor(response.status));
  }
  await readSse(response, signal, (data) => {
    const json = parseJson(data);
    const token = json?.delta?.text || '';
    if (token) onToken(token);
    return null;
  });
}

function logUpstream(status, detail, model) {
  console.log(JSON.stringify({
    event: 'upstream',
    provider: 'gemini',
    httpStatus: Number(status) || 0,
    model: String(model || ''),
    reason: sanitizeError(detail).slice(0, 240),
  }));
}

function geminiAuthFailure(detail) {
  return /api key not valid|api key invalid|permission denied|unregistered caller|invalid api key/i.test(sanitizeError(detail));
}

async function streamGemini({ cfg, model, messages, images, signal, onToken, attempt = 0 }) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
  const contents = toGemini(messages.filter((item) => item.role !== 'system'), images);
  const url = attempt < 2 ? geminiStreamUrl(cfg.baseUrl, model) : geminiGenerateUrl(cfg.baseUrl, model);
  const thinking = attempt === 0 ? geminiThinking(model, cfg.thinking) : null;
  const body = {
    contents,
  };
  if (attempt < 2 && system) body.systemInstruction = { parts: [{ text: system }] };
  if (attempt < 2) body.generationConfig = geminiGenerationConfig(cfg, thinking, model, attempt);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': cfg.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const detail = sanitizeError(await response.text());
    logUpstream(response.status, detail, model);
    if (images?.length && response.status === 400 && /image|inline|mime|unsupported|invalid/i.test(detail)) {
      throw new AppError(
        'UNSUPPORTED_FILE',
        'The configured Gemini model refused the image. Sana did not pretend to see it. Try a JPG or PNG, or set AI_VISION_MODEL to a vision-capable Gemini model.',
        415
      );
    }
    if (attempt < 2 && response.status === 400 && !geminiAuthFailure(detail)) {
      return streamGemini({ cfg, model, messages, images, signal, onToken, attempt: attempt + 1 });
    }
    throw new AppError(codeForStatus(response.status, detail), upstreamMessage(response.status, detail), statusFor(response.status, detail));
  }
  const collected = await readGeminiBody(response, signal, onToken);
  throwIfAborted(signal);
  if (!collected.text.trim()) {
    throw new AppError('EMPTY', geminiEmptyMessage(collected.blocked, collected.finish), 502);
  }
}

function mockComplete({ messages, images, onToken }) {
  const users = messages.filter((item) => item.role === 'user').map((item) => item.content);
  const latest = users[users.length - 1] || '';
  const previous = users.slice(0, -1).join('\n');
  let text;
  if (process.env.AI_MOCK_DEBUG === '1') {
    text = `DEBUG ${JSON.stringify({
      users: users.map((item) => item.slice(0, 240)),
      images: images?.length || 0,
    })}`;
  } else if (/example do|example dena|ek example/i.test(latest) && /python/i.test(previous)) {
    text = 'Bilkul. Python variable ka example:\n\n```python\nname = "Sana"\nage = 1\nprint(name, age)\n```\n\nYahan `name` aur `age` variables hain — unme value store hoti hai.';
  } else if (/variables samjhao|variable samjhao/i.test(latest) && /python/i.test(previous + latest)) {
    text = 'Python mein variable ek naam hota hai jisme value rakhi jaati hai. Jaise `city = "Gorakhpur"`. Naam baad mein change nahi hota, value change ho sakti hai.';
  } else if (/[\u0900-\u097F]/.test(latest) || /simple hindi/i.test(latest)) {
    text = 'प्रकाश संश्लेषण वह प्रक्रिया है जिसमें पौधे सूरज की रोशनी से अपना भोजन बनाते हैं। पत्ते कार्बन डाइऑक्साइड और पानी लेते हैं, और ग्लूकोज तथा ऑक्सीजन बनाते हैं।\n\n$$6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2$$';
  } else if (/\b(hai|mujhe|padhna|samjhao|kal)\b/i.test(latest)) {
    text = 'Bilkul, ho jayega. Tum batao kis chapter ka doubt hai — main usi se aage badhti hoon, dobara poora topic nahi puchungi.';
  } else {
    text = 'Here is a direct answer based on this conversation. I will stay with the same topic if you ask a follow-up.';
  }
  if (images?.length && !process.env.AI_MOCK_DEBUG) {
    text = `I can see the attached image (${images.length}). ${text}`;
  }
  onToken(text);
  return text;
}

function toOpenAI(messages, images) {
  const mapped = messages.map((item) => ({ role: item.role, content: item.content }));
  if (images?.length) {
    for (let i = mapped.length - 1; i >= 0; i -= 1) {
      if (mapped[i].role === 'user') {
        mapped[i] = {
          role: 'user',
          content: [
            { type: 'text', text: mapped[i].content },
            ...images.map((image) => ({
              type: 'image_url',
              image_url: { url: `data:${image.mime};base64,${image.dataBase64}` },
            })),
          ],
        };
        break;
      }
    }
  }
  return mapped;
}

function toAnthropic(messages, images) {
  const mapped = messages.map((item) => ({
    role: item.role === 'assistant' ? 'assistant' : 'user',
    content: item.content,
  }));
  if (images?.length) {
    for (let i = mapped.length - 1; i >= 0; i -= 1) {
      if (mapped[i].role === 'user') {
        mapped[i] = {
          role: 'user',
          content: [
            { type: 'text', text: String(mapped[i].content) },
            ...images.map((image) => ({
              type: 'image',
              source: { type: 'base64', media_type: image.mime, data: image.dataBase64 },
            })),
          ],
        };
        break;
      }
    }
  }
  return mergeRoles(mapped);
}

function toGemini(messages, images) {
  const contents = [];
  for (const item of messages) {
    const role = item.role === 'assistant' ? 'model' : 'user';
    const text = String(item.content || '').trim();
    if (!text) continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) prev.parts[0].text += `\n\n${text}`;
    else contents.push({ role, parts: [{ text }] });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();
  if (!contents.length) throw new AppError('BAD_REQUEST', 'There is no message to send.', 400);
  if (images?.length) {
    const last = contents[contents.length - 1];
    if (last.role !== 'user') {
      throw new AppError(
        'UNSUPPORTED_FILE',
        'Sana could not attach the image to this turn. Send the photo again. Nothing was invented from it.',
        415
      );
    }
    last.parts.push(
      ...images.map((image) => ({
        inlineData: { mimeType: image.mime, data: image.dataBase64 },
      }))
    );
  }
  return contents;
}

export function geminiStreamUrl(baseUrl, model) {
  const fallback = 'https://generativelanguage.googleapis.com/v1beta';
  let base = String(baseUrl || fallback).trim();
  try {
    const url = new URL(base);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    base = url.toString().replace(/\/+$/, '');
  } catch {
    base = base.split('#')[0].split('?')[0].replace(/\/+$/, '');
  }
  if (!base) base = fallback;
  if (base.includes(':streamGenerateContent')) return `${base}?alt=sse`;
  if (/\/models\/[^/]+$/.test(base)) return `${base}:streamGenerateContent?alt=sse`;
  return `${base}/models/${encodeURIComponent(model || 'gemini-3.8-flash')}:streamGenerateContent?alt=sse`;
}

export function geminiGenerateUrl(baseUrl, model) {
  return geminiStreamUrl(baseUrl, model).replace(':streamGenerateContent?alt=sse', ':generateContent');
}

function geminiThinking(model, level) {
  const name = String(model || '').toLowerCase();
  const requested = String(level || 'low').toLowerCase();
  if (/gemini-3/.test(name)) {
    const allowed = requested === 'high' || requested === 'medium' ? requested : 'low';
    return { thinkingLevel: allowed };
  }
  if (/gemini-2\.5/.test(name)) {
    const budget = requested === 'high' ? 2048 : requested === 'medium' ? 1024 : 512;
    return { thinkingBudget: budget };
  }
  return null;
}

function geminiGenerationConfig(cfg, thinking, model, attempt = 0) {
  const name = String(model || cfg.model || '').toLowerCase();
  const generationConfig = {};
  // Gemini 3 is tuned for the default temperature of 1.0. Sending 0.7 can be rejected.
  if (!/gemini-3/.test(name)) generationConfig.temperature = 0.7;
  // Gemini 3 counts thinking against maxOutputTokens. Leave the limit unset
  // so a low cap cannot consume the whole reply before any answer text.
  if (attempt === 0 && !/gemini-3/.test(name)) {
    generationConfig.maxOutputTokens = cfg.maxTokens;
  }
  if (thinking) generationConfig.thinkingConfig = thinking;
  return generationConfig;
}

function geminiEmptyMessage(blocked, finish) {
  const reason = String(blocked || finish || '').toUpperCase();
  if (/SAFETY|BLOCK|PROHIBITED|RECITATION/.test(reason)) {
    return 'Gemini blocked that request. Try rephrasing it. Sana did not invent an answer.';
  }
  if (reason === 'MAX_TOKENS') {
    return 'Gemini used the reply limit before any answer arrived. Your message is still here — tap Retry.';
  }
  return 'Gemini returned no answer. Your message is still here — tap Retry. Sana did not invent a reply.';
}

async function readGeminiBody(response, signal, onToken) {
  const type = response.headers.get('content-type') || '';
  const collected = { text: '', blocked: '', finish: '' };
  const take = (json) => {
    if (!json || typeof json !== 'object') return;
    if (json.error) {
      const status = Number(json.error.code) || 502;
      const detail = sanitizeError(json.error.message || '');
      throw new AppError(codeForStatus(status), upstreamMessage(status, detail), statusFor(status));
    }
    if (json.promptFeedback?.blockReason) collected.blocked = String(json.promptFeedback.blockReason);
    const candidate = json.candidates?.[0];
    if (candidate?.finishReason) collected.finish = String(candidate.finishReason);
    for (const part of candidate?.content?.parts || []) {
      if (part.thought === true) continue;
      if (part.text) {
        collected.text += part.text;
        onToken(part.text);
      }
    }
  };
  if (type.includes('application/json') && !type.includes('event-stream')) {
    const data = await response.json();
    const events = Array.isArray(data) ? data : [data];
    for (const event of events) take(event);
    return collected;
  }
  await readSse(response, signal, (data) => {
    take(parseJson(data));
    return null;
  });
  return collected;
}

function mergeRoles(messages) {
  const merged = [];
  for (const item of messages) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role && typeof prev.content === 'string' && typeof item.content === 'string') {
      prev.content += `\n\n${item.content}`;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

export function openAIUrl(baseUrl) {
  const base = String(baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  if (/\/v\d+$/.test(base) || base.endsWith('/v1') || base.includes('/openai/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function joinUrl(base, suffix) {
  const root = String(base || '').replace(/\/+$/, '');
  if (root.endsWith(suffix)) return root;
  if (suffix === '/v1/messages' && root.endsWith('/v1')) return `${root}/messages`;
  return `${root}${suffix}`;
}

async function readSse(response, signal, onData) {
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('UPSTREAM', 'The AI service returned an empty response.', 502);
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    if (signal?.aborted) throw abortError();
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n');
    buffer = chunks.pop() || '';
    if (consumeSseLines(chunks, onData)) return;
  }
  if (buffer.trim()) consumeSseLines([buffer], onData);
}

function consumeSseLines(lines, onData) {
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const data = trimmed.slice(5).trim();
    if (!data) continue;
    if (onData(data) === 'done') return true;
  }
  return false;
}

function parseJson(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function codeForStatus(status, detail = '') {
  if (status === 401 || status === 403 || geminiAuthFailure(detail)) return 'AUTH';
  if (status === 404) return 'MODEL';
  if (status === 429) return 'BUSY';
  if (status === 408) return 'TIMEOUT';
  return 'UPSTREAM';
}

function statusFor(status, detail = '') {
  if (status === 401 || status === 403 || geminiAuthFailure(detail)) return 502;
  if (status === 429) return 429;
  if (status === 404) return 502;
  return 502;
}

function upstreamMessage(status, detail) {
  const clean = sanitizeError(detail);
  if (status === 401 || status === 403 || geminiAuthFailure(clean)) {
    return 'The AI service rejected the server credentials. Check GEMINI_API_KEY on the server. The key is not shown here.';
  }
  if (status === 404) return 'The configured model was not found. Check AI_MODEL on the server.';
  if (status === 429) return 'The AI service is busy right now. Your message is still here — retry in a moment.';
  if (/timeout|timed out/i.test(clean)) return 'The AI service took too long. Your message is still here — tap Retry.';
  if (status === 0 && /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(clean)) {
    return 'Can’t reach the AI service. Check the internet connection and try again.';
  }
  const statusNote = status ? ` Gemini HTTP ${status}.` : '';
  return `Sana couldn’t complete that reply.${statusNote} Your message is still here — tap Retry.`;
}

function abortError() {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}
