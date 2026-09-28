import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultToolManager, TOOL_PERMISSIONS } from '../src/tools/index.js';
import { imageAiTool, videoAiTool, creatorSocialTool } from '../src/tools/builtins.js';

test('image_ai: inspects generation & editing requirements safely', async () => {
  // 1. Multimodal / analyze
  const analyzeRes = await defaultToolManager.execute('image_ai', { action: 'analyze' });
  assert.equal(analyzeRes.status, 'SUCCESS');
  assert.equal(analyzeRes.data.handled, true);

  // 2. Generate without provider key returns requiresConfiguration
  delete process.env.IMAGE_PROVIDER_API_KEY;
  delete process.env.IMAGEN_API_KEY;
  const genRes = await defaultToolManager.execute('image_ai', { action: 'generate', prompt: 'sunset on beach' });
  assert.equal(genRes.status, 'SUCCESS');
  assert.equal(genRes.data.success, false);
  assert.equal(genRes.data.requiresConfiguration, true);
  assert.match(genRes.data.missing, /IMAGE_PROVIDER_API_KEY/);

  // 3. Edit without provider key returns requiresConfiguration
  const editRes = await defaultToolManager.execute('image_ai', { action: 'edit', imageUrl: 'http://img.jpg', prompt: 'add filter' });
  assert.equal(editRes.status, 'SUCCESS');
  assert.equal(editRes.data.success, false);
  assert.equal(editRes.data.requiresConfiguration, true);
});

test('video_ai: separates scripting, analysis, generation, and editing', async () => {
  // A. Scripting (Working)
  const scriptRes = await defaultToolManager.execute('video_ai', { action: 'script', topic: 'Quantum Physics' });
  assert.equal(scriptRes.status, 'SUCCESS');
  assert.equal(scriptRes.data.handled, true);
  assert.ok(Array.isArray(scriptRes.data.scriptStructure));

  // B. Analysis (Working)
  const analyzeRes = await defaultToolManager.execute('video_ai', { action: 'analyze', topic: 'Review' });
  assert.equal(analyzeRes.status, 'SUCCESS');
  assert.equal(analyzeRes.data.handled, true);

  // C. Generation without provider key
  delete process.env.VIDEO_PROVIDER_API_KEY;
  const genRes = await defaultToolManager.execute('video_ai', { action: 'generate', topic: 'Nature' });
  assert.equal(genRes.status, 'SUCCESS');
  assert.equal(genRes.data.requiresConfiguration, true);
  assert.match(genRes.data.missing, /VIDEO_PROVIDER_API_KEY/);

  // D. Editing/Rendering without provider key
  delete process.env.VIDEO_RENDER_API_KEY;
  const renderRes = await defaultToolManager.execute('video_ai', { action: 'render', topic: 'Promo' });
  assert.equal(renderRes.status, 'SUCCESS');
  assert.equal(renderRes.data.requiresConfiguration, true);
  assert.match(renderRes.data.missing, /VIDEO_RENDER_API_KEY/);
});

test('creator_social: distinguishes READ vs WRITE and blocks unconfirmed publishing', async () => {
  // 1. READ operation without tokens
  const readRes = await defaultToolManager.execute('creator_social', {
    platform: 'youtube',
    action: 'get_channel',
  });
  assert.equal(readRes.status, 'SUCCESS');
  assert.equal(readRes.data.requiresConfiguration, true);
  assert.match(readRes.data.missing, /YOUTUBE_ACCESS_TOKEN/);

  // 2. WRITE operation requires confirmation first
  const unconfirmedWrite = await defaultToolManager.execute('creator_social', {
    platform: 'youtube',
    action: 'upload',
    title: 'My Video',
  });
  assert.equal(unconfirmedWrite.status, 'NEEDS_CONFIRMATION');
  assert.match(unconfirmedWrite.prompt, /Are you sure/);

  // 3. Instagram WRITE operation requires confirmation
  const igUnconfirmed = await defaultToolManager.execute('creator_social', {
    platform: 'instagram',
    action: 'publish',
    caption: 'My Post',
  });
  assert.equal(igUnconfirmed.status, 'NEEDS_CONFIRMATION');

  // 4. Confirmed WRITE operation without token safely reports configuration requirement
  const confirmedWrite = await defaultToolManager.execute(
    'creator_social',
    { platform: 'youtube', action: 'upload', title: 'My Video' },
    { confirmed: true }
  );
  assert.equal(confirmedWrite.status, 'SUCCESS');
  assert.equal(confirmedWrite.data.requiresConfiguration, true);
});
