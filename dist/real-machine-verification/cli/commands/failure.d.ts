import { type Failure } from "../../contracts/result";
import type { CliIo } from "../io";
/** The JSON error envelope, exactly one line when printed. */
export declare function failureJson(command: string, stage: string, error: Failure): Record<string, unknown>;
/** Print a fatal command failure and return the blocked exit code. */
export declare function emitFailure(io: CliIo, json: boolean, command: string, stage: string, error: Failure): number;
/** Print a usage error (bad flags or positional arguments) and return 2. */
export declare function emitUsageFailure(io: CliIo, json: boolean, command: string, problems: readonly string[], usage: string): number;
