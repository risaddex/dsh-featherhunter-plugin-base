import type { EnvPort, Ports } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** The exact bytes the probe child writes under the redirected home. */
export declare const PROBE_MARKER_CONTENT: string;
/** A hung child must not hang the whole verification run. */
export declare const DEFAULT_PROBE_TIMEOUT_MS = 60000;
/** One concrete reason the probe cannot claim settings isolation. */
export type IsolationProblemCode = "probe-exit" | "probe-output" | "child-home" | "marker-write" | "marker-readback" | "marker-missing" | "marker-hash" | "real-settings-changed" | "real-settings-unreadable";
export interface IsolationProblem {
    readonly code: IsolationProblemCode;
    readonly message: string;
}
/** Existence plus hash; `sha256` is null when the file could not be read. */
export interface SettingsFingerprint {
    readonly path: string;
    readonly existed: boolean;
    readonly sha256: string | null;
    /** Why the hash could not be computed, when `existed` is true and `sha256` is null. */
    readonly readError: string | null;
}
/** The JSON object the probe child prints as the last line of its stdout. */
export interface ChildProbeReport {
    readonly home: string | null;
    readonly markerPath: string | null;
    readonly wrote: boolean;
    readonly readBack: boolean;
    readonly bytes: number | null;
    readonly sha256: string | null;
}
export interface IsolationProbePaths {
    readonly probeRoot: string;
    readonly redirectedHome: string;
    readonly workdir: string;
}
/** The three directories a probe run owns, all under the work root. */
export declare function isolationProbePaths(workRoot: string, probeId: string): IsolationProbePaths;
/**
 * The real settings file of the plugin under verification.
 *
 * It is `<user home>/.dsh/<pluginSettingsDir>/settings.yaml`, deliberately not
 * derived from DSH_HOME: DSH_HOME is configurable and may point somewhere else,
 * while this file is the one a user's real plugin instance reads and writes.
 */
export declare function realSettingsFilePath(realHome: string, pluginSettingsDir: string): string;
export interface IsolationProbeOptions {
    readonly ports: Ports;
    readonly probeRoot: string;
    readonly pluginSettingsDir: string;
    readonly realHome: string;
    readonly redirectedHome: string;
    readonly workdir: string;
    readonly timeoutMs?: number;
}
export interface SettingsIsolationResult {
    readonly ok: boolean;
    readonly probeRoot: string;
    readonly redirectedHome: string;
    readonly workdir: string;
    readonly realSettings: SettingsFingerprint;
    readonly realSettingsAfter: SettingsFingerprint;
    readonly realSettingsUnchanged: boolean;
    readonly expectedMarkerPath: string;
    readonly markerPresent: boolean;
    readonly markerSha256: string | null;
    /** The child's report; `reported:false` means it printed no parsable JSON line. */
    readonly child: ChildProbeReport;
    readonly reported: boolean;
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly problems: readonly IsolationProblem[];
    /** The redirect handed to the child, for evidence and failure messages. */
    readonly redirectEnv: Readonly<Record<"USERPROFILE" | "HOME" | "DSH_HOME", string>>;
    readonly envNames: readonly string[];
    /** argv with the script body replaced, so a report never embeds the whole script. */
    readonly argv: readonly string[];
    /** Tail of the child streams, for evidence. Paths and errors only; never settings content. */
    readonly stdout: string;
    readonly stderr: string;
}
/** Everything a probe would run, described without creating a directory or spawning. */
export interface SettingsIsolationPlan {
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<Record<string, string>>;
    readonly envNames: readonly string[];
    readonly timeoutMs: number;
    readonly markerPath: string;
    readonly realSettingsPath: string;
}
/**
 * Describe the probe command a real run would execute.
 *
 * Read-only: the script body stays in `argv` (the same value a report records),
 * and the environment is computed from the parent snapshot exactly as
 * `probeSettingsIsolation` does, so `--dry-run` prints what the child gets.
 */
export declare function planSettingsIsolation(options: {
    readonly env: EnvPort;
    readonly pluginSettingsDir: string;
    readonly realHome: string;
    readonly redirectedHome: string;
    readonly workdir: string;
    readonly timeoutMs?: number;
}): SettingsIsolationPlan;
/**
 * Run one isolation probe.
 *
 * Order matters: the real settings fingerprint is taken *before* anything is
 * created or started, so a crash mid-probe still leaves an honest "before" to
 * compare against on the next run.
 */
export declare function probeSettingsIsolation(options: IsolationProbeOptions): Promise<Result<SettingsIsolationResult>>;
