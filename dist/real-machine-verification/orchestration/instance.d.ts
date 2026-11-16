import { type DshRuntimePaths, type LaunchModelPlan, type LaunchPlan } from "../contracts/launch-plan";
import type { Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import type { ProfileName } from "../contracts/branding";
import type { VerificationProfile } from "../contracts/verification-profile";
import { type CopyProfileOutcome } from "../runtime/dsh/home";
import { type InventoryReadiness } from "../runtime/dsh/http-session";
import { type InstanceModelRecord, type InstanceReadiness, type InstanceRecord } from "../runtime/dsh/launch";
/** Which part of the launch failed; the CLI maps this onto the exit-code contract. */
export type InstanceFailureStage = "prerequisite" | "not-ready";
/** A launch failure carrying the stage that produced it. */
export type InstanceFailure = Failure & {
    readonly stage: InstanceFailureStage;
};
/** The readiness criterion in one sentence, reused by errors and reports. */
export declare const READINESS_CRITERION = "the host printed its token URL and every enabled plugin entry reported fiberPhase active";
/** Where one instance lives. All paths are absolute. */
export interface InstanceLayout {
    /** `<workRoot>/instances/<instanceId>`. */
    readonly dir: string;
    /** Isolated `DSH_HOME`. */
    readonly home: string;
    /** Redirected `USERPROFILE`/`HOME`. */
    readonly userprofile: string;
    /** Child process cwd; holds the plugin cache and logs. */
    readonly workdir: string;
    readonly stdoutLog: string;
    readonly stderrLog: string;
    readonly planPath: string;
    readonly instancePath: string;
}
/** The profile copy the instance needs before it can start. */
export interface ProfileCopyPlan {
    readonly sourceProfileDir: string;
    readonly targetProfileDir: string;
    readonly pluginCacheDir: string | null;
}
/** Everything `--dry-run` prints and `executeInstance` performs. */
export interface InstancePlan {
    readonly instanceId: string;
    readonly profileName: ProfileName;
    readonly profile: VerificationProfile;
    readonly layout: InstanceLayout;
    readonly copy: ProfileCopyPlan;
    readonly launch: LaunchPlan;
    /** Model configured on the child env; contains the secret, never projected. */
    readonly modelPlan: LaunchModelPlan | null;
    /** Model provenance recorded in `instance.json`; contains no secret. */
    readonly model: InstanceModelRecord | null;
    /** Warning to print when the model is configured but its credential is missing. */
    readonly modelNote: string | null;
    /** Human-readable planning notes (paths, copy source, model provenance). */
    readonly notes: readonly string[];
    readonly workRoot: string;
    readonly dshHome: string;
    readonly startedAtMs: number;
    readonly startedAt: string;
    readonly keep: boolean;
}
export interface PlanInstanceOptions {
    readonly ports: Ports;
    readonly runtime: DshRuntimePaths;
    /** The developer's real DSH home; only read, never written. */
    readonly dshHome: string;
    readonly profileName: ProfileName;
    readonly profile: VerificationProfile;
    /** `<dshHome>/profiles/<profileName>`; must exist. */
    readonly profileDir: string;
    readonly workRoot: string;
    /** `0` (default) asks the host for an ephemeral port. */
    readonly port?: number;
    readonly keep: boolean;
    /** Injected so a test fixes the id and the timestamps. */
    readonly startedAtMs: number;
}
/** JSON-safe shape of the plan; contains names, never secret values. */
export interface PlanProjection {
    readonly schemaVersion: 1;
    readonly instanceId: string;
    readonly profile: string;
    readonly dir: string;
    readonly home: string;
    readonly userprofile: string;
    readonly workdir: string;
    readonly startedAt: string;
    readonly argv: readonly string[];
    readonly envNames: readonly string[];
    readonly secretEnvNames: readonly string[];
    readonly port: number;
    readonly logFiles: {
        readonly stdout: string;
        readonly stderr: string;
        readonly pluginLogDir: string | null;
    };
    readonly profileCopy: {
        readonly sourceProfileDir: string;
        readonly targetProfileDir: string;
        readonly pluginCacheDir: string | null;
        readonly files?: number;
        readonly bytes?: number;
        readonly removedLogDirectory?: string | null;
    };
    readonly model: InstanceModelRecord | null;
    readonly notes: readonly string[];
    readonly keep: boolean;
}
/** Deterministic instance id: no clock-format dependence beyond the epoch ms. */
export declare function instanceIdFor(profile: string, workRoot: string, startedAtMs: number): string;
/** The instance directory layout for one id. */
export declare function instanceLayoutFor(workRoot: string, instanceId: string): InstanceLayout;
/**
 * Build the launch plan. Reads files (profile existence, credential store) and
 * writes nothing; the only effects happen in `executeInstance`.
 */
export declare function planInstance(options: PlanInstanceOptions): Promise<Result<InstancePlan, InstanceFailure>>;
/** Project a plan into the JSON-safe shape written to `plan.json` and printed by `--json`. */
export declare function projectInstancePlan(plan: InstancePlan, copyOutcome?: CopyProfileOutcome | null): PlanProjection;
export interface ExecuteInstanceOptions {
    readonly ports: Ports;
    readonly plan: InstancePlan;
    readonly runtime: DshRuntimePaths;
    readonly note?: (message: string) => void;
    readonly readyTimeoutMs?: number;
    /**
     * Runs after the isolated home is copied and the instance directories exist,
     * but before the host process starts. The only safe moment to seed state the
     * host loads into memory during boot (workspace registries, settings rows):
     * seeding after startup is overwritten by the running host, seeding before
     * this point loses the files with the home copy.
     */
    readonly beforeStart?: (info: {
        readonly home: string;
        readonly dir: string;
        readonly profile: string;
    }) => void | Promise<void>;
}
/** A launched, proven-ready instance plus the evidence captured at launch time. */
export interface ExecutedInstance {
    readonly record: InstanceRecord;
    readonly readiness: InstanceReadiness;
    readonly copy: CopyProfileOutcome;
    readonly plan: PlanProjection;
}
/** One-line description of the entries that kept the instance from being ready. */
export declare function describeOffenders(offenders: InventoryReadiness["offenders"]): string;
/**
 * Execute a plan: copy the profile, start the host, prove both readiness
 * criteria, then write `plan.json` and `instance.json`.
 *
 * Every failure after the spawn stops the tree before returning, so a failed
 * launch never leaves a host process holding the port. The two records are
 * written last, in that order: the instance record is the handle, so it is the
 * very last thing that appears.
 */
export declare function executeInstance(options: ExecuteInstanceOptions): Promise<Result<ExecutedInstance, InstanceFailure>>;
