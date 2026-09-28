import test from 'node:test';
import assert from 'node:assert/strict';

test('In-flight request coalescing returns the same execution promise for duplicate concurrent queries', async () => {
  const inFlight = new Map();
  let upstreamCalls = 0;

  async function simulateChatRequest(deviceId, convId, message) {
    const key = `${deviceId}:${convId}:${message.trim()}`;
    if (inFlight.has(key)) {
      return inFlight.get(key);
    }

    const p = (async () => {
      upstreamCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { text: `Reply to ${message}`, upstreamCalls };
    })();

    inFlight.set(key, p);
    p.finally(() => inFlight.delete(key));
    return p;
  }

  // Fire 3 identical requests simultaneously
  const [res1, res2, res3] = await Promise.all([
    simulateChatRequest('dev-1', 'conv-1', 'Explain quantum computing'),
    simulateChatRequest('dev-1', 'conv-1', 'Explain quantum computing'),
    simulateChatRequest('dev-1', 'conv-1', 'Explain quantum computing'),
  ]);

  assert.equal(res1.text, 'Reply to Explain quantum computing');
  assert.equal(res2.text, 'Reply to Explain quantum computing');
  assert.equal(res3.text, 'Reply to Explain quantum computing');
  assert.equal(upstreamCalls, 1, 'Only exactly 1 upstream generation should occur for concurrent duplicates');
});
