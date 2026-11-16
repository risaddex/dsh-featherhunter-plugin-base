/**
 * Install one candidate tarball into an isolated profile.
 *
 * Two methods exist because the real machine forced them:
 *
 * - `extract` (default) unpacks the tarball byte-for-byte with the same reader
 *   `freeze` uses, so it works across drives and never invokes npm.
 * - `cli` runs `npm install <tgz>` inside the profile, which is what a user
 *   would do, but npm's Windows path handling makes a cross-drive install fail
 *   with a hard-link error. The command refuses that combination up front and
 *   points at `extract` instead of letting npm produce a half-installed tree.
 *
 * After either method the same checks run against the *installed* bytes: package
 * identity, version, client-entry sha256, the version constant inside the client
 * entry, and the whole file list (from `candidate.json` when present, otherwise
 * from the tarball itself). Nothing here trusts the install step's exit code.
 */
import type { ProfileName } from "../contracts/branding";
import type { CheckResult } from "../contracts/check";
import type { CandidateManifest } from "../contracts/candidate-rules";
import type { Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import type { UnpackedTarball } from "../runtime/dsh/npm-pack";
import type { BinaryWriter } from "../runtime/platform/binary-writer";
export type InstallMethod = "extract" | "cli";
export declare const INSTALL_METHODS: readonly InstallMethod[];
export declare const DEFAULT_INSTALL_METHOD: InstallMethod;
export declare const CANDIDATE_FILE = "candidate.json";
export type InstallStage = "input" | "unpack" | "install" | "profile" | "verify";
export type InstallFailure = Failure & {
    readonly stage: InstallStage;
};
export interface InstallPackageOptions {
    readonly ports: Ports;
    /** The only binary write path; see runtime/platform/binary-writer.ts. */
    readonly binaryWriter: BinaryWriter;
    /** Absolute path to the candidate tarball. */
    readonly tgzPath: string;
    readonly method: InstallMethod;
    readonly dshHome: string;
    readonly profileName: ProfileName;
    readonly profileDir: string;
    readonly packageName: string;
    readonly clientEntry: string;
    /** `--candidate`: a candidate directory (holding candidate.json) or the file itself. */
    readonly candidatePath?: string | null;
    /** Progress lines; the CLI sends these to stderr. */
    readonly note?: (message: string) => void;
    /** Override for the npm executable; tests inject a fake through CommandPort instead. */
    readonly npmCommand?: string;
}
export interface InstallOutcome {
    readonly method: InstallMethod;
    readonly targetDir: string;
    readonly packageName: string;
    readonly packageVersion: string;
    readonly clientEntry: string;
    readonly expectedSource: "candidate" | "tgz";
    readonly candidatePath: string | null;
    readonly expectedFileCount: number;
    readonly installedFileCount: number;
    readonly checks: readonly CheckResult[];
    readonly notes: readonly string[];
}
export interface ExpectedFile {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
}
/** Everything install decides before it writes: source bytes, target, expected files. */
export interface InstallPlan {
    readonly tgzPath: string;
    readonly tgzSha256: string;
    readonly method: InstallMethod;
    readonly profileDir: string;
    readonly targetDir: string;
    readonly nodeModulesDir: string;
    readonly packageName: string;
    readonly packageVersion: string;
    readonly clientEntry: string;
    readonly expectedSource: "candidate" | "tgz";
    readonly candidatePath: string | null;
    readonly expectedFiles: readonly ExpectedFile[];
    readonly expectedFileCount: number;
    readonly willReplaceExisting: boolean;
    readonly profileManifestPath: string;
    readonly dependencySpec: string;
    readonly npmArgv: readonly string[] | null;
    readonly notes: readonly string[];
    readonly candidate: CandidateManifest | null;
    readonly unpacked: UnpackedTarball;
}
export type InstallPlanOptions = Omit<InstallPackageOptions, "binaryWriter" | "note">;
/**
 * Read the tarball (and candidate, when given) and decide where it would land.
 *
 * `--dry-run` prints this plan; `installPackage` starts from the same value, so
 * the printed target directory and file list are the ones a real run uses.
 */
export declare function planInstall(options: InstallPlanOptions): Promise<Result<InstallPlan, InstallFailure>>;
export declare function installPackage(options: InstallPackageOptions): Promise<Result<InstallOutcome, InstallFailure>>;
