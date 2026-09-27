import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTaskStore } from '../src/taskStore.js';
import { createReminderStore } from '../src/reminderStore.js';

test('taskStore manages tasks with CRUD and filters', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-task-test-'));
  const store = createTaskStore(tmpDir);
  const devId = 'device-123';

  // Add task
  const t1 = store.add(devId, { title: 'Complete physics chapter 4', priority: 'high' });
  assert.equal(t1.title, 'Complete physics chapter 4');
  assert.equal(t1.priority, 'high');
  assert.equal(t1.completed, false);

  // List tasks
  const list1 = store.list(devId, 'all');
  assert.equal(list1.length, 1);

  // Toggle task
  const t1Toggled = store.toggle(devId, t1.id);
  assert.equal(t1Toggled.completed, true);

  // Filter pending vs completed
  assert.equal(store.list(devId, 'pending').length, 0);
  assert.equal(store.list(devId, 'completed').length, 1);

  // Remove task
  assert.equal(store.remove(devId, t1.id), true);
  assert.equal(store.list(devId, 'all').length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('reminderStore schedules, dismisses, and lists reminders', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sana-remind-test-'));
  const store = createReminderStore(tmpDir);
  const devId = 'device-456';

  // Add reminder
  const r1 = store.add(devId, { text: 'Call Mom at 8 PM', triggerTime: new Date().toISOString() });
  assert.equal(r1.text, 'Call Mom at 8 PM');
  assert.equal(r1.dismissed, false);

  // Dismiss reminder
  const r1Dismissed = store.dismiss(devId, r1.id);
  assert.equal(r1Dismissed.dismissed, true);

  // List active
  assert.equal(store.list(devId, 'active').length, 0);
  assert.equal(store.list(devId, 'dismissed').length, 1);

  // Clear reminders
  store.clear(devId);
  assert.equal(store.list(devId, 'all').length, 0);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
