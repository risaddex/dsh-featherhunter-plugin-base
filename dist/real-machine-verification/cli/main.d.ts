import { type CapabilityDescription } from "../capability-description";
import type { Ports } from "../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../declaration/loader";
import type { RuntimeFacts } from "../runtime/types";
import { type CliIo } from "./io";
/**
 * Commands that already have an implementation. A command listed in the
 * capability description but missing here exits `2` with a sentence instead of
 * pretending to succeed — the description is the contract, this set is the truth.
 */
export declare const IMPLEMENTED: ReadonlySet<string>;
/** Injection points for tests and for agents driving the CLI in-process. */
export interface CliDeps {
    /** The machine; defaults to the real Node ports (only built for self-check). */
    readonly ports?: Ports;
    /** Output streams; defaults to the process streams, resolved at call time. */
    readonly io?: CliIo;
    /** Runtime facts; `readFileSlice: null` disables archive inspection on purpose. */
    readonly runtime?: Partial<RuntimeFacts>;
    /** Declaration loader; tests replace it so no real file has to be imported. */
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** Help is generated from the description, so the two cannot drift apart. */
export declare function renderHelp(description?: CapabilityDescription): string;
/** Human-readable `describe` output. */
export declare function renderDescription(description?: CapabilityDescription): string;
/** Run one CLI invocation and return its exit code. */
export declare function main(argv?: readonly string[], deps?: CliDeps): Promise<number>;
