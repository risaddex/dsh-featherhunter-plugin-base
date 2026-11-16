import type { CheckId } from "../../contracts/branding";
import type { CandidateManifest } from "../../contracts/candidate-rules";
import type { ChecklistFormat } from "../../contracts/checklist-format";
import type { ConsistencyReport } from "../../contracts/checklist-rules";
import { type AuditJudgement, type ReleaseGateBlockedReason, type ChecklistTicketSet, type IdentityScan, type ReleaseGateFinding, type ScannedIdentity } from "../../contracts/release-gate";
import type { ChecklistIssue, TicketComment } from "../../contracts/ticket-face";
import { type CheckOutcome } from "../types";
export declare const RELEASE_GATE_CHECK_IDS: readonly ["release-checklist-unique", "release-checklist-closed", "release-checklist-consistency", "release-batch-identity", "release-ancestor-audit", "release-candidate-valid"];
export type ReleaseGateCheckId = (typeof RELEASE_GATE_CHECK_IDS)[number];
/** One candidate commit the gate asked about, plus the rule's answer. */
export interface GateAudit {
    readonly commit: string;
    readonly findings: readonly ReleaseGateFinding[];
    readonly judgement: AuditJudgement;
}
/** Everything the checks may look at, collected once. */
export interface GateSnapshot {
    readonly set: ChecklistTicketSet;
    readonly issue: ChecklistIssue | null;
    readonly comments: readonly TicketComment[];
    readonly releaseCommit: string;
    readonly scan: IdentityScan;
    readonly latestBatch: string | null;
    readonly latestIdentity: ScannedIdentity | null;
    readonly audits: readonly GateAudit[];
    readonly consistency: ConsistencyReport | null;
}
export interface GateContext {
    readonly version: string;
    readonly format: ChecklistFormat;
    readonly candidate: CandidateManifest | null;
    readonly requireCandidate: boolean;
    readonly snapshot: GateSnapshot | null;
    /** Hint to repeat when the ticket face is unavailable. */
    readonly ticketBlockedHint: string;
    readonly blocked: readonly ReleaseGateBlockedReason[];
}
export interface GateCheckOutcome {
    readonly outcome: CheckOutcome;
    readonly findings: readonly ReleaseGateFinding[];
}
export interface GateCheckDefinition {
    readonly id: CheckId;
    readonly title: string;
    readonly hard: true;
    readonly run: (context: GateContext) => GateCheckOutcome;
}
export declare const RELEASE_GATE_CHECKS: readonly GateCheckDefinition[];
