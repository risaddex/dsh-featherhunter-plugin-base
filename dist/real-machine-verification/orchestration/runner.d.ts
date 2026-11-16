/**
 * Executing a plan: the only place that decides a check's status for the machine.
 *
 * Two behaviours keep a green report honest:
 *
 * 1. **Capability gating.** A check that requires an adapter the machine does not
 *    have never runs; the plan's `onMissing` decides between `blocked` and
 *    `skip`. A checked plan can therefore be reused on a headless CI machine
 *    without every optional check turning red.
 * 2. **Crash containment.** A throwing check (including plugin-supplied custom
 *    checks) becomes a `fail` with the thrown sentence in `actual`, not an
 *    unhandled rejection that kills the run and loses the other observations.
 */
import type { CheckResult } from "../contracts/check";
import type { ClockPort, Ports } from "../contracts/ports";
import type { RunStep } from "../contracts/run-state";
import type { CheckPlan, OptionalCapability } from "./types";
/** Default capability detection: does this port aggregate expose the thing? */
export declare function capabilityAvailable(ports: Ports, capability: OptionalCapability): boolean;
export interface ExecutePlanOptions {
    /** The machine the plan runs against; capability gating reads it. */
    readonly ports: Ports;
    readonly clock: ClockPort;
    readonly note?: (message: string) => void;
    /** Explicit capability overrides; defaults to what the ports expose. */
    readonly capabilities?: Readonly<Partial<Record<OptionalCapability, boolean>>>;
}
export interface ExecutePlanOutcome {
    readonly results: readonly CheckResult[];
    /** Steps belong to L1 commands that act; a read-only self-check has none. */
    readonly steps: readonly RunStep[];
}
/**
 * Run every check in plan order.
 *
 * Sequential on purpose: each check observes the same machine, and a later ticket
 * that needs parallelism can compose plans instead of threading a scheduler
 * through this function.
 */
export declare function executePlan<TContext>(plan: CheckPlan<TContext>, context: TContext, options: ExecutePlanOptions): Promise<ExecutePlanOutcome>;
