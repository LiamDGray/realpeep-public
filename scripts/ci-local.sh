#!/usr/bin/env bash
#
# Reproduce .github/workflows/ci.yml locally.
#
# GitHub Actions runs:
#   setup-python 3.13 + setup-node 20
#   just install
#   just ci
#
# This script checks the toolchain versions, installs dependencies, and runs the
# same suite. It is intentionally strict about versions by default: a local pass
# on Python 3.12 / Node 22 is not evidence that the Python 3.13 / Node 20 CI job
# will pass. Set CI_LOCAL_ALLOW_VERSION_MISMATCH=1 to override (and expect drift).
#
# Usage:
#   just ci-local
#   CI_LOCAL_SKIP_INSTALL=1 just ci-local   # deps already installed
#
set -euo pipefail

cd "$(dirname "$0")/.."

EXPECTED_PY="${CI_PYTHON_VERSION:-3.13}"
EXPECTED_NODE="${CI_NODE_VERSION:-20}"
ALLOW_MISMATCH="${CI_LOCAL_ALLOW_VERSION_MISMATCH:-0}"
SKIP_INSTALL="${CI_LOCAL_SKIP_INSTALL:-0}"

die() {
    printf 'ci-local: %s\n' "$*" >&2
    exit 1
}

need() {
    command -v "$1" >/dev/null 2>&1 || die "missing '$1' in PATH"
}

for cmd in python3 node npm npx just circom; do
    need "$cmd"
done

# CI installs this separately; a fresh local checkout often forgets it.
CIRCOM_VERSION="$(circom --version 2>&1 | head -n 1 || true)"

PY_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
PY_FULL="$(python3 --version 2>&1)"
NODE_FULL="$(node --version 2>&1)"

printf '==> CI replica: Python %s (CI %s), Node %s (CI %s), %s\n' \
    "$PY_FULL" "$EXPECTED_PY" "$NODE_FULL" "$EXPECTED_NODE" "$CIRCOM_VERSION"

if [[ "$PY_VERSION" != "$EXPECTED_PY" ]]; then
    if [[ "$ALLOW_MISMATCH" == "1" ]]; then
        printf 'warning: Python %s != CI %s (allowed by CI_LOCAL_ALLOW_VERSION_MISMATCH)\n' \
            "$PY_VERSION" "$EXPECTED_PY" >&2
    else
        die "Python $PY_VERSION is not the CI version ($EXPECTED_PY).
       Use a Python $EXPECTED_PY environment (see .python-version) or set
       CI_LOCAL_ALLOW_VERSION_MISMATCH=1 to run anyway."
    fi
fi

if [[ "$NODE_MAJOR" != "$EXPECTED_NODE" ]]; then
    if [[ "$ALLOW_MISMATCH" == "1" ]]; then
        printf 'warning: Node %s != CI %s (allowed by CI_LOCAL_ALLOW_VERSION_MISMATCH)\n' \
            "$NODE_MAJOR" "$EXPECTED_NODE" >&2
    else
        die "Node major $NODE_MAJOR is not the CI version ($EXPECTED_NODE).
       Use Node $EXPECTED_NODE (see .nvmrc) or set
       CI_LOCAL_ALLOW_VERSION_MISMATCH=1 to run anyway."
    fi
fi

if [[ "$SKIP_INSTALL" != "1" ]]; then
    printf '\n==> just install (same as the CI install step)\n'
    just install
else
    printf '\n==> skipping install (CI_LOCAL_SKIP_INSTALL=1)\n'
fi

printf '\n==> just ci (same as the CI test step)\n'
just ci

printf '\n✅ Local CI replica passed.\n'
