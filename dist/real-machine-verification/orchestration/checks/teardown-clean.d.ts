/**
 * `teardown-clean` — "every instance this run launched is gone".
 *
 * The claim is deliberately narrower than "no process is left on the machine": it
 * covers the instances this run started and nothing else. A launch that failed is
 * not this check's concern because `executeInstance` reaps its own process before
 * returning; pretending otherwise would hide a real orphan behind an expected
 * failure.
 *
 * Coverage is the point: the table has one row per instance that reached
 * readiness, and the check fails if *any* row could not be verified dead, naming
 * the pid and the instance. A survivor is expensive — it holds the port and the
 * next run inherits the conflict.
 */
import type { ConcurrentContext } from "../concurrent";
import { type CheckModule } from "../types";
/** Build the check module; the plan decides when it runs. */
export declare function createTeardownCleanCheck(): CheckModule<ConcurrentContext>;
