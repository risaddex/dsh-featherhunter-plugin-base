import type { Ports } from "../../contracts/ports";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected. */
export interface StopCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
}
/** The usage line, repeated in every no-target error. */
export declare const STOP_USAGE = "dsh-verify stop [--id <id>] [--dir <d>] [--all] [--json] [--dry-run]";
/** Run one `stop` invocation and return its exit code. */
export declare function runStopCommand(args: ParsedArgs, deps: StopCommandDeps): Promise<number>;
