import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected. */
export interface BatchCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    /** Only the node version matters here; the loader enforces `requiredNode`. */
    readonly runtime?: {
        readonly nodeVersion: string;
    };
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
export declare const BATCH_USAGE = "dsh-verify batch open|status [--name <n>] [--base-ref <r>] [--candidate <dir>] [--allow-stale] [--json]";
/**
 * Run one `batch` invocation. The caller (main.ts) is responsible for routing
 * only `batch` here; the subcommand is the single positional argument.
 */
export declare function runBatchCommand(args: ParsedArgs, deps: BatchCommandDeps): Promise<number>;
export { loadBatchContextForEvidence } from "../../orchestration/batch";
export type { BatchEvidenceContext } from "../../orchestration/batch";
