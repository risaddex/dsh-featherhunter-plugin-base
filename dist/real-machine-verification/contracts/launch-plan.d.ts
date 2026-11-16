/**
 * Launch planning: the pure decision of *what* an isolated instance is.
 *
 * Planning writes nothing and starts nothing. That split is what makes
 * `--dry-run` honest (it prints the plan the real run then executes) and what
 * lets a test assert on the exact argv, environment and log locations without a
 * machine. Everything here is a pure function of its inputs.
 *
 * Three properties are load-bearing:
 *
 * 1. **Isolation is three redirects, not one.** `DSH_HOME` isolates profiles and
 *    storage; `USERPROFILE`/`HOME` isolate the plugin's own settings file; the
 *    working directory isolates its cache and log directory. Miss the second and
 *    an "isolated" run rewrites the developer's real plugin settings.
 * 2. **The environment is an allowlist.** A launched instance receives a small
 *    base set plus declared values plus the resolved model secret — never the
 *    parent environment, which on a developer machine contains unrelated keys
 *    that quietly change results.
 * 3. **The token URL is the readiness signal.** The host prints one line with the
 *    port and a 43-character token; anything else (a listening port, a log line)
 *    is a guess. If the line never appears, the instance never became usable.
 */
import type { ProfileName } from "./branding";
import { type Result } from "./result";
/** Where the DSH executable and its asar CLI entry live. */
export interface DshRuntimePaths {
    readonly exe: string;
    readonly cliJs: string;
}
/** The model this instance should use. `secretValue` never gets serialized. */
export interface LaunchModelPlan {
    readonly provider: string;
    readonly model: string;
    /** Name of the credential reference, e.g. `MINIMAX_CN_API_KEY`. */
    readonly apiKeyEnv: string;
    /** Resolved credential, merged into the child env only. */
    readonly secretValue: string;
    readonly source: "batch-home-store" | "real-home-store" | "process-env";
}
/** An already-parsed instance environment file (see the runtime's allowlist reader). */
export interface InstanceEnvFile {
    readonly path: string;
    readonly values: Readonly<Record<string, string>>;
    readonly names: readonly string[];
    readonly secretNames: readonly string[];
}
export interface LaunchRequest {
    readonly profile: ProfileName;
    /** Isolated DSH home, absolute. */
    readonly home: string;
    /** Redirected `USERPROFILE`/`HOME`, absolute. */
    readonly userprofile: string;
    /** Instance working directory (holds the plugin cache), absolute; also the child process's cwd. */
    readonly startCwd: string;
    /**
     * Where the instance stdout/stderr files are written. Defaults to `startCwd`;
     * the launch orchestrator points it at the instance directory so logs survive
     * next to `instance.json` even when the working directory is cleaned.
     */
    readonly logDir?: string;
    /** Cache directory the plugin writes under `startCwd`; `logs` lives inside it. */
    readonly pluginCacheDir?: string;
    readonly runtime: DshRuntimePaths;
    /** `0` asks the host for an ephemeral port; that is the default. */
    readonly port?: number;
    readonly envFile?: InstanceEnvFile;
    readonly extraEnv?: Readonly<Record<string, string>>;
    /** Profile-declared extra variable names the instance may inherit. */
    readonly instanceEnvAllowlist?: readonly string[];
    readonly model?: LaunchModelPlan | null;
    /** Parent environment to draw allowlisted values from. Defaults to `{}`. */
    readonly baseEnv?: Readonly<Record<string, string>>;
}
export interface LaunchLogFiles {
    /** Instance stdout: the token URL is printed here. */
    readonly stdout: string;
    /** Instance stderr: the first useful sentence after an early exit. */
    readonly stderr: string;
    /** `<startCwd>/<pluginCacheDir>/logs`, or `null` when the plugin declares none. */
    readonly pluginLogDir: string | null;
}
export interface LaunchPlan {
    readonly profile: ProfileName;
    readonly home: string;
    readonly userprofile: string;
    readonly cwd: string;
    readonly port: number;
    readonly argv: readonly string[];
    /** The complete child environment. Serialize only after redacting secrets. */
    readonly env: Readonly<Record<string, string>>;
    /** Every variable the tool put into the child env, sorted. */
    readonly envNames: readonly string[];
    /** Subset of `envNames` whose values are secrets and must never be printed. */
    readonly secretEnvNames: readonly string[];
    readonly logFiles: LaunchLogFiles;
    readonly tokenUrlPattern: RegExp;
    /** Human-readable decisions worth surfacing in a plan or a report. */
    readonly notes: readonly string[];
}
/** The one line the host prints when it is ready. Capture the port and token from it. */
export declare const TOKEN_URL_PATTERN: RegExp;
/** Default port: let the OS choose, so concurrent instances cannot collide. */
export declare const DEFAULT_PORT = 0;
/**
 * Variables a child may inherit from the parent. Everything else is dropped.
 * Kept short on purpose: PATH-like plumbing only, plus locale and temp dirs.
 */
export declare const BASE_ENV_ALLOWLIST: readonly string[];
/** Variables the tool always sets for an instance, regardless of the profile. */
export declare const FIXED_INSTANCE_ENV_NAMES: readonly string[];
/** Absolute on either platform, without importing `node:path` into a pure contract. */
export declare function isAbsolutePath(value: string): boolean;
/**
 * Build the child environment: allowlisted base values, then the fixed isolation
 * variables, then the declared values, then the model secret — later layers win.
 * The last write wins on purpose: an explicit request must beat an inherited value.
 */
export declare function buildLaunchEnv(request: LaunchRequest): Result<Readonly<Record<string, string>>>;
/** Compute the plan. No I/O: an unwritable home is a *preflight* failure, not a plan failure. */
export declare function planLaunch(request: LaunchRequest): Result<LaunchPlan>;
/** Minimal join so this contract stays free of `node:path`. */
export declare function joinPath(...segments: readonly string[]): string;
/** A parsed readiness line. */
export interface ReadyUrl {
    readonly url: string;
    readonly port: number;
    readonly token: string;
}
/** Parse the host's readiness line. Returns `null` when this line is not it. */
export declare function parseReadyUrl(line: string): ReadyUrl | null;
/** The origin of a readiness URL, for later HTTP calls. */
export declare function originOf(ready: ReadyUrl): string;
