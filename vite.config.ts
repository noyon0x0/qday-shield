import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Browser REST reads use the fixed Diana testnet endpoint through /lcd to avoid
// relying on public CORS behavior. EVM JSON-RPC uses the fixed testnet endpoint.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = "https://api-testnet.qore.host";
  const proxy = {
    "/api": { target: env.QDAY_API_PROXY_TARGET || "http://127.0.0.1:4174", changeOrigin: false },
    "/lcd": { target, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/lcd/, "") },
  };
  return {
    plugins: [react()],
    server: { port: 5173, proxy },
    preview: { proxy },
  };
});
