/**
 * The remaining ports: process, HTTP, command, screen, browser, and the aggregate.
 *
 * None of these fakes performs the real side effect. The self-check may only use
 * the screen and command ports, but the aggregate must be complete, so every slot
 * gets a value that fails honestly rather than throwing `undefined is not a function`.
 */
import type { BrowserProbeFactory, CommandOutcome, CommandPort, CommandRequest, HttpPort, HttpRequest, HttpResponse, KillOutcome, Ports, ProcessPort, ScreenInfo, ScreenPort, SpawnedProcess, SpawnRequest } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** Records command requests and returns the scripted result (default: exit 0). */
export declare class FakeCommand implements CommandPort {
    readonly requests: CommandRequest[];
    private readonly handler;
    constructor(handler?: (request: CommandRequest) => Result<CommandOutcome>);
    run(request: CommandRequest): Promise<Result<CommandOutcome>>;
}
export declare class FakeProcess implements ProcessPort {
    private readonly running;
    constructor(running?: boolean);
    spawnDetached(request: SpawnRequest): Promise<Result<SpawnedProcess>>;
    isAlive(): boolean;
    killTree(): Promise<Result<KillOutcome>>;
}
export declare class FakeHttp implements HttpPort {
    readonly requests: HttpRequest[];
    private readonly response;
    constructor(response?: Result<HttpResponse>);
    request(request: HttpRequest): Promise<Result<HttpResponse>>;
}
/** A chosen display list (or a chosen failure); the self-check never needs a real screen. */
export declare class FakeScreen implements ScreenPort {
    private readonly result;
    constructor(result?: Result<readonly ScreenInfo[]>);
    screens(): Promise<Result<readonly ScreenInfo[]>>;
}
/** A browser factory is never needed by the self-check; this one always errors. */
export declare function createFakeBrowser(): BrowserProbeFactory;
export interface FakePortsOptions {
    readonly fs?: Ports["fs"];
    readonly clock?: Ports["clock"];
    readonly env?: Ports["env"];
    readonly command?: Ports["command"];
    readonly process?: Ports["process"];
    readonly http?: Ports["http"];
    readonly screen?: Ports["screen"];
    readonly browser?: BrowserProbeFactory | null;
}
/** Build a complete `Ports` from fakes, overriding only what a test cares about. */
export declare function makePorts(options?: FakePortsOptions): Ports;
