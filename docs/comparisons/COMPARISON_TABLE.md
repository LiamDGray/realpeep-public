# RealPeep — Technology Comparison Table

| Feature | **RealPeep** | **C2PA** | **Birthmark Standard** | **Truepic** | **OpenTimestamps** | **Keybase** |
|---------|:-----------:|:--------:|:----------------------:|:-----------:|:-----------------:|:----------:|
| **Hardware Root of Trust** | ✅ Secure Enclave (TEE) signature | ✅ Device signing key | ✅ PRNU/NUC sensor fingerprint | ✅ Signed at capture | ❌ | ❌ |
| **Identity Scrubbing (ZK)** | ✅ Circom circuit removes device PII | ❌ Metadata contains device ID | ✅ Key table anonymity set ≥1000 | ❌ | ❌ | ❌ |
| **Liveness Detection** | ✅ CME + SPCI + HCSJ (physics-based) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Offline Mesh Consensus** | ✅ Acoustic CDMA (18–22 kHz) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Frame-level Hash Chain** | ✅ SHA-256 per frame → Merkle tree | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Blockchain Anchor** | ⏳ Planned (Bitcoin/Ethereum) | ❌ | ✅ Consortium blockchain | ❌ | ✅ Bitcoin OP_RETURN | ❌ |
| **Duress Protocol** | ✅ Indistinguishable passphrases | ❌ | ❌ | ❌ | ❌ | ✅ Ephemeral proofs |
| **Steganographic Storage** | ⏳ Planned (5 hiding patterns) | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Survives Metadata Strip** | ✅ Proof is separate from media file | ❌ Metadata embedded in file | ✅ Anchored to blockchain | ❌ | ✅ (anchor pointer survives) | ❌ |
| **Publicly Verifiable** | ✅ Anyone with proof + verifier | ✅ But key distribution is opaque | ✅ Via consortium chain validators | ❌ Proprietary | ✅ Bitcoin full node | ❌ |
| **Device Anonymity** | ✅ ZK scrubbing — no device ID in proof | ❌ Signing key can be traced via CRL | ✅ Key-table anonymity set | ❌ | N/A | ✅ Ephemeral signing keys |
| **Multi-Witness Co-location** | ✅ **Unique to RealPeep** | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Mobile App** | ⏳ Planned | ✅ SDK available | ⏳ Raspberry Pi prototype | ✅ iOS + Android apps | ✅ API access | ✅ App available |
| **Production Readiness** | ❌ Prototype/architecture | ✅ Industry standard v2.1 | ✅ Full auth spec + verifier tool | ✅ Commercial product | ✅ Production service | ✅ Production |
| **Open Source** | ✅ Apache 2.0 | ✅ Specification + reference impl | ✅ Publicly specified | ❌ | ✅ AGPL | ❌ Core is proprietary |
| **Anchoring Finality** | ⏳ PoW/PoS finality | ❌ No chain anchor | ✅ Voting-based consortium | ❌ | ✅ PoW finality (Bitcoin) | ❌ |

## Legend
- ✅ = Feature is implemented or inherently supported
- ⏳ = Feature is planned / in roadmap
- ❌ = Feature is absent or architecturally impossible

## Key Insights

**RealPeep's unique advantages:**
1. **Physical co-location proof** — No other system proves that devices were in the same room at the same time
2. **Full-stack provenance** — ZK (identity) → Liveness (physics) → Mesh (co-location) → Hash chain (integrity) → Blockchain (anchoring)
3. **Duress-resistance** — The only provenance architecture with built-in coercion signaling
4. **Truly anonymous** — Zero-knowledge proof strips all device identity; no key table to subpoena

**Where RealPeep trails incumbents:**
1. **No production mobile app** — Truepic and C2PA SDKs already ship on millions of devices
2. **No blockchain anchor yet** — Birthmark Standard already publishes to consortium chain
3. **No real-time audio hardware integration** — Everything is simulated in Python/JS
4. **No formal security audit** — C2PA has been reviewed by multiple security firms
