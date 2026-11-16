import type { Result } from "../../contracts/result.js";
/**
 * Binary write seam for package installation.
 *
 * FsPort is text/json only, and widening it would change a shared contract and
 * every fake in the test suite. Installation is the one operation that must put
 * opaque tarball bytes on disk, so it carries its own minimal writer instead.
 * Callers inject this; tests replace it with an in-memory implementation.
 */
export interface BinaryWriter {
    write(path: string, bytes: Uint8Array): Promise<Result<{
        readonly bytes: number;
    }>>;
}
export declare function createBinaryWriter(): BinaryWriter;
