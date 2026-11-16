/**
 * `instance-pages` — the instance's page renders, and its window is really the
 * size it claims to be.
 *
 * Page-level verification is plugin-shaped: the plugin repository owns a browser
 * driver, and the core owns no browser library at all. This check therefore
 * consumes an injected adapter (or loads the one declared in
 * `profile.browser`) and reports honestly when none is available:
 *
 * - **no adapter / adapter failed to load → `blocked`**, with a hint that shows
 *   how to inject one. A missing browser proves nothing about the product.
 * - **the page did not open, threw, or has the wrong window size → `fail`**,
 *   with `expected` and `actual` carrying the measurement, so the reader can
 *   re-derive the comparison.
 *
 * Fullscreen is only ever judged from the adapter's real window state
 * (`outerSize()` compared with the display, plus the adapter's window-state
 * probe when it exposes one). The viewport is never resized to imitate a
 * fullscreen window: the historical failure this rule prevents is a product
 * being declared broken because a test changed the page instead of the window.
 *
 * The screenshot is written through the adapter (it owns the browser) but
 * adopted through the evidence store, which measures and hashes the bytes that
 * actually reached disk rather than trusting the adapter's claim. Adopting it
 * (instead of building an item here) is what puts the digest into
 * `evidence.json`, so an archived run can be re-checked later.
 */
import type { EvidenceItem } from "../contracts/evidence-contract";
import type { BrowserProbeFactory, Ports, ScreenInfo } from "../contracts/ports";
import { type Failure } from "../contracts/result";
import type { VerificationProfile } from "../contracts/verification-profile";
import type { EvidenceStore } from "../evidence/store";
import { type BrowserAdapterLoadResult, type LoadBrowserAdapterOptions } from "../adapters/browser/loader";
import { type CheckModule, type CheckOutcome } from "./types";
/** The built-in check id; stable because reports and comments cite it. */
export declare const PAGE_CHECK_ID = "instance-pages";
/** The claim this check makes. */
export declare const PAGE_CHECK_TITLE = "the instance page renders and its window matches the display";
export interface PageSize {
    readonly width: number;
    readonly height: number;
}
/** Where the check points the browser. */
export interface PageCheckInstance {
    /** URL to open; use the instance's token URL so the session is authenticated. */
    readonly url: string;
    /** Origin of the instance, recorded in the observation. */
    readonly origin: string;
    /** Token URL from `instance.json`, when it differs from `url`. */
    readonly tokenUrl?: string;
}
/** What the caller claims about the page. Everything is optional. */
export interface PageExpectations {
    /** Path appended to the instance URL (e.g. `/settings`). */
    readonly path?: string;
    /** Assert the real window covers the display. */
    readonly fullscreen?: boolean;
    /** Expected layout viewport in CSS pixels. */
    readonly innerSize?: PageSize;
    /** Expected real window size in CSS pixels. */
    readonly outerSize?: PageSize;
    /** Selectors whose text must be present; default `["body"]`. */
    readonly selectors?: readonly string[];
    /** Pixels of slack for size comparisons; default 2. */
    readonly sizeTolerance?: number;
}
export interface PageCheckOptions {
    /** Defaults to true: a blank page or wrong window blocks the run. */
    readonly hard?: boolean;
    readonly title?: string;
    readonly expectations?: PageExpectations;
    /** Navigation/readiness timeout; default 15000 ms. */
    readonly timeoutMs?: number;
}
/** Where the adapter came from, so a report can say what actually ran. */
export interface PageAdapterReport {
    readonly source: "context" | "ports" | "profile" | "none";
    readonly module?: string;
    readonly exportName?: string;
    readonly failure?: string;
}
/** The measurements every spatial conclusion is allowed to cite. */
export interface PageViewportReport {
    readonly inner: PageSize | null;
    readonly outer: PageSize | null;
    readonly screen: PageSize | null;
    readonly tolerance: number;
    /** `null` when fullscreen was not asserted; true/false otherwise. */
    readonly fullscreen: boolean | null;
    readonly windowState?: string;
}
/** A check outcome plus the provenance a page report needs. */
export interface PageCheckOutcome extends CheckOutcome {
    readonly adapter: PageAdapterReport;
    readonly viewport: PageViewportReport | null;
    /**
     * The screenshot item whose bytes were measured on disk. The check result
     * carries only its reference (path, sha256, kind); byte count and capture time
     * stay here so a caller never has to guess them.
     */
    readonly screenshot?: EvidenceItem;
}
/** Everything one page check needs; a ticket-12 command can build this directly. */
export interface PageCheckContext {
    readonly ports: Ports;
    readonly instance: PageCheckInstance;
    readonly profile: VerificationProfile;
    /** Display to compare against; omitted asks the screen port, `null` means unknown. */
    readonly screen?: ScreenInfo | null;
    readonly evidence: EvidenceStore;
    /** Screenshot directory; defaults to `<evidence.root>/screenshots`. */
    readonly evidenceDir?: string;
    /**
     * Preloaded adapter. `undefined` asks `ports.browser` and then the profile's
     * declaration; `null` means "explicitly none" and skips the loader.
     */
    readonly adapter?: BrowserProbeFactory | null;
    /** Why a preloaded adapter is absent (loader failure, for instance). */
    readonly adapterFailure?: Failure;
    /** Plugin repository root for `profile.browser`; defaults to `ports.env.cwd()`. */
    readonly repoRoot?: string;
    /** Headless browser; defaults to true. A fullscreen claim requires a headed run. */
    readonly headless?: boolean;
    readonly loadAdapter?: (options: LoadBrowserAdapterOptions) => Promise<BrowserAdapterLoadResult>;
    readonly note?: (message: string) => void;
}
/**
 * Run one page check.
 *
 * The function never throws: every failure is an outcome. The page and the
 * browser session are closed in `finally` even when the product failed, so a
 * red run does not leave a browser holding the instance's session.
 */
export declare function runPageChecks(context: PageCheckContext, options?: PageCheckOptions): Promise<PageCheckOutcome>;
/**
 * The plan module ticket 12 composes into a single-instance or scenario run.
 *
 * `requires` is empty on purpose: the adapter may come from the profile and be
 * loaded at run time, so a plan-time "browser unavailable" gate would block a
 * check that could actually run.
 */
export declare function createPageCheckModule(options?: PageCheckOptions): CheckModule<PageCheckContext>;
