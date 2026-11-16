import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; the CLI wires the real machine. */
export interface SingleInstanceCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** The command name, used in reports, JSON documents and error prefixes. */
export declare const SINGLE_INSTANCE_COMMAND = "single-instance";
/** The usage line, repeated in flag errors so a caller never has to read `describe`. */
export declare const SINGLE_INSTANCE_USAGE = "dsh-verify single-instance [--profile <p>] [--declaration <file>] [--work-root <dir>] [--keep] [--dry-run] [--json]";
/**
 * Run one `single-instance` invocation and return its exit code.
 *
 * Everything below the CLI contract already exists; the flow here is the order in
 * which those pieces are called and the mapping from their Results to the
 * pass/fail/skip/blocked vocabulary.
 */
export declare function runSingleInstanceCommand(args: ParsedArgs, deps: SingleInstanceCommandDeps): Promise<number>;
