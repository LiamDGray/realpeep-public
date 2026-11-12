# Vendored ZK helpers

`zk-kit.bundle.js` is a browser IIFE bundle of:

- `@zk-kit/eddsa-poseidon@1.1.0` — MIT
- `poseidon-lite@0.3.0` — MIT

It exposes `window.ZkKit` with `derivePublicKey`, `signMessage`,
`verifySignature`, `poseidon1`, and `poseidon2`. It is used by
`demo/real-proof.html` to sign the frame commitment with a **demo** TEE key in
the browser. It is not a hardware attestation and the key is public demo
material.

Rebuild with esbuild:

```bash
npm i @zk-kit/eddsa-poseidon@1.1.0 poseidon-lite@0.3.0 esbuild@0.25.10
cat > zk-kit-entry.js <<'JS'
import { derivePublicKey, signMessage, verifySignature } from '@zk-kit/eddsa-poseidon';
import { poseidon1, poseidon2 } from 'poseidon-lite';
window.ZkKit = { derivePublicKey, signMessage, verifySignature, poseidon1, poseidon2 };
JS
npx esbuild zk-kit-entry.js --bundle --format=iife --platform=browser \
  --target=es2020 --minify --outfile=zk-kit.bundle.js
```

`snarkjs` is loaded from a pinned CDN URL by the demo page and is **GPL-3.0**.
It is a separate runtime dependency; the RealPeep repository itself remains
Apache-2.0. Do not vendor snarkjs into the Apache-2.0 tree without reviewing the
license implications.
