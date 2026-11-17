import type { AuditRecord, AuditVerification, JsonObject, JsonValue } from "./types.js";

const GENESIS_HASH = "0".repeat(64);
const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Append-only, hash-linked records for the local simulator. This is not on-chain storage. */
export class TamperEvidentAuditLog {
  private entries: AuditRecord[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  get records(): readonly AuditRecord[] {
    return Object.freeze(this.entries.map((entry) => freezeRecord(entry)));
  }

  async append(event: { eventType: AuditRecord["eventType"]; occurredAt: number; details: JsonObject }): Promise<AuditRecord> {
    if (!Number.isFinite(event.occurredAt)) throw new TypeError("Audit timestamp must be finite.");
    const normalizedDetails = parseCanonicalObject(event.details);
    const write = this.writeQueue.then(async () => {
      const sequence = this.entries.length + 1;
      const previousHash = this.entries.at(-1)?.hash ?? GENESIS_HASH;
      const body = { sequence, eventType: event.eventType, occurredAt: event.occurredAt, details: normalizedDetails, previousHash };
      const hash = await digest(canonicalJson(body));
      const record = freezeRecord({ ...body, hash });
      this.entries.push(record);
      return freezeRecord(record);
    });
    this.writeQueue = write.then(() => undefined, () => undefined);
    return write;
  }

  async verify(): Promise<AuditVerification> {
    return TamperEvidentAuditLog.verifyRecords(this.records);
  }

  static async verifyRecords(records: readonly AuditRecord[]): Promise<AuditVerification> {
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const sequence = index + 1;
      if (!record || record.sequence !== sequence) {
        return { valid: false, recordsChecked: index, failingSequence: sequence, reason: "Audit sequence is missing or out of order." };
      }
      if (record.previousHash !== previousHash) {
        return { valid: false, recordsChecked: index, failingSequence: sequence, reason: "Previous-record hash does not match the chain." };
      }
      if (!HASH_PATTERN.test(record.hash)) {
        return { valid: false, recordsChecked: index, failingSequence: sequence, reason: "Record hash has an invalid format." };
      }
      try {
        const body = {
          sequence: record.sequence,
          eventType: record.eventType,
          occurredAt: record.occurredAt,
          details: parseCanonicalObject(record.details),
          previousHash: record.previousHash,
        };
        const expectedHash = await digest(canonicalJson(body));
        if (expectedHash !== record.hash) {
          return { valid: false, recordsChecked: index, failingSequence: sequence, reason: "Record contents do not match their stored hash." };
        }
      } catch {
        return { valid: false, recordsChecked: index, failingSequence: sequence, reason: "Record contains invalid audit data." };
      }
      previousHash = record.hash;
    }
    return { valid: true, recordsChecked: records.length };
  }
}

function parseCanonicalObject(input: JsonObject): JsonObject {
  const parsed = JSON.parse(canonicalJson(input)) as JsonValue;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new TypeError("Audit details must be a JSON object.");
  return parsed as JsonObject;
}

function canonicalJson(value: JsonValue | Record<string, unknown>): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Audit data cannot contain non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map((item) => canonicalJson(item)).join(",") + "]";
  if (typeof value !== "object") throw new TypeError("Audit data must contain JSON-compatible values only.");
  const keys = Object.keys(value).sort();
  return "{" + keys.map((key) => JSON.stringify(key) + ":" + canonicalJson(value[key] as JsonValue)).join(",") + "}";
}

async function digest(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("Web Crypto SHA-256 is unavailable; audit writes fail closed.");
  const bytes = new TextEncoder().encode(value);
  const hash = await subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function freezeRecord(record: AuditRecord): AuditRecord {
  const details = deepFreeze(JSON.parse(canonicalJson(record.details)) as JsonObject);
  return Object.freeze({ ...record, details });
}

function deepFreeze<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    if (Array.isArray(value)) value.forEach((item) => deepFreeze(item));
    else Object.values(value).forEach((item) => deepFreeze(item));
    Object.freeze(value);
  }
  return value;
}
