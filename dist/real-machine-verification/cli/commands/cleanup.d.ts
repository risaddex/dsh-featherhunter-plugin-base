import type { Ports } from "../../contracts/ports";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected. */
export interface CleanupCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
}
export declare const CLEANUP_USAGE = "dsh-verify cleanup [--yes] [--keep-batches <n>] [--keep-homes <n>] [--include-pkg] [--json] [--dry-run]";
/** Run one `cleanup` invocation and return its exit code. */
export declare function runCleanupCommand(args: ParsedArgs, deps: CleanupCommandDeps): Promise<number>;
