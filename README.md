# Q-Day Shield

Q-Day Shield is a QoreChain Diana testnet security operations dashboard with a separate deterministic security simulator. Network access is read-only. Simulated policy decisions and attack examples never sign or submit transactions.

## Install and run

Requirements: Node.js 20 or newer and npm.

```sh
npm ci
Copy-Item .env.example .env # PowerShell; optional, use `cp` on macOS/Linux
npm run dev                 # http://localhost:5173
```

To use the separate local REST API, start a second terminal:

```sh
npm run api
```

The API listens on `127.0.0.1:4174` by default and stores local audit records in `.qday-data/audit.jsonl`. The Vite development server proxies `/api` to it. The dashboard uses `/api/tokenomics` for Diana tokenomics; policy simulation and audit pages remain browser-local and session-only. Start both processes to use tokenomics.

Copying `.env.example` is optional. Set `VITE_QORE_PUBLIC_TEST_ADDRESS` only to a public Diana testnet address if account-specific PQC/window reads are wanted. Never enter a wallet seed phrase or private key. `.env` is ignored by Git.

## What the app does

- Reads Native and EVM identity/heights, protocol features, optional public-address PQC registration, balance, paginated sender transactions, EVM authorization-window status and indexed hybrid verification evidence using installed `@qorechain/sdk` 0.14.0 read methods.
- Queries Diana supply, inflation parameters/progress and burn statistics through the official Native REST routes after the backend verifies `qorechain-diana` and EVM chain ID `9800`. The documented `qor_getTokenomicsOverview` is probed with no parameters; undocumented result shapes are not trusted, and REST remains the normalized source.
- Verifies Native `qorechain-diana` and EVM chain ID `9800` before account, protocol-feature, event, balance or tokenomics reads. Mismatch or unavailable identity blocks those dependent reads.
- Labels fields `LIVE TESTNET`, `SIMULATED`, `MOCK DATA` or `UNAVAILABLE`; failed refreshes retain previous successful values only as explicitly stale/unavailable data.
- Associates each successful Native balance read with the address queried; changing the address hides the old result until a fresh read succeeds.
- Reports hybrid verification as node-reported evidence only when the event, successful transaction response, documented `PQCHybridSignature` type URL, algorithm id 1, and 4,627-byte ML-DSA-87 signature are all present. The result is still endpoint-provided evidence, not local cryptographic verification.
- Simulates deterministic policy outcomes with fake identities and `qday-demo://` recipients. The attack simulator’s “compromise” is only a marker; it does not perform cryptographic theft or access key material.
- Includes a separate EVM authorization-window teaching example with fixed mock accounts, heights and transactions. Mock data is not a network observation.
- Runs a separate REST API with strict request validation, request IDs, bounded request timeouts, restart-restored pending demo approvals, and local JSONL hash-chained audit persistence.
- Caches successful or partial tokenomics snapshots in memory for 30 seconds and reports endpoint status, HTTP status, response time, source and last successful update. No tokenomics values are cached across restarts.

## Protocol and safety boundary

Native-lane transactions use hybrid secp256k1 plus ML-DSA-87 signatures under QoreChain’s protocol rules. EVM transactions themselves use secp256k1; they do not carry an ML-DSA-87 signature. The account must have a registered ML-DSA-87 key and a live bounded authorization window. That window is opened by a separately hybrid-signed Native-lane message. Q-Day Shield only reads the documented status and demonstrates fixed mock outcomes; it does not create, sign, or broadcast such a message or any EVM transaction. See the [official EVM wallet guide](https://docs.qorechain.io/qoresign/guides/evm-quantum-ready/) and [authorization-window reference](https://docs.qorechain.io/developer-guide/evm-window-reference/).

## Feature status

Status is based on repository inspection, mocked tests, typecheck, production build and a manually invoked live read attempt on 2026-11-17. No live endpoint field is considered verified unless the live check returns it successfully.

| Feature | Status | Evidence / boundary |
| --- | --- | --- |
| Dashboard pages and responsive styles | Implemented; build-verified | Six navigation pages; responsive CSS and reduced-motion rules exist. No browser/device or assistive-technology QA was performed for this review. |
| Deterministic local policy engine | Implemented; tested; simulated | Unit tests cover allow/deny, policy constraints, replay, pause, approval and audit tampering. It is not an on-chain policy. |
| Classical-key compromise exercise | Simulated; tested | Fake identities only; no private key is created or accessed. |
| EVM window evaluator | Simulated; tested | Fixed fake accounts and mocked transactions; expired, missing, exhausted and limit cases tested. |
| Diana tokenomics dashboard | Implemented; mocked service tests pass; live endpoint unavailable in this environment | Backend pins Diana, verifies both identities, queries supply/inflation/burn REST, probes the documented RPC method, normalizes only documented fields and shows partial/unavailable source status. No live tokenomics field could be fetched here. |
| QoreChain read-only monitor | Implemented; mocked tests pass; live check unavailable | Official hostnames resolve, but TCP 443 and HTTPS fail from the current environment for Native REST, consensus RPC, and EVM RPC. No chain ID, height, account or feature field was live-verified. |
| Native ML-DSA-87 status | Read-only monitor implemented; mocked tests pass; live check unavailable | Public-address status uses the SDK reader. Verification evidence is only promoted after matching event + transaction success + signature extension are returned; no local signature verification occurs. |
| EVM authorization window status | Read-only monitor implemented; mocked tests pass; live check unavailable | SDK `fetchEvmWindow` fields are validated before display. The REST read does not expose every newer scope accepted by protocol builders. |
| Local UI audit log | Implemented; tested; session-only | In-memory browser hash chain. It is lost when the page session ends. |
| API audit persistence | Implemented; integration-tested | JSONL + SHA-256 chaining, restart restore and tamper/reorder rejection. Not immutable against a privileged attacker rewriting the whole file. |
| Offline ML-DSA-87 check | Implemented; SDK-tested | Uses ephemeral in-memory test key material; valid-message verification and modified-message rejection pass. This does not prove on-chain registration. |
| REST API | Implemented; integration-tested; tokenomics connected | Dashboard uses `/api/tokenomics`; simulator, policy and browser audit state remain separate. |
| Signing, wallet connection, transaction broadcast | Not implemented | No wallet connection, signing flow or transaction submission path exists in the inspected app source. |
| Production identity, multi-user authorization, anchored audit | Not implemented | The API is a local demo service, not a production security boundary. |

## Checks

```sh
npm test
npm run typecheck
npm run build
```

The separate live connectivity check is manually invoked and is not part of `npm test`:

```sh
npm run testnet:check
npm run testnet:check -- qor1...
```

It uses only the pinned Diana REST/EVM endpoints, never signs or broadcasts, and stops before account reads unless both network identities match. Supply only a public address. The optional `QORE_PUBLIC_TEST_ADDRESS` environment variable is also supported.

The test suite uses mocked network responses and local temporary audit stores; it also runs an isolated ML-DSA-87 SDK self-test using ephemeral material. It does not require a live QoreChain endpoint. See [TESTING.md](TESTING.md), [ARCHITECTURE.md](ARCHITECTURE.md), [API.md](API.md), [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), [SECURITY.md](SECURITY.md), and [DEMO.md](DEMO.md).

## Configuration

| Variable | Purpose | Default / behavior |
| --- | --- | --- |
| `VITE_QORE_PUBLIC_TEST_ADDRESS` | Optional public `qor1…` address for balance, PQC, paginated transaction history, events and EVM-window reads | Empty; account-specific reads show unavailable/not configured |
| `QORE_PUBLIC_TEST_ADDRESS` | Optional public address for the manually invoked live connectivity script | Empty; only public network identity and global events are checked |
| `QDAY_API_HOST` | API bind host | `127.0.0.1`; non-loopback requires remote opt-in |
| `QDAY_API_PORT` | API port | `4174` |
| `QDAY_AUDIT_DIR` | Audit data directory | `.qday-data` |
| `QDAY_ALLOW_REMOTE` | Enable remote API binding | Defaults off |
| `QDAY_API_TOKEN` | Shared bearer token for sensitive remote routes | Required with remote binding; 32–256 URL-safe characters |
| `QDAY_API_PROXY_TARGET` | Vite API proxy target | `http://127.0.0.1:4174` |

The API always labels itself `DEMO MODE · SIMULATION ONLY`; configuration cannot convert its fixed demo identities into authenticated operators. Do not enable remote binding. The optional shared token is not a production authentication system, and this API lacks built-in TLS, individual users, RBAC, session revocation and network controls.

See [API.md](API.md) for routes, [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) for local persistence, and [ARCHITECTURE.md](ARCHITECTURE.md) for trust boundaries.
