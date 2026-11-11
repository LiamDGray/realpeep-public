/**
 * RealPeep Bundles Worker
 *
 * POST /api/bundles — accepts JSON bundle from Android app,
 * validates the structure, and stores raw JSON to R2.
 *
 * Deployed as a standalone Cloudflare Worker (not Pages Functions).
 */

// ─── CORS ───────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body, init = {}) {
  const headers = new Headers(init.headers || {});
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    headers.set(k, v);
  }
  if (body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return new Response(body, { ...init, headers });
}

// ─── Validation ─────────────────────────────────────────────────────

function validateBundle(body) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return ['Request body must be a JSON object'];
  }

  if (!body.sessionId || typeof body.sessionId !== 'string') {
    errors.push('Missing or invalid field: sessionId (string required)');
  }

  if (!body.meshId || typeof body.meshId !== 'string') {
    errors.push('Missing or invalid field: meshId (string required)');
  }

  if (!body.publicKey || typeof body.publicKey !== 'string') {
    errors.push('Missing or invalid field: publicKey (string required)');
  }

  if (!Array.isArray(body.bundles)) {
    errors.push('Missing or invalid field: bundles (array required)');
  }

  return errors;
}

// ─── Handlers ───────────────────────────────────────────────────────

/**
 * OPTIONS /api/bundles — CORS preflight.
 */
function handleOptions() {
  return corsResponse(null, { status: 204 });
}

/**
 * POST /api/bundles — validate and store bundle.
 */
async function handlePost(request, env) {
  // Parse JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return corsResponse(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400 }
    );
  }

  // Validate
  const errors = validateBundle(body);
  if (errors.length > 0) {
    return corsResponse(
      JSON.stringify({ error: errors.join('; ') }),
      { status: 400 }
    );
  }

  // Store to R2
  const key = `${body.sessionId}.json`;
  const stored = Date.now();
  const payload = JSON.stringify(body);

  try {
    await env.BUNDLES.put(key, payload, {
      httpMetadata: { contentType: 'application/json' },
    });
  } catch (err) {
    return corsResponse(
      JSON.stringify({ error: `R2 storage failed: ${err.message}` }),
      { status: 500 }
    );
  }

  return corsResponse(
    JSON.stringify({
      success: true,
      sessionId: body.sessionId,
      stored,
    })
  );
}

// ─── Router ─────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const method = request.method;

    // Route: /api/bundles
    if (url.pathname === '/api/bundles' || url.pathname.endsWith('/api/bundles')) {
      if (method === 'OPTIONS') {
        return handleOptions();
      }
      if (method === 'POST') {
        return handlePost(request, env);
      }
      return corsResponse(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405 }
      );
    }

    // Not found for all other routes
    return corsResponse(
      JSON.stringify({ error: 'Not found' }),
      { status: 404 }
    );
  },
};
