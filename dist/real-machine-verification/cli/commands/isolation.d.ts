import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
export declare const ISOLATION_COMMAND = "isolation";
/** The usage line, repeated in errors so a caller never has to read `describe`. */
export declare const ISOLATION_USAGE = "dsh-verify isolation [--profile <p>] [--work-root <dir>] [--json] [--dry-run]";
/**
 * The recovery steps a human follows after the real settings file was damaged.
 *
 * Printed only: `dsh-verify` never edits the real settings file, never takes a
 * lock and never restores a backup. The same lines are copied into the report's
 * notes so the plan survives the terminal scrollback.
 */
export declare const FALLBACK_PLAN: readonly string[];
/** Everything the command needs injected; the CLI wires the real machine. */
export interface IsolationCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/** Run one `isolation` invocation and return its exit code. */
export declare function runIsolationCommand(args: ParsedArgs, deps: IsolationCommandDeps): Promise<number>;
