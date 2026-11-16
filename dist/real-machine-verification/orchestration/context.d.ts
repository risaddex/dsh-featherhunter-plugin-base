/**
 * Resolving the context every L1/L2 command shares: where the work root is, which
 * DSH home is the *real* one, which declaration loaded, and which profile the run
 * targets.
 *
 * Extracted from the self-check command for one reason: two commands disagreeing
 * about the default work root or about `DSH_HOME` would produce artifacts in two
 * places that look like two different machines. The resolution order is the
 * original one, unchanged:
 *
 * - work root: `--work-root` (absolute kept, relative resolved against the cwd),
 *   otherwise `<cwd>/.scratch/verify`;
 * - real home: `DSH_HOME` when set, otherwise the user profile's `.dsh`; this
 *   home is read-only for the tool and the launch command deliberately copies a
 *   profile *out* of it instead of writing back;
 * - profile: the declaration's `defaultProfile` unless `--profile` overrides it.
 *
 * A declaration failure keeps its `blocked`/`failed` classification, because the
 * caller decides whether that is exit 2 (no prerequisite) or a hard failure.
 */
import type { ProfileName } from "../contracts/branding";
import type { Ports } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import { type VerificationProfile } from "../contracts/verification-profile";
import { type DeclarationFailure, type DeclarationLoadResult, type LoadDeclarationOptions, type VerificationDeclaration } from "../declaration/loader";
/** The two locations every command resolves the same way. */
export interface CommandLocations {
    /** Root for instance directories, run reports and evidence. */
    readonly workRoot: string;
    /** The developer's real DSH home. Read-only for this tool. */
    readonly dshHome: string;
}
/** The declaration, the profile it resolved to, and the profile directory. */
export interface DeclarationContext extends CommandLocations {
    readonly cwd: string;
    readonly declaration: VerificationDeclaration;
    readonly profileName: ProfileName;
    readonly profile: VerificationProfile;
    /** `<dshHome>/profiles/<profileName>` — the source the instance copies from. */
    readonly profileDir: string;
}
/** Why the context could not be resolved, tagged by the stage that failed. */
export type DeclarationContextFailure = {
    readonly stage: "declaration";
    readonly failure: DeclarationFailure;
} | {
    readonly stage: "profile";
    readonly failure: Failure;
};
/** `<cwd>/.scratch/verify` unless `--work-root` says otherwise. */
export declare function resolveWorkRoot(cwd: string, raw: string | undefined): string;
/** The DSH home: `DSH_HOME` when set, otherwise the real user home's `.dsh`. */
export declare function resolveDshHome(ports: Ports): string;
/** The directory a profile name points at inside one DSH home. */
export declare function profileDirectory(dshHome: string, profile: ProfileName): string;
export interface LoadDeclarationContextOptions {
    readonly ports: Ports;
    readonly cwd: string;
    readonly nodeVersion: string;
    /** Raw `--work-root`; relative values resolve against `cwd`. */
    readonly workRoot?: string;
    /** Explicit `--declaration` path. */
    readonly declarationPath?: string;
    /** Raw `--profile` override. */
    readonly profileOverride?: string;
    /** Injected for tests; defaults to the real loader. */
    readonly loadDeclaration?: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
}
/**
 * Resolve everything a command needs before it plans.
 *
 * The work root and DSH home are computed first and returned even on failure, so
 * the caller can mention them in its error without repeating the logic. No writes:
 * loading a declaration only imports and validates it.
 */
export declare function loadDeclarationContext(options: LoadDeclarationContextOptions): Promise<Result<DeclarationContext, DeclarationContextFailure>>;
