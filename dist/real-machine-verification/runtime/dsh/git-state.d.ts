/**
 * The source state a candidate claims to come from.
 *
 * Freeze reads this twice: before the build and after packing. Equality of the
 * two snapshots is the evidence behind `sourceStable`; a commit that moved in
 * between makes the candidate unanswerable, not merely dirty.
 */
import type { CommitSha } from "../../contracts/branding";
import type { Ports } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
export interface GitState {
    readonly commit: CommitSha;
    /** `HEAD` when detached; git's own name for the branch otherwise. */
    readonly branch: string;
    readonly dirty: boolean;
    /** Porcelain paths, sorted, with rename/copy sources collapsed to the new path. */
    readonly dirtyFiles: readonly string[];
}
export interface GitStateOptions {
    readonly ports: Pick<Ports, "command">;
    readonly cwd: string;
    readonly timeoutMs?: number;
}
/**
 * Parse `git status --porcelain -z --untracked-files=all`. With `-z` paths are
 * raw (no quoting), and a rename or copy entry is followed by its source path
 * as a separate NUL-terminated token.
 */
export declare function parsePorcelainZ(stdout: string): Result<readonly string[]>;
export declare function readGitState(options: GitStateOptions): Promise<Result<GitState>>;
/** True when two snapshots describe exactly the same source. */
export declare function sameGitState(left: GitState, right: GitState): boolean;
