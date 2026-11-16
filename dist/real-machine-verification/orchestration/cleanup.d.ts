/**
 * The cleanup plan and its execution.
 *
 * Planning is a pure function of a scan, retention numbers and a clock: it says
 * what *would* happen and why, and nothing in it calls the filesystem. Execution
 * is the only half that deletes, and it re-checks every planned path before each
 * removal instead of trusting the plan:
 *
 * - the shared delete guard must agree (`deleteGuardReason`), so a path that
 *   became a drive root, the user's home, the cwd or too shallow between plan
 *   and execute is refused;
 * - the path and the work root are resolved again, and the entry must still be
 *   strictly inside the resolved root;
 * - anything that resolved outside during the scan was already marked report-only.
 *
 * The split matters for the command's contract: `--yes` turns execution on, but
 * it cannot turn a report-only entry into a deletion. Unknown categories,
 * archived evidence, symbolic links and entries whose real path escaped the work
 * root all stay report-only no matter which flags were passed.
 */
import type { ClockPort, FileKind, FsPort, Ports } from "../contracts/ports";
import { type Result } from "../contracts/result";
import type { CleanupCategory, CleanupScan } from "../runtime/dsh/cleanup-scan";
/** How many entries each class keeps, and whether candidate packages are deletable. */
export interface CleanupRetention {
    readonly batches: number;
    readonly homes: number;
    readonly includePkg: boolean;
}
/** What the planner decided for one entry. */
export type CleanupAction = "keep" | "delete" | "report";
export interface CleanupPlanEntry {
    readonly path: string;
    readonly relativePath: string;
    readonly category: CleanupCategory;
    readonly archived: boolean;
    readonly kind: FileKind;
    /** Local ISO spelling, or `null` when the scan could not stat the entry. */
    readonly mtime: string | null;
    readonly mtimeMs: number | null;
    readonly bytes: number;
    readonly files: number;
    readonly directories: number;
    /** 1 = newest within its class; `null` when the entry was never ranked. */
    readonly rank: number | null;
    readonly action: CleanupAction;
    readonly reason: string;
    readonly unsafe: boolean;
}
export interface CleanupSummary {
    readonly entries: number;
    readonly keep: number;
    readonly delete: number;
    readonly report: number;
    readonly unsafe: number;
}
export interface CleanupPlan {
    readonly workRoot: string;
    readonly realWorkRoot: string | null;
    readonly retention: CleanupRetention;
    readonly entries: readonly CleanupPlanEntry[];
    readonly problems: readonly string[];
    readonly summary: CleanupSummary;
}
/** What the filesystem guard needs to know; passed from the environment port. */
export interface CleanupGuardContext {
    readonly homeDir: string;
    readonly cwd: string;
    readonly tmpDir: string;
}
/**
 * Refuse a work root that must never be cleaned, before anything is listed.
 *
 * The textual guard catches drive roots, shallow paths and equality with home,
 * cwd or tmp. The resolved path is then checked the same way, and compared with
 * the resolved protected directories, because `--work-root C:\\link` can point at
 * the user's home while spelling something else.
 */
export declare function guardCleanupRoot(fs: FsPort, workRoot: string, context: CleanupGuardContext): Promise<Result<{
    readonly realWorkRoot: string | null;
}>>;
/**
 * Decide keep / delete / report for every scanned entry.
 *
 * Order matters: archive, unknown and unsafe checks come before retention, so a
 * retention number can never make one of those deletable. Candidate packages are
 * ranked (the report shows which is newest) but only become deletable when
 * `includePkg` is true.
 */
export declare function planCleanup(scan: CleanupScan, retention: CleanupRetention, clock: ClockPort): CleanupPlan;
export interface CleanupRemovedEntry {
    readonly path: string;
    readonly relativePath: string;
    readonly bytes: number;
}
export interface CleanupFailedEntry {
    readonly path: string;
    readonly relativePath: string;
    readonly error: string;
}
export interface CleanupExecution {
    readonly removed: readonly CleanupRemovedEntry[];
    readonly failed: readonly CleanupFailedEntry[];
    readonly freedBytes: number;
}
/**
 * Delete the entries the plan marked `delete`, re-verifying each one.
 *
 * Failures are collected, not thrown: one stubborn entry must not leave the
 * remaining deletable entries behind. The caller turns any failure into exit 1.
 */
export declare function executeCleanup(plan: CleanupPlan, ports: Ports, protectedPaths: readonly string[]): Promise<CleanupExecution>;
