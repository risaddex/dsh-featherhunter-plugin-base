/**
 * Doubles for the launch/stop tests: a scripted process port, a scripted HTTP host
 * and one fixture that is a complete machine.
 *
 * The launch path is the one place in this tool where "the fake was wrong" would be
 * expensive: a test that only checks the shape of the plan could pass while the
 * real command spawns the wrong executable or writes the record before readiness.
 * So the fakes record the exact `SpawnRequest` and every HTTP request; the
 * assertions compare them against the plan value item by item.
 */
import type { HttpPort, HttpRequest, HttpResponse, KillOutcome, Ports, ProcessPort, SpawnRequest, SpawnedProcess } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
import { type DeclarationFixtureOptions } from "./fake-machine";
import { FakeClock, FakeEnv, FakeFs } from "./fake-fs";
import type { ModelSelection } from "../../contracts/verification-profile";
import type { VerificationProfile } from "../../contracts/verification-profile";
import type { RuntimeFacts } from "../../runtime/types";
import type { VerificationDeclaration } from "../../declaration/loader";
/** The 43-character access token used by every fixture readiness line. */
export declare const FIXTURE_TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
/** The readiness line a real host prints once the web server is listening. */
export declare function readyLine(port?: number, token?: string): string;
export interface ScriptedProcessOptions {
    readonly pid?: number;
    /** Runs after the spawn is recorded; a test can seed the captured log files here. */
    readonly onSpawn?: (request: SpawnRequest) => void;
    readonly spawnFailure?: Failure;
    /** Override liveness; by default a spawned pid stays alive until killed. */
    readonly alive?: (pid: number) => boolean;
    /** Override the kill outcome; by default the pid is removed and reported killed. */
    readonly kill?: (pid: number) => KillOutcome;
}
/** A `ProcessPort` that records spawns and kills and simulates liveness. */
export declare class ScriptedProcess implements ProcessPort {
    readonly spawns: SpawnRequest[];
    readonly kills: {
        readonly pid: number;
        readonly timeoutMs: number | undefined;
    }[];
    readonly pid: number;
    private readonly started;
    private readonly options;
    constructor(options?: ScriptedProcessOptions);
    spawnDetached(request: SpawnRequest): Promise<Result<SpawnedProcess>>;
    isAlive(pid: number): boolean;
    killTree(pid: number, options?: {
        readonly timeoutMs?: number;
    }): Promise<Result<KillOutcome>>;
}
export type HttpScript = (request: HttpRequest) => Result<HttpResponse> | Promise<Result<HttpResponse>>;
/** A scripted `HttpPort` that records every request it serves. */
export declare class ScriptedHttp implements HttpPort {
    readonly requests: HttpRequest[];
    private readonly script;
    constructor(script: HttpScript);
    request(request: HttpRequest): Promise<Result<HttpResponse>>;
}
/** The `/connect?token=…` response: a redirect plus the auth cookie. */
export declare function connectResponse(options?: {
    readonly status?: number;
    readonly cookie?: string;
    readonly location?: string;
}): HttpResponse;
/** A JSON HTTP response, as `HttpResponse` represents it. */
export declare function jsonResponse(value: unknown, status?: number): HttpResponse;
/** A host RPC envelope for a successful call. */
export declare function rpcEnvelope(value: unknown, rpcId?: string): HttpResponse;
/** A host RPC envelope for a rejected call. */
export declare function rpcFailureEnvelope(message: string, code?: string | null): HttpResponse;
/** One `pluginInventory/list` entry. */
export interface FixtureInventoryEntry {
    readonly entryId: string;
    readonly enabled: boolean;
    readonly fiberPhase: string | null;
    readonly moduleName?: string | null;
}
/** A `pluginInventory/list` value with the given entries. */
export declare function inventoryOf(entries: readonly FixtureInventoryEntry[]): unknown;
/** The healthy inventory: every enabled entry is active, disabled entries are null. */
export declare function allActiveInventory(): unknown;
/**
 * A host HTTP script: `/connect` returns the redirect, every RPC returns the given
 * inventory value. Tests that need a different behaviour build their own script.
 */
export declare function hostHttp(options?: {
    readonly inventory?: unknown;
}): ScriptedHttp;
export declare const LAUNCH_CWD = "C:\\fake\\repo";
export declare const LAUNCH_DSH_HOME = "C:\\fake-dsh-home";
export declare const LAUNCH_PROFILE = "web";
export declare const LAUNCH_WORK_ROOT = "C:\\fake-work";
export declare const LAUNCH_EXE = "C:\\Harness\\DeepSeek Harness.exe";
export declare const LAUNCH_ASAR = "C:\\Harness\\resources\\app.asar";
export interface LaunchFixtureOptions {
    /** `false` (the default) declares no model, exactly like the smoke repo. */
    readonly model?: ModelSelection | false;
    /** Declared plugin cache directory; its copied `logs` are removed by copyProfile. */
    readonly pluginCacheDir?: string;
    readonly instanceEnvAllowlist?: readonly string[];
    readonly envValues?: Readonly<Record<string, string>>;
    /** Seed the real home's `.credentials.yaml` (a canary value the tests must never leak). */
    readonly realCredentials?: string;
    /** Seed the batch home's `.credentials.yaml` after planning; rarely needed. */
    readonly process?: ScriptedProcess;
    readonly http?: HttpPort;
    readonly workRoot?: string;
    /** Extra flat files inside the source profile, to make the copy measurable. */
    readonly profileFiles?: Readonly<Record<string, string>>;
    readonly profilePresent?: boolean;
    readonly declaration?: VerificationDeclaration;
}
export interface LaunchFixture {
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly ports: Ports;
    readonly runtime: RuntimeFacts;
    readonly process: ScriptedProcess;
    readonly http: HttpPort;
    readonly profile: VerificationProfile;
    readonly declaration: VerificationDeclaration;
    readonly paths: {
        readonly cwd: string;
        readonly dshHome: string;
        readonly profileName: string;
        readonly profileDir: string;
        readonly exe: string;
        readonly asar: string;
        readonly workRoot: string;
    };
}
/** Build one complete fake machine: runtime installed, profile present, host healthy. */
export declare function createLaunchFixture(options?: LaunchFixtureOptions): LaunchFixture;
/** A loader that always returns this fixture's declaration. */
export declare function fixtureLoader(fixture: LaunchFixture): () => Promise<{
    readonly ok: true;
    readonly value: VerificationDeclaration;
}>;
/** Unused type reference kept meaningful for `DeclarationFixtureOptions` consumers. */
export type { DeclarationFixtureOptions };
