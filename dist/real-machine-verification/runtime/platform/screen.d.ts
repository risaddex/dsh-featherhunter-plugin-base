/**
 * The screen port: physical display sizes, best effort per platform.
 *
 * The check that consumes this asks a narrow question ("does this machine have a
 * screen at all?"), so the port reports the answer and never throws. A headless
 * machine, a missing `xrandr`, or a PowerShell that refuses to load WinForms all
 * become `Result` failures, which the check turns into `blocked` — not a false
 * `fail` about the product.
 */
import type { CommandPort, EnvPort, ScreenPort } from "../../contracts/ports";
export interface ScreenPortOptions {
    readonly command: CommandPort;
    readonly env: EnvPort;
}
export declare function createScreenPort(options: ScreenPortOptions): ScreenPort;
