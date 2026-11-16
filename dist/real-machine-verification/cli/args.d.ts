/**
 * Argument parsing for the current command surface.
 *
 * Parsing is separate from dispatch so the dispatcher can be tested with plain
 * arrays, and so a flag a command does not support is a *reported* problem instead
 * of being silently ignored (a typo in `--declaration` must not fall back to
 * discovery and verify a different declaration than the caller meant).
 *
 * The parser knows every flag this build declares, including the command-specific
 * ones. `given` records the canonical spelling of each flag that was seen, which
 * is how a command rejects a real flag it does not implement (`stop --keep`)
 * instead of treating it as a typo (`unknown`).
 */
export interface ParsedArgs {
    /** First non-flag argument, or `null`. */
    readonly command: string | null;
    readonly json: boolean;
    readonly help: boolean;
    readonly version: boolean;
    readonly screen: boolean;
    readonly keep: boolean;
    readonly dryRun: boolean;
    readonly all: boolean;
    readonly fix: boolean;
    readonly failFast: boolean;
    readonly collectAll: boolean;
    readonly yes: boolean;
    readonly includePkg: boolean;
    readonly allowDirty: boolean;
    readonly allowStale: boolean;
    readonly declaration?: string;
    readonly profile?: string;
    readonly workRoot?: string;
    /** Raw `--port` value; validated by the launch command. */
    readonly port?: string;
    /** Raw `--id` value; resolved by the stop command. */
    readonly id?: string;
    /** Raw `--dir` value; resolved by the stop command. */
    readonly dir?: string;
    /** Raw `--count` value; validated by the concurrent command. */
    readonly count?: string;
    /** Raw `--profiles` value (comma separated); validated by the concurrent command. */
    readonly profiles?: string;
    /** Raw `--out` value (freeze output directory). */
    readonly out?: string;
    /** Raw `--name` value (batch name). */
    readonly name?: string;
    /** Raw `--batch` value (batch name selected for evidence binding). */
    readonly batch?: string;
    /** Raw `--candidate` value (frozen candidate directory). */
    readonly candidate?: string;
    /** Raw `--base-ref` value (batch baseline ref). */
    readonly baseRef?: string;
    /** Raw `--archive-root` value (evidence archive root). */
    readonly archiveRoot?: string;
    /** Raw `--tgz` value (candidate package to install). */
    readonly tgz?: string;
    /** Raw `--method` value (install method). */
    readonly method?: string;
    readonly provider?: string;
    readonly model?: string;
    readonly apiKeyEnv?: string;
    /** Raw `--concurrency` value (scenario runner). */
    readonly concurrency?: string;
    /** Raw `--keep-batches` value (cleanup). */
    readonly keepBatches?: string;
    /** Raw `--keep-homes` value (cleanup). */
    readonly keepHomes?: string;
    /** Every `--file` value, in order; evidence add accepts several. */
    readonly files: readonly string[];
    /** Every `--check` value, in order; evidence add accepts several. */
    readonly checks: readonly string[];
    readonly positional: readonly string[];
    /** Flags nobody recognizes; the command decides whether that is fatal. */
    readonly unknown: readonly string[];
    /** Structural problems, e.g. a value flag with no value. */
    readonly problems: readonly string[];
    /** Canonical spellings of every recognized flag that was given, in order. */
    readonly given: readonly string[];
}
/**
 * Parse one argv array.
 *
 * `--flag=value` is accepted alongside `--flag value`; both spellings are common
 * enough that rejecting one would only produce a confusing "unknown option".
 */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/**
 * Problems that make one command's invocation invalid.
 *
 * Shared by every dispatch branch: an unknown option, a structural problem, a
 * recognized flag that belongs to another command, and stray positional arguments
 * are all reported the same way (`exit 2`), so a script typo never silently
 * changes what is executed.
 */
export declare function flagProblems(args: ParsedArgs, allowed: ReadonlySet<string>): readonly string[];
