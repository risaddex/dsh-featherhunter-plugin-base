/**
 * Fixtures for the batch tests: a scripted git machine, a frozen candidate and
 * seeded evidence manifests, all in memory.
 *
 * The world only answers what the batch code actually asks of git — HEAD, the
 * branch name, the dirty list and `rev-parse --verify <ref>^{commit}` — so a test
 * can move HEAD, advance the baseline or delete the ref by assigning one field.
 * Candidates are seeded as files (freeze has its own tests); evidence is seeded
 * as the manifest `evidence add` would leave behind.
 */
import type { Ports } from "../../contracts/ports";
import type { VerificationDeclaration } from "../../declaration/loader";
import { FakeClock, FakeEnv, FakeFs } from "./fake-fs";
import { FakeCommand } from "./fake-ports";
export declare const FIXTURE_HEAD = "0123456789abcdef0123456789abcdef01234567";
export declare const OTHER_HEAD = "89abcdef0123456789abcdef0123456789abcdef";
export declare const BASE_TIP = "abcdef0123456789abcdef0123456789abcdef01";
export declare const NEW_BASE_TIP = "2222222222222222222222222222222222222222";
/** The bytes the fixture candidate tarball contains. */
export declare const CANDIDATE_TGZ_CONTENT = "fixture candidate tarball\n";
/** The tarball digest the fixture candidate manifest declares (`package.tgzSha256`). */
export declare const CANDIDATE_TGZ_SHA256: import("../..").Sha256Hex;
export declare const SHA_A: string;
export declare const SHA_B: string;
export declare const SHA_C: string;
export declare const SHA_D: string;
/** A package.json inside the candidate package, and the digest its file list produces. */
export declare function candidatePackageFile(version: string): {
    path: string;
    text: string;
    bytes: number;
    sha256: string;
};
export declare function candidateFileDigest(version: string): string;
export interface FakeBatchOptions {
    readonly cwd?: string;
    readonly packageName?: string;
    readonly version?: string;
    readonly head?: string;
    readonly branch?: string;
    readonly dirtyFiles?: readonly string[];
    readonly baseRef?: string;
    /** `null` models a baseline ref that was deleted after the batch opened. */
    readonly baseTip?: string | null;
    readonly candidateCommit?: string;
    readonly candidateVersion?: string;
    readonly candidateValidity?: "release" | "development";
    readonly candidateGeneratedAt?: string;
    /** Make every git call fail, as if the work tree had disappeared. */
    readonly headFailure?: boolean;
}
export interface CandidateFixture {
    readonly dir: string;
    readonly path: string;
    readonly text: string;
    readonly sha256: string;
    /** `manifest.package.tgzSha256`; the value the identity line names. */
    readonly tgzSha256: string;
    readonly commit: string;
    readonly version: string;
}
export interface SeedCandidateOptions {
    readonly dirName?: string;
    /** Seed into `batches/<batchName>/pkg` instead of the default candidates root. */
    readonly batchName?: string;
    readonly commit?: string;
    readonly version?: string;
    readonly validity?: "release" | "development";
    readonly generatedAt?: string;
    /** Override the declared tarball digest (models a hand-edited manifest). */
    readonly tgzSha256?: string;
    /** Override the declared file digest (models a hand-edited manifest). */
    readonly fileDigest?: string;
    /** Skip writing the tarball file (models a candidate whose package went missing). */
    readonly tgzMissing?: boolean;
    /** Write these bytes into the tarball instead of the canonical content (models a replaced package). */
    readonly tgzContent?: string;
    /** Stamp `package.buildCommit` (models a package built from another commit). */
    readonly buildCommit?: string | null;
}
export interface SeedEvidenceOptions {
    /** `manifest.batch.name`; defaults to the directory's batch name. */
    readonly batchName?: string;
    /** The candidate object to stamp; omit to leave it out entirely. */
    readonly candidate?: Readonly<Record<string, unknown>>;
    readonly generatedAt?: string;
}
export declare class FakeBatchWorld {
    readonly cwd: string;
    readonly packageName: string;
    readonly version: string;
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly command: FakeCommand;
    readonly ports: Ports;
    readonly declaration: VerificationDeclaration;
    head: string;
    branch: string;
    dirtyFiles: string[];
    baseRef: string;
    baseTip: string | null;
    /** What `git show <baseRef>:package.json` answers; `null` models an unreadable baseline version. */
    baseVersion: string | null;
    /** Whether the baseline tip is an ancestor of the candidate commit; `"unknown"` models a git that cannot answer. */
    baseContainsCommit: boolean | "unknown";
    /** When true every git invocation fails, so no HEAD can be read. */
    headFailure: boolean;
    /** The candidate `batch open` finds under the default work root. */
    readonly candidate: CandidateFixture;
    constructor(options?: FakeBatchOptions);
    get workRoot(): string;
    batchesRoot(): string;
    batchDir(name: string): string;
    batchFile(name: string): string;
    /**
     * Seed a candidate (default: under the work root's `candidates/`; pass
     * `batchName` to seed it inside a batch directory, which is where a sealed
     * candidate must live).
     */
    seedCandidate(options?: SeedCandidateOptions): CandidateFixture;
    /** Seed an `evidence.json` inside a batch directory. */
    seedEvidence(batchName: string, relativeDir: string, options?: SeedEvidenceOptions): string;
    advanceClock(ms: number): void;
    private handle;
}
