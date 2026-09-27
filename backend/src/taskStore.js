import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppError } from './security.js';

const MAX_TASKS = 100;

export function createTaskStore(dataDir) {
  const file = path.join(dataDir, 'tasks.json');
  let data = load(file);

  function persist() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  }

  function list(deviceId, filter = 'all') {
    const all = (data.items[deviceId] || []).map(publicItem);
    if (filter === 'pending') return all.filter((t) => !t.completed);
    if (filter === 'completed') return all.filter((t) => t.completed);
    return all;
  }

  return {
    list,
    add(deviceId, { title, priority = 'normal', dueDate = null }) {
      const text = String(title || '').trim().slice(0, 300);
      if (!text) throw new AppError('BAD_REQUEST', 'Task title cannot be empty.', 400);
      const items = data.items[deviceId] || [];
      const item = {
        id: crypto.randomUUID(),
        title: text,
        completed: false,
        priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
        dueDate: dueDate ? String(dueDate).slice(0, 50) : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      items.push(item);
      data.items[deviceId] = items.slice(-MAX_TASKS);
      persist();
      return publicItem(item);
    },
    update(deviceId, id, updates = {}) {
      const items = data.items[deviceId] || [];
      const item = items.find((entry) => entry.id === id);
      if (!item) throw new AppError('NOT_FOUND', 'Task not found.', 404);
      if (typeof updates.title === 'string' && updates.title.trim()) {
        item.title = updates.title.trim().slice(0, 300);
      }
      if (typeof updates.completed === 'boolean') {
        item.completed = updates.completed;
      }
      if (['low', 'normal', 'high'].includes(updates.priority)) {
        item.priority = updates.priority;
      }
      if (updates.dueDate !== undefined) {
        item.dueDate = updates.dueDate ? String(updates.dueDate).slice(0, 50) : null;
      }
      item.updatedAt = new Date().toISOString();
      persist();
      return publicItem(item);
    },
    toggle(deviceId, id) {
      const items = data.items[deviceId] || [];
      const item = items.find((entry) => entry.id === id);
      if (!item) throw new AppError('NOT_FOUND', 'Task not found.', 404);
      item.completed = !item.completed;
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
    title: item.title,
    completed: Boolean(item.completed),
    priority: item.priority || 'normal',
    dueDate: item.dueDate || null,
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
