/**
 * `instances-distinct` — the "N instances could not have interfered" claim.
 *
 * This is the hard check of the `concurrent` command. It compares the four facts
 * that decide whether two instances write to the same place or answer on the same
 * endpoint: the port, `DSH_HOME`, the start directory (which holds the plugin
 * cache and logs) and the plugin log directory. Any collision is a failure that
 * names both instances and the shared value, because "they were not distinct" is
 * not actionable without the field.
 *
 * Two honest exceptions:
 * - an instance that did not reach readiness is already a failure — the check
 *   reports that first instead of comparing fields of a process that never ran;
 * - a profile that does not declare `pluginCacheDir` has no plugin log directory.
 *   That field is reported as not compared rather than counted equal, so a
 *   declaration that cannot express the fact does not produce a false red.
 */
import type { ConcurrentContext } from "../concurrent";
import { type CheckModule } from "../types";
/** Build the check module; the plan decides when it runs. */
export declare function createInstancesDistinctCheck(): CheckModule<ConcurrentContext>;
