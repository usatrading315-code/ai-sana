import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFastLocalResponse } from '../src/skills/fastRouter.js';

test('Fast Local Router handles deterministic queries with zero external calls', () => {
  const cases = [
    { query: 'Hello', type: 'greeting' },
    { query: 'Hi Sana', type: 'greeting' },
    { query: 'Namaste', type: 'greeting' },
    { query: 'Good morning', type: 'greeting' },
    { query: 'How are you?', type: 'status' },
    { query: 'Who are you?', type: 'identity' },
    { query: 'Tum kaun ho?', type: 'identity' },
    { query: 'Tumhe kisne banaya?', type: 'identity' },
    { query: '2+2', type: 'calculation' },
    { query: '15+27', type: 'calculation' },
    { query: '100-45', type: 'calculation' },
  ];

  for (const c of cases) {
    const res = resolveFastLocalResponse(c.query);
    assert.ok(res, `Query "${c.query}" should be handled by fast router`);
    assert.equal(res.type, c.type, `Query "${c.query}" should match type "${c.type}"`);
    assert.ok(res.text.length > 0, `Query "${c.query}" response should not be empty`);
  }
});

test('Fast Local Router delegates complex questions to AI pipeline', () => {
  const complex = [
    'Explain photosynthesis in simple words.',
    'Write a short story.',
    'Explain gravity.',
    'Help me plan my study schedule.',
    'What is the current gold price in India today?',
  ];

  for (const query of complex) {
    const res = resolveFastLocalResponse(query);
    assert.equal(res, null, `Query "${query}" should bypass fast router and return null`);
  }
});
