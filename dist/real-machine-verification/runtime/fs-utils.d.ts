/**
 * Filesystem walks and the delete guard.
 *
 * Two lessons are encoded here. First, "clean up the batch directory" is the most
 * dangerous operation this tool performs, so deletion goes through one guard that
 * refuses drive roots, the user's home and the current working directory — a bug
 * in a path computation must hit a wall, not a reinstall. Second, every artifact
 * this tool records lists files with `/`-separated relative paths; walking is the
 * only place that spelling is decided, so reports from different machines agree.
 */
import type { FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
/** One entry found under a root, with a portable relative path. */
export interface WalkedEntry {
    readonly relativePath: string;
    readonly absolutePath: string;
    readonly kind: "file" | "directory" | "symlink" | "other";
    readonly bytes: number;
}
/**
 * List every file under `root`, recursively, sorted by relative path.
 *
 * The depth cap is not paranoia: a plugin cache that contains itself (a symlinked
 * loop) would otherwise hang the verifier, and a hang is indistinguishable from a
 * slow machine at the call site.
 */
export declare function walkFiles(fs: FsPort, root: string): Promise<Result<readonly WalkedEntry[]>>;
/** Counts for a plan or a cleanup report: numbers only, never a file listing. */
export interface TreeSize {
    readonly files: number;
    readonly directories: number;
    readonly bytes: number;
}
export declare function measureTree(fs: FsPort, root: string): Promise<Result<TreeSize>>;
/**
 * Why this path must not be deleted, or `null` when it is safe enough.
 *
 * "Safe enough" means: absolute, at least three segments deep, not a filesystem
 * root and not the user's home directory. Every deeper rule (must live under the
 * work root) belongs to the caller, which knows its own roots.
 */
export declare function deleteGuardReason(target: string, protectedPaths?: readonly string[]): string | null;
/** Remove a tree after the guard agrees it is not a catastrophic path. */
export declare function removeTree(fs: FsPort, target: string, options?: {
    readonly protectedPaths?: readonly string[];
    readonly recursive?: boolean;
}): Promise<Result<void>>;
/** Create the directory and remove stale contents only when the caller asked for it. */
export declare function ensureDir(fs: FsPort, dir: string): Promise<Result<void>>;
