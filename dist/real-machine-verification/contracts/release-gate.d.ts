import type { CandidateManifest, CandidateIdentity } from "./candidate-rules";
import type { CheckResult, CheckTally } from "./check";
import type { ChecklistFormat } from "./checklist-format";
import { type IdentityBinding } from "./identity";
import type { Failure } from "./result";
import type { ChecklistIssue, TicketComment } from "./ticket-face";
/** Why the gate could not observe a fact. Never conflated with a failure. */
export type ReleaseGateBlockedCode = "adapter-missing" | "prerequisite-missing" | "gate-error";
export interface ReleaseGateBlockedReason {
    readonly code: ReleaseGateBlockedCode;
    readonly message: string;
    readonly hint: string;
}
/** A gate failure that prevented a report from being produced at all. */
export interface GateFailure extends Failure {
    readonly stage: "input";
}
export type ReleaseGateFindingCode = "checklist-missing" | "checklist-duplicate" | "checklist-not-closed" | "checklist-inconsistent" | "identity-missing" | "identity-conflict" | "identity-not-in-candidate" | "commit-not-ancestor" | "audit-missing" | "candidate-not-release" | "candidate-source-unstable" | "candidate-commit-invalid" | "candidate-digest-invalid" | "candidate-package-sha-invalid" | "candidate-commit-not-ancestor" | "candidate-package-sha-mismatch" | "candidate-not-registered" | "candidate-version-mismatch";
export interface ReleaseGateFinding {
    readonly code: ReleaseGateFindingCode;
    readonly message: string;
    readonly hint: string;
    readonly expected?: string;
    readonly actual?: string;
}
/**
 * `- 候选提交 <40hex> → 发布提交 <40hex>：<reason>`
 *
 * The arrow may be `→` or `->`; the colon may be full- or half-width; leading
 * spaces are allowed because the line lives in a markdown list.
 */
export declare const AUDIT_LINE_RE: RegExp;
export interface AuditLine {
    readonly candidateCommit: string;
    readonly releaseCommit: string;
    readonly reason: string;
}
export declare function parseAuditLine(line: string): AuditLine | null;
export declare function formatAuditLine(line: AuditLine): string;
/** Parse every audit line in a ticket body, ignoring everything else. */
export declare function collectAuditLines(body: string): readonly AuditLine[];
export interface ChecklistTicketSet {
    readonly exact: readonly ChecklistIssue[];
    readonly placeholders: readonly ChecklistIssue[];
    readonly others: readonly ChecklistIssue[];
}
/** Strip a leading `v` and surrounding whitespace, matching the release scripts. */
export declare function normalizeReleaseVersion(version: string): string;
/** Split all checklist-prefixed tickets into exact, placeholder and other. */
export declare function splitChecklistTickets(issues: readonly ChecklistIssue[], version: string, format: ChecklistFormat): ChecklistTicketSet;
/** Presence rules: exactly one ticket for the target version, placeholders ignored. */
export declare function judgeChecklistPresence(set: ChecklistTicketSet, version: string, format: ChecklistFormat): readonly ReleaseGateFinding[];
/** One parsed identity line, with enough position to point a reader at it. */
export interface ScannedIdentity extends IdentityBinding {
    /** 1-based comment index. */
    readonly commentIndex: number;
    /** 1-based line number inside that comment. */
    readonly line: number;
}
export interface IdentityScan {
    readonly identities: readonly ScannedIdentity[];
    /** Human-readable conflicts: same batch name, different commit or package sha. */
    readonly conflicts: readonly string[];
    /** 1-based comment indexes that look like batch records but carry no identity line. */
    readonly missingAt: readonly number[];
}
/**
 * A comment that records a batch must also carry the identity line.
 *
 * The three shapes are the documented template forms; the batch-start marker
 * is protocol text ("批次开始"), not the body section heading, because that is
 * what comments actually contain.
 */
export declare function requiresIdentity(body: string, format: ChecklistFormat): boolean;
/** Read every identity line and report missing/conflicting ones. */
export declare function scanIdentities(comments: readonly TicketComment[], format: ChecklistFormat): IdentityScan;
/**
 * Compare the latest batch identity with the candidate manifest.
 *
 * A missing candidate is not compared here; check 4 still proves that the
 * comment record is complete and internally consistent.
 */
export declare function judgeIdentityBinding(scan: IdentityScan, latestBatch: string | null, candidate: Pick<CandidateIdentity, "commit" | "tgzSha256"> | null): readonly ReleaseGateFinding[];
export interface AuditJudgement {
    /** True when the commits differ and the gate needs an audit line. */
    readonly required: boolean;
    /** True when an ancestor relationship or an exact audit line covers the pair. */
    readonly covered: boolean;
    /** True when the adapter could not answer; the check must be blocked. */
    readonly unknown: boolean;
    readonly audit: AuditLine | null;
}
export interface AuditInput {
    readonly candidateCommit: string;
    readonly releaseCommit: string;
    readonly isAncestor: boolean | "unknown";
    readonly auditLines: readonly AuditLine[];
}
/** Decide one candidate/release pair: ancestor, exact audit line, or neither. */
export declare function judgeAncestorAudit(input: AuditInput): {
    readonly findings: readonly ReleaseGateFinding[];
    readonly judgement: AuditJudgement;
};
/** The candidate rules that do not need the batch directory. */
export declare function judgeCandidateValidity(candidate: CandidateManifest, version: string): readonly ReleaseGateFinding[];
export interface ReleaseGateReport {
    readonly schemaVersion: 1;
    readonly capability: "real-machine-verification";
    readonly command: "release-gate";
    readonly version: string;
    readonly releaseCommit: string;
    readonly decision: "pass" | "fail" | "blocked";
    readonly exitCode: 0 | 1 | 2;
    readonly checks: readonly CheckResult[];
    readonly tally: CheckTally;
    readonly ticket: {
        readonly number: number | null;
        readonly url?: string;
        readonly exactCount: number;
        readonly identities: number;
        readonly latestBatch: string | null;
    };
    readonly candidate: {
        readonly commit: string;
        readonly validity: string;
        readonly fileDigest: string;
    } | null;
    readonly audit: {
        readonly required: boolean;
        readonly covered: boolean;
        readonly line: string | null;
    };
    /** Every finding, flattened for a caller that only wants the red reasons. */
    readonly findings: readonly ReleaseGateFinding[];
    /** The exact ticket-face records the decision relied on. */
    readonly records: {
        readonly auditLine: string | null;
        readonly identities: readonly string[];
    };
    readonly blocked: readonly ReleaseGateBlockedReason[];
    readonly notes: readonly string[];
}
