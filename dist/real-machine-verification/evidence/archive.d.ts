/**
 * Immutable archival of one batch's evidence directory.
 *
 * Archiving is a copy, never a move, and an archive directory is never written
 * again after it is finished: a later correction goes into `notes/` as a
 * sidecar, because the report that quoted the archive must keep matching it.
 * That is why the destination name gets an ordinal when two archives happen in
 * the same second (`<batch>-<stamp>`, then `<batch>-<stamp>-2`, ...) instead of
 * reusing or replacing a directory.
 *
 * SHA256SUMS.txt is written for the copied files, not for the source files; the
 * copies are re-hashed and compared before the checksum list is written, so a
 * checksum list can never describe bytes the archive does not contain.
 */
import { type Sha256Hex } from "../contracts/branding";
import type { ClockPort, FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
import { type WalkedEntry } from "../runtime/fs-utils";
/** One file as it exists inside the finished archive. */
export interface ArchivedEvidenceFile {
    /** Path relative to the archive root, `/`-separated. */
    readonly path: string;
    readonly bytes: number;
    readonly sha256: Sha256Hex;
}
/** Result of a successful archive. Everything a caller needs to report it. */
export interface EvidenceArchiveResult {
    readonly directory: string;
    readonly batchName: string;
    readonly batchDir: string;
    readonly createdAt: string;
    readonly files: readonly ArchivedEvidenceFile[];
    readonly sumsPath: string;
    readonly sumsSha256: Sha256Hex;
    /** Digest of the archived file set, computed with `digestOfFiles`'s wire format. */
    readonly fileDigest: Sha256Hex;
    readonly copied: {
        readonly files: number;
        readonly bytes: number;
    };
}
/** Inputs of `archiveEvidence`; all paths are absolute and already normalized by the caller layer. */
export interface ArchiveEvidenceOptions {
    readonly fs: FsPort;
    readonly clock: ClockPort;
    /** Batch directory (the whole tree below it is archived). */
    readonly batchDir: string;
    readonly batchName: string;
    readonly archiveRoot: string;
}
/** Everything archive decides before it writes: source files and destination. */
export interface EvidenceArchivePlan {
    readonly batchName: string;
    readonly batchDir: string;
    readonly archiveRoot: string;
    readonly createdAt: string;
    readonly baseName: string;
    readonly directory: string;
    readonly entries: readonly WalkedEntry[];
    readonly files: readonly ArchivedEvidenceFile[];
    readonly copied: {
        readonly files: number;
        readonly bytes: number;
    };
    readonly fileDigest: Sha256Hex;
}
/**
 * Hash the batch and choose the archive directory without creating either.
 *
 * `--dry-run` prints this plan; `archiveEvidence` writes exactly this plan.
 */
export declare function planEvidenceArchive(options: ArchiveEvidenceOptions): Promise<Result<EvidenceArchivePlan>>;
/**
 * Copy `batchDir` into the planned archive directory and write a path-sorted
 * SHA256SUMS.txt for the copied files.
 */
export declare function archiveEvidence(options: ArchiveEvidenceOptions): Promise<Result<EvidenceArchiveResult>>;
/** Inputs of `writeArchiveNote`. */
export interface WriteArchiveNoteOptions {
    readonly fs: FsPort;
    readonly clock: ClockPort;
    /** The archive directory (must already contain SHA256SUMS.txt). */
    readonly archiveDir: string;
    readonly note: string;
    readonly author?: string;
}
/** Result of writing a sidecar note; `path` is archive-relative. */
export interface WrittenArchiveNote {
    readonly path: string;
    readonly absolutePath: string;
    readonly sha256: Sha256Hex;
    readonly content: string;
}
/**
 * Add a correction as a sidecar file under `notes/`.
 *
 * The originals in the archive stay byte-identical; that is the whole point.
 * Returns a failure when the directory is not a valid archive, so a note can
 * never be mistaken for evidence in a random directory.
 */
export declare function writeArchiveNote(options: WriteArchiveNoteOptions): Promise<Result<WrittenArchiveNote>>;
