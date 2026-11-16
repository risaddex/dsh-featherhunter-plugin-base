import type { Ports } from "../../contracts/ports";
import type { DeclarationLoadResult, LoadDeclarationOptions } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { type ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** Everything the command needs injected; tests replace the machine. */
export interface SkillsCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly runtime: RuntimeFacts;
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
export declare const SKILLS_USAGE = "dsh-verify skills [--profile <p>] [--json]";
/** Run one `skills` invocation and return its exit code. */
export declare function runSkillsCommand(args: ParsedArgs, deps: SkillsCommandDeps): Promise<number>;
