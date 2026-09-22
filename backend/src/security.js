export class AppError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SECRET_PATTERNS = [
  /\b(password|passwd|passcode|otp|one[- ]time|cvv|cvc|pin code|upi pin)\b/i,
  /\b(api[_ -]?key|secret[_ -]?key|access[_ -]?token|private[_ -]?key|bearer)\b/i,
  /\b(card number|debit card|credit card|cvv)\b/i,
  /\bsk-[a-zA-Z0-9_\-]{8,}\b/,
  /\bAIza[0-9A-Za-z\-_]{20,}\b/,
  /\b(?:\d[ -]?){13,19}\b/,
  /\b\d{4}\s?\d{4}\s?\d{4}\b/,
  /\b[A-Z]{5}\d{4}[A-Z]\b/,
];

export function looksSensitive(text) {
  const value = String(text || '');
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeError(text) {
  return String(text || 'Something went wrong.')
    .replace(/sk-[a-zA-Z0-9_\-]{6,}/g, '[redacted]')
    .replace(/AIza[0-9A-Za-z\-_]{10,}/g, '[redacted]')
    .replace(/(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/Bearer\s+[a-zA-Z0-9._\-+/=]+/gi, 'Bearer [redacted]')
    .replace(/key=[^&\s]+/gi, 'key=[redacted]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 320);
}

export function assertSafeUrl(value) {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new AppError('BAD_URL', 'Enter a server address starting with https://', 400);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new AppError('BAD_URL', 'Server address must start with https://', 400);
  }
  if (url.username || url.password) {
    throw new AppError('BAD_URL', 'Do not put a password or key in the server address.', 400);
  }
  const query = url.search.toLowerCase();
  if (/api[_-]?key|token|secret|password/.test(query)) {
    throw new AppError('BAD_URL', 'Do not put an API key in the server address. Set it on the server only.', 400);
  }
  if (looksSensitive(url.href) && !url.hostname) {
    throw new AppError('BAD_URL', 'That looks like a secret, not a server address.', 400);
  }
  return url.origin;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID.test(String(value || ''));
}

const LANGS = new Set(['auto', 'hi', 'hinglish', 'en']);
const MODES = new Set(['chat', 'study', 'work']);
const LEVELS = new Set(['simple', 'normal', 'detailed']);
const STUDY_TASKS = new Set([
  '',
  'explain',
  'teacher',
  'steps',
  'summarize',
  'points',
  'revision',
  'quiz',
  'practice',
  'flashcards',
  'timetable',
  'doubt',
]);
const WORK_TASKS = new Set([
  '',
  'code',
  'debug',
  'write',
  'plan',
  'research',
  'document',
  'ideas',
  'project',
  'trouble',
  'webdev',
  'appdev',
]);

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function inferMime(name, mime) {
  const given = String(mime || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_MIME.has(given)) return given;
  const ext = pathExt(name);
  return EXT_MIME[ext] || given || '';
}

function pathExt(name) {
  const base = String(name || '').toLowerCase().trim();
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot) : '';
}

export function validateChat(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError('BAD_REQUEST', 'Send a JSON message.', 400);
  }
  const deviceId = String(body.deviceId || body.device_id || '').trim();
  const conversationId = String(body.conversationId || body.conversation_id || '').trim();
  if (!isUuid(deviceId) || !isUuid(conversationId)) {
    throw new AppError('BAD_REQUEST', 'A valid conversation is required.', 400);
  }
  const message = typeof body.message === 'string' ? body.message : '';
  if (message.length > 8000) {
    throw new AppError('BAD_REQUEST', 'That message is too long. Please send it in smaller parts.', 400);
  }
  const mode = MODES.has(body.mode) ? body.mode : 'chat';
  const language = LANGS.has(body.language) ? body.language : 'auto';
  const level = LEVELS.has(body.studyLevel) ? body.studyLevel : 'normal';
  const studyTask = STUDY_TASKS.has(body.studyTask) ? body.studyTask : '';
  const workTask = WORK_TASKS.has(body.workTask) ? body.workTask : '';
  const assistantName = cleanName(body.assistantName);
  const attachments = validateAttachments(body.attachments);
  const regenerate = Boolean(body.regenerate);
  if (!regenerate && !message.trim() && attachments.length === 0) {
    throw new AppError('BAD_REQUEST', 'Type a message or attach a file first.', 400);
  }
  const clientMessageId = String(body.clientMessageId || '').slice(0, 80);
  return {
    deviceId,
    conversationId,
    message: message.trim(),
    mode,
    language,
    studyLevel: level,
    studyTask,
    workTask,
    assistantName,
    webSearch: Boolean(body.webSearch),
    regenerate,
    stream: body.stream !== false,
    attachments,
    clientMessageId,
    history: sanitizeHistory(body.history),
  };
}

function cleanName(value) {
  const name = String(value || 'Sana').replace(/[^\p{L}\p{N} .'-]/gu, '').trim();
  if (!name) return 'Sana';
  return name.slice(0, 24);
}

function validateAttachments(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new AppError('BAD_REQUEST', 'Attachments must be a list.', 400);
  if (value.length > 3) throw new AppError('BAD_REQUEST', 'You can attach up to 3 files at a time.', 400);
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new AppError('BAD_REQUEST', 'One of the attachments is invalid.', 400);
    }
    const name = String(item.name || `file-${index + 1}`).slice(0, 120);
    const mime = inferMime(name, item.mime);
    const ext = pathExt(name);
    if (!ALLOWED_MIME.has(mime)) {
      const label = ext || mime || 'this file type';
      throw new AppError(
        'UNSUPPORTED_FILE',
        `Sana can't read ${label} yet. Use a photo (JPG, PNG, WEBP), PDF, DOCX, TXT, MD, CSV, or JSON file.`,
        415
      );
    }
    const dataBase64 = String(item.dataBase64 || '').replace(/^data:[^,]+,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(dataBase64) || dataBase64.length < 16) {
      throw new AppError('BAD_REQUEST', `“${name}” could not be read. Try attaching it again.`, 400);
    }
    const bytes = Math.floor((dataBase64.replace(/\s/g, '').length * 3) / 4);
    if (bytes > 4.5 * 1024 * 1024) {
      throw new AppError('TOO_LARGE', `“${name}” is over 4 MB. Send a smaller file.`, 413);
    }
    return { name, mime, dataBase64: dataBase64.replace(/\s/g, '') };
  });
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const clean = [];
  for (const item of value.slice(-40)) {
    if (!item || (item.role !== 'user' && item.role !== 'assistant')) continue;
    const content = String(item.content || '').slice(0, 8000);
    if (!content.trim()) continue;
    clean.push({ role: item.role, content });
  }
  return clean;
}

export function validateMemoryInput(body) {
  if (!body || typeof body !== 'object') throw new AppError('BAD_REQUEST', 'Send a JSON memory.', 400);
  const deviceId = String(body.deviceId || '').trim();
  if (!isUuid(deviceId)) throw new AppError('BAD_REQUEST', 'A valid device id is required.', 400);
  const content = String(body.content || '').trim();
  if (!content) throw new AppError('BAD_REQUEST', 'Memory text is empty.', 400);
  if (content.length > 500) throw new AppError('BAD_REQUEST', 'Keep a memory under 500 characters.', 400);
  if (looksSensitive(content)) {
    throw new AppError(
      'SENSITIVE',
      'Sana will not store passwords, API keys, payment details, or other secrets.',
      400
    );
  }
  return { deviceId, content };
}

export function detectLanguage(text) {
  const value = String(text || '');
  if (/[\u0900-\u097F]/.test(value)) return 'hi';
  const markers = value.match(
    /\b(mujhe|hai|hain|hoon|hun|kya|kaise|kyun|kyu|nahi|nahin|karo|karna|padhna|padhai|samjhao|samjhaao|samajhao|bhai|yaar|kal|aaj|mera|meri|mere|tum|aap|tha|thi|mein|main|bhi|aur|wala|wali|chahiye|matlab|abhi|bahut|thoda|accha|acha|theek|thik|haan|kaun|kahan|kab|yaad|rakhna|rakho|sikhna|seekhna|batao|bata)\b/gi
  );
  const hits = markers ? markers.length : 0;
  if (hits >= 2) return 'hinglish';
  if (hits === 1 && /[a-z]/i.test(value)) return 'hinglish';
  return 'en';
}

export function needsWeb(text) {
  return /\b(latest|current|currently|today|tonight|news|price|prices|weather|score|scores|search|google|website|official site|this week|right now)\b|अभी|आज|ताज़ा|ताजा|खोजो|search karo|dhundh|website/i.test(
    String(text || '')
  );
}

export function extractRemember(text) {
  const value = String(text || '').trim();
  const patterns = [
    /^(?:please\s+)?(?:remember|note)\s+(?:that\s+)?([\s\S]+)/i,
    /^(?:please\s+)?don'?t forget\s+(?:that\s+)?([\s\S]+)/i,
    /^(?:yaad\s+rakh(?:o|na| lo|lena)?|yaad rakho)\s*(?:ki\s+)?([\s\S]+)/i,
    /^(?:mujhe\s+)?yaad\s+rakhna\s*(?:ki\s+)?([\s\S]+)/i,
    /^save (?:this )?to memory:\s*([\s\S]+)/i,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match && match[1] && match[1].trim().length > 1) {
      return match[1].trim().slice(0, 500);
    }
  }
  return '';
}

export function extractForget(text) {
  const value = String(text || '').trim();
  if (/^(forget everything|clear (all )?memory|saari memory (hata do|mita do)|sab yaad hata do)\b/i.test(value)) {
    return { all: true, query: '' };
  }
  const match = value.match(/^(?:forget(?: that)?|yaad se hata do|yaad mat rakhna)\s+([\s\S]+)/i);
  if (match) return { all: false, query: match[1].trim().slice(0, 200) };
  return null;
}
