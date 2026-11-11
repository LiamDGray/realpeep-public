import { FrameHashChain } from '../src/frameHashChain.js';
import crypto from 'crypto';

describe('FrameHashChain', () => {
  it('should initialize with an empty chain and root', () => {
    const fhc = new FrameHashChain();
    expect(fhc.segments.length).toBe(0);
    expect(fhc.currentSegmentFrames).toBe(0);
  });

  it('should hash frames sequentially', () => {
    const fhc = new FrameHashChain();
    fhc.appendFrame(Buffer.from('frame1'));
    fhc.appendFrame(Buffer.from('frame2'));
    
    expect(fhc.currentSegmentFrames).toBe(2);
    expect(fhc.currentHash).toBeDefined();
  });

  it('should create a segment and compute merkle root with odd number of segments', () => {
    const fhc = new FrameHashChain();
    fhc.appendFrame(Buffer.from('frame1'));
    fhc.finalizeSegment(); // Segment 1
    
    fhc.appendFrame(Buffer.from('frame2'));
    fhc.finalizeSegment(); // Segment 2
    
    fhc.appendFrame(Buffer.from('frame3'));
    fhc.finalizeSegment(); // Segment 3
    
    expect(fhc.segments.length).toBe(3);
    const root = fhc.getMerkleRoot();
    expect(root).toBeDefined();
    expect(typeof root).toBe('string');
  });

  it('should create a segment and compute merkle root with multiple segments', () => {
    const fhc = new FrameHashChain();
    fhc.appendFrame(Buffer.from('frame1'));
    fhc.appendFrame(Buffer.from('frame2'));
    fhc.finalizeSegment(); // Segment 1
    
    fhc.appendFrame(Buffer.from('frame3'));
    fhc.appendFrame(Buffer.from('frame4'));
    fhc.finalizeSegment(); // Segment 2
    
    expect(fhc.segments.length).toBe(2);
    const root = fhc.getMerkleRoot();
    expect(root).toBeDefined();
    expect(typeof root).toBe('string');
  });

  it('detects frame removal', () => {
    const originalFhc = new FrameHashChain();
    originalFhc.appendFrame(Buffer.from('frame1'));
    originalFhc.appendFrame(Buffer.from('frame2'));
    originalFhc.appendFrame(Buffer.from('frame3'));
    originalFhc.finalizeSegment();
    const originalRoot = originalFhc.getMerkleRoot();

    const tamperedFhc = new FrameHashChain();
    tamperedFhc.appendFrame(Buffer.from('frame1'));
    // Frame 2 removed
    tamperedFhc.appendFrame(Buffer.from('frame3'));
    tamperedFhc.finalizeSegment();
    const tamperedRoot = tamperedFhc.getMerkleRoot();

    expect(tamperedRoot).not.toBe(originalRoot);
  });

  it('detects frame insertion', () => {
    const originalFhc = new FrameHashChain();
    originalFhc.appendFrame(Buffer.from('frame1'));
    originalFhc.appendFrame(Buffer.from('frame2'));
    originalFhc.finalizeSegment();
    const originalRoot = originalFhc.getMerkleRoot();

    const tamperedFhc = new FrameHashChain();
    tamperedFhc.appendFrame(Buffer.from('frame1'));
    tamperedFhc.appendFrame(Buffer.from('evil_frame')); // Inserted
    tamperedFhc.appendFrame(Buffer.from('frame2'));
    tamperedFhc.finalizeSegment();
    const tamperedRoot = tamperedFhc.getMerkleRoot();

    expect(tamperedRoot).not.toBe(originalRoot);
  });

  it('detects frame reordering', () => {
    const originalFhc = new FrameHashChain();
    originalFhc.appendFrame(Buffer.from('frame1'));
    originalFhc.appendFrame(Buffer.from('frame2'));
    originalFhc.finalizeSegment();
    const originalRoot = originalFhc.getMerkleRoot();

    const tamperedFhc = new FrameHashChain();
    tamperedFhc.appendFrame(Buffer.from('frame2')); // Swapped
    tamperedFhc.appendFrame(Buffer.from('frame1'));
    tamperedFhc.finalizeSegment();
    const tamperedRoot = tamperedFhc.getMerkleRoot();

    expect(tamperedRoot).not.toBe(originalRoot);
  });

  it('detects truncation', () => {
    const originalFhc = new FrameHashChain();
    originalFhc.appendFrame(Buffer.from('frame1'));
    originalFhc.appendFrame(Buffer.from('frame2'));
    originalFhc.finalizeSegment();
    const originalRoot = originalFhc.getMerkleRoot();

    const tamperedFhc = new FrameHashChain();
    tamperedFhc.appendFrame(Buffer.from('frame1'));
    tamperedFhc.finalizeSegment();
    const tamperedRoot = tamperedFhc.getMerkleRoot();

    expect(tamperedRoot).not.toBe(originalRoot);
  });
});
