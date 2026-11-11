async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class BrowserFrameHashChain {
    constructor() {
        this.segments = [];
        this.currentSegmentFrames = 0;
        this.currentHash = null; // Will be initialized asynchronously
    }

    async init() {
        this.currentHash = await sha256('init');
    }

    async appendFrame(frameData) {
        if (!this.currentHash) await this.init();
        this.currentHash = await sha256(this.currentHash + frameData);
        this.currentSegmentFrames++;
    }

    async finalizeSegment() {
        if (this.currentSegmentFrames > 0) {
            this.segments.push(this.currentHash);
            this.currentSegmentFrames = 0;
            this.currentHash = await sha256(this.currentHash);
        }
    }

    async getMerkleRoot() {
        if (this.segments.length === 0) return null;
        
        let currentLevel = [...this.segments];
        
        while (currentLevel.length > 1) {
            const nextLevel = [];
            for (let i = 0; i < currentLevel.length; i += 2) {
                if (i + 1 < currentLevel.length) {
                    nextLevel.push(await sha256(currentLevel[i] + currentLevel[i+1]));
                } else {
                    nextLevel.push(await sha256(currentLevel[i] + currentLevel[i]));
                }
            }
            currentLevel = nextLevel;
        }
        
        return currentLevel[0];
    }
}

// UI Binding
document.addEventListener('DOMContentLoaded', async () => {
    const fhc = new BrowserFrameHashChain();
    await fhc.init();

    const addFrameBtn = document.getElementById('add-frame-btn');
    const finalizeBtn = document.getElementById('finalize-segment-btn');
    const frameInput = document.getElementById('frame-input');
    const chainLengthDisplay = document.getElementById('chain-length-display');
    const merkleRootDisplay = document.getElementById('merkle-root-display');

    addFrameBtn.addEventListener('click', async () => {
        const data = frameInput.value || 'empty_frame';
        await fhc.appendFrame(data);
        chainLengthDisplay.textContent = fhc.currentSegmentFrames;
        frameInput.value = ''; // clear input
    });

    finalizeBtn.addEventListener('click', async () => {
        await fhc.finalizeSegment();
        const root = await fhc.getMerkleRoot();
        merkleRootDisplay.textContent = root || 'None (Finalize segment first)';
        chainLengthDisplay.textContent = fhc.currentSegmentFrames; // resets to 0
    });
});
