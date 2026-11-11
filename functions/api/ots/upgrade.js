/**
 * CF Pages Function: POST /api/ots/upgrade
 *
 * Polls the OTS calendar for an upgraded timestamp with a Bitcoin attestation.
 * Called periodically by the client until the timestamp is confirmed.
 *
 * Production: deployed to Cloudflare Pages as functions/api/ots/upgrade.js
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
        const { merkle_root_hex, ots_proof_hex } = body;

        if (!merkle_root_hex || !/^[0-9a-fA-F]{64}$/.test(merkle_root_hex)) {
            return new Response(JSON.stringify({
                error: 'merkle_root_hex must be a 64-character hex string',
            }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        const merkleRootBytes = hexToBytes(merkle_root_hex);

        // Fetch the current timestamp from the calendar
        const tsUrl = `${OTS_CALENDAR}/timestamp/${merkle_root_hex}`;
        const otsResponse = await fetch(tsUrl);

        if (!otsResponse.ok) {
            // Calendar doesn't have it yet — return the existing proof
            return new Response(JSON.stringify({
                status: 'pending',
                ots_proof_hex: ots_proof_hex || null,
                message: 'Timestamp not yet available on calendar',
            }), { headers: { ...cors, 'Content-Type': 'application/json' } });
        }

        const upgradedProof = await otsResponse.arrayBuffer();
        const upgradedHex = bytesToHex(new Uint8Array(upgradedProof));

        // Check if this contains a Bitcoin attestation
        // (simplified: just return the upgraded proof)
        return new Response(JSON.stringify({
            status: 'upgraded',
            ots_proof_hex: upgradedHex,
            message: 'Upgraded timestamp received (may contain Bitcoin attestation)',
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
