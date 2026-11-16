/**
 * Verification of an evidence archive against its own SHA256SUMS.txt.
 *
 * The only trustworthy statement about an archive is "these bytes, in this
 * layout, hash to what the summary says". So verification is a recomputation,
 * not a trust exercise, and it reports four kinds of disagreement separately
 * because they mean different things:
 *
 * - `modified` — a listed file exists but hashes differently (tampering or
 *   corruption; the archive is no longer reproducible).
 * - `missing` — a listed file is gone.
 * - `extra` — a file exists in the archive that the summary does not list
 *   (something was dropped in after archiving).
 * - `malformed` — a summary line that is not `<sha256>  <path>`, or a path that
 *   violates the archive layout, or a duplicate. Format rot is reported even
 *   when every listed hash happens to check out.
 *
 * `notes/` and the root `SHA256SUMS.txt` are archive metadata: they are never
 * listed in the summary and never count as extra. Notes are returned separately
 * so a caller can render them without treating them as evidence.
 */
import { type Sha256Hex } from "../contracts/branding";
import type { FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
/** The four ways an archive can disagree with its summary. */
export type EvidenceArchiveIssueKind = "modified" | "missing" | "extra" | "malformed";
/** One disagreement, shaped for both human lines and `--json`. */
export interface EvidenceArchiveIssue {
    readonly kind: EvidenceArchiveIssueKind;
    /** Archive-relative path, when the issue is about a file. */
    readonly path?: string;
    /** 1-based line number in SHA256SUMS.txt, for `malformed`. */
    readonly line?: number;
    readonly expected?: string;
    readonly actual?: string;
    readonly message: string;
    readonly hint?: string;
}
/** One accepted line of SHA256SUMS.txt. */
export interface Sha256SumsEntry {
    readonly path: string;
    readonly sha256: Sha256Hex;
    readonly line: number;
}
/** Parse result: usable entries plus format problems found along the way. */
export interface Sha256SumsParseResult {
    readonly entries: readonly Sha256SumsEntry[];
    readonly issues: readonly EvidenceArchiveIssue[];
}
/**
 * Parse SHA256SUMS.txt strictly.
 *
 * The writer (see `renderSha256Sums`) terminates every line with `\n`, so a
 * well-formed file ends with exactly one newline; that final empty element is
 * dropped here. A missing final newline is tolerated (the last line is still
 * complete), but any other blank line is malformed. `\r` before the newline is
 * tolerated so a CRLF-transferred archive still verifies.
 */
export declare function parseSha256Sums(text: string): Sha256SumsParseResult;
/** Parsed-and-recomputed view of one archive. */
export interface EvidenceArchiveVerification {
    readonly directory: string;
    readonly sumsPath: string;
    /** How many listed entries were present and readable (modulo missing/malformed). */
    readonly checked: number;
    readonly ok: boolean;
    readonly issues: readonly EvidenceArchiveIssue[];
    readonly counts: Readonly<Record<EvidenceArchiveIssueKind, number>>;
    /** `notes/**` files, sorted; corrections, never evidence. */
    readonly annotations: readonly string[];
}
/** Inputs of `verifyEvidenceArchive`. */
export interface VerifyEvidenceArchiveOptions {
    readonly fs: FsPort;
    readonly directory: string;
}
/**
 * Recompute every hash in the archive and report the four issue classes.
 * `err` is reserved for "cannot verify at all" (no directory, no summary file).
 */
export declare function verifyEvidenceArchive(options: VerifyEvidenceArchiveOptions): Promise<Result<EvidenceArchiveVerification>>;
