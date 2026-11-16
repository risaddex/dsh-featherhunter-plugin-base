/**
 * Reading and writing `evidence.json`, the batch-level evidence manifest.
 *
 * Two rules from the spec shape this file:
 *
 * - The manifest is immutable once written for a path: adding more evidence
 *   appends items, it never replaces the ones already recorded. A path that is
 *   already in the manifest keeps its sha256 for life; new content for the same
 *   logical artifact must be stored under a new (ordinal) file name.
 * - `candidate` is injected by the command layer from the batch record. It is a
 *   reserved key: `extra` is flattened first and skipped for every reserved key,
 *   and `candidate` is written last, so no extra field can shadow it. Re-merging
 *   a manifest also refuses to change an existing candidate.
 *
 * The file is written to a temporary name and moved into place because a
 * half-written manifest parses as neither the old nor the new one.
 */
import { type EvidenceManifest, type EvidenceManifestItem } from "../contracts/evidence-contract";
import type { FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
/** Canonical file name of the evidence manifest inside the evidence package. */
export declare const EVIDENCE_MANIFEST_FILENAME = "evidence.json";
/** One check conclusion recorded by `evidence add --check <id>=pass|fail`. */
export interface EvidenceCheckLine {
    readonly name: string;
    readonly ok: boolean;
    readonly detail: string;
    readonly recordedAt: string;
}
/** Everything needed to build (or merge into) a manifest. */
export interface BuildEvidenceManifestInput {
    readonly generatedAt: string;
    readonly batch: EvidenceManifest["batch"];
    readonly meta: Readonly<Record<string, string>>;
    readonly summary: Readonly<Record<string, unknown>>;
    readonly checks: readonly EvidenceCheckLine[];
    readonly items: readonly EvidenceManifestItem[];
    readonly extra?: Readonly<Record<string, unknown>>;
    readonly candidate?: Readonly<Record<string, unknown>>;
}
/**
 * Assemble a manifest with a stable field order: contract fields first, then
 * extra fields (reserved keys skipped), then the command-layer `candidate`
 * last so it is authoritative by construction.
 */
export declare function buildEvidenceManifest(input: BuildEvidenceManifestInput): EvidenceManifest;
/**
 * Validate an arbitrary JSON value as an `EvidenceManifest`.
 *
 * Unknown top-level keys are allowed (they are the `extra` channel); everything
 * the rest of the code reads is checked so a corrupt manifest fails at the
 * boundary instead of deep inside report rendering.
 */
export declare function validateEvidenceManifest(value: unknown): Result<EvidenceManifest>;
/** A manifest read back from disk, with the bytes that were hashed. */
export interface LoadedEvidenceManifest {
    readonly manifest: EvidenceManifest;
    readonly manifestPath: string;
    readonly content: string;
    readonly manifestSha256: string;
}
/** Read and validate `evidence.json`; `ok(null)` when the batch has none yet. */
export declare function loadEvidenceManifest(fs: FsPort, evidenceRoot: string): Promise<Result<LoadedEvidenceManifest | null>>;
/**
 * Merge a new observation into an existing manifest.
 *
 * Items are appended, never replaced: the same path with the same sha256 is a
 * duplicate (kept once), the same path with a different hash is a conflict the
 * caller must resolve with a new file name. The candidate is sticky — it can be
 * introduced, but never changed by a later add.
 */
export declare function mergeEvidenceManifest(existing: EvidenceManifest, input: BuildEvidenceManifestInput): Result<EvidenceManifest>;
/** Options for writing `evidence.json`. */
export interface WriteEvidenceManifestOptions {
    readonly fs: FsPort;
    readonly evidenceRoot: string;
    readonly manifest: EvidenceManifest;
    /** Allow replacing an existing manifest (only for the merge path, never a fresh package). */
    readonly replace?: boolean;
}
/** Result of a successful manifest write. */
export interface WrittenEvidenceManifest {
    readonly manifest: EvidenceManifest;
    readonly manifestPath: string;
    readonly content: string;
    readonly manifestSha256: string;
}
/** Write `evidence.json` atomically (temporary file, then move). */
export declare function writeEvidenceManifest(options: WriteEvidenceManifestOptions): Promise<Result<WrittenEvidenceManifest>>;
