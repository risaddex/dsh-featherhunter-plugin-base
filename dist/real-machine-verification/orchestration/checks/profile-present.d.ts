/**
 * `profile-present` — the developer's DSH home has the profile to verify.
 *
 * A missing profile is a prerequisite (`blocked`, exit 2), not a product failure:
 * the plugin may be perfect on a machine where the profile was never created.
 * A profile directory that exists but whose manifest is corrupt is a different
 * story — the run can see the file and the file is wrong — so that is a failure.
 *
 * The real DSH home is only read, never written: this check opens a path and
 * reports it, and the evidence contains no file contents beyond the manifest's
 * name and version.
 */
import type { SelfCheckContext } from "../self-check";
import type { CheckModule } from "../types";
export declare function createProfilePresentCheck(): CheckModule<SelfCheckContext>;
