# Persistence schema

There is no database or migration system in the current project. The optional local API persists an append-only JSON Lines file at `.qday-data/audit.jsonl` by default. Each line is one JSON object:

| Field | Type | Meaning |
| --- | --- | --- |
| `sequence` | safe integer | One-based position in this file. |
| `eventType` | `decision` or `control` | Simulation decision or local pause change. |
| `occurredAt` | safe integer | Timestamp in milliseconds. |
| `details` | JSON object | Policy id, simulated request fields and decision evidence. Never wallet secrets. |
| `previousHash` | lowercase SHA-256 hex | Prior record hash, or 64 zeroes for the first entry. |
| `hash` | lowercase SHA-256 hex | SHA-256 of canonical ordered field values. |

On startup the API validates sequence, previous-hash linkage, required types and each record hash before restoring counters, pause state, completed request identifiers and pending demo approvals. A malformed or changed chain fails closed for sensitive routes. Writes are flushed and `fsync`ed. File permissions are restricted where supported.

Limitations: no database transaction, schema migration, cross-process lock, authenticated actor identity, independent timestamp authority, encryption, external hash anchor, or defense against an administrator who can replace the whole file. This is tamper-evident local demo persistence, not blockchain immutability or production audit storage.

Tokenomics responses are not persisted. The API holds only the latest non-empty, identity-verified snapshot in process memory for 30 seconds. Restarting the API clears this cache; every refresh still performs read-only endpoint checks.
