/**
 * Checklist consistency: does the ticket agree with itself?
 *
 * This is deliberately narrower than "is the release ready". It compares the
 * overview table, the scenario blocks, the comments' results and the counts in
 * the closing comment; it does not invent new release-readiness rules (for
 * example, it does not forbid a 待验证 row on a closed ticket). Keeping the
 * boundary explicit is what lets the same record be audited after the fact.
 */
import { type ChecklistFormat } from "./checklist-format";
import type { ReleaseGateFinding } from "./release-gate";
import type { TicketComment } from "./ticket-face";
export type ChecklistScenarioResult = string;
export interface ScenarioRow {
    readonly id: string;
    readonly status: ChecklistScenarioResult;
    /** 1-based line in the ticket body. */
    readonly line: number;
}
export interface ConsistencyReport {
    readonly ok: boolean;
    readonly findings: readonly ReleaseGateFinding[];
    readonly rows: readonly ScenarioRow[];
    readonly registeredIds: readonly string[];
    readonly publishCounts: {
        readonly passed: number;
        readonly exempted: number;
        readonly failed: number;
    };
}
/** Compare the ticket body with the conclusions recorded in its comments. */
export declare function judgeChecklistConsistency(input: {
    readonly body: string;
    readonly comments: readonly TicketComment[];
    readonly format: ChecklistFormat;
}): ConsistencyReport;
