/**
 * Run the release gate: collect ticket-face records once, execute six hard
 * checks, then assemble a report.
 *
 * The gate is a library call, not a command. A caller (a release script, a CI
 * step, a test) supplies ports, the frozen candidate and the release identity;
 * this module owns collection and error classification. Two rules shape the
 * error handling:
 *
 * - a missing or throwing adapter never passes silently: all ticket-dependent
 *   checks report blocked (exit 2), and the report carries a three-step hint;
 * - an input that cannot describe a release (bad commit, malformed audit line,
 *   incomplete candidate) returns GateFailure instead of a green-looking report.
 */
import { type TicketFaceImport } from "../../adapters/ticket-face/loader";
import type { CandidateManifest } from "../../contracts/candidate-rules";
import { type ChecklistFormat } from "../../contracts/checklist-format";
import type { Ports } from "../../contracts/ports";
import { type GateFailure, type ReleaseGateReport } from "../../contracts/release-gate";
import { type Result } from "../../contracts/result";
import { type TicketFaceAdapter, type TicketFaceDeclaration } from "../../contracts/ticket-face";
import type { VerificationProfile } from "../../contracts/verification-profile";
export { RELEASE_GATE_CHECK_IDS, type ReleaseGateCheckId } from "./plan";
export interface ReleaseGateOptions {
    /** Filesystem and other effects; only fs is used (adapter loading). */
    readonly ports: Ports;
    /** Frozen candidate (contracts/candidate-rules.ts). Null means "none supplied". */
    readonly candidate: CandidateManifest | null;
    /** Release commit the candidate must be an ancestor of. */
    readonly releaseCommit: string;
    /** Release version, with or without a leading v. */
    readonly releaseVersion: string;
    /** Pin the checklist ticket by number; otherwise exactly one title match is used. */
    readonly checklistTicket?: number;
    /** The ticket the release exists for; recorded in notes, never guessed. */
    readonly primaryTicket?: number;
    /** One or more audit lines; the ticket body and comments are scanned too. */
    readonly auditLines?: readonly string[] | string;
    /** Plugin repository root used to resolve a relative adapter module. */
    readonly workRoot?: string;
    /** Checklist vocabulary override (defaults are the shipped template). */
    readonly format?: ChecklistFormat;
    /** Profile whose ticketFace declaration should be loaded. */
    readonly profile?: VerificationProfile;
    /** Direct adapter object, declaration to load, or false to disable. */
    readonly ticketFace?: TicketFaceAdapter | TicketFaceDeclaration | false;
    /** When true a missing candidate is a fail; otherwise the candidate check is skipped. */
    readonly requireCandidate?: boolean;
    /** Test seam for the dynamic import. */
    readonly importModule?: TicketFaceImport;
}
/**
 * Plan, collect, run, report. The single public entry point of the capability.
 */
export declare function runReleaseGate(options: ReleaseGateOptions): Promise<Result<ReleaseGateReport, GateFailure>>;
