import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { loadEnv } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = mkdtempSync(join(tmpdir(), "qday-shield-api-"));
const source = [...readdirSync(resolve(root, "src", "security")).filter((name) => name.endsWith(".ts")).map((name) => resolve(root, "src", "security", name)), ...readdirSync(resolve(root, "server")).filter((name) => name.endsWith(".ts")).map((name) => resolve(root, "server", name))];
try {
  const program = ts.createProgram(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, skipLibCheck: true, types: [], rootDir: root, outDir: temporary, lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"] });
  const diagnostics = [...ts.getPreEmitDiagnostics(program), program.emit().diagnostics].flat().filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (diagnostics.length) {
    process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCurrentDirectory: ts.sys.getCurrentDirectory, getCanonicalFileName: (name) => name, getNewLine: () => ts.sys.newLine }));
    process.exitCode = 1;
  } else {
    writeFileSync(join(temporary, "package.json"), JSON.stringify({ type: "module" }));
    const childEnv = { ...loadEnv("development", root, "QDAY_"), ...process.env };
    const child = spawn(process.execPath, [join(temporary, "server", "main.js")], { stdio: "inherit", env: childEnv });
    child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); cleanup(); });
    process.on("SIGINT", () => child.kill("SIGINT"));
    process.on("SIGTERM", () => child.kill("SIGTERM"));
    function cleanup() {
      if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith("qday-shield-api-")) throw new Error("Refusing unsafe temp cleanup.");
      rmSync(temporary, { recursive: true, force: true });
    }
  }
} finally {
  if (process.exitCode !== undefined) {
    if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith("qday-shield-api-")) throw new Error("Refusing unsafe temp cleanup.");
    rmSync(temporary, { recursive: true, force: true });
  }
}
