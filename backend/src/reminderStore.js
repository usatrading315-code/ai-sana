import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from './security.js';

const MAX_REMINDERS = 100;

export function createReminderStore(dataDir) {
  const file = path.join(dataDir, 'reminders.json');
  let data = load(file);

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  function list(deviceId, filter = 'active') {
    const all = (data.items[deviceId] || []).map(publicItem);
    if (filter === 'active') return all.filter((r) => !r.dismissed);
    if (filter === 'dismissed') return all.filter((r) => r.dismissed);
    return all;
  }

  return {
    list,
    add(deviceId, { text, triggerTime, recurring = null }) {
      const title = String(text || '').trim().slice(0, 300);
      if (!title) throw new AppError('BAD_REQUEST', 'Reminder text cannot be empty.', 400);
      const items = data.items[deviceId] || [];
      const item = {
        id: crypto.randomUUID(),
        text: title,
        triggerTime: triggerTime ? new Date(triggerTime).toISOString() : new Date(Date.now() + 3600000).toISOString(),
        recurring: recurring ? String(recurring).slice(0, 50) : null,
        dismissed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(item);
      data.items[deviceId] = items.slice(-MAX_REMINDERS);
      persist();
      return publicItem(item);
    },
    dismiss(deviceId, id) {
      const items = data.items[deviceId] || [];
      const item = items.find((entry) => entry.id === id);
      if (!item) throw new AppError('NOT_FOUND', 'Reminder not found.', 404);
      item.dismissed = true;
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
  };
}

function publicItem(item) {
  return {
    id: item.id,
    text: item.text,
    triggerTime: item.triggerTime,
    recurring: item.recurring,
    dismissed: Boolean(item.dismissed),
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
