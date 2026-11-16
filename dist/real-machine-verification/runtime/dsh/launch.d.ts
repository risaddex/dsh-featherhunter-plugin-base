import type { DshRuntimePaths, LaunchPlan, ReadyUrl } from "../../contracts/launch-plan";
import type { ClockPort, FsPort, KillOutcome, Ports, ProcessPort } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** Where a model credential was resolved from; never the credential itself. */
export type InstanceCredentialSource = "batch-home-store" | "real-home-store" | "process-env" | "missing";
/** The model an instance was configured with. Contains names and sources only. */
export interface InstanceModelRecord {
    readonly provider: string;
    readonly model: string;
    /** The credential reference name, e.g. `MINIMAX_CN_API_KEY`. */
    readonly apiKeyEnv: string;
    readonly credentialSource: InstanceCredentialSource;
    readonly credentialAvailable: boolean;
    /** Whether the profile declared a model at all. */
    readonly profileConfigured: boolean;
}
/** One enabled entry whose fiber was not `active` when the instance was checked. */
export interface ReadinessOffender {
    readonly entryId: string;
    readonly fiberPhase: string | null;
}
/** Evidence that the two readiness criteria passed, captured at launch time. */
export interface InstanceReadiness {
    /** The host printed its token URL. */
    readonly stdoutLine: true;
    /** HTTP status of the connect handshake (302 on the real host). */
    readonly connectStatus: number;
    readonly inventory: {
        readonly entryCount: number;
        readonly enabledCount: number;
        readonly activeCount: number;
        readonly offenders: readonly ReadinessOffender[];
    };
    readonly checkedAt: string;
    readonly elapsedMs: number;
}
/** The on-disk handle. Every later command reads this instead of remembering a PID. */
export interface InstanceRecord {
    readonly schemaVersion: 1;
    /** Deterministic 16-hex instance id: sha256(canonicalJson({profile, workRoot, startedAtMs})). */
    readonly instanceId?: string;
    /** The instance directory holding home/, userprofile/, workdir/ and the records. */
    readonly dir?: string;
    readonly pid: number;
    readonly port: number;
    readonly tokenUrl: string;
    readonly originUrl: string;
    readonly profile: string;
    readonly home: string;
    readonly userprofile: string;
    readonly startCwd: string;
    readonly startedAt: string;
    /** Milliseconds from spawn to the readiness line. */
    readonly readyMs: number;
    readonly stdoutPath: string;
    readonly stderrPath: string;
    readonly pluginLogDir: string | null;
    readonly exe: string;
    readonly cliJs: string;
    readonly envNames: readonly string[];
    readonly secretEnvNames: readonly string[];
    /** Model reported by the planner; never contains the secret itself. */
    readonly model: InstanceModelRecord | null;
    readonly readiness?: InstanceReadiness;
    /** `--keep` requested; informational, the instance is detached either way. */
    readonly keep?: boolean;
    readonly planPath?: string;
}
export interface StartInstanceOptions {
    readonly ports: Ports;
    readonly plan: LaunchPlan;
    readonly runtime: DshRuntimePaths;
    /** Stable, scriptable progress lines; warnings go to stderr. */
    readonly note?: (message: string) => void;
    readonly readyTimeoutMs?: number;
}
/** What `startInstance` observed before any readiness verdict was written. */
export interface StartedInstance {
    readonly pid: number;
    readonly startedAtMs: number;
    readonly startedAt: string;
    readonly ready: ReadyUrl;
    readonly readyMs: number;
}
export interface BuildInstanceRecordOptions {
    readonly started: StartedInstance;
    readonly plan: LaunchPlan;
    readonly runtime: DshRuntimePaths;
    readonly model: InstanceModelRecord | null;
    readonly readiness: InstanceReadiness;
    readonly instanceId: string;
    readonly dir: string;
    readonly keep: boolean;
    readonly planPath: string;
}
export declare const INSTANCE_FILE = "instance.json";
export declare const STOPPED_FILE = "stopped.json";
export declare const DEFAULT_READY_TIMEOUT_MS = 120000;
export declare function instanceFilePath(startCwd: string): string;
/** Prefer the explicit instance directory; fall back to the start directory. */
export declare function instanceDirectory(record: Pick<InstanceRecord, "dir" | "startCwd">): string;
interface WaitedReadiness {
    readonly ready: ReadyUrl;
    readonly readyMs: number;
}
/** Tail of a captured file, for the "it died before printing anything" message. */
export declare function tailOf(fs: FsPort, file: string, bytes?: number): Promise<string>;
/**
 * Poll the captured stdout for the readiness line.
 *
 * The process being dead is checked first: waiting for a URL from a process that
 * already exited wastes the whole timeout and hides the real error (a missing
 * profile, a locked home) behind a generic "timed out". The failure carries the
 * captured tails so the caller can print the actual first error.
 */
export declare function waitForReady(options: {
    readonly fs: FsPort;
    readonly clock: ClockPort;
    readonly process: ProcessPort;
    readonly stdoutPath: string;
    readonly stderrPath: string;
    readonly pid: number;
    readonly readyTimeoutMs?: number;
}, startedAtMs?: number): Promise<Result<WaitedReadiness>>;
/**
 * Kill a PID tree and poll until the PID is gone. Used on every failure path
 * after a spawn, so a failed launch never leaves a host process behind.
 */
export declare function reapProcess(options: {
    readonly fs: FsPort;
    readonly clock: ClockPort;
    readonly process: ProcessPort;
    readonly pid: number;
    readonly timeoutMs?: number;
}): Promise<Result<KillOutcome>>;
/**
 * Start one instance: prepare the log files, spawn detached, wait for the token
 * URL. The caller has already materialized the isolated home and decided the plan
 * (`planLaunch`); this function only performs the effects in the host's order.
 */
export declare function startInstance(options: StartInstanceOptions): Promise<Result<StartedInstance>>;
/** Assemble the `instance.json` value. Pure: no I/O, no secrets. */
export declare function buildInstanceRecord(options: BuildInstanceRecordOptions): InstanceRecord;
/** Write `instance.json` into the instance directory (the launch handle). */
export declare function writeInstanceRecord(fs: FsPort, record: InstanceRecord): Promise<Result<void>>;
/** Path of the stop record for this instance. */
export declare function stoppedFilePath(record: Pick<InstanceRecord, "dir" | "startCwd">): string;
/** Kill a recorded instance and verify it is gone; always leaves `stopped.json`. */
export declare function stopRecord(ports: Ports, record: InstanceRecord, timeoutMs?: number): Promise<Result<KillOutcome>>;
/** Read `instance.json` from an instance directory or from the file itself. */
export declare function loadInstance(fs: FsPort, target: string): Promise<Result<InstanceRecord>>;
/** Stop an instance addressed by its directory or record file. */
export declare function stopInstance(ports: Ports, target: string): Promise<Result<KillOutcome>>;
export {};
