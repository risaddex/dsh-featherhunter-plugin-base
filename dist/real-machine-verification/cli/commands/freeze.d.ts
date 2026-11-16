import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected. */
export interface FreezeCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    /** Only the node version matters here; the loader enforces `requiredNode`. */
    readonly runtime?: {
        readonly nodeVersion: string;
    };
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
export declare const FREEZE_USAGE = "dsh-verify freeze [--out <dir>] [--allow-dirty] [--json] [--dry-run]";
/** Run one `freeze` invocation and return its exit code. */
export declare function runFreezeCommand(args: ParsedArgs, deps: FreezeCommandDeps): Promise<number>;
