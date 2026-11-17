# Judge demonstration

This walkthrough uses a fake identity and fixed demo values. It requires no wallet, seed phrase, private key, faucet funds or live transaction. The only chain actions are optional read-only testnet queries.

## 1. Start the dashboard

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Point out the persistent **DEMO MODE** label and **NO SIGNING · NO BROADCAST** notice. The overview charts and event feed are illustrative data, not measured security events.

## 2. Run the classical compromise simulation

1. Open **Attack Simulator**.
2. Read the fake `qday-demo://` identity and scenario description aloud: the “compromise” is a marker; no key material exists.
3. Choose **Evaluate demo scenario**. The deterministic local policy engine reports the denial and its reasons.
4. Choose **Replay same request** to show replay detection. The UI audit view will display session-only local records.

The decision applies only to the local model and is not a QoreChain enforcement result.

## 3. Review policy controls

1. Open **Security Policies** and show the demo allowlist, limits, transaction cap and approval threshold.
2. Toggle **Pause outgoing actions**. The control changes only the in-browser simulator and is appended to its session audit chain.
3. Return to the simulator and evaluate an action while paused; the local engine should deny it. Resume the demo policy when finished.

## 4. Show the EVM authorization-window concept

1. Open **QoreChain Monitor** and keep the top read-only observation cards separate from the local demo below.
2. If no address is configured, the monitor should say account-specific reads are not configured. A configured public Diana address may show a live response or an explicit unavailable state; do not present absence as a zero or claim verification if the endpoint cannot be reached.
3. In **EVM authorization-window lab**, point out that both accounts and transactions are fake fixtures. The first example has no authorization window. The second exceeds its mock remaining value bound.
4. Explain the protocol accurately: EVM transactions use secp256k1. The account also needs a registered ML-DSA-87 key and a live authorization window. A separate hybrid-signed Native-lane message opens that window. This demo creates no such message and sends nothing.

## 5. Verify audit behavior

1. Open **Audit Logs** and select **Verify local chain**. It verifies the current in-memory browser records only.
2. For the independent persistent API, start `npm run api` in another terminal. The API’s automated tests cover restart restoration and modified/reordered audit records. Do not edit or tamper with a real user’s audit file during a presentation.
3. The browser audit display and API JSONL audit are separate stores; the browser page does not show API-persisted events.

## 6. Optional read-only network refresh

The monitor can refresh public chain metadata and protocol features without an address. Account PQC/window reads require a public test address. Refreshes are read-only and may be unavailable. Tests in this repository use mocks; a successful UI request is a timestamped observation from the endpoint, not a security guarantee.

## Cleanup

Stop the dev and API processes with Ctrl+C. The optional API writes `.qday-data/audit.jsonl`; it is local demo data and should not be treated as immutable evidence.
