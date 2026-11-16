/**
 * Fake machine for the `concurrent` tests: everything `launch` needs, but with a
 * process port that hands every spawn its own pid *and* its own port, so N
 * instances look isolated exactly like real ones would.
 *
 * The process fake is the interesting part:
 * - spawn index i gets pid `basePid + i` and port `basePort + i` (overridable),
 *   and the ready line is seeded into that spawn's stdout file, so the real
 *   readiness parser runs unchanged;
 * - `spawnFailures` makes one spawn fail without consuming a pid, mirroring a host
 *   that exits before printing its token URL;
 * - `stubbornPids` stay alive through `killTree`, which is how a cleanup test gets
 *   a survivor to report instead of trusting the kill request.
 */
import type { KillOutcome, Ports, ProcessPort, SpawnRequest, SpawnedProcess } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import { type LaunchFixture, type ScriptedHttp } from "./fake-launch";
/** What one successful spawn looked like. */
export interface SpawnedInstance {
    readonly index: number;
    readonly pid: number;
    readonly port: number;
}
/** One `killTree` call, in the order it happened. */
export interface RecordedKill {
    readonly pid: number;
    readonly timeoutMs: number | undefined;
}
export interface MultiScriptedProcessOptions {
    /** Pid of the first spawn; later spawns increment it. */
    readonly basePid?: number;
    /** Port of the first spawn; later spawns increment it. */
    readonly basePort?: number;
    /** Spawn index (0-based) → the failure `spawnDetached` should return. */
    readonly spawnFailures?: Readonly<Record<number, Failure>>;
    /** Pids `killTree` must not kill, so cleanup can report a survivor. */
    readonly stubbornPids?: readonly number[];
    /** Explicit port per spawn index, to force a collision on purpose. */
    readonly portFor?: (index: number) => number;
    /**
     * Called synchronously inside the spawn, after the pid/port are chosen. The
     * callback sees *its own* spawn record, so concurrent spawns cannot cross wires.
     */
    readonly onSpawn?: (request: SpawnRequest, instance: SpawnedInstance) => void;
}
/** A process port that treats every spawn as a new isolated instance. */
export declare class MultiScriptedProcess implements ProcessPort {
    readonly spawns: SpawnRequest[];
    readonly kills: RecordedKill[];
    readonly started: SpawnedInstance[];
    private readonly live;
    private readonly options;
    constructor(options?: MultiScriptedProcessOptions);
    spawnDetached(request: SpawnRequest): Promise<Result<SpawnedProcess>>;
    isAlive(pid: number): boolean;
    killTree(pid: number, options?: {
        readonly timeoutMs?: number;
    }): Promise<Result<KillOutcome>>;
}
export interface ConcurrentFixtureOptions {
    /**
     * The declared plugin cache directory. The string `null` declares *no* cache
     * directory, which is a different fact from "not passed" and must be explicit.
     */
    readonly pluginCacheDir?: string | null;
    readonly profilePresent?: boolean;
    readonly declaration?: LaunchFixture["declaration"];
    readonly realCredentials?: string;
    readonly workRoot?: string;
    readonly basePid?: number;
    readonly basePort?: number;
    readonly spawnFailures?: Readonly<Record<number, Failure>>;
    readonly stubbornPids?: readonly number[];
    readonly portFor?: (index: number) => number;
}
/** The launch fixture plus the multi-instance process fake the tests inspect. */
export interface ConcurrentFixture {
    readonly fs: LaunchFixture["fs"];
    readonly env: LaunchFixture["env"];
    readonly clock: LaunchFixture["clock"];
    readonly runtime: LaunchFixture["runtime"];
    readonly profile: LaunchFixture["profile"];
    readonly declaration: LaunchFixture["declaration"];
    readonly paths: LaunchFixture["paths"];
    readonly ports: Ports;
    readonly http: ScriptedHttp;
    readonly multi: MultiScriptedProcess;
}
/** Build one fake machine that can host N isolated instances. */
export declare function createConcurrentFixture(options?: ConcurrentFixtureOptions): ConcurrentFixture;
/** A `loadDeclaration` replacement returning this fixture's declaration. */
export declare function concurrentLoader(fixture: ConcurrentFixture): (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
/**
 * Seed an additional profile directory, for the `--profiles` tests.
 *
 * The files mirror what `createLaunchFixture` seeds for the base profile: a valid
 * profile manifest and a workspace storage.
 */
export declare function seedProfile(fixture: ConcurrentFixture, name: string): void;
