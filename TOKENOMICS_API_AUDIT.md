# Q-Day Shield Tokenomics API Audit

Run date: 2026-11-17. Network scope: Diana Testnet only (`qorechain-diana`, EVM chain ID `9800`). No mainnet endpoint or write operation was used.

## Summary

The dashboard previously called only the SDK's combined `qor_getTokenomicsOverview` method and displayed its unstructured result. It had no Native REST fallback, no stable internal schema, no individual source status, and no tokenomics-specific UI states. The configured EVM JSON-RPC endpoint and method/empty parameter list match the installed SDK and official method reference, so an incorrect URL or invocation was not the code-level root cause.

The documented REST routes and JSON-RPC method could not be reached from this execution environment. DNS resolved, but TCP port 443 failed for the Native REST and EVM hosts. Therefore no HTTP status, JSON-RPC error, response body, live field, or testnet support result can honestly be reported. In particular, `qor_getTokenomicsOverview` is **UNAVAILABLE TO VERIFY**, not confirmed unsupported. The dashboard now reads an API service that verifies Diana identities, queries documented REST sources, reports fields individually, and only treats the combined RPC as useful when a valid JSON-RPC response is returned. Its response is still marked schema-unverified because official documentation does not define the result schema.

## Original flow and root cause

- `src/App.tsx` used `client.qor.getTokenomicsOverview()` directly and displayed raw JSON. That SDK function calls `qor_getTokenomicsOverview` with an empty parameter list.
- There was no server-side tokenomics service or REST fallback. A method/API transport failure therefore made the entire panel unavailable even if the Native REST routes could provide data.
- Dashboard cards/charts had no normalized supply, burn, inflation, emission, or provenance model.
- The JSON-RPC base URL was already the official Diana endpoint. The method name and zero-parameter call were also correct according to installed SDK v0.14.0 and the official RPC reference.
- A browser-origin CORS failure was possible in the direct-browser design, but could not be proven independently: the host was unreachable at TCP 443 from this environment. Tokenomics now runs through the local backend, avoiding browser-to-upstream CORS requirements.
- No hardcoded or mock tokenomics values were found in the tokenomics panel. Other demo metrics elsewhere in the application are out of scope and remain labeled as demo/simulation.

## Official sources and live probe results

Official documentation lists the three Native routes, the combined RPC method, and the expected fields. It explicitly says Diana has its own emission/supply history and must not be represented with mainnet figures. The protocol denomination conversion is `1 QOR = 1,000,000 uqor`.

| Source | Diana request | Live result in this environment |
| --- | --- | --- |
| Native supply | `GET https://api-testnet.qore.host/cosmos/bank/v1beta1/supply/by_denom?denom=uqor` | No HTTP response; connection could not be established. HTTP status/body unavailable. |
| Native inflation progress | `GET https://api-testnet.qore.host/qorechain/inflation/v1/epoch_info` | No HTTP response; connection could not be established. HTTP status/body unavailable. |
| Native burn statistics | `GET https://api-testnet.qore.host/qorechain/burn/v1/stats` | No HTTP response; connection could not be established. HTTP status/body unavailable. |
| Native inflation parameters (additional documented source) | `GET https://api-testnet.qore.host/qorechain/inflation/v1/params` | Not separately probed successfully; service query is blocked by the same unreachable Native host. No HTTP status/body available. |
| Combined tokenomics RPC | `POST https://evm-testnet.qore.host`, method `qor_getTokenomicsOverview`, `params: []` | No HTTP response; connection could not be established. No JSON-RPC error/result available; support is not determined. |
| Network identity | Native latest block route and EVM `eth_chainId` at official Diana hosts | Both identity checks are implemented, but live values are unavailable because TCP 443 failed. No live identity is claimed. |

DNS resolved both `api-testnet.qore.host` and `evm-testnet.qore.host` to `104.18.12.139` and `104.18.13.139`. `Test-NetConnection` reported TCP 443 false for both. PowerShell probes of all four requested routes/method returned `Unable to connect to the remote server` with `NO_HTTP_RESPONSE`. Because no HTTP exchange took place, it would be inaccurate to report 404, 500, CORS, or JSON-RPC `-32601`.

The official REST reference documents the inflation params fields (`emission_mode`, `fixed_epoch_emission`, `max_total_emission`, `epoch_length`, `enabled`), inflation progress fields (`current_epoch`, `block_start`, `next_epoch_height`, `total_minted`, `max_total_emission`, `remaining_emission`) and burn stats fields (`stats.total_burned`, `stats.burns_by_source`, `stats.last_burn_height`). These are schema references, not live Diana observations. No mainnet sample values are used.

## Implemented behavior

- Backend pins Native REST and EVM RPC to the official Diana hosts; verifies Native `qorechain-diana` from the latest block and EVM chain ID `9800` before requesting tokenomics.
- Reads the documented supply, inflation params, inflation epoch, and burn routes. Converts only validated integer `uqor` strings using exact six-decimal arithmetic.
- Makes a no-parameter combined RPC probe. `-32601` is reported as unsupported only if actually returned; a successful result is marked schema-unverified and is not used to populate fields because the official result schema is undocumented. REST remains the normalized field source.
- Each field and upstream endpoint has explicit available/unavailable status. Invalid JSON, missing fields, identity mismatch, HTTP failures, timeout, and network failure do not become zero or placeholder values.
- Read-only failures and 429/5xx responses receive one bounded retry. Successful/partial identity-verified snapshots are cached in process for 30 seconds and marked cached; the cache is cleared by API restart.
- The browser calls same-origin `GET /api/tokenomics`, displays supply, total burned, inflation mode, target APY when present, emission/epoch data and source breakdown only when returned and validated. It has loading, live, partial, unavailable, stale, and RPC unsupported states with endpoint/status provenance.
- The service does not fabricate emission remaining; it uses the documented `remaining_emission` field only.

## Files changed for this tokenomics work

- `server/tokenomicsService.ts` — Diana identity gates, REST/RPC reads, parsing, retries and cache.
- `server/app.ts` — `GET /api/tokenomics` route.
- `src/network/tokenomicsTypes.ts` — normalized strict types.
- `src/network/tokenomicsClient.ts` — same-origin API client and response validation.
- `src/App.tsx` — tokenomics dashboard cards, chart and status/provenance states.
- `src/styles.css` — tokenomics layout and presentation.
- `vite.config.ts` — documents same-origin API proxy use.
- `tests/tokenomicsService.test.mjs` — mocked service scenarios.
- `tests/api.test.mjs` — API route coverage.
- `tests/run-tests.mjs` — includes the service test suite.
- `API.md`, `README.md`, `ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `TESTING.md` — API and behavior documentation.
- `TOKENOMICS_API_AUDIT.md` — this report.

Other pre-existing workspace modifications were preserved and are not attributed to this task.

## Before/after and verification

| | Before | After |
| --- | --- | --- |
| Source | Combined RPC only | Documented REST values, with combined RPC capability probe |
| Identity | No tokenomics service gate | Both Diana Native and EVM identities must verify before reads |
| UI | Raw RPC JSON / generic error | Normalized metric cards and endpoint/field provenance |
| Missing values | Whole query failed | Per-source/per-field unavailable or partial state; no fabricated zeros |
| Testnet evidence | None in the UI contract | Explicit live labels only when verified response fields are returned; current live data remains unavailable in this environment |

Automated tests use injected mock transports and demonstrate parser/handling behavior only. They are not live network evidence. Final results:

- `npm.cmd run typecheck` — passed (`tsc --noEmit`, no diagnostics).
- `npm.cmd test` — passed, 52 passed / 0 failed / 0 skipped.
- `npm.cmd run build` — passed; Vite transformed 1,957 modules. Existing third-party annotation and large-bundle advisory warnings remain.
- `git diff --check` — passed; only Git line-ending conversion warnings were printed.

## Remaining limitations

- Live Diana tokenomics values, HTTP status codes, endpoint response schemas, and combined RPC support could not be observed due to TCP 443 connectivity failure in this environment.
- The combined JSON-RPC method's official documentation does not define a result schema. Even when a successful RPC envelope is returned, its result is not trusted for dashboard fields until that schema is documented and validated.
- In-memory caching is process-local and not persistent. No stale last-known values survive API restart.
- The configured API client makes no claim that testnet values are economically representative of mainnet.

## References

- [QoreChain Tokenomics](https://docs.qorechain.io/architecture/tokenomics/)
- [QoreChain REST / gRPC Endpoints](https://docs.qorechain.io/api-reference/rest-grpc-endpoints/)
- [QoreChain JSON-RPC `qor_` namespace](https://docs.qorechain.io/api-reference/json-rpc-qor_-namespace/)
- [Connecting to Diana Testnet](https://docs.qorechain.io/getting-started/connecting-to-testnet/)
