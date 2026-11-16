import { type Result } from "../../contracts/result";
/** One regular file inside the package. */
export interface NpmPackFile {
    /** Path relative to the package root, `/` separated and sorted by this module. */
    readonly path: string;
    readonly bytes: number;
    readonly content: Uint8Array;
}
/** The subset of `npm pack --json` this command relies on. */
export interface NpmPackEntry {
    readonly filename: string;
    readonly name?: string;
    readonly version?: string;
    readonly shasum?: string;
    readonly integrity?: string;
    readonly size?: number;
}
export interface UnpackedTarball {
    readonly files: readonly NpmPackFile[];
    readonly packageJson: Record<string, unknown>;
}
/**
 * Parse the one JSON document npm prints. Warnings belong on stderr, but a
 * caller that got prose on stdout must not have it mistaken for a file name.
 */
export declare function parseNpmPackJson(stdout: string): Result<readonly NpmPackEntry[]>;
/** Decompress and list the regular files in a `.tgz`. */
export declare function unpackNpmTarball(bytes: Uint8Array): Result<UnpackedTarball>;
