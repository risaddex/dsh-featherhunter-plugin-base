/**
 * Path and name rules for evidence files and archives.
 *
 * Why this file exists: evidence is the one part of a verification run whose
 * file names come from outside — a scenario, a profile, a CLI flag, or the
 * filesystem the evidence was copied from. Turning such a name into a path and
 * deciding whether that path is allowed are the same decision, so they live
 * here instead of being re-derived (and eventually re-derived differently) at
 * every call site.
 *
 * Two policies are written down here rather than at the call sites:
 *
 * - SHA256SUMS.txt is a wire format: one line per file, `<sha256>  <path>`
 *   (exactly two spaces), sorted by path using the platform-independent UTF-16
 *   code-unit order `Array.prototype.sort` uses, `/`-separated paths relative
 *   to the archive root, and *every line ends with `\n`* — including the last
 *   one. An archive with no files has a zero-byte SHA256SUMS.txt. `sha256sum
 *   -c` accepts both spellings, but the bytes are only reproducible if the
 *   trailing newline is decided once, here.
 * - Archive metadata names are reserved: `SHA256SUMS.txt` at the archive root
 *   and the `notes/` directory are not evidence and never appear in the digest.
 */
import { type Result } from "../contracts/result";
/** Directory name of the evidence package inside a batch directory. */
export declare const EVIDENCE_DIRNAME = "evidence";
/** Directory name of the evidence payload files inside the evidence package. */
export declare const EVIDENCE_FILES_DIRNAME = "files";
/** File name of the checksum list at an archive root. */
export declare const SHA256SUMS_FILENAME = "SHA256SUMS.txt";
/** Directory name of archive annotations (corrections live here, never in the originals). */
export declare const ARCHIVE_NOTES_DIRNAME = "notes";
/** Default archive root directory, relative to the work root. */
export declare const DEFAULT_ARCHIVE_ROOT_DIRNAME = "evidence-archive";
/** Line terminator of SHA256SUMS.txt; written after every line, including the last. */
export declare const SHA256SUMS_LINE_TERMINATOR = "\n";
/** Highest ordinal suffix used when a name is already taken. */
export declare const MAX_EVIDENCE_ORDINAL = 999;
/**
 * True when `target` resolves inside `root` (or is `root` itself).
 * Used as a second line of defense after explicit `..` rejection.
 */
export declare function isWithinPath(root: string, target: string): boolean;
/**
 * Turn a caller-supplied relative path into an absolute path under `root`, or
 * explain why it is not allowed. Never touches the filesystem.
 */
export declare function assertWithin(root: string, target: string): Result<string>;
/** Convert Windows separators to `/` (evidence paths are always wire-style). */
export declare function toPosixPath(value: string): string;
/**
 * Insert an ordinal suffix before the extension: `note.txt` → `note-2.txt`.
 * Ordinal 1 is the bare name, which keeps the first file in a batch tidy.
 */
export declare function withOrdinal(name: string, ordinal: number): string;
/** True when `value` may be stored as an evidence path (safe and `/`-separated). */
export declare function isRecordableEvidencePath(value: string): boolean;
/** True for archive metadata paths that never join the digest. */
export declare function isReservedArchivePath(path: string): boolean;
/** Evidence path of a payload file, relative to the evidence package root. */
export declare function evidenceFilesRelativePath(fileName: string): string;
/**
 * Turn an arbitrary source file name into a name that is safe to store under
 * `files/`. The result always starts with an alphanumeric character, keeps a
 * short extension, and drops path parts so a source outside the batch cannot
 * smuggle a directory in.
 */
export declare function sanitizeEvidenceFileName(fileName: string): string;
/** One entry of SHA256SUMS.txt, before rendering. */
export interface Sha256SumEntry {
    readonly path: string;
    readonly sha256: string;
}
/**
 * Render SHA256SUMS.txt exactly as the format policy above describes:
 * path-sorted, `<sha256>  <path>` per line, every line `\n`-terminated, and a
 * zero-byte file when there is nothing to list.
 */
export declare function renderSha256Sums(entries: readonly Sha256SumEntry[]): Result<string>;
/**
 * Directory name of a new archive: `<batchName>-<timestamp>`, with the
 * timestamp reduced to a path-safe segment using the same character rule as run
 * ids in orchestration/run-directory.ts. Collisions inside one second are
 * resolved by appending `-2`, `-3`, ... (see archive.ts).
 */
export declare function archiveDirectoryBaseName(batchName: string, isoTimestamp: string): string;
