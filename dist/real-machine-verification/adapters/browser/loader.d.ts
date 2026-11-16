import type { BrowserProbeFactory, FsPort } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
import type { BrowserAdapterDeclaration } from "../../contracts/verification-profile";
/** Import one module specifier. Injectable so tests need no real files. */
export type BrowserAdapterImport = (specifier: string) => Promise<unknown>;
/** A loaded adapter plus enough provenance for a report to cite it. */
export interface LoadedBrowserAdapter {
    readonly factory: BrowserProbeFactory;
    /** The specifier handed to `import()`: a file URL or a package name. */
    readonly specifier: string;
    /** The declared module value, unchanged. */
    readonly module: string;
    /** `default` or the named export that supplied the factory. */
    readonly exportName: string;
}
/**
 * An adapter failure, classified.
 *
 * `blocked` means the machine/repository cannot provide the adapter (missing
 * module, unsupported runtime); `failed` means the module exists but does not
 * export the promised shape. The page check maps both to `blocked` because
 * neither says anything about the product; the classification stays available
 * for a report that wants to separate "missing" from "misconfigured".
 */
export type BrowserAdapterFailure = Failure & {
    readonly kind: "blocked" | "failed";
};
export type BrowserAdapterLoadResult = Result<LoadedBrowserAdapter, BrowserAdapterFailure>;
export interface LoadBrowserAdapterOptions {
    readonly fs: FsPort;
    /** Plugin repository root; relative modules resolve against it. */
    readonly repoRoot: string;
    readonly declaration: BrowserAdapterDeclaration;
    /** Defaults to a native dynamic import; tests inject their own. */
    readonly importModule?: BrowserAdapterImport;
}
/**
 * Copy-paste adapter skeleton.
 *
 * Deliberately library-neutral: the plugin repository already has a browser
 * driver (or none), and this capability must not choose one for it.
 */
export declare const BROWSER_ADAPTER_TEMPLATE = "// verify/browser.mjs \u2014 the adapter page checks import.\n// Declare it in verify/profile.ts as:\n//   browser: { module: \"verify/browser.mjs\" }\nexport default {\n  async launch({ headless }) {\n    const driver = await startMyBrowser({ headless }); // the plugin's own driver\n    return {\n      ok: true,\n      value: {\n        async newPage() {\n          const page = await driver.openPage();\n          return { ok: true, value: page }; // page implements BrowserPageHandle\n        },\n        async close() {\n          await driver.close();\n        },\n      },\n    };\n  },\n};\n";
/**
 * The sentence a blocked page check shows. It must be enough for a reader to
 * adopt the adapter without opening the source.
 */
export declare function missingBrowserAdapterHint(): string;
/**
 * Import the declared adapter and prove it has the promised shape.
 *
 * Nothing is launched here: loading must stay side-effect free, because a dry
 * run and a plan need to know whether an adapter exists without starting a
 * browser.
 */
export declare function loadBrowserAdapter(options: LoadBrowserAdapterOptions): Promise<BrowserAdapterLoadResult>;
