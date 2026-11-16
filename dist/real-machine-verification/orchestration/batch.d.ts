/**
 * Batch orchestration: opening a batch, checking it is still fresh, and binding
 * evidence to the candidate the batch was opened on.
 *
 * A batch is the unit that keeps one candidate, one baseline and one set of
 * observations together. This module owns the three things that must not drift
 * apart:
 *
 * - `openBatch` snapshots HEAD, the baseline tip and the candidate, writes
 *   `batch.json`, and renders the two wire-format lines a release comment quotes;
 * - `checkBatch` re-reads the tree and judges freshness with the batch rules
 *   (HEAD unchanged *and* baseline not advanced; an unreadable baseline is a
 *   failure, never a pass), then scans the batch's evidence manifests and
 *   rejects every one that is not bound to this batch's candidate;
 * - `loadBatchContextForEvidence` gives the evidence command the batch context it
 *   needs to stamp the identity triple onto new evidence.
 *
 * Everything here goes through ports, so the tests drive the same code with an
 * in-memory git and filesystem and never touch the machine.
 */
import type { BatchName, CheckId, CommitSha, ProfileName, Sha256Hex } from "../contracts/branding";
import { type BatchBase, type BatchRecord, type FreshnessProblemCode, type FreshnessVerdict } from "../contracts/batch-rules";
import { type CandidateIdentity, type CandidateManifest, type CandidateProblem } from "../contracts/candidate-rules";
import { type CheckResult } from "../contracts/check";
import { type IdentityBinding } from "../contracts/identity";
import type { Ports } from "../contracts/ports";
import { type Failure, type FailureCode, type Result } from "../contracts/result";
import type { VerificationDeclaration } from "../declaration/loader";
export declare const BATCHES_DIRNAME = "batches";
export declare const BATCH_RECORD_FILENAME = "batch.json";
export declare const BATCH_CANDIDATES_DIRNAME = "candidates";
export declare const BATCH_CANDIDATE_FILENAME = "candidate.json";
/** Where all batches of one work root live. */
export declare function batchesRoot(workRoot: string): string;
/** The directory that belongs to one batch name. */
export declare function batchDirFor(workRoot: string, name: BatchName): string;
/** Which step produced the failure; the CLI prints it in `--json` mode. */
export type BatchStage = "context" | "candidate" | "baseline" | "record" | "evidence" | "io" | "conflict";
/**
 * A failure that knows whether it is "nothing proven" (exit 2) or "proven wrong"
 * (exit 1). The distinction is the whole reason batches exist: a missing
 * prerequisite must never look like a failed verification.
 */
export interface BatchFailure extends Failure {
    readonly stage: BatchStage;
    /** True when the run proves nothing and the caller should exit 2. */
    readonly blocked: boolean;
}
export interface BatchFailureOptions {
    readonly hint?: string;
    readonly blocked?: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
}
export declare function batchFailure(stage: BatchStage, code: FailureCode, message: string, options?: BatchFailureOptions): BatchFailure;
export interface LoadedBatchRecord {
    readonly record: BatchRecord;
    /** The JSON object exactly as stored, so annotations survive a status write. */
    readonly raw: Readonly<Record<string, unknown>>;
    readonly path: string;
    readonly batchDir: string;
    readonly text: string;
}
/** Read and validate `<batchDir>/batch.json`. */
export declare function loadBatchRecord(fs: Ports["fs"], batchDir: string): Promise<Result<LoadedBatchRecord, BatchFailure>>;
/** The newest batch record under the work root, by `createdAt`. */
export declare function latestBatchRecord(fs: Ports["fs"], workRoot: string): Promise<Result<LoadedBatchRecord, BatchFailure>>;
export interface ResolvedCandidate {
    readonly manifest: CandidateManifest;
    readonly manifestPath: string;
    readonly dir: string;
    /** sha256 of the candidate.json bytes; binds evidence to the manifest, not to the tarball. */
    readonly manifestSha256: Sha256Hex;
    readonly identity: CandidateIdentity;
}
/**
 * Resolve the candidate: an explicit `--candidate` file/directory, or the newest
 * manifest under `<workRoot>/candidates` (the directory freeze writes into).
 */
export declare function resolveCandidate(fs: Ports["fs"], workRoot: string, explicit: string | undefined): Promise<Result<ResolvedCandidate, BatchFailure>>;
export interface TargetPackage {
    readonly path: string;
    readonly name: string;
    readonly version: string;
}
/** The repository root's package.json: the version the working tree declares. */
export declare function readTargetPackage(fs: Ports["fs"], cwd: string): Promise<Result<TargetPackage, BatchFailure>>;
/** Read the commit a ref currently points at, via git (no shell interpolation). */
export declare function readRefTip(ports: Ports, cwd: string, ref: string): Promise<Result<CommitSha, BatchFailure>>;
export interface OpenBatchOptions {
    readonly ports: Ports;
    readonly cwd: string;
    readonly workRoot: string;
    /** Raw `--name`; omitted means a timestamped name. */
    readonly name?: string;
    /** Raw `--base-ref`; omitted means the explicit "no baseline" state. */
    readonly baseRef?: string;
    /** Raw `--candidate`; already resolved against the cwd by the caller. */
    readonly candidate?: string;
    readonly allowStale: boolean;
    readonly dryRun: boolean;
    readonly profile: VerificationDeclaration["profile"];
    readonly profileName: ProfileName;
    readonly declaration: VerificationDeclaration;
}
/**
 * How far `batch open` got.
 *
 * `batch open` is deliberately two-phase. Spec order says a candidate must be
 * frozen *after* the batch opened and *inside* the batch directory, so the flow
 * is: prepare the batch, `freeze --out <batchDir>/...`, then seal it with
 * `--candidate`. A sealed batch can be re-opened idempotently to print its two
 * wire-format lines again.
 */
export type BatchOpenPhase = "prepared" | "sealed" | "reused";
export interface OpenBatchOutcome {
    readonly record: BatchRecord;
    readonly raw: Readonly<Record<string, unknown>>;
    readonly batchDir: string;
    readonly batchFile: string;
    readonly phase: BatchOpenPhase;
    /** Null on a prepared batch: no identity line exists before a candidate is sealed. */
    readonly identity: IdentityBinding | null;
    readonly identityLine: string;
    readonly baseLine: string | null;
    readonly base: BatchBase | null;
    readonly candidate: CandidateIdentity | null;
    readonly candidatePath: string | null;
    /** Problems found when a candidate was measured; empty on prepare and on success. */
    readonly candidateProblems: readonly CandidateProblem[];
    readonly reused: boolean;
    readonly dryRun: boolean;
    readonly createdAt: string;
    readonly allowStale: boolean;
    readonly notes: readonly string[];
}
/**
 * The version the baseline ref declares, read without checking anything out.
 *
 * The old open path used the candidate's own version as "the baseline version",
 * which made the version rule compare a value to itself. Reading it from the
 * baseline is the only way the rule can fail for the reason it exists.
 */
export declare function readRefPackageVersion(ports: Ports, cwd: string, ref: string): Promise<Result<string, BatchFailure>>;
/**
 * Open (or re-open) one batch, in two phases.
 *
 * - Without `--candidate` it *prepares* a batch record: it snapshots HEAD and the
 *   baseline tip, reads the baseline's declared version, and writes `batch.json`
 *   with `candidate: null`. Re-running it is idempotent.
 * - With `--candidate` it *seals* a prepared batch: it measures the candidate
 *   (location inside the batch directory, age against the batch, HEAD, build
 *   commit, source stability, baseline ancestry, version, tarball digest and
 *   file digest) with the candidate rules and only then records the identity.
 *
 * Validation order matters for the exit code: a missing candidate, an unreadable
 * baseline or an ancestry question git cannot answer is a blocked prerequisite
 * (2), while a candidate that is provably wrong is a mismatch (1).
 */
export declare function openBatch(options: OpenBatchOptions): Promise<Result<OpenBatchOutcome, BatchFailure>>;
export type EvidenceRejectionReason = "batch-name" | "candidate-missing" | "batch-candidate-missing" | "candidate-batch-name" | "candidate-commit" | "candidate-package-sha256" | "manifest-invalid" | "manifest-unreadable";
export interface EvidenceBindingEntry {
    readonly path: string;
    /** Path relative to the batch directory, `/`-separated, for the report. */
    readonly relativePath: string;
    readonly status: "bound" | "rejected";
    readonly reason: EvidenceRejectionReason | null;
    readonly batchName: string | null;
    readonly commit: string | null;
    readonly packageSha256: string | null;
    readonly message: string | null;
    readonly expected: string | null;
    readonly actual: string | null;
    readonly hint: string | null;
}
export interface EvidenceScan {
    readonly root: string;
    readonly readable: boolean;
    readonly scanned: number;
    readonly bound: readonly EvidenceBindingEntry[];
    readonly rejected: readonly EvidenceBindingEntry[];
}
/** Walk the batch directory and bind every `evidence.json` to the record. */
export declare function scanBatchEvidence(fs: Ports["fs"], batchDir: string, record: BatchRecord): Promise<EvidenceScan>;
export type BatchCheckReason = FreshnessProblemCode | "git-unreadable" | "evidence-binding" | "evidence-scan" | "no-evidence" | "candidate-missing" | "candidate-unreadable" | "candidate-drift" | "record-invalid" | "record-write";
/** A check plus the machine-readable reason the CLI prints alongside it. */
export interface BatchCheck extends CheckResult {
    readonly reason: BatchCheckReason | null;
}
export declare const CHECK_HEAD_FRESH: CheckId;
export declare const CHECK_BASELINE_FRESH: CheckId;
export declare const CHECK_CANDIDATE: CheckId;
export declare const CHECK_EVIDENCE_BOUND: CheckId;
export declare const CHECK_BATCH_RECORD: CheckId;
export interface CheckBatchOptions {
    readonly ports: Ports;
    readonly cwd: string;
    readonly workRoot: string;
    /** Raw `--name`; omitted means the newest batch record. */
    readonly name?: string;
    readonly allowStale: boolean;
    readonly dryRun: boolean;
}
export interface CheckBatchOutcome {
    readonly record: BatchRecord;
    readonly raw: Readonly<Record<string, unknown>>;
    readonly batchDir: string;
    readonly batchFile: string;
    readonly identityLine: string;
    readonly baseLine: string | null;
    readonly checks: readonly BatchCheck[];
    readonly freshness: FreshnessVerdict | null;
    readonly evidence: EvidenceScan;
    readonly exitCode: 0 | 1 | 2;
    readonly allowedStale: boolean;
    readonly notes: readonly string[];
}
/**
 * Judge whether the batch still describes the tree, then bind its evidence.
 *
 * A tolerated staleness (explicit `--allow-stale`, or a baseline that was already
 * allowed when the batch opened) is reported as `skip` with the flag named in the
 * detail — never as `pass` and never silently. `--allow-stale` does not excuse an
 * unreadable baseline: an unreadable ref is not an unchanged ref.
 */
export declare function checkBatch(options: CheckBatchOptions): Promise<Result<CheckBatchOutcome, BatchFailure>>;
/** The batch context `evidence add` needs to stamp the identity triple. */
export interface BatchEvidenceContext {
    readonly batchName: BatchName;
    readonly batchDir: string;
    readonly workRoot: string;
    readonly candidate: Readonly<Record<string, unknown>>;
}
export interface BatchContextArgs {
    /** Raw `--batch` (preferred) or `--name`. */
    readonly batch?: string;
    readonly name?: string;
    readonly workRoot?: string;
}
export interface BatchContextDeps {
    readonly ports: Pick<Ports, "fs">;
    readonly cwd: string;
}
/**
 * Resolve the batch an evidence command is writing into.
 *
 * `ok(null)` when no batch was named: `evidence add` keeps its own default in that
 * case. A named batch with no record, or with no frozen candidate, is a blocked
 * prerequisite — writing evidence there could never be bound later.
 */
export declare function loadBatchContextForEvidence(args: BatchContextArgs, deps: BatchContextDeps): Promise<Result<BatchEvidenceContext | null, BatchFailure>>;
