#!/bin/bash
# Check if circuit source is newer than committed artifacts
# Called from pre-commit hook

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "$(dirname "$0")/../..")

if [ "$REPO_ROOT/circuit/scrubber.circom" -nt "$REPO_ROOT/demo/circuit-artifacts/scrubber.wasm" ]; then
    echo "ERROR: circuit/scrubber.circom is newer than demo/circuit-artifacts/scrubber.wasm"
    echo "Run 'just build-circuit' to regenerate artifacts, then commit the updated files."
    exit 1
fi
exit 0
