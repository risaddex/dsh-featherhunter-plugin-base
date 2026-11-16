/**
 * Model configuration observation and repair for one profile's patch layer.
 *
 * The rules live in `contracts/profile-rules` (pure text in, pure text out). This
 * module owns the two things a pure rule cannot: reading the file and deciding
 * whether a change is allowed to touch the disk.
 *
 * Safety properties:
 *
 * - A conforming file is never written, so `--fix` is idempotent and leaves the
 *   bytes (and the mtime) alone.
 * - A missing `agent-default-model` or `llm-pi-ai` entry is a refusal, not an
 *   invitation to invent a plugin entry this package does not own.
 * - After writing, the file is read back and inspected again. The plan's own text
 *   is never trusted as proof; a write that did not stick is reported as a failed
 *   recheck, not a success.
 * - Credential observation reads reference *names* only. The value of an
 *   environment variable is tested for presence and discarded immediately; no
 *   report can carry it.
 */
import type { EnvPort, FsPort } from "../../contracts/ports";
import { type ModelConfigState } from "../../contracts/profile-rules";
import { type Failure, type Result } from "../../contracts/result";
import type { ModelSelection } from "../../contracts/verification-profile";
/** The patch layer every profile keeps next to its package.json. */
export declare const MODEL_PATCH_FILE = "cordis.patch.yml";
/** `<profileDir>/cordis.patch.yml`. */
export declare function modelPatchPath(profileDir: string): string;
/** One read of the patch layer plus what the rules made of it. */
export interface ModelConfigObservation {
    readonly patchPath: string;
    readonly text: string;
    readonly state: ModelConfigState;
}
/**
 * Read the patch layer and inspect it. A missing file is a prerequisite, not an
 * empty configuration: this command never creates the patch file.
 */
export declare function readModelConfig(fs: FsPort, profileDir: string, selection: ModelSelection): Promise<Result<ModelConfigObservation>>;
/** What one `--fix` attempt did. A refusal and a write failure are values, not throws. */
export interface ModelFixOutcome {
    /** The plan found at least one line to change. */
    readonly changed: boolean;
    /** The new text reached the filesystem (the write call succeeded). */
    readonly written: boolean;
    /** Human-readable notes for the report; never secret values. */
    readonly notes: readonly string[];
    /** The state read back from disk after a successful write; null otherwise. */
    readonly after: ModelConfigObservation | null;
    /** Why the attempt stopped, when it did. */
    readonly failure: Failure | null;
}
/**
 * Plan and (only if the plan changes something) write the minimal edit.
 *
 * The write is followed by a read-back, so `after` is always what the disk says,
 * never what the plan hoped it would say.
 */
export declare function fixModelConfig(fs: FsPort, observation: ModelConfigObservation, selection: ModelSelection): Promise<ModelFixOutcome>;
/** Where an available credential reference resolves. Never the value itself. */
export type CredentialPresenceSource = "dsh-home" | "env" | null;
/** Presence of one credential reference; deliberately not the credential. */
export interface CredentialPresence {
    readonly ref: string;
    readonly available: boolean;
    readonly source: CredentialPresenceSource;
    readonly storePath: string;
    readonly storeReadable: boolean;
    readonly storeRefPresent: boolean;
    /** Why the reference is unavailable; never a secret value. */
    readonly note: string | null;
}
/**
 * Check the profile home's credential store first, then the process environment.
 *
 * This command targets a profile in the real DSH home, so there is no batch home
 * to consult. The environment is read only for presence: the value is tested and
 * dropped in the same expression, and nothing in the returned object can carry it.
 */
export declare function observeCredentialPresence(fs: FsPort, env: EnvPort, dshHome: string, ref: string): Promise<CredentialPresence>;
