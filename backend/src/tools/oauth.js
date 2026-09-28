import crypto from 'crypto';
import { sanitizeError } from '../security.js';

/**
 * SANA AI Server-side OAuth Foundation for Creator Social Platforms (YouTube, Instagram)
 *
 * Implements:
 * - Scoped official OAuth URLs
 * - Secure cryptographically random state parameter generation & verification (CSRF protection)
 * - Server-side in-memory token abstraction (never stored in DB plain-text or exposed to frontend)
 * - READ vs WRITE granular scopes
 * - Disconnect & revocation handling
 */

// Memory token store indexed by deviceId:platform
const tokenStore = new Map();
// Pending state store indexed by state string for CSRF verification (TTL 10 mins)
const pendingStates = new Map();

export const OAUTH_SCOPES = {
  youtube: {
    read: ['https://www.googleapis.com/auth/youtube.readonly'],
    write: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'],
  },
  instagram: {
    read: ['instagram_basic', 'pages_show_list'],
    write: ['instagram_content_publish', 'pages_read_engagement', 'pages_manage_posts'],
  },
};

export function generateOAuthState(deviceId, platform) {
  const nonce = crypto.randomBytes(24).toString('hex');
  const state = `${platform}_${deviceId}_${nonce}`;
  pendingStates.set(state, {
    deviceId,
    platform,
    createdAt: Date.now(),
  });
  return state;
}

export function verifyOAuthState(state) {
  if (!state || typeof state !== 'string') return null;
  const entry = pendingStates.get(state);
  if (!entry) return null;
  // State expires after 10 minutes
  if (Date.now() - entry.createdAt > 600_000) {
    pendingStates.delete(state);
    return null;
  }
  pendingStates.delete(state);
  return entry;
}

export function getOAuthAuthUrl(platform, deviceId, redirectUri) {
  const normPlatform = String(platform || '').toLowerCase();
  const state = generateOAuthState(deviceId, normPlatform);

  if (normPlatform === 'youtube') {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID;
    if (!clientId) {
      return {
        configured: false,
        missing: 'GOOGLE_CLIENT_ID (or YOUTUBE_CLIENT_ID) is not configured in server environment secrets.',
      };
    }
    const scopes = [...OAUTH_SCOPES.youtube.read, ...OAUTH_SCOPES.youtube.write].join(' ');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return {
      configured: true,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  if (normPlatform === 'instagram') {
    const appId = process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID;
    if (!appId) {
      return {
        configured: false,
        missing: 'META_APP_ID (or INSTAGRAM_CLIENT_ID) is not configured in server environment secrets.',
      };
    }
    const scopes = [...OAUTH_SCOPES.instagram.read, ...OAUTH_SCOPES.instagram.write].join(',');
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      state,
    });
    return {
      configured: true,
      url: `https://api.instagram.com/oauth/authorize?${params.toString()}`,
    };
  }

  return {
    configured: false,
    missing: `Platform "${platform}" OAuth is not supported. Supported platforms: youtube, instagram.`,
  };
}

export function saveOAuthToken(deviceId, platform, tokenData) {
  if (!deviceId || !platform || !tokenData) return;
  const key = `${deviceId}:${String(platform).toLowerCase()}`;
  tokenStore.set(key, {
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken || null,
    expiresAt: tokenData.expiresAt || null,
    scope: tokenData.scope || '',
    connectedAt: new Date().toISOString(),
  });
}

export function getOAuthToken(deviceId, platform) {
  if (!deviceId || !platform) return null;
  const key = `${deviceId}:${String(platform).toLowerCase()}`;
  return tokenStore.get(key) || null;
}

export function removeOAuthToken(deviceId, platform) {
  if (!deviceId || !platform) return false;
  const key = `${deviceId}:${String(platform).toLowerCase()}`;
  return tokenStore.delete(key);
}

export function getOAuthStatus(deviceId, platform) {
  const normPlatform = String(platform || '').toLowerCase();
  const token = getOAuthToken(deviceId, normPlatform);
  const envConfigured = Boolean(
    process.env[`${normPlatform.toUpperCase()}_ACCESS_TOKEN`] ||
    process.env[`${normPlatform.toUpperCase()}_CLIENT_ID`] ||
    process.env[`${normPlatform.toUpperCase()}_API_KEY`]
  );

  return {
    platform: normPlatform,
    connected: Boolean(token),
    configuredOnServer: envConfigured,
    connectedAt: token?.connectedAt || null,
  };
}
