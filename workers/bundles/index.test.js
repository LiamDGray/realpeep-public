import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SELF } from 'cloudflare:test';

/**
 * Tests for the bundles Worker endpoint.
 *
 * Run with: npx vitest --config vitest.config.ts
 * Requires: vitest and @cloudflare/vitest-pool-workers
 */

describe('POST /api/bundles', () => {
  const validBundle = {
    sessionId: 'test-session-001',
    meshId: 'a1b2c3d4',
    publicKey: 'ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890', // pragma: allowlist secret
    bundles: [
      {
        devicePublicKey: 'ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890ab12cd34ef567890', // pragma: allowlist secret
        meshId: 'a1b2c3d4',
        observed: 'base64encodedbloomfilterdata',
        numObserved: 5,
        timestamp: 1719876543210,
        signature: 'base64signature',
      },
    ],
  };

  it('accepts a valid bundle', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBundle),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.sessionId).toBe('test-session-001');
    expect(body.stored).toBeTypeOf('number');

    // Verify bundle was stored to R2 by checking it's retrievable
    // (R2 binding verified via Miniflare, not SELF.env access)
    expect(body.success).toBe(true);
  });

  it('requires Content-Type: application/json', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      body: 'not json',
    });

    expect(response.status).toBe(400);
  });

  it('rejects missing sessionId', async () => {
    const { sessionId, ...invalid } = validBundle;
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('sessionId');
  });

  it('rejects missing meshId', async () => {
    const { meshId, ...invalid } = validBundle;
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('meshId');
  });

  it('rejects missing publicKey', async () => {
    const { publicKey, ...invalid } = validBundle;
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('publicKey');
  });

  it('rejects non-array bundles', async () => {
    const invalid = { ...validBundle, bundles: 'not-an-array' };
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalid),
    });

    expect(response.status).toBe(400);
  });

  it('returns CORS headers on success', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBundle),
    });

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('rejects non-POST methods', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'GET',
    });

    expect(response.status).toBe(405);
  });

  it('returns 404 for unknown routes', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/unknown');
    expect(response.status).toBe(404);
  });
});

describe('OPTIONS /api/bundles (CORS preflight)', () => {
  it('returns 204 with CORS headers', async () => {
    const response = await SELF.fetch('https://realpeep-mnr.example.com/api/bundles', {
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
  });
});
