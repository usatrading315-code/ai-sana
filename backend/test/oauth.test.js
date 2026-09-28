import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateOAuthState,
  verifyOAuthState,
  getOAuthAuthUrl,
  saveOAuthToken,
  getOAuthToken,
  removeOAuthToken,
  getOAuthStatus,
  OAUTH_SCOPES,
} from '../src/tools/oauth.js';

test('OAuth state parameter generation and verification', () => {
  const state = generateOAuthState('dev-123', 'youtube');
  assert.match(state, /^youtube_dev-123_/);

  // Verification consumes the state (prevents replay attacks)
  const entry = verifyOAuthState(state);
  assert.ok(entry);
  assert.equal(entry.deviceId, 'dev-123');
  assert.equal(entry.platform, 'youtube');

  // Second verification must return null
  const replay = verifyOAuthState(state);
  assert.equal(replay, null);
});

test('OAuth auth URL generation respects server environment configuration', () => {
  // Without client ID -> returns configured: false
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.YOUTUBE_CLIENT_ID;
  const unconfiguredYt = getOAuthAuthUrl('youtube', 'dev-123', 'https://sana-ai-0ejd.onrender.com/api/v1/oauth/youtube/callback');
  assert.equal(unconfiguredYt.configured, false);
  assert.match(unconfiguredYt.missing, /GOOGLE_CLIENT_ID/);

  // With client ID -> returns valid official Google OAuth URL
  process.env.GOOGLE_CLIENT_ID = 'mock-google-client-id.apps.googleusercontent.com';
  const configuredYt = getOAuthAuthUrl('youtube', 'dev-123', 'https://sana-ai-0ejd.onrender.com/api/v1/oauth/youtube/callback');
  assert.equal(configuredYt.configured, true);
  assert.match(configuredYt.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  assert.match(configuredYt.url, /response_type=code/);
  delete process.env.GOOGLE_CLIENT_ID;
});

test('OAuth token abstraction saves, retrieves, and revokes tokens without leakage', () => {
  const deviceId = 'dev-456';
  saveOAuthToken(deviceId, 'youtube', {
    accessToken: 'test-token-12345',
    refreshToken: 'test-refresh-67890',
  });

  const stored = getOAuthToken(deviceId, 'youtube');
  assert.ok(stored);
  assert.equal(stored.accessToken, 'test-token-12345');

  const status = getOAuthStatus(deviceId, 'youtube');
  assert.equal(status.connected, true);
  assert.equal(status.platform, 'youtube');
  // Token value should never be present in public status response
  assert.equal(status.accessToken, undefined);

  const removed = removeOAuthToken(deviceId, 'youtube');
  assert.equal(removed, true);
  assert.equal(getOAuthToken(deviceId, 'youtube'), null);
});
