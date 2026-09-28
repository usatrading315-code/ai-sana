import test from 'node:test';
import assert from 'node:assert/strict';
import { runChat } from '../src/chatService.js';
import crypto from 'crypto';

test('SANA identity queries return creator information in Hindi, Hinglish, and English', async () => {
  const previous = {
    provider: process.env.AI_PROVIDER,
    allow: process.env.AI_ALLOW_MOCK,
    model: process.env.AI_MODEL,
  };
  process.env.AI_PROVIDER = 'mock';
  process.env.AI_ALLOW_MOCK = '1';

  try {
    const devId = crypto.randomUUID();

    // 1. English
    const resEn = await runChat({
      deviceId: devId,
      conversationId: crypto.randomUUID(),
      message: 'Who are you and who created you?',
    }, { ip: '127.0.0.1' });
    assert.match(resEn.text, /Rao Abhishek Rao/);
    assert.match(resEn.text, /Deepak Kumar/);

    // 2. Hinglish
    const resHinglish = await runChat({
      deviceId: devId,
      conversationId: crypto.randomUUID(),
      message: 'Tum kaun ho aur tumhe kisne banaya?',
    }, { ip: '127.0.0.1' });
    assert.match(resHinglish.text, /Rao Abhishek Rao/);
    assert.match(resHinglish.text, /Deepak Kumar/);
    assert.match(resHinglish.text, /Main SANA hoon/);

    // 3. Hindi (Devanagari)
    const resHi = await runChat({
      deviceId: devId,
      conversationId: crypto.randomUUID(),
      message: 'तुम कौन हो और तुम्हें किसने बनाया?',
    }, { ip: '127.0.0.1' });
    assert.match(resHi.text, /राव अभिषेक राव/);
    assert.match(resHi.text, /दीपक कुमार/);
    assert.match(resHi.text, /मैं साना/);
  } finally {
    process.env.AI_PROVIDER = previous.provider;
    process.env.AI_ALLOW_MOCK = previous.allow;
    process.env.AI_MODEL = previous.model;
  }
});
