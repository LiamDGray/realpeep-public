/**
 * RealPeep MNR Notary Worker (D1-backed)
 *
 * Replaces the in-memory STATE in functions/api/mnr/index.js with
 * durable D1 persistence so certificates survive Worker cold-starts.
 *
 * Endpoints:
 *   POST /api/mnr/payload       — receive ZK payload from a device
 *   POST /api/mnr/receipt       — receive cryptographic receipt
 *   POST /api/mnr/rollup        — attempt retroactive rollup for a pair
 *   GET  /api/mnr/certificates  — list all issued certificates
 *   GET  /api/mnr/stats         — server statistics
 */

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
const jsonHeader = { 'Content-Type': 'application/json' };

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, ...jsonHeader },
    });
}

/** Simple deterministic certificate ID (no crypto required at edge). */
function certId(keyA, keyB, ts) {
    let h = 0;
    const s = `${keyA}:${keyB}:${ts}`;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
}

// ─── POST /api/mnr/payload ────────────────────────────────────────

async function handlePayload(request, env) {
    let body;
    try { body = await request.json(); } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    const { ephemeral_key, device_id, captured_keys } = body;
    if (!ephemeral_key || !device_id) {
        return json({ error: 'Missing ephemeral_key or device_id' }, 400);
    }

    const capturedJson = JSON.stringify(captured_keys || []);
    await env.DB.prepare(
        `INSERT OR REPLACE INTO payloads (ephemeral_key, device_id, captured_keys, received_at)
         VALUES (?, ?, ?, ?)`
    ).bind(ephemeral_key, device_id, capturedJson, Date.now()).run();

    const { results } = await env.DB.prepare('SELECT COUNT(*) AS c FROM payloads').all();
    return json({ ok: true, payload_count: results[0].c });
}

// ─── POST /api/mnr/receipt ────────────────────────────────────────

async function handleReceipt(request, env) {
    let body;
    try { body = await request.json(); } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    const { device_id, target_key, signature } = body;
    if (!device_id || !target_key || !signature) {
        return json({ error: 'Missing device_id, target_key, or signature' }, 400);
    }

    const receiptKey = `${device_id}_${target_key}`;
    await env.DB.prepare(
        `INSERT OR REPLACE INTO receipts (receipt_key, device_id, target_key, signature, received_at)
         VALUES (?, ?, ?, ?, ?)`
    ).bind(receiptKey, device_id, target_key, signature, Date.now()).run();

    const { results } = await env.DB.prepare('SELECT COUNT(*) AS c FROM receipts').all();
    return json({ ok: true, receipt_count: results[0].c });
}

// ─── POST /api/mnr/rollup ─────────────────────────────────────────

async function handleRollup(request, env) {
    let body;
    try { body = await request.json(); } catch {
        return json({ error: 'Invalid JSON' }, 400);
    }
    const { key_a, key_b } = body;
    if (!key_a || !key_b) {
        return json({ error: 'Missing key_a or key_b' }, 400);
    }

    // 1. Both payloads must exist
    const { results: payloads } = await env.DB.prepare(
        `SELECT * FROM payloads WHERE ephemeral_key IN (?, ?)`
    ).bind(key_a, key_b).all();

    const payloadA = payloads.find(p => p.ephemeral_key === key_a);
    const payloadB = payloads.find(p => p.ephemeral_key === key_b);

    if (!payloadA || !payloadB) {
        return json({ success: false, reason: 'Missing payloads on server.', certificate_id: null });
    }

    // 2. Mutual entanglement: each must have observed the other
    const keysA = JSON.parse(payloadA.captured_keys);
    const keysB = JSON.parse(payloadB.captured_keys);
    if (!keysA.includes(key_b) || !keysB.includes(key_a)) {
        return json({ success: false, reason: 'No mutual entanglement found.', certificate_id: null });
    }

    // 3. Mutual consent: each must have signed a receipt for the other
    const receiptKeyAB = `${payloadA.device_id}_${key_b}`;
    const receiptKeyBA = `${payloadB.device_id}_${key_a}`;
    const { results: receipts } = await env.DB.prepare(
        `SELECT receipt_key FROM receipts WHERE receipt_key IN (?, ?)`
    ).bind(receiptKeyAB, receiptKeyBA).all();

    const receiptKeys = receipts.map(r => r.receipt_key);
    if (!receiptKeys.includes(receiptKeyAB) || !receiptKeys.includes(receiptKeyBA)) {
        return json({ success: false, reason: 'Missing MNR cryptographic receipts.', certificate_id: null });
    }

    // 4. Issue certificate (idempotent — skip if already exists)
    const existing = await env.DB.prepare(
        `SELECT certificate_id FROM certificates WHERE key_a = ? AND key_b = ?`
    ).bind(key_a, key_b).first();
    if (existing) {
        return json({ success: true, reason: 'Certificate already issued.', certificate_id: existing.certificate_id });
    }

    const ts = Date.now();
    const id = certId(key_a, key_b, ts);
    await env.DB.prepare(
        `INSERT INTO certificates (certificate_id, key_a, key_b, issued_at) VALUES (?, ?, ?, ?)`
    ).bind(id, key_a, key_b, ts).run();

    return json({ success: true, reason: 'Mutual Non-Repudiation Established.', certificate_id: id });
}

// ─── GET /api/mnr/certificates ────────────────────────────────────

async function handleCertificates(env) {
    const { results } = await env.DB.prepare(
        `SELECT * FROM certificates ORDER BY issued_at DESC LIMIT 100`
    ).all();
    return json({ certificates: results, count: results.length });
}

// ─── GET /api/mnr/stats ───────────────────────────────────────────

async function handleStats(env) {
    const [p, r, c] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) AS c FROM payloads').first(),
        env.DB.prepare('SELECT COUNT(*) AS c FROM receipts').first(),
        env.DB.prepare('SELECT COUNT(*) AS c FROM certificates').first(),
    ]);
    return json({
        payload_count: p.c,
        receipt_count: r.c,
        certificate_count: c.c,
    });
}

// ─── Router ───────────────────────────────────────────────────────

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;

        if (method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: cors });
        }

        const path = url.pathname;

        if (path.endsWith('/payload')      && method === 'POST') return handlePayload(request, env);
        if (path.endsWith('/receipt')      && method === 'POST') return handleReceipt(request, env);
        if (path.endsWith('/rollup')       && method === 'POST') return handleRollup(request, env);
        if (path.endsWith('/certificates') && method === 'GET')  return handleCertificates(env);
        if (path.endsWith('/stats')        && method === 'GET')  return handleStats(env);

        return json({
            error: 'Not found',
            endpoints: ['POST /api/mnr/payload', 'POST /api/mnr/receipt',
                        'POST /api/mnr/rollup',  'GET /api/mnr/certificates',
                        'GET /api/mnr/stats'],
        }, 404);
    },
};
