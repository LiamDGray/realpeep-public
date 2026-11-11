/**
 * MNR Rollup Server — CF Pages Functions
 *
 * In-memory state for the demo. In production, use D1 (SQLite) for persistence.
 * Each deployed Worker instance has its own in-memory state (not shared).
 *
 * Endpoints:
 *   POST /api/mnr/payload   — receive ZK payload from a device
 *   POST /api/mnr/receipt   — receive cryptographic receipt
 *   POST /api/mnr/rollup    — attempt retroactive rollup for a pair
 *   GET  /api/mnr/certificates — list all issued certificates
 *   GET  /api/mnr/stats     — server statistics
 */

// In-memory state (per Worker instance — resets on cold start)
const STATE = {
    payloads: new Map(),      // ephemeral_key → payload
    receipts: new Map(),      // "deviceId_targetKey" → receipt
    certificates: [],         // [{ certificate_id, key_a, key_b, issued_at }]
};

/**
 * Simple hash for demo certificate IDs.
 */
function demoHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
}

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};
const jsonHeader = { 'Content-Type': 'application/json' };

// ─── POST /api/mnr/payload ────────────────────────────────────────
async function handlePayload(request) {
    try {
        const body = await request.json();
        const { ephemeral_key, device_id, captured_keys } = body;

        if (!ephemeral_key || !device_id) {
            return new Response(JSON.stringify({ error: 'Missing ephemeral_key or device_id' }),
                { status: 400, headers: { ...cors, ...jsonHeader } });
        }

        STATE.payloads.set(ephemeral_key, {
            device_id,
            ephemeral_key,
            captured_keys: captured_keys || [],
            received_at: Date.now(),
        });

        return new Response(JSON.stringify({
            ok: true,
            payload_count: STATE.payloads.size,
        }), { headers: { ...cors, ...jsonHeader } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
            { status: 500, headers: { ...cors, ...jsonHeader } });
    }
}

// ─── POST /api/mnr/receipt ────────────────────────────────────────
async function handleReceipt(request) {
    try {
        const body = await request.json();
        const { device_id, target_key, signature } = body;

        if (!device_id || !target_key || !signature) {
            return new Response(JSON.stringify({ error: 'Missing device_id, target_key, or signature' }),
                { status: 400, headers: { ...cors, ...jsonHeader } });
        }

        const receiptKey = `${device_id}_${target_key}`;
        STATE.receipts.set(receiptKey, {
            device_id,
            target_key,
            signature,
            received_at: Date.now(),
        });

        return new Response(JSON.stringify({
            ok: true,
            receipt_count: STATE.receipts.size,
        }), { headers: { ...cors, ...jsonHeader } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
            { status: 500, headers: { ...cors, ...jsonHeader } });
    }
}

// ─── POST /api/mnr/rollup ─────────────────────────────────────────
async function handleRollup(request) {
    try {
        const body = await request.json();
        const { key_a, key_b } = body;

        if (!key_a || !key_b) {
            return new Response(JSON.stringify({ error: 'Missing key_a or key_b' }),
                { status: 400, headers: { ...cors, ...jsonHeader } });
        }

        // 1. Both payloads must exist
        const payloadA = STATE.payloads.get(key_a);
        const payloadB = STATE.payloads.get(key_b);
        if (!payloadA || !payloadB) {
            return new Response(JSON.stringify({
                success: false,
                reason: 'Missing payloads on server.',
                certificate_id: null,
            }), { headers: { ...cors, ...jsonHeader } });
        }

        // 2. Mutual entanglement: each must have observed the other
        if (!payloadA.captured_keys.includes(key_b) ||
            !payloadB.captured_keys.includes(key_a)) {
            return new Response(JSON.stringify({
                success: false,
                reason: 'No mutual entanglement found.',
                certificate_id: null,
            }), { headers: { ...cors, ...jsonHeader } });
        }

        // 3. Mutual consent: each must have signed a receipt
        const receiptAKey = `${payloadA.device_id}_${key_b}`;
        const receiptBKey = `${payloadB.device_id}_${key_a}`;
        if (!STATE.receipts.has(receiptAKey) || !STATE.receipts.has(receiptBKey)) {
            return new Response(JSON.stringify({
                success: false,
                reason: 'Missing MNR cryptographic receipts.',
                certificate_id: null,
            }), { headers: { ...cors, ...jsonHeader } });
        }

        // 4. Issue certificate
        const certId = demoHash(`${key_a}:${key_b}:${Date.now()}`);
        const cert = {
            certificate_id: certId,
            key_a,
            key_b,
            issued_at: Date.now(),
        };
        STATE.certificates.push(cert);

        return new Response(JSON.stringify({
            success: true,
            reason: 'Mutual Non-Repudiation Established.',
            certificate_id: certId,
        }), { headers: { ...cors, ...jsonHeader } });

    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }),
            { status: 500, headers: { ...cors, ...jsonHeader } });
    }
}

// ─── GET /api/mnr/certificates ────────────────────────────────────
async function handleCertificates() {
    return new Response(JSON.stringify({
        certificates: STATE.certificates,
        count: STATE.certificates.length,
    }), { headers: { ...cors, ...jsonHeader } });
}

// ─── GET /api/mnr/stats ───────────────────────────────────────────
async function handleStats() {
    return new Response(JSON.stringify({
        payload_count: STATE.payloads.size,
        receipt_count: STATE.receipts.size,
        certificate_count: STATE.certificates.length,
    }), { headers: { ...cors, ...jsonHeader } });
}

// ─── OPTIONS (CORS preflight) ─────────────────────────────────────
async function handleOptions() {
    return new Response(null, { status: 204, headers: cors });
}

// ─── Router ───────────────────────────────────────────────────────
export async function onRequest(context) {
    const { request } = context;
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'OPTIONS') return handleOptions();

    // Route based on path
    if (url.pathname.endsWith('/payload') && method === 'POST') return handlePayload(request);
    if (url.pathname.endsWith('/receipt') && method === 'POST') return handleReceipt(request);
    if (url.pathname.endsWith('/rollup') && method === 'POST') return handleRollup(request);
    if (url.pathname.endsWith('/certificates') && method === 'GET') return handleCertificates();
    if (url.pathname.endsWith('/stats') && method === 'GET') return handleStats();

    return new Response(JSON.stringify({
        error: 'Not found',
        endpoints: ['POST /payload', 'POST /receipt', 'POST /rollup', 'GET /certificates', 'GET /stats'],
    }), { status: 404, headers: { ...cors, ...jsonHeader } });
}
