#!/usr/bin/env python3
import json
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from experiments.atof import SecureEnclaveAudioController, PhysicalAcousticChannel, AcousticDigitalInjector, AToFVerifier

def print_section_header(title: str):
    print("\n" + "=" * 80)
    print(f" {title.upper()} ")
    print("=" * 80)

def main():
    # Hardware sample rate: 48 kHz (professional audio standard)
    sample_rate_hz = 48000.0
    
    # Instantiate the components
    enclave = SecureEnclaveAudioController(sample_rate_hz=sample_rate_hz)
    channel = PhysicalAcousticChannel(sample_rate_hz=sample_rate_hz)
    verifier = AToFVerifier(sample_rate_hz=sample_rate_hz)
    
    # Configure the attacker: low-latency 64-sample buffer, ultra-fast 5.0ms AI processing delay
    buffer_size = 64
    computation_delay_ms = 5.0
    attacker = AcousticDigitalInjector(
        sample_rate_hz=sample_rate_hz,
        computation_delay_ms=computation_delay_ms,
        buffer_size_samples=buffer_size
    )
    
    # Set the physical parameters
    face_distance_m = 0.30  # 30 cm (typical smartphone selfie distance)
    
    print_section_header("Acoustic Time-of-Flight (AToF) Hardware Loopback Simulation")
    print("Physical Parameters:")
    print(f"  - Target Face Distance: {face_distance_m*100.0:.1f} cm")
    print("  - Speed of Sound in Air: 343.0 m/s")
    print(f"  - Expected Round-Trip Time-of-Flight (ToF): {(2.0 * face_distance_m / 343.0)*1000.0:.3f} ms\n")
    
    print("Attacker Parameters (Digital Injection Loop):")
    print(f"  - Hardware Audio Buffer: {buffer_size} samples at {sample_rate_hz/1000.0:.1f} kHz")
    print(f"  - Single-Buffer Latency: {(buffer_size/sample_rate_hz)*1000.0:.3f} ms")
    print(f"  - Input + Output Buffer Delay: {(2.0 * buffer_size/sample_rate_hz)*1000.0:.3f} ms")
    print(f"  - Neural AI Processing & Detection Delay: {computation_delay_ms:.1f} ms")
    print(f"  - Minimum Attacker Injection Latency: {attacker.calculate_attacker_latency_ms():.3f} ms\n")
    
    # Generate the near-ultrasonic challenge chirp (18 kHz - 22 kHz, 10ms duration)
    sent_chirp = enclave.generate_chirp()
    
    # -------------------------------------------------------------------------
    # Scenario A: Genuine Physical Presence
    # -------------------------------------------------------------------------
    # Sound propagates through physical air, reflecting off the 3D face at 30cm
    received_physical = channel.propagate(sent_chirp, face_distance_m=face_distance_m)
    
    # Secure enclave measures the delay of the primary peak via matched filtering
    delay_physical_ms = enclave.measure_delay_ms(sent_chirp, received_physical)
    
    # Verifier performs the temporal bracket audit
    audit_physical = verifier.verify_temporal_bracket(delay_physical_ms, face_distance_m)
    
    # -------------------------------------------------------------------------
    # Scenario B: Digital Injection Attack (Ray-Traced Spoof)
    # -------------------------------------------------------------------------
    # Attacker intercepts the chirp and attempts to synthesize the correct reflection
    # of a face at 30cm. However, their digital pipeline adds buffer and CPU delays.
    received_spoofed = attacker.generate_spoofed_echo(sent_chirp, target_face_distance_m=face_distance_m)
    
    # Secure enclave measures the delay of the spoofed peak
    delay_spoofed_ms = enclave.measure_delay_ms(sent_chirp, received_spoofed)
    
    # Verifier performs the temporal bracket audit
    audit_spoofed = verifier.verify_temporal_bracket(delay_spoofed_ms, face_distance_m)
    
    # Print detailed audit report
    print_section_header("Cryptographic & Physical Audits")
    
    print("-" * 80)
    print("Scenario A: Genuine Physical Presence")
    print("-" * 80)
    print(f"  VERIFIER DECISION: {'[APPROVED]' if audit_physical['passed'] else '[REJECTED]'}")
    print(f"  Measured Echo Arrival: {audit_physical['measured_delay_ms']:.3f} ms")
    print(f"  Expected Echo Arrival: {audit_physical['expected_delay_ms']:.3f} ms")
    print(f"  Temporal Offset: {audit_physical['difference_ms']:.3f} ms (Tolerance: +/- {audit_physical['tolerance_ms']:.2f} ms)")
    print(f"  Audit Log: {audit_physical['reason']}\n")
    
    print("-" * 80)
    print("Scenario B: Digital Injection Attack (Ray-Traced Spoof)")
    print("-" * 80)
    print(f"  VERIFIER DECISION: {'[APPROVED]' if audit_spoofed['passed'] else '[REJECTED]'}")
    print(f"  Measured Echo Arrival: {audit_spoofed['measured_delay_ms']:.3f} ms")
    print(f"  Expected Echo Arrival: {audit_spoofed['expected_delay_ms']:.3f} ms")
    print(f"  Temporal Offset: {audit_spoofed['difference_ms']:.3f} ms (Tolerance: +/- {audit_spoofed['tolerance_ms']:.2f} ms)")
    print(f"  Audit Log: {audit_spoofed['reason']}\n")
    
    # Save audit log
    summary = {
        "genuine_physical_presence": audit_physical,
        "digital_injection_attack": audit_spoofed
    }
    
    with open("atof_audit_log.json", "w") as f:
        json.dump(summary, f, indent=4)
    print("Acoustic audit log written to atof_audit_log.json")

if __name__ == "__main__":
    main()
