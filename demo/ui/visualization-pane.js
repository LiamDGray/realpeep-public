/**
 * ui/visualization-pane.js — Right pane: technical visualizations.
 *
 * Renders:
 *   - Phase indicator (Setup → Capture → DAG → Verify)
 *   - Mesh graph (Canvas): nodes = devices, edges = BLE/audio observations
 *   - Audio waveform (Canvas)
 *   - Spatio-temporal DAG (Canvas): nodes by device (rows) × time (columns)
 *   - Merkle tree (SVG): leaf hashes → root
 *   - Certificate display
 *
 * No framework dependencies — pure Canvas 2D + DOM.
 */

// ═══════════════════════════════════════════════════════════════════════
// Color palette (matching CSS variables)
// ═══════════════════════════════════════════════════════════════════════

const COLORS = {
    bg: '#0a0f18',
    primary: '#00d2ff',
    pass: '#00e676',
    fail: '#ff1744',
    warn: '#ff9100',
    text: '#f0f4f8',
    muted: '#8b9bb4',
    glass: 'rgba(255,255,255,0.05)',
    glassBorder: 'rgba(255,255,255,0.1)',
    deviceColors: ['#00d2ff', '#00e676', '#ff9100', '#ff1744', '#7c4dff'],
};

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function getDeviceColor(idx) {
    return COLORS.deviceColors[idx % COLORS.deviceColors.length];
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
        const testLine = line + word + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && line) {
            ctx.fillText(line, x, cy);
            line = word + ' ';
            cy += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, cy);
    return cy + lineHeight;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize and mount the right visualization pane.
 *
 * @param {HTMLElement} container - parent element
 * @returns {{
 *   setPhase: (phase: string) => void,
 *   renderMeshGraph: (devices: Array, topology: Object) => void,
 *   renderWaveform: (waveformPeaks: Object<string, number[]>, devices: Array) => void,
 *   renderDAG: (dag: Object, devices: Array) => void,
 *   renderMerkleTree: (merkleData: Object, devicePk: string) => void,
 *   renderCertificate: (certificate: Object) => void,
 *   clearAll: () => void
 * }}
 */
export function mountVisualizationPane(container) {
    // ── Build DOM ──────────────────────────────────────────────────

    container.innerHTML = `
        <div class="viz-container">
            <!-- Phase indicator -->
            <div class="viz-phase-bar" id="viz-phase-bar">
                <div class="viz-phase" data-phase="setup">
                    <span class="viz-phase-num">1</span>
                    <span class="viz-phase-label">Setup</span>
                </div>
                <div class="viz-phase-arrow">→</div>
                <div class="viz-phase" data-phase="capture">
                    <span class="viz-phase-num">2</span>
                    <span class="viz-phase-label">Capture</span>
                </div>
                <div class="viz-phase-arrow">→</div>
                <div class="viz-phase" data-phase="dag">
                    <span class="viz-phase-num">3</span>
                    <span class="viz-phase-label">DAG</span>
                </div>
                <div class="viz-phase-arrow">→</div>
                <div class="viz-phase" data-phase="verify">
                    <span class="viz-phase-num">4</span>
                    <span class="viz-phase-label">Verify</span>
                </div>
            </div>

            <!-- Tab bar -->
            <div class="viz-tabs" id="viz-tabs">
                <button class="viz-tab active" data-tab="mesh">🌐 Mesh Graph</button>
                <button class="viz-tab" data-tab="waveform">📊 Waveform</button>
                <button class="viz-tab" data-tab="dag" title="Spatio-temporal DAG — cross-device observation graph">🔗 DAG</button>
                <button class="viz-tab" data-tab="merkle" title="Merkle tree of heard-set entries per device">🌳 Merkle Tree</button>
                <button class="viz-tab" data-tab="cert" title="Cryptographic certificate issued after verification">📜 Certificate</button>
            </div>

            <!-- Guidance banner -->
            <div id="viz-guidance" style="
                display: none;
                margin: 8px 0 0 0;
                padding: 8px 14px;
                background: rgba(0,210,255,0.12);
                border: 1px solid rgba(0,210,255,0.3);
                border-radius: 8px;
                font-size: 12px;
                color: rgba(255,255,255,0.85);
                text-align: center;
            "></div>

            <!-- Canvas panels -->
            <div class="viz-panels">
                <div class="viz-panel active" data-panel="mesh">
                    <canvas id="mesh-graph-canvas" class="viz-canvas"></canvas>
                    <div class="viz-legend" id="mesh-legend"></div>
                </div>
                <div class="viz-panel" data-panel="waveform">
                    <canvas id="waveform-canvas" class="viz-canvas"></canvas>
                </div>
                <div class="viz-panel" data-panel="dag">
                    <canvas id="dag-canvas" class="viz-canvas"></canvas>
                    <div id="dag-legend" style="font-size:11px;color:#8b9bb4;padding:4px 8px;"></div>
                </div>
                <div class="viz-panel" data-panel="merkle">
                    <div id="merkle-device-selector" style="display:flex;gap:6px;padding:6px 0;flex-wrap:wrap;"></div>
                    <svg id="merkle-svg" class="viz-svg"></svg>
                </div>
                <div class="viz-panel" data-panel="cert">
                    <div class="certificate-display" id="certificate-display"></div>
                </div>
            </div>
        </div>
    `;

    // ── Element refs ───────────────────────────────────────────────

    const phaseBar = container.querySelector('#viz-phase-bar');
    const tabsContainer = container.querySelector('#viz-tabs');
    const meshCanvas = container.querySelector('#mesh-graph-canvas');
    const waveformCanvas = container.querySelector('#waveform-canvas');
    const dagCanvas = container.querySelector('#dag-canvas');
    const merkleSvg = container.querySelector('#merkle-svg');
    const certDisplay = container.querySelector('#certificate-display');
    const meshLegend = container.querySelector('#mesh-legend');
    const dagLegend = container.querySelector('#dag-legend');
    const merkleDeviceSelector = container.querySelector('#merkle-device-selector');
    const guidanceBanner = container.querySelector('#viz-guidance');

    // ── Tab switching ──────────────────────────────────────────────

    function switchToTab(tabName, opts = {}) {
        tabsContainer.querySelectorAll('.viz-tab').forEach(t => {
            t.classList.remove('active');
            // Remove notification dot when switching to that tab
            if (t.dataset.tab === tabName) {
                t.classList.add('active');
                const dot = t.querySelector('.tab-dot');
                if (dot) dot.remove();
            }
        });
        container.querySelectorAll('.viz-panel').forEach(p => p.classList.remove('active'));
        const panel = container.querySelector(`[data-panel="${tabName}"]`);
        if (panel) panel.classList.add('active');
        // Resize canvases when made visible
        if (tabName === 'mesh') resizeAndDrawMesh();
        if (tabName === 'waveform') resizeAndDrawWaveform();
        if (tabName === 'dag') resizeAndDrawDAG();
        // Show guidance if provided
        if (opts.guidance) {
            guidanceBanner.style.display = 'block';
            guidanceBanner.innerHTML = opts.guidance;
        }
    }

    function notifyTab(tabName, message) {
        const tab = tabsContainer.querySelector(`[data-tab="${tabName}"]`);
        if (!tab || tab.classList.contains('active')) return;
        if (!tab.querySelector('.tab-dot')) {
            const dot = document.createElement('span');
            dot.className = 'tab-dot';
            dot.style.cssText = 'display:inline-block;width:7px;height:7px;border-radius:50%;background:#00e676;margin-left:5px;vertical-align:middle;animation:pulse-badge 2s infinite;';
            tab.appendChild(dot);
        }
    }

    tabsContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.viz-tab');
        if (!tab) return;
        switchToTab(tab.dataset.tab);
        guidanceBanner.style.display = 'none';
    });

    // ── Canvas sizing ──────────────────────────────────────────────

    function setupCanvas(canvas) {
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = 400 * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = '400px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { ctx, w: rect.width, h: 400 };
    }

    // ═══════════════════════════════════════════════════════════════
    // Phase indicator
    // ═══════════════════════════════════════════════════════════════

    function setPhase(phase) {
        phaseBar.querySelectorAll('.viz-phase').forEach(el => {
            const elPhase = el.dataset.phase;
            el.classList.remove('viz-phase-active', 'viz-phase-done');
            if (elPhase === phase) {
                el.classList.add('viz-phase-active');
            } else if (PHASE_ORDER.indexOf(elPhase) < PHASE_ORDER.indexOf(phase)) {
                el.classList.add('viz-phase-done');
            }
        });
    }

    const PHASE_ORDER = ['setup', 'capture', 'dag', 'verify'];

    // ═══════════════════════════════════════════════════════════════
    // Mesh Graph (Canvas)
    // ═══════════════════════════════════════════════════════════════

    let meshGraphData = null;

    function renderMeshGraph(devices, topology) {
        meshGraphData = { devices, topology };
        resizeAndDrawMesh();
    }

    function resizeAndDrawMesh() {
        if (!meshGraphData) return;
        drawMeshGraph(meshGraphData.devices, meshGraphData.topology);
    }

    function drawMeshGraph(devices, topology) {
        const { ctx, w, h } = setupCanvas(meshCanvas);
        if (!ctx) return;

        // Clear
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, w, h);

        // Layout: arrange devices in a circle
        const cx = w / 2;
        const cy = h / 2;
        const radius = Math.min(w, h) * 0.35;
        const positions = devices.map((d, i) => {
            const angle = (2 * Math.PI * i) / devices.length - Math.PI / 2;
            return {
                x: cx + Math.cos(angle) * radius,
                y: cy + Math.sin(angle) * radius,
                ...d,
            };
        });

        // Draw edges
        const drawnPairs = new Set();
        for (const d of devices) {
            const topo = topology[d.pk];
            if (!topo || !topo.observedKeys) continue;
            const from = positions.find(p => p.pk === d.pk);
            if (!from) continue;

            for (const otherPk of topo.observedKeys) {
                const to = positions.find(p => p.pk === otherPk);
                if (!to) continue;
                const pairKey = [d.pk, otherPk].sort().join(':');
                if (drawnPairs.has(pairKey)) continue;
                drawnPairs.add(pairKey);

                const rssi = topo.rssi?.[otherPk] || -60;
                const alpha = Math.max(0.2, Math.min(1, (Math.abs(rssi) - 40) / 40));
                ctx.beginPath();
                ctx.moveTo(from.x, from.y);
                ctx.lineTo(to.x, to.y);
                ctx.strokeStyle = `rgba(0, 210, 255, ${alpha})`;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
                ctx.setLineDash([]);

                // Label edge with RSSI
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                ctx.fillStyle = COLORS.muted;
                ctx.font = '9px monospace';
                ctx.fillText(`${rssi.toFixed(0)} dBm`, mx + 5, my - 5);
            }
        }

        // Draw nodes
        positions.forEach((pos, i) => {
            const color = getDeviceColor(i);

            // Outer glow
            const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 30);
            glow.addColorStop(0, color + '40');
            glow.addColorStop(1, 'transparent');
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 30, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();

            // Node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 18, 0, Math.PI * 2);
            ctx.fillStyle = COLORS.bg;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            ctx.fillStyle = color;
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(pos.label, pos.x, pos.y);

            // PK below
            ctx.fillStyle = COLORS.muted;
            ctx.font = '8px monospace';
            ctx.fillText(pos.pk.slice(0, 8) + '…', pos.x, pos.y + 22);
            ctx.textAlign = 'start';
            ctx.textBaseline = 'alphabetic';
        });

        // Legend
        meshLegend.innerHTML = devices.map((d, i) => `
            <span style="color:${getDeviceColor(i)};display:inline-flex;align-items:center;gap:4px;margin-right:12px;">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${getDeviceColor(i)};"></span>
                ${d.label}: ${d.pk.slice(0, 8)}…
            </span>
        `).join('');
    }

    // ═══════════════════════════════════════════════════════════════
    // Audio Waveform (Canvas)
    // ═══════════════════════════════════════════════════════════════

    let waveformData = null;

    function renderWaveform(waveformPeaks, devices) {
        waveformData = { waveformPeaks, devices };
        resizeAndDrawWaveform();
    }

    function resizeAndDrawWaveform() {
        if (!waveformData) return;
        drawWaveform(waveformData.waveformPeaks, waveformData.devices);
    }

    function drawWaveform(waveformPeaks, devices) {
        const { ctx, w, h } = setupCanvas(waveformCanvas);
        if (!ctx) return;

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, w, h);

        const margin = { top: 30, bottom: 20, left: 40, right: 20 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const rowHeight = plotH / Math.max(1, devices.length);

        // Grid
        ctx.strokeStyle = COLORS.glassBorder;
        ctx.lineWidth = 0.5;
        const midY = margin.top + plotH / 2;
        ctx.beginPath();
        ctx.moveTo(margin.left, midY);
        ctx.lineTo(w - margin.right, midY);
        ctx.stroke();

        devices.forEach((dev, idx) => {
            const peaks = waveformPeaks[dev.id];
            if (!peaks || peaks.length < 2) return;

            const y0 = margin.top + idx * rowHeight;
            const yMid = y0 + rowHeight / 2;
            const color = getDeviceColor(idx);

            // Label
            ctx.fillStyle = color;
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText(dev.label, margin.left - 8, yMid + 3);
            ctx.textAlign = 'start';

            // Waveform
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;

            const scaleX = plotW / (peaks.length - 1);
            const ampScale = rowHeight * 0.35;

            for (let i = 0; i < peaks.length; i++) {
                const x = margin.left + i * scaleX;
                const y = yMid - peaks[i] * ampScale;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Chirp zone highlight (where tx happens)
            const txStartFrac = 0.01 / 0.3;  // approximate based on tx spacing
            const txEndFrac = (0.01 + idx * 0.03 + 2.0) / 0.3; // a bit of buffer
            ctx.fillStyle = color + '15';
            ctx.fillRect(
                margin.left + txStartFrac * plotW,
                y0 + 2,
                Math.min((txEndFrac - txStartFrac) * plotW, plotW - txStartFrac * plotW),
                rowHeight - 4
            );
        });
    }

    // ═══════════════════════════════════════════════════════════════
    // DAG (Canvas)
    // ═══════════════════════════════════════════════════════════════

    let dagData = null;
    let merkleAllData = null;

    function renderDAG(dag, devices) {
        dagData = { dag, devices };
        switchToTab('dag', {
            guidance: '🔗 <strong>DAG built.</strong> Spatio-temporal cross-device observation graph — each row is a device, each column is a beacon round. Diagonal edges show mutual hearing. Click <em>🌳 Merkle Tree</em> next.'
        });
        resizeAndDrawDAG();
        notifyTab('merkle', 'Merkle data ready');
    }

    function resizeAndDrawDAG() {
        if (!dagData) return;
        drawDAG(dagData.dag, dagData.devices);
    }

    function drawDAG(dag, devices) {
        const { ctx, w, h } = setupCanvas(dagCanvas);
        if (!ctx) return;

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, w, h);

        if (!dag || !dag.nodes || dag.nodes.length === 0) {
            ctx.fillStyle = COLORS.muted;
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No DAG data available', w / 2, h / 2);
            ctx.textAlign = 'start';
            return;
        }

        // Group nodes by device PK
        const byDevice = {};
        for (const node of dag.nodes) {
            const pk = node.beacon?.pk || node.bundlePk || 'unknown';
            if (!byDevice[pk]) byDevice[pk] = [];
            byDevice[pk].push(node);
        }

        const devKeys = devices.map(d => d.pk);
        const numDevs = devKeys.length;
        const maxNodes = Math.max(1, ...Object.values(byDevice).map(arr => arr.length));

        const margin = { top: 40, bottom: 30, left: 80, right: 20 };
        const plotW = w - margin.left - margin.right;
        const plotH = h - margin.top - margin.bottom;
        const rowHeight = plotH / Math.max(1, numDevs);
        const colWidth = plotW / Math.max(1, maxNodes);

        // Draw self-chain edges (horizontal)
        ctx.strokeStyle = COLORS.glassBorder;
        ctx.lineWidth = 1;
        for (let di = 0; di < numDevs; di++) {
            const pk = devKeys[di];
            const nodes = byDevice[pk] || [];
            const y = margin.top + di * rowHeight + rowHeight / 2;

            for (let ni = 1; ni < nodes.length; ni++) {
                const x1 = margin.left + (ni - 1) * colWidth + colWidth / 2;
                const x2 = margin.left + ni * colWidth + colWidth / 2;
                ctx.beginPath();
                ctx.moveTo(x1, y);
                ctx.lineTo(x2, y);
                ctx.strokeStyle = getDeviceColor(di) + '80';
                ctx.stroke();
            }
        }

        // Draw cross-chain edges (diagonal)
        for (const edge of dag.edges || []) {
            const [fromPk, fromSeq] = (edge.from || '').split(':');
            const toPk = edge.heardPk || (edge.to || '').split(':')[0];

            const fromDi = devKeys.indexOf(fromPk);
            const toDi = devKeys.indexOf(toPk);
            if (fromDi < 0 || toDi < 0) continue;

            const fromNodes = byDevice[fromPk] || [];
            const fromNi = parseInt(fromSeq) || 0;
            if (fromNi >= fromNodes.length) continue;

            const x1 = margin.left + (fromNi) * colWidth + colWidth / 2;
            const y1 = margin.top + fromDi * rowHeight + rowHeight / 2;

            // Find matching time for toPk
            const x2 = margin.left + (fromNi) * colWidth + colWidth / 2;
            const y2 = margin.top + toDi * rowHeight + rowHeight / 2;

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = getDeviceColor(toDi) + '60';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([2, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw nodes
        for (let di = 0; di < numDevs; di++) {
            const pk = devKeys[di];
            const nodes = byDevice[pk] || [];
            const color = getDeviceColor(di);
            const y = margin.top + di * rowHeight + rowHeight / 2;

            for (let ni = 0; ni < nodes.length; ni++) {
                const x = margin.left + ni * colWidth + colWidth / 2;
                const r = Math.max(0, Math.min(8, colWidth * 0.3, rowHeight * 0.3));

                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fillStyle = color + '30';
                ctx.fill();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }

            // Device label
            const dev = devices[di];
            ctx.fillStyle = color;
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(dev?.label || pk.slice(0, 6), margin.left - 10, y + 3);
            ctx.textAlign = 'start';
        }

        // Stats footer
        if (dagLegend) {
            dagLegend.innerHTML = `Nodes: <strong>${dag.nodes.length}</strong> &nbsp;|&nbsp; Edges: <strong>${dag.edges?.length || 0}</strong> &nbsp;|&nbsp; ` +
                devices.map((d, i) => `<span style="color:${getDeviceColor(i)}">● ${d.label || d.pk.slice(0,4)}</span>`).join(' ');
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Merkle Tree (SVG)
    // ═══════════════════════════════════════════════════════════════

    function renderMerkleTree(merkleData, highlightPk, devices) {
        if (!merkleData) {
            merkleSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#8b9bb4" font-size="14">No Merkle tree data</text>';
            return;
        }

        // Get the first tree if no specific pk requested
        const pks = Object.keys(merkleData);
        if (pks.length === 0) {
            merkleSvg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#8b9bb4" font-size="14">No Merkle tree data</text>';
            return;
        }

        // Store all data so device selector works
        merkleAllData = merkleData;

        // Build device selector buttons if there are multiple devices
        if (merkleDeviceSelector && pks.length > 1) {
            merkleDeviceSelector.innerHTML = pks.map((pk, i) => {
                // Extract label from PK format "pk_LABEL_xxx" or use first chars
                const match = pk.match(/^pk_([A-Z]+)_/);
                const devLabel = match ? match[1] : pk.slice(0, 4).toUpperCase();
                return `<button class="viz-tab ${i === 0 ? 'active' : ''}" data-merkle-pk="${pk}" style="font-size:11px;padding:3px 10px;">` +
                    `<span style="color:${getDeviceColor(i)}">◆</span> Device ${devLabel}</button>`;
            }).join('');
            merkleDeviceSelector.querySelectorAll('[data-merkle-pk]').forEach(btn => {
                btn.addEventListener('click', () => {
                    merkleDeviceSelector.querySelectorAll('[data-merkle-pk]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    drawMerkleTree(merkleAllData, btn.dataset.merklePk);
                });
            });
        }

        notifyTab('merkle');
        drawMerkleTree(merkleData, highlightPk);
    }

    function drawMerkleTree(merkleData, highlightPk) {
        const pks = Object.keys(merkleData);
        const pk = highlightPk && merkleData[highlightPk] ? highlightPk : pks[0];
        const tree = merkleData[pk];
        if (!tree || !tree.leaves || tree.leaves.length === 0) {
            merkleSvg.innerHTML = `<text x="50%" y="50%" text-anchor="middle" fill="#8b9bb4" font-size="14">Device ${pk.slice(0,8)}: No heard entries</text>`;
            return;
        }

        const svgW = 600;
        const leafCount = tree.leaves.length;
        const treeHeight = Math.ceil(Math.log2(leafCount || 1)) + 1;
        const svgH = Math.max(200, treeHeight * 60 + 80);

        merkleSvg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
        merkleSvg.style.width = '100%';
        merkleSvg.style.height = svgH + 'px';

        const nodeRadius = 14;
        const levelH = 55;
        const baseY = svgH - 40;

        // Build tree structure from levels
        const levels = tree.levels || [];
        // If levels not available, build from leaves
        let nodes = [];
        if (levels.length > 0) {
            nodes = levels;
        } else {
            // Build from leaves
            const leafNodes = tree.leaves.map((l, i) => ({ hash: l.hash, pk: l.pk }));
            nodes = [leafNodes];
            let current = leafNodes;
            while (current.length > 1) {
                const next = [];
                for (let i = 0; i < current.length; i += 2) {
                    const left = current[i];
                    const right = i + 1 < current.length ? current[i + 1] : current[i];
                    next.push({ hash: left.hash + right.hash });
                }
                nodes.push(next);
                current = next;
            }
        }

        let svg = '';

        // Draw edges and nodes for each level
        for (let li = 0; li < nodes.length; li++) {
            const level = nodes[li];
            const y = baseY - li * levelH;
            const levelWidth = svgW - 40;
            const startX = 20;

            for (let ni = 0; ni < level.length; ni++) {
                const node = level[ni];
                const x = startX + (levelWidth * (ni + 0.5)) / Math.max(1, level.length);

                // Draw edges to children (if not leaf)
                if (li > 0) {
                    const prevLevel = nodes[li - 1];
                    const childY = baseY - (li - 1) * levelH;
                    const leftChild = ni * 2;
                    const rightChild = Math.min(ni * 2 + 1, prevLevel.length - 1);

                    for (const ci of [leftChild, rightChild]) {
                        if (ci < prevLevel.length) {
                            const cx = startX + (levelWidth * (ci + 0.5)) / Math.max(1, prevLevel.length);
                            svg += `<line x1="${x}" y1="${y}" x2="${cx}" y2="${childY}" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>`;
                        }
                    }
                }

                // Node circle + label
                const isLeaf = li === 0;
                const isRoot = li === nodes.length - 1;
                const fill = isRoot ? COLORS.pass : isLeaf ? getDeviceColor(ni % 5) : COLORS.primary;
                const textColor = '#000';

                svg += `<circle cx="${x}" cy="${y}" r="${nodeRadius}" fill="${fill}" opacity="${isRoot ? 1 : 0.7}"/>`;
                const hashShort = (node.hash || '').slice(0, 4);
                svg += `<text x="${x}" y="${y + 1}" text-anchor="middle" fill="${textColor}" font-size="7" font-family="monospace">${hashShort}</text>`;

                // Leaf labels
                if (isLeaf && node.pk) {
                    svg += `<text x="${x}" y="${y + nodeRadius + 12}" text-anchor="middle" fill="${getDeviceColor(ni % 5)}" font-size="7" font-family="monospace">${node.pk.slice(0, 8)}</text>`;
                }
            }
        }

        // Root label
        if (nodes.length > 0) {
            const rootLevel = nodes[nodes.length - 1];
            const rootX = 20 + (svgW - 40) / 2;
            const rootY = baseY - (nodes.length - 1) * levelH;
            svg += `<text x="${rootX}" y="${rootY - 22}" text-anchor="middle" fill="${COLORS.pass}" font-size="10" font-weight="bold">ROOT: ${(tree.root || '').slice(0, 12)}…</text>`;
        }

        // Title
        svg += `<text x="${svgW / 2}" y="16" text-anchor="middle" fill="${COLORS.text}" font-size="12">Heard-Set Merkle Tree — ${pk.slice(0, 10)}…</text>`;

        merkleSvg.innerHTML = svg;
    }

    // ═══════════════════════════════════════════════════════════════
    // Certificate Display
    // ═══════════════════════════════════════════════════════════════

    function renderCertificate(certificate) {
        if (!certificate) {
            certDisplay.innerHTML = '<div class="cert-empty">No certificate generated yet. Run the full witness demo.</div>';
            return;
        }
        // Auto-switch to certificate tab and notify
        switchToTab('cert', {
            guidance: '📜 <strong>Verification complete!</strong> Certificate issued. Review the MNR co-location certificate, ZK proof status, Merkle root, and blockchain anchor below.'
        });
        notifyTab('merkle');

        const isPass = certificate.zkValid && certificate.mnrCertificate !== null;
        const borderColor = isPass ? COLORS.pass : (certificate.duressDetected ? COLORS.warn : COLORS.fail);
        const statusText = isPass ? '✅ AUTHENTIC' : (certificate.duressDetected ? '⚠ CONDITIONAL — DURESS DETECTED' : '❌ FAILED');

        certDisplay.innerHTML = `
            <div class="cert-card" style="border-color:${borderColor};">
                <div class="cert-header" style="background:${borderColor}15;">
                    <h4>🏆 GroupMNR Certificate</h4>
                    <span class="cert-status" style="color:${borderColor};">${statusText}</span>
                </div>
                <div class="cert-body">
                    <div class="cert-row">
                        <span class="cert-label">Devices</span>
                        <span class="cert-value">${certificate.deviceCount} total (${certificate.devices?.map(d => d.label).join(', ') || '—'})</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">ZK Proofs</span>
                        <span class="cert-value" style="color:${certificate.zkValid ? COLORS.pass : COLORS.fail}">${certificate.zkValid ? '✅ Valid' : '❌ Invalid'} (${certificate.zkCount})</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">MNR Certificate</span>
                        <span class="cert-value">${certificate.mnrCertificate || '—'}</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">Merkle Root</span>
                        <span class="cert-value mono">${certificate.merkleRoot?.slice(0, 16) || '—'}…</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">OTS Anchor</span>
                        <span class="cert-value mono">${certificate.otsProof || '—'}</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">DAG Nodes</span>
                        <span class="cert-value">${certificate.dagNodes}</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">DAG Edges</span>
                        <span class="cert-value">${certificate.dagEdges}</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">Audio Chunks</span>
                        <span class="cert-value">${certificate.audioChunks} (root: ${certificate.audioRoot}…)</span>
                    </div>
                    <div class="cert-row">
                        <span class="cert-label">Duress</span>
                        <span class="cert-value" style="color:${certificate.duressDetected ? COLORS.warn : COLORS.pass}">${certificate.duressDetected ? '🚨 DETECTED' : '✓ Clear'}</span>
                    </div>
                    <div class="cert-verdict">
                        <strong>Verdict:</strong> ${certificate.verdict}
                    </div>
                </div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════════════
    // Clear
    // ═══════════════════════════════════════════════════════════════

    function clearAll() {
        meshGraphData = null;
        waveformData = null;
        dagData = null;

        [meshCanvas, waveformCanvas, dagCanvas].forEach(canvas => {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = COLORS.bg;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        });

        merkleSvg.innerHTML = '';
        certDisplay.innerHTML = '<div class="cert-empty">Run the witness demo to generate results.</div>';

        // Reset phase
        phaseBar.querySelectorAll('.viz-phase').forEach(el => {
            el.classList.remove('viz-phase-active', 'viz-phase-done');
        });
    }

    // ── Public API ─────────────────────────────────────────────────

    return {
        setPhase,
        switchToTab,
        renderMeshGraph,
        renderWaveform,
        renderDAG,
        renderMerkleTree,
        renderCertificate,
        clearAll,
    };
}
