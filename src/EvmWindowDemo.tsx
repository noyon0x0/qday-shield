import { Badge, Card, Icon, SectionHeading } from "./components.js";
import { evaluateMockEvmTransaction, MOCK_ATTACK_TRANSACTIONS, MOCK_EVM_DEMO } from "./security/evmWindowSimulation.js";

const outsideWindow = evaluateMockEvmTransaction(MOCK_EVM_DEMO.noWindow, MOCK_ATTACK_TRANSACTIONS.stolenClassicalKey, MOCK_EVM_DEMO.currentHeight);
const overLimit = evaluateMockEvmTransaction(MOCK_EVM_DEMO.boundedWindow, MOCK_ATTACK_TRANSACTIONS.exceedsValue, MOCK_EVM_DEMO.currentHeight);

export function EvmWindowDemo(): JSX.Element {
  return <section className="evm-demo" aria-labelledby="evm-demo-heading">
    <div className="evm-demo-header"><div><span className="eyebrow">LOCAL SECURITY DEMONSTRATION</span><h2 id="evm-demo-heading">EVM authorization-window lab</h2><p>Fake account · mocked EVM transactions · deterministic local outcomes</p></div><Badge tone="demo">MOCK DATA</Badge></div>
    <div className="evm-demo-explainer"><Icon name="info" size={16} /><p><strong>Two distinct authorization steps:</strong> EVM transactions use secp256k1 signatures. The account also needs a registered ML-DSA-87 key and an active window. A separate hybrid-signed Native-lane message opens that bounded window; possession of a classical key alone cannot open it. This dashboard does not create that message.</p></div>
    <div className="evm-demo-grid">
      <Card className="evm-demo-result"><SectionHeading title="Stolen classical-key attempt" subtitle="Fake account · no authorization window" action={<Badge tone="demo">MOCKED</Badge>} /><div className="evm-mock-tx"><span>MOCK TRANSACTION</span><code>secp256k1 · transfer 10,000 uqor · fee cap 500 uqor</code><small>Target {MOCK_ATTACK_TRANSACTIONS.stolenClassicalKey.target}</small></div><Decision result={outsideWindow} /></Card>
      <Card className="evm-demo-result"><SectionHeading title="Window limit exceeded" subtitle="Fake bounded window · target in scope" action={<Badge tone="demo">MOCKED</Badge>} /><div className="evm-mock-tx"><span>MOCK TRANSACTION</span><code>secp256k1 · transfer 750,000 uqor · fee cap 1,000 uqor</code><small>Target {MOCK_ATTACK_TRANSACTIONS.exceedsValue.target}</small></div><div className="evm-mock-bound">Mock remaining value: {MOCK_EVM_DEMO.boundedWindow.remainingValueUqor.toString()} uqor · Mock transaction slots: {MOCK_EVM_DEMO.boundedWindow.remainingTransactions.toString()}</div><Decision result={overLimit} /></Card>
    </div>
    <p className="evm-demo-footnote">These outcomes are generated from fixed local mock inputs, not testnet observations. They do not prove on-chain protection and cannot sign or broadcast transactions.</p>
  </section>;
}

function Decision({ result }: { result: typeof outsideWindow }): JSX.Element {
  return <div className="evm-decision" role="status"><span className="evm-deny-mark"><Icon name="ban" size={15} /></span><div><strong>{result.title}</strong><p>{result.explanation}</p><small>Decision source: simulated-attack-result · height {result.currentHeight} · evaluated value incl. fee {result.totalValueUqor} uqor</small></div></div>;
}
