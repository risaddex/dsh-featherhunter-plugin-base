import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; the CLI wires the real machine. */
export interface LaunchCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** The usage line, repeated in errors so a caller never has to read `describe`. */
export declare const LAUNCH_USAGE = "dsh-verify launch [--profile <p>] [--keep] [--port <n>] [--dry-run] [--json]";
/** Run one `launch` invocation and return its exit code. */
export declare function runLaunchCommand(args: ParsedArgs, deps: LaunchCommandDeps): Promise<number>;
