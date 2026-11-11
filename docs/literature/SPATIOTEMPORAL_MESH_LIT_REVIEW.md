# Spatio-Temporal Hash-Linked Mesh: Literature Review

July 2026

## 1. Problem Statement

Proving that multiple devices were physically co-located at the same time is a
harder problem than proving either property individually. The RealPeep
spatio-temporal mesh addresses this by requiring each beacon to carry:

1. A hash of the device's own previous beacon (**self-chain**)
2. A Merkle root of the latest beacons heard from all neighbors (**cross-chain**)
3. An external time anchor (**NIST randomness beacon pulse**)

Together these form a verifiable directed acyclic graph through time. This
review surveys prior systems that use similar hash-linking across multiple
participants, assesses RealPeep's novelty, and identifies citable precedents.

## 2. DAG-Based Consensus Protocols

### 2.1 Hashgraph (Baird, 2016)

**Hedera Hashgraph** is the most cited DAG-based consensus protocol. It uses
"gossip about gossip": each node, when it transmits, includes (a) the hash of
its own previous event, and (b) the hash of the latest event it received from
another node. This creates a DAG where vertices are events and edges are
hash-references. Virtual voting then determines consensus ordering without
proof-of-work.

**Similarities to RealPeep:**
- Self-chain: each event hashes its creator's prior event ✅
- Cross-chain: each event hashes the latest received event from another node ✅
- DAG structure: events form a directed acyclic graph ✅

**Differences:**
- Hashgraph operates at the **consensus layer** (ordering transactions), not
  the physical beacon layer (proving physical co-location).
- Hashgraph requires **online participation** (live gossip + virtual voting).
  RealPeep is offline-first.
- Hashgraph nodes have **persistent identities** (stake-weighted). RealPeep
  uses ephemeral anonymous keys.
- Hashgraph events carry **transaction payloads**. RealPeep beacons carry
  **physical evidence** (NIST time anchor, proximity data).
- Hashgraph's cross-chain references are **full hashes** (one per neighbor).
  RealPeep uses a **Merkle root** to bound advertisement size.

**Citation:** Baird, L. "The Swirlds Hashgraph Consensus Algorithm: Fair, Fast,
Byzantine Fault Tolerance." Swirlds Tech Report, 2016.

### 2.2 IOTA Tangle (Popov, 2018)

The Tangle is a DAG where each transaction references two prior transactions
(tips). Unlike Hashgraph's node-centric model, the Tangle is transaction-centric:
any participant can issue a transaction by validating two prior ones.

**Similarities:**
- Cross-chain: each transaction references two prior transactions ✅
- DAG structure ✅

**Differences:**
- No self-chain (transactions don't chain from the same issuer).
- Tip selection is probabilistic (Markov Chain Monte Carlo), not deterministic.
- Designed for **value transfer** (IoT micropayments), not provenance.
- Requires **online** tip selection and confirmation.

**Citation:** Popov, S. "The Tangle." IOTA Whitepaper, 2018.

### 2.3 Cerberus / Radix (2020)

Cerberus is a sharded BFT consensus protocol for the Radix DLT. It uses a
"braided" structure where consensus is achieved across shards via cross-shard
references. Each node maintains a local DAG of events.

**Similarities:** Cross-shard references resemble cross-chain references.

**Differences:** Designed for financial DLT sharding, not physical mesh.
Requires online consensus. Nodes are identified, not anonymous.

### 2.4 Nano / Block Lattice (LeMahieu, 2018)

Nano uses a block-lattice where each account has its own blockchain. Transactions
between accounts create cross-chain edges. Each block references the previous
block in the sender's chain.

**Similarities:**
- Self-chain: each account has its own chain ✅
- Cross-chain: send/receive blocks create edges ✅

**Differences:**
- Designed for **payments**, not provenance.
- Cross-chain edges require **two blocks** (send + receive). RealPeep's
  cross-chain is unilateral (A records hearing B; B doesn't need to ack).
- Nodes are identified by account addresses.

**Citation:** LeMahieu, C. "Nano: A Feeless Distributed Cryptocurrency Network."
Nano Whitepaper, 2018.

## 3. Append-Only Logs with Cross-References

### 3.1 Secure Scuttlebutt (SSB)

SSB is a peer-to-peer protocol where each user maintains an append-only log of
messages, each signed and hash-linked to the previous. Users "follow" each
other, creating a social graph of cross-references.

**Similarities:**
- Self-chain: each message hashes the previous ✅
- Cross-chain: follows create edges between users' logs ✅
- Offline-capable (gossip-based synchronization) ✅

**Differences:**
- Operates at the **social layer** (messages, posts), not the physical layer.
- Cross-references are explicitly declared (follow relationships), not
  automatically detected (signal presence).
- Identity is pseudonymous but persistent (long-lived keys).
- No external time anchor (relies on local clocks).

**Citation:** Tarr, D. et al. "Secure Scuttlebutt: An Identity-Centric Protocol
for Subjective and Decentralized Applications." FOSDEM, 2019.

### 3.2 Certificate Transparency (Google, 2013)

CT uses Merkle trees to create an append-only log of TLS certificates. Each
entry is hashed into a Merkle tree; the root is published and signed. Monitors
verify consistency proofs between tree states.

**Similarities:**
- Merkle tree for compact inclusion proofs ✅
- Offline-verifiable ✅

**Differences:**
- Single log operator (centralized), not a mesh of independent peers.
- No self-chain or cross-chain between independent participants.
- Designed for **web PKI auditing**, not physical co-location.
- Entries are certificates with identified issuers.

**Citation:** Laurie, B. et al. "Certificate Transparency." RFC 6962, 2013.

### 3.3 Key Transparency / CONIKS

CONIKS and Key Transparency extend CT to key directories, where each user's key
is committed in a Merkle tree with consistency proofs.

**Similarities:** Merkle-based inclusion proofs, offline-verifiable.

**Differences:** Single directory operator, not a mesh. No self-chain or
cross-chain between devices.

## 4. Beacon-Based Protocols

### 4.1 CoSi (Collective Signing)

CoSi enables a set of witnesses to collectively sign a statement. A leader
proposes a statement; witnesses cosign it. The resulting signature proves that
a threshold of witnesses saw the statement.

**Similarities:**
- Multi-party attestation ✅
- Witnesses provide collective evidence ✅

**Differences:**
- Requires a leader and online coordination.
- Uses aggregate signatures (not hash chains).
- Witnesses cosign the same statement (not independent chained beacons).
- Identified witnesses (not anonymous).
- No temporal ordering across statements.

**Citation:** Syta, E. et al. "Keeping Authorities 'Honest or Bust' with
Decentralized Witness Cosigning." IEEE S&P, 2016.

### 4.2 BLE Mesh (Bluetooth SIG, 2017)

The Bluetooth Mesh standard uses managed flooding: each node relays messages,
which include a TTL and a sequence number to prevent loops. Messages are
authenticated but not hash-chained.

**Similarities:** Multi-hop mesh of BLE devices.

**Differences:**
- No hash chaining (uses sequence numbers + TTL).
- Requires provisioning (pairing) with a network key — not anonymous.
- Designed for building automation, not provenance.
- Online (requires active mesh participation).

### 4.3 NIST Randomness Beacon

The NIST Randomness Beacon publishes a 512-bit random value every 60 seconds,
signed by NIST. It provides an external, verifiable time anchor that any
protocol can reference.

**Similarities:** External time anchor (used by RealPeep).

**Differences:** Not a mesh protocol — it's a single time service. RealPeep
uses it as a component, not the full protocol.

**Citation:** Kelsey, J. et al. "A Reference for Randomness Beacons." NIST, 2019.

## 5. Gap Analysis: RealPeep's Novelty

After surveying DAG-based consensus (Hashgraph, IOTA, Cerberus, Nano),
append-only logs (SSB, CT, CONIKS), and beacon protocols (CoSi, BLE Mesh, NIST),
**no existing system combines all six properties** at the physical beacon layer:

| Property | Hashgraph | SSB | IOTA | CT | CoSi | RealPeep |
|----------|-----------|-----|------|-----|------|----------|
| Self-chain (prev_self) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Cross-chain (heard neighbors) | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Physical-layer beacons | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Anonymous ephemeral keys | ❌ | ⚠️ | ⚠️ | ❌ | ❌ | ✅ |
| Offline-verifiable | ❌ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ |
| External time anchor | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Merkle root for bounded size | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |

**RealPeep's novel contributions:**

1. **Physical-layer DAG.** Hashgraph and SSB do hash-linking at the consensus
   or social layer. RealPeep is the first to do it at the physical beacon layer,
   where the "cross-chain" edge is proven by actual radio/acoustic/optical
   reception, not declared consensus.

2. **Merkle root of heard beacons.** Hashgraph transmits full hashes of all
   heard events. RealPeep's Merkle root bounds advertisement size to 32 bytes
   regardless of neighbor count, critical for BLE's 255-byte limit.

3. **External time anchor at beacon level.** NIST randomness beacon pulses
   bracket each beacon within ±60 seconds of wall-clock time. No prior mesh
   protocol uses external time anchoring at the individual beacon level
   (they either use local clocks or consensus-based ordering).

4. **Anonymous ephemeral keys.** The DAG proves temporal ordering between
   anonymous participants. Hashgraph and SSB use persistent identities;
   RealPeep's ephemeral keys prove "a device that was in the room" without
   revealing which device.

5. **"Commit Now, Compute Later" for DAG reconstruction.** The entire DAG is
   reconstructed offline by a verifier from uploaded bundles. Prior DAG systems
   (Hashgraph, IOTA) require online participation during DAG construction.

## 6. Patent Landscape

**Search methodology:** Google Patents and USPTO searched for combinations of:
"hash chain beacon mesh," "temporal hash linked mesh," "beacon chain DAG
attestation," "linked advertisement blockchain mesh," "BLE hash chain
advertisement."

**Results:** No patents found covering the combination of self-chain +
cross-chain + external time anchor at the physical beacon layer. The closest
patents cover:

- **BLE mesh networking** (flooding, relay, TTL-based) — no hash chaining
- **Blockchain-based attestation** (supply chain, IoT) — no physical beacons
- **Hashgraph-style consensus** — consensus layer, not physical layer
- **Certificate Transparency** — single log, not mesh

None of these cover the specific combination of properties that RealPeep's
spatio-temporal mesh requires.

## 7. Recommended Citations

For a RealPeep paper, cite these as related work (establishing the landscape
while distinguishing RealPeep's contributions):

| Citation | Relevance |
|----------|-----------|
| Baird, "Hashgraph Consensus" (2016) | Closest DAG structure; differs in layer, anonymity, offline verification |
| Tarr et al., "Secure Scuttlebutt" (2019) | Append-only log with cross-references; differs in physical layer |
| Popov, "The Tangle" (2018) | DAG with cross-references; differs in purpose and anonymity |
| Syta et al., "CoSi" (IEEE S&P 2016) | Witness cosigning; differs in chaining mechanism |
| Laurie et al., "Certificate Transparency" (RFC 6962) | Merkle tree for inclusion proofs; single log vs. mesh |
| Kelsey et al., "NIST Randomness Beacon" (2019) | External time anchor used by RealPeep |
