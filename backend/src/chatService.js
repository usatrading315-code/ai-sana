import { getConfig, visionSupport } from './config.js';
import { createConversationStore } from './conversationStore.js';
import { createMemoryStore } from './memoryStore.js';
import { prepareAttachments, composeUserContent } from './documents.js';
import { searchWeb } from './search.js';
import { streamCompletion } from './providers.js';
import { buildSystemPrompt, webBlock } from './prompts.js';
import {
  AppError,
  detectLanguage,
  extractForget,
  extractRemember,
  looksSensitive,
  needsWeb,
  validateChat,
} from './security.js';
import { createRateLimiter } from './rateLimit.js';

const limit = createRateLimiter({ windowMs: 60_000, max: 30 });
let conversations;
let memories;
let boundDir = '';

function stores() {
  const cfg = getConfig();
  if (!conversations || boundDir !== cfg.dataDir) {
    boundDir = cfg.dataDir;
    conversations = createConversationStore(cfg.dataDir);
    memories = createMemoryStore(cfg.dataDir);
  }
  return { conversations, memories, cfg };
}

export function getServices() {
  return stores();
}

export async function runChat(rawBody, ctx) {
  const input = validateChat(rawBody);
  const { conversations: convStore, memories: memoryStore, cfg } = stores();
  const rate = limit(`${ctx.ip || 'local'}:${input.deviceId}`);
  if (!rate.ok) {
    throw new AppError('RATE_LIMIT', `Too many requests. Try again in ${rate.retryAfter} seconds.`, 429);
  }
  if (!cfg.apiKey && cfg.provider !== 'mock') {
    throw new AppError(
      'CONFIG',
      'Sana is not configured yet. Set GEMINI_API_KEY (or AI_API_KEY) as a server environment variable. You do not need to edit the app. The key is never shown here.',
      503
    );
  }

  const vision = visionSupport(cfg);
  let attachmentNames = [];
  let images = [];
  if (!input.regenerate) {
    convStore.seedIfEmpty(input.conversationId, input.deviceId, input.history);
    const prepared = await prepareAttachments(input.attachments, { vision });
    images = prepared.images;
    attachmentNames = [
      ...prepared.images.map((file) => file.name),
      ...prepared.texts.map((file) => file.name),
    ];
    const content = composeUserContent(input.message, prepared.texts, prepared.images);
    convStore.appendUser(input.conversationId, input.deviceId, {
      content,
      clientMessageId: input.clientMessageId,
      attachmentNames,
    });
  } else {
    convStore.popLastAssistant(input.conversationId, input.deviceId);
    const last = convStore.lastUser(input.conversationId, input.deviceId);
    if (!last) throw new AppError('NO_MESSAGE', 'There is no reply to regenerate yet.', 400);
    if (input.attachments.length) {
      const prepared = await prepareAttachments(input.attachments, { vision });
      images = prepared.images;
    }
  }

  let sensitiveAttempt = false;
  let memoryNote = null;
  if (!input.regenerate && input.message) {
    const forget = extractForget(input.message);
    if (forget?.all) {
      memoryStore.clear(input.deviceId);
      memoryNote = 'cleared';
    } else if (forget) {
      memoryStore.forgetMatching(input.deviceId, forget.query);
      memoryNote = 'forgot';
    } else {
      const fact = extractRemember(input.message);
      if (fact) {
        if (looksSensitive(fact)) sensitiveAttempt = true;
        else {
          memoryStore.add(input.deviceId, fact);
          memoryNote = 'saved';
        }
      }
    }
  }

  const wantWeb =
    input.webSearch || input.workTask === 'research' || (!input.regenerate && needsWeb(input.message));
  let sources = [];
  let webStatus = 'off';
  if (wantWeb) {
    ctx.onStatus?.({ type: 'searching' });
    try {
      const querySource = input.regenerate
        ? convStore.lastUser(input.conversationId, input.deviceId)?.content || ''
        : input.message;
      sources = await searchWeb(querySource, cfg);
      webStatus = sources.length ? 'ok' : 'empty';
    } catch {
      webStatus = 'error';
      sources = [];
    }
  }

  const system = buildSystemPrompt({
    name: input.assistantName,
    language: input.language,
    mode: input.mode,
    studyLevel: input.studyLevel,
    studyTask: input.studyTask,
    workTask: input.workTask,
    memories: memoryStore.list(input.deviceId),
    webStatus,
    sensitiveAttempt,
  });
  const history = convStore.modelMessages(input.conversationId, input.deviceId);
  if (input.regenerate && !images.length && history.length) {
    const stored = convStore.lastUser(input.conversationId, input.deviceId);
    const names = stored?.attachmentNames || [];
    const last = history[history.length - 1];
    if (names.length && last?.role === 'user') {
      last.content += `\n\n[The earlier attachment (${names.join(', ')}) is not included in this request. Do not claim you can see it. Ask for it again if the answer depends on the file.]`;
    }
  }
  if (webStatus === 'ok' && history.length) {
    const last = history[history.length - 1];
    if (last.role === 'user') last.content += webBlock(sources);
  }
  const messages = [{ role: 'system', content: system }, ...history];

  let full = '';
  let stopped = false;
  try {
    await streamCompletion({
      cfg,
      messages,
      images,
      signal: ctx.signal,
      onToken(token) {
        full += token;
        ctx.onToken?.(token);
      },
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      stopped = true;
    } else {
      throw error;
    }
  }

  if (!stopped && !full.trim()) {
    throw new AppError(
      'EMPTY',
      'Sana didn’t receive a reply from the AI service. Your message is still here — tap Retry.',
      502
    );
  }

  if (full.trim()) {
    convStore.appendAssistant(input.conversationId, input.deviceId, full, {
      stopped,
      knowledge: webStatus === 'ok' ? 'web' : 'model',
    });
  }

  const latestUser = input.regenerate
    ? convStore.lastUser(input.conversationId, input.deviceId)?.content || ''
    : input.message;
  return {
    text: full,
    stopped,
    sources: sources.map((item) => ({ title: item.title, url: item.url })),
    webStatus,
    knowledge: webStatus === 'ok' ? 'web' : 'model',
    detectedLanguage: detectLanguage(latestUser),
    memoryNote,
    conversationId: input.conversationId,
    conversation_id: input.conversationId,
  };
}
