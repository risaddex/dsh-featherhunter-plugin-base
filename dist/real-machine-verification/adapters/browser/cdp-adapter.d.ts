import type { BrowserPageHandle, BrowserProbeFactory } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
/** Handlers a transport delivers; the connection is useless without both. */
export interface CdpHandlers {
    readonly onMessage: (data: string) => void;
    readonly onClose: (reason?: string) => void;
}
/** The minimal socket the client needs; `WebSocketCdpTransport` is the default. */
export interface CdpConnection {
    send(data: string): void;
    close(): void;
}
/** Injectable in tests; the default connects a Node global WebSocket. */
export interface CdpTransport {
    connect(endpoint: string, handlers: CdpHandlers): Promise<CdpConnection>;
}
/** What a launcher must produce: an endpoint plus a way to stop the process. */
export interface CdpLaunchedBrowser {
    readonly endpoint: string;
    close(): Promise<void>;
}
export interface CdpLaunchRequest {
    readonly executablePath: string;
    readonly headless: boolean;
    readonly timeoutMs: number;
    readonly userDataDir: string;
}
/** Injectable in tests; the default spawns a real Chromium/Edge. */
export type CdpLauncher = (request: CdpLaunchRequest) => Promise<CdpLaunchedBrowser>;
/** How the adapter asks the browser to present the window. */
export type CdpWindowState = "normal" | "maximized" | "fullscreen";
export interface CdpAdapterOptions {
    /** Explicit browser binary; otherwise env and platform defaults are tried. */
    readonly executablePath?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
    /** Applied to every new page through `Browser.setWindowBounds`. */
    readonly windowState?: CdpWindowState;
    /** Launch/connect timeout; default 15000 ms. */
    readonly timeoutMs?: number;
    readonly launcher?: CdpLauncher;
    readonly transport?: CdpTransport;
    /** Only for tests; a real launch always uses a fresh directory. */
    readonly userDataDir?: string;
}
/** A page handle, plus the L3 extensions this adapter can honestly offer. */
export interface CdpPageHandle extends BrowserPageHandle {
    goto(url: string): Promise<Result<void>>;
    windowState(): Promise<Result<{
        readonly state?: string;
        readonly width?: number;
        readonly height?: number;
    }>>;
    setWindowState(state: CdpWindowState): Promise<Result<void>>;
}
/**
 * Find a Chromium-family binary without guessing past a candidate that exists.
 *
 * `DSH_BROWSER_PATH` is the documented override; `CHROME_PATH` and
 * `EDGE_PATH` are convenience aliases.
 */
export declare function resolveBrowserExecutable(options?: {
    readonly executablePath?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
    readonly platform?: NodeJS.Platform;
    readonly exists?: (path: string) => boolean;
}): string | null;
/**
 * Build the factory the profile declares.
 *
 * `windowState: "fullscreen"` is applied per page through
 * `Browser.getWindowForTarget` + `Browser.setWindowBounds`, before the page
 * check measures anything. The browser is launched once per `launch()` call and
 * stopped by `session.close()`.
 */
export declare function createCdpBrowserFactory(options?: CdpAdapterOptions): BrowserProbeFactory;
