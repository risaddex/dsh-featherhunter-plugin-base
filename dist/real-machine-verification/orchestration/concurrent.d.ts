/**
 * `concurrent` orchestration: plan N isolated instances, launch them together,
 * reap every one of them, and expose the per-instance facts a check can compare.
 *
 * The command's claim is not "two launches happened"; it is "two launches could
 * not have interfered". So the planner gives every instance a distinct id (a
 * distinct `startedAtMs`), the executor fans out with `Promise.allSettled` so one
 * failure cannot cancel the others, and the cleanup walk stops every instance
 * that did start — including when a sibling failed — then re-checks liveness
 * instead of trusting the kill request.
 *
 * "Failed launch" and "failed cleanup" are deliberately different facts:
 * `executeInstance` reaps a process it could not make ready, so a failed row needs
 * no cleanup; a cleanup row exists only for an instance that reached readiness.
 * That split is what lets `teardown-clean` pass on a run where one instance never
 * started.
 */
import type { ProfileName } from "../contracts/branding";
import type { EvidenceItemRef } from "../contracts/evidence-contract";
import type { DshRuntimePaths } from "../contracts/launch-plan";
import type { Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import type { VerificationProfile } from "../contracts/verification-profile";
import { type ExecutedInstance, type InstanceFailure, type InstancePlan } from "./instance";
import type { CheckPlan } from "./types";
/** The command name, shared by the orchestrator, the CLI and the report. */
export declare const CONCURRENT_COMMAND = "concurrent";
/** How many instances `concurrent` launches when `--count` is not given. */
export declare const DEFAULT_CONCURRENCY = 2;
/**
 * Upper bound on `--count`.
 *
 * This is a guard rail, not a machine limit: every instance is a full DSH host
 * with its own home, and a report that requests more than this is far more likely
 * to be a typo than an intention.
 */
export declare const MAX_CONCURRENCY = 32;
/** One requested instance: which profile and where its profile directory lives. */
export interface ConcurrentTarget {
    readonly profileName: ProfileName;
    readonly profileDir: string;
}
/** Readiness of one instance as the report states it. */
export type ConcurrentReadiness = "ready" | "failed" | "not-started";
/** What the cleanup walk observed for one launched instance. */
export interface ConcurrentCleanup {
    /** The instance is stopped *and* its pid was observed dead afterwards. */
    readonly verified: boolean;
    /** `stopRecord` returned ok (it killed the tree, or found it already gone). */
    readonly stopped: boolean;
    /** The process was already dead before the kill request. */
    readonly alreadyGone: boolean;
    /** `isAlive` still reported true after `stopRecord` returned. */
    readonly aliveAfter: boolean;
    /** `stopRecord` error message when it did not return ok. */
    readonly error: string | null;
}
/** One row of the per-instance comparison table the report carries. */
export interface ConcurrentRow {
    /** 1-based instance number, as printed in the report. */
    readonly index: number;
    readonly instanceId: string;
    readonly profile: ProfileName;
    readonly dir: string;
    readonly home: string;
    readonly workdir: string;
    readonly pluginLogDir: string | null;
    readonly pid: number | null;
    readonly port: number | null;
    readonly tokenPresent: boolean;
    readonly readiness: ConcurrentReadiness;
    readonly failure: Failure | null;
    readonly cleanup: ConcurrentCleanup | null;
}
/** A planning failure, tagged with the instance that could not be planned. */
export interface ConcurrentPlanFailure extends Failure {
    readonly instanceIndex: number;
    readonly instanceId: string;
    readonly profileName: ProfileName;
}
/** A run-level failure that happened before any instance could be launched. */
export interface ConcurrentFailure {
    readonly stage: "declaration" | "profile" | "runtime" | "plan";
    readonly message: string;
    readonly hint: string | null;
    readonly details?: Readonly<Record<string, unknown>>;
}
/** Everything the checks need to compare the instances of one run. */
export interface ConcurrentContext {
    readonly count: number;
    readonly rows: readonly ConcurrentRow[];
    /** Non-null when the run stopped before launching; checks then report blocked/skip. */
    readonly failure: ConcurrentFailure | null;
    readonly workRoot: string;
    readonly dshHome: string;
    readonly ports: Ports;
    readonly evidenceRefs?: readonly EvidenceItemRef[];
}
export interface PlanConcurrentInstancesOptions {
    readonly ports: Ports;
    readonly runtime: DshRuntimePaths;
    readonly dshHome: string;
    readonly profile: VerificationProfile;
    readonly workRoot: string;
    readonly targets: readonly ConcurrentTarget[];
    /** Base timestamp; instance i gets `startedAtMs + i` so the ids cannot collide. */
    readonly startedAtMs: number;
    readonly keep?: boolean;
}
/**
 * Plan every instance in request order.
 *
 * A failure returns the first instance that could not be planned, with the
 * instance number and id in the message: a blocked report has to say *which*
 * instance could not be isolated, not just that "planning failed".
 */
export declare function planConcurrentInstances(options: PlanConcurrentInstancesOptions): Promise<Result<readonly InstancePlan[], ConcurrentPlanFailure>>;
/** One instance's execution outcome, paired with its plan. */
export interface ConcurrentExecution {
    readonly index: number;
    readonly plan: InstancePlan;
    readonly result: Result<ExecutedInstance, InstanceFailure>;
}
export interface ExecuteConcurrentOptions {
    readonly ports: Ports;
    readonly runtime: DshRuntimePaths;
    readonly plans: readonly InstancePlan[];
    readonly note?: (message: string) => void;
    readonly readyTimeoutMs?: number;
}
/**
 * Execute every plan concurrently.
 *
 * `Promise.allSettled` is the point: a rejection (or a throwing fake) is turned
 * into a `not-ready` failure for that instance only, so the other instances still
 * launch, still report, and still get cleaned up. Failures are never dropped:
 * every plan yields exactly one execution row.
 */
export declare function executeConcurrent(options: ExecuteConcurrentOptions): Promise<readonly ConcurrentExecution[]>;
/** One instance the cleanup walk actually stopped. */
export interface ConcurrentCleanupRow {
    readonly index: number;
    readonly instanceId: string;
    readonly pid: number;
    readonly cleanup: ConcurrentCleanup;
}
export interface CleanupConcurrentOutcome {
    readonly rows: readonly ConcurrentCleanupRow[];
    /** Pids that were still alive after the stop attempt; the report names them. */
    readonly residualPids: readonly number[];
}
export interface CleanupConcurrentOptions {
    readonly ports: Ports;
    readonly executed: readonly ConcurrentExecution[];
    readonly note?: (message: string) => void;
}
/**
 * Stop every instance that started, and *verify* each process is gone.
 *
 * A failed launch is skipped on purpose: `executeInstance` already reaped it. The
 * liveness re-check after `stopRecord` is what makes this evidence rather than a
 * claim — `stopRecord` can time out, and a survivor would hold a port and poison
 * the next run.
 */
export declare function cleanupConcurrent(options: CleanupConcurrentOptions): Promise<CleanupConcurrentOutcome>;
export interface BuildConcurrentRowsOptions {
    readonly plans: readonly InstancePlan[];
    readonly executed: readonly ConcurrentExecution[];
    readonly cleanup: CleanupConcurrentOutcome;
}
/** Join plans, executions and cleanup observations into the report rows. */
export declare function buildConcurrentRows(options: BuildConcurrentRowsOptions): readonly ConcurrentRow[];
/** Turn a run-level failure into the value the checks read. */
export declare function concurrentFailure(stage: ConcurrentFailure["stage"], error: Failure): ConcurrentFailure;
/** The checks a concurrent run executes, in report order. */
export declare function planConcurrentChecks(): CheckPlan<ConcurrentContext>;
/** One human line naming the four isolation fields and the readiness of one instance. */
export declare function describeConcurrentRow(row: ConcurrentRow): string;
/** The report's single `profile` value when several profiles ran, e.g. `web,alpha`. */
export declare function concurrentProfilesLabel(profiles: readonly ProfileName[]): string;
