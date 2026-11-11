/**
 * ui/witness-pane.js — Left pane: simulated phone UI.
 *
 * Handles:
 *   - Camera preview with CSS-drawn viewfinder and recording indicator
 *   - PIN keypad (4-digit)
 *   - Duress toggle
 *   - Record/Stop button
 *   - Live status display
 *   - Web Audio API playback of chirp CDMA audio
 *   - Step-by-step animation
 *
 * Works with WitnessDemo state machine (no direct dependency — receives data).
 */

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

/**
 * Initialize and mount the left phone pane.
 *
 * @param {HTMLElement} container - parent element for the phone pane
 * @param {Object} callbacks
 * @param {(digit: string) => void} callbacks.onPinDigit - PIN digit entered
 * @param {() => void} callbacks.onPinClear - PIN cleared
 * @param {(on: boolean) => void} callbacks.onDuressToggle - duress toggled
 * @param {() => void} callbacks.onRecord - record button pressed
 * @param {() => void} callbacks.onStop - stop button pressed
 * @returns {{
 *   updateStatus: (status: Object) => void,
 *   setPhase: (phase: string) => void,
 *   setRecording: (on: boolean) => void,
 *   setAudioBuffer: (buffer: Float32Array, sampleRate: number) => void,
 *   playAudio: () => void,
 *   stopAudio: () => void,
 *   animateStep: (step: string) => void,
 *   reset: () => void,
 *   destroy: () => void
 * }}
 */
export function mountWitnessPane(container, callbacks = {}) {
    const {
        onPinDigit = () => {},
        onPinClear = () => {},
        onDuressToggle = () => {},
        onRecord = () => {},
        onStop = () => {},
    } = callbacks;

    // ── Build DOM ──────────────────────────────────────────────────

    container.innerHTML = `
        <div class="phone-frame">
            <!-- Phone bezel -->
            <div class="phone-bezel">
                <div class="phone-notch"></div>
                <!-- Viewfinder -->
                <div class="phone-viewfinder" id="witness-viewfinder">
                    <!-- Optional browser-camera preview. This is NOT hardware
                         attestation; it is a local UI preview with a visible label. -->
                    <video class="phone-camera" id="witness-camera" playsinline muted autoplay></video>
                    <canvas class="phone-camera phone-camera-freeze" id="witness-camera-freeze" hidden></canvas>
                    <div class="viewfinder-overlay">
                        <div class="vf-corners">
                            <div class="vf-corner vf-tl"></div>
                            <div class="vf-corner vf-tr"></div>
                            <div class="vf-corner vf-bl"></div>
                            <div class="vf-corner vf-br"></div>
                        </div>
                        <div class="vf-center-crosshair"></div>
                        <div class="recording-indicator" id="recording-indicator">
                            <span class="rec-dot"></span>
                            <span class="rec-text">REC</span>
                        </div>
                        <div class="vf-scanline"></div>
                    </div>
                    <div class="camera-note" id="camera-note" hidden></div>
                    <!-- Recording animation overlay -->
                    <div class="recording-pulse" id="recording-pulse"></div>
                </div>

                <!-- Status bar -->
                <div class="phone-status" id="phone-status">
                    <span class="status-item">📶 BLE: <strong id="status-ble">—</strong></span>
                    <span class="status-item">🎤 Audio: <strong id="status-audio">idle</strong></span>
                    <span class="status-item">📸 Frames: <strong id="status-frames">—</strong></span>
                </div>

                <!-- Step animation bar -->
                <div class="phone-step-bar" id="phone-step-bar">
                    <div class="phone-step" data-step="pin">🔐 PIN</div>
                    <div class="phone-step-arrow">→</div>
                    <div class="phone-step" data-step="key">🔑 Key</div>
                    <div class="phone-step-arrow">→</div>
                    <div class="phone-step" data-step="beacon">📡 Beacon</div>
                    <div class="phone-step-arrow">→</div>
                    <div class="phone-step" data-step="capture">🎤 Audio</div>
                    <div class="phone-step-arrow">→</div>
                    <div class="phone-step" data-step="stop">✅ Done</div>
                </div>

                <!-- PIN keypad -->
                <div class="phone-keypad" id="phone-keypad" style="position: relative;">
                    <div class="action-badge" id="badge-1">1</div>
                    <div id="pin-instruction" style="text-align: center; font-size: 13px; margin-bottom: 12px; color: rgba(255,255,255,0.7); animation: pulse-text 2s infinite;">
                        Enter 4-digit PIN to unlock recording
                    </div>
                    <div class="pin-display" id="pin-display">
                        <span class="pin-dot" data-dot="0"></span>
                        <span class="pin-dot" data-dot="1"></span>
                        <span class="pin-dot" data-dot="2"></span>
                        <span class="pin-dot" data-dot="3"></span>
                    </div>
                    <div class="keypad-grid">
                        <button class="keypad-btn" data-key="1">1</button>
                        <button class="keypad-btn" data-key="2">2</button>
                        <button class="keypad-btn" data-key="3">3</button>
                        <button class="keypad-btn" data-key="4">4</button>
                        <button class="keypad-btn" data-key="5">5</button>
                        <button class="keypad-btn" data-key="6">6</button>
                        <button class="keypad-btn" data-key="7">7</button>
                        <button class="keypad-btn" data-key="8">8</button>
                        <button class="keypad-btn" data-key="9">9</button>
                        <button class="keypad-btn keypad-clear" data-key="clear">⌫</button>
                        <button class="keypad-btn" data-key="0">0</button>
                        <button class="keypad-btn keypad-duress" id="duress-toggle" data-key="duress">⚠️</button>
                    </div>
                </div>

                <!-- Record controls -->
                <div class="phone-record-controls" id="phone-record-controls">
                    <button class="record-btn" id="record-btn" disabled style="position: relative;">
                        <div class="action-badge" id="badge-2" style="display: none;">2</div>
                        <span class="record-btn-icon">⏺</span>
                        <span class="record-btn-label">Record</span>
                    </button>
                    <button class="stop-btn" id="stop-btn" style="display:none; position: relative;">
                        <div class="action-badge" id="badge-3" style="display: none;">3</div>
                        <span class="stop-btn-icon">⏹</span>
                        <span class="stop-btn-label">Stop</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // ── Element refs ───────────────────────────────────────────────

    const pinDots = [
        container.querySelector('[data-dot="0"]'),
        container.querySelector('[data-dot="1"]'),
        container.querySelector('[data-dot="2"]'),
        container.querySelector('[data-dot="3"]'),
    ];
    const duressBtn = container.querySelector('#duress-toggle');
    const recordBtn = container.querySelector('#record-btn');
    const stopBtn = container.querySelector('#stop-btn');
    const recordingIndicator = container.querySelector('#recording-indicator');
    const recordingPulse = container.querySelector('#recording-pulse');
    const stepBar = container.querySelector('#phone-step-bar');
    const viewfinder = container.querySelector('#witness-viewfinder');
    const cameraVideo = container.querySelector('#witness-camera');
    const cameraFreeze = container.querySelector('#witness-camera-freeze');
    const cameraNote = container.querySelector('#camera-note');
    const statusBle = container.querySelector('#status-ble');
    const statusAudio = container.querySelector('#status-audio');
    const statusFrames = container.querySelector('#status-frames');
    const pinInstruction = container.querySelector('#pin-instruction');
    const badge1 = container.querySelector('#badge-1');
    const badge2 = container.querySelector('#badge-2');
    const badge3 = container.querySelector('#badge-3');

    let pinDigits = '';
    let isRecording = false;
    let isDuress = false;
    const cameraMode = new URLSearchParams(window.location.search).get('camera') || 'auto';
    let cameraStream = null;
    let cameraRequestId = 0;
    let cameraActive = false;
    let cameraNoteTimer = null;
    let audioCtx = null;
    let audioSource = null;
    let currentAudioBuffer = null;
    const SAMPLE_RATE = 44100;
    let currentSampleRate = SAMPLE_RATE;

    // ── Keypad handlers ────────────────────────────────────────────

    const keyButtons = container.querySelectorAll('.keypad-btn[data-key]');
    keyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            if (key === 'clear') {
                pinDigits = '';
                updatePinDots();
                recordBtn.disabled = true;
                stopBtn.style.display = 'none';
                recordBtn.style.display = 'inline-flex';
                pinInstruction.textContent = 'Enter 4-digit PIN to unlock recording';
                if (badge1) badge1.style.display = 'flex';
                if (badge2) badge2.style.display = 'none';
                if (badge3) badge3.style.display = 'none';
                onPinClear();
                return;
            }
            if (key === 'duress') {
                isDuress = !isDuress;
                duressBtn.classList.toggle('keypad-duress-active', isDuress);
                onDuressToggle(isDuress);
                return;
            }
            if (!isRecording && pinDigits.length < 4) {
                pinDigits += key;
                updatePinDots();
                onPinDigit(key);
                if (pinDigits.length === 4) {
                    recordBtn.disabled = false;
                    pinInstruction.textContent = 'Ready! Press Record to capture mesh.';
                    if (badge1) badge1.style.display = 'none';
                    if (badge2) badge2.style.display = 'flex';
                }
            }
        });
    });

    function updatePinDots() {
        for (let i = 0; i < 4; i++) {
            pinDots[i].classList.toggle('pin-dot-filled', i < pinDigits.length);
        }
    }

    // ── Optional browser-camera preview ───────────────────────────
    //
    // The simulated phone can show the local webcam while "recording". It is a
    // UI preview only: it is explicitly labelled, and it is never used as a
    // hardware attestation or as evidence in the certificate. If the camera is
    // unavailable (headless CI, permission denied, no device), the original
    // simulated viewfinder is used.

    function clearCameraNote() {
        if (cameraNoteTimer) {
            clearTimeout(cameraNoteTimer);
            cameraNoteTimer = null;
        }
        cameraNote.hidden = true;
        cameraNote.textContent = '';
        cameraNote.classList.remove('camera-note-sticky');
    }

    function setCameraNote(text, { sticky = false } = {}) {
        if (cameraNoteTimer) {
            clearTimeout(cameraNoteTimer);
            cameraNoteTimer = null;
        }
        cameraNote.textContent = text;
        cameraNote.hidden = false;
        cameraNote.classList.toggle('camera-note-sticky', sticky);
        if (!sticky) {
            cameraNoteTimer = setTimeout(() => {
                cameraNote.hidden = true;
                cameraNoteTimer = null;
            }, 3500);
        }
    }

    function stopCameraTracks() {
        if (cameraStream) {
            cameraStream.getTracks().forEach((track) => track.stop());
            cameraStream = null;
        }
        if (cameraVideo.srcObject) {
            cameraVideo.srcObject = null;
        }
    }

    async function startCameraPreview() {
        // `?camera=off` keeps the deterministic recording/CI cut free of
        // permission prompts and fallback notes. The default is `auto`.
        if (cameraMode === 'off') return false;
        const requestId = ++cameraRequestId;
        stopCameraTracks();
        cameraActive = false;
        cameraVideo.classList.remove('camera-active');
        cameraFreeze.classList.remove('camera-active');
        cameraFreeze.hidden = true;

        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
            setCameraNote('Camera unavailable — using simulated view');
            return false;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                },
                audio: false,
            });

            // The user may have pressed Stop while the permission prompt was
            // open, or a newer request may have superseded this one.
            if (requestId !== cameraRequestId || !isRecording) {
                stream.getTracks().forEach((track) => track.stop());
                return false;
            }

            cameraStream = stream;
            cameraVideo.srcObject = stream;
            await cameraVideo.play();

            if (requestId !== cameraRequestId || !isRecording) {
                stopCameraTracks();
                return false;
            }

            cameraVideo.classList.add('camera-active');
            cameraActive = true;
            setCameraNote('Browser camera — preview only\nNot hardware-attested', { sticky: true });
            return true;
        } catch (error) {
            stopCameraTracks();
            cameraActive = false;
            if (requestId === cameraRequestId) {
                setCameraNote('Camera unavailable — using simulated view');
            }
            return false;
        }
    }

    function freezeCameraFrame() {
        if (!cameraActive || !cameraVideo.videoWidth) {
            stopCameraTracks();
            cameraVideo.classList.remove('camera-active');
            return;
        }

        const width = cameraVideo.videoWidth;
        const height = cameraVideo.videoHeight;
        cameraFreeze.width = width;
        cameraFreeze.height = height;
        const context = cameraFreeze.getContext('2d');
        if (context) {
            // Mirror the selfie preview so the frozen frame matches what the
            // user saw on screen.
            context.save();
            context.translate(width, 0);
            context.scale(-1, 1);
            context.drawImage(cameraVideo, 0, 0, width, height);
            context.restore();
        }
        cameraFreeze.hidden = false;
        cameraFreeze.classList.add('camera-active');
        cameraVideo.classList.remove('camera-active');
        cameraActive = false;
        stopCameraTracks();
        setCameraNote('Captured browser frame — preview only\nNot hardware-attested', { sticky: true });
    }

    function stopCameraPreview({ freeze = false } = {}) {
        cameraRequestId += 1;
        if (freeze) {
            freezeCameraFrame();
        } else {
            stopCameraTracks();
            cameraVideo.classList.remove('camera-active');
            cameraFreeze.classList.remove('camera-active');
            cameraFreeze.hidden = true;
            clearCameraNote();
        }
        cameraActive = false;
    }

    // ── Record controls ────────────────────────────────────────────

    recordBtn.addEventListener('click', () => {
        if (pinDigits.length < 4 || isRecording) return;
        isRecording = true;
        recordBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        recordingIndicator.classList.add('recording-active');
        recordingPulse.classList.add('pulsing');
        viewfinder.classList.add('viewfinder-recording');
        updateStep('capture', 'active');
        if (badge2) badge2.style.display = 'none';
        if (badge3) badge3.style.display = 'flex';
        void startCameraPreview();
        onRecord();
    });

    stopBtn.addEventListener('click', () => {
        if (!isRecording) return;
        isRecording = false;
        stopBtn.style.display = 'none';
        recordBtn.style.display = 'inline-flex';
        recordBtn.disabled = true;
        recordingIndicator.classList.remove('recording-active');
        recordingPulse.classList.remove('pulsing');
        viewfinder.classList.remove('viewfinder-recording');
        updateStep('stop', 'active');
        if (badge3) badge3.style.display = 'none';
        if (pinInstruction) {
            pinInstruction.style.animation = 'none';
            pinInstruction.style.color = 'rgba(0,230,118,0.9)';
            pinInstruction.innerHTML = '⏳ Processing… See results in the right panel →';
        }
        stopCameraPreview({ freeze: true });
        stopAudioPlayback();
        onStop().then(() => {
            if (pinInstruction) {
                pinInstruction.style.color = 'rgba(0,230,118,0.95)';
                pinInstruction.innerHTML = '✅ Done! Certificate in right panel →';
            }
        }).catch(() => {});
    });

    // ── Step animation ─────────────────────────────────────────────

    function updateStep(stepName, state) {
        const el = stepBar.querySelector(`[data-step="${stepName}"]`);
        if (!el) return;
        // Reset all
        stepBar.querySelectorAll('.phone-step').forEach(s => {
            s.classList.remove('phone-step-active', 'phone-step-done');
        });
        // Mark steps up to and including this one as done
        const allSteps = stepBar.querySelectorAll('.phone-step');
        let found = false;
        allSteps.forEach(s => {
            if (s.dataset.step === stepName) {
                found = true;
                if (state === 'active') s.classList.add('phone-step-active');
                else if (state === 'done') s.classList.add('phone-step-done');
            } else if (!found) {
                s.classList.add('phone-step-done');
            }
        });
    }

    function setAllStepsDone() {
        stepBar.querySelectorAll('.phone-step').forEach(s => {
            s.classList.remove('phone-step-active');
            s.classList.add('phone-step-done');
        });
    }

    // ── Web Audio API playback ─────────────────────────────────────

    function getAudioContext() {
        if (!audioCtx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            audioCtx = new Ctx();
        }
        return audioCtx;
    }

    /**
     * Set the audio buffer for playback.
     * @param {Float32Array} buffer - combined audio buffer
     * @param {number} [sampleRate=44100]
     */
    function setAudioBuffer(buffer, sampleRate = SAMPLE_RATE) {
        currentAudioBuffer = buffer;
        currentSampleRate = sampleRate;
    }

    /**
     * Play the current audio buffer via Web Audio API.
     */
    function playAudio() {
        if (!currentAudioBuffer) return;
        stopAudioPlayback();

        const ctx = getAudioContext();
        const audioBuf = ctx.createBuffer(1, currentAudioBuffer.length, currentSampleRate);
        audioBuf.getChannelData(0).set(currentAudioBuffer);

        audioSource = ctx.createBufferSource();
        audioSource.buffer = audioBuf;
        audioSource.connect(ctx.destination);

        // Fade in/out for pleasant listening
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0, ctx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0.7, ctx.currentTime + currentAudioBuffer.length / currentSampleRate - 0.1);
        gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + currentAudioBuffer.length / currentSampleRate);

        audioSource.disconnect();
        audioSource.connect(gainNode);
        gainNode.connect(ctx.destination);

        audioSource.start(0);
    }

    function stopAudioPlayback() {
        if (audioSource) {
            try { audioSource.stop(); } catch (e) { /* already stopped */ }
            audioSource = null;
        }
    }

    // ── Public API ─────────────────────────────────────────────────

    return {
        /**
         * Update the live status bar.
         * @param {{ bleCount?: number, audioStatus?: string, frameCount?: number }} status
         */
        updateStatus(status) {
            if (status.bleCount !== undefined) {
                statusBle.textContent = status.bleCount + (status.bleCount > 0 ? ' devices' : '—');
            }
            if (status.audioStatus !== undefined) {
                statusAudio.textContent = status.audioStatus;
                statusAudio.style.color = status.audioStatus === 'recording'
                    ? 'var(--fail-color)'
                    : status.audioStatus === 'captured'
                        ? 'var(--pass-color)'
                        : '';
            }
            if (status.frameCount !== undefined) {
                statusFrames.textContent = status.frameCount > 0 ? status.frameCount : '—';
            }
        },

        /**
         * Set the current phase for UI updates.
         * @param {'setup'|'capture'|'dag'|'verify'} phase
         */
        setPhase(phase) {
            switch (phase) {
                case 'setup':
                    updateStep('pin', 'active');
                    break;
                case 'capture':
                    updateStep('key', 'done');
                    updateStep('beacon', 'done');
                    break;
                case 'dag':
                    setAllStepsDone();
                    break;
                case 'verify':
                    setAllStepsDone();
                    break;
            }
        },

        setRecording(on) {
            isRecording = on;
            if (on) {
                recordingIndicator.classList.add('recording-active');
                recordingPulse.classList.add('pulsing');
                viewfinder.classList.add('viewfinder-recording');
                void startCameraPreview();
            } else {
                recordingIndicator.classList.remove('recording-active');
                recordingPulse.classList.remove('pulsing');
                viewfinder.classList.remove('viewfinder-recording');
                stopCameraPreview({ freeze: true });
            }
        },

        setAudioBuffer,
        playAudio,
        stopAudio: stopAudioPlayback,

        /**
         * Animate a specific step.
         * @param {'pin'|'key'|'beacon'|'capture'|'stop'} step
         */
        animateStep(step) {
            updateStep(step, 'active');
        },

        reset() {
            pinDigits = '';
            isRecording = false;
            isDuress = false;
            updatePinDots();
            recordBtn.disabled = true;
            recordBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
            recordingIndicator.classList.remove('recording-active');
            recordingPulse.classList.remove('pulsing');
            viewfinder.classList.remove('viewfinder-recording');
            duressBtn.classList.remove('keypad-duress-active');
            stepBar.querySelectorAll('.phone-step').forEach(s => {
                s.classList.remove('phone-step-active', 'phone-step-done');
            });
            updateStep('pin', 'active');
            stopCameraPreview();
            stopAudioPlayback();
            currentAudioBuffer = null;
            updateStatus({ bleCount: 0, audioStatus: 'idle', frameCount: 0 });
        },

        destroy() {
            stopCameraPreview();
            stopAudioPlayback();
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) { /* ignore */ }
                audioCtx = null;
            }
        },
    };
}
