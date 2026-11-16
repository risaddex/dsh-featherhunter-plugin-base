/**
 * Reading a plugin's own log.
 *
 * The plugin writes one JSON object per line into
 * `<instance cwd>/<plugin cache dir>/logs/<YYYY-MM-DD>.log`. That file is the only
 * place the host does not mediate, which makes it the strongest available signal
 * that *the plugin itself ran* — a page can render a shell with no plugin behind
 * it, and a registry can list a provider that never executed a command.
 *
 * Bad lines are counted, not fatal: a log being written while it is read is an
 * ordinary race, and treating it as a failure would produce a flaky gate. Callers
 * set their own threshold (the built-in check fails on zero events, not on one
 * torn line).
 */
import type { ClockPort, FsPort } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** One parsed line of the plugin log. */
export interface PluginLogEvent {
    /** 1-based line number, so a report can point at the file. */
    readonly line: number;
    readonly raw: string;
    /** Parsed JSON when the line is an object; `null` for a torn or non-JSON line. */
    readonly json: Record<string, unknown> | null;
    readonly event: string | null;
    readonly level: string | null;
    readonly ts: string | null;
}
export interface PluginLogRead {
    readonly file: string;
    readonly events: readonly PluginLogEvent[];
    readonly badLines: number;
    readonly bytes: number;
}
export interface LogQuery {
    /** Exact event name(s). */
    readonly event?: string | readonly string[];
    /** Exact level. */
    readonly level?: string;
    /** Fields must match; looked up in `json.fields` first, then at the top level. */
    readonly fields?: Readonly<Record<string, string | number | boolean>>;
    /** Only events whose timestamp is at or after this epoch millisecond value. */
    readonly sinceMs?: number;
}
export interface PluginLogSummary {
    readonly total: number;
    readonly badLines: number;
    readonly firstTs: string | null;
    readonly lastTs: string | null;
    readonly byEvent: Readonly<Record<string, number>>;
    readonly byLevel: Readonly<Record<string, number>>;
}
/** `<startCwd>/<pluginCacheDir>/logs` — where the plugin writes. */
export declare function pluginLogDirectory(startCwd: string, pluginCacheDir: string): string;
/** Date part of the clock's local ISO string, e.g. `2026-11-01`. */
export declare function localDate(clock: ClockPort): string;
/**
 * Newest log file in a log directory, or the one for `date` when given.
 *
 * Returning the newest file is right for "did anything happen in this run",
 * because a run that crosses midnight writes two files and the newest one is the
 * one still being appended to.
 */
export declare function findLatestPluginLog(fs: FsPort, logDir: string, options?: {
    readonly date?: string;
}): Promise<Result<string>>;
/** Parse a log file. Torn and non-JSON lines are counted, never thrown. */
export declare function readPluginLog(fs: FsPort, file: string): Promise<Result<PluginLogRead>>;
/** Filter events. String fields match by containment, everything else by equality. */
export declare function queryLogEvents(events: readonly PluginLogEvent[], query: LogQuery): readonly PluginLogEvent[];
export declare function summarizeLogEvents(events: readonly PluginLogEvent[], badLines?: number): PluginLogSummary;
export interface WaitForLogEventOptions {
    readonly fs: FsPort;
    readonly clock: ClockPort;
    readonly file: string;
    readonly query: LogQuery;
    readonly timeoutMs?: number;
    readonly pollMs?: number;
}
/**
 * Poll until a matching event appears.
 *
 * Used right after a UI action: the page can acknowledge a click before the plugin
 * has processed it, and the log line is the plugin's own claim that it did.
 */
export declare function waitForLogEvent(options: WaitForLogEventOptions): Promise<Result<readonly PluginLogEvent[]>>;
