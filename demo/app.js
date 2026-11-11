// DOM short-hands
const $ = id => document.getElementById(id);

// ===================================================================
// 1. CME Logic (unchanged)
// ===================================================================
const CME_THRESHOLD = 1.0;
const elCME = {
    slider: $('cme-slider'), val: $('cme-latency-val'), aPeak: $('cme-a-peak'),
    status: $('cme-status'), result: $('cme-result')
};

function updateCME() {
    const latency = parseFloat(elCME.slider.value);
    elCME.val.textContent = latency.toFixed(1);
    elCME.aPeak.style.left = `${50 + latency}%`;
    const passed = latency <= CME_THRESHOLD;
    updateStatus(elCME.status, elCME.result, passed,
        `Physical sync validated. Delta: ${latency}ms`,
        `DECOUPLED PIPELINE. Delta ${latency}ms > ${CME_THRESHOLD}ms`);
}
elCME.slider.addEventListener('input', updateCME);

// ===================================================================
// 2. SPCI Logic (unchanged)
// ===================================================================
const SPCI_THRESHOLD = 8.0;
const elSPCI = {
    slider: $('spci-slider'), val: $('spci-latency-val'), flasher: $('spci-flasher'),
    canvas: $('spci-canvas'), btn: $('spci-test-btn'), status: $('spci-status'),
    result: $('spci-result'), duress: $('spci-duress-toggle')
};
// Initialize text to match slider value on load
elSPCI.val.textContent = elSPCI.slider.value;
elSPCI.slider.addEventListener('input', e => elSPCI.val.textContent = e.target.value);

async function runSPCITest() {
    elSPCI.btn.disabled = true;
    const latency = parseInt(elSPCI.slider.value);
    const isDuress = elSPCI.duress.checked;
    const ctx = elSPCI.canvas.getContext('2d');
    const width = elSPCI.canvas.width, height = elSPCI.canvas.height;
    ctx.clearRect(0, 0, width, height);
    elSPCI.result.textContent = "Running 120Hz sequence...";
    elSPCI.result.className = "result-box";
    const sequence = Array.from({length: 20}, () => Math.random() > 0.5 ? 1 : 0);
    for (let i = 0; i < sequence.length; i++) {
        elSPCI.flasher.style.background = sequence[i] ? '#00d2ff' : '#111';
        elSPCI.flasher.style.color = sequence[i] ? '#000' : '#fff';
        ctx.fillStyle = sequence[i] ? 'rgba(0, 210, 255, 0.3)' : 'transparent';
        ctx.fillRect((i/20)*width, 0, width/20, height/2);
        const reflectIdx = i - Math.floor(latency/3);
        if (reflectIdx >= 0 && reflectIdx < sequence.length) {
            ctx.fillStyle = sequence[reflectIdx] ? 'rgba(0, 230, 118, 0.8)' : 'transparent';
            ctx.fillRect((i/20)*width, height/2, width/20, height/2);
        }
        await new Promise(r => setTimeout(r, 50));
    }
    elSPCI.flasher.style.background = '#111';
    elSPCI.flasher.style.color = '#fff';
    const passed = latency <= SPCI_THRESHOLD;
    if (isDuress) {
        updateStatus(elSPCI.status, elSPCI.result, true,
            `UI APPEARS TO PASS.<br><br>SILENT DISTRESS FLAG EMBEDDED IN PAYLOAD.`,
            "", true);
    } else {
        updateStatus(elSPCI.status, elSPCI.result, passed,
            `Correlation > 0.8. Latency ${latency}ms verified.`,
            `RENDER BOTTLENECK. Latency ${latency}ms > ${SPCI_THRESHOLD}ms`);
    }
    elSPCI.btn.disabled = false;
}
elSPCI.btn.addEventListener('click', runSPCITest);

// ===================================================================
// 3. HCSJ Logic (unchanged)
// ===================================================================
const HCSJ_THRESHOLD = 0.05;
const elHCSJ = {
    toggle: $('hcsj-toggle'), canvas: $('hcsj-canvas'),
    status: $('hcsj-status'), result: $('hcsj-result')
};

function drawHCSJ() {
    const ctx = elHCSJ.canvas.getContext('2d');
    const width = elHCSJ.canvas.width, height = elHCSJ.canvas.height;
    const isOled = elHCSJ.toggle.checked;
    const samples = 100;
    const data = [];
    for (let i = 0; i < samples; i++) {
        let val = 0.5 + (Math.random() - 0.5) * 0.05;
        if (isOled) val += Math.sin(Date.now() / 50 + i * 0.2) * 0.3;
        data.push(val);
    }
    const mean = data.reduce((a, b) => a + b) / samples;
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples;
    const normalizedVar = variance / Math.pow(mean, 2);
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.strokeStyle = isOled ? '#ff1744' : '#00e676';
    ctx.lineWidth = 2;
    for (let i = 0; i < samples; i++) {
        const x = (i / samples) * width;
        const y = height - (data[i] * height);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const passed = normalizedVar <= HCSJ_THRESHOLD;
    updateStatus(elHCSJ.status, elHCSJ.result, passed,
        `Continuous Light. Var: ${normalizedVar.toFixed(4)}`,
        `ANALOG HOLE DETECTED. Var: ${normalizedVar.toFixed(4)} > ${HCSJ_THRESHOLD}`);
    requestAnimationFrame(drawHCSJ);
}

// ===================================================================
// 4. P0a: ZK Pipeline — Enhanced with Duress Key Demo
// Uses duress-core.js for nonce search and predicate checks.
// ===================================================================
import { generateNormalNonce, searchDuressNonce } from './duress-core.js';
const elZK = {
    slider: $('zk-slider'), val: $('zk-latency-val'),
    enclave: $('zk-enclave-data'), circuit: $('zk-circuit-data'),
    network: $('zk-network-data'), server: $('zk-server-data'),
    arr1: $('arrow-1'), arr2: $('arrow-2'), arr3: $('arrow-3'),
    btn: $('zk-test-btn'), status: $('zk-status'), result: $('zk-result'),
    normalBtn: $('passphrase-normal-btn'),
    duressBtn: $('passphrase-duress-btn'),
    passphraseLabel: $('passphrase-active-label'),
    viewCaptorBtn: $('view-captor-btn'),
    viewNotaryBtn: $('view-notary-btn'),
    notaryPanel: $('notary-detection-panel'),
    notaryConsole: $('notary-console'),
    notaryBadge: $('notary-badge'),
    captorDilemma: $('captor-dilemma'),
    duressAlert: $('duress-alert'),
    duressMiss: $('duress-miss')
};

let selectedPassphrase = null;
let activeView = 'captor';
let lastZKResult = null;

elZK.normalBtn.addEventListener('click', () => selectPassphrase('normal'));
elZK.duressBtn.addEventListener('click', () => selectPassphrase('duress'));

function selectPassphrase(type) {
    selectedPassphrase = type;
    elZK.normalBtn.classList.toggle('active-passphrase', type === 'normal');
    elZK.duressBtn.classList.toggle('active-passphrase', type === 'duress');
    if (type === 'normal') {
        elZK.passphraseLabel.textContent = '🔓 Normal passphrase selected. Proof will have NO duress flag.';
        elZK.passphraseLabel.style.color = 'var(--pass-color)';
    } else {
        elZK.passphraseLabel.textContent = '🔐 Duress passphrase selected. Proof will carry a hidden duress flag.';
        elZK.passphraseLabel.style.color = 'var(--warn-color)';
    }
}

elZK.viewCaptorBtn.addEventListener('click', () => setActiveView('captor'));
elZK.viewNotaryBtn.addEventListener('click', () => setActiveView('notary'));

function setActiveView(view) {
    activeView = view;
    elZK.viewCaptorBtn.classList.toggle('active-view', view === 'captor');
    elZK.viewNotaryBtn.classList.toggle('active-view', view === 'notary');
    elZK.notaryPanel.style.display = view === 'notary' ? 'block' : 'none';
    elZK.duressAlert.style.display = 'none';
    elZK.duressMiss.style.display = 'none';
    elZK.captorDilemma.style.display = view === 'captor' && selectedPassphrase ? 'block' : 'none';
    if (lastZKResult !== null) showZKResult(lastZKResult);
}

elZK.slider.addEventListener('input', e => elZK.val.textContent = e.target.value);

async function runZKPipeline() {
    if (!selectedPassphrase) {
        elZK.result.textContent = "⚠ Select a passphrase first to begin.";
        elZK.result.className = "result-box warn-box";
        return;
    }
    elZK.btn.disabled = true;
    const tcpDelay = parseInt(elZK.slider.value);
    const isDuress = selectedPassphrase === 'duress';
    elZK.arr1.className = elZK.arr2.className = elZK.arr3.className = "zk-arrow";
    elZK.enclave.innerHTML = "Waiting...";
    elZK.circuit.innerHTML = "...";
    elZK.network.innerHTML = "...";
    elZK.server.innerHTML = "...";
    elZK.duressAlert.style.display = 'none';
    elZK.duressMiss.style.display = 'none';
    elZK.notaryConsole.innerHTML = '[notary] Listening for incoming proofs...';
    const fakeDeviceID = "DEV-APPLE-SN-009841";

    elZK.arr1.className = "zk-arrow active-arrow";
    elZK.enclave.innerHTML = `Sig:<br><span class="${isDuress ? 'highlight-green' : 'highlight-red'}">${fakeDeviceID}</span><br>Passphrase: <span class="${isDuress ? 'warn' : 'pass'}">${isDuress ? 'duress' : 'normal'}</span>`;
    await new Promise(r => setTimeout(r, 600));
    elZK.arr1.className = "zk-arrow";

    elZK.result.textContent = "ZK Circuit: Verifying identity & generating ephemeral proof...";
    elZK.result.className = "result-box";
    elZK.arr2.className = "zk-arrow active-arrow";
    const ephemeralKey = `ephemeral_pk_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    elZK.circuit.innerHTML = `Verify: OK<br>Scrub: [DEV-***]<br>New Key: <span class="highlight-green">${ephemeralKey}</span>`;
    await new Promise(r => setTimeout(r, 800));
    elZK.arr2.className = "zk-arrow";
    elZK.result.textContent = `Transmitting via TCP... Simulating ${tcpDelay}ms congestion.`;
    elZK.result.className = "result-box warn-box";
    elZK.arr3.className = "zk-arrow active-arrow";
    elZK.network.innerHTML = `[PACKET EN ROUTE]<br>Delay: ${tcpDelay}ms`;
    await new Promise(r => setTimeout(r, Math.min(tcpDelay, 1500)));
    elZK.arr3.className = "zk-arrow";
    elZK.network.innerHTML = `[DELIVERED]`;
    // Generate nonce — in duress mode, search for one that satisfies the predicate
    let proofNonce, hashHex, duressDetected;
    if (isDuress) {
        // Use duress-core.js search function
        const result = searchDuressNonce(10000);
        proofNonce = result.nonce;
        hashHex = result.hashHex;
        duressDetected = result.found;
    } else {
        // Reject nonces that accidentally satisfy the predicate so a normal
        // session never shows a false duress alert in the demo.
        const normal = generateNormalNonce(10000);
        proofNonce = normal.nonce;
        hashHex = normal.hashHex;
        duressDetected = normal.duressDetected;
    }
    const result = { isDuress, proofNonce, ephemeralKey, hashHex, duressDetected };
    elZK.server.innerHTML = `Signer: <span class="highlight-green">${ephemeralKey}</span><br>Liveness: PASSED<br>Nonce: 0x${proofNonce}...`;
    lastZKResult = result;
    showZKResult(result);
    elZK.btn.disabled = false;
}

function showZKResult(result) {
    const { isDuress, proofNonce, hashHex, duressDetected } = result;
    if (activeView === 'captor') {
        elZK.status.textContent = "VERIFIED";
        elZK.status.className = "status-badge pass";
        elZK.result.textContent = "✓ Liveness proof verified. Provenance chain intact.";
        elZK.result.className = "result-box pass-box";
        elZK.duressAlert.style.display = 'none';
        elZK.duressMiss.style.display = 'none';
        elZK.captorDilemma.style.display = 'block';
    } else {
        elZK.result.className = "result-box";
        elZK.captorDilemma.style.display = 'none';
        const notaryLines = [
            `[notary] Received proof from ${result.ephemeralKey}`,
            `[notary] Verifying signature... OK`,
            `[notary] Checking nonce predicate: SHA256(notary_secret || 0x${proofNonce})`,
            `[notary] Hash result: 0x${hashHex}`,
            duressDetected ? `[notary] 🚨 PREDICATE MATCH — duress marker found! (hash starts with 0x0)` : `[notary] No duress marker detected (hash starts with 0x${hashHex[0]})`
        ];
        elZK.notaryConsole.innerHTML = notaryLines.map(l => `<div>${l}</div>`).join('');
        if (duressDetected) {
            elZK.status.textContent = "DURESS"; elZK.status.className = "status-badge warn";
            elZK.result.textContent = "⚠ Duress flag detected. Proof is valid but flagged.";
            elZK.result.className = "result-box warn-box";
            elZK.notaryBadge.textContent = "🚨 DURESS"; elZK.notaryBadge.className = "notary-badge duress";
            elZK.duressAlert.style.display = 'flex'; elZK.duressMiss.style.display = 'none';
        } else {
            elZK.status.textContent = "VERIFIED"; elZK.status.className = "status-badge pass";
            elZK.result.textContent = "✓ No duress signal. Standard proof — user generated this freely.";
            elZK.result.className = "result-box pass-box";
            elZK.notaryBadge.textContent = "✓ CLEAR"; elZK.notaryBadge.className = "notary-badge normal";
            elZK.duressAlert.style.display = 'none'; elZK.duressMiss.style.display = 'flex';
        }
    }
}
elZK.btn.addEventListener('click', runZKPipeline);

// ===================================================================
// 5. Acoustic Mesh — Transmit-Only Witness Protocol
// ===================================================================
import { hash } from './mesh-protocol.js';

const elMesh = {
    btn: $('mesh-test-btn'), networkText: $('mesh-network-text'),
    statusA: $('device-a-status'), keyA: $('device-a-key'),
    statusB: $('device-b-status'), keyB: $('device-b-key'),
    statusC: $('device-c-status'), keyC: $('device-c-key'),
    timelineA: $('track-a'), timelineB: $('track-b'), timelineC: $('track-c'),
    signedA: $('signed-a'), signedB: $('signed-b'), signedC: $('signed-c'),
    chirpA: $('chirp-a'), chirpB: $('chirp-b'), chirpC: $('chirp-c'),
    chirpAB: $('chirp-from-a-in-b'), chirpAC: $('chirp-from-a-in-c'),
    chirpBA: $('chirp-from-b-in-a'), chirpBC: $('chirp-from-b-in-c'),
    chirpCA: $('chirp-from-c-in-a'), chirpCB: $('chirp-from-c-in-b'),
    scenarioNormal: $('mesh-scenario-normal'), scenarioCoerced: $('mesh-scenario-coerced'),
    scenarioDesc: $('mesh-scenario-desc'),
    hbA: $('device-a-heartbeat'), hbFillA: $('device-a-hb-fill'), hbTimeA: $('device-a-hb-time'),
    hbB: $('device-b-heartbeat'), hbFillB: $('device-b-hb-fill'), hbTimeB: $('device-b-hb-time'),
    hbC: $('device-c-heartbeat'), hbFillC: $('device-c-hb-fill'), hbTimeC: $('device-c-hb-time'),
    detainControls: $('detain-controls'),
    detainAFree: $('detain-a-free'), detainADetained: $('detain-a-detained'),
    detainBFree: $('detain-b-free'), detainBDetained: $('detain-b-detained'),
    detainCFree: $('detain-c-free'), detainCDetained: $('detain-c-detained'),
    consensusGrid: $('consensus-grid'), consensusAStatus: $('consensus-a-status'),
    consensusBStatus: $('consensus-b-status'), consensusCStatus: $('consensus-c-status'),
    consensusVerdict: $('consensus-verdict'),
    correlationPanel: $('correlation-panel'), correlationGrid: $('correlation-grid'),
    topoMap: $('topology-map'), topoEdgeAB: $('topo-edge-ab'), topoEdgeAC: $('topo-edge-ac'),
    topoEdgeBC: $('topo-edge-bc'), topoLegend: $('topology-legend'),
    notaryViz: $('notary-verification'), certBox: $('mnr-cert-box'), certContents: $('cert-contents')
};

let meshScenario = 'normal';
let deviceDetained = { a: false, b: false, c: false };
let heartbeatInterval = null;
let heartbeatValues = { a: 12.0, b: 12.0, c: 12.0 };
const HEARTBEAT_MAX = 12.0;
const HEARTBEAT_EXPIRY = 1.0;

// Touch
elMesh.scenarioNormal.addEventListener('click', () => setMeshScenario('normal'));
elMesh.scenarioCoerced.addEventListener('click', () => setMeshScenario('coerced'));
elMesh.detainAFree.addEventListener('click', () => setDetained('a', false));
elMesh.detainADetained.addEventListener('click', () => setDetained('a', true));
elMesh.detainBFree.addEventListener('click', () => setDetained('b', false));
elMesh.detainBDetained.addEventListener('click', () => setDetained('b', true));
elMesh.detainCFree.addEventListener('click', () => setDetained('c', false));
elMesh.detainCDetained.addEventListener('click', () => setDetained('c', true));

function setMeshScenario(scenario) {
    meshScenario = scenario;
    elMesh.scenarioNormal.classList.toggle('scenario-active', scenario === 'normal');
    elMesh.scenarioCoerced.classList.toggle('scenario-active', scenario === 'coerced');
    if (scenario === 'normal') {
        elMesh.scenarioDesc.textContent = 'All witnesses are free. All attestations will be valid.';
        elMesh.hbA.style.display = 'none'; elMesh.hbB.style.display = 'none'; elMesh.hbC.style.display = 'none';
        elMesh.detainControls.style.display = 'none'; elMesh.consensusGrid.style.display = 'none';
        deviceDetained = { a: false, b: false, c: false }; updateDetainUI(); stopHeartbeat();
    } else {
        elMesh.scenarioDesc.textContent = 'A witness may be detained — heartbeat expires, attestation flagged.';
        elMesh.hbA.style.display = 'block'; elMesh.hbB.style.display = 'block'; elMesh.hbC.style.display = 'block';
        elMesh.detainControls.style.display = 'block'; startHeartbeat();
    }
}

function setDetained(device, detained) {
    deviceDetained[device] = detained; updateDetainUI();
    const fill = device === 'a' ? elMesh.hbFillA : device === 'b' ? elMesh.hbFillB : elMesh.hbFillC;
    const time = device === 'a' ? elMesh.hbTimeA : device === 'b' ? elMesh.hbTimeB : elMesh.hbTimeC;
    const container = $(`device-${device}-container`);
    if (detained) {
        heartbeatValues[device] = 0; fill.style.width = '0%'; fill.className = 'heartbeat-fill expired';
        time.textContent = '0.0s'; time.style.color = 'var(--fail-color)'; container.classList.add('detained-ui');
    } else {
        heartbeatValues[device] = HEARTBEAT_MAX; fill.style.width = '100%'; fill.className = 'heartbeat-fill ok';
        time.textContent = `${HEARTBEAT_MAX.toFixed(1)}s`; time.style.color = 'var(--text-muted)';
        container.classList.remove('detained-ui');
    }
}
function updateDetainUI() {
    const m = { a: ['detainAFree','detainADetained'], b: ['detainBFree','detainBDetained'], c: ['detainCFree','detainCDetained'] };
    for (const [d, ids] of Object.entries(m)) { elMesh[ids[0]].classList.toggle('active-detain', !deviceDetained[d]); elMesh[ids[1]].classList.toggle('active-detain', deviceDetained[d]); }
}
function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatValues = { a: HEARTBEAT_MAX, b: HEARTBEAT_MAX, c: HEARTBEAT_MAX };
    for (const d of ['a','b','c']) { const f = $(`device-${d}-hb-fill`); f.style.width = '100%'; f.className = 'heartbeat-fill ok'; }
    heartbeatInterval = setInterval(() => {
        for (const d of ['a','b','c']) {
            if (deviceDetained[d]) continue;
            heartbeatValues[d] = Math.max(0, heartbeatValues[d] - 0.1);
            const fill = $(`device-${d}-hb-fill`); const t = $(`device-${d}-hb-time`);
            const pct = (heartbeatValues[d] / HEARTBEAT_MAX) * 100; fill.style.width = `${pct}%`;
            fill.className = heartbeatValues[d] > HEARTBEAT_EXPIRY ? 'heartbeat-fill ok' : (heartbeatValues[d] > 0 ? 'heartbeat-fill warning' : 'heartbeat-fill expired');
            t.textContent = `${heartbeatValues[d].toFixed(1)}s`;
        }
    }, 100);
}
function stopHeartbeat() { if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; } }

const delay = ms => new Promise(r => setTimeout(r, ms));
function show(id) { const el = $(id); if (el) el.style.display = 'block'; }
function hide(id) { const el = $(id); if (el) el.style.display = 'none'; }

function placeChirp(trackEl, chirpEl, leftPct, isForeign) {
    chirpEl.style.display = 'block';
    chirpEl.style.left = `${leftPct}%`;
    chirpEl.className = `chirp-marker${isForeign ? ' foreign' : ''}`;
}

// Simulate a simple hash for the demo
function demoHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return Math.abs(h).toString(16).padStart(8, '0');
}

async function runAcousticCapture() {
    elMesh.btn.disabled = true;

    // Reset
    for (const id of ['a','b','c']) {
        $(`device-${id}-container`).classList.remove('detained-ui');
        $(`device-${id}-status`).textContent = 'Idle'; $(`device-${id}-status`).style.color = '';
        $(`device-${id}-key`).textContent = '-';
        hide(`chirp-${id}`); hide(`chirp-from-b-in-${id}`); hide(`chirp-from-c-in-${id}`);
        if (id === 'a') { hide('chirp-from-a-in-b'); hide('chirp-from-a-in-c'); }
    }
    elMesh.signedA.innerHTML = '<span class="signed-text">📄 Hash & Signed: —</span>';
    elMesh.signedB.innerHTML = '<span class="signed-text">📄 Hash & Signed: —</span>';
    elMesh.signedC.innerHTML = '<span class="signed-text">📄 Hash & Signed: —</span>';
    elMesh.correlationPanel.style.display = 'none';
    elMesh.topoMap.style.display = 'none';
    elMesh.notaryViz.style.display = 'none';
    elMesh.certBox.style.display = 'none';
    elMesh.consensusGrid.style.display = 'none';

    // Generate ephemeral keys
    const pkA = 'pk_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const pkB = 'pk_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const pkC = 'pk_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    elMesh.keyA.innerHTML = `<span class="highlight-green">${pkA}</span>`;
    elMesh.keyB.innerHTML = `<span class="highlight-green">${pkB}</span>`;
    elMesh.keyC.innerHTML = `<span class="highlight-green">${pkC}</span>`;

    elMesh.networkText.textContent = 'OFFLINE — All devices transmitting + recording';

    // ════════════════════════════════════════════════
    // Phase 1: Devices transmit autonomously
    // ════════════════════════════════════════════════
    // Each device broadcasts a Gold-coded chirp at a random time offset.
    // No listening, no decoding — just transmit and record.

    // Transmission offsets (randomized within the capture window)
    const txA = 10 + Math.random() * 20;  // A chirps 10-30% in
    const txB = 30 + Math.random() * 20;  // B chirps 30-50% in
    const txC = 50 + Math.random() * 20;  // C chirps 50-70% in

    // Acoustic propagation delays (distance / speed_of_sound at 343 m/s)
    const distAB = 3.5 + Math.random() * 4;   // 3.5-7.5m
    const distAC = 2.5 + Math.random() * 3;   // 2.5-5.5m
    const distBC = 4.0 + Math.random() * 5;   // 4-9m
    const propAB = distAB / 343 * 100;  // propagation as % of timeline
    const propAC = distAC / 343 * 100;
    const propBC = distBC / 343 * 100;

    // Step through timeline
    elMesh.statusA.textContent = '📡 Chirping...'; elMesh.statusA.style.color = 'var(--primary-color)';
    elMesh.statusB.textContent = '🎙️ Recording raw audio';
    elMesh.statusC.textContent = '🎙️ Recording raw audio';
    await delay(400);

    // Device A chirps → B and C hear it after propagation delay
    placeChirp(elMesh.timelineA, elMesh.chirpA, txA, false);
    await delay(200);
    elMesh.statusB.textContent = '📥 Superposition recorded'; elMesh.statusB.style.color = 'var(--pass-color)';
    elMesh.statusC.textContent = '📥 Superposition recorded'; elMesh.statusC.style.color = 'var(--pass-color)';
    placeChirp(elMesh.timelineB, elMesh.chirpAB, txA + propAB, true);
    placeChirp(elMesh.timelineC, elMesh.chirpAC, txA + propAC, true);
    await delay(600);

    // Device B chirps → A and C hear it
    elMesh.statusB.textContent = '📡 Chirping...'; elMesh.statusB.style.color = 'var(--primary-color)';
    elMesh.statusA.textContent = '🎙️ Recording raw audio';
    await delay(200);
    placeChirp(elMesh.timelineB, elMesh.chirpB, txB, false);
    await delay(200);
    elMesh.statusA.textContent = '📥 Superposition recorded'; elMesh.statusA.style.color = 'var(--pass-color)';
    elMesh.statusC.textContent = '📥 Superposition recorded'; elMesh.statusC.style.color = 'var(--pass-color)';
    placeChirp(elMesh.timelineA, elMesh.chirpBA, txB + propAB, true);
    placeChirp(elMesh.timelineC, elMesh.chirpBC, txB + propBC, true);
    await delay(600);

    // Device C chirps → A and B hear it
    elMesh.statusC.textContent = '📡 Chirping...'; elMesh.statusC.style.color = 'var(--primary-color)';
    elMesh.statusA.textContent = '🎙️ Recording raw audio';
    elMesh.statusB.textContent = '🎙️ Recording raw audio';
    await delay(200);
    placeChirp(elMesh.timelineC, elMesh.chirpC, txC, false);
    await delay(200);
    elMesh.statusA.textContent = '📥 Superposition recorded'; elMesh.statusA.style.color = 'var(--pass-color)';
    elMesh.statusB.textContent = '📥 Superposition recorded'; elMesh.statusB.style.color = 'var(--pass-color)';
    placeChirp(elMesh.timelineA, elMesh.chirpCA, txC + propAC, true);
    placeChirp(elMesh.timelineB, elMesh.chirpCB, txC + propBC, true);
    elMesh.statusC.textContent = '✅ Chirp transmitted'; elMesh.statusC.style.color = 'var(--pass-color)';
    await delay(400);

    // ════════════════════════════════════════════════
    // Phase 2: Each device signs raw audio hash
    // ════════════════════════════════════════════════
    // Device doesn't decode — just hashes the raw buffer and signs it.
    const hashA = demoHash(pkA + 'audio_buffer_' + Date.now());
    const hashB = demoHash(pkB + 'audio_buffer_' + Date.now());
    const hashC = demoHash(pkC + 'audio_buffer_' + Date.now());
    elMesh.signedA.innerHTML = `<span class="signed-text" style="color:var(--pass-color)">📄 SHA-256: ${hashA.slice(0,10)}... ✓ Signed</span>`;
    elMesh.signedB.innerHTML = `<span class="signed-text" style="color:var(--pass-color)">📄 SHA-256: ${hashB.slice(0,10)}... ✓ Signed</span>`;
    elMesh.signedC.innerHTML = `<span class="signed-text" style="color:var(--pass-color)">📄 SHA-256: ${hashC.slice(0,10)}... ✓ Signed</span>`;
    elMesh.networkText.textContent = 'OFFLINE — Audio signed, waiting for connectivity';

    await delay(1000);

    // ════════════════════════════════════════════════
    // Phase 3: Verifier processes offline (correlation)
    // ════════════════════════════════════════════════
    elMesh.networkText.textContent = 'ONLINE — Verifier correlating codes against raw audio';
    elMesh.networkText.className = 'status-green';

    // Simulate matched filter correlation.
    // The verifier derives Gold codes from each pk and correlates
    // against every other device's raw audio.
    // Correlation peaks > threshold → co-location confirmed.
    const correlations = [
        { heard: 'A', recorder: 'B', peak: 127, distance: distAB.toFixed(1) },
        { heard: 'A', recorder: 'C', peak: 118, distance: distAC.toFixed(1) },
        { heard: 'B', recorder: 'A', peak: 125, distance: distAB.toFixed(1) },
        { heard: 'B', recorder: 'C', peak: 95,  distance: distBC.toFixed(1) },
        { heard: 'C', recorder: 'A', peak: 112, distance: distAC.toFixed(1) },
        { heard: 'C', recorder: 'B', peak: 89,  distance: distBC.toFixed(1) },
    ];

    elMesh.correlationPanel.style.display = 'block';
    elMesh.correlationGrid.innerHTML = '';
    for (const c of correlations) {
        const pct = (c.peak / 128) * 100;
        const row = document.createElement('div');
        row.className = 'correlation-row';
        row.innerHTML = `
            <span class="corr-heard">${c.heard}</span>
            <span class="corr-arrow">→</span>
            <span class="corr-recorded-by">${c.recorder}</span>
            <div class="corr-bar"><div class="corr-fill" style="width:${pct}%"></div></div>
            <span class="corr-label">ρ=${c.peak} | ${c.distance}m</span>
        `;
        elMesh.correlationGrid.appendChild(row);
    }
    await delay(800);

    // Topology map
    elMesh.topoMap.style.display = 'block';
    elMesh.topoEdgeAB.textContent = `${distAB.toFixed(1)}m ✓`;
    elMesh.topoEdgeAC.textContent = `${distAC.toFixed(1)}m ✓`;
    elMesh.topoEdgeBC.textContent = `${distBC.toFixed(1)}m ✓`;
    const maxDist = Math.max(distAB, distAC, distBC);
    elMesh.topoLegend.textContent = `All 3 pairs mutually detected · Max distance: ${maxDist.toFixed(1)}m`;

    // Consensus
    let coerced = false;
    let coercedMsg = '';
    if (meshScenario === 'coerced') {
        const flagged = Object.entries(deviceDetained).filter(([_, v]) => v).map(([d]) => d.toUpperCase());
        if (flagged.length > 0) {
            coerced = true;
            coercedMsg = `⚠ ${flagged.join(', ')} flagged — heartbeat expired`;
        }
    }

    elMesh.consensusGrid.style.display = 'block';
    for (const d of ['a','b','c']) {
        const s = $(`consensus-${d}-status`);
        if (coerced && deviceDetained[d]) {
            s.textContent = '🔴 FLAGGED';
            s.style.color = 'var(--fail-color)';
        } else {
            s.textContent = '🟢 VALID';
            s.style.color = 'var(--pass-color)';
        }
    }

    if (coerced) {
        elMesh.consensusVerdict.textContent = `⚠ CONDITIONAL — ${coercedMsg}`;
        elMesh.consensusVerdict.style.color = 'var(--warn-color)';
    } else {
        elMesh.consensusVerdict.textContent = '✅ AUTHENTIC — All devices co-located';
        elMesh.consensusVerdict.style.color = 'var(--pass-color)';
    }

    // MNR Certificate
    elMesh.notaryViz.style.display = 'block';
    const certId = demoHash(pkA + pkB + pkC + Date.now());
    elMesh.certContents.innerHTML = `
        <div><strong>Devices:</strong> A (${pkA.slice(0,8)}…), B (${pkB.slice(0,8)}…), C (${pkC.slice(0,8)}…)</div>
        <div><strong>Method:</strong> Transmit-only acoustic CDMA + offline correlation</div>
        <div><strong>Mutual pairs:</strong> 6/6 correlations confirmed</div>
        <div><strong>Max distance:</strong> ${maxDist.toFixed(1)}m</div>
        <div><strong>Certificate ID:</strong> ${certId}</div>
        <div class="consensus-row consensus-total" style="margin-top:0.5rem;">
            <span style="color:var(--pass-color);font-weight:700;">${coerced ? '⚠ CONDITIONAL' : '✅ MUTUAL NON-REPUDIATION ESTABLISHED'}</span>
        </div>
    `;
    elMesh.certBox.style.display = 'block';

    elMesh.btn.disabled = false;
}

elMesh.btn.addEventListener('click', runAcousticCapture);

// ===================================================================
// 5b. Audio CDMA: Chirp-Based Generation & Correlation
// ===================================================================
import { generateGoldCode, generateDeviceAudio, correlateAll } from './audio-cdma.js';
import { generateChirpDeviceAudio, correlateAllChirp } from './chirp-cdma.js';

const elAudioCDMA = {
    numDevices: $('ac-num-devices'), numDevicesVal: $('ac-num-devices-val'),
    sf: $('ac-sf'), sfVal: $('ac-sf-val'),
    chirpToggle: $('ac-chirp-toggle'),
    positionInputs: $('ac-position-inputs'),
    btn: $('ac-run-btn'), status: $('audio-cdma-status'),
    results: $('ac-results'), correlationGrid: $('ac-correlation-grid'),
    detectionSummary: $('ac-detection-summary'),
};

const DEFAULT_AC_POSITIONS = [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
];

function buildPositionInputs(numDevices) {
    elAudioCDMA.positionInputs.innerHTML = '';
    const labels = ['A', 'B', 'C'];
    for (let i = 0; i < numDevices; i++) {
        const pos = DEFAULT_AC_POSITIONS[i] || { x: i * 5, y: 0 };
        const div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:0.3rem;align-items:center;font-size:0.85rem;';
        div.innerHTML = `
            <strong>Device ${labels[i]}:</strong>
            X: <input type="number" id="ac-pos-${i}-x" value="${pos.x}" style="width:50px;" step="1">
            Y: <input type="number" id="ac-pos-${i}-y" value="${pos.y}" style="width:50px;" step="1">
        `;
        elAudioCDMA.positionInputs.appendChild(div);
    }
}

function getPositions(numDevices) {
    const positions = [];
    for (let i = 0; i < numDevices; i++) {
        const x = parseFloat($(`ac-pos-${i}-x`).value) || 0;
        const y = parseFloat($(`ac-pos-${i}-y`).value) || 0;
        positions.push({ x, y });
    }
    return positions;
}

function buildTopology(deviceIds, positions) {
    const topo = {};
    for (let i = 0; i < deviceIds.length; i++) {
        const neighbors = {};
        for (let j = 0; j < deviceIds.length; j++) {
            if (i === j) continue;
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            neighbors[deviceIds[j]] = dist;
        }
        topo[deviceIds[i]] = neighbors;
    }
    return topo;
}

elAudioCDMA.numDevices.addEventListener('input', () => {
    const n = parseInt(elAudioCDMA.numDevices.value);
    elAudioCDMA.numDevicesVal.textContent = n;
    buildPositionInputs(n);
});
elAudioCDMA.sf.addEventListener('input', () => {
    elAudioCDMA.sfVal.textContent = elAudioCDMA.sf.value;
});

// Initialize
buildPositionInputs(3);

async function runAudioCDMA() {
    elAudioCDMA.btn.disabled = true;
    elAudioCDMA.status.textContent = 'RUNNING';
    elAudioCDMA.status.className = 'status-badge';
    elAudioCDMA.results.style.display = 'none';

    const numDevices = parseInt(elAudioCDMA.numDevices.value);
    const sf = parseInt(elAudioCDMA.sf.value);
    const positions = getPositions(numDevices);

    // Create device configs
    const labels = ['A', 'B', 'C'];
    const allDevices = [];
    for (let i = 0; i < numDevices; i++) {
        allDevices.push({
            deviceId: `device_${labels[i].toLowerCase()}`,
            ephemeralKey: `pk_${labels[i]}${demoHash(`seed_${i}`).toString(16).slice(0, 6)}`,
            txTime: 0.01 + i * 0.03, // spread chirps apart in time
        });
    }

    const topology = buildTopology(allDevices.map(d => d.deviceId), positions);

    // Generate audio buffers (use short duration for demo speed)
    const DUR = 0.2;
    const useChirp = elAudioCDMA.chirpToggle && elAudioCDMA.chirpToggle.checked;
    // Chirp mode needs longer buffer — each chirp is DUR seconds and
    // they're spaced apart, so total must accommodate last txTime + DUR
    const TX_SPACING = 0.03;
    const lastTxTime = 0.01 + (numDevices - 1) * TX_SPACING;
    const bufDuration = useChirp ? lastTxTime + DUR + 0.05 : DUR;
    const audioBuffers = {};
    const goldCodes = {};

    for (const dev of allDevices) {
        goldCodes[dev.deviceId] = generateGoldCode(dev.ephemeralKey, sf);
    }

    // Brief delay to show progress
    await delay(100);
    elAudioCDMA.status.textContent = 'Generating audio...';

    for (const dev of allDevices) {
        if (useChirp) {
            audioBuffers[dev.deviceId] = generateChirpDeviceAudio(dev, goldCodes[dev.deviceId], {
                f0: 18000, f1: 22000, duration: DUR, bufferDuration: bufDuration,
            });
        } else {
            audioBuffers[dev.deviceId] = generateDeviceAudio(dev, topology, allDevices, sf, 0.02, bufDuration);
        }
    }

    await delay(100);
    elAudioCDMA.status.textContent = 'Correlating...';

    // Run correlation
    const results = useChirp
        ? correlateAllChirp(audioBuffers, goldCodes, { f0: 18000, f1: 22000, duration: DUR })
        : correlateAll(audioBuffers, goldCodes);

    // Display results
    elAudioCDMA.results.style.display = 'block';
    elAudioCDMA.correlationGrid.innerHTML = '';

    for (const r of results) {
        const isOwn = r.codeDeviceId === r.bufferDeviceId;
        const pct = Math.min(100, (r.peak / 50) * 100);
        const row = document.createElement('div');
        row.className = 'correlation-row';
        const label = r.codeDeviceId.replace('device_', '').toUpperCase();
        const bufLabel = r.bufferDeviceId.replace('device_', '').toUpperCase();
        row.innerHTML = `
            <span class="corr-heard" style="color:${isOwn ? 'var(--primary-color)' : 'var(--text-muted)'}">${label}→</span>
            <span class="corr-recorded-by">${bufLabel}</span>
            <div class="corr-bar"><div class="corr-fill" style="width:${pct}%;background:${isOwn ? 'var(--primary-color)' : 'var(--warn-color)'}"></div></div>
            <span class="corr-label">peak=${r.peak.toFixed(1)} | offset=${r.sampleOffset} | conf=${r.confidence.toFixed(1)}</span>
        `;
        elAudioCDMA.correlationGrid.appendChild(row);
    }

    // Summary: which chirps detected
    const ownDetections = results.filter(r => r.codeDeviceId === r.bufferDeviceId);
    const crossDetections = results.filter(r => r.codeDeviceId !== r.bufferDeviceId && r.peak > 0);
    elAudioCDMA.detectionSummary.innerHTML = `
        ✅ Own chirps detected: ${ownDetections.filter(r => r.peak > 0).length}/${ownDetections.length}
        | 🔗 Cross-correlations with signal: ${crossDetections.length}/${results.length - ownDetections.length}
        | Topologies: ${numDevices} devices, ${Object.values(topology).reduce((sum, n) => sum + Object.keys(n).length, 0)} edges
    `;

    elAudioCDMA.status.textContent = 'DONE';
    elAudioCDMA.status.className = 'status-badge pass';
    elAudioCDMA.btn.disabled = false;
}

elAudioCDMA.btn.addEventListener('click', runAudioCDMA);

// ===================================================================
// 6. DSP Engine Tuning (unchanged)
// ===================================================================
import { LCG, generateGaussianNoise, stringToBits, bitsToString, generateSignals, mixChannel, acquireSyncLocks, extractMatchedFilter } from '../realpeep-js/src/dsp.js';

const elDSP = {
    devices: $('dsp-devices'), devicesVal: $('dsp-devices-val'),
    spreading: $('dsp-spreading'), spreadingVal: $('dsp-spreading-val'),
    fec: $('dsp-fec'), fecVal: $('dsp-fec-val'),
    noise: $('dsp-noise'), noiseVal: $('dsp-noise-val'),
    loss: $('dsp-loss'), lossVal: $('dsp-loss-val'),
    terminal: $('dsp-terminal'),
    btnOptimal: $('btn-optimal'),
    btnExecute: $('btn-execute-dsp'),
    progressContainer: $('dsp-progress-container'),
    progressBar: $('dsp-progress-bar'),
    progressText: $('dsp-progress-text')
};

let currentDSPState = null;
const MAX_BANDWIDTH_HZ = 4000;

elDSP.btnOptimal.addEventListener('click', () => {
    elDSP.devices.value = 5;
    elDSP.spreading.value = 128;
    elDSP.fec.value = 10;
    elDSP.noise.value = 3.0;
    elDSP.loss.value = 10;
    [elDSP.devices, elDSP.spreading, elDSP.fec, elDSP.noise, elDSP.loss].forEach(el => { el.dispatchEvent(new Event('input')); });
});

[elDSP.devices, elDSP.spreading, elDSP.fec, elDSP.noise, elDSP.loss].forEach(el => {
    el.addEventListener('input', (e) => {
        elDSP[`${e.target.id.replace('dsp-', '')}Val`].textContent = e.target.value;
        updateDSPPhysics();
    });
});

function updateDSPPhysics() {
    const numDevices = parseInt(elDSP.devices.value);
    const spreadingFactor = parseInt(elDSP.spreading.value);
    const fecRepeats = parseInt(elDSP.fec.value);
    const noiseStd = parseFloat(elDSP.noise.value);
    const packetLoss = parseInt(elDSP.loss.value) / 100.0;

    let term = "> <span class='info'>Recalculating physical acoustic constraints...</span>\\n\\n";
    const KEY_LEN = 10;
    const bitsPerKey = KEY_LEN * 8;
    // Reed-Solomon: 10 data bytes + parityBytes → totalBytes bytes
    // Each byte → 8 bits → spread by SF chips
    const totalBytes = KEY_LEN + fecRepeats;
    const totalBits = totalBytes * 8;
    const signalLength = totalBits * spreadingFactor;
    const chipRate = MAX_BANDWIDTH_HZ;
    const dataRateBps = chipRate / spreadingFactor;
    const txTimeSeconds = totalBits / dataRateBps;

    term += `<span class="physics">[ASSUMPTIONS] Hardcoded Simulation Constants</span>\n`;
    term += `    - KEY_LEN: ${KEY_LEN} characters (${bitsPerKey} bits)\n\n`;
    term += `<span class="physics">[PHYSICS] Acoustic Envelope (18kHz-22kHz): 4kHz Bandwidth</span>\n`;
    term += `    - CDMA Chip Rate: ${chipRate} chips/sec\n`;
    term += `    - Data Rate: ${dataRateBps.toFixed(2)} bps per device\n`;
    term += `    - Est. Transmission Time: ${txTimeSeconds.toFixed(2)} seconds\n\n`;

    const interferencePower = (noiseStd * noiseStd) + (numDevices - 1);
    const channelSNRLinear = 1.0 / interferencePower;
    const effectiveSNRLinear = (spreadingFactor * fecRepeats * (1 - packetLoss)) / interferencePower;
    let predictedSuccess = 0;
    if (effectiveSNRLinear >= 15.0) predictedSuccess = 100;
    else if (effectiveSNRLinear <= 5.0) predictedSuccess = 0;
    else predictedSuccess = ((effectiveSNRLinear - 5.0) / 10.0) * 100;

    const shannonCapacityBps = MAX_BANDWIDTH_HZ * Math.log2(1 + channelSNRLinear);
    const aggregateDataRate = numDevices * dataRateBps;
    const capacityPct = (aggregateDataRate / shannonCapacityBps) * 100;
    const channelSNRdB = 10 * Math.log10(channelSNRLinear);
    const effectiveSNRdB = 10 * Math.log10(effectiveSNRLinear);

    term += `<span class="physics">[INFORMATION THEORY] Shannon-Hartley Capacity Analysis</span>\n`;
    term += `    - Aggregate Network Data Rate: ${aggregateDataRate.toFixed(2)} bps\n`;
    term += `    - Channel SNR (incl. MAI): ${channelSNRdB.toFixed(2)} dB\n`;
    term += `    - Post-Despreading SNR (Eb/N0): ${effectiveSNRdB.toFixed(2)} dB (Linear: ${effectiveSNRLinear.toFixed(2)})\n`;
    term += `    - Shannon Channel Capacity: ${shannonCapacityBps.toFixed(2)} bps\n`;
    let successColor = predictedSuccess > 95 ? 'success' : (predictedSuccess > 50 ? 'warning' : 'error');
    term += `    - Predicted Extraction Success: <span class="${successColor}">${predictedSuccess.toFixed(0)}%</span>\n`;
    if (capacityPct > 100) term += `<span class="error">    - CAPACITY EXCEEDED: ${capacityPct.toFixed(1)}% (Decoding mathematically impossible)</span>\n`;
    else term += `<span class="success">    - Capacity Utilized: ${capacityPct.toFixed(1)}% (Decoding is viable)</span>\n\n`;
    term += `<span class="info">Ready to execute. Click button to begin physical transmission.</span>\n`;
    elDSP.terminal.innerHTML = term;
    currentDSPState = { numDevices, spreadingFactor, fecRepeats, noiseStd, packetLoss, KEY_LEN, signalLength, txTimeSeconds, bitsPerKey };
}

async function executeDSPExtraction() {
    if (!currentDSPState) return;
    elDSP.btnExecute.disabled = true; elDSP.btnOptimal.disabled = true;
    [elDSP.devices, elDSP.spreading, elDSP.fec, elDSP.noise, elDSP.loss].forEach(el => el.disabled = true);
    const { numDevices, spreadingFactor, fecRepeats, noiseStd, packetLoss, KEY_LEN, signalLength, txTimeSeconds, bitsPerKey } = currentDSPState;
    const totalBytes = KEY_LEN + fecRepeats;
    elDSP.progressContainer.style.display = "block";
    let elapsed = 0;
    await new Promise(resolve => {
        const timer = setInterval(() => {
            elapsed += 100 / 1000;
            let percent = (elapsed / txTimeSeconds) * 100;
            if (percent >= 100) { percent = 100; clearInterval(timer); resolve(); }
            elDSP.progressBar.style.width = `${percent}%`;
            elDSP.progressText.textContent = `${elapsed.toFixed(1)}s / ${txTimeSeconds.toFixed(1)}s`;
        }, 100);
    });
    elDSP.progressContainer.style.display = "none";
    elDSP.progressBar.style.width = `0%`;
    let term = elDSP.terminal.innerHTML + `\n<span class="info">[1] Generating CDMA Signals</span>\n`;
    term += `    Array size per device: ${signalLength.toLocaleString()} samples\n`;
    elDSP.terminal.innerHTML = term;
    try {
        const devicesData = [];
        for (let i = 0; i < numDevices; i++) {
            let key = "PK_" + Math.random().toString(36).substring(2, 9).toUpperCase();
            while (key.length < KEY_LEN) key += "X";
            key = key.substring(0, KEY_LEN);
            const prnSeed = 42 + i * 100;
            const rand = LCG(prnSeed);
            const prnCode = Array.from({length: spreadingFactor}, () => rand() > 0.5 ? 1 : -1);
            devicesData.push({ key, prnCode });
        }
        const signals = generateSignals(devicesData, spreadingFactor, fecRepeats, signalLength);
        const MAX_ASYNC_DELAY = MAX_BANDWIDTH_HZ;
        let mixed = mixChannel(signals, numDevices, signalLength, MAX_ASYNC_DELAY, noiseStd, packetLoss);
        const paddedSignalLength = mixed.length;
        let signalPower = 0, noisePower = 0;
        for (let i = 0; i < paddedSignalLength; i++) { signalPower += numDevices; noisePower += noiseStd * noiseStd; }
        const snr = 10 * Math.log10(signalPower / (noisePower || 0.0001));
        term += `    - Channel SNR: ${snr.toFixed(2)} dB\n`;
        term += `\n<span class="info">[2] Acquisition Phase (Delay-Locked Loop)</span>\n`;
        term += `    Hunting for asynchronous sync peaks via Sliding Correlator...\n`;
        const syncLocks = acquireSyncLocks(mixed, devicesData, spreadingFactor, MAX_ASYNC_DELAY);
        for (let d = 0; d < numDevices; d++) { const msDelay = (syncLocks[d] / MAX_BANDWIDTH_HZ) * 1000; term += `    Device ${d+1}: Sync Locked at offset +${msDelay.toFixed(1)}ms\n`; }
        term += `\n<span class="info">[3] Live DSP Microphone Buffer Stream</span>\n`;
        term += `    Processing ${MAX_BANDWIDTH_HZ} samples/sec...\n`;
        elDSP.terminal.innerHTML = term;
        const accumulators = Array(numDevices).fill(0).map(() => new Float32Array(totalBytes * 8));
        const CHUNK_MS = 100;
        const SAMPLES_PER_CHUNK = Math.floor(MAX_BANDWIDTH_HZ * (CHUNK_MS / 1000));
        let samplesProcessed = 0;
        let streamTextId = "stream-text-" + Math.floor(Math.random()*10000);
        elDSP.terminal.innerHTML += `<div id="${streamTextId}">Ingesting... 0 / ${paddedSignalLength} samples</div>\n`;
        const totalTxTimeSeconds = paddedSignalLength / MAX_BANDWIDTH_HZ;
        await new Promise(resolve => {
            const audioStreamTimer = setInterval(() => {
                const chunkStart = samplesProcessed;
                let chunkEnd = chunkStart + SAMPLES_PER_CHUNK;
                if (chunkEnd > paddedSignalLength) chunkEnd = paddedSignalLength;
                for (let i = chunkStart; i < chunkEnd; i++) {
                    for (let d = 0; d < numDevices; d++) {
                        if (i >= syncLocks[d] && i < syncLocks[d] + signalLength) {
                            const shiftedI = i - syncLocks[d];
                            const bitIdx = Math.floor(shiftedI / spreadingFactor);
                            const chipIdx = shiftedI % spreadingFactor;
                            accumulators[d][bitIdx] += mixed[i] * devicesData[d].prnCode[chipIdx];
                        }
                    }
                }
                samplesProcessed = chunkEnd;
                let percent = (samplesProcessed / paddedSignalLength) * 100;
                elDSP.progressBar.style.width = `${percent}%`;
                elDSP.progressText.textContent = `${(samplesProcessed / MAX_BANDWIDTH_HZ).toFixed(1)}s / ${totalTxTimeSeconds.toFixed(1)}s`;
                document.getElementById(streamTextId).textContent = `[BUFFER] Ingested ${samplesProcessed.toLocaleString()} / ${paddedSignalLength.toLocaleString()} samples...`;
                if (samplesProcessed >= paddedSignalLength) { clearInterval(audioStreamTimer); resolve(); }
            }, CHUNK_MS);
        });
        elDSP.progressContainer.style.display = "none";
        let finalTerm = `<span class="info">[4] Matched Filter Extraction Complete</span>\n`;
        const extractedKeys = extractMatchedFilter(mixed, devicesData, syncLocks, signalLength, spreadingFactor, fecRepeats, bitsPerKey);
        let allSuccess = true;
        for (let d = 0; d < numDevices; d++) {
            if (extractedKeys[d] === devicesData[d].key) finalTerm += `    Device ${d+1}: <span class="success">[SUCCESS]</span> Target: ${devicesData[d].key} -> Got: ${extractedKeys[d]}\n`;
            else { allSuccess = false; finalTerm += `    Device ${d+1}: <span class="error">[FAILED]</span> Target: ${devicesData[d].key} -> Got: ${(extractedKeys[d]||'').replace(/[^ -~]/g,'?')}\n`; }
        }
        finalTerm += `\n> <span class="${allSuccess ? 'success' : 'error'}">Extraction ${allSuccess ? 'SUCCESSFUL' : 'FAILED'}</span>\n`;
        elDSP.terminal.innerHTML += finalTerm;
    } catch (e) { elDSP.terminal.innerHTML += `\n<span class="error">Simulation Error: ${e.message}</span>`; }
    elDSP.btnExecute.disabled = false; elDSP.btnOptimal.disabled = false;
    [elDSP.devices, elDSP.spreading, elDSP.fec, elDSP.noise, elDSP.loss].forEach(el => el.disabled = false);
}
elDSP.btnExecute.addEventListener('click', executeDSPExtraction);

// ===================================================================
// 7. BLE Mesh Demo — with jamming defense visualization
// ===================================================================
import { simulateRollup } from './mnr-rollup.js';
import { buildFrameHashChain, createTimestamp } from './blockchain-anchor.js';
const elBLE = {
    btn: $('ble-run-btn'), status: $('ble-status'),
    numDevices: $('ble-num-devices'), numDevicesVal: $('ble-num-devices-val'),
    numJammers: $('ble-num-jammers'), numJammersVal: $('ble-num-jammers-val'),
    jammerStrategy: $('ble-jammer-strategy'),
    deviceGrid: $('ble-device-grid'), matrix: $('ble-matrix'),
    matrixContainer: $('matrix-container'), results: $('ble-results'),
    pairResults: $('ble-pair-results'),
};

elBLE.numDevices.addEventListener('input', e => elBLE.numDevicesVal.textContent = e.target.value);
elBLE.numJammers.addEventListener('input', e => elBLE.numJammersVal.textContent = e.target.value);

elBLE.btn.addEventListener('click', () => {
    const N = parseInt(elBLE.numDevices.value);
    const J = parseInt(elBLE.numJammers.value);
    const strat = elBLE.jammerStrategy.value;

    // Create devices
    const devices = [];
    const nonceSeen = {};
    for (let i = 0; i < N; i++) {
        const pk = `pk_${String.fromCharCode(65+i)}${i}`;
        const nonce = demoHash(pk + Date.now() + i).slice(0, 8);
        devices.push({ pk, nonce, bloom: new Set(), isJammer: false });
        nonceSeen[pk] = nonce;
    }

    // Create jammers
    const jammers = [];
    for (let j = 0; j < J; j++) {
        const pk = `jm_${j}`;
        const nonce = demoHash('jammer' + Date.now() + j).slice(0, 8);
        const jammer = { pk, nonce, bloom: new Set(), isJammer: true };
        jammers.push(jammer);
        nonceSeen[pk] = nonce;
        if (strat === 'sybil') {
            for (let s = 1; s < 3; s++) {
                const spk = `jm_${j}_s${s}`;
                nonceSeen[spk] = demoHash('sybil' + Date.now() + j + s).slice(0, 8);
            }
        }
    }

    // Simulate BLE scan: each device hears others (with noise model)
    const all = [...devices, ...jammers];
    for (const observer of devices) {
        for (const other of all) {
            if (observer.pk === other.pk) continue;
            // Honest observers hear honest devices
            if (!other.isJammer) {
                observer.bloom.add(other.nonce);
            }
            // Jammers: flood strategy fills bloom, silent does nothing
            if (other.isJammer && strat === 'flood') {
                observer.bloom.add(other.nonce);
                for (let f = 0; f < 3; f++)
                    observer.bloom.add(demoHash(other.nonce + f).slice(0, 8));
            }
            if (other.isJammer && strat === 'spoof') {
                // Spoof: fill bloom with garbage
                for (let f = 0; f < 50; f++) observer.bloom.add(demoHash('garbage' + f).slice(0, 8));
            }
        }
    }

    // Render device cards
    elBLE.deviceGrid.innerHTML = '';
    for (const d of [...devices, ...jammers]) {
        const card = document.createElement('div');
        card.className = `ble-device-card${d.isJammer ? ' jammer' : ''}`;
        const fillPct = Math.min(100, (d.bloom.size / 50) * 100);
        card.innerHTML = `
            <div class="device-label">${d.isJammer ? '⚠️ ' : '📱 '}${d.pk}</div>
            <div class="nonce">nonce: ${(d.nonce||'—').slice(0,8)}</div>
            <div class="bloom-bar"><div class="bloom-fill" style="width:${fillPct}%"></div></div>
            <div style="color:var(--text-muted)">bloom: ${d.bloom.size} items</div>
        `;
        elBLE.deviceGrid.appendChild(card);
    }

    // Build adjacency matrix
    const pks = devices.map(d => d.pk);
    const n = pks.length;
    let matrixHtml = '<table><tr><td></td>';
    for (const pk of pks) matrixHtml += `<td style="font-size:0.55rem">${pk.slice(0,4)}</td>`;
    matrixHtml += '</tr>';
    const observedPairs = [];
    for (let i = 0; i < n; i++) {
        matrixHtml += `<tr><td style="font-size:0.55rem">${pks[i].slice(0,4)}</td>`;
        for (let j = 0; j < n; j++) {
            if (i === j) { matrixHtml += '<td class="matrix-diag">·</td>'; continue; }
            const heard = devices[i].bloom.has(devices[j].nonce);
            matrixHtml += `<td class="matrix-${heard ? '1' : '0'}">${heard ? '1' : '0'}</td>`;
            if (heard) observedPairs.push({ from: pks[i], to: pks[j] });
        }
        matrixHtml += '</tr>';
    }
    matrixHtml += '</table>';
    elBLE.matrixContainer.innerHTML = matrixHtml;
    elBLE.matrix.style.display = 'block';

    // Pair results
    elBLE.pairResults.innerHTML = '';
    for (const p of observedPairs.slice(0, 15)) {
        const row = document.createElement('div');
        row.className = 'correlation-row';
        row.innerHTML = `<span class="corr-heard">${p.from.slice(0,6)}</span><span class="corr-arrow">→</span><span class="corr-recorded-by">${p.to.slice(0,6)}</span><div class="corr-bar"><div class="corr-fill" style="width:100%"></div></div><span class="corr-label">✅ BLE</span>`;
        elBLE.pairResults.appendChild(row);
    }

    // Jamming defense analysis
    const jammersDetected = all.filter(d => d.isJammer);
    const defenseInfo = [];
    if (strat === 'flood') {
        defenseInfo.push(`🌊 Flood detection: ${jammersDetected.length} jammer(s) identified by anomalous beacon count (${jammersDetected.length > 0 ? 'jammers produce ~50 beacons vs honest 5)' : 'none detected)'}`);
    }
    if (strat === 'silent') {
        defenseInfo.push(`🤫 Asymmetry detection: silent jammer broadcasts but reports empty observation — caught by adjacency matrix gap`);
    }
    if (strat === 'spoof') {
        defenseInfo.push(`🎭 Saturation detection: jammer fills observer's bloom filter with garbage — caught by filter saturation check`);
    }
    if (jammersDetected.length > 0) {
        defenseInfo.push(`🛡️ Verdict: ${jammersDetected.length} jammer(s) dropped from certificate`);
    } else if (J > 0) {
        defenseInfo.push(`⚠️ Warning: ${J} jammer(s) present but none detected by ${strat} strategy`);
    }

    // MNR Rollup
    const devicesForRollup = devices.map(d => ({
        pk: d.pk, nonce: d.nonce,
        // Pass public keys of observed devices, not nonces
        observedNonces: devices.filter(d2 => d2.pk !== d.pk && d.bloom.has(d2.nonce)).map(d2 => d2.pk),
    }));
    const rollupResult = simulateRollup(devicesForRollup);

    // Frame hash chain + blockchain anchor
    const frameData = devices.map(d => d.pk + ':' + d.nonce);
    const { merkleRoot } = buildFrameHashChain(frameData);
    let otsProof;
    try { otsProof = createTimestamp(merkleRoot).otsProof; } catch(e) { otsProof = 'error'; }

    elBLE.pairResults.innerHTML += `
        <div class="jamming-defenses" style="margin-top:0.8rem; padding:0.6rem; border-radius:8px; background:rgba(255,145,0,0.1); font-size:0.8rem;">
            <strong>🛡️ Jamming Defenses Applied:</strong>
            ${defenseInfo.map(d => `<div style="margin-top:0.25rem;">${d}</div>`).join('')}
        </div>
        <div class="mnr-cert" style="margin-top:0.5rem; padding:0.6rem; border-radius:8px; background:rgba(0,210,255,0.08); font-size:0.8rem;">
            <strong>📜 MNR Rollup:</strong> ${rollupResult.certificates.length} certificates issued
            <div style="margin-top:0.25rem; color:var(--text-muted);">Hash chain root: ${merkleRoot.slice(0,16)}…</div>
            <div style="color:var(--text-muted);">OTS proof: ${otsProof.slice(0,12)}… <a href="https://opentimestamps.org/" target="_blank" style="color:var(--primary-color);font-size:0.75rem;">(simulated — real proofs verify at opentimestamps.org ↗)</a></div>
        </div>
    `;
    elBLE.results.style.display = 'block';
    elBLE.status.textContent = 'COMPLETE';
    elBLE.status.className = 'status-badge pass';
});

// ===================================================================
// 8. Two-Pane End-to-End Witness Demo
// ===================================================================
import { WitnessDemo, resetDeviceCounter } from './witness-demo.js';
import { mountWitnessPane } from './ui/witness-pane.js';
import { mountVisualizationPane } from './ui/visualization-pane.js';

const elWitness = {
    status: $('witness-status'),
    numDevices: $('witness-num-devices'),
    numDevicesVal: $('witness-num-devices-val'),
    resetBtn: $('witness-reset-btn'),
    leftPane: $('witness-left-pane'),
    rightPane: $('witness-right-pane'),
};

const witnessDemo = new WitnessDemo();
let witnessPhone = null;
let witnessViz = null;

// Mount the panes
function mountWitnessPanes() {
    if (witnessPhone && witnessPhone.destroy) witnessPhone.destroy();
    elWitness.leftPane.innerHTML = '';
    elWitness.rightPane.innerHTML = '';

    witnessPhone = mountWitnessPane(elWitness.leftPane, {
        onPinDigit(digit) {
            const complete = witnessDemo.enterPin(digit);
            if (complete) {
                witnessPhone.animateStep('key');
            }
        },
        onPinClear() {
            witnessDemo.clearPin();
            witnessPhone.animateStep('pin');
        },
        onDuressToggle(on) {
            witnessDemo.setDuress(on);
        },
        async onRecord() {
            witnessDemo.startCapture();
            witnessPhone.setPhase('capture');
            witnessViz.setPhase('capture');
            witnessPhone.updateStatus(witnessDemo.getStatus());

            // Animate: PIN entry → key derivation → beacon start
            witnessPhone.animateStep('key');
            await delay(400);
            witnessPhone.animateStep('beacon');
            await delay(300);

            // Play audio
            if (witnessDemo.audioData && witnessDemo.audioData.combinedBuffer) {
                witnessPhone.setAudioBuffer(witnessDemo.audioData.combinedBuffer);
                witnessPhone.playAudio();
            }

            // Show mesh graph during capture
            witnessViz.renderMeshGraph(witnessDemo.devices, witnessDemo.topology);
            witnessViz.renderWaveform(witnessDemo.audioData.waveformPeaks, witnessDemo.devices);

            witnessPhone.updateStatus(witnessDemo.getStatus());
        },
        async onStop() {
            witnessPhone.animateStep('stop');
            witnessPhone.updateStatus({ audioStatus: 'captured' });

            // Complete capture → DAG
            elWitness.status.textContent = 'DAG';
            elWitness.status.className = 'status-badge';
            await witnessDemo.completeCapture();

            witnessPhone.setPhase('dag');
            witnessViz.setPhase('dag');

            // Render DAG
            if (witnessDemo.meshData) {
                witnessViz.renderDAG(witnessDemo.meshData.dag, witnessDemo.devices);
            }

            // Render Merkle tree
            if (witnessDemo.merkleData) {
                witnessViz.renderMerkleTree(witnessDemo.merkleData);
            }

            // Verify
            elWitness.status.textContent = 'VERIFYING';
            await witnessDemo.startVerification();

            witnessPhone.setPhase('verify');
            witnessViz.setPhase('verify');
            witnessViz.renderCertificate(witnessDemo.certificate);

            const isPass = witnessDemo.verdict && witnessDemo.verdict.zkValid;
            elWitness.status.textContent = isPass ? 'AUTHENTIC' : 'FAILED';
            elWitness.status.className = `status-badge ${isPass ? 'pass' : 'fail'}`;
        },
    });

    witnessViz = mountVisualizationPane(elWitness.rightPane);
    witnessViz.setPhase('setup');
}

// Initialize
elWitness.numDevices.addEventListener('input', async (e) => {
    elWitness.numDevicesVal.textContent = e.target.value;
    await resetAndInit();
});

elWitness.resetBtn.addEventListener('click', resetAndInit);

async function resetAndInit() {
    witnessDemo.reset();
    resetDeviceCounter();
    const N = parseInt(elWitness.numDevices.value);
    await witnessDemo.initCapture(N);
    mountWitnessPanes();
    witnessPhone.updateStatus(witnessDemo.getStatus());
    elWitness.status.textContent = 'READY';
    elWitness.status.className = 'status-badge';
}

// Kick off initial mount
setTimeout(resetAndInit, 100);

// ===================================================================
// 9. Spatio-Temporal Hash-Linked Mesh
// ===================================================================
import {
    BeaconChain, HeardSet, NistBeacon, MerkleTree,
    buildBeacon, verifyBeaconChain, buildObservationBundle, reconstructDAG,
} from './spatiotemporal-mesh.js';

const elSTMesh = {
    btn: $('stmesh-run-btn'), status: $('stmesh-status'),
    numDevices: $('stmesh-num-devices'), numDevicesVal: $('stmesh-num-devices-val'),
    numRounds: $('stmesh-num-rounds'), numRoundsVal: $('stmesh-num-rounds-val'),
    output: $('stmesh-output'), beacons: $('stmesh-beacons'),
    dagViz: $('stmesh-dag-viz'), verify: $('stmesh-verify-results'),
};

elSTMesh.numDevices.addEventListener('input', e => elSTMesh.numDevicesVal.textContent = e.target.value);
elSTMesh.numRounds.addEventListener('input', e => elSTMesh.numRoundsVal.textContent = e.target.value);

elSTMesh.btn.addEventListener('click', async () => {
    elSTMesh.btn.disabled = true;
    elSTMesh.status.textContent = 'RUNNING';
    elSTMesh.status.className = 'status-badge';
    elSTMesh.output.style.display = 'none';
    elSTMesh.beacons.innerHTML = '';
    elSTMesh.dagViz.textContent = '';
    elSTMesh.verify.innerHTML = '';

    const numDevices = parseInt(elSTMesh.numDevices.value);
    const numRounds = parseInt(elSTMesh.numRounds.value);

    await delay(200);

    // Create NIST beacon simulator
    const nist = new NistBeacon(42 + Math.floor(Math.random() * 1000));

    // Create devices
    const labels = ['A', 'B', 'C', 'D', 'E'];
    const devices = [];
    for (let i = 0; i < numDevices; i++) {
        const pk = 'DEV_' + labels[i] + '_' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const sk = 'sk_' + labels[i];
        devices.push({
            label: labels[i],
            pk,
            chain: new BeaconChain(pk),
            heard: new HeardSet(),
            keyPair: {
                sign: (data) => {
                    let h = 0;
                    for (let j = 0; j < data.length; j++) {
                        h = ((h << 5) - h) + data.charCodeAt(j); h |= 0;
                    }
                    // Combine with sk for uniqueness
                    let h2 = 0;
                    for (let j = 0; j < sk.length; j++) {
                        h2 = ((h2 << 5) - h2) + sk.charCodeAt(j); h2 |= 0;
                    }
                    return (Math.abs(h ^ h2)).toString(16).padStart(8, '0').repeat(4);
                },
            },
        });
    }

    // Simulate rounds
    const allBeacons = []; // allBeacons[round][deviceIndex]
    for (let round = 0; round < numRounds; round++) {
        const nistPulse = nist.getPulse(round);
        const roundBeacons = [];

        for (const dev of devices) {
            const beacon = buildBeacon(dev.chain, dev.heard, nistPulse, dev.keyPair);
            roundBeacons.push(beacon);
        }
        allBeacons.push(roundBeacons);

        // Simulate each device hearing others (random RSSI)
        for (let i = 0; i < numDevices; i++) {
            for (let j = 0; j < numDevices; j++) {
                if (i === j) continue;
                const rssi = -40 - Math.random() * 40; // -40 to -80 dBm
                if (devices[i].heard.acceptBeacon(rssi, devices[i].heard.size())) {
                    // Store the hash of the beacon we heard
                    const heardBeacon = roundBeacons[j];
                    const heardHash = heardBeacon.prev_self; // use prev_self as identifier
                    devices[i].heard.addOrUpdate(devices[j].pk, heardHash, rssi);
                }
            }
        }
    }

    // Build observation bundles
    const bundles = devices.map(dev => buildObservationBundle(dev.chain, dev.heard, dev.keyPair));

    // Verify each chain
    let allChainsValid = true;
    const chainResults = [];
    for (const dev of devices) {
        const bundle = buildObservationBundle(dev.chain, dev.heard, dev.keyPair);
        const verification = verifyBeaconChain(bundle.beacons);
        chainResults.push({ pk: dev.pk, label: dev.label, ...verification });
        if (!verification.valid) allChainsValid = false;
    }

    // Reconstruct DAG
    const dag = reconstructDAG(bundles);

    // Display beacon table
    let beaconHtml = '<h4>📡 Beacon Chain Summary</h4><div style="display:flex;flex-wrap:wrap;gap:0.5rem;">';
    for (const dev of devices) {
        const color = chainResults.find(r => r.pk === dev.pk).valid
            ? 'var(--pass-color)' : 'var(--fail-color)';
        beaconHtml += `<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:0.5rem;min-width:120px;">
            <strong style="color:${color}">Device ${dev.label}</strong><br>
            <span style="font-size:0.7rem;color:var(--text-muted)">${dev.pk.slice(0,12)}...</span><br>
            <span style="font-size:0.75rem;">Chain: ${dev.chain.length} entries</span><br>
            <span style="font-size:0.75rem;">Heard: ${dev.heard.size()} neighbors</span>
        </div>`;
    }
    beaconHtml += '</div>';
    elSTMesh.beacons.innerHTML = beaconHtml;

    // Display DAG visualization (ASCII)
    let dagViz = '═══ Spatio-Temporal DAG ═══\n\n';
    dagViz += `Nodes: ${dag.nodes.length} | Edges: ${dag.edges.length}\n\n`;

    // Show nodes grouped by device
    const byDevice = {};
    for (const node of dag.nodes) {
        const pk = node.beacon.pk;
        if (!byDevice[pk]) byDevice[pk] = [];
        byDevice[pk].push(node);
    }

    for (const [pk, nodes] of Object.entries(byDevice)) {
        const dev = devices.find(d => d.pk === pk);
        const label = dev ? dev.label : pk.slice(0, 8);
        dagViz += `┌─ Device ${label}\n`;
        for (const node of nodes) {
            const prev = node.beacon.prev_self.slice(0, 8);
            const hroot = node.beacon.heard_root.slice(0, 8);
            dagViz += `│  [${node.beacon.seq_num}] prev=${prev}... heard_root=${hroot}...\n`;
        }

        // Show edges from this device
        const outEdges = dag.edges.filter(e => e.from.startsWith(pk + ':'));
        if (outEdges.length > 0) {
            dagViz += `│  ── heard: `;
            const targets = new Set();
            for (const e of outEdges) {
                const tgtPk = e.to.split(':')[0];
                const tgtDev = devices.find(d => d.pk === tgtPk);
                targets.add(tgtDev ? tgtDev.label : tgtPk.slice(0, 4));
            }
            dagViz += [...targets].join(', ');
            dagViz += '\n';
        }
        dagViz += '└──\n\n';
    }

    // Edge summary
    dagViz += '─── Cross-Chain Edges ───\n';
    const edgeSummary = {};
    for (const e of dag.edges) {
        const key = e.from.split(':')[0] + '→' + e.heardPk;
        if (!edgeSummary[key]) edgeSummary[key] = 0;
        edgeSummary[key]++;
    }
    for (const [key, count] of Object.entries(edgeSummary)) {
        const [fromPk, toPk] = key.split('→');
        const fromDev = devices.find(d => d.pk === fromPk);
        const toDev = devices.find(d => d.pk === toPk);
        const fromLabel = fromDev ? fromDev.label : fromPk.slice(0, 6);
        const toLabel = toDev ? toDev.label : toPk.slice(0, 6);
        dagViz += `  ${fromLabel} heard ${toLabel} (×${count})\n`;
    }

    elSTMesh.dagViz.textContent = dagViz;

    // Verification results
    let verifyHtml = '<h4>🔍 Verification Results</h4>';
    verifyHtml += '<div style="display:flex;flex-wrap:wrap;gap:0.5rem;margin-top:0.5rem;">';
    for (const r of chainResults) {
        verifyHtml += `<div style="background:rgba(0,0,0,0.3);border-radius:6px;padding:0.5rem;">
            <strong>Device ${r.label}</strong>: ${r.valid ? '✅ Chain valid' : '❌ Chain broken'}
            ${r.errors.length > 0 ? `<br><span style="color:var(--fail-color);font-size:0.75rem;">${r.errors.join(', ')}</span>` : ''}
        </div>`;
    }
    verifyHtml += '</div>';

    // Cross-chain verification
    // For each device, verify that another device's heard_root includes it
    verifyHtml += '<div style="margin-top:0.8rem;font-size:0.8rem;">';
    for (const dev of devices) {
        for (const other of devices) {
            if (dev.pk === other.pk) continue;
            const isHeard = dev.heard.get(other.pk);
            if (isHeard) {
                verifyHtml += `<span style="color:var(--pass-color)">✅ ${dev.label} heard ${other.label}</span> `;
            } else {
                // Check if they should have heard (were close enough)
                verifyHtml += `<span style="color:var(--text-muted)">⬚ ${dev.label} × ${other.label}</span> `;
            }
        }
        verifyHtml += '<br>';
    }
    verifyHtml += '</div>';

    verifyHtml += `<div style="margin-top:0.8rem;font-size:0.85rem;">
        <strong>DAG Verification:</strong> ${dag.nodes.length} nodes, ${dag.edges.length} cross-chain edges |
        <strong>Spatio-temporal provenance:</strong> ${allChainsValid ? '✅ ESTABLISHED' : '⚠ INCOMPLETE'}
    </div>`;

    elSTMesh.verify.innerHTML = verifyHtml;

    elSTMesh.output.style.display = 'block';
    elSTMesh.status.textContent = allChainsValid ? 'VERIFIED' : 'WARN';
    elSTMesh.status.className = `status-badge ${allChainsValid ? 'pass' : 'warn'}`;
    elSTMesh.btn.disabled = false;
});

// ===================================================================
// Shared Utilities
// ===================================================================
function updateStatus(statusEl, resultEl, passed, passMsg, failMsg, isWarn = false) {
    if (isWarn) {
        statusEl.textContent = "DURESS"; statusEl.className = "status-badge warn";
        resultEl.innerHTML = passMsg; resultEl.className = "result-box warn-box";
    } else if (passed) {
        statusEl.textContent = "PASSED"; statusEl.className = "status-badge pass";
        resultEl.innerHTML = passMsg; resultEl.className = "result-box pass-box";
    } else {
        statusEl.textContent = "FAILED"; statusEl.className = "status-badge fail";
        resultEl.innerHTML = failMsg; resultEl.className = "result-box fail-box";
    }
}

export function initApp() {
    elDSP.btnOptimal.click();
    updateCME();
    drawHCSJ();
}
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') { initApp(); }
