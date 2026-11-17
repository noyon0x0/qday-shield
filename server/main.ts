import { createQDayApi, loadApiConfig } from "./app.js";

async function main(): Promise<void> {
  const config = loadApiConfig();
  const api = createQDayApi({ config });
  await api.initialize();
  api.server.listen(config.port, config.host, () => {
    process.stdout.write(`Q-Day local API listening on ${config.host}:${config.port} (DEMO MODE · SIMULATION ONLY).\n`);
  });
  const close = (): void => { api.server.close(() => { process.exitCode = 0; }); };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}

void main().catch(() => {
  // Startup diagnostics intentionally omit exception details and configuration values.
  process.stderr.write("Q-Day API failed to start; check local configuration and audit file permissions.\n");
  process.exitCode = 1;
});
