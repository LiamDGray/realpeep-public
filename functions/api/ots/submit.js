/**
 * CF Pages Function: POST /api/ots/submit
 *
 * Proxies a Merkle root hash to the OpenTimestamps calendar server.
 * Returns a pending OTS proof that the client stores locally.
 *
 * Production: deployed to Cloudflare Pages as functions/api/ots/submit.js
 * Demo: also callable from the browser via fetch()
 */

const OTS_CALENDAR = 'https://alice.btc.calendar.opentimestamps.org';

export async function onRequestPost({ request }) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    try {
        const body = await request.json();
        const { merkle_root_hex } = body;

        if (!merkle_root_hex || !/^[0-9a-fA-F]{64}$/.test(merkle_root_hex)) {
            return new Response(JSON.stringify({
                error: 'merkle_root_hex must be a 64-character hex string',
            }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        // Convert hex to bytes for the OTS calendar
        const merkleRootBytes = hexToBytes(merkle_root_hex);

        // Submit to OTS calendar
        const otsResponse = await fetch(`${OTS_CALENDAR}/digest`, {
            method: 'POST',
            body: merkleRootBytes,
            headers: { 'Content-Type': 'application/octet-stream' },
        });

        if (!otsResponse.ok) {
            return new Response(JSON.stringify({
                error: `OTS calendar returned ${otsResponse.status}`,
            }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        const otsProof = await otsResponse.arrayBuffer();

        // Return as hex for the client
        const otsProofHex = bytesToHex(new Uint8Array(otsProof));

        return new Response(JSON.stringify({
            status: 'pending',
            ots_proof_hex: otsProofHex,
            calendar: OTS_CALENDAR,
            submitted_at: Date.now(),
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });

    } catch (e) {
        return new Response(JSON.stringify({
            error: `Internal error: ${e.message}`,
        }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
}

export async function onRequestOptions() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        },
    });
}

function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

function bytesToHex(bytes) {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
