/**
 * The verification profile: the *only* place a plugin repository states its differences.
 *
 * Everything the capability must know about one plugin lives here — its package
 * name, the profile to verify by default, how to build it, which skills it
 * registers, which model it expects. Keeping it in one declarative object is what
 * removes constants like `"web"` or `"D:/.../DeepSeek Harness.exe"` from tool code,
 * which is exactly how the previous per-repository scripts drifted apart.
 *
 * `defineVerificationProfile` validates at the boundary and returns a frozen,
 * normalized value: a typo in a profile fails at startup with a sentence, not a
 * mysterious empty report an hour later.
 */
import type { CheckId, ProfileName } from "./branding";
import type { BlockedReason } from "./evidence-contract";
import { type Result } from "./result";
import type { TicketFaceDeclaration } from "./ticket-face";
/** One model the run should use. `apiKeyEnv` names a credential, never holds one. */
export interface ModelSelection {
    readonly provider: string;
    readonly model: string;
    /** Name of the credential reference, e.g. `MINIMAX_CN_API_KEY`. Never the value. */
    readonly apiKeyEnv: string;
    readonly contextWindow?: number;
    readonly maxTokens?: number;
    readonly input?: readonly ("text" | "image")[];
}
/**
 * The browser adapter a plugin repository injects for page-level checks.
 *
 * The core package owns no browser library; the plugin repository owns the
 * driver. `module` is either a path relative to the repository root (for
 * example `verify/browser.mjs`) or an installed package name. `exportName`
 * selects a named export; omitted means the module's default export.
 */
export interface BrowserAdapterDeclaration {
    readonly module: string;
    readonly exportName?: string;
}
/** A bundled-skill directory the package ships, and how many skills it must expose. */
export interface BundledSkillsDeclaration {
    /** Directory inside the plugin package, `/`-separated, e.g. `bundled-skills`. */
    readonly dir: string;
    /** Exact number of skills the set must contain (the set is compared by name). */
    readonly expected: number;
}
/** The four states a custom check may report. */
export type CheckObservationStatus = "pass" | "fail" | "skip" | "blocked";
/**
 * The observation a custom check returns.
 *
 * A custom check has exactly the same reporting surface as a built-in one: it may
 * pass, fail, skip (the claim does not apply) or block (it could not observe the
 * product). A blocked observation is not a failure — the report says the run
 * proved nothing — so it must name a structured `blockedReason`.
 */
export interface CheckObservation {
    /** Legacy shorthand: `true` means pass and `false` means fail. Ignored when `status` is set. */
    readonly ok?: boolean;
    /** Explicit state. Takes precedence over `ok`. */
    readonly status?: CheckObservationStatus;
    readonly detail: string;
    readonly expected?: string;
    readonly actual?: string;
    readonly hint?: string;
    /**
     * Why the check could not observe the product. Required by convention when
     * `status` is `blocked`; the runner fills a `prerequisite-missing` fallback
     * rather than inventing a reason. `"platform-unsupported"` is preferred when
     * the host lacks the facility entirely (no display, no browser engine).
     */
    readonly blockedReason?: BlockedReason;
}
/**
 * A plugin-specific check. Kept deliberately small: a title, a hard flag, and a
 * function that observes. The runner owns statuses, timing and evidence.
 */
export interface CustomCheck<TContext = unknown> {
    readonly id: CheckId;
    readonly title: string;
    /** Defaults to `true`; a soft check reports but never exits non-zero. */
    readonly hard?: boolean;
    readonly run: (context: TContext) => Promise<CheckObservation | boolean> | CheckObservation | boolean;
}
/** Hooks let a plugin run code at the three moments that are genuinely plugin-shaped. */
export interface VerificationHooks {
    beforeLaunch?(context: {
        readonly home: string;
        readonly dir: string;
        readonly profile: ProfileName;
    }): Promise<void> | void;
    afterLaunch?(context: {
        readonly instance: unknown;
    }): Promise<void> | void;
    beforeStop?(context: {
        readonly instance: unknown;
    }): Promise<void> | void;
}
/** What a plugin repository writes in `verify/profile.ts`. */
export interface VerificationProfileInput {
    /** Stable id for this profile; lowercase kebab-case (used in file names and reports). */
    readonly id: string;
    /** npm package name that must be installed into the verified profile. */
    readonly packageName: string;
    /** The DSH profile to verify unless a command overrides it. Required: no hidden default. */
    readonly defaultProfile: string;
    /** Module inside the installed package that proves which build is present. */
    readonly clientEntry?: string;
    /** Directory the plugin writes its cache/logs into, relative to the instance cwd. */
    readonly pluginCacheDir?: string;
    /**
     * Directory name the plugin uses for its own settings under the redirected
     * `USERPROFILE`/`HOME` (e.g. `<userprofile>/.dsh/<pluginSettingsDir>/settings.yaml`).
     * Declaring it lets the tool prove the instance cannot rewrite the developer's
     * real settings; leaving it out means that probe reports `blocked`, never `pass`.
     */
    readonly pluginSettingsDir?: string;
    /** Bundled skills this package registers; `false` means "this plugin registers none". */
    readonly bundledSkills?: BundledSkillsDeclaration | false;
    /** Model the run should configure; `false` means "do not touch model configuration". */
    readonly model?: ModelSelection | false;
    /**
     * Browser adapter used by page-level checks; `false` (or omitted) means "no
     * adapter", and page checks report `blocked` rather than `fail`.
     */
    readonly browser?: BrowserAdapterDeclaration | false;
    /**
     * Ticket-face adapter used by release checks; `false` (or omitted) means "no
     * adapter", and release checks report `blocked` rather than `fail`.
     */
    readonly ticketFace?: TicketFaceDeclaration | false;
    /** Workspace backends the plugin understands, in preference order. */
    readonly workspaceBackends?: readonly string[];
    /** How to build the package under verification. */
    readonly build?: {
        readonly command: string;
        readonly timeoutMs?: number;
    };
    /** Environment variables the instance may receive beyond the safe default allowlist. */
    readonly instanceEnvAllowlist?: readonly string[];
    readonly hooks?: VerificationHooks;
    readonly checks?: readonly CustomCheck[];
}
/** The normalized, frozen profile used everywhere after validation. */
export interface VerificationProfile {
    readonly id: string;
    readonly packageName: string;
    readonly defaultProfile: ProfileName;
    readonly clientEntry: string;
    readonly pluginCacheDir?: string;
    readonly pluginSettingsDir?: string;
    readonly bundledSkills: BundledSkillsDeclaration | false;
    readonly model: ModelSelection | false;
    readonly browser: BrowserAdapterDeclaration | false;
    readonly ticketFace: TicketFaceDeclaration | false;
    readonly workspaceBackends: readonly string[];
    readonly build?: {
        readonly command: string;
        readonly timeoutMs: number;
    };
    readonly instanceEnvAllowlist: readonly string[];
    readonly hooks?: VerificationHooks;
    readonly checks: readonly CustomCheck[];
}
/** Validate the parts that need it, then freeze. Throws only for adversarial use. */
export declare function defineVerificationProfile(input: VerificationProfileInput): VerificationProfile;
/** Non-throwing variant: use when the profile comes from disk or another process. */
export declare function parseVerificationProfile(input: VerificationProfileInput): Result<VerificationProfile>;
/** Resolve the profile a command should run against. */
export declare function resolveProfile(profile: VerificationProfile, override: string | undefined): Result<ProfileName>;
/** True when the model section was declared (i.e. the run should configure it). */
export declare function hasModel(profile: VerificationProfile): boolean;
/** True when the repository declares a browser adapter for page-level checks. */
export declare function hasBrowserAdapter(profile: VerificationProfile): boolean;
/** True when the repository declares a ticket-face adapter for release checks. */
export declare function hasTicketFaceAdapter(profile: VerificationProfile): boolean;
/** True when the plugin ships bundled skills the run must find registered. */
export declare function hasBundledSkills(profile: VerificationProfile): boolean;
