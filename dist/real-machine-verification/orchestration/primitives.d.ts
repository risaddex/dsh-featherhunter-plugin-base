/**
 * L2 primitives: the small, composable operations a scenario is made of.
 *
 * A primitive is a function over `Ports`, never a command. It returns a
 * `Result` or a stable observation, so a scenario can branch on the value and a
 * test can call it without a CLI. The CLI commands are thin wrappers around
 * these; scenarios compose them.
 *
 * L3 is deliberately part of the handle rather than a separate module: a
 * scenario that needs the raw pid, a page, or a startup hook reaches through the
 * same object it launched. That is the escape hatch — no new command, no new
 * seam.
 */
import type { ProfileName } from "../contracts/branding";
import type { CheckResult } from "../contracts/check";
import type { EvidenceItem, EvidenceKind } from "../contracts/evidence-contract";
import type { DshRuntimePaths } from "../contracts/launch-plan";
import type { BrowserPageHandle, BrowserProbeFactory, KillOutcome, Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import type { ScenarioObservation } from "../contracts/scenario";
import type { ModelSelection, VerificationProfile } from "../contracts/verification-profile";
import type { EvidenceStore } from "../evidence/store";
import type { CheckOutcome } from "./types";
import { type InstanceFailure, type PlanProjection } from "./instance";
import { type InstallMethod, type InstallOutcome } from "./install-package";
import type { InstanceRecord } from "../runtime/dsh/launch";
import type { CredentialPresence, ModelConfigObservation } from "../runtime/dsh/model-configurator";
import type { BinaryWriter } from "../runtime/platform/binary-writer";
import type { ReadFileSlice } from "../runtime/types";
import type { BrowserAdapterDeclaration } from "../contracts/verification-profile";
/** The five built-in checks a `check` step may name. */
export declare const PRIMITIVE_CHECK_IDS: readonly ["package-installed", "skills-set", "model-configured", "model-credential", "screen-present"];
export type PrimitiveCheckName = (typeof PRIMITIVE_CHECK_IDS)[number];
export interface PrimitiveCheckResult {
    readonly id: PrimitiveCheckName;
    readonly title: string;
    readonly outcome: CheckOutcome;
}
/** A page plus the session that owns it; closing the handle closes both. */
export interface PageHandle {
    readonly page: BrowserPageHandle;
    url(): string;
    evaluate<TResult>(script: string): Promise<Result<TResult>>;
    innerSize(): Promise<Result<{
        readonly width: number;
        readonly height: number;
    }>>;
    outerSize(): Promise<Result<{
        readonly width: number;
        readonly height: number;
    }>>;
    text(selector: string): Promise<Result<string | null>>;
    screenshot(path: string, options?: {
        readonly fullPage?: boolean;
    }): Promise<Result<{
        readonly bytes: number;
    }>>;
    pageErrors(): readonly string[];
    close(): Promise<void>;
}
export interface PageFailure extends Failure {
    readonly kind: "blocked" | "failed";
}
export interface RawProcessHandle {
    readonly pid: number;
    isAlive(): boolean;
    kill(): Promise<Result<KillOutcome>>;
}
export interface PrimitiveLogSnapshot {
    readonly stdout: string;
    readonly stderr: string;
    readonly stdoutPath: string;
    readonly stderrPath: string;
    readonly bytes: number;
    readonly pid: number;
    readonly alive: boolean;
    readonly readable: boolean;
}
/** The L3 escape hatch: one running instance and everything attached to it. */
export interface InstanceHandle {
    readonly record: InstanceRecord;
    readonly plan: PlanProjection;
    readonly pid: number;
    isAlive(): boolean;
    kill(): Promise<Result<KillOutcome>>;
    stop(): Promise<Result<KillOutcome>>;
    logs(bytes?: number): Promise<Result<PrimitiveLogSnapshot>>;
    page(): Promise<Result<PageHandle, PageFailure>>;
    rawProcess(): RawProcessHandle;
}
export interface LaunchPrimitiveOptions {
    readonly port?: number;
    readonly keep?: boolean;
    readonly readyTimeoutMs?: number;
    /**
     * Runs after the plan exists and before the isolated home does: prepare paths
     * outside the home here (the launcher copies the home from the real one).
     */
    readonly beforeLaunch?: (info: {
        readonly home: string;
        readonly dir: string;
        readonly profile: string;
    }) => void | Promise<void>;
    /**
     * Runs after the isolated home is copied and the instance directories exist,
     * but before the host process starts. Seed startup state (workspace
     * registries, settings rows) here: the host loads those stores in memory as
     * it boots, so a later write is overwritten by the running host.
     */
    readonly prepareHome?: (info: {
        readonly home: string;
        readonly dir: string;
        readonly profile: string;
    }) => void | Promise<void>;
    /** Runs after the process is ready; the handle is the L3 escape hatch. */
    readonly afterLaunch?: (handle: InstanceHandle) => void | Promise<void>;
}
export interface ModelPrimitiveState {
    readonly selection: ModelSelection | false;
    readonly patchPath: string;
    readonly configured: boolean;
    readonly observation: ModelConfigObservation | null;
    readonly credential: CredentialPresence | null;
    readonly note: string | null;
}
export interface InstallPrimitiveParams {
    readonly tgz: string;
    readonly method?: InstallMethod;
    readonly candidate?: string | null;
}
export interface EvidencePrimitiveOptions {
    readonly json?: boolean;
    readonly kind?: EvidenceKind;
    readonly note?: string;
}
export interface PrimitiveOptions {
    readonly ports: Ports;
    readonly runtime: {
        readonly nodeVersion: string;
        readonly readFileSlice: ReadFileSlice | null;
    };
    readonly runtimePaths: DshRuntimePaths;
    readonly dshHome: string;
    readonly workRoot: string;
    readonly repoRoot: string;
    readonly profileName: ProfileName;
    readonly profile: VerificationProfile;
    readonly profileDir: string;
    readonly evidence: EvidenceStore;
    readonly note?: (message: string) => void;
    readonly binaryWriter?: BinaryWriter;
    readonly adapter?: BrowserProbeFactory | null;
    readonly loadAdapter?: (options: {
        readonly fs: Ports["fs"];
        readonly repoRoot: string;
        readonly declaration: BrowserAdapterDeclaration;
    }) => Promise<Result<BrowserProbeFactory, PageFailure>>;
    readonly headless?: boolean;
    readonly npmCommand?: string;
    readonly importModule?: (specifier: string) => Promise<unknown>;
}
export interface Primitives {
    launch(options?: LaunchPrimitiveOptions): Promise<Result<InstanceHandle, InstanceFailure>>;
    stop(target?: InstanceHandle | string): Promise<Result<readonly KillOutcome[]>>;
    logs(target?: InstanceHandle | string, bytes?: number): Promise<Result<PrimitiveLogSnapshot>>;
    page(target?: InstanceHandle | string): Promise<Result<PageHandle, PageFailure>>;
    model(): Promise<Result<ModelPrimitiveState>>;
    install(params: InstallPrimitiveParams): Promise<Result<InstallOutcome>>;
    skills(): Promise<Result<PrimitiveCheckResult>>;
    check(name: PrimitiveCheckName): Promise<Result<PrimitiveCheckResult>>;
    evidence(name: string, value: string | unknown, options?: EvidencePrimitiveOptions): Promise<Result<EvidenceItem>>;
    expect(observation: ScenarioObservation): ScenarioObservation;
    sleep(ms: number): Promise<void>;
    instances(): readonly InstanceHandle[];
    lastInstance(): InstanceHandle | null;
    dispose(): Promise<Result<readonly KillOutcome[]>>;
}
export declare function createPrimitives(options: PrimitiveOptions): Primitives;
/** Turn a primitive check outcome into a scenario observation without losing its id. */
export declare function checkObservation(result: PrimitiveCheckResult, options?: {
    readonly source?: "builtin" | "custom";
    readonly hard?: boolean;
    readonly title?: string;
}): ScenarioObservation;
/** Convert a scenario observation to a report check; shared by the runner and CLI. */
export declare function observationToCheck(observation: ScenarioObservation, fallback: {
    readonly id: string;
    readonly title: string;
    readonly source: "builtin" | "custom";
}, index: number, evidenceRefs: (paths: readonly string[]) => CheckResult["evidence"]): CheckResult;
export type CheckResultEvidence = CheckResult["evidence"];
