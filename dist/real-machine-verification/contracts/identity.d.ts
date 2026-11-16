import { type BatchName, type CommitSha, type Sha256Hex } from "./branding";
import { type Result } from "./result";
/** Version watermark for every persisted structure this capability writes. */
export declare const SCHEMA_VERSION = 1;
/** Lowercase hex sha256 of a UTF-8 string. */
export declare function sha256Text(text: string): Sha256Hex;
/** Lowercase hex sha256 of raw bytes. */
export declare function sha256Bytes(bytes: Uint8Array): Sha256Hex;
/**
 * JSON with object keys sorted at every depth, so two equivalent values always
 * produce the same bytes. `undefined` members are dropped (as `JSON.stringify`
 * does), `Date` is not supported, and numbers must be finite.
 */
export declare function canonicalJson(value: unknown): string;
/** One file in a digestible file set. `size` is informational; the digest uses path+sha256. */
export interface FileDigestEntry {
    /** `/`-separated relative path, as recorded in the package manifest. */
    readonly path: string;
    readonly size?: number;
    readonly sha256: string;
}
/**
 * The file-set digest (wire format, shared with the release integrity check).
 *
 * Algorithm, exactly: filter out entries whose `sha256` is not 64 hex characters,
 * sort by `path` using UTF-16 code-unit comparison (`Array.prototype.sort` default),
 * render one line per file as `<sha256><space><space><path>`, join with `\n`, and
 * sha256 the resulting UTF-8 text. No trailing newline, no normalize, no size.
 *
 * Returns a `Result` rather than throwing: a manifest with a bad digest is data
 * from the outside world, and the caller needs the reason, not a stack trace.
 */
export declare function digestOfFiles(entries: readonly FileDigestEntry[]): Result<Sha256Hex>;
/**
 * Language a machine-readable line is written in.
 *
 * Both languages are always read back; the language only decides what a writer
 * emits. Default stays Chinese so re-writing an existing record is a no-op.
 */
export type RecordLanguage = "zh" | "en";
/** The values a batch comment must carry so a release check can re-verify it. */
export interface IdentityBinding {
    readonly batchName: BatchName;
    readonly commit: CommitSha;
    readonly packageSha256: Sha256Hex;
}
/** The literal prefix of the identity line. Changing it breaks every stored comment. */
export declare const IDENTITY_LINE_PREFIX = "- \u9A8C\u8BC1\u8EAB\u4EFD\uFF1A";
/** English twin of {@link IDENTITY_LINE_PREFIX}; parsed on read, never written by the default writers. */
export declare const IDENTITY_LINE_PREFIX_EN = "- Verification identity: ";
/** Render the identity line. Rejects values that cannot round-trip through `parseIdentityLine`. */
export declare function formatIdentityLine(binding: IdentityBinding, language?: RecordLanguage): Result<string>;
/** Parse the identity line; strict on purpose, a near-miss means a near-miss batch. */
export declare function parseIdentityLine(line: string): Result<IdentityBinding>;
/** The local base a batch was opened against. */
export interface VerificationBase {
    readonly ref: string;
    readonly tip: CommitSha;
    readonly expectedVersion: string;
}
/** The literal prefix of the base line. */
export declare const BASE_LINE_PREFIX = "- \u9A8C\u8BC1\u57FA\u7EBF\uFF1A";
/** English twin of {@link BASE_LINE_PREFIX}; parsed on read, never written by the default writers. */
export declare const BASE_LINE_PREFIX_EN = "- Verification baseline: ";
/** Render the base line (`- 验证基线：本地 main <tip>；目标版本 1.2.3`). */
export declare function formatBaseLine(base: VerificationBase, language?: RecordLanguage): Result<string>;
/** Parse the base line. */
export declare function parseBaseLine(line: string): Result<VerificationBase>;
