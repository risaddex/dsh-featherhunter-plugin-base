import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; the CLI wires the real machine. */
export interface ModelCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** The usage line, repeated in errors so a caller never has to read `describe`. */
export declare const MODEL_USAGE = "dsh-verify model [--profile <p>] [--provider <p>] [--model <m>] [--api-key-env <ENV>] [--fix] [--json] [--dry-run]";
/** Run one `model` invocation and return its exit code. */
export declare function runModelCommand(args: ParsedArgs, deps: ModelCommandDeps): Promise<number>;
