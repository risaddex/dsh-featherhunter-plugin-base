import type { Ports } from "../../contracts/ports";
import type { VerificationProfile, VerificationProfileInput } from "../../contracts/verification-profile";
import type { DeclarationLoadResult, LoadDeclarationOptions, VerificationDeclaration } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { FakeClock, FakeEnv, FakeFs } from "./fake-fs";
import { FakeCommand } from "./fake-ports";
/** A fake secret that must never appear in a report, evidence file or stream. */
export declare const ISOLATION_CANARY = "sk-canary-do-not-leak-9f2c1b";
export interface FakeIsolationChildOptions {
    readonly fs: FakeFs;
    readonly realHome: string;
    readonly pluginSettingsDir: string;
    /** Counter-example: resolve the real home instead of the redirect passed in the env. */
    readonly ignoreRedirect?: boolean;
    /** The bytes the child writes; defaults to the fixed probe marker. */
    readonly content?: string;
    /** The write itself fails (directory not creatable, disk full, ...). */
    readonly writeFails?: boolean;
    /** The read-back returns different bytes than the write. */
    readonly readBackFails?: boolean;
    readonly exitCode?: number;
    readonly stderr?: string;
    /** Override the reported home without touching where the marker is written. */
    readonly homeOverride?: string;
    /** Override where the marker is written; used to simulate damage to the real file. */
    readonly markerOverride?: string;
}
/**
 * A command handler that behaves like the probe child.
 *
 * It resolves its home from `request.env` exactly as `os.homedir()` would under
 * the redirect, so the runtime's environment building is exercised, not stubbed.
 */
export declare function createFakeIsolationChild(options: FakeIsolationChildOptions): FakeCommand;
export interface IsolationFixtureOptions {
    readonly cwd?: string;
    readonly workRoot?: string;
    readonly realHome?: string;
    readonly dshHome?: string;
    /** `null` simulates a declaration that does not declare the field. */
    readonly pluginSettingsDir?: string | null;
    readonly profileOverrides?: Partial<VerificationProfileInput>;
    readonly realSettingsPresent?: boolean;
    readonly realSettingsContent?: string;
    readonly envValues?: Readonly<Record<string, string>>;
    readonly child?: Omit<FakeIsolationChildOptions, "fs" | "realHome" | "pluginSettingsDir">;
    /** Counter-example: the child writes its marker over the plugin's real settings file. */
    readonly childWritesToRealSettings?: boolean;
    /** Simulate a declaration that fails to load. */
    readonly declarationResult?: DeclarationLoadResult;
}
export interface IsolationFixturePaths {
    readonly cwd: string;
    readonly workRoot: string;
    readonly realHome: string;
    readonly dshHome: string;
    readonly pluginSettingsDir: string | null;
    readonly realSettingsPath: string | null;
    readonly realSettingsContent: string;
}
export interface IsolationFixture {
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly ports: Ports;
    readonly runtime: RuntimeFacts;
    readonly profile: VerificationProfile;
    readonly command: FakeCommand;
    readonly declaration: VerificationDeclaration;
    readonly loadDeclaration: (options: LoadDeclarationOptions) => Promise<DeclarationLoadResult>;
    readonly paths: IsolationFixturePaths;
}
/** Build one isolation machine with a single assumption overridable per test. */
export declare function createIsolationFixture(options?: IsolationFixtureOptions): IsolationFixture;
/** Probe roots created under the work root, one per isolation run. */
export declare function isolationProbeRoots(fs: FakeFs, workRoot: string): readonly string[];
/** The single probe root of a run, or an error when the count is not one. */
export declare function onlyProbeRoot(fs: FakeFs, workRoot: string): string;
/** The redirected home and marker path a probe root implies. */
export declare function probePathsFor(probeRoot: string, pluginSettingsDir: string): {
    readonly redirectedHome: string;
    readonly workdir: string;
    readonly markerPath: string;
};
