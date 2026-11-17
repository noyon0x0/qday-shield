# Testing and verification record

## Reproduce

Run from the project directory with Node.js 20+ and npm:

```sh
npm ci
npm test
npm run typecheck
npm run build
```

The live check is separate from the offline suite and must be invoked manually:

```sh
npm run testnet:check
npm run testnet:check -- qor1...
```

It uses only the hard-coded Diana REST and EVM RPC endpoints. It performs reads only and will not query account-specific data until both observed network identities match. Pass a public address as the first argument or set `QORE_PUBLIC_TEST_ADDRESS`; never supply wallet credentials.

`npm test` invokes `tests/run-tests.mjs`, which type-compiles the TypeScript core into a temporary directory and then runs Node’s built-in test runner against the API, EVM evaluator, network monitor and policy engine test files. Test network calls use injected mock `fetch` responses; no test requires a live endpoint. API tests use local ephemeral ports and temporary audit directories.

## Latest run

Run date: **2026-11-17**.

| Command | Result |
| --- | --- |
| `npm.cmd test` | Exit 0; **52 passed, 0 failed, 0 skipped**. Includes API approval restart and tokenomics routing; REST success/fallback, 404/500, timeout, malformed/missing fields, partial data, identity gating, exact uqor conversion and cache provenance; existing mocked monitor/policy/EVM cases; and installed SDK ML-DSA-87 checks using ephemeral material. |
| `npm.cmd run typecheck` | Exit 0; `tsc --noEmit` completed with no diagnostics. |
| `npm.cmd run build` | Exit 0; Vite transformed 1,957 modules and emitted production assets. |
| `npm.cmd run testnet:check` | Exit 1; REST latest block, EVM `eth_chainId`, and `eth_blockNumber` failed with `TypeError: fetch failed`. DNS resolves; TCP 443 is blocked for Native REST, consensus RPC and EVM RPC. The script stops before dependent reads. |

Build warnings remain: third-party `@scure/base` pure-annotation comments are removed by Rollup, and the minified JavaScript bundle is about 3,050 kB (628 kB gzip), above Vite’s 500 kB advisory threshold. They did not fail the build.

The Windows PowerShell `npm` shim was blocked by the machine’s script execution policy. The same requested commands were run successfully through `npm.cmd`; no policy setting was changed.

The tokenomics-specific live probe on 2026-11-17 attempted the supply, inflation epoch, burn stats, and `qor_getTokenomicsOverview` Diana requests. DNS resolved the Native REST and EVM RPC hostnames, but TCP 443 failed for both. Each HTTP probe ended with `Unable to connect to the remote server` and **no HTTP response/status**; consequently the RPC method is unavailable to verify, not confirmed unsupported. No live tokenomics values were obtained.

## Coverage boundaries

- The API suite exercises strict validation, explicit source separation, route throttling, persistence restart, chain tampering, and fail-closed sensitive operations.
- The policy suite exercises deterministic decisions, replay, simulated classical compromise, limits, approval, pause and in-memory audit integrity.
- The monitor suite injects mocked SDK transport responses, including malformed responses, timeout, Native/EVM network mismatches, endpoint pinning, account history, event filter fallback, incomplete signature evidence, and stale/unavailable states.
- Account transaction history uses the installed SDK's documented `searchTxs` page option with ten results per page; additional pages are fetched only when explicitly requested. The pagination test injects mock responses and makes no network call.
- The EVM suite exercises missing, expired, exhausted, out-of-value and out-of-target examples. These are local mock inputs.
- The tokenomics suite injects mocked REST and JSON-RPC responses; it never accesses the network. The combined RPC response is marked schema-unverified because official docs do not define its result schema; documented REST data is used.
- There is **no live-testnet field verified** in this run because the live read check could not connect. No public address was configured, so account reads were not attempted. There is no browser automation, end-to-end UI test, accessibility scanner, visual regression, fuzz test, load test, or dependency vulnerability scan configured in this repository.

The installed SDK cryptography test uses an ephemeral in-memory ML-DSA-87 keypair to check one valid signature, modified-message rejection, and key mismatch rejection. It is local algorithm evidence only; it does not prove an on-chain key or account state.

Passing these checks verifies the listed code paths under test; it is not a proof of production security or on-chain enforcement.
