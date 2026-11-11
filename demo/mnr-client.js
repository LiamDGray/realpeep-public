/**
 * mnr-client.js — MNR Server API client for browser and Node.
 *
 * Pure functions wrapping fetch() calls to the MNR rollup server.
 * All functions return Promises. No DOM, fully testable.
 *
 * Endpoints:
 *   POST /api/mnr/payload
 *   POST /api/mnr/receipt
 *   POST /api/mnr/rollup
 *   GET  /api/mnr/certificates
 *   GET  /api/mnr/stats
 */

const DEFAULT_BASE_URL = '/api/mnr';

/**
 * @typedef {Object} MNRPayload
 * @property {string} ephemeral_key
 * @property {string} device_id
 * @property {string[]} captured_keys
 */

/**
 * @typedef {Object} MNRReceipt
 * @property {string} device_id
 * @property {string} target_key
 * @property {string} signature
 */

/**
 * @typedef {Object} RollupResponse
 * @property {boolean} success
 * @property {string} reason
 * @property {string|null} certificate_id
 */

/**
 * Submit a ZK payload to the MNR server.
 *
 * @param {MNRPayload} payload
 * @param {string} [baseUrl]
 * @returns {Promise<{ok: boolean, payload_count?: number, error?: string}>}
 */
export async function submitPayload(payload, baseUrl = DEFAULT_BASE_URL) {
    const resp = await fetch(`${baseUrl}/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    return resp.json();
}

/**
 * Submit a cryptographic receipt to the MNR server.
 *
 * @param {MNRReceipt} receipt
 * @param {string} [baseUrl]
 * @returns {Promise<{ok: boolean, receipt_count?: number, error?: string}>}
 */
export async function submitReceipt(receipt, baseUrl = DEFAULT_BASE_URL) {
    const resp = await fetch(`${baseUrl}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt),
    });
    return resp.json();
}

/**
 * Attempt retroactive rollup for a device pair.
 *
 * @param {string} keyA
 * @param {string} keyB
 * @param {string} [baseUrl]
 * @returns {Promise<RollupResponse>}
 */
export async function attemptRollup(keyA, keyB, baseUrl = DEFAULT_BASE_URL) {
    const resp = await fetch(`${baseUrl}/rollup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_a: keyA, key_b: keyB }),
    });
    return resp.json();
}

/**
 * Get all issued certificates.
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{certificates: Object[], count: number}>}
 */
export async function getCertificates(baseUrl = DEFAULT_BASE_URL) {
    const resp = await fetch(`${baseUrl}/certificates`);
    return resp.json();
}

/**
 * Get server statistics.
 *
 * @param {string} [baseUrl]
 * @returns {Promise<{payload_count: number, receipt_count: number, certificate_count: number}>}
 */
export async function getStats(baseUrl = DEFAULT_BASE_URL) {
    const resp = await fetch(`${baseUrl}/stats`);
    return resp.json();
}

// ── Full Upload Flow ───────────────────────────────────────────────

/**
 * Run the complete upload flow for a set of devices.
 *
 * Each device uploads its payload + receipts for observed devices,
 * then the server attempts rollups for all pairs.
 *
 * @param {Array<{pk: string, nonce: string, observedNonces: string[]}>} devices
 * @param {string} [baseUrl]
 * @returns {Promise<{results: RollupResponse[], certificates: Object[]}>}
 */
export async function uploadAndRollup(devices, baseUrl = DEFAULT_BASE_URL) {
    // Step 1: Upload payloads
    for (const device of devices) {
        await submitPayload({
            ephemeral_key: device.pk,
            device_id: device.pk,
            captured_keys: device.observedNonces || [],
        }, baseUrl);
    }

    // Step 2: Sign and upload receipts
    for (const device of devices) {
        for (const other of devices) {
            if (device.pk === other.pk) continue;
            await submitReceipt({
                device_id: device.pk,
                target_key: other.pk,
                signature: 'sig_' + device.pk + '_' + other.pk,
            }, baseUrl);
        }
    }

    // Step 3: Attempt rollups for all pairs
    const results = [];
    for (const device of devices) {
        for (const other of devices) {
            if (device.pk === other.pk) continue;
            const result = await attemptRollup(device.pk, other.pk, baseUrl);
            results.push(result);
        }
    }

    // Step 4: Fetch certificates
    const { certificates } = await getCertificates(baseUrl);

    return { results, certificates };
}
