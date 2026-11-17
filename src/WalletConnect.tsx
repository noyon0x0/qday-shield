import { useEffect, useState } from "react";
import {
  getQorexNative,
  hasCapability,
} from "@qorechain/qorex-types";

type Eip1193Provider = {
  isMetaMask?: boolean;
  providers?: Eip1193Provider[];
  request: (args: {
    method: string;
    params?: unknown[];
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: any[]) => void
  ) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

const DIANA_CHAIN_ID = "0x2648";

export default function WalletConnect(props: { onNativeAddressChange: (address: string) => void }) {
  const [qorexAddress, setQorexAddress] = useState("");
  const [qorexStatus, setQorexStatus] = useState("Not Connected");
  const [qorexCanSignNative, setQorexCanSignNative] = useState(false);

  const [metaAddress, setMetaAddress] = useState("");
  const [metaChainId, setMetaChainId] = useState("");
  const [metaStatus, setMetaStatus] = useState("Not Connected");

  const [error, setError] = useState("");

  function getMetaMaskProvider() {
    const injected = window.ethereum;

    if (!injected) return undefined;

    return (
      injected.providers?.find((provider) => provider.isMetaMask) ??
      (injected.isMetaMask ? injected : undefined)
    );
  }

  // QoreX Native Wallet connection
  async function connectQoreX() {
    setError("");
    setQorexStatus("Connecting...");

    try {
      const native = getQorexNative();

      if (!native) {
        throw new Error(
          "QoreX not detected. Install and unlock the official QoreX extension."
        );
      }

      await native.enable("qorechain-diana");

      const key = await native.getKey("qorechain-diana");

      if (!key?.bech32Address) {
        throw new Error("QoreX did not return a valid Native address.");
      }

      setQorexAddress(key.bech32Address);
      props.onNativeAddressChange(key.bech32Address);
      setQorexCanSignNative(
        hasCapability(native, "signAndBroadcast")
      );
      setQorexStatus("Connected");
    } catch (err) {
      setQorexAddress("");
      setQorexCanSignNative(false);
      setQorexStatus("Connection Failed");
      setError(
        err instanceof Error ? err.message : "QoreX connection failed."
      );
    }
  }

  // MetaMask EVM connection
  async function connectMetaMask() {
    setError("");
    setMetaStatus("Connecting...");

    try {
      const provider = getMetaMaskProvider();

      if (!provider) {
        throw new Error(
          "MetaMask not detected. Install and unlock MetaMask."
        );
      }

      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (!accounts?.length) {
        throw new Error("No MetaMask account was approved.");
      }

      const chainId = (await provider.request({
        method: "eth_chainId",
      })) as string;

      setMetaAddress(accounts[0]);
      setMetaChainId(chainId);
      setMetaStatus(
        chainId.toLowerCase() === DIANA_CHAIN_ID
          ? "Connected"
          : "Wrong Network"
      );
    } catch (err) {
      setMetaAddress("");
      setMetaChainId("");
      setMetaStatus("Connection Failed");
      setError(
        err instanceof Error
          ? err.message
          : "MetaMask connection failed."
      );
    }
  }

  // Switch MetaMask to Diana Testnet
  async function switchToDiana() {
    const provider = getMetaMaskProvider();

    if (!provider) {
      setError("MetaMask is not available.");
      return;
    }

    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: DIANA_CHAIN_ID }],
      });
    } catch (err) {
      const walletError = err as { code?: number };

      if (walletError.code === 4902) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: DIANA_CHAIN_ID,
                chainName: "QoreChain Diana Testnet",
                nativeCurrency: {
                  name: "QOR",
                  symbol: "QOR",
                  decimals: 18,
                },
                rpcUrls: ["https://evm-testnet.qore.host"],
              },
            ],
          });
        } catch (addError) {
          setError(
            addError instanceof Error
              ? addError.message
              : "Could not add Diana Testnet."
          );
        }
      } else {
        setError(
          err instanceof Error ? err.message : "Network switch failed."
        );
      }
    }
  }

  // Keep MetaMask account and network status updated
  useEffect(() => {
    const provider = getMetaMaskProvider();

    if (!provider?.on) return;

    const handleAccounts = (accounts: string[]) => {
      setMetaAddress(accounts?.[0] ?? "");
      setMetaStatus(accounts?.length ? "Checking Network" : "Not Connected");
    };

    const handleChain = (chainId: string) => {
      setMetaChainId(chainId);
      setMetaStatus(
        metaAddress
          ? chainId.toLowerCase() === DIANA_CHAIN_ID
            ? "Connected"
            : "Wrong Network"
          : "Not Connected"
      );
    };

    provider.on("accountsChanged", handleAccounts);
    provider.on("chainChanged", handleChain);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccounts);
      provider.removeListener?.("chainChanged", handleChain);
    };
  }, [metaAddress]);

  return (
    <section style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <h2>Wallet Connections</h2>

      {/* QoreX */}
      <div style={cardStyle}>
        <h3>QoreX Native Wallet</h3>
        <p>Status: {qorexStatus}</p>

        {qorexAddress && (
          <>
            <p>Native Address:</p>
            <code>{qorexAddress}</code>
            <p>
              Network: Diana Testnet
            </p>
            <p>
              Native hybrid signing capability:{" "}
              {qorexCanSignNative ? "Available" : "Not Available"}
            </p>
          </>
        )}

        <button onClick={connectQoreX}>
          {qorexAddress ? "Reconnect QoreX" : "Connect QoreX"}
        </button>
      </div>

      {/* MetaMask */}
      <div style={cardStyle}>
        <h3>MetaMask EVM Wallet</h3>
        <p>Status: {metaStatus}</p>

        {metaAddress && (
          <>
            <p>EVM Address:</p>
            <code>{metaAddress}</code>
            <p>Chain ID: {parseInt(metaChainId || "0", 16)}</p>
          </>
        )}

        {!metaAddress ? (
          <button onClick={connectMetaMask}>
            Connect MetaMask
          </button>
        ) : metaChainId.toLowerCase() !== DIANA_CHAIN_ID ? (
          <button onClick={switchToDiana}>
            Switch to Diana Testnet
          </button>
        ) : (
          <p>Diana Testnet connected.</p>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: "crimson" }}>
          {error}
        </p>
      )}
    </section>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #8885",
  borderRadius: 12,
  padding: 18,
  display: "grid",
  gap: 10,
};