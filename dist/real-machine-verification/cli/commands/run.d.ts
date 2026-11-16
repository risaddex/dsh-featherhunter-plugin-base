/**
 * `dsh-verify run <scenario.ts>` — load a plugin repository's scenarios and
 * report them in the same shape as every other run.
 *
 * The command owns only the CLI contract. Loading, the primitive layer, the
 * per-step report conversion and the concurrency pool live in
 * `orchestration/scenario-run.ts`; a scenario file is data, not a second runner.
 *
 * Exit codes: 0 every check passed (skips allowed), 1 a hard check failed,
 * 2 the run could not start or a prerequisite is blocked. `--json` prints one
 * report document on stdout and sends progress, human lines and the verdict to
 * stderr; the report is written before anything is printed.
 */
import type { BrowserProbeFactory, Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import { type BinaryWriter } from "../../runtime/platform/binary-writer";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; tests replace the machine. */
export interface RunCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
    readonly binaryWriter?: BinaryWriter;
    /** Explicit browser adapter; `null` disables browser steps for this run. */
    readonly adapter?: BrowserProbeFactory | null;
    readonly importModule?: (specifier: string) => Promise<unknown>;
    readonly npmCommand?: string;
    readonly headless?: boolean;
}
export declare const RUN_USAGE = "dsh-verify run <scenario.ts> [--concurrency <n>] [--fail-fast|--collect-all] [--json] [--dry-run]";
/** Run one `run` invocation and return its exit code. */
export declare function runScenarioCommand(args: ParsedArgs, deps: RunCommandDeps): Promise<number>;
