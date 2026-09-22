import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError, looksSensitive } from './security.js';

const MAX_ITEMS = 40;

export function createMemoryStore(dataDir) {
  const file = path.join(dataDir, 'memory.json');
  let data = load(file);

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  function list(deviceId) {
    return (data.items[deviceId] || []).map(publicItem);
  }

  return {
    list,
    add(deviceId, content) {
      const text = String(content || '').trim().slice(0, 500);
      if (!text) throw new AppError('BAD_REQUEST', 'Memory text is empty.', 400);
      if (looksSensitive(text)) {
        throw new AppError(
          'SENSITIVE',
          'Sana will not store passwords, API keys, payment details, or other secrets.',
          400
        );
      }
      const items = data.items[deviceId] || [];
      const existing = items.find((item) => item.content.toLowerCase() === text.toLowerCase());
      if (existing) return publicItem(existing);
      const item = {
        id: crypto.randomUUID(),
        content: text,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(item);
      data.items[deviceId] = items.slice(-MAX_ITEMS);
      persist();
      return publicItem(item);
    },
    update(deviceId, id, content) {
      const items = data.items[deviceId] || [];
      const item = items.find((entry) => entry.id === id);
      if (!item) throw new AppError('NOT_FOUND', 'That memory was not found.', 404);
      const text = String(content || '').trim().slice(0, 500);
      if (!text) throw new AppError('BAD_REQUEST', 'Memory text is empty.', 400);
      if (looksSensitive(text)) {
        throw new AppError(
          'SENSITIVE',
          'Sana will not store passwords, API keys, payment details, or other secrets.',
          400
        );
      }
      item.content = text;
      item.updatedAt = new Date().toISOString();
      persist();
      return publicItem(item);
    },
    remove(deviceId, id) {
      const items = data.items[deviceId] || [];
      const next = items.filter((entry) => entry.id !== id);
      if (next.length === items.length) return false;
      data.items[deviceId] = next;
      persist();
      return true;
    },
    clear(deviceId) {
      delete data.items[deviceId];
      persist();
    },
    forgetMatching(deviceId, query) {
      const items = data.items[deviceId] || [];
      const needle = query.toLowerCase();
      const next = items.filter((entry) => !entry.content.toLowerCase().includes(needle));
      const removed = items.length - next.length;
      data.items[deviceId] = next;
      persist();
      return removed;
    },
  };
}

function publicItem(item) {
  return {
    id: item.id,
    content: item.content,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function load(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed.items === 'object') return parsed;
  } catch {
    /* fresh */
  }
  return { items: {} };
}
