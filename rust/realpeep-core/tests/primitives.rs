use realpeep_core::duress::{compute_tag, tag_satisfies_test_predicate, TAG_LEN};
use realpeep_core::hash_chain::HashChain;
use realpeep_core::merkle::merkle_root;
use realpeep_core::sha256;
use realpeep_core::transcript::{
    CaptureTranscript, TRANSCRIPT_DOMAIN, TRANSCRIPT_ENCODING_VERSION,
};
use realpeep_core::Hash32;

fn filled(byte: u8) -> Hash32 {
    [byte; 32]
}

fn transcript() -> CaptureTranscript {
    CaptureTranscript::new(filled(0x11), filled(0x22), filled(0x33), 1_700_000_000, 1)
}

fn hash_pair(left: &Hash32, right: &Hash32) -> Hash32 {
    let mut input = Vec::with_capacity(64);
    input.extend_from_slice(left);
    input.extend_from_slice(right);
    sha256(&input)
}

// Known SHA-256 test vectors from FIPS 180-4 / NIST examples.
#[test]
fn sha256_known_vectors() {
    assert_eq!(
        hex::encode(sha256(b"")),
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" // pragma: allowlist secret
    );
    assert_eq!(
        hex::encode(sha256(b"abc")),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad" // pragma: allowlist secret
    );
    assert_eq!(
        hex::encode(sha256(
            b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"
        )),
        "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1" // pragma: allowlist secret
    );
}

#[test]
fn merkle_empty_tree_is_all_zero() {
    assert_eq!(merkle_root(&[]), [0u8; 32]);
}

#[test]
fn merkle_single_leaf_is_the_leaf() {
    let leaf = filled(0x01);
    assert_eq!(merkle_root(&[leaf]), leaf);
}

#[test]
fn merkle_pair_hashes_the_concatenation() {
    let left = filled(0x01);
    let right = filled(0x02);
    assert_eq!(merkle_root(&[left, right]), hash_pair(&left, &right));
    assert_eq!(
        hex::encode(merkle_root(&[left, right])),
        "f818afd37a6dc3bc92fb44731011277006db4efa6e9023cd7468c02335d22a4d" // pragma: allowlist secret
    );
}

#[test]
fn merkle_duplicates_the_last_leaf_at_each_odd_level() {
    let leaves = [filled(0x01), filled(0x02), filled(0x03)];
    let left = hash_pair(&leaves[0], &leaves[1]);
    let right = hash_pair(&leaves[2], &leaves[2]);
    let expected = hash_pair(&left, &right);

    assert_eq!(merkle_root(&leaves), expected);
    assert_eq!(
        merkle_root(&leaves),
        merkle_root(&[leaves[0], leaves[1], leaves[2], leaves[2]])
    );
    assert_eq!(
        hex::encode(merkle_root(&leaves)),
        "831e18b32b5392c031f24c715086821d7532fcb6cac0bb815a1a647990cff261" // pragma: allowlist secret
    );
}

#[test]
fn merkle_duplicate_last_vector_for_five_leaves() {
    let leaves: Vec<Hash32> = (1u8..=5).map(filled).collect();
    let mut duplicated = leaves.clone();
    duplicated.push(*duplicated.last().expect("non-empty"));

    assert_eq!(merkle_root(&leaves), merkle_root(&duplicated));
    assert_eq!(
        hex::encode(merkle_root(&leaves)),
        "f632ed650b4b2c467228719df716e74232b7293f997e481489bd172e73473a77" // pragma: allowlist secret
    );
}

#[test]
fn hash_chain_genesis_is_thirty_two_zero_bytes() {
    let chain = HashChain::new();
    assert_eq!(chain.head(), [0u8; 32]);
    assert_eq!(chain.count(), 0);
    assert!(chain.frame_hashes().is_empty());
}

#[test]
fn hash_chain_first_frame_has_a_known_vector() {
    let mut chain = HashChain::new();
    let first = chain.append(b"");
    assert_eq!(
        hex::encode(first),
        "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" // pragma: allowlist secret
    );
}

#[test]
fn hash_chain_sequence_has_known_vectors_and_updates_head() {
    let mut chain = HashChain::new();
    assert_eq!(
        hex::encode(chain.append(b"")),
        "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925" // pragma: allowlist secret
    );
    assert_eq!(
        hex::encode(chain.append(b"frame-1")),
        "2ae18d945d9be3a2c8f38a796739b3febdc1a51ec3e34dce0a240d57930f5ba4" // pragma: allowlist secret
    );
    let third = chain.append(b"frame-2");
    assert_eq!(
        hex::encode(third),
        "175adccfc65130327a53828058860b415f315ed6e7da67fdb4b7533bf4ed5eb7" // pragma: allowlist secret
    );
    assert_eq!(chain.count(), 3);
    assert_eq!(chain.head(), third);
}

#[test]
fn hash_chain_order_matters() {
    let mut forward = HashChain::new();
    forward.append(b"frame-a");
    forward.append(b"frame-b");

    let mut reverse = HashChain::new();
    reverse.append(b"frame-b");
    reverse.append(b"frame-a");

    assert_ne!(forward.head(), reverse.head());
    assert_ne!(forward.merkle_root(), reverse.merkle_root());
}

#[test]
fn hash_chain_merkle_root_matches_generic_merkle_tree() {
    let mut chain = HashChain::new();
    for frame in [b"frame-a", b"frame-b", b"frame-c"] {
        chain.append(frame);
    }

    assert_eq!(chain.merkle_root(), merkle_root(chain.frame_hashes()));
    assert_eq!(chain.count(), chain.frame_hashes().len());
    assert_eq!(
        chain.merkle_root(),
        HashChain::from_frames([b"frame-a", b"frame-b", b"frame-c"]).merkle_root()
    );
}

#[test]
fn hash_chain_reset_restores_genesis() {
    let mut chain = HashChain::new();
    chain.append(b"frame-a");
    chain.append(b"frame-b");
    assert_eq!(chain.count(), 2);

    chain.reset();
    assert_eq!(chain.count(), 0);
    assert_eq!(chain.head(), [0u8; 32]);
    assert_eq!(chain.merkle_root(), [0u8; 32]);
    assert_eq!(
        chain.append(b"frame-a"),
        HashChain::from_frames([b"frame-a"]).head()
    );
}

#[test]
fn transcript_exact_serialization_vector() {
    assert_eq!(
        hex::encode(transcript().encode()),
        "5245414c504545502d5452414e53435249505400010000000c7061796c6f61645f6861736800000020111111111111111111111111111111111111111111111111111111111111111100000010657068656d6572616c5f7075626b65790000002022222222222222222222222222222222222222222222222222222222222222220000000b6d65726b6c655f726f6f740000002033333333333333333333333333333333333333333333333333333333333333330000000974696d657374616d7000000008000000006553f1000000001070726f746f636f6c5f76657273696f6e000000020001" // pragma: allowlist secret
    );
}

#[test]
fn transcript_hash_has_a_known_vector() {
    assert_eq!(
        hex::encode(transcript().hash()),
        "9e42f156cca24d79c8ed58c73ec2c399d15fcd665add3553bbdbcce41a8f49e9" // pragma: allowlist secret
    );
}

#[test]
fn transcript_is_domain_separated_and_versioned() {
    let encoded = transcript().encode();
    assert!(encoded.starts_with(TRANSCRIPT_DOMAIN));
    let version_offset = TRANSCRIPT_DOMAIN.len();
    assert_eq!(
        u16::from_be_bytes([encoded[version_offset], encoded[version_offset + 1]]),
        TRANSCRIPT_ENCODING_VERSION
    );
    assert_ne!(transcript().hash(), sha256(&encoded[version_offset + 2..]));
}

#[test]
fn transcript_changes_when_any_field_is_tampered_with() {
    let base = transcript();
    let base_hash = base.hash();

    let mut payload = base.clone();
    payload.payload_hash[31] ^= 1;
    let mut pubkey = base.clone();
    pubkey.ephemeral_pubkey[31] ^= 1;
    let mut merkle = base.clone();
    merkle.merkle_root[31] ^= 1;
    let mut timestamp = base.clone();
    timestamp.timestamp += 1;
    let mut protocol = base.clone();
    protocol.protocol_version += 1;

    for changed in [payload, pubkey, merkle, timestamp, protocol] {
        assert_ne!(changed.hash(), base_hash);
        assert_ne!(changed.encode(), base.encode());
    }
}

#[test]
fn transcript_field_order_and_field_kinds_are_bound() {
    let mut a = transcript();
    a.ephemeral_pubkey = filled(0x33);
    a.merkle_root = filled(0x22);

    let mut b = transcript();
    b.ephemeral_pubkey = filled(0x22);
    b.merkle_root = filled(0x33);

    assert_ne!(a.encode(), b.encode());
    assert_ne!(a.hash(), b.hash());
}

#[test]
fn duress_tag_has_a_known_hmac_vector_and_is_32_bytes() {
    let key = b"notary-test-key";
    let transcript_hash = filled(0x42);
    let tag = compute_tag(key, &transcript_hash);

    assert_eq!(tag.len(), TAG_LEN);
    assert_eq!(TAG_LEN, 32);
    assert_eq!(
        hex::encode(tag),
        "346cd88e88183a34a123206a8daff3e6876552e32fdbe1e3e0c12e1c0809f730" // pragma: allowlist secret
    );
}

#[test]
fn duress_tag_binds_the_key_and_transcript_hash() {
    let transcript_a = transcript();
    let mut transcript_b = transcript_a.clone();
    transcript_b.timestamp += 1;

    let tag = compute_tag(b"notary-key", &transcript_a.hash());
    assert_eq!(tag, compute_tag(b"notary-key", &transcript_a.hash()));
    assert_ne!(tag, compute_tag(b"other-key", &transcript_a.hash()));
    assert_ne!(tag, compute_tag(b"notary-key", &transcript_b.hash()));
}

#[test]
fn duress_test_predicate_checks_the_first_32_bits() {
    assert!(tag_satisfies_test_predicate(&[0u8; 32]));

    let mut tag = [0u8; 32];
    tag[4] = 1;
    assert!(tag_satisfies_test_predicate(&tag));

    tag[3] = 1;
    assert!(!tag_satisfies_test_predicate(&tag));

    assert!(!tag_satisfies_test_predicate(&compute_tag(
        b"notary-key",
        &transcript().hash()
    )));
}
