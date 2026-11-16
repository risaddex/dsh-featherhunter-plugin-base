/**
 * Batch rules: a batch is the unit that binds one candidate to one set of
 * observations, and these are the functions that keep that binding honest.
 *
 * A batch file (`batch.json`) records three things: where the tree was when the
 * batch opened (`startHead` plus the baseline tip), which candidate was frozen
 * for it, and whether it is still valid. The rules below answer the two questions
 * that actually matter later:
 *
 * - *Is this batch still describing the code under test?* If main moved, or the
 *   integrator branch moved, the observations describe a tree nobody can find
 *   any more. Comparing only `HEAD` misses that: on an integration branch HEAD
 *   can sit still while the baseline advances for days.
 * - *Does this evidence belong to this batch?* Evidence collected against
 *   candidate A must never be counted under candidate B, so the identity triple
 *   is compared, not trusted.
 *
 * As with candidate rules: the caller reads git and the disk, these functions
 * decide. `null` means "could not determine" and is never treated as a pass.
 */
import type { BatchName, CommitSha } from "./branding";
import type { IdentityBinding, VerificationBase } from "./identity";
import { type Result } from "./result";
import type { CandidateIdentity } from "./candidate-rules";
/** Schema of `batch.json`. Bumped only with a migration note in DESIGN.md. */
export declare const BATCH_SCHEMA_VERSION = 1;
export type BatchStatus = "active" | "stale";
/** The baseline a batch was opened against. */
export interface BatchBase extends VerificationBase {
    /** True when the operator explicitly allowed verifying an outdated base. */
    readonly allowOutdated: boolean;
}
/** The persisted state of one verification batch. */
export interface BatchRecord {
    readonly schemaVersion: typeof BATCH_SCHEMA_VERSION;
    readonly batchName: BatchName;
    readonly batchDir: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly status: BatchStatus;
    readonly startHead: CommitSha;
    readonly startBranch: string;
    /** `null` is a real value: it means this batch recorded no baseline. */
    readonly base: BatchBase | null;
    readonly endHead?: CommitSha | null;
    readonly endCheckedAt?: string | null;
    readonly candidate?: CandidateIdentity | null;
    /** Result of the preflight that ran when the batch opened. */
    readonly preflightOk?: boolean | null;
}
/** Validate a batch record read from disk; normalizes a missing `base` to `null`. */
export declare function parseBatchRecord(value: unknown): Result<BatchRecord>;
export type FreshnessProblemCode = "head-moved" | "no-baseline" | "baseline-unreadable" | "baseline-advanced" | "outdated-base-allowed";
export interface FreshnessProblem {
    readonly code: FreshnessProblemCode;
    readonly message: string;
    readonly hint?: string;
}
export interface FreshnessFacts {
    readonly record: BatchRecord;
    readonly currentHead: CommitSha;
    /** Current tip of `record.base.ref`; `null` when it could not be read. */
    readonly baseTipNow: CommitSha | null;
    /** Why reading the baseline failed, when it did. */
    readonly baseReadError?: string;
}
export interface FreshnessVerdict {
    readonly status: BatchStatus;
    readonly endHead: CommitSha;
    readonly endCheckedAt: string;
    readonly problems: readonly FreshnessProblem[];
    /** One sentence: `active` means the observations still describe this batch. */
    readonly message: string;
}
/** Decide whether a batch still describes the tree under verification. */
export declare function judgeFreshness(facts: FreshnessFacts, checkedAt: string): FreshnessVerdict;
export interface EvidenceBindingFacts {
    readonly record: BatchRecord;
    readonly meta: {
        readonly batchName: string;
        readonly candidate?: {
            readonly batchName?: string;
            readonly commit?: string;
            readonly packageSha256?: string;
        };
    };
}
/** True when the evidence was collected against exactly this batch's candidate. */
export declare function judgeEvidenceBinding(facts: EvidenceBindingFacts): Result<IdentityBinding>;
/** Reason the batch cannot be used, or `null` when it is ready for evidence. */
export declare function batchBlockingReason(record: BatchRecord): string | null;
