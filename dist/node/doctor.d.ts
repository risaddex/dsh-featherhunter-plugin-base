import type { Manifest } from "../core/types";
import type { DoctorResult } from "./types";
/** Per-request timeout of the remote manifest probe. */
export declare const DOCTOR_TIMEOUT_MS = 1500;
/** Copy verification older than this many days is reported as stale. */
export declare const MAX_COPY_AGE_DAYS = 90;
/** Options of one doctor run. */
export interface DoctorOptions {
    /** Parent directories of the plugin repositories; enables the per-repository checks. */
    reposDirs?: readonly string[];
    /** Repository roots to check (`doctor <repo-dir>`), resolved by directory name. */
    repoRoots?: readonly string[];
    /** Skip the network probe (recorded as a passing "skipped" check). */
    offline?: boolean;
    /** fetch implementation override (tests). */
    fetchImpl?: typeof fetch;
    /** Package version override (tests); defaults to the packaged package.json. */
    packageVersion?: string;
    /** Packaged manifest override (tests); defaults to data/manifest.json. */
    manifest?: Manifest;
    /** Clock override for the copy-freshness check. */
    now?: Date;
    /** Remote probe timeout override. */
    timeoutMs?: number;
}
/**
 * Run every health check and return the result.
 *
 * The checks never write: README blocks are verified with `readme:sync --check`,
 * dependencies and inlined bundles are read-only, and the remote probe is a
 * single timed GET.
 */
export declare function runDoctor(options?: DoctorOptions): Promise<DoctorResult>;
/** Render the human-readable doctor report (one line per check). */
export declare function formatDoctorReport(result: DoctorResult): string;
