#!/usr/bin/env python3
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from experiments.ztmp import ZTMPVerifier, ZTMPAttackSimulator

def print_section_header(title: str):
    print("\n" + "=" * 80)
    print(f" {title.upper()} ")
    print("=" * 80)

def print_audit_row(check_name: str, passed: bool):
    status = "SUCCESS" if passed else "FAILED"
    print(f"    - {check_name:<30} : [{status}]")

def main():
    verifier = ZTMPVerifier()
    simulator = ZTMPAttackSimulator(seed=42)
    
    print_section_header("Zero-Trust Media Provenance (ZTMP) Security Simulation")
    print("Running cryptographic and spatial audits against advanced attack vectors...\n")
    
    # Run the threat simulation
    simulation_results = simulator.run_simulation(verifier)
    
    scenarios = {
        "authentic_capture": "Scenario A: Authentic Capture (Genuine Human + ZTMP Sensor)",
        "stream_injection": "Scenario B: Stream Injection Attack (Software Bypass)",
        "reprojection_attack": "Scenario C: Re-Projection Attack (2D Screen Deepfake)",
        "replay_attack": "Scenario D: Replay Attack (Session Hijacking)"
    }
    
    summary = {}
    
    for key, title in scenarios.items():
        result = simulation_results[key]
        summary[key] = {
            "passed": result["passed"],
            "status": result["overall_status"],
            "reason": result["reason"]
        }
        
        print("-" * 80)
        print(title)
        print("-" * 80)
        print(f"  AUDIT DECISION: {result['overall_status']}")
        print("  Audit Details:")
        
        checks = result["checks"]
        print_audit_row("Hardware Trust (PKI Directory)", checks["hardware_trust"])
        print_audit_row("Cryptographic Integrity (Signature)", checks["cryptographic_integrity"])
        print_audit_row("Session Freshness (Nonce Match)", checks["session_freshness"])
        print_audit_row("3D Spatial Attestation (Depth)", checks["spatial_attestation"])
        
        if "depth_details" in result:
            depth = result["depth_details"]
            print("  Spatial Metrics:")
            print(f"    - Planar Fit MSE: {depth['planar_mse']:.6f} (Threshold: >0.005000)")
            print(f"    - Center Convexity: {depth['convexity']:.4f} (Threshold: >=0.0500)")
            
        print(f"  Audit Log: {result['reason']}\n")
        
    print_section_header("ZTMP Cryptographic Security Matrix")
    print(f"{'Scenario / Attack Vector':<40} | {'Decision':<10} | {'Root Cause of Mitigation'}")
    print("-" * 110)
    for key, res in summary.items():
        title_short = key.replace("_", " ").title()
        print(f"{title_short:<40} | {res['status']:<10} | {res['reason']}")
        
    # Save the audit log to a local JSON file
    with open("ztmp_audit_log.json", "w") as f:
        json.dump(summary, f, indent=4)
    print("\nCryptographic audit log written to ztmp_audit_log.json")

if __name__ == "__main__":
    main()
