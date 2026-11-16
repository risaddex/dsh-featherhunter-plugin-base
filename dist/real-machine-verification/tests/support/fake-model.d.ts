/**
 * One fake machine for the `model` command, plus the patch-layer texts the tests
 * mutate one rule at a time.
 *
 * Everything is in-process: a FakeFs holds the profile patch, a FakeEnv holds the
 * credential reference (never a real value), and the declaration loader returns a
 * fixture instead of importing plugin code. The canary string exists so a test can
 * prove the command never echoes a credential value, not to simulate a real one.
 */
import type { Ports } from "../../contracts/ports";
import type { ModelSelection, VerificationProfile } from "../../contracts/verification-profile";
import type { DeclarationLoadResult, VerificationDeclaration } from "../../declaration/loader";
import type { RuntimeFacts } from "../../runtime/types";
import { FakeClock, FakeEnv, FakeFs } from "./fake-fs";
export declare const MODEL_CWD = "C:\\fake\\repo";
export declare const MODEL_USER_PROFILE = "C:\\Users\\fixture";
export declare const MODEL_DSH_HOME = "C:\\fake-dsh-home";
export declare const MODEL_PROFILE = "desktop";
export declare const MODEL_PROFILE_DIR = "C:\\fake-dsh-home\\profiles\\desktop";
export declare const MODEL_PATCH_PATH = "C:\\fake-dsh-home\\profiles\\desktop\\cordis.patch.yml";
export declare const MODEL_PROVIDER = "minimax-cn";
export declare const MODEL_ID = "Minimax-M3.1-Flash";
export declare const MODEL_KEY_ENV = "MINIMAX_CN_API_KEY";
/** A value the command may *use* but must never print. */
export declare const MODEL_SECRET_CANARY = "fixture-model-credential-value-must-not-leak";
export declare const MODEL_SELECTION: ModelSelection;
/** The profile with every rule satisfied; `--fix` must not touch it. */
export declare function conformingPatch(): string;
/** Wrong default model id, wrong credential reference name, wrong reference id. */
export declare function mismatchedPatch(): string;
/** Everything conforms except provider.<p>.apiKeyEnv is absent. */
export declare function missingApiKeyEnvPatch(): string;
/** The patch has no llm-pi-ai entry at all: the one thing --fix must refuse to invent. */
export declare function missingProviderEntryPatch(): string;
/** The patch has no agent-default-model entry: also refused, never created. */
export declare function missingDefaultEntryPatch(): string;
export interface ModelFixtureOptions {
    /** Patch text; `null` leaves the file absent so the read itself is blocked. */
    readonly patch?: string | null;
    readonly profileName?: string;
    /** DSH home to install into; defaults to a fake home far from the real one. */
    readonly dshHome?: string;
    /** USERPROFILE the real-home guard derives the real DSH home from. */
    readonly userProfile?: string;
    readonly model?: ModelSelection | false;
    /** Environment overrides on top of the default credential canary. */
    readonly envValues?: Readonly<Record<string, string>>;
    /** Seed `<dshHome>/.credentials.yaml` with this text. */
    readonly credentials?: string;
    /** Profile manifest override (unused by the command, present for realism). */
    readonly packageJson?: unknown;
}
export interface ModelFixture {
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly ports: Ports;
    readonly runtime: RuntimeFacts;
    readonly profile: VerificationProfile;
    readonly declaration: VerificationDeclaration;
    readonly loadDeclaration: () => Promise<DeclarationLoadResult>;
    readonly paths: {
        readonly cwd: string;
        readonly dshHome: string;
        readonly profileName: string;
        readonly profileDir: string;
        readonly patchPath: string;
    };
}
/** Build one complete fake machine for the `model` command. */
export declare function createModelFixture(options?: ModelFixtureOptions): ModelFixture;
