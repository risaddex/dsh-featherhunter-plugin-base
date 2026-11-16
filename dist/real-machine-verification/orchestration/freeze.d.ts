/**
 * `freeze`: turn one build into a candidate that can be checked later.
 *
 * The command's job is to answer "which source produced this tarball?" with
 * evidence, not with a promise. It therefore takes a git snapshot, builds,
 * packs, hashes the bytes it actually read, inspects the packaged client entry,
 * and takes a second git snapshot. If the source moved underneath the build the
 * candidate is refused: a manifest that cannot name its source is worse than no
 * manifest, because it looks authoritative.
 *
 * Every effect goes through `Ports`, so the whole flow is exercised in tests
 * with fake git, npm and filesystems.
 */
import type { CommitSha, Sha256Hex } from "../contracts/branding";
import type { CandidateManifest } from "../contracts/candidate-rules";
import type { Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import { type GitState } from "../runtime/dsh/git-state";
import type { DeclarationContext } from "./context";
/** Where a freeze stopped; the CLI uses it to label the failure stage. */
export type FreezeStage = "manifest" | "git" | "build" | "pack" | "entry" | "report";
export interface FreezeFailure extends Failure {
    readonly stage: FreezeStage;
    /** True when the candidate is unprovable rather than proven wrong (exit 2). */
    readonly blocked: boolean;
}
export interface PreviousCandidate {
    readonly dir: string;
    readonly manifestPath: string;
    readonly manifestSha256: Sha256Hex;
    readonly manifest: CandidateManifest;
}
export interface CandidateChangedFile {
    readonly path: string;
    readonly previousSha256: Sha256Hex;
    readonly sha256: Sha256Hex;
}
export interface CandidateChanges {
    readonly added: readonly string[];
    readonly removed: readonly string[];
    readonly changed: readonly CandidateChangedFile[];
}
export interface FreezeOutcome {
    readonly candidate: CandidateManifest;
    readonly candidatePath: string;
    readonly candidateSha256: Sha256Hex;
    readonly previous: PreviousCandidate | null;
    /** Null when there is no earlier candidate for this commit. */
    readonly changes: CandidateChanges | null;
    readonly notes: readonly string[];
}
export interface FreezeOptions {
    readonly ports: Ports;
    readonly context: DeclarationContext;
    /** Absolute candidate output root. */
    readonly outDir: string;
    readonly allowDirty: boolean;
}
interface EntryClaims {
    readonly name: string | null;
    readonly version: string | null;
    readonly buildCommit: CommitSha | null;
}
/** Read the two facts a client bundle can be made to state about itself. */
export declare function readEntryClaims(text: string): EntryClaims;
/** Compare two candidates by packaged path and content digest. */
export declare function diffCandidates(previous: CandidateManifest, current: CandidateManifest): CandidateChanges;
/** Everything freeze decides before it runs a build or writes a byte. */
export interface FreezePlan {
    readonly outDir: string;
    readonly rootPackage: {
        readonly name: string;
        readonly version: string;
    };
    readonly before: GitState;
    readonly generatedAt: string;
    readonly candidateName: string;
    readonly candidateDir: string;
    readonly previous: PreviousCandidate | null;
    readonly build: {
        readonly argv: readonly string[];
        readonly cwd: string;
        readonly timeoutMs: number;
    } | null;
    readonly pack: {
        readonly argv: readonly string[];
        readonly cwd: string;
        readonly timeoutMs: number;
    };
    readonly notes: readonly string[];
}
/**
 * Read the source facts and choose the output directory without writing.
 *
 * `--dry-run` prints this plan; a real freeze calls the same function and then
 * claims `candidateDir`, so the printed plan is the one that would execute.
 */
export declare function planFreeze(options: FreezeOptions): Promise<Result<FreezePlan, FreezeFailure>>;
/** Build, pack and record one candidate. */
export declare function freezeCandidate(options: FreezeOptions): Promise<Result<FreezeOutcome, FreezeFailure>>;
export {};
