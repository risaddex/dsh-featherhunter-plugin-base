/**
 * The capability description: one structure that the CLI, the docs and the
 * architecture gate all read.
 *
 * A capability that can be driven by an agent has to be able to describe itself
 * in the same words the agent will be taught. Keeping that description as data —
 * commands, flags, check ids, exit codes — means `describe --json`, the generated
 * help text and `AGENTS-USAGE.md` cannot disagree; a mismatch is a gate failure
 * rather than something a reader has to notice.
 */
import type { CheckId } from "./contracts/branding";
/** Which layer of the three-layer model a command belongs to. */
export type CapabilityLayer = 1 | 2 | 3;
/** Global switches accepted by every command. */
export interface GlobalFlagDescription {
    readonly name: string;
    readonly value?: string;
    readonly summary: string;
}
/** One CLI command. */
export interface CommandDescription {
    readonly name: string;
    readonly layer: CapabilityLayer;
    readonly summary: string;
    readonly usage: string;
    /** What this command may write. "nothing" is a promise the tests can check. */
    readonly writes: string;
    readonly flags: readonly string[];
}
/** The exit-code contract. `stdout` and the code always agree. */
export declare const EXIT_CODES: {
    readonly ok: 0;
    readonly hardFailure: 1;
    readonly blocked: 2;
};
/**
 * One-sentence meaning per exit code.
 *
 * Kept next to `EXIT_CODES` so the help text, `describe` and the generated
 * markdown all say the same thing: there is no second copy of this sentence.
 */
export declare const EXIT_CODE_SUMMARIES: Readonly<Record<keyof typeof EXIT_CODES, string>>;
/** Ids of the checks the built-in orchestration emits. Stable: comments cite them. */
export declare const BUILT_IN_CHECK_IDS: readonly CheckId[];
/** Fields a plugin may set in `verify/profile.ts`. */
export declare const PROFILE_FIELDS: readonly string[];
/** The whole capability, as data. */
export interface CapabilityDescription {
    readonly capability: "real-machine-verification";
    readonly schemaVersion: 1;
    readonly summary: string;
    readonly layers: readonly {
        readonly layer: CapabilityLayer;
        readonly audience: string;
        readonly use: string;
    }[];
    readonly commands: readonly CommandDescription[];
    readonly builtInCheckIds: readonly CheckId[];
    readonly profileFields: readonly string[];
    readonly exitCodes: Readonly<Record<"ok" | "hardFailure" | "blocked", number>>;
    readonly globalFlags: readonly GlobalFlagDescription[];
    readonly docs: {
        readonly readme: string;
        readonly agentUsage: string;
    };
}
/** Build the description value. Pure: same input (none) means same output. */
export declare function describeCapability(): CapabilityDescription;
