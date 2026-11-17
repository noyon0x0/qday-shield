import { useState } from "react";
import {
  BrowserProvider,
  Contract,
  ContractFactory,
  formatEther,
  parseEther,
  type InterfaceAbi,
} from "ethers";

import abiText from "../contracts/artifacts/contracts_src_QDayShieldPolicy_sol_QDayShieldPolicy.abi?raw";
import bytecodeText from "../contracts/artifacts/contracts_src_QDayShieldPolicy_sol_QDayShieldPolicy.bin?raw";

const ABI = JSON.parse(abiText) as InterfaceAbi;
const BYTECODE = `0x${bytecodeText.trim()}`;
const CHAIN_ID = 9800n;

export default function OnChainPolicy() {
  const [address, setAddress] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState("");
  const [owner, setOwner] = useState("");
  const [currentReviewer, setCurrentReviewer] = useState("");
  const [balance, setBalance] = useState("0");
  const [spent, setSpent] = useState("0");
  const [paused, setPaused] = useState(false);
  const [nonce, setNonce] = useState("0");
  const [busy, setBusy] = useState(false);

  async function getSigner() {
    if (!window.ethereum) throw new Error("MetaMask not detected.");

    const provider = new BrowserProvider(window.ethereum as any);
    const network = await provider.getNetwork();

    if (network.chainId !== CHAIN_ID) {
      throw new Error("Switch MetaMask to QoreChain Diana Testnet (Chain ID 9800).");
    }

    await provider.send("eth_requestAccounts", []);
    return { provider, signer: await provider.getSigner() };
  }

  async function deploy() {
    setBusy(true);
    setError("");
    setStatus("Waiting for deployment...");

    try {
      const { signer } = await getSigner();
      const ownerAddress = await signer.getAddress();

      if (!reviewer.trim()) throw new Error("Enter a separate reviewer wallet address.");

      const reviewerAddress = reviewer.trim();

      if (!/^0x[a-fA-F0-9]{40}$/.test(reviewerAddress)) {
        throw new Error("Invalid reviewer address.");
      }

      if (ownerAddress.toLowerCase() === reviewerAddress.toLowerCase()) {
        throw new Error("Owner and reviewer must be different wallets.");
      }

      const factory = new ContractFactory(ABI, BYTECODE, signer);
      const instance = await factory.deploy(reviewerAddress);

      setStatus("Deployment transaction submitted. Waiting for confirmation...");
      await instance.waitForDeployment();

      const deployedAddress = await instance.getAddress();
      setAddress(deployedAddress);
      setStatus("Deployment confirmed. Refreshing contract state...");
      await refresh(deployedAddress);
      setStatus("Contract deployed and confirmed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deployment failed.");
      setStatus("Deployment failed");
    } finally {
      setBusy(false);
    }
  }

  async function refresh(target = address) {
    if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
      throw new Error("Enter a valid deployed contract address.");
    }

    const { provider } = await getSigner();
    const instance = new Contract(target, ABI, provider);

    const [o, r, b, s, p, n] = await Promise.all([
      instance.owner(),
      instance.reviewer(),
      instance.getVaultBalance(),
      instance.totalSpent(),
      instance.emergencyPaused(),
      instance.transferNonce(),
    ]);

    setOwner(String(o));
    setCurrentReviewer(String(r));
    setBalance(formatEther(b));
    setSpent(formatEther(s));
    setPaused(Boolean(p));
    setNonce(String(n));
  }

  async function transact(action: (contract: Contract) => Promise<unknown>) {
    setBusy(true);
    setError("");

    try {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error("Enter a valid deployed contract address.");
      }

      const { signer } = await getSigner();
      const contract = new Contract(address, ABI, signer);
      const tx = await action(contract) as { wait: () => Promise<unknown> };

      setStatus("Transaction submitted. Waiting for confirmation...");
      await tx.wait();
      await refresh();
      setStatus("Transaction confirmed on Diana Testnet.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  function validRecipient() {
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())) {
      throw new Error("Enter a valid recipient address.");
    }
    return recipient.trim();
  }

  function validAmount() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Enter a valid positive amount.");
    }
    return parseEther(amount);
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h2>On-chain Policy Controls</h2>
      <p>QDayShieldPolicy · Diana Testnet · EVM</p>

      <div style={panel}>
        <h3>1. Deploy Policy Contract</h3>
        <label>Independent Reviewer Wallet</label>
        <input value={reviewer} onChange={e => setReviewer(e.target.value)}
          placeholder="0x... reviewer address" style={field} />
        <button disabled={busy} onClick={() => void deploy()}>
          {busy ? "Please wait..." : "Deploy Contract"}
        </button>
      </div>

      <div style={panel}>
        <h3>2. Connect Existing Contract</h3>
        <label>Contract Address</label>
        <input value={address} onChange={e => setAddress(e.target.value)}
          placeholder="0x... deployed contract" style={field} />
        <button disabled={busy} onClick={() => void refresh()}>
          Read On-chain State
        </button>
      </div>

      {owner && (
        <div style={panel}>
          <h3>Verified Contract Reads</h3>
          <p><b>Owner:</b> <code>{owner}</code></p>
          <p><b>Reviewer:</b> <code>{currentReviewer}</code></p>
          <p><b>Vault balance:</b> {balance} QOR</p>
          <p><b>Total spent:</b> {spent} QOR</p>
          <p><b>Transfer nonce:</b> {nonce}</p>
          <p><b>Emergency pause:</b> {paused ? "ACTIVE" : "INACTIVE"}</p>
          <button disabled={busy} onClick={() => void refresh()}>
            Refresh State
          </button>
        </div>
      )}

      <div style={panel}>
        <h3>3. Recipient Allowlist</h3>
        <input value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder="Recipient wallet address" style={field} />
        <button disabled={busy} onClick={() => void transact(c =>
          c.setRecipient(validRecipient(), true))}>
          Allow Recipient
        </button>
        <button disabled={busy} onClick={() => void transact(c =>
          c.setRecipient(validRecipient(), false))}>
          Remove Recipient
        </button>
      </div>

      <div style={panel}>
        <h3>4. Reviewer Approval</h3>
        <p>Connect the separate Reviewer wallet in MetaMask before approving.</p>
        <input value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Amount in QOR" style={field} />
        <button disabled={busy} onClick={() => void transact(c =>
          c.approveTransfer(validRecipient(), validAmount()))}>
          Approve Transfer
        </button>
      </div>

      <div style={panel}>
        <h3>5. Execute Transfer</h3>
        <p>Connect the Owner wallet. Transfers above the approval threshold need reviewer approval.</p>
        <button disabled={busy} onClick={() => void transact(c =>
          c.executeTransfer(validRecipient(), validAmount()))}>
          Execute Transfer
        </button>
      </div>

      <div style={panel}>
        <h3>6. Emergency Controls</h3>
        <button disabled={busy} onClick={() => void transact(c =>
          c.setEmergencyPause(true))}>
          Activate Emergency Pause
        </button>
        <button disabled={busy} onClick={() => void transact(c =>
          c.setEmergencyPause(false))}>
          Deactivate Emergency Pause
        </button>
        <button disabled={busy} onClick={() => void transact(c =>
          c.emergencyRecover())}>
          Recover Remaining Vault Funds
        </button>
      </div>

      <div role="status">{status}</div>
      {error && <p role="alert" style={{ color: "crimson" }}>{error}</p>}
      <p style={{ fontSize: 12, opacity: 0.75 }}>
        Transactions require MetaMask confirmation and Diana Testnet gas.
        Contract reads from this component are not dual-RPC verified.
      </p>
    </section>
  );
}

const panel: React.CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  border: "1px solid #8885",
  borderRadius: 12,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: 10,
  borderRadius: 8,
  border: "1px solid #8888",
  background: "transparent",
  color: "inherit",
};

