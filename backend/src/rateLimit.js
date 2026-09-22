export function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  let lastSweep = Date.now();

  return function limit(key) {
    const now = Date.now();
    if (now - lastSweep > windowMs) {
      for (const [id, times] of hits) {
        const fresh = times.filter((t) => now - t < windowMs);
        if (fresh.length) hits.set(id, fresh);
        else hits.delete(id);
      }
      lastSweep = now;
    }
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      return { ok: false, retryAfter };
    }
    recent.push(now);
    hits.set(key, recent);
    return { ok: true, retryAfter: 0 };
  };
}
