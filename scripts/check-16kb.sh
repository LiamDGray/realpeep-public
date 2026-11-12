#!/usr/bin/env bash
# Verify every native LOAD segment in an APK is 16 KB-page aligned.
# Usage: scripts/check-16kb.sh path/to/app.apk
set -euo pipefail

apk="${1:?usage: check-16kb.sh path/to/app.apk}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

unzip -q "$apk" 'lib/*' -d "$tmp" 2>/dev/null || true

libs=()
while IFS= read -r so; do
    libs+=("$so")
done < <(find "$tmp/lib" -name '*.so' -type f 2>/dev/null | sort)

if [[ "${#libs[@]}" -eq 0 ]]; then
    echo "No native libraries in $apk"
    exit 0
fi

status=0
for so in "${libs[@]}"; do
    while IFS= read -r align; do
        [[ -z "$align" ]] && continue
        if (( align < 0x4000 )); then
            echo "NOT 16 KB ALIGNED: $so (LOAD align $align)" >&2
            status=1
        else
            echo "OK $so (LOAD align $align)"
        fi
    done < <(readelf -lW "$so" | awk '$1 == "LOAD" { print $NF }' | sort -u)
done

exit "$status"
