/**
 * Per-run directories: the unit evidence and reports are filed under.
 *
 * The id is derived from the start time in the local clock, so a person reading
 * `.scratch/verify/runs/` sees when each run happened without opening a file. Two
 * runs that start in the same millisecond get `-2`, `-3`; a run never overwrites
 * another run's report, for the same reason evidence never overwrites evidence.
 */
import type { FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
/** The directories one command invocation owns. */
export interface PreparedRunDirectory {
    readonly runId: string;
    readonly runDir: string;
    /** Where evidence items go; created lazily by the evidence store. */
    readonly evidenceDir: string;
}
export interface PrepareRunDirectoryOptions {
    readonly fs: FsPort;
    readonly workRoot: string;
    /** Command name, so a work root holding several commands stays readable. */
    readonly command: string;
    /** Start timestamp; `clock.iso()` output, local offset included. */
    readonly startedAt: string;
}
/** Turn an ISO timestamp (or any label) into one safe path segment. */
export declare function toRunIdSegment(value: string): string;
/**
 * Create `<workRoot>/runs/<runId>/`, choosing the first unused ordinal.
 *
 * Failing to create the directory is a real error: without it there is nowhere to
 * put the report, and the caller must not pretend the run was recorded.
 */
export declare function planRunDirectory(options: PrepareRunDirectoryOptions): Promise<Result<PreparedRunDirectory>>;
export declare function prepareRunDirectory(options: PrepareRunDirectoryOptions): Promise<Result<PreparedRunDirectory>>;
