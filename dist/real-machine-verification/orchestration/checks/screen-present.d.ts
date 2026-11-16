/**
 * `screen-present` — a display exists, when the run asks for one.
 *
 * Only planned when `--screen` is given, so a headless CI self-check never sees
 * this check at all. When it is planned, a probe failure is `blocked`: screen
 * probing is best-effort by design (Windows goes through PowerShell, other
 * platforms through system_profiler/xrandr) and "could not enumerate displays"
 * says nothing about the plugin.
 */
import type { SelfCheckContext } from "../self-check";
import type { CheckModule } from "../types";
export declare function createScreenPresentCheck(): CheckModule<SelfCheckContext>;
