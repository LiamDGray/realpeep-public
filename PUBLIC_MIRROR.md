# Public Mirror

This is a sanitized public snapshot of an active **private** development
repository. The private upstream remains the source of truth.

Excluded from this mirror:

- third-party reference PDFs and publication templates under `ref/` (not
  covered by the project's Apache-2.0 license),
- generated coverage, testmon data, and stale screenshots,
- the Cloudflare Pages deploy workflow (it requires private repository secrets),
- account-specific D1 identifiers (replaced with a placeholder).

Snapshots are produced by `scripts/sync-public.sh` and always pass a
`gitleaks detect` scan before publication.
