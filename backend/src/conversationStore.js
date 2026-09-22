import fs from 'fs';
import path from 'path';
import { AppError } from './security.js';

const MAX_MESSAGES = 200;
const MODEL_TURNS = 40;

export function createConversationStore(dataDir) {
  const file = path.join(dataDir, 'conversations.json');
  let data = load(file);

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  function getOwned(id, deviceId, create = false) {
    let conv = data.conversations[id];
    if (!conv && create) {
      const now = new Date().toISOString();
      conv = { id, deviceId, title: '', createdAt: now, updatedAt: now, messages: [] };
      data.conversations[id] = conv;
      trimDevice(deviceId);
      persist();
    }
    if (!conv) return null;
    if (conv.deviceId !== deviceId) {
      throw new AppError('FORBIDDEN', 'This conversation belongs to a different device.', 403);
    }
    return conv;
  }

  function trimDevice(deviceId) {
    const list = Object.values(data.conversations)
      .filter((item) => item.deviceId === deviceId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    for (const extra of list.slice(80)) delete data.conversations[extra.id];
  }

  return {
    get(id, deviceId) {
      return getOwned(id, deviceId, false);
    },
    ensure(id, deviceId) {
      return getOwned(id, deviceId, true);
    },
    seedIfEmpty(id, deviceId, history) {
      const conv = getOwned(id, deviceId, true);
      if (conv.messages.length || !history?.length) return conv;
      conv.messages = history.slice(-MODEL_TURNS).map((item) => ({
        role: item.role,
        content: String(item.content || '').slice(0, 8000),
        createdAt: new Date().toISOString(),
        seeded: true,
      }));
      conv.updatedAt = new Date().toISOString();
      if (!conv.title) conv.title = titleFrom(conv.messages.find((m) => m.role === 'user')?.content || '');
      persist();
      return conv;
    },
    appendUser(id, deviceId, { content, clientMessageId, attachmentNames }) {
      const conv = getOwned(id, deviceId, true);
      const last = conv.messages[conv.messages.length - 1];
      if (clientMessageId && last?.role === 'user' && last.clientMessageId === clientMessageId) {
        return conv;
      }
      conv.messages.push({
        role: 'user',
        content: String(content || '').slice(0, 12000),
        clientMessageId: clientMessageId || '',
        attachmentNames: attachmentNames || [],
        createdAt: new Date().toISOString(),
      });
      if (!conv.title) conv.title = titleFrom(content);
      clip(conv);
      conv.updatedAt = new Date().toISOString();
      persist();
      return conv;
    },
    appendAssistant(id, deviceId, content, extra = {}) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) return null;
      conv.messages.push({
        role: 'assistant',
        content: String(content || '').slice(0, 20000),
        createdAt: new Date().toISOString(),
        stopped: Boolean(extra.stopped),
        knowledge: extra.knowledge || 'model',
      });
      clip(conv);
      conv.updatedAt = new Date().toISOString();
      persist();
      return conv;
    },
    popLastAssistant(id, deviceId) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) throw new AppError('NOT_FOUND', 'That chat was not found.', 404);
      const last = conv.messages[conv.messages.length - 1];
      if (last?.role === 'assistant') conv.messages.pop();
      conv.updatedAt = new Date().toISOString();
      persist();
      return conv;
    },
    lastUser(id, deviceId) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) return null;
      return [...conv.messages].reverse().find((item) => item.role === 'user') || null;
    },
    modelMessages(id, deviceId) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) return [];
      return conv.messages.slice(-MODEL_TURNS).map((item) => ({
        role: item.role,
        content: item.content,
      }));
    },
    list(deviceId) {
      return Object.values(data.conversations)
        .filter((item) => item.deviceId === deviceId)
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map(summary);
    },
    remove(id, deviceId) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) return false;
      delete data.conversations[id];
      persist();
      return true;
    },
    clearDevice(deviceId) {
      for (const [id, conv] of Object.entries(data.conversations)) {
        if (conv.deviceId === deviceId) delete data.conversations[id];
      }
      persist();
    },
    snapshot(id, deviceId) {
      const conv = getOwned(id, deviceId, false);
      if (!conv) return null;
      return {
        ...summary(conv),
        messages: conv.messages.map((item) => ({
          role: item.role,
          content: item.content,
          createdAt: item.createdAt,
          knowledge: item.knowledge || null,
          stopped: Boolean(item.stopped),
          attachmentNames: item.attachmentNames || [],
        })),
      };
    },
  };
}

function clip(conv) {
  if (conv.messages.length > MAX_MESSAGES) {
    conv.messages = conv.messages.slice(-MAX_MESSAGES);
  }
}

function titleFrom(content) {
  const line = String(content || '')
    .replace(/\n--- Attached file:[\s\S]*$/m, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line) return 'New chat';
  return line.length > 48 ? `${line.slice(0, 48)}…` : line;
}

function summary(conv) {
  const last = conv.messages[conv.messages.length - 1];
  return {
    id: conv.id,
    title: conv.title || 'New chat',
    updatedAt: conv.updatedAt,
    createdAt: conv.createdAt,
    preview: String(last?.content || '').slice(0, 80),
    count: conv.messages.length,
  };
}

function load(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.conversations === 'object') return parsed;
  } catch {
    /* fresh store */
  }
  return { conversations: {} };
}
