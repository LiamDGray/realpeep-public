#!/usr/bin/env bash
#
# Publish a sanitized public snapshot from the private development repo.
#
# Usage:
#   git remote add public https://github.com/<you>/realpeep-public.git
#   scripts/sync-public.sh
#
# Environment:
#   PUBLIC_REMOTE   remote name or URL (default: public)
#   PUBLIC_BRANCH   branch to publish (default: master)
#
# The script refuses to publish if gitleaks finds anything, if the working tree
# is dirty, or if a required sanitization step is missing.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PUBLIC_REMOTE="${PUBLIC_REMOTE:-public}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-master}"
PUBLIC_SLUG="${PUBLIC_SLUG:-LiamDGray/realpeep-public}"
EXPORT_DIR="$(mktemp -d /tmp/realpeep-public-export-XXXXXX)"
REPO_DIR="$(mktemp -d /tmp/realpeep-public-repo-XXXXXX)"
trap 'rm -rf "$EXPORT_DIR" "$REPO_DIR"' EXIT

die() {
    printf 'sync-public: %s\n' "$*" >&2
    exit 1
}

command -v gitleaks >/dev/null 2>&1 || die \
    "gitleaks is required. Install it from https://github.com/gitleaks/gitleaks/releases"

if [[ -n "$(git status --porcelain)" ]]; then
    die "working tree is dirty; commit or stash before publishing"
fi

if git remote get-url "$PUBLIC_REMOTE" >/dev/null 2>&1; then
    PUBLIC_URL="$(git remote get-url "$PUBLIC_REMOTE")"
else
    PUBLIC_URL="$PUBLIC_REMOTE"
fi

printf '==> Exporting tracked tree from %s\n' "$(git rev-parse --short HEAD)"
git archive HEAD | tar -x -C "$EXPORT_DIR"

# Do not redistribute third-party PDFs/templates, generated artifacts, or a
# deployment workflow that requires private Cloudflare secrets.
rm -rf "$EXPORT_DIR/ref"
rm -rf "$EXPORT_DIR/realpeep-js/coverage"
rm -f "$EXPORT_DIR/.testmondata"
rm -f "$EXPORT_DIR/tests/error_screenshot.png"
rm -f "$EXPORT_DIR/.github/workflows/deploy.yml"
rm -rf "$EXPORT_DIR/docs/operations"

# Sanitize references and account-specific config.
python3 - "$EXPORT_DIR" "$PUBLIC_SLUG" <<'PY'
import re
import sys
from pathlib import Path

root = Path(sys.argv[1])
public_slug = sys.argv[2]

readme = root / "README.md"
s = readme.read_text()
s = s.replace("LiamDGray/realpeep", public_slug)
banner = (
    "> **Public mirror.** This is a sanitized snapshot of an active private\n"
    "> development repository. Third-party reference PDFs and deployment\n"
    "> credentials are excluded; see [PUBLIC_MIRROR.md](PUBLIC_MIRROR.md).\n\n"
)
if "**Public mirror.**" not in s:
    idx = s.index("\n") + 1
    s = s[:idx] + "\n" + banner + s[idx:]
if "├── ref/" in s and "├── data/" in s:
    start = s.index("├── ref/")
    end = s.index("├── data/")
    s = s[:start] + s[end:]
readme.write_text(s)

portfolio = root / "PORTFOLIO.md"
p = portfolio.read_text()
p = p.replace("LiamDGray/realpeep", public_slug)
p = p.replace(
    "Apache 2.0. Third-party reference PDFs in `ref/` are included for local research only and\n"
    "are not covered by the project license; remove or replace them before redistributing the\n"
    "repository as a public artifact.",
    "Apache 2.0. Third-party reference PDFs are **not** included in this public mirror.",
)
portfolio.write_text(p)

security = root / "SECURITY.md"
if security.exists():
    sec = security.read_text().replace("LiamDGray/realpeep", public_slug)
    security.write_text(sec)

wrangler = root / "wrangler.toml"
w = wrangler.read_text()
w = re.sub(
    r'database_id = "[0-9a-f-]+"',
    'database_id = "00000000-0000-0000-0000-000000000000"  # replace with your own D1 id',
    w,
)
wrangler.write_text(w)

(root / "PUBLIC_MIRROR.md").write_text(
    "# Public Mirror\n\n"
    "This is a sanitized public snapshot of an active **private** development\n"
    "repository. The private upstream remains the source of truth.\n\n"
    "Excluded from this mirror:\n\n"
    "- third-party reference PDFs and publication templates under `ref/` (not\n"
    "  covered by the project's Apache-2.0 license),\n"
    "- generated coverage, testmon data, and stale screenshots,\n"
    "- the Cloudflare Pages deploy workflow (it requires private repository secrets),\n"
    "- account-specific D1 identifiers (replaced with a placeholder).\n\n"
    "Snapshots are produced by `scripts/sync-public.sh` and always pass a\n"
    "`gitleaks detect` scan before publication.\n"
)
PY

printf '==> Scanning the sanitized tree for secrets\n'
gitleaks detect --source "$EXPORT_DIR" --no-git --redact --no-banner

printf '==> Updating %s (%s)\n' "$PUBLIC_URL" "$PUBLIC_BRANCH"
if git clone --depth 1 --branch "$PUBLIC_BRANCH" "$PUBLIC_URL" "$REPO_DIR" >/dev/null 2>&1; then
    find "$REPO_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
else
    rm -rf "$REPO_DIR"
    mkdir -p "$REPO_DIR"
    git -C "$REPO_DIR" init -q -b "$PUBLIC_BRANCH"
fi

(cd "$EXPORT_DIR" && tar -cf - .) | (cd "$REPO_DIR" && tar -xf -)

git -C "$REPO_DIR" add -A
if git -C "$REPO_DIR" diff --cached --quiet; then
    printf '==> No changes to publish\n'
    exit 0
fi

AUTHOR_NAME="$(git config user.name || true)"
AUTHOR_EMAIL="$(git config user.email || true)"
AUTHOR_NAME="${AUTHOR_NAME:-RealPeep}"
AUTHOR_EMAIL="${AUTHOR_EMAIL:-realpeep@users.noreply.github.com}"
UPSTREAM_SHA="$(git rev-parse --short HEAD)"

git -C "$REPO_DIR" \
    -c user.name="$AUTHOR_NAME" \
    -c user.email="$AUTHOR_EMAIL" \
    commit -q -m "Public snapshot from upstream $UPSTREAM_SHA"

git -C "$REPO_DIR" push -q --set-upstream "$PUBLIC_URL" "$PUBLIC_BRANCH"
printf '==> Published %s at %s\n' "$UPSTREAM_SHA" "$PUBLIC_URL"
