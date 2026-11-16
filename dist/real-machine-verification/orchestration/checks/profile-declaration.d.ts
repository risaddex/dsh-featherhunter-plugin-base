/**
 * `profile-declaration` — the declaration exists, loaded, and validated.
 *
 * The heavy lifting (discovery, import, normalization) happens before planning,
 * because the profile is the input to the plan. This check records the fact in
 * the report and evidence, so a green self-check states *which* declaration it
 * trusted instead of leaving the reader to infer it.
 */
import type { SelfCheckContext } from "../self-check";
import type { CheckModule } from "../types";
export declare function createProfileDeclarationCheck(): CheckModule<SelfCheckContext>;
