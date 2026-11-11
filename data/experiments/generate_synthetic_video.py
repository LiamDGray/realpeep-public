import os
import argparse
import json
import numpy as np
from PIL import Image, ImageDraw

def generate_video(output_dir: str, num_frames: int, lag_frames: int, seed: int = 42):
    os.makedirs(output_dir, exist_ok=True)
    rng = np.random.default_rng(seed)
    
    # 1. Generate the Cryptographic Challenge Sequence
    # A random sequence of 1s (bright) and 0s (dim)
    challenge_sequence = rng.integers(0, 2, size=num_frames).tolist()
    
    # Save the challenge sequence for the verifier
    with open(os.path.join(output_dir, "challenge.json"), "w") as f:
        json.dump(challenge_sequence, f)

    print(f"Generating {num_frames} frames in '{output_dir}/' with {lag_frames} frames of simulated rendering lag...")

    width, height = 64, 64
    
    # 2. Render each frame
    for i in range(num_frames):
        img = Image.new("L", (width, height), color=20) # Dark gray background
        draw = ImageDraw.Draw(img)
        
        # Draw a crude face
        draw.ellipse([10, 10, 54, 54], fill=80)
        
        # The Cornea (Region of Interest)
        cornea_bbox = [20, 20, 28, 28]
        
        # Calculate reflection brightness based on lag
        reflection_idx = i - lag_frames
        
        if reflection_idx >= 0 and reflection_idx < num_frames:
            # 1 = 200 (bright reflection), 0 = 100 (dim reflection)
            brightness = 200 if challenge_sequence[reflection_idx] == 1 else 100
        else:
            brightness = 100
            
        # Add a tiny bit of physical sensor noise
        brightness += int(rng.normal(0, 5))
        brightness = max(0, min(255, brightness))
        
        # Draw the cornea with the calculated brightness
        draw.ellipse(cornea_bbox, fill=brightness)
        
        # Save frame
        img.save(os.path.join(output_dir, f"frame_{i:04d}.png"))
        
    print("Generation complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic SPCI frames.")
    parser.add_argument("--output-dir", type=str, default="frames_out")
    parser.add_argument("--frames", type=int, default=90, help="Number of frames (e.g. 3 seconds at 30fps)")
    parser.add_argument("--lag-frames", type=int, default=0, help="Simulated deepfake rendering latency in frames")
    args = parser.parse_args()
    
    generate_video(args.output_dir, args.frames, args.lag_frames)
