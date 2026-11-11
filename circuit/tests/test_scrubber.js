const chai = require("chai");
const path = require("path");
const { wasm: wasm_tester } = require("circom_tester");
const circomlibjs = require("circomlibjs");

const assert = chai.assert;

describe("ZK Identity Scrubber Circuit", function () {
    let circuit;
    let poseidon;
    let eddsa;
    let babyJub;

    before(async function () {
        this.timeout(100000);
        poseidon = await circomlibjs.buildPoseidon();
        babyJub = await circomlibjs.buildBabyjub();
        eddsa = await circomlibjs.buildEddsa();
        
        circuit = await wasm_tester(path.join(__dirname, "..", "scrubber.circom"));
        await circuit.loadSymbols();
    });

    it("should mathematically verify a valid hardware signature and merkle inclusion", async function () {
        this.timeout(60000);
        // 1. Generate Hardware Identity
        const prvKey = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex");
        const pubKey = eddsa.prv2pub(prvKey);
        const Ax = babyJub.F.toObject(pubKey[0]);
        const Ay = babyJub.F.toObject(pubKey[1]);

        // 2. Generate Payload and Signature
        const payloadHashF = poseidon([123456789]);
        const payloadHash = babyJub.F.toObject(payloadHashF);
        const signature = eddsa.signPoseidon(prvKey, payloadHashF);
        const R8x = babyJub.F.toObject(signature.R8[0]);
        const R8y = babyJub.F.toObject(signature.R8[1]);
        const S = signature.S;

        // 3. Generate Merkle Tree (Depth 20)
        // For simplicity in the test, we just hash our pubkey with zeros for the rest of the path
        const leaf = babyJub.F.toObject(poseidon([Ax, Ay]));
        const pathElements = Array(20).fill(0);
        const pathIndices = Array(20).fill(0); // 0 means left, so we hash H(leaf, 0)
        
        let currentHash = leaf;
        for (let i = 0; i < 20; i++) {
            currentHash = babyJub.F.toObject(poseidon([currentHash, pathElements[i]]));
        }
        const merkleRoot = currentHash;

        // 4. Run Circuit constraints
        const input = {
            payload_hash: payloadHash,
            ephemeral_pubkey: 999999999, // Random dummy public key
            authorized_merkle_root: merkleRoot,
            tee_pubkey_x: Ax,
            tee_pubkey_y: Ay,
            tee_sig_Rx: R8x,
            tee_sig_Ry: R8y,
            tee_sig_S: S,
            merkle_path_elements: pathElements,
            merkle_path_indices: pathIndices
        };

        const witness = await circuit.calculateWitness(input, true);
        await circuit.checkConstraints(witness);
    });

    it("should fail if the hardware signature is invalid", async function () {
        const prvKey = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex");
        const pubKey = eddsa.prv2pub(prvKey);
        const Ax = babyJub.F.toObject(pubKey[0]);
        const Ay = babyJub.F.toObject(pubKey[1]);

        const payloadHashF = poseidon([123456789]);
        const payloadHash = babyJub.F.toObject(payloadHashF);
        const signature = eddsa.signPoseidon(prvKey, payloadHashF);
        
        // INVALIDATE SIGNATURE
        const S = signature.S + 1n; // Add 1 to corrupt the signature

        const leaf = babyJub.F.toObject(poseidon([Ax, Ay]));
        const pathElements = Array(20).fill(0);
        const pathIndices = Array(20).fill(0);
        let currentHash = leaf;
        for (let i = 0; i < 20; i++) currentHash = babyJub.F.toObject(poseidon([currentHash, pathElements[i]]));

        const input = {
            payload_hash: payloadHash,
            ephemeral_pubkey: 999999999,
            authorized_merkle_root: currentHash,
            tee_pubkey_x: Ax,
            tee_pubkey_y: Ay,
            tee_sig_Rx: babyJub.F.toObject(signature.R8[0]),
            tee_sig_Ry: babyJub.F.toObject(signature.R8[1]),
            tee_sig_S: S,
            merkle_path_elements: pathElements,
            merkle_path_indices: pathIndices
        };

        try {
            await circuit.calculateWitness(input, true);
            assert.fail("Circuit should have failed constraints");
        } catch (e) {
            assert.include(e.message, "Assert Failed");
        }
    });

    it("should fail if the hardware identity is not in the Merkle Tree", async function () {
        const prvKey = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex");
        const pubKey = eddsa.prv2pub(prvKey);
        
        const payloadHashF = poseidon([123456789]);
        const payloadHash = babyJub.F.toObject(payloadHashF);
        const signature = eddsa.signPoseidon(prvKey, payloadHashF);

        const pathElements = Array(20).fill(0);
        const pathIndices = Array(20).fill(0);
        
        // CORRUPT MERKLE ROOT
        const wrongRoot = 12345;

        const input = {
            payload_hash: payloadHash,
            ephemeral_pubkey: 999999999,
            authorized_merkle_root: wrongRoot,
            tee_pubkey_x: babyJub.F.toObject(pubKey[0]),
            tee_pubkey_y: babyJub.F.toObject(pubKey[1]),
            tee_sig_Rx: babyJub.F.toObject(signature.R8[0]),
            tee_sig_Ry: babyJub.F.toObject(signature.R8[1]),
            tee_sig_S: signature.S,
            merkle_path_elements: pathElements,
            merkle_path_indices: pathIndices
        };

        try {
            await circuit.calculateWitness(input, true);
            assert.fail("Circuit should have failed constraints");
        } catch (e) {
            assert.include(e.message, "Assert Failed");
        }
    });
});
