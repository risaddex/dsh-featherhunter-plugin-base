/**
 * Branded primitives.
 *
 * A `CommitSha` is a `string` that has already been checked against
 * `COMMIT_SHA_RE`. Branding means a raw string can never drift into a field the
 * rest of the capability assumes is a hash, and every value still carries the
 * rule that produced it. Parse first, then the type is proof.
 */
import { type Result } from "./result";
declare const brand: unique symbol;
/** A value of `TValue` that has passed the named validation `TTag`. */
export type Brand<TValue, TTag extends string> = TValue & {
    readonly [brand]: TTag;
};
/** 40 lowercase hexadecimal characters, as produced by `git rev-parse`. */
export type CommitSha = Brand<string, "CommitSha">;
/** 64 lowercase hexadecimal characters, as produced by `sha256sum`. */
export type Sha256Hex = Brand<string, "Sha256Hex">;
/** A batch directory name: safe as a single path segment, never `.` or `..`. */
export type BatchName = Brand<string, "BatchName">;
/** A stable check id: lowercase kebab-case, referenced by gates and comments. */
export type CheckId = Brand<string, "CheckId">;
/** A DSH profile name (the directory under `<home>/profiles/`). */
export type ProfileName = Brand<string, "ProfileName">;
/** A relative path inside an evidence directory, always `/`-separated. */
export type EvidencePath = Brand<string, "EvidencePath">;
export declare const COMMIT_SHA_RE: RegExp;
export declare const SHA256_RE: RegExp;
/** Same rule as the batch tooling: at least one alphanumeric, no separators. */
export declare const BATCH_NAME_RE: RegExp;
export declare const CHECK_ID_RE: RegExp;
export declare const PROFILE_NAME_RE: RegExp;
/** Parse a git commit sha, or explain exactly what was expected. */
export declare function parseCommitSha(value: unknown): Result<CommitSha>;
/** Parse a sha256 digest. */
export declare function parseSha256Hex(value: unknown): Result<Sha256Hex>;
/** Parse a batch name that is safe as one directory segment. */
export declare function parseBatchName(value: unknown): Result<BatchName>;
/** Parse a check id. */
export declare function parseCheckId(value: unknown): Result<CheckId>;
/** Parse a profile name. The value is a directory name, not a fixed vocabulary. */
export declare function parseProfileName(value: unknown): Result<ProfileName>;
/** Narrow an already-validated value; used when a caller owns the proof. */
export declare function asEvidencePath(value: string): EvidencePath;
export {};
