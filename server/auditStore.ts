import { createHash } from "node:crypto";
import { chmod, mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { AuditRecord, AuditVerification, JsonObject } from "../src/security/types.js";

const GENESIS = "0".repeat(64);
const HASH_FIELDS = ["sequence", "eventType", "occurredAt", "details", "previousHash"] as const;
function canonical(record: Pick<AuditRecord, typeof HASH_FIELDS[number]>): string {
  return JSON.stringify(HASH_FIELDS.map((field) => record[field]));
}
function hashRecord(record: Pick<AuditRecord, typeof HASH_FIELDS[number]>): string {
  return createHash("sha256").update(canonical(record)).digest("hex");
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validRecord(value: unknown, sequence: number, previousHash: string): value is AuditRecord {
  if (!isObject(value) || value.sequence !== sequence || value.previousHash !== previousHash) return false;
  if (!Number.isSafeInteger(value.occurredAt) || typeof value.occurredAt !== "number") return false;
  if (value.eventType !== "decision" && value.eventType !== "control") return false;
  if (!isObject(value.details) || typeof value.hash !== "string") return false;
  const candidate = value as unknown as AuditRecord;
  return /^[a-f0-9]{64}$/.test(candidate.hash) && candidate.hash === hashRecord(candidate);
}

export class FileAuditStore {
  private readonly filePath: string;
  private records: AuditRecord[] = [];
  private initialized = false;
  private compromised = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(directory: string) { this.filePath = resolve(directory, "audit.jsonl"); }
  get path(): string { return this.filePath; }

  async initialize(): Promise<AuditVerification> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.filePath), 0o700);
    let contents = "";
    let fileExists = false;
    try { contents = await readFile(this.filePath, "utf8"); fileExists = true; }
    catch (error) {
      if (!isObject(error) || error.code !== "ENOENT") throw error;
    }
    if (fileExists) await chmod(this.filePath, 0o600);
    const lines = contents === "" ? [] : contents.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const parsed: AuditRecord[] = [];
    let previousHash = GENESIS;
    for (let index = 0; index < lines.length; index += 1) {
      let item: unknown;
      try { item = JSON.parse(lines[index]); }
      catch { this.compromised = true; break; }
      if (!validRecord(item, index + 1, previousHash)) { this.compromised = true; break; }
      parsed.push(item);
      previousHash = item.hash;
    }
    this.records = parsed;
    this.initialized = true;
    return this.verify();
  }

  async append(event: { eventType: AuditRecord["eventType"]; occurredAt: number; details: JsonObject }): Promise<AuditRecord> {
    return this.serialize(async () => {
      if (!this.initialized) throw new Error("Audit store is not initialized.");
      if (this.compromised) throw new Error("Audit integrity failure; writes are disabled.");
      if (!Number.isSafeInteger(event.occurredAt) || !isObject(event.details)) throw new TypeError("Invalid audit event.");
      const previousHash = this.records.at(-1)?.hash ?? GENESIS;
      const unsigned = { sequence: this.records.length + 1, eventType: event.eventType, occurredAt: event.occurredAt, details: event.details, previousHash };
      const record: AuditRecord = Object.freeze({ ...unsigned, hash: hashRecord(unsigned) });
      const handle = await open(this.filePath, "a", 0o600);
      try { await handle.writeFile(`${JSON.stringify(record)}\n`, { encoding: "utf8" }); await handle.sync(); }
      finally { await handle.close(); }
      this.records.push(record);
      return record;
    });
  }

  async list(limit = 100): Promise<readonly AuditRecord[]> {
    await this.queue;
    return Object.freeze(this.records.slice(-limit).reverse());
  }

  async verify(): Promise<AuditVerification> {
    await this.queue;
    if (this.compromised) return Object.freeze({ valid: false, recordsChecked: this.records.length, failingSequence: this.records.length + 1, reason: "Malformed, modified, or reordered audit record detected." });
    let contents = "";
    try { contents = await readFile(this.filePath, "utf8"); }
    catch (error) {
      if (isObject(error) && error.code === "ENOENT" && this.records.length === 0) return Object.freeze({ valid: true, recordsChecked: 0 });
      this.compromised = true;
      return Object.freeze({ valid: false, recordsChecked: 0, failingSequence: 1, reason: "Audit file is unavailable." });
    }
    const lines = contents === "" ? [] : contents.split("\n");
    if (lines.at(-1) === "") lines.pop();
    let previousHash = GENESIS;
    for (let index = 0; index < lines.length; index += 1) {
      let candidate: unknown;
      try { candidate = JSON.parse(lines[index]); }
      catch {
        this.compromised = true;
        return Object.freeze({ valid: false, recordsChecked: index, failingSequence: index + 1, reason: "Malformed, modified, or reordered audit record detected." });
      }
      if (!validRecord(candidate, index + 1, previousHash)) {
        this.compromised = true;
        return Object.freeze({ valid: false, recordsChecked: index, failingSequence: index + 1, reason: "Audit hash chain verification failed." });
      }
      const record = candidate;
      if (this.records[index]?.hash !== record.hash || this.records.length !== lines.length) {
        this.compromised = true;
        return Object.freeze({ valid: false, recordsChecked: index, failingSequence: index + 1, reason: "Persisted audit history differs from the verified in-process history." });
      }
      previousHash = record.hash;
    }
    if (this.records.length !== lines.length) {
      this.compromised = true;
      return Object.freeze({ valid: false, recordsChecked: lines.length, failingSequence: lines.length + 1, reason: "Persisted audit history differs from the verified in-process history." });
    }
    return Object.freeze({ valid: true, recordsChecked: this.records.length });
  }

  async reloadAndVerify(): Promise<AuditVerification> {
    this.initialized = false;
    this.compromised = false;
    return this.initialize();
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
}
