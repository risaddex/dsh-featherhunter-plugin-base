/**
 * A deterministic filesystem for cleanup tests.
 *
 * `FakeFs` reports `mtimeMs: 0` for everything, which makes "keep the newest N"
 * untestable. This subclass adds per-path modification times and lets a test
 * script realpath resolutions (an entry that escapes the work root) and remove
 * failures. Every other rule — parent directories, recursive removal, writes
 * recording — is inherited unchanged, so the command runs the same code path as
 * it does against the real filesystem.
 */
import type { FileStat } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
import { FakeFs } from "./fake-fs";
export declare class FakeCleanupFs extends FakeFs {
    private readonly mtimes;
    private readonly resolvedPaths;
    private readonly removeFailures;
    /** Give one seeded path a deterministic mtime. */
    setMtime(path: string, mtimeMs: number): void;
    /** Make `realPath(path)` report another location, e.g. an escaping symlink. */
    setRealPath(path: string, target: string): void;
    /** Make `realPath(path)` fail without changing the entry's existence. */
    failRealPath(path: string, message?: string): void;
    /** Make `remove(path)` fail without removing anything. */
    failRemove(path: string, message?: string): void;
    /** Normalized paths passed to `remove`, in order. */
    removeCalls(): string[];
    stat(path: string): Promise<Result<FileStat>>;
    realPath(path: string): Promise<Result<string>>;
    remove(path: string, options?: {
        readonly recursive?: boolean;
    }): Promise<Result<void>>;
}
