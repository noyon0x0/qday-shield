import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(projectRoot, "src", "security");
const networkRoot = resolve(projectRoot, "src", "network");
const serverRoot = resolve(projectRoot, "server");
const temporaryRoot = mkdtempSync(join(projectRoot, ".qday-shield-test-build-"));

try {
  const sourceFiles = readdirSync(sourceRoot)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(sourceRoot, name))
    .concat(readdirSync(networkRoot).filter((name) => name.endsWith(".ts")).map((name) => join(networkRoot, name)))
    .concat(readdirSync(serverRoot).filter((name) => name.endsWith(".ts")).map((name) => join(serverRoot, name)));
  const program = ts.createProgram(sourceFiles, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    types: [],
    rootDir: projectRoot,
    outDir: temporaryRoot,
  });
  const diagnostics = [...ts.getPreEmitDiagnostics(program), program.emit().diagnostics];
  const errors = diagnostics.flat().filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getCanonicalFileName: (fileName) => fileName,
      getNewLine: () => ts.sys.newLine,
    }));
    process.exitCode = 1;
  } else {
    writeFileSync(join(temporaryRoot, "package.json"), JSON.stringify({ type: "module" }));
    const testFiles = [resolve(projectRoot, "tests", "policyEngine.test.mjs"), resolve(projectRoot, "tests", "api.test.mjs"), resolve(projectRoot, "tests", "network.test.mjs"), resolve(projectRoot, "tests", "evmWindow.test.mjs")];
    const result = spawnSync(process.execPath, ["--test", ...testFiles], {
      stdio: "inherit",
      env: { ...process.env, QDAY_SECURITY_CORE_ENTRY: pathToFileURL(join(temporaryRoot, "src", "security", "index.js")).href, QDAY_API_ENTRY: pathToFileURL(join(temporaryRoot, "server", "app.js")).href, QDAY_NETWORK_MONITOR_ENTRY: pathToFileURL(join(temporaryRoot, "src", "network", "qorechainMonitor.js")).href },
    });
    process.exitCode = result.status ?? 1;
    if (result.error) throw result.error;
  }
} finally {
  const tempBase = resolve(projectRoot);
  const target = resolve(temporaryRoot);
  if (dirname(target) !== tempBase || !basename(target).startsWith(".qday-shield-test-build-")) {
    throw new Error("Refusing to remove an unexpected security test output path.");
  }
  rmSync(target, { recursive: true, force: true });
}
