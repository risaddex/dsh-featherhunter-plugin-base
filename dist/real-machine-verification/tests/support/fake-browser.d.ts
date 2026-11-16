import type { BrowserPageHandle, BrowserProbeFactory } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
export interface FakePageSize {
    readonly width: number;
    readonly height: number;
}
export interface FakeWindowState {
    readonly state: string;
    readonly width?: number;
    readonly height?: number;
}
export interface FakeBrowserPageOptions {
    /** Current URL; defaults to about:blank, which the check navigates away from. */
    readonly url?: string;
    /** Layout viewport; a Failure makes innerSize() fail. */
    readonly inner?: FakePageSize | Failure;
    /** Real window size; a Failure makes outerSize() fail. */
    readonly outer?: FakePageSize | Failure;
    /** Text per selector; a missing key reads as "no such element" (null). */
    readonly text?: Readonly<Record<string, string | null>>;
    readonly pageErrors?: readonly string[];
    /** Bytes the adapter writes to the screenshot path. */
    readonly screenshotBytes?: Uint8Array;
    /** Default true: expose goto(url). Set false to exercise location polling. */
    readonly supportsGoto?: boolean;
    /** Returned by goto() and by the location fallback. */
    readonly failGoto?: Failure;
    /** Exposed through the optional windowState() probe when present. */
    readonly windowState?: FakeWindowState;
    /** Where the fake writes the screenshot; defaults to the real filesystem. */
    readonly writeScreenshot?: (path: string, bytes: Uint8Array) => Promise<void> | void;
}
export interface FakeBrowserPage extends BrowserPageHandle {
    goto?(url: string): Promise<Result<void>>;
    windowState?(): Promise<Result<FakeWindowState>>;
    readonly visitedUrls: string[];
    readonly screenshotPaths: string[];
}
export interface FakeBrowserOptions extends FakeBrowserPageOptions {
    readonly failLaunch?: Failure;
    readonly failNewPage?: Failure;
}
export interface FakeBrowser extends BrowserProbeFactory {
    readonly launches: readonly {
        readonly headless: boolean;
    }[];
    readonly pages: readonly FakeBrowserPage[];
    readonly sessionsClosed: number;
    readonly closedPages: number;
}
/** The default fake screenshot: the 8-byte PNG signature. */
export declare const FAKE_PNG_BYTES: Uint8Array<ArrayBuffer>;
/**
 * Build the fake factory.
 *
 * `writeScreenshot` is how a test keeps the file inside an in-memory filesystem:
 * pass `(path, bytes) => { fs.seedFile(path, bytes); }`.
 */
export declare function createFakeBrowser(options?: FakeBrowserOptions): FakeBrowser;
