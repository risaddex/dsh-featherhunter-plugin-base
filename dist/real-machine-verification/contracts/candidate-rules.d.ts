/**
 * Candidate rules: what "the build under verification" means, and when it is
 * disqualified.
 *
 * A candidate is a frozen description of one build: commit, version, the npm
 * tarball, and the digest of every file inside it. The batch that verifies it
 * records that description, and every later step re-derives it from disk. The
 * point is not bookkeeping — it is that a report saying "version 1.9.0 passed"
 * is unfalsifiable, while a report naming a commit and a package digest can be
 * checked by someone who was not there.
 *
 * Everything here takes *facts*, never a port: the caller reads git and the disk,
 * these functions decide. That is what makes the rules testable and what keeps a
 * verification machine's local state out of the verdict.
 */
import type { CommitSha, Sha256Hex } from "./branding";
import { type Result } from "./result";
import { type VerificationBase } from "./identity";
/** The manifest schema this package understands. A different number is rejected loudly. */
export declare const CANDIDATE_SCHEMA_VERSION = 2;
/** One file inside the published tarball, with the digest measured at freeze time. */
export interface CandidatePackageFile {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: Sha256Hex;
}
/**
 * What the packaged client entry says about itself. The check is honest about
 * its limits: when the entry is absent or carries no recognizable constant the
 * status is `blocked`, never `ok`.
 */
export type CandidateEntryStatus = "ok" | "blocked" | "mismatch";
export interface CandidateEntryCheck {
    /** Profile-declared path inside the package, e.g. `dist/client/index.js`. */
    readonly clientEntry: string;
    readonly foundPackageName: string | null;
    readonly foundVersion: string | null;
    readonly status: CandidateEntryStatus;
    /** sha256 of the packaged entry file; null when the entry was not in the package. */
    readonly sha256: Sha256Hex | null;
}
/** The frozen build description written to `candidate.json`. */
export interface CandidateManifest {
    readonly schemaVersion: typeof CANDIDATE_SCHEMA_VERSION;
    readonly generatedAt: string;
    readonly tool: string;
    readonly version: string;
    /**
     * `release` only when the working tree was clean; a dirty build is `development`
     * and must never be published by accident.
     */
    readonly validity: "release" | "development";
    /** True only when HEAD and the dirty set were unchanged across the whole build. */
    readonly sourceStable: boolean;
    readonly git: {
        readonly commit: CommitSha;
        readonly branch: string;
        readonly dirty: boolean;
        /** Sorted porcelain paths observed at freeze time; evidence for `dirty`. */
        readonly dirtyFiles: readonly string[];
    };
    readonly package: {
        readonly tgzPath: string;
        readonly tgzBytes: number;
        readonly tgzSha256: Sha256Hex;
        readonly filename: string;
        readonly npmShasum?: string;
        readonly npmIntegrity?: string;
        readonly files: readonly CandidatePackageFile[];
        readonly fileCount: number;
        /** Digest over `files` (path + sha256), independent of the tarball packaging. */
        readonly fileDigest: Sha256Hex;
        /** Digest over the packed package.json plus the source commit; notices version/commit-only rebuilds. */
        readonly manifestDigest: Sha256Hex;
        /** Commit compiled into the client bundle; must equal `git.commit` when present. */
        readonly buildCommit?: CommitSha | null;
    };
    /** What the packaged client entry declares. Absent when it could not be inspected. */
    readonly entry?: CandidateEntryCheck;
    /** Free-form but stable caveats, e.g. "no build commit embedded". */
    readonly notes?: readonly string[];
}
/**
 * Digest over the package manifest plus the source commit. Unlike `fileDigest`
 * (file contents only) this notices version/commit changes that leave every
 * file byte identical, which is what makes a rebuild comparable.
 */
export declare function packageManifestDigest(packageManifest: unknown, commit: CommitSha): Sha256Hex;
/** The identity a batch stores: enough to recognize the candidate without the manifest. */
export interface CandidateIdentity {
    /** Path to `candidate.json`. */
    readonly path: string;
    /** sha256 of the manifest file itself, so a rewritten manifest is detectable. */
    readonly sha256: Sha256Hex;
    readonly commit: CommitSha;
    readonly version: string;
    readonly validity: "release" | "development";
    readonly tgzPath: string;
    readonly tgzSha256: Sha256Hex;
    readonly fileDigest: Sha256Hex;
    readonly manifestDigest: Sha256Hex;
}
/** Why a candidate is unusable. Codes are stable; messages are for humans. */
export type CandidateProblemCode = "schema-version" | "invalid-shape" | "not-in-batch-dir" | "older-than-batch" | "head-mismatch" | "build-commit-mismatch" | "source-unstable" | "invalid-validity" | "tgz-missing" | "tgz-hash-mismatch" | "file-digest-mismatch" | "file-list-mismatch" | "commit-not-contains-base" | "base-version-unreadable" | "version-mismatch";
export interface CandidateProblem {
    readonly code: CandidateProblemCode;
    readonly message: string;
    readonly hint?: string;
}
export interface CandidateVerdict {
    readonly ok: boolean;
    readonly identity: CandidateIdentity;
    readonly problems: readonly CandidateProblem[];
}
/** Validate a `candidate.json` read from disk. Never trusts a field it does not name. */
export declare function parseCandidateManifest(value: unknown): Result<CandidateManifest>;
/** The batch-facing identity of a parsed manifest. */
export declare function candidateIdentityOf(manifest: CandidateManifest, manifestPath: string, manifestSha256: Sha256Hex): CandidateIdentity;
/**
 * Everything the rules may look at. The caller measures these; `null` means
 * "could not determine", which is treated as a problem rather than as a pass.
 */
export interface CandidateFacts {
    readonly manifest: CandidateManifest;
    readonly identity: CandidateIdentity;
    readonly manifestPath: string;
    readonly batchDir: string;
    readonly generatedAtMs: number;
    readonly batchStartedAtMs: number;
    readonly currentHead: CommitSha;
    /** Baseline the batch was opened against; `null` means the batch recorded none. */
    readonly base: VerificationBase | null;
    /**
     * True when the operator explicitly allowed verifying an outdated base.
     * The ancestor problem then becomes a published caveat instead of a refusal;
     * the version agreement is never relaxed.
     */
    readonly allowOutdatedBase: boolean;
    /** True when `commit` is an ancestor of (or equal to) the baseline tip. */
    readonly commitContainsBase: boolean | null;
    /** Version currently declared by the baseline ref, when readable. */
    readonly expectedVersion: string | null;
    readonly tgzOnDisk: {
        readonly exists: boolean;
        readonly sha256: Sha256Hex | null;
    };
    /** Digest recomputed from the manifest's own `files` list. */
    readonly recomputedFileDigest: Sha256Hex | null;
}
/**
 * Decide whether the candidate may represent the batch. Order matters: earlier
 * problems explain later ones, so a reader gets the root cause first.
 */
export declare function judgeCandidate(facts: CandidateFacts): CandidateVerdict;
/** True when `child` is `parent` or below it. Case-insensitive on Windows-style paths. */
export declare function isPathInside(child: string, parent: string): boolean;
/** One paragraph for stderr or a ticket comment. */
export declare function describeCandidateVerdict(verdict: CandidateVerdict): string;
