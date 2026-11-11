# Security Policy

RealPeep is a **research prototype**, not a production security product. It has not been
externally audited. Do not rely on it to protect people at risk without an independent
review.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **Security Advisories** for this
repository:

<https://github.com/LiamDGray/realpeep-public/security/advisories/new>

Do not open a public issue for an undisclosed vulnerability. Include:

- affected component and version/commit,
- a minimal reproduction or proof of concept,
- impact and any known mitigations,
- whether the issue is already public.

There is no bug bounty. Coordinated disclosure and credit are offered for valid reports.

## Scope

In scope: the Circom circuit, the Python/JS DSP and mesh code, the duress construction, the
Android app, Cloudflare Workers, and the verification path.

Out of scope: the demo's simulated data, third-party reference PDFs, and the known gaps
documented in [docs/reviews/TECHNICAL_REVIEW_2026.md](docs/reviews/TECHNICAL_REVIEW_2026.md)
and [docs/research/DURESS_NOVELTY_ASSESSMENT.md](docs/research/DURESS_NOVELTY_ASSESSMENT.md).

## Known limitations

- The duress protocol is demo-grade: 8-bit marker, no transcript binding, no notary
  service, and a single notary secret.
- The committed zkey is a development artifact, not a production trusted setup.
- On-device proving, real-time audio capture, and the chain bridge are not built.
- The acoustic and BLE mesh code is simulated; it has not been validated on real hardware.

See the [risk register](docs/business/RISK_REGISTER_AND_MITIGATIONS.md) for the product and
safety risks.
