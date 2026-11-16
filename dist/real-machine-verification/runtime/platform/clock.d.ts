/**
 * The clock port: timestamps a report can be compared on, and a sleep a polling
 * loop can use without importing `timers` at the call site.
 */
import type { ClockPort } from "../../contracts/ports";
/**
 * ISO-8601 with the local offset (`2026-11-01T20:37:16.123+08:00`).
 *
 * `toISOString()` would print UTC, which makes a report from a Shanghai machine
 * and a report from a CI runner look like different moments even when they are
 * the same instant. The offset keeps both true: sortable by instant, readable as
 * the wall clock the operator saw.
 */
export declare function formatIsoLocal(ms: number): string;
export declare function createClockPort(): ClockPort;
