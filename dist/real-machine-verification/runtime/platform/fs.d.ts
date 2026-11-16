import type { FsPort } from "../../contracts/ports";
import type { ReadFileSlice } from "../types";
/** The Node implementation of `FsPort`. One instance per invocation. */
export declare function createFsPort(): FsPort;
/**
 * Read a byte range from a file.
 *
 * The length and offset are validated before the handle is opened: an asar header
 * length comes from bytes inside the archive, i.e. from a file this tool did not
 * write, so `Buffer.alloc(4 GB)` must not be reachable from a corrupted archive.
 */
export declare const readFileSlice: ReadFileSlice;
