import type { CommandPort, PlatformName } from "../../contracts/ports";
export interface CommandPortOptions {
    /** Injected so the Windows branching can be tested on another OS. */
    readonly platform?: PlatformName;
    /** `ComSpec` for `.cmd`/`.bat` wrappers; defaults to the environment's. */
    readonly comspec?: string;
}
export declare function createCommandPort(options?: CommandPortOptions): CommandPort;
