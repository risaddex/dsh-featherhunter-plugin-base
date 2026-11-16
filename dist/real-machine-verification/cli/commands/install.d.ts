import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import { type BinaryWriter } from "../../runtime/platform/binary-writer";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; tests replace the machine. */
export interface InstallCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
    /** The binary write seam; defaults to the real filesystem writer. */
    readonly binaryWriter?: BinaryWriter;
}
export declare const INSTALL_USAGE = "dsh-verify install --tgz <file> [--method extract|cli] [--profile <p>] [--json] [--dry-run]";
/** Run one `install` invocation and return its exit code. */
export declare function runInstallCommand(args: ParsedArgs, deps: InstallCommandDeps): Promise<number>;
