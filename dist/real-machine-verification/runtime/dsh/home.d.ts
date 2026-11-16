import type { EnvPort, FsPort } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/**
 * The developer's real DSH home. Never written to by this tool.
 *
 * Derived only from the OS account (USERPROFILE, or the environment port's own
 * home), never from an environment variable the caller can point elsewhere. An
 * earlier version honoured DSH_REAL_HOME, which meant a run could move the real
 * home out of the guard's view and then write into it; the audit of 2026-11-02
 * reproduced exactly that. Tests that need another real home set USERPROFILE on
 * the FakeEnv, which is what the isolation probe already does.
 */
export declare function resolveRealHome(env: EnvPort): string;
export interface WriteTarget {
    /** The flag (or DSH_HOME) the caller used to name this target. */
    readonly flag: string;
    readonly value: string;
}
export interface RealHomeWriteHit {
    readonly realHome: string;
    readonly flag: string;
    readonly value: string;
}
/**
 * The one real-home guard: a write target is refused when it is the real DSH
 * home or anything below it.
 *
 * Two things make the naive samePath(dshHome, realHome) check insufficient, and
 * both were reproduced by the 2026-11-02 audit:
 *
 * 1. containment: DSH_HOME pointed at a subdirectory of the real home is a
 *    different path but still a write inside it, so this compares with
 *    isInsidePath;
 * 2. links: a junction or symlink can name the real home while looking
 *    unrelated, so both sides are canonicalised with fs.realPath first and
 *    compared again (paths that do not exist yet fall back to their text).
 */
export declare function findWriteUnderRealHome(options: {
    readonly fs: FsPort;
    readonly env: EnvPort;
    readonly cwd: string;
    /** The home the command is about to write into, when it has one. */
    readonly dshHome?: string | undefined;
    readonly writeTargets?: readonly WriteTarget[] | undefined;
}): Promise<RealHomeWriteHit | null>;
export interface CopyProfileOptions {
    readonly fs: FsPort;
    readonly sourceHome: string;
    readonly targetHome: string;
    readonly profile: string;
    /** Plugin cache directory to strip of `logs` in the copy, e.g. `.dsh-demo-cache`. */
    readonly pluginCacheDir?: string;
    /** Replace an existing target home instead of refusing. */
    readonly force?: boolean;
}
export interface CopyProfileOutcome {
    readonly sourceProfileDir: string;
    readonly targetProfileDir: string;
    readonly files: number;
    readonly bytes: number;
    /** Directory that was deleted because it held stale plugin logs, when any. */
    readonly removedLogDirectory: string | null;
}
/**
 * Copy `<sourceHome>/profiles/<profile>` into a fresh home.
 *
 * Stale plugin logs are removed from the copy: a log file that already contains
 * hundreds of events from a previous run would make "the plugin logged something"
 * true before the instance ever started, which is exactly the kind of vacuous
 * evidence this tool exists to reject.
 */
export declare function copyProfile(options: CopyProfileOptions): Promise<Result<CopyProfileOutcome>>;
/**
 * Deterministic workspace id: sha256 of the lowercased absolute path, shaped as a
 * UUIDv4 so the host accepts it. The path is normalized to `/` first because the
 * same workspace must keep one id whether it was registered on Windows or Linux.
 */
export declare function workspaceIdForPath(path: string): string;
export interface WorkspaceSeed {
    /** Absolute path the instance should treat as its workspace. */
    readonly path: string;
    /** Display title; defaults to the directory name. */
    readonly title?: string;
}
export interface SeedWorkspaceRegistryOptions {
    readonly fs: FsPort;
    readonly home: string;
    readonly workspaces: readonly WorkspaceSeed[];
    /** Which seeded workspace is the default one. */
    readonly defaultPath?: string;
    /** Timestamp written into each new entry. Caller supplies it from the clock port. */
    readonly nowIso: string;
}
interface WorkspaceEntry {
    readonly path: string;
    readonly title: string;
    readonly sessionIds: readonly string[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
interface WorkspaceRegistry {
    readonly unit: {
        readonly name: "workspace";
        readonly version: 2;
    };
    readonly global: {
        readonly initialized: boolean;
        readonly workspaceIds: readonly string[];
        readonly archivedSessionIds: readonly string[];
        readonly pinnedSessionIds: readonly string[];
        readonly defaultWorkspaceId: string | null;
    };
    readonly tables: {
        readonly workspaces: Readonly<Record<string, WorkspaceEntry>>;
    };
}
export declare function workspaceRegistryPath(home: string): string;
/** Read the registry, treating an absent or unreadable file as an empty one. */
export declare function readWorkspaceRegistry(fs: FsPort, home: string): Promise<Result<WorkspaceRegistry>>;
/**
 * Register seeded workspaces in the isolated home's storage.
 *
 * Existing entries are preserved: a batch may seed two workspaces into a home
 * that already knows one, and dropping the third would make the menu state depend
 * on the order the caller seeded them.
 */
export declare function seedWorkspaceRegistry(options: SeedWorkspaceRegistryOptions): Promise<Result<readonly string[]>>;
export {};
