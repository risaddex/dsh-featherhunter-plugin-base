import type { Ports } from "../../contracts/ports";
import { type DeclarationLoadResult, type LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; the CLI wires the real machine. */
export interface SelfCheckCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** Run one `self-check` invocation and return its exit code. */
export declare function runSelfCheckCommand(args: ParsedArgs, deps: SelfCheckCommandDeps): Promise<number>;
