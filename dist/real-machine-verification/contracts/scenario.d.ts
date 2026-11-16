/**
 * Scenario contract: the escape hatch that keeps the built-in commands from
 * becoming a ceiling.
 *
 * The tool ships a fixed set of L1 commands (self-check, single-instance,
 * concurrent, freeze, batch, run). Those cover the common cases, but a plugin
 * will eventually need a claim nobody anticipated — "the narrow-window layout
 * keeps the dock below 360px", "the first-run dialog closes on the primary
 * screen". Requiring a new base command for each of those is how the old
 * per-repository scripts drifted; requiring a full DSL for them is how the tool
 * becomes a language nobody can debug.
 *
 * A scenario is therefore plain TypeScript that the *plugin repository* writes,
 * importing the primitives from this package. The tool loads it, runs the steps,
 * collects observations and evidence, and reports them exactly like built-in
 * checks. Nothing here knows what the scenario means.
 *
 * Two rules keep scenarios honest:
 *
 * - an observation is falsifiable — it says what it expected and what it saw;
 * - a scenario may not invent evidence: files it wants kept are handed to the
 *   evidence collector, not written wherever it likes.
 *
 * Built-in steps name an L2 primitive in `kind` and pass its arguments in
 * `params`. Only `custom` steps carry a body. A body on a built-in step is a
 * mistake the loader refuses instead of silently ignoring (the old scripts'
 * most expensive failure mode was a hook that never ran).
 */
import type { CheckStatus } from "./check";
import { type Result } from "./result";
/** Where an observation came from; the report keeps the two apart. */
export type ScenarioCheckSource = "builtin" | "custom";
/** What one scenario step observed. */
export interface ScenarioObservation {
    /** Defaults to the step id when omitted. Must match the check-id rule. */
    readonly checkId?: string;
    /** Human title of the claim; defaults to the step title. */
    readonly title?: string;
    readonly ok: boolean;
    /** One sentence: what was observed. */
    readonly detail: string;
    /** What the claim required. */
    readonly expected?: string;
    /** What actually happened. */
    readonly actual?: string;
    /** What to do about a failure. */
    readonly hint?: string;
    /** Paths (inside the batch evidence directory) the runner should keep. */
    readonly evidence?: readonly string[];
    /** Four-state status; `ok` alone cannot express a blocked observation. */
    readonly status?: CheckStatus;
    /** Built-in checks and primitives report `builtin`; scenario bodies `custom`. */
    readonly source?: ScenarioCheckSource;
    /** Whether a failure blocks the run; custom observations default to true. */
    readonly hard?: boolean;
}
/** The L2 primitives a built-in step can invoke. `custom` owns its own body. */
export type ScenarioStepKind = "check" | "launch" | "stop" | "sleep" | "logs" | "model" | "install" | "skills" | "evidence" | "custom";
/** The set a scenario file may use; exported so a loader can explain a typo. */
export declare const SCENARIO_STEP_KINDS: ReadonlySet<ScenarioStepKind>;
/** Arguments of a built-in step; the primitive validates its own shape. */
export type ScenarioStepParams = Readonly<Record<string, unknown>>;
/** One step. Built-in kinds are executed from their parameters; `custom` runs the function. */
export interface ScenarioStep<TContext = unknown> {
    readonly id: string;
    readonly title: string;
    readonly kind: ScenarioStepKind;
    /** Primitive arguments for a built-in step. Forbidden on `custom` steps. */
    readonly params?: ScenarioStepParams;
    /** Only for `custom` steps. Required for `custom`, forbidden otherwise. */
    readonly run?: (context: TContext) => Promise<readonly ScenarioObservation[]> | readonly ScenarioObservation[];
    /** Milliseconds before the step is failed as hung. Defaults to the run timeout. */
    readonly timeoutMs?: number;
    /** Return true to skip this step and record it as skipped. */
    readonly skipWhen?: (context: TContext) => boolean | Promise<boolean>;
}
/** Facts a `beforeLaunch` hook receives; matches the profile hook shape. */
export interface ScenarioLaunchHookInfo {
    readonly home: string;
    readonly dir: string;
    readonly profile: string;
}
/** Facts an `afterLaunch` hook receives; the instance is the L3 handle. */
export interface ScenarioAfterLaunchHookInfo {
    readonly instance: unknown;
}
/**
 * Startup hooks the scenario owns. They run inside the launch primitive so a
 * plugin repository can seed a first-run state without reimplementing launch.
 *
 * Three moments, in execution order:
 *
 * 1. `beforeLaunch` — the plan exists, but nothing has been written: the
 *    isolated home does not exist yet (the launcher copies it from the real
 *    home, and copying refuses to overwrite an existing target). Use it to
 *    prepare paths *outside* the home, such as a workspace directory that will
 *    be registered later.
 * 2. `prepareHome` — the isolated home has just been copied and the instance
 *    directories exist, but the host process has not started. This is the only
 *    safe moment to seed state that the host reads during startup (workspace
 *    registries, settings rows): the host initializes those stores in memory as
 *    it boots and rewrites them from that memory, so a seed written after
 *    startup is overwritten, and a seed written before the home exists is lost
 *    with the copy.
 * 3. `afterLaunch` — the instance is ready and the handle is live; use it only
 *    to observe or to seed state the running host is expected to pick up from
 *    disk on demand.
 */
export interface ScenarioHooks<TContext = unknown> {
    readonly beforeLaunch?: (context: TContext, info: ScenarioLaunchHookInfo) => void | Promise<void>;
    readonly prepareHome?: (context: TContext, info: ScenarioLaunchHookInfo) => void | Promise<void>;
    readonly afterLaunch?: (context: TContext, info: ScenarioAfterLaunchHookInfo) => void | Promise<void>;
}
/** What a plugin repository writes in `verify/scenarios/<id>.ts`. */
export interface ScenarioDefinition<TContext = unknown> {
    readonly id: string;
    readonly title: string;
    readonly description?: string;
    /** Profile to use; defaults to the run's profile so a scenario is portable. */
    readonly profile?: string;
    readonly steps: readonly ScenarioStep<TContext>[];
    readonly hooks?: ScenarioHooks<TContext>;
    readonly notes?: readonly string[];
}
/** Validate a scenario definition. Throws for the common case of a scenario file. */
export declare function defineScenario<TContext>(definition: ScenarioDefinition<TContext>): ScenarioDefinition<TContext>;
/** Non-throwing variant for definitions loaded across a boundary. */
export declare function parseScenario<TContext>(definition: ScenarioDefinition<TContext>): Result<ScenarioDefinition<TContext>>;
/** Per-step outcome in a scenario run. */
export interface ScenarioStepResult {
    readonly stepId: string;
    readonly title: string;
    readonly state: "done" | "failed" | "skipped";
    readonly observations: readonly ScenarioObservation[];
    readonly durationMs: number;
}
/** The result of running one scenario. */
export interface ScenarioResult {
    readonly scenarioId: string;
    readonly title: string;
    readonly ok: boolean;
    readonly steps: readonly ScenarioStepResult[];
}
/** True when every step ran and all its observations were ok. */
export declare function scenarioPassed(steps: readonly ScenarioStepResult[]): boolean;
/** One-line description for `dsh-verify describe` and for the README example. */
export declare function describeScenario(definition: ScenarioDefinition<unknown>): string;
