# Local API

The Node API is a separate local demo service. It binds to `127.0.0.1:4174` by default and uses strict request-field validation, an 8 KiB request body cap, a 15 second request timeout, bounded per-route rate limits, non-reflective internal errors, `Cache-Control: no-store`, and an `X-Request-Id` response header.

## Routes

| Method | Route | Behavior and provenance |
| --- | --- | --- |
| GET | `/api/health` | API and local audit-chain status (`DEMO MODE`). |
| GET | `/api/observations/qorechain` | Explicitly reports that this API does not collect network observations. |
| GET | `/api/tokenomics` | Verifies both Diana identities, reads official tokenomics REST endpoints, probes the documented combined JSON-RPC method, normalizes verified REST fields and returns explicit per-source status. |
| GET | `/api/policies` | Demo policy snapshot and simulation limits. |
| GET | `/api/audit/verify` | Verifies the local JSONL SHA-256 chain. |
| GET | `/api/audit/events?limit=1..500` | Reads local demo audit events. |
| POST | `/api/security/decisions` | Evaluates a strictly validated simulated action. |
| POST | `/api/security/decisions/{requestId}/approval` | Continues a pending demo approval; pending actions restore only from valid audit records. |
| PATCH | `/api/policies/emergency-pause` | Persists a pause for this local simulator. It does not pause a wallet or blockchain account. |
| POST | `/api/simulator/scenarios` | Runs a fixed local classical-compromise simulation. |

Mutating/sensitive API routes are still demo controls. `demo-operator` and `demo-approver` are fixed labels, not authenticated people. Remote binding's shared bearer-token option has no built-in TLS, individual users, RBAC, revocation, or persistent sessions. Do not expose this API to an untrusted network.

Responses use JSON. Errors have `{ "error": string, "requestId": string }` and a matching `X-Request-Id`. Request IDs are correlation identifiers, not authentication credentials. Internal errors are deliberately generic and are not logged with request bodies or headers.

The dashboard calls `/api/tokenomics` for tokenomics only. Policy controls and audit display remain browser-local and do not call the API. No endpoint signs or broadcasts a transaction.
