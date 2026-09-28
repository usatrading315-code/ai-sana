import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolManager, TOOL_PERMISSIONS } from '../src/tools/index.js';
import '../src/tools/builtins.js';

test('ToolManager registers built-in tools and handles permission gating', async () => {
  const tools = defaultToolManager.list();
  assert.ok(tools.length >= 3);
  assert.ok(tools.some((t) => t.id === 'image_ai'));
  assert.ok(tools.some((t) => t.id === 'video_ai'));
  assert.ok(tools.some((t) => t.id === 'creator_social'));

  // Image AI execution (READ - no confirmation needed)
  const imgRes = await defaultToolManager.execute('image_ai', { action: 'analyze' });
  assert.equal(imgRes.status, 'SUCCESS');
  assert.equal(imgRes.data.handled, true);

  // Creator Social execution without confirmation (WRITE - requires confirmation)
  const unconfirmed = await defaultToolManager.execute('creator_social', {
    platform: 'youtube',
    action: 'upload',
    title: 'New Video',
  });
  assert.equal(unconfirmed.status, 'NEEDS_CONFIRMATION');
  assert.match(unconfirmed.prompt, /Are you sure/);

  // Creator Social execution WITH confirmation
  const confirmed = await defaultToolManager.execute(
    'creator_social',
    { platform: 'youtube', action: 'upload', title: 'New Video' },
    { confirmed: true }
  );
  assert.equal(confirmed.status, 'SUCCESS');
  assert.equal(confirmed.data.requiresConfiguration, true); // Safely reports configuration requirement
});
