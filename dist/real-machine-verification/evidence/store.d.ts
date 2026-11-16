/**
 * Minimal evidence store: immutable files under one run's evidence directory.
 *
 * The capability's promise is "another machine can re-check this", which needs two
 * properties here and no more:
 *
 * - every item carries its sha256, so a reader can verify the bytes without
 *   trusting the report;
 * - a name is never reused. A second `environment` snapshot in the same run
 *   becomes `environment-2.json`, so a report that points at `environment.json`
 *   keeps pointing at the bytes it was written for.
 *
 * Archives, manifests and cross-batch verification are a later ticket's job
 * (ticket 07); this store deliberately does not grow a manifest format yet.
 */
import type { EvidenceItem, EvidenceItemRef, EvidenceKind } from "../contracts/evidence-contract";
import type { ClockPort, FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
export interface EvidenceRecordOptions {
    /** Overrides the default kind for `recordText` (e.g. `command` or `log-slice`). */
    readonly kind?: EvidenceKind;
    /** Human sentence stored in the item, mirroring the check's `detail`. */
    readonly note?: string;
    /** Overrides the clock; tests pin it so `capturedAt` is deterministic. */
    readonly capturedAt?: string;
}
/** Options for adopting a file that was written by someone else (an adapter's screenshot). */
export interface EvidenceFileOptions {
    /** Defaults from the extension: images are `screenshot`, `.json` is `json`, the rest `file`. */
    readonly kind?: EvidenceKind;
    /** Human sentence stored in the item, mirroring the check's `detail`. */
    readonly note?: string;
    /** Overrides the clock; tests pin it so `capturedAt` is deterministic. */
    readonly capturedAt?: string;
}
/** One run's evidence directory, with the items recorded so far. */
export interface EvidenceStore {
    /** Absolute directory the items are written to. */
    readonly root: string;
    /** Items in recording order (a copy, so callers cannot mutate the log). */
    items(): readonly EvidenceItem[];
    recordText(name: string, content: string, options?: EvidenceRecordOptions): Promise<Result<EvidenceItem>>;
    recordJson(name: string, value: unknown, options?: EvidenceRecordOptions): Promise<Result<EvidenceItem>>;
    /**
     * Adopt a file that already exists under `root`, measuring and hashing the
     * bytes on disk. This is how an artifact written by a port (the browser's
     * screenshot) enters the evidence log: a path in a report without a digest is
     * not evidence, because a reader cannot tell whether the bytes changed.
     *
     * The file is not renamed or copied. Adopting the same path twice is
     * idempotent when the bytes still match, and a conflict when they do not — an
     * item path must never refer to two different byte strings.
     */
    recordFile(path: string, options?: EvidenceFileOptions): Promise<Result<EvidenceItem>>;
}
export interface CreateEvidenceStoreOptions {
    readonly fs: FsPort;
    readonly root: string;
    readonly clock: ClockPort;
}
/** Trim the full items down to the references a `CheckResult` carries. */
export declare function evidenceRefs(items: readonly EvidenceItem[]): readonly EvidenceItemRef[];
/**
 * Create the store for one run.
 *
 * The directory is created lazily on the first recorded item, so a run whose
 * checks only read files leaves no empty evidence directory behind.
 */
export declare function createEvidenceStore(options: CreateEvidenceStoreOptions): EvidenceStore;
