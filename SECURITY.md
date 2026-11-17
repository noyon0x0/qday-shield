# Security review and threat model

## Intended use

This repository is a testnet read dashboard and local education/demo project. It is not a wallet, custody service, transaction policy enforcer, or production security control. The policy engine’s `allow` result applies only to a locally modeled action. It does not enforce a QoreChain or EVM transaction.

## Assets and trust boundaries

| Asset / boundary | Handling |
| --- | --- |
| Seed phrases, private keys, signing credentials | Not requested or processed by the inspected app. No wallet connection, transaction signer, or broadcast method is wired into the UI or backend. |
| Public chain address | Optional `VITE_QORE_PUBLIC_TEST_ADDRESS`; used only for read-only testnet lookups. It is public data, though it can reveal account interest/activity. |
| API bearer token | Read server-side from `QDAY_API_TOKEN`; the runner loads `QDAY_` variables, which Vite does not expose as browser variables. Never put it in a `VITE_` variable. `.env` and `.env.*` are Git-ignored while `.env.example` is explicitly allowed. |
| Demo policy state | Browser state is in memory. The separate API stores audit events locally; its controls and decisions are still simulations. |
| QoreChain endpoints | Fixed to Diana testnet. Native and EVM identities must match before account/feature/event/balance/tokenomics reads; endpoint responses remain untrusted input and are validated before display. |

## Verified safeguards

- The policy core accepts only fake identities minted by its test identity factory. Compromise is a typed simulation marker, not cryptographic key theft.
- Simulator recipients use the non-chain `qday-demo://` namespace. The EVM lab uses fixed mock transaction objects and does not import a QoreChain client.
- Source inspection found no wallet-connection, signing, `eth_sendTransaction`, or broadcast call path. The SDK setup in the UI is for reads only.
- API request schemas reject unknown fields; bodies are capped at 8 KiB; sensitive operations are rate-limited; remote binding requires an explicit opt-in and sufficiently long bearer token. Request bodies, authorization headers and exception objects are not logged.
- Persistent and in-memory audit tests detect tampering/reordering. The API disables sensitive operations if the stored chain fails verification.
- Testnet monitor responses distinguish available, unavailable and not-configured data; stale values are retained separately and never labeled live. Tests verify malformed responses do not become invented live zeroes.
- Hybrid event evidence is labeled node-reported and is only corroborated when the transaction lookup reports code 0, a matching positive event, the documented PQCHybridSignature type URL, algorithm id 1, and a 4,627-byte ML-DSA-87 signature. The application does not locally verify the returned transaction signature.
- `scripts/check-testnet.mjs` is a separate manually invoked read-only check. Its endpoints are fixed to Diana; it stops before further reads when identity is mismatched or unavailable.

## Audit integrity limits

SHA-256 chaining is tamper-evident, not immutable. A changed record, missing record or reordered record is detected when compared to the preceding hash and in-memory history. If an attacker can replace the entire file before startup, they can recompute every unkeyed hash. There is no external signed checkpoint, remote append-only service, protected backup or independent timestamp authority. The browser audit chain exists only in memory and is not durable.

The persistent store has no cross-process lock. Run one API process per audit directory. Filesystem permissions and `fsync` help local handling but do not protect against an administrator, host compromise, storage rollback or all power-loss scenarios.

## API deployment limits

The safe default binds to loopback. Remote mode is not production-ready: a shared bearer token is not user identity, role-based authorization or key rotation; TLS termination and network policy are deployment concerns; rate limits are in-memory and per-process; the API is not hardened against every denial-of-service pattern. Pending simulator approvals now restore from verified audit records, but actors remain fixed demo labels. The API always identifies itself as demo-only. Do not expose it publicly as a transaction authorization service.

## Protocol correctness

QoreChain Native-lane hybrid signing and EVM authorization windows are distinct mechanisms. An EVM transaction uses secp256k1; it does not directly carry an ML-DSA-87 signature. The account’s ML-DSA-87 key registration and live window are prerequisites, and the window is opened by a separate hybrid-signed Native-lane message. Q-Day Shield does not perform any of those signing or submission actions. See [QoreChain’s EVM guide](https://docs.qorechain.io/qoresign/guides/evm-quantum-ready/) and [window reference](https://docs.qorechain.io/developer-guide/evm-window-reference/).

## Release limitations / residual risks

- The live Diana check was attempted, but endpoint connectivity failed. No live chain identity, height, account data, protocol feature, transaction, event or EVM-window field was verified in this environment. The configured public account address is empty.
- No browser-based keyboard, screen-reader, contrast, mobile-device or visual regression audit was performed. CSS has responsive breakpoints, keyboard focus styling and reduced-motion support, but their runtime behavior remains unverified.
- The UI policy engine/audit state is separate from the persistent API and resets with the browser session.
- A live monitor result is an observation, not proof that the policy engine controls on-chain behavior.
- No formal security assessment, dependency vulnerability audit, load test, or production deployment review has been performed.
