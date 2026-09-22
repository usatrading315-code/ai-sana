function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    done() {
      clearTimeout(timer);
    },
  };
}

export async function searchWeb(query, cfg) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!q) return [];
  if (cfg.searchProvider === 'tavily' && cfg.searchKey) return tavily(q, cfg.searchKey);
  if (cfg.searchProvider === 'serper' && cfg.searchKey) return serper(q, cfg.searchKey);
  return duckDuckGo(q);
}

async function tavily(query, apiKey) {
  const timeout = withTimeout(8000);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: 5,
        include_answer: false,
      }),
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error('search failed');
    const data = await response.json();
    return (data.results || [])
      .slice(0, 5)
      .map((item) => ({
        title: String(item.title || '').slice(0, 160),
        url: String(item.url || ''),
        snippet: String(item.content || '').slice(0, 320),
      }))
      .filter((item) => item.url.startsWith('http'));
  } finally {
    timeout.done();
  }
}

async function serper(query, apiKey) {
  const timeout = withTimeout(8000);
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({ q: query, num: 5 }),
      signal: timeout.signal,
    });
    if (!response.ok) throw new Error('search failed');
    const data = await response.json();
    return (data.organic || [])
      .slice(0, 5)
      .map((item) => ({
        title: String(item.title || '').slice(0, 160),
        url: String(item.link || ''),
        snippet: String(item.snippet || '').slice(0, 320),
      }))
      .filter((item) => item.url.startsWith('http'));
  } finally {
    timeout.done();
  }
}

async function duckDuckGo(query) {
  const htmlResults = await duckDuckGoHtml(query);
  if (htmlResults.length) return htmlResults;
  return duckDuckGoInstant(query);
}

async function duckDuckGoHtml(query) {
  const timeout = withTimeout(8000);
  try {
    const response = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SanaAI/1.0 (personal study assistant)',
      },
      body: new URLSearchParams({ q: query }),
      signal: timeout.signal,
    });
    if (!response.ok) return [];
    const html = await response.text();
    return parseDdg(html);
  } catch {
    return [];
  } finally {
    timeout.done();
  }
}

async function duckDuckGoInstant(query) {
  const timeout = withTimeout(8000);
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?${new URLSearchParams({
        q: query,
        format: 'json',
        no_html: '1',
        skip_disambig: '1',
      })}`,
      {
        headers: { 'User-Agent': 'SanaAI/1.0 (personal study assistant)', Accept: 'application/json' },
        signal: timeout.signal,
      }
    );
    if (!response.ok) return [];
    return parseInstantAnswer(await response.json());
  } catch {
    return [];
  } finally {
    timeout.done();
  }
}

export function parseInstantAnswer(data) {
  const results = [];
  const push = (title, url, snippet) => {
    const href = String(url || '');
    if (!href.startsWith('http')) return;
    if (results.some((item) => item.url === href)) return;
    results.push({
      title: String(title || 'Untitled').slice(0, 160),
      url: href,
      snippet: String(snippet || '').replace(/\s+/g, ' ').slice(0, 320),
    });
  };
  if (data?.AbstractURL) push(data.Heading || data.AbstractSource || 'Result', data.AbstractURL, data.Abstract);
  const walk = (items) => {
    for (const item of items || []) {
      if (item?.FirstURL) push(item.Text, item.FirstURL, item.Text);
      if (Array.isArray(item?.Topics)) walk(item.Topics);
    }
  };
  walk(data?.RelatedTopics);
  for (const item of data?.Results || []) push(item?.Text, item?.FirstURL, item?.Text);
  return results.slice(0, 5);
}

export function parseDdg(html) {
  const results = [];
  const linkRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<(?:a|td|div)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi;
  const snippets = [...String(html || '').matchAll(snippetRe)].map((match) => strip(match[1]));
  let index = 0;
  for (const match of String(html || '').matchAll(linkRe)) {
    const url = decodeDdg(match[1]);
    const title = strip(match[2]);
    if (!url.startsWith('http') || !title) continue;
    results.push({ title: title.slice(0, 160), url, snippet: (snippets[index++] || '').slice(0, 320) });
    if (results.length >= 5) break;
  }
  return results;
}

function decodeDdg(href) {
  let value = decode(href);
  try {
    const url = new URL(value, 'https://duckduckgo.com');
    const uddg = url.searchParams.get('uddg');
    if (uddg) return decode(uddg);
  } catch {
    /* keep */
  }
  return value;
}

function decode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, '/');
}

function strip(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
