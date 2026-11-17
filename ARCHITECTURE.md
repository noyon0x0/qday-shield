# Architecture

## System boundary

Q-Day Shield has three distinct parts: a React browser dashboard, an in-browser simulation core used by that dashboard, and an optional Node REST API with its own simulation engine and persistent audit store. The browser and API simulation paths are not currently connected to each other.

```mermaid
flowchart LR
  U[Operator] --> UI[React dashboard]
  UI --> SDK[@qorechain/sdk read methods]
  SDK -->|Native REST via /lcd| REST[QoreChain Diana testnet]
  SDK -->|JSON-RPC reads| EVM[QoreChain EVM testnet]
  UI --> CORE[Browser policy engine]
  CORE --> MEM[In-memory browser hash chain]
  UI -->|/api proxy when API is running| API[Optional Node REST API]
  API --> APIENGINE[Separate policy engine]
  APIENGINE --> JSONL[Local append-only JSONL]
  JSONL --> VERIFY[Sequence + SHA-256 chain verification]
```

The browser UI’s policy and audit pages use the browser core. The REST API is launched separately with `npm run api`; it is not the source of state for those pages. API response source labels differentiate demo simulation, demo audit and not-collected observations.

## Browser data flow

1. `src/App.tsx` constructs the SDK client with the testnet preset and pinned Diana endpoints. The monitor reads Native chain ID/height, EVM chain ID/height and protocol features. Both identities must match before account, event, balance or tokenomics reads are trusted.
2. Native REST calls pass through Vite’s `/lcd` proxy in the browser; the manually run script uses the official Diana REST URL directly. EVM JSON-RPC reads go only to the pinned testnet endpoint. The bounded fetch wrapper applies timeouts; reads retry once and expose available/unavailable/not-configured states with last-success metadata and stale values kept separate.
3. Optional public-address reads cover PQC registration, balance, sender transactions (ten per SDK-supported page, with additional pages requested by the operator) and EVM-window status. No wallet connection or secret material is used.
4. Hybrid events are queried by the documented `pqc_hybrid_verify.address` attribute when possible. The monitor falls back to an explicitly GLOBAL query if that attribute is not indexed. A node-reported positive event is marked as corroborated only if the SDK transaction read returns code 0, the same positive event, and a documented `PQCHybridSignature` extension with the documented 4,627-byte signature. This is endpoint evidence, not local signature cryptography.
5. The monitor view labels live, simulated, mock and unavailable data explicitly. Tests inject mocked `fetch` responses; they are not live-network checks. `npm run testnet:check` is separately invoked and is not included in offline tests.
6. The browser’s local simulator constructs a fake identity and deterministic simulated action, evaluates the policy engine, and appends a record to the in-memory hash-linked audit log. No QoreChain client is passed to the policy engine.
7. The EVM teaching lab evaluates fixed local fixtures in `src/security/evmWindowSimulation.ts`; it does not consume observed values as if they were mock data or mutate testnet state.

## Policy engine

`src/security` holds shared types, fake identity guards, deterministic policy evaluation, browser hash-chain audit support and the EVM mock evaluator. Policy checks are ordered: pause, authorization/policy expiry, identity and signer posture, replay, recipient, amount and configured limits, then approval. Successful simulated actions reserve count and cumulative spend. Human approval in this app is only a demo continuation bound to a deterministic action fingerprint; it is not authenticated identity or cryptographic approval.

## REST API and persistence

`server/main.ts` loads configuration and starts the service. `server/app.ts` validates route inputs, applies in-memory rate limits, calls its own policy engine and centralizes HTTP error responses. `server/auditStore.ts` writes JSON Lines records with sequence number, previous hash and SHA-256 digest, synchronizes writes, restores counters from verified records, and fails closed when the stored history no longer matches.

The store is local to one process and one directory. The hash chain detects edits, truncation, insertion and reordering against the expected in-process history. It is not signed or externally anchored: an attacker able to rewrite the complete file before service startup can produce a new internally valid chain. Multi-process locking, external backup, retention and distributed consistency are absent.

## QoreChain mechanisms

- **Native lane:** protocol status, public account state, transaction history and indexed hybrid-verification evidence are read-only observations. The app does not generate or locally cryptographically verify a new transaction signature.
- **EVM lane:** EVM transactions are secp256k1-signed. Admission requires a registered ML-DSA-87 key and an applicable live authorization window. A separate hybrid-signed Native-lane message opens the bounded window. The ordinary EVM transaction does not carry an ML-DSA-87 signature.
- The installed SDK exposes a typed `fetchEvmWindow` reader; the implementation uses the SDK read helper and its REST-backed response. The EVM window reference notes newer scope fields that the status endpoint does not return, so absent scope data cannot be inferred from the UI.

See the [official EVM guide](https://docs.qorechain.io/qoresign/guides/evm-quantum-ready/) and [window reference](https://docs.qorechain.io/developer-guide/evm-window-reference/).

## Main source map

| Area | Files |
| --- | --- |
| React app and shared visual components | `src/App.tsx`, `src/components.tsx`, `src/SecurityViews.tsx`, `src/QoreChainMonitorView.tsx`, `src/EvmWindowDemo.tsx`, `src/styles.css` |
| Testnet reads | `src/network/qorechainMonitor.ts`, `vite.config.ts` |
| Deterministic security core | `src/security/*.ts` |
| REST API and persistence | `server/*.ts`, `scripts/run-api.mjs` |
| Tests | `tests/*.mjs`, `tests/run-tests.mjs` |
