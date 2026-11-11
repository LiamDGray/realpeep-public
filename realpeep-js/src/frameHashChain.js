import crypto from 'crypto';

export class FrameHashChain {
  constructor() {
    this.segments = [];
    this.currentSegmentFrames = 0;
    this.currentHash = crypto.createHash('sha256').update('init').digest('hex');
  }

  appendFrame(frameData) {
    const hash = crypto.createHash('sha256');
    hash.update(this.currentHash);
    hash.update(frameData);
    this.currentHash = hash.digest('hex');
    this.currentSegmentFrames++;
  }

  finalizeSegment() {
    if (this.currentSegmentFrames > 0) {
      this.segments.push(this.currentHash);
      this.currentSegmentFrames = 0;
      // Start a new chain for the next segment using the previous hash
      this.currentHash = crypto.createHash('sha256').update(this.currentHash).digest('hex');
    }
  }

  getMerkleRoot() {
    if (this.segments.length === 0) return null;
    
    let currentLevel = [...this.segments];
    
    while (currentLevel.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          const hash = crypto.createHash('sha256');
          hash.update(currentLevel[i]);
          hash.update(currentLevel[i+1]);
          nextLevel.push(hash.digest('hex'));
        } else {
          // Odd number of nodes, carry over or duplicate. 
          // For simplicity, we just hash it with itself to balance.
          const hash = crypto.createHash('sha256');
          hash.update(currentLevel[i]);
          hash.update(currentLevel[i]);
          nextLevel.push(hash.digest('hex'));
        }
      }
      currentLevel = nextLevel;
    }
    
    return currentLevel[0];
  }
}
