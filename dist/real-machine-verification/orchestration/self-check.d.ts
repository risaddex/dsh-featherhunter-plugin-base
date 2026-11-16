/**
 * The self-check plan: which checks run, in which order, and what they need.
 *
 * Planning is deliberately separate from execution and from reporting. Ticket 11
 * (browser) and ticket 12 (scenarios) extend the *plan* — they add modules to this
 * list or compose a new list — without the runner or the reporter learning about
 * them. That is the whole extension seam: a check is data plus a function.
 *
 * The profile itself is the plan's input: its `checks` array appends custom checks
 * after the built-ins, and a custom check that reuses a built-in id is dropped (the
 * report must have unique ids, and the built-in one is the one readers recognize).
 */
import type { ProfileName } from "../contracts/branding";
import type { Ports } from "../contracts/ports";
import type { VerificationProfile } from "../contracts/verification-profile";
import type { DeclarationKind } from "../declaration/loader";
import type { EvidenceStore } from "../evidence/store";
import type { ReadFileSlice } from "../runtime/types";
import { type CheckPlan } from "./types";
/** The command name this plan reports under. */
export declare const SELF_CHECK_COMMAND = "self-check";
/** The part of a loaded declaration the checks need; kept narrow on purpose. */
export interface SelfCheckDeclaration {
    readonly path: string;
    readonly kind: DeclarationKind;
    readonly exportName: string;
    readonly requiredNode: string;
}
/** Everything a self-check run knows about the machine before it observes it. */
export interface SelfCheckContext {
    readonly profile: VerificationProfile;
    readonly profileName: ProfileName;
    readonly ports: Ports;
    readonly cwd: string;
    /** The DSH home that holds the real profiles (read-only for this command). */
    readonly dshHome: string;
    readonly profileDir: string;
    readonly workRoot: string;
    readonly nodeVersion: string;
    readonly readFileSlice: ReadFileSlice | null;
    readonly declaration: SelfCheckDeclaration;
    readonly screenRequested: boolean;
    readonly evidence: EvidenceStore;
    /** Progress and warnings; the CLI sends these to stderr. */
    readonly note: (message: string) => void;
}
export interface SelfCheckPlanInput {
    readonly profile: VerificationProfile;
    /** Whether the user asked for display checks (`--screen`). */
    readonly screenRequested: boolean;
}
/**
 * Build the self-check plan for one run.
 *
 * The four prerequisite checks come first on purpose: if the declaration is not
 * the one the plugin meant, or Node cannot run it, the later findings are about a
 * different artifact than the reader thinks. The order is also the order a reader
 * sees in the report, which makes a failed run readable top-to-bottom.
 */
export declare function planSelfCheck(input: SelfCheckPlanInput): CheckPlan<SelfCheckContext>;
