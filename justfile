# RealPeep — Task Runner
# https://github.com/casey/just

# Default: run all checks
default: check

# ── Full test suite ────────────────────────────────────────────

# Run ALL tests (Python + JS + Circom + lint + e2e)
check: test-py test-js test-circom lint test-e2e
    @echo "✅ All checks passed"

# Python tests (all, with timeout)
test-py:
    REALPEEP_TEST_TIMEOUT=60 python3 -m pytest tests/ -v --tb=short

# Python tests (fast subset, skip network + arms race)
test-py-fast:
    REALPEEP_TEST_TIMEOUT=15 python3 -m pytest tests/ -q --tb=line -k "not blockchain_anchor and not arms_race"

# Python tests (only changed code + dependents, via pytest-testmon)
test-py-smart:
    REALPEEP_TEST_TIMEOUT=60 python3 -m pytest tests/ --testmon -v --tb=short

# JavaScript tests (all)
test-js:
    cd realpeep-js && NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage

# JavaScript tests (only changed, via jest --onlyChanged)
test-js-smart:
    cd realpeep-js && NODE_OPTIONS=--experimental-vm-modules npx jest --no-coverage --onlyChanged

# Circom tests
test-circom:
    cd circuit && NODE_OPTIONS=--experimental-vm-modules npx mocha tests/**/*.js --timeout 120000

# Rust core primitives (hash chain, Merkle, transcript, placeholder duress)
test-rust:
    cd rust/realpeep-core && cargo test

# End-to-End browser tests
test-e2e:
    cd tests && npm run test-e2e

# ── Lint ───────────────────────────────────────────────────────

# Python lint
lint:
    ruff check .

# Auto-fix lint issues
lint-fix:
    ruff check --fix .

# ── Install dependencies ───────────────────────────────────────

# Install all dev dependencies
install:
    python3 -m pip install pytest pytest-testmon numpy bitarray pynacl opentimestamps ruff==0.17.4 cryptography
    cd realpeep-js && npm ci
    cd circuit && npm ci
    cd tests && npm ci

# ── Demo ───────────────────────────────────────────────────────

# Serve demo locally
demo:
    python3 -m http.server 8080 --directory .

# Deploy to Cloudflare Pages (uses local wrangler auth; exports only tracked files via git archive)
deploy:
    #!/usr/bin/env bash
    set -euo pipefail
    TMPDIR=$(mktemp -d /tmp/realpeep-deploy-XXXXXX)
    trap "rm -rf $TMPDIR" EXIT
    git archive HEAD | tar -x -C "$TMPDIR"
    cp wrangler.pages.toml "$TMPDIR/wrangler.toml"
    cd "$TMPDIR" && npx --prefix "$(git rev-parse --show-toplevel)" wrangler pages deploy . \
        --project-name=realpeep --branch=master
    echo "✅ Deployed to https://realpeep.pages.dev"

# ── ZK Circuit ─────────────────────────────────────────────────

# Build ZK circuit artifacts from source
build-circuit:
    @echo "Building ZK circuit: scrubber.circom → WASM + zkey"
    cd circuit && circom scrubber.circom --r1cs --wasm --sym -o build/
    cd circuit && npx snarkjs groth16 setup build/scrubber.r1cs build/pot12_final.ptau build/scrubber_0000.zkey
    cd circuit && echo "dummy contribution for demo" | npx snarkjs zkey contribute build/scrubber_0000.zkey build/scrubber.zkey
    cd circuit && npx snarkjs zkey export verificationkey build/scrubber.zkey build/verification_key.json
    @echo "Copying artifacts to demo/circuit-artifacts/"
    cp circuit/build/scrubber_js/scrubber.wasm demo/circuit-artifacts/scrubber.wasm
    cp circuit/build/scrubber.zkey demo/circuit-artifacts/scrubber.zkey
    cp circuit/build/verification_key.json demo/circuit-artifacts/verification_key.json
    @echo "✅ ZK circuit built. Artifacts committed in demo/circuit-artifacts/"
    @echo "   Run 'git add demo/circuit-artifacts/' to stage the new artifacts."

# Check if circuit artifacts are stale vs source
check-circuit-stale:
    @if [ "circuit/scrubber.circom" -nt "demo/circuit-artifacts/scrubber.wasm" ]; then \
        echo "⚠️  WARNING: circuit/scrubber.circom is newer than demo/circuit-artifacts/scrubber.wasm"; \
        echo "   Run 'just build-circuit' to regenerate artifacts."; \
        exit 1; \
    else \
        echo "✅ Circuit artifacts are up to date."; \
    fi

# ── Git helpers ────────────────────────────────────────────────

# Create feature branch with TDD discipline
feature branch:
    git checkout -b feat/{{branch}}
    @echo "Branch feat/{{branch}} created. Write failing test first."

# Run the full CI replica (install + tests); same as the pre-push hook
pre-push: ci-local

# ── CI targets ─────────────────────────────────────────────────

# Full integration suite (as run in CI)
ci: test-py test-js test-circom lint test-e2e
    @echo "✅ CI suite passed"

# Reproduce GitHub Actions CI locally: checks Python 3.13 + Node 20,
# runs the install step, then the full suite. Use this before pushing.
ci-local:
    @bash scripts/ci-local.sh

# Render the 90-second narrated demo (Kokoro-82M + Playwright + ffmpeg)
record-demo:
    @bash demo/recording/render.sh

# Check GitHub Actions CI Status
check-ci-status:
    gh run view $(gh run list -L 1 --json databaseId -q '.[0].databaseId') --log-failed

# ── Android (platform/android/) ──────────────────────────────

# Build Android debug APK
build-android:
    cd platform/android && ./gradlew assembleDebug

# Run Android unit tests
test-android:
    cd platform/android && ./gradlew testDebugUnitTest

# Install Android debug APK on device
install-android:
    cd platform/android && ./gradlew installDebug

# Run all Android pre-submit checks
check-android:
    cd platform/android && just check
