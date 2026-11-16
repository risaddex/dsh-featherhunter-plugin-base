import type { CheckResult } from "../contracts/check";
import type { Ports } from "../contracts/ports";
import type { DshRuntimePaths } from "../contracts/launch-plan";
import { type Failure, type Result } from "../contracts/result";
import type { RunState, RunStep } from "../contracts/run-state";
import type { ScenarioDefinition, ScenarioResult } from "../contracts/scenario";
import type { ProfileName } from "../contracts/branding";
import type { VerificationProfile } from "../contracts/verification-profile";
import type { EvidenceStore } from "../evidence/store";
import type { BinaryWriter } from "../runtime/platform/binary-writer";
import type { InstanceHandle, Primitives } from "./primitives";
import type { BrowserProbeFactory } from "../contracts/ports";
import type { ReadFileSlice } from "../runtime/types";
export declare const RUN_COMMAND = "run";
export declare const DEFAULT_SCENARIO_TIMEOUT_MS = 120000;
export declare const MAX_SCENARIO_CONCURRENCY = 32;
export type ScenarioLoadStage = "path" | "import" | "export" | "validate";
export type ScenarioLoadFailure = Failure & {
    readonly stage: ScenarioLoadStage;
};
export interface LoadedScenarioFile {
    readonly path: string;
    readonly scenarios: readonly ScenarioDefinition<ScenarioContext>[];
}
export interface ScenarioContext {
    readonly scenarioId: string;
    readonly primitives: Primitives;
    readonly instance: InstanceHandle | null;
    readonly instances: readonly InstanceHandle[];
    readonly evidence: EvidenceStore;
    readonly note: (message: string) => void;
}
export interface ScenarioLoadOptions {
    readonly ports: Ports;
    readonly cwd: string;
    readonly repoRoot: string;
    readonly specifier: string;
    readonly importModule?: (specifier: string) => Promise<unknown>;
}
export declare function loadScenarioFile(options: ScenarioLoadOptions): Promise<Result<LoadedScenarioFile, ScenarioLoadFailure>>;
export interface ScenarioRunOptions {
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
    readonly binaryWriter?: BinaryWriter;
    readonly adapter?: BrowserProbeFactory | null;
    readonly importModule?: (specifier: string) => Promise<unknown>;
    readonly npmCommand?: string;
    readonly headless?: boolean;
    readonly note?: (message: string) => void;
    /** Default 1; clamped to 1..MAX_SCENARIO_CONCURRENCY. */
    readonly concurrency?: number;
    /** Stop each scenario at its first failing step. */
    readonly failFast?: boolean;
}
export interface ScenarioRunOutcome {
    readonly scenarios: readonly ScenarioResult[];
    readonly checks: readonly CheckResult[];
    readonly steps: readonly RunStep[];
    readonly notes: readonly string[];
    readonly state: RunState;
    readonly exitCode: 0 | 1 | 2;
}
export declare function runScenarios(definitions: readonly ScenarioDefinition<ScenarioContext>[], options: ScenarioRunOptions): Promise<Result<ScenarioRunOutcome, Failure>>;
/** Build the one-line human summary the CLI prints for a scenario result. */
export declare function describeScenarioResult(result: ScenarioResult): string;
