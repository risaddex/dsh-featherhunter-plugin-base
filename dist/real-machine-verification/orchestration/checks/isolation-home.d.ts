/**
 * `isolation-home` — a real child process resolves its home inside the
 * redirected directory.
 *
 * This is the counter-example guard for the whole isolation claim: an
 * environment variable being set on the parent proves nothing, while a child
 * that reports a home outside the probe root proves the redirect did not reach
 * it. The check is hard because a wrong home is a plugin-settings hazard, not a
 * best-effort observation.
 */
import { type Result } from "../../contracts/result";
import type { EvidenceStore } from "../../evidence/store";
import type { SettingsIsolationResult } from "../../runtime/dsh/isolation";
import type { CheckModule } from "../types";
/** The declaration is missing a field the probe cannot invent. */
export declare const MISSING_SETTINGS_DIR_DETAIL = "the verification declaration does not set profile.pluginSettingsDir, so there is no plugin settings directory to prove isolated";
export declare const MISSING_SETTINGS_DIR_HINT = "add pluginSettingsDir (the single directory name under <userprofile>/.dsh/) to verify/profile.ts and rerun; the probe will not claim isolation without it";
/** Everything the two isolation checks need, assembled once by the command. */
export interface IsolationProbeContext {
    readonly probeRoot: string;
    readonly redirectedHome: string;
    readonly workdir: string;
    readonly pluginSettingsDir: string | null;
    readonly evidence: EvidenceStore;
    readonly note: (message: string) => void;
    /** Memoized by the command: both checks observe the same single child run. */
    readonly probe: () => Promise<Result<SettingsIsolationResult>>;
}
export declare function createIsolationHomeCheck(): CheckModule<IsolationProbeContext>;
