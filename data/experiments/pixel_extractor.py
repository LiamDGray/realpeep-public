import os
import json
import numpy as np
from PIL import Image
import sys

# Ensure we can import realpeep
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from realpeep.spci import SPCIVerifier  # noqa: E402

def extract_and_verify(input_dir: str):
    print(f"Loading challenge and frames from '{input_dir}/'...")
    
    # 1. Load Challenge Sequence
    with open(os.path.join(input_dir, "challenge.json"), "r") as f:
        challenge_sequence = np.array(json.load(f), dtype=float)
        
    num_frames = len(challenge_sequence)
    reflection_sequence = np.zeros(num_frames, dtype=float)
    
    # 2. Pixel Extraction Pipeline
    cornea_bbox = [20, 20, 28, 28] # [x0, y0, x1, y1]
    
    for i in range(num_frames):
        img_path = os.path.join(input_dir, f"frame_{i:04d}.png")
        if not os.path.exists(img_path):
            print(f"Error: Missing frame {i}")
            return
            
        img = Image.open(img_path)
        img_arr = np.array(img)
        
        # Extract the region of interest (cornea)
        x0, y0, x1, y1 = cornea_bbox
        cornea_pixels = img_arr[y0:y1, x0:x1]
        
        # Calculate mean luminance
        mean_luminance = np.mean(cornea_pixels)
        reflection_sequence[i] = mean_luminance
        
    print("Pixel extraction complete.")
    
    # 3. Verification Math
    # At 30fps, 1 frame = ~33.3ms. 
    # Let's set max_latency to 40ms. (1 frame lag will fail if we want strict, or we can say 50ms to allow 1 frame lag).
    # Since we want to catch a 2-frame lag (66ms), let's set max_latency to 50.0ms.
    verifier = SPCIVerifier(sample_rate_hz=30.0, max_latency_ms=50.0, min_correlation=0.6)
    
    result = verifier.verify(challenge_sequence, reflection_sequence)
    
    print("\n" + "="*40)
    print(" SPCI VERIFICATION RESULT ")
    print("="*40)
    print(f"DECISION: {'[APPROVED]' if result['passed'] else '[REJECTED]'}")
    print(f"Latency: {result['latency_ms']:.1f} ms")
    print(f"Max Correlation: {result['max_correlation']:.2f}")
    print(f"Reason: {result['reason']}")
    print("========================================\n")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extract pixels and run SPCI verification.")
    parser.add_argument("--input-dir", type=str, default="frames_out")
    args = parser.parse_args()
    
    extract_and_verify(args.input_dir)
