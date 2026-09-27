import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-test-'));
process.env.SANA_DATA_DIR = dataDir;
process.env.AI_API_KEY = 'sk-test-not-a-real-key';
process.env.AI_PROVIDER = 'mock';
process.env.AI_ALLOW_MOCK = '1';
process.env.AI_MOCK_DEBUG = '1';
process.env.AI_BASE_URL = 'https://api.openai.com/v1';
process.env.AI_MODEL = 'gpt-4o-mini';
process.env.AI_VISION = 'auto';
process.env.PORT = '0';

const { createApp } = await import('../src/index.js');
const { detectLanguage, looksSensitive, sanitizeError } = await import('../src/security.js');
const { openAIUrl, geminiStreamUrl } = await import('../src/providers.js');
const { parseDdg, parseInstantAnswer } = await import('../src/search.js');
const { extractPdfFallback } = await import('../src/documents.js');

function uuid() {
  return cryptoRandom();
}
function cryptoRandom() {
  const bytes = cryptoBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function cryptoBytes(n) {
  const { randomFillSync } = awaitImportCrypto();
  const buf = Buffer.alloc(n);
  randomFillSync(buf);
  return buf;
}
import { randomFillSync } from 'node:crypto';
function awaitImportCrypto() {
  return { randomFillSync };
}

let server;
let base;

test.before(async () => {
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function post(pathname, body, headers = {}) {
  const response = await fetch(`${base}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify({ stream: false, ...body }),
  });
  const data = await response.json();
  return { status: response.status, data };
}

function chatBody(deviceId, conversationId, message, extra = {}) {
  return {
    deviceId,
    conversationId,
    message,
    clientMessageId: uuid(),
    mode: 'chat',
    language: 'auto',
    ...extra,
  };
}

test('startup health does not leak the API key', async () => {
  const response = await fetch(`${base}/api/v1/health`);
  const data = await response.json();
  const raw = JSON.stringify(data);
  assert.equal(response.status, 200);
  assert.equal(data.service, 'sana-ai');
  assert.equal(data.aiConfigured, true);
  assert.equal(raw.includes('sk-test-not-a-real-key'), false);
  assert.equal(raw.includes('AI_API_KEY'), false);
});

test('language detection for Hindi, Hinglish, and English', () => {
  assert.equal(detectLanguage('प्रकाश संश्लेषण समझाओ'), 'hi');
  assert.equal(detectLanguage('Kal mujhe maths ka chapter padhna hai'), 'hinglish');
  assert.equal(detectLanguage('Variables samjhao'), 'hinglish');
  assert.equal(detectLanguage('Write Python code for a calculator.'), 'en');
  assert.equal(detectLanguage('Explain photosynthesis in simple Hindi.'), 'en');
});

test('sensitive memory filter and error redaction', () => {
  assert.equal(looksSensitive('remember my password is hunter2'), true);
  assert.equal(looksSensitive('I am in class 12'), false);
  assert.equal(sanitizeError('bad key sk-supersecretvalue123456').includes('sk-supersecret'), false);
  assert.match(sanitizeError('bad key sk-supersecretvalue123456'), /redacted/);
});

test('provider URL join does not append twice', () => {
  assert.equal(openAIUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(
    openAIUrl('https://api.groq.com/openai/v1/chat/completions'),
    'https://api.groq.com/openai/v1/chat/completions'
  );
  const gemini = geminiStreamUrl(
    'https://generativelanguage.googleapis.com/v1beta?key=AIzaSHOULDNOTAPPEAR1234567890',
    'gemini-3.8-flash'
  );
  assert.equal(
    gemini,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent?alt=sse'
  );
  assert.equal(gemini.includes('AIza'), false);
  assert.equal(gemini.includes('key='), false);
});

test('search parser and pdf fallback do not invent results', () => {
  const html = `<a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnotes">Photosynthesis</a><a class="result__snippet">Plant notes</a>`;
  const results = parseDdg(html);
  assert.equal(results[0].url, 'https://example.com/notes');
  assert.equal(results[0].title, 'Photosynthesis');
  const pdf = Buffer.from('BT (Photosynthesis test note) Tj ET', 'latin1');
  assert.match(extractPdfFallback(pdf), /Photosynthesis test note/);
  assert.equal(parseDdg('<html>nothing</html>').length, 0);
  const instant = parseInstantAnswer({
    Heading: 'Photosynthesis',
    Abstract: 'Plants make food from light.',
    AbstractURL: 'https://en.wikipedia.org/wiki/Photosynthesis',
    RelatedTopics: [
      { Text: 'No url here' },
      { FirstURL: 'not-a-url', Text: 'Skipped' },
      { Topics: [{ Text: 'Chlorophyll', FirstURL: 'https://example.com/chlorophyll' }] },
    ],
  });
  assert.equal(instant.length, 2);
  assert.equal(instant[0].url, 'https://en.wikipedia.org/wiki/Photosynthesis');
  assert.equal(instant.some((item) => item.url === 'https://example.com/chlorophyll'), true);
  assert.equal(parseInstantAnswer({ Abstract: 'No source' }).length, 0);
});

test('text chat, Hindi, Hinglish, English, and follow-up context stay in one conversation', async () => {
  const deviceId = uuid();
  const conversationId = uuid();
  const first = await post('/api/v1/chat', chatBody(deviceId, conversationId, 'Sana, mujhe Python sikhna hai.'));
  assert.equal(first.status, 200);
  const users = JSON.parse(first.data.text.replace(/^DEBUG /, '')).users;
  assert.equal(users.length, 1);
  assert.match(users[0], /Python/);

  const second = await post('/api/v1/chat', chatBody(deviceId, conversationId, 'Variables samjhao'));
  const again = JSON.parse(second.data.text.replace(/^DEBUG /, '')).users;
  assert.equal(again.length, 2);
  assert.match(again[0], /Python/);
  assert.match(again[1], /Variables/);

  const hindi = await post('/api/v1/chat', chatBody(deviceId, conversationId, 'प्रकाश संश्लेषण समझाओ'));
  assert.equal(hindi.status, 200);
  const english = await post(
    '/api/v1/chat',
    chatBody(deviceId, conversationId, 'Write Python code for a calculator.')
  );
  const all = JSON.parse(english.data.text.replace(/^DEBUG /, '')).users;
  assert.equal(all.length, 4);
  assert.match(all[3], /calculator/);
});

test('new chat does not mix old conversation context', async () => {
  const deviceId = uuid();
  const oldId = uuid();
  const freshId = uuid();
  await post('/api/v1/chat', chatBody(deviceId, oldId, 'Sana, mujhe Python sikhna hai.'));
  const fresh = await post('/api/v1/chat', chatBody(deviceId, freshId, 'Example do'));
  const users = JSON.parse(fresh.data.text.replace(/^DEBUG /, '')).users;
  assert.equal(users.length, 1);
  assert.equal(users.some((item) => /Python/i.test(item)), false);
});

test('API error and missing key never reveal the secret', async () => {
  const leak = 'sk-supersecretvalue123456';
  const upstream = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `bad key ${leak}` } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    base: process.env.AI_BASE_URL,
    key: process.env.AI_API_KEY,
  };
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_ALLOW_MOCK = '0';
  process.env.AI_API_KEY = leak;
  process.env.AI_BASE_URL = `http://127.0.0.1:${upstream.address().port}/v1`;
  try {
    const result = await post('/api/v1/chat', chatBody(uuid(), uuid(), 'Hello'));
    const raw = JSON.stringify(result.data);
    assert.equal(result.status, 502);
    assert.equal(result.data.error.code, 'AUTH');
    assert.equal(raw.includes(leak), false);
    assert.match(result.data.error.message, /key is not shown/i);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_BASE_URL = previous.base;
    process.env.AI_API_KEY = previous.key;
    upstream.close();
  }
});

test('unconfigured server returns a clear error and does not crash', async () => {
  const previous = process.env.AI_API_KEY;
  const provider = process.env.AI_PROVIDER;
  process.env.AI_API_KEY = '';
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_ALLOW_MOCK = '0';
  try {
    const result = await post('/api/v1/chat', chatBody(uuid(), uuid(), 'Hello'));
    assert.equal(result.status, 503);
    assert.equal(result.data.error.code, 'CONFIG');
    assert.match(result.data.error.message, /AI_API_KEY/);
    assert.equal(JSON.stringify(result.data).includes('sk-'), false);
  } finally {
    process.env.AI_API_KEY = previous;
    process.env.AI_PROVIDER = provider;
    process.env.AI_ALLOW_MOCK = '1';
  }
});

test('internet failure is a safe message', async () => {
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    base: process.env.AI_BASE_URL,
  };
  process.env.AI_PROVIDER = 'openai';
  process.env.AI_ALLOW_MOCK = '0';
  process.env.AI_BASE_URL = 'http://127.0.0.1:9/v1';
  try {
    const result = await post('/api/v1/chat', chatBody(uuid(), uuid(), 'Hello from a dead port'));
    assert.equal(result.status, 502);
    assert.match(result.data.error.message, /reach|connection|retry/i);
    assert.equal(JSON.stringify(result.data).includes(process.env.AI_API_KEY), false);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_BASE_URL = previous.base;
  }
});

test('unsupported file is rejected instead of pretending it worked', async () => {
  const result = await post(
    '/api/v1/chat',
    chatBody(uuid(), uuid(), 'Read this', {
      attachments: [{ name: 'virus.exe', mime: 'application/octet-stream', dataBase64: 'AAAA' }],
    })
  );
  assert.equal(result.status, 415);
  assert.equal(result.data.error.code, 'UNSUPPORTED_FILE');
});

test('image is refused when vision is off', async () => {
  process.env.AI_VISION = 'off';
  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const result = await post(
      '/api/v1/chat',
      chatBody(uuid(), uuid(), 'Solve this photo', {
        attachments: [{ name: 'q.png', mime: 'image/png', dataBase64: png }],
      })
    );
    assert.equal(result.status, 415);
    assert.match(result.data.error.message, /vision/i);
    assert.doesNotMatch(result.data.error.message, /I can see/);
  } finally {
    process.env.AI_VISION = 'auto';
  }
});

test('text document is actually read', async () => {
  process.env.AI_MOCK_DEBUG = '1';
  const note = Buffer.from('Chapter 1: photosynthesis in leaves', 'utf8').toString('base64');
  const result = await post(
    '/api/v1/chat',
    chatBody(uuid(), uuid(), 'Summarize this', {
      attachments: [{ name: 'notes.txt', mime: 'text/plain', dataBase64: note }],
    })
  );
  assert.equal(result.status, 200);
  const users = JSON.parse(result.data.text.replace(/^DEBUG /, '')).users;
  assert.match(users[0], /photosynthesis in leaves/);
});

test('explicit memory can be saved, edited, and cleared, but secrets cannot', async () => {
  const deviceId = uuid();
  const saved = await post('/api/v1/memory', { deviceId, content: 'I am in class 12' });
  assert.equal(saved.status, 201);
  const secret = await post('/api/v1/memory', { deviceId, content: 'my password is hunter2' });
  assert.equal(secret.status, 400);
  assert.equal(secret.data.error.code, 'SENSITIVE');
  const list = await fetch(`${base}/api/v1/memory?deviceId=${deviceId}`);
  const memories = await list.json();
  assert.equal(memories.memories.length, 1);
  assert.equal(JSON.stringify(memories).includes('hunter2'), false);
  const edited = await fetch(`${base}/api/v1/memory/${saved.data.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceId, content: 'I am in class 12, science' }),
  });
  assert.equal(edited.status, 200);
  const remembered = await post('/api/v1/chat', chatBody(deviceId, uuid(), 'yaad rakho ki mera exam Friday ko hai'));
  assert.equal(remembered.status, 200);
  const after = await (await fetch(`${base}/api/v1/memory?deviceId=${deviceId}`)).json();
  assert.equal(after.memories.some((item) => /Friday/i.test(item.content)), true);
  const cleared = await fetch(`${base}/api/v1/memory?deviceId=${deviceId}`, { method: 'DELETE' });
  assert.equal(cleared.status, 200);
  const empty = await (await fetch(`${base}/api/v1/memory?deviceId=${deviceId}`)).json();
  assert.equal(empty.memories.length, 0);
});

test('clear conversation and empty input are handled', async () => {
  const deviceId = uuid();
  const conversationId = uuid();
  await post('/api/v1/chat', chatBody(deviceId, conversationId, 'Hello Sana'));
  const empty = await post('/api/v1/chat', chatBody(deviceId, uuid(), '   '));
  assert.equal(empty.status, 400);
  const removed = await fetch(`${base}/api/v1/conversations/${conversationId}?deviceId=${deviceId}`, {
    method: 'DELETE',
  });
  assert.equal(removed.status, 200);
  const missing = await fetch(`${base}/api/v1/conversations/${conversationId}?deviceId=${deviceId}`);
  assert.equal(missing.status, 404);
});

test('another device cannot read a conversation', async () => {
  const owner = uuid();
  const other = uuid();
  const conversationId = uuid();
  await post('/api/v1/chat', chatBody(owner, conversationId, 'Private note'));
  const stolen = await fetch(`${base}/api/v1/conversations/${conversationId}?deviceId=${other}`);
  assert.equal(stolen.status, 403);
});

test('app shell includes the required assistant controls', () => {
  const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
  for (const id of [
    'btn-new-chat',
    'btn-mic',
    'btn-send',
    'btn-stop',
    'composer-input',
    'chat-log',
    'setting-language',
    'setting-voice',
    'setting-rate',
    'setting-autoread',
    'setting-theme',
    'btn-clear-chats',
    'api-status',
    'onboarding',
    'voice-state',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Hi, I'm Sana 👋/);
  assert.match(html, /Your AI assistant and study companion\./);
  assert.match(html, /Chat with Sana/);
  assert.match(html, /Talk using the microphone/);
  assert.match(html, /Ask study questions/);
  assert.match(html, /Get help with work and coding/);
  const appJs = fs.readFileSync(path.join(root, 'web', 'js', 'app.js'), 'utf8');
  assert.match(appJs, /function handleBack/);
  assert.match(appJs, /data-theme/);
});

test('client and Android project do not hard-code an API key', () => {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'data') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|html|css|kt|xml|kts|md|example)$/.test(entry.name)) files.push(full);
    }
  }
  walk(path.join(root, 'web'));
  walk(path.join(root, 'android'));
  walk(path.join(root, 'backend', 'src'));
  const secret = /sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z\-_]{20,}/;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(secret.test(text), false, file);
  }
});

test('legacy chat routes keep conversation_id on the same conversation', async () => {
  const deviceId = uuid();
  const conversationId = uuid();
  const first = await post('/api/chat', {
    device_id: deviceId,
    conversation_id: conversationId,
    message: 'Sana, mujhe Python sikhna hai.',
  });
  assert.equal(first.status, 200);
  assert.equal(first.data.conversationId, conversationId);
  assert.equal(first.data.conversation_id, conversationId);
  const second = await post('/api/assistant/chat', {
    deviceId,
    conversationId,
    message: 'Example do',
  });
  assert.equal(second.status, 200);
  const users = JSON.parse(second.data.text.replace(/^DEBUG /, '')).users;
  assert.equal(users.length, 2);
  assert.match(users[0], /Python/);
  assert.equal(second.data.conversation_id, conversationId);
});

test('gemini stream skips thoughts, keeps the key off the URL, and does not invent a blocked answer', async () => {
  const leak = 'AIzaFAKEKEY1234567890SECRET';
  let seen = null;
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    seen = { url: req.url, key: req.headers['x-goog-api-key'], auth: req.headers.authorization || '', body };
    if (String(req.url).includes('/blocked/')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"promptFeedback":{"blockReason":"SAFETY"}}');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(
      'data: {"candidates":[{"content":{"parts":[{"text":"hidden thought","thought":true},{"text":"2 + 2 = 4"}]}}]}'
    );
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    base: process.env.AI_BASE_URL,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  };
  process.env.AI_PROVIDER = 'gemini';
  process.env.AI_ALLOW_MOCK = '0';
  process.env.AI_API_KEY = leak;
  process.env.AI_MODEL = 'gemini-3.8-flash';
  process.env.AI_BASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  try {
    const deviceId = uuid();
    const conversationId = uuid();
    const ok = await post(
      '/api/v1/chat',
      chatBody(deviceId, conversationId, 'What is 2 + 2?', {
        history: [
          { role: 'user', content: 'Python lesson' },
          { role: 'user', content: 'Variables samjhao' },
        ],
      })
    );
    assert.equal(ok.status, 200);
    assert.equal(ok.data.text, '2 + 2 = 4');
    assert.equal(JSON.stringify(ok.data).includes(leak), false);
    assert.equal(JSON.stringify(ok.data).includes('hidden thought'), false);
    assert.equal(seen.key, leak);
    assert.equal(seen.auth, '');
    assert.equal(seen.url.includes(leak), false);
    assert.match(seen.url, /\/models\/gemini-3\.8-flash:streamGenerateContent\?alt=sse$/);
    assert.equal(seen.body.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(seen.body.contents.length, 1);
    assert.equal(seen.body.contents[0].role, 'user');
    assert.match(seen.body.contents[0].parts[0].text, /Python lesson/);
    assert.match(seen.body.contents[0].parts[0].text, /2 \+ 2/);

    process.env.AI_BASE_URL = `http://127.0.0.1:${upstream.address().port}/blocked`;
    const blocked = await post('/api/v1/chat', chatBody(uuid(), uuid(), 'Say something unsafe'));
    const raw = JSON.stringify(blocked.data);
    assert.equal(blocked.status, 502);
    assert.match(blocked.data.error.message, /blocked|did not invent/i);
    assert.equal(raw.includes(leak), false);
    assert.equal(blocked.data.text, undefined);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_BASE_URL = previous.base;
    process.env.AI_API_KEY = previous.key;
    process.env.AI_MODEL = previous.model;
    upstream.close();
  }
});

test('gemini auth failure never reveals the key', async () => {
  const leak = 'AIzaFAKEKEY1234567890SECRET';
  const upstream = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `bad key ${leak}` } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    base: process.env.AI_BASE_URL,
    key: process.env.AI_API_KEY,
    model: process.env.AI_MODEL,
  };
  process.env.AI_PROVIDER = 'gemini';
  process.env.AI_ALLOW_MOCK = '0';
  process.env.AI_API_KEY = leak;
  process.env.AI_MODEL = 'gemini-3.8-flash';
  process.env.AI_BASE_URL = `http://127.0.0.1:${upstream.address().port}/v1beta`;
  try {
    const result = await post('/api/v1/chat', chatBody(uuid(), uuid(), 'Hello'));
    const raw = JSON.stringify(result.data);
    assert.equal(result.status, 502);
    assert.equal(result.data.error.code, 'AUTH');
    assert.equal(raw.includes(leak), false);
    assert.match(result.data.error.message, /key is not shown/i);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_BASE_URL = previous.base;
    process.env.AI_API_KEY = previous.key;
    process.env.AI_MODEL = previous.model;
    upstream.close();
  }
});

test('GEMINI_API_KEY selects Gemini and is never returned', async () => {
  const leak = 'AIzaGEMINIKEYONLY1234567890';
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    base: process.env.AI_BASE_URL,
    key: process.env.AI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    model: process.env.AI_MODEL,
  };
  delete process.env.AI_PROVIDER;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  process.env.AI_API_KEY = '';
  process.env.AI_ALLOW_MOCK = '0';
  process.env.GEMINI_API_KEY = leak;
  try {
    const health = await fetch(`${base}/api/v1/health`);
    const data = await health.json();
    const raw = JSON.stringify(data);
    assert.equal(health.status, 200);
    assert.equal(data.provider, 'gemini');
    assert.equal(data.model, 'gemini-3.8-flash');
    assert.equal(data.aiConfigured, true);
    assert.equal(raw.includes(leak), false);
    assert.equal(raw.includes('GEMINI_API_KEY'), false);
    const chat = await post('/api/chat', chatBody(uuid(), uuid(), 'Hello'));
    assert.equal(JSON.stringify(chat.data).includes(leak), false);
    assert.notEqual(chat.status, 200);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_BASE_URL = previous.base;
    process.env.AI_API_KEY = previous.key;
    if (previous.gemini == null) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.gemini;
    process.env.AI_MODEL = previous.model;
  }
});

test('rate limit eventually refuses a burst', async () => {
  const deviceId = uuid();
  let limited = false;
  for (let i = 0; i < 34; i += 1) {
    const result = await post('/api/v1/chat', chatBody(deviceId, uuid(), `ping ${i}`));
    if (result.status === 429) {
      limited = true;
      assert.equal(result.data.error.code, 'RATE_LIMIT');
      break;
    }
  }
  assert.equal(limited, true);
});
