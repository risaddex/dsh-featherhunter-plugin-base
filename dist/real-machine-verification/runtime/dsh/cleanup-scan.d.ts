/**
 * Read-only discovery of what lives under one work root.
 *
 * Cleanup is the only command that deletes, so the scan is deliberately boring:
 * it classifies, measures, and stops there. Two rules shape the whole file.
 *
 * 1. **Ownership is read from the published layout, not guessed from names.**
 *    `runs/`, `isolation/`, `instances/`, `batches/`, `candidates/` and
 *    `archive/` are the containers this tool creates. Only their direct children
 *    are candidates for deletion; every other child of the work root is
 *    `unknown` and is reported, never removed. A directory the tool cannot name
 *    is a directory the tool does not own.
 * 2. **A path is only "inside" after realpath agrees.** Each entry is resolved
 *    through `realPath` and compared with the resolved work root, so a symlink or
 *    junction cannot make a scan of `runs/` point at a user's documents. Entries
 *    that resolve outside (or cannot be resolved) carry a `problem` and the
 *    planner keeps them report-only.
 *
 * Symbolic links are never deleted even when their target is inside the work
 * root: `fs.remove` would remove the link itself, but the measurement of what
 * that link exposes is ambiguous, and "ambiguous" is not a reason to delete.
 * `archive/` is read as evidence, never as trash: its children are reported as
 * archived and the planner keeps them regardless of retention flags.
 */
import type { FileKind, FsPort } from "../../contracts/ports";
/** The ownership classes cleanup reports. Unknown is a class, not an error. */
export type CleanupCategory = "batch" | "home" | "temp" | "candidate" | "unknown";
/** One entry that could be kept, deleted, or only reported. */
export interface CleanupScannedEntry {
    /** Absolute path as built from the work root; never used as an identity key. */
    readonly path: string;
    /** `/`-separated path below the work root, e.g. `runs/self-check-2026...`. */
    readonly relativePath: string;
    readonly category: CleanupCategory;
    /** True only for children of `archive/`; the planner never deletes them. */
    readonly archived: boolean;
    /** Taken from the directory listing, so a symlink stays a symlink. */
    readonly kind: FileKind;
    readonly mtimeMs: number | null;
    readonly bytes: number;
    readonly files: number;
    readonly directories: number;
    /** Resolved path when resolution succeeded; `null` otherwise. */
    readonly realPath: string | null;
    /** True only when the resolved path is strictly below the resolved work root. */
    readonly insideWorkRoot: boolean;
    /** Why this entry must not be deleted, joined with `; `, or `null`. */
    readonly problem: string | null;
}
/** The whole scan, including root-level failures that make the report partial. */
export interface CleanupScan {
    readonly workRoot: string;
    /** False when the work root does not exist: an empty scan, not an error. */
    readonly exists: boolean;
    readonly realWorkRoot: string | null;
    readonly entries: readonly CleanupScannedEntry[];
    /** Problems reading the work root itself; per-entry problems live on the entry. */
    readonly problems: readonly string[];
}
/**
 * List the work root, classify its direct children, and measure each one.
 *
 * A missing work root is `exists: false` with no entries: cleanup on a fresh
 * checkout must succeed and touch nothing. Unreadable containers are recorded in
 * `problems` instead of throwing, so the command can still report the entries it
 * did see and exit non-zero.
 */
export declare function scanWorkRoot(fs: FsPort, workRoot: string): Promise<CleanupScan>;
