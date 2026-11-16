/**
 * The self-check fixture: one machine, one declaration, four green checks.
 *
 * A test starts from `createFixture()` and breaks exactly one assumption, so the
 * status it asserts is attributable. The asar builder mirrors the byte layout of a
 * real Electron archive (measured on the developer's install), which is what keeps
 * the `dsh-runtime` check's parsing honest rather than mocked away.
 */
import type { Sha256Hex } from "../../contracts/branding";
import type { ScreenInfo } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
import { type CustomCheck, type VerificationProfile, type VerificationProfileInput } from "../../contracts/verification-profile";
import { type DeclarationImport, type DeclarationLoadResult, type VerificationDeclaration } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { FakeClock, FakeEnv, FakeFs, fakePath } from "./fake-fs";
import type { Ports } from "../../contracts/ports";
/**
 * Build bytes with the same layout Electron's asar uses, as measured on the real
 * install: `u32 @0 = 4`, `u32 @4 = headerBytes`, `u32 @8 = payload`, `u32 @12 =
 * jsonLength`, the JSON tree at `@16`, and `dataOffset = 8 + headerBytes`.
 */
export declare function buildFakeAsarBytes(entries?: Readonly<Record<string, string>>): Uint8Array;
/** A `ReadFileSlice` over a fake filesystem, mirroring the real slice reader. */
export declare function createFakeReadFileSlice(fs: FakeFs): NonNullable<RuntimeFacts["readFileSlice"]>;
/** A valid declaration input; override any field the test cares about. */
export declare function buildProfileInput(overrides?: Partial<VerificationProfileInput>): VerificationProfileInput;
export declare function buildProfile(overrides?: Partial<VerificationProfileInput>): VerificationProfile;
export interface DeclarationFixtureOptions {
    readonly path?: string;
    readonly kind?: "ts" | "js";
    readonly exportName?: string;
    readonly requiredNode?: string;
    readonly profile?: VerificationProfile;
}
/** A declaration that loaded successfully, for tests about the checks, not the loader. */
export declare function declarationFixture(options?: DeclarationFixtureOptions): VerificationDeclaration;
/** A `loadDeclaration` replacement that always returns the same result. */
export declare function declarationLoader(result?: DeclarationLoadResult): () => Promise<DeclarationLoadResult>;
/** Import function that hands back the given module regardless of specifier. */
export declare function fakeDeclarationImport(module: unknown): DeclarationImport;
/** A custom-check fixture that returns the observation the test wants. */
export declare function customCheckFixture(run: CustomCheck["run"], overrides?: Partial<CustomCheck>): CustomCheck;
export interface FixtureOptions {
    readonly cwd?: string;
    readonly dshHome?: string;
    readonly nodeVersion?: string;
    readonly localVersion?: string | null;
    readonly localName?: string | null;
    readonly installedVersion?: string;
    readonly declareDependency?: boolean;
    readonly clientEntryPresent?: boolean;
    readonly clientEntryContent?: string;
    readonly profilePresent?: boolean;
    readonly profileManifestValid?: boolean;
    readonly dshPresent?: boolean;
    readonly asarPresent?: boolean;
    readonly profileName?: string;
    readonly profileOverrides?: Partial<VerificationProfileInput>;
    readonly screen?: Result<readonly ScreenInfo[]>;
    readonly envValues?: Readonly<Record<string, string>>;
}
export interface Fixture {
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly ports: Ports;
    readonly readFileSlice: NonNullable<RuntimeFacts["readFileSlice"]>;
    readonly runtime: RuntimeFacts;
    /** Roots the checks read or write; tests compare reports against these. */
    readonly paths: {
        readonly cwd: string;
        readonly dshHome: string;
        readonly profileName: string;
        readonly profileDir: string;
        readonly packageDir: string;
        readonly clientEntryPath: string;
        readonly clientEntryContent: string;
        readonly clientEntrySha256: Sha256Hex;
        readonly exe: string;
        readonly asar: string;
        readonly packageName: string;
        readonly installedVersion: string;
        readonly localVersion: string;
        readonly workRoot: string;
    };
    readonly profile: VerificationProfile;
}
/** Build the all-green machine, with one assumption at a time overridable. */
export declare function createFixture(options?: FixtureOptions): Fixture;
/** The declaration a passing fixture would have loaded. */
export declare function fixtureDeclaration(fixture: Fixture): VerificationDeclaration;
export interface WrittenRun {
    readonly runDir: string;
    readonly content: string;
    readonly sha256: Sha256Hex;
    readonly evidenceFiles: readonly string[];
}
/** Read the single run written under a work root, including its sibling hash file. */
export declare function readRunDirectory(fs: FakeFs, workRoot: string): WrittenRun;
/** Every evidence file under a run as text, so a test can scan for secrets. */
export declare function readEvidenceText(fs: FakeFs, workRoot: string): string;
export { fakePath };
