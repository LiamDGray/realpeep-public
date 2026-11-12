#!/usr/bin/env bash
# Build the Rust JNI library into the Android source tree.
#
# Requires: Android NDK r28c+, cargo-ndk, rustup target aarch64-linux-android.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME to the NDK path}"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export PATH="$CARGO_HOME/bin:$PATH"
cd "$ROOT/rust/realpeep-core"
cargo ndk -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 \
    -o "$ROOT/platform/android/app/src/main/jniLibs" build --release --features android
