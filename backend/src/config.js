import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');

const platformKeys = new Set(
  Object.entries(process.env)
    .filter(([, value]) => value != null && String(value).length > 0)
    .map(([key]) => key)
);

let dotenvLoaded = false;

export function loadEnvFiles() {
  const files = [path.join(ROOT, '.env'), path.join(ROOT, 'backend', '.env')];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!/^[A-Z0-9_]+$/.test(key)) continue;
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Real platform secrets win. A local .env can fill or refresh non-platform keys
      // so the operator can add AI_API_KEY without editing source.
      if (platformKeys.has(key)) continue;
      if (value) process.env[key] = value;
    }
  }
  dotenvLoaded = true;
}

export function detectProvider(baseUrl, explicit) {
  const choice = (explicit || 'auto').toLowerCase();
  if (choice && choice !== 'auto') return choice;
  const url = (baseUrl || '').toLowerCase();
  if (url.includes('anthropic.com')) return 'anthropic';
  if (url.includes('generativelanguage.googleapis.com') || url.includes('googleapis.com')) return 'gemini';
  return 'openai';
}

export function modelLikelyVision(model, provider) {
  const name = (model || '').toLowerCase();
  if (provider === 'gemini') return true;
  if (provider === 'anthropic') return name.includes('claude');
  return /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-5|vision|llava|gemini|claude|qwen-vl|pixtral|grok-2-vision|grok-vision/.test(name);
}

function readKeyFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

function readSecret(name) {
  const direct = (process.env[name] || '').trim();
  if (direct) return direct;
  return readKeyFile(process.env[`${name}_FILE`] || '');
}

export function getConfig() {
  if (!dotenvLoaded) loadEnvFiles();
  else loadEnvFiles();

  const aiKey = readSecret('AI_API_KEY');
  const geminiKey = readSecret('GEMINI_API_KEY');
  const apiKey = aiKey || geminiKey;
  const usingGeminiKey = !aiKey && Boolean(geminiKey);

  const explicitBase = (process.env.AI_BASE_URL || '').trim();
  const explicitModel = (process.env.AI_MODEL || '').trim();
  const explicit = (process.env.AI_PROVIDER || 'auto').trim().toLowerCase();
  const allowMock = process.env.AI_ALLOW_MOCK === '1' && explicit === 'mock';
  const baseUrl = explicitBase || (usingGeminiKey
    ? 'https://generativelanguage.googleapis.com/v1beta'
    : 'https://api.openai.com/v1');
  const providerChoice = explicit === 'auto' && usingGeminiKey && !explicitBase ? 'gemini' : explicit;
  const provider = allowMock ? 'mock' : detectProvider(baseUrl, providerChoice === 'mock' ? 'auto' : providerChoice);
  const model = explicitModel || defaultModelFor(provider);

  return {
    apiKey,
    baseUrl,
    model,
    provider,
    allowMock,
    visionModel: (process.env.AI_VISION_MODEL || '').trim(),
    visionFlag: (process.env.AI_VISION || 'auto').trim().toLowerCase(),
    thinking: normalizeThinking(process.env.AI_THINKING),
    searchKey: (
      process.env.SEARCH_API_KEY ||
      process.env.TAVILY_API_KEY ||
      process.env.SERPER_API_KEY ||
      ''
    ).trim(),
    searchProvider: resolveSearchProvider(),
    dataDir: process.env.SANA_DATA_DIR || path.join(ROOT, 'backend', 'data'),
    port: Number(process.env.PORT || 8080),
    maxTokens: clampNumber(process.env.AI_MAX_TOKENS, 1800, 128, 4096),
    timeoutMs: clampNumber(process.env.AI_TIMEOUT_MS, 55000, 5000, 120000),
    version: '1.0.0',
    trustProxy: process.env.TRUST_PROXY === '1',
  };
}

function defaultModelFor(provider) {
  if (provider === 'gemini') return 'gemini-3.8-flash';
  if (provider === 'anthropic') return 'claude-3-5-haiku-latest';
  return 'gpt-4o-mini';
}

function normalizeThinking(value) {
  const level = String(value || 'low').trim().toLowerCase();
  if (level === 'low' || level === 'medium' || level === 'high') return level;
  return 'low';
}

function resolveSearchProvider() {
  const explicit = (process.env.SEARCH_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.SERPER_API_KEY) return 'serper';
  if (process.env.SEARCH_API_KEY) return 'tavily';
  return 'duckduckgo';
}

function clampNumber(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function visionSupport(cfg) {
  if (cfg.visionFlag === 'off') return 'off';
  if (cfg.visionFlag === 'on' || cfg.visionModel) return 'on';
  return modelLikelyVision(cfg.visionModel || cfg.model, cfg.provider) ? 'likely' : 'unlikely';
}

export function publicStatus(cfg = getConfig()) {
  let host = '';
  try {
    const url = new URL(cfg.baseUrl);
    host = url.hostname;
  } catch {
    host = '';
  }
  const searchReady = cfg.searchProvider === 'duckduckgo' || Boolean(cfg.searchKey);
  return {
    ok: true,
    service: 'sana-ai',
    version: cfg.version,
    aiConfigured: Boolean(cfg.apiKey) || cfg.provider === 'mock',
    provider: cfg.provider,
    model: cfg.model,
    host: cfg.provider === 'mock' ? '' : host,
    vision: visionSupport(cfg),
    webSearch: cfg.searchProvider === 'duckduckgo' ? 'fallback' : searchReady ? cfg.searchProvider : 'off',
    time: new Date().toISOString(),
  };
}
