/**
 * Reading the file table of an Electron `app.asar`.
 *
 * A DSH desktop install keeps its host code inside one archive; on disk there is
 * no `resources/app.asar/dsh/.../cli.js` to stat. The only honest way to say "the
 * CLI entry is present" from plain Node is to read the archive's header — a JSON
 * file table stored as a Chromium Pickle at offset 0 — and look the entry up.
 *
 * The layout, confirmed against a real 182 MB install:
 *
 * ```
 * uint32 @0   size of the header-size pickle (4)
 * uint32 @4   bytes of header region that follow (pickle framing included)
 * uint32 @8   size of the header pickle payload
 * uint32 @12  byte length of the JSON header
 * @16         the JSON header ("files" tree)
 * data offset = 8 + u32@4
 * ```
 *
 * Only the prefix and the JSON are read; the half-gigabyte of packaged code is
 * never touched. Every failure is a `Result` because a truncated or non-asar
 * file is an observation about the install, not an exception in the caller.
 */
import { type Result } from "../../contracts/result";
import type { ReadFileSlice } from "../types";
/** Posix path of the desktop host CLI entry inside the archive. */
export declare const ASAR_CLI_ENTRY = "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js";
/** Structurally parsed header bounds, useful for evidence on their own. */
export interface AsarHeaderBounds {
    /** Byte length of the JSON header. */
    readonly jsonLength: number;
    /** Bytes from offset 8 to the start of file data (pickle framing included). */
    readonly headerBytes: number;
    /** Absolute file offset where packed file contents begin. */
    readonly dataOffset: number;
}
/** One entry in the archive's file table. */
export interface AsarEntryInfo {
    readonly path: string;
    readonly size: number;
    /** Offset of the file payload relative to `dataOffset`; `null` when unpacked. */
    readonly offset: number | null;
    /** sha256 from the archive's integrity metadata, when present. */
    readonly integritySha256: string | null;
}
/** Decode the four size words that precede the JSON header. */
export declare function parseAsarHeaderBounds(prefix: Uint8Array): Result<AsarHeaderBounds>;
/** Walk the `files` tree and return one entry, or explain what was missing. */
export declare function findAsarEntry(header: unknown, entryPosixPath: string): Result<AsarEntryInfo>;
/** Read the archive header through an injected slice reader and look up one entry. */
export declare function readAsarEntry(readSlice: ReadFileSlice, asarPath: string, entryPosixPath?: string): Promise<Result<AsarEntryInfo>>;
