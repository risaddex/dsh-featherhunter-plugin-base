/**
 * Small helpers shared by the built-in checks.
 *
 * Nothing here decides a status; the checks do. These helpers only keep the
 * "record a JSON snapshot of what I observed" step from being repeated five
 * times with slightly different failure handling.
 */
import type { EvidenceItemRef } from "../../contracts/evidence-contract";
import type { FsPort } from "../../contracts/ports";
import type { Failure, Result } from "../../contracts/result";
import type { EvidenceStore } from "../../evidence/store";
/** Record one JSON evidence item and return the reference a check carries. */
export declare function recordEvidence(store: EvidenceStore, name: string, value: Record<string, unknown>, note: string, warn: (message: string) => void): Promise<readonly EvidenceItemRef[]>;
/** A JSON object (not an array) from a port read, or `null`. */
export declare function asRecord(value: unknown): Record<string, unknown> | null;
/** A non-empty string field, or `null`. */
export declare function stringField(record: Record<string, unknown>, field: string): string | null;
/** Read a manifest file and insist it is a JSON object. */
export declare function readJsonRecord(fs: FsPort, path: string): Promise<Result<Record<string, unknown>, Failure>>;
