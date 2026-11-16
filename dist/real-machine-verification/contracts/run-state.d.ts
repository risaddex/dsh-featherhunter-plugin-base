/**
 * Run report: the single object a command prints, writes to disk and quotes in a
 * ticket comment.
 *
 * The report is the contract between the tool and its readers, so it deliberately
 * carries *facts* rather than prose: each check keeps expected/actual, each step
 * keeps its start and end, and the exit code is derived from the checks instead
 * of being set by hand. Three readers depend on that:
 *
 * - a human reading `self-check` output at a glance;
 * - a CI job switching on the exit code (0 pass, 1 hard failure, 2 blocked);
 * - another machine re-verifying the claim from the evidence files alone.
 */
import type { CheckResult } from "./check";
/** Coarse state of a whole run. `blocked` means "could not observe", not "observed bad". */
export type RunState = "planned" | "running" | "passed" | "failed" | "blocked" | "aborted";
/** One step of an L1 command (launch, open page, collect evidence…). */
export interface RunStep {
    readonly id: string;
    readonly title: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly state: "done" | "failed" | "skipped";
    readonly detail?: string;
}
/** What the run concluded about the model. Never contains a secret value. */
export interface RunModelReport {
    readonly provider: string;
    readonly model: string;
    readonly apiKeyEnv: string;
    readonly credentialSource: "batch-home-store" | "real-home-store" | "process-env" | "missing";
    readonly credentialAvailable: boolean;
    readonly profileConfigured: boolean;
    readonly file?: string;
}
/** What the run concluded about the batch it belongs to. */
export interface RunBatchReport {
    readonly name: string;
    readonly dir: string;
    readonly status: "active" | "stale" | "unknown";
    readonly identityLine?: string;
    readonly baseLine?: string;
}
/** The complete result of one command invocation. */
export interface RunReport {
    readonly schemaVersion: 1;
    readonly capability: "real-machine-verification";
    readonly command: string;
    readonly profile: string;
    readonly startedAt: string;
    readonly finishedAt: string;
    readonly state: RunState;
    readonly exitCode: 0 | 1 | 2;
    readonly checks: readonly CheckResult[];
    readonly steps: readonly RunStep[];
    readonly evidence?: {
        readonly manifestPath: string;
        readonly itemCount: number;
    };
    readonly batch?: RunBatchReport;
    readonly model?: RunModelReport;
    /** Free-form pointers a reader can open, e.g. `{ report: "…/report.json" }`. */
    readonly artifacts?: Readonly<Record<string, string>>;
    readonly notes: readonly string[];
}
export interface RunReportInit {
    readonly command: string;
    readonly profile: string;
    readonly startedAt: string;
    readonly notes?: readonly string[];
}
/** A run starts as `running` with no checks; every other field is filled at the end. */
export declare function createRunReport(init: RunReportInit): RunReport;
/** Derive the state from the checks: hard failure wins over blocked. */
export declare function stateFromChecks(checks: readonly CheckResult[]): {
    state: RunState;
    exitCode: 0 | 1 | 2;
};
export interface FinishRunInput {
    readonly checks: readonly CheckResult[];
    readonly steps: readonly RunStep[];
    readonly finishedAt: string;
    readonly evidence?: {
        readonly manifestPath: string;
        readonly itemCount: number;
    };
    readonly batch?: RunBatchReport;
    readonly model?: RunModelReport;
    readonly artifacts?: Readonly<Record<string, string>>;
    readonly notes?: readonly string[];
    /** Set only when the run was cut short (Ctrl-C, prerequisite abort). */
    readonly overrideState?: "aborted";
}
/** Close an open report. The exit code is always derived from `checks`. */
export declare function finishRunReport(report: RunReport, input: FinishRunInput): RunReport;
/** The process exit code for a report. */
export declare function exitCodeOfRun(report: RunReport): 0 | 1 | 2;
/** One-line verdict, safe for stderr. */
export declare function verdictLine(report: RunReport): string;
/** Human-readable report: verdict, counts, then one line per non-passing check. */
export declare function renderRunSummary(report: RunReport): string;
/** JSON form, stable enough for another machine to parse. */
export declare function runReportJson(report: RunReport): string;
