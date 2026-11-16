/**
 * Finding the DSH install: the executable, the archive, and the host CLI entry.
 *
 * The verifier must not hard-code one machine's install directory. The reported
 * failure in the field was a DSH installed on a custom drive (`D:\DeepseekHarness`),
 * whose only discoverable handle was the `dsh` wrapper on `PATH`
 * (`...\resources\runtime\cli\bin\dsh.cmd`). That wrapper's location encodes the
 * layout, so discovery treats it as a first-class source:
 *
 * 1. explicit arguments (`--dsh-exe` / `--dsh-cli-js`),
 * 2. `DSH_EXE` / `DSH_CLI_JS`,
 * 3. the `dsh` wrapper on `PATH` (real path, then walk ancestors for the install root),
 * 4. conventional install locations for the platform.
 *
 * The CLI entry is a separate fact from the executable. A desktop install ships an
 * Electron binary plus `resources/app.asar`, a file whose interior paths cannot be
 * tested with plain `fs` calls; `discoverDsh` therefore reports the archive and the
 * posix entry inside it, and the `dsh-runtime` check reads the archive header to
 * prove the entry exists. An install with only one of the two is not usable, and
 * the failure says which half is missing (`details.stage`) so the check can mark
 * it `blocked` (nothing installed) or `fail` (installed but structurally broken).
 */
import type { EnvPort, FsPort } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** Relative location of the host CLI inside a desktop install on disk (unpacked layout). */
export declare const ASAR_CLI_RELATIVE = "resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js";
export type DshDiscoverySource = "argument" | "environment" | "path-wrapper" | "conventional";
export interface DiscoveredDsh {
    /** Absolute path of the desktop executable. */
    readonly exe: string;
    /** Absolute path of `app.asar` when the CLI entry lives inside one, else `null`. */
    readonly asarPath: string | null;
    /** Posix path inside the archive when `asarPath` is set, else an absolute file path. */
    readonly cliJs: string;
    readonly source: DshDiscoverySource;
    /** Install root when it could be derived from the wrapper or the executable. */
    readonly installRoot: string | null;
    /** Every candidate that was tried, so a blocked report shows its work. */
    readonly tried: readonly string[];
}
/**
 * The path to pass to the executable for one discovered install.
 *
 * Discovery reports the CLI entry as a posix path *inside* the archive because
 * that is what archive inspection needs. Spawning needs the two joined back
 * together, with forward slashes inside the archive — the same spelling a desktop
 * install uses in its own argv.
 */
export declare function hostCliPath(discovered: Pick<DiscoveredDsh, "asarPath" | "cliJs">): string;
export interface DiscoverDshOptions {
    readonly fs: FsPort;
    readonly env: EnvPort;
    /** Explicit paths win over everything else. */
    readonly exePath?: string;
    readonly cliJsPath?: string;
    /** Extra install roots to probe before the conventional ones (tests use this). */
    readonly extraInstallDirs?: readonly string[];
}
/** Failure staging: "nothing installed" vs "installed but broken". */
export type DshDiscoveryStage = "exe-missing" | "structure-missing";
/**
 * Resolve the two paths, or explain every source that was tried.
 *
 * Ordering is deliberate: an explicit argument must beat an environment variable
 * (so a script can override a stale shell export), and both must beat conventions
 * (so a portable install does not lose to an installed one).
 */
export declare function discoverDsh(options: DiscoverDshOptions): Promise<Result<DiscoveredDsh>>;
