/**
 * In-memory filesystem, clock and environment for the tests.
 *
 * The self-check suite must not touch the machine it runs on: no real DSH home,
 * no real writes, no dependence on where the tests are checked out. These fakes
 * keep the exact `FsPort` contract (Result instead of throw, parent-directory
 * rules, overwrite semantics) so the same code paths run here as on a real host.
 */
import type { Sha256Hex } from "../../contracts/branding";
import type { ClockPort, CopyOutcome, DirEntry, EnvPort, FileStat, FsPort, PlatformName } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** Normalize a path the way the fake filesystem keys it: `/`-separated, drive lowercase. */
export declare function fakePath(input: string): string;
/** An in-memory `FsPort` with real parent-directory and overwrite rules. */
export declare class FakeFs implements FsPort {
    private readonly files;
    private readonly directories;
    private readonly cwd;
    /** Every mutating call, in order; tests assert a plan-only path records none. */
    readonly writes: {
        readonly op: string;
        readonly path: string;
    }[];
    constructor(cwd?: string);
    resolve(path: string): string;
    seedDir(path: string): void;
    seedFile(path: string, content: string | Uint8Array): void;
    seedJson(path: string, value: unknown): void;
    readFileSync(path: string): string;
    readJsonSync(path: string): unknown;
    /** Normalized paths of the immediate children of a directory, sorted. */
    children(path: string): string[];
    private listSync;
    private requireParent;
    readText(path: string): Promise<Result<string>>;
    writeText(path: string, text: string): Promise<Result<void>>;
    readJson(path: string): Promise<Result<unknown>>;
    writeJson(path: string, value: unknown): Promise<Result<void>>;
    readBytes(path: string): Promise<Result<Uint8Array>>;
    hashFile(path: string): Promise<Result<Sha256Hex>>;
    exists(path: string): Promise<boolean>;
    stat(path: string): Promise<Result<FileStat>>;
    list(path: string): Promise<Result<readonly DirEntry[]>>;
    makeDir(path: string): Promise<Result<void>>;
    remove(path: string, options?: {
        readonly recursive?: boolean;
    }): Promise<Result<void>>;
    copy(from: string, to: string, options?: {
        readonly recursive?: boolean;
    }): Promise<Result<CopyOutcome>>;
    move(from: string, to: string): Promise<Result<void>>;
    realPath(path: string): Promise<Result<string>>;
}
export declare function formatLocal(ms: number, offsetMinutes: number): string;
/** A clock that only moves when a test says so. */
export declare class FakeClock implements ClockPort {
    private readonly baseMs;
    private offsetMs;
    private readonly offsetMinutes;
    constructor(baseIso?: string);
    nowMs(): number;
    advance(ms: number): void;
    iso(ms?: number): string;
    sleep(ms: number): Promise<void>;
}
export interface FakeEnvOptions {
    readonly values?: Readonly<Record<string, string>>;
    readonly home?: string;
    readonly tmp?: string;
    readonly platform?: PlatformName;
    readonly execPath?: string;
    readonly cwd?: string;
}
/** An `EnvPort` backed by a map; nothing leaks from the real process. */
export declare class FakeEnv implements EnvPort {
    private readonly values;
    private readonly home;
    private readonly tmp;
    private readonly platformName;
    private readonly nodePath;
    private readonly workingDirectory;
    constructor(options?: FakeEnvOptions);
    set(name: string, value: string | undefined): void;
    get(name: string): string | undefined;
    snapshot(): Readonly<Record<string, string>>;
    homeDir(): string;
    tmpDir(): string;
    platform(): PlatformName;
    execPath(): string;
    cwd(): string;
}
