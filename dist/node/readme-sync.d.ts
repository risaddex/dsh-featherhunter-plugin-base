import type { Lang } from "../core/types";
import type { BlockName, BlockRenderOptions, HeadingVariant, ReadmeSyncOptions } from "./types";
/** One marker pair managed inside a README. */
export interface BlockMarkerSet {
    /** Language of the segment; unset = the block's default language. */
    lang?: Lang;
    start: string;
    end: string;
}
/** Options handed to a block renderer; `lang` is always resolved. */
export interface BlockRenderContext extends BlockRenderOptions {
    lang: Lang;
}
/** Half-open character range of a legacy (pre-marker) block in a README. */
export interface LegacyBlockSpan {
    start: number;
    end: number;
}
/**
 * One managed README block.
 *
 * Ticket 09/10 only need to fill in `render` (and, when the block is new like
 * the MORE block on ilife, `locateLegacy`) for the reserved entries.
 */
export interface BlockDefinition {
    name: BlockName;
    /** Human-readable name used in CLI diagnostics. */
    label: string;
    /** Marker pairs the engine owns. `thanks` has one pair per language. */
    markers: readonly BlockMarkerSet[];
    /**
     * Render the content between the marker pair. A definition without a
     * renderer is reserved: its markers are validated when present but never
     * rewritten.
     */
    render?: (context: BlockRenderContext) => string;
    /** Locate the pre-marker block extent in a README (used by `readme:init`). */
    locateLegacy?: (markdown: string) => LegacyBlockSpan | null;
    /** Recover the language, heading form and heading wording from a current block. */
    detect?: (raw: string) => {
        lang?: Lang;
        variant?: HeadingVariant;
        headingText?: string;
    };
    /**
     * Whether the caller supplied the data this block renders. Definitions
     * without data are skipped instead of failing, so a CLI run that has no
     * thanks / star data yet still syncs the other blocks.
     */
    hasData?: (options: BlockRenderOptions) => boolean;
}
export declare const BLOCK_MARKERS: {
    readonly contact: {
        readonly start: "<!-- CONTACT-START -->";
        readonly end: "<!-- CONTACT-END -->";
    };
    readonly more: {
        readonly start: "<!-- MORE-START -->";
        readonly end: "<!-- MORE-END -->";
    };
    readonly starHistory: {
        readonly start: "<!-- STAR-HISTORY-START -->";
        readonly end: "<!-- STAR-HISTORY-END -->";
    };
    readonly thanks: {
        readonly start: "<!-- THANKS-TABLE-ZH-START -->";
        readonly end: "<!-- THANKS-TABLE-ZH-END -->";
        readonly zh: {
            readonly start: "<!-- THANKS-TABLE-ZH-START -->";
            readonly end: "<!-- THANKS-TABLE-ZH-END -->";
        };
        readonly en: {
            readonly start: "<!-- THANKS-TABLE-EN-START -->";
            readonly end: "<!-- THANKS-TABLE-EN-END -->";
        };
    };
};
/**
 * Registry of the managed README blocks.
 *
 * Order is documentation order, not README order: the engine locates every
 * block by its markers, so block order inside a README never matters.
 */
export declare const BLOCK_DEFINITIONS: readonly BlockDefinition[];
/** Look up one block definition by name. */
export declare function blockDefinition(name: BlockName): BlockDefinition | undefined;
/** Result of updating one README file. */
export interface ReadmeFileResult {
    /** Absolute path of the README. */
    readmePath: string;
    ok: boolean;
    /** The README content must change (or would change when `check`). */
    changed: boolean;
    /** The engine actually wrote the file. */
    written: boolean;
    blocks: Array<{
        name: BlockName;
        status: "inserted" | "updated" | "unchanged" | "skipped";
    }>;
    errors: string[];
}
/** Options for one README target. */
export interface ReadmeTargetOptions extends BlockRenderOptions {
    /** Directory that contains the README (`--root`). */
    root: string;
    /** README path relative to `root`; default `README.md`. */
    readme?: string;
}
/** Options for one `readme:init` / `readme:sync` file update. */
export interface ReadmeUpdateOptions extends ReadmeTargetOptions {
    /** `init` may insert missing markers; `sync` only rewrites marked text. */
    command?: "init" | "sync";
    /** Report drift without writing. */
    check?: boolean;
}
/** Result of updating several README files. */
export interface ReadmeBatchResult {
    ok: boolean;
    files: ReadmeFileResult[];
}
/** Hooks used by tests to observe the atomic-write window. */
export interface AtomicWriteHooks {
    /** Called after the temp file is complete but before the rename. */
    beforeRename?: (tempPath: string) => void;
}
/**
 * Write a file atomically: full content goes to a sibling temp file first, the
 * original permissions are copied, and only then the temp file is renamed over
 * the destination. A failure before the rename leaves the original untouched
 * and removes the temp file.
 */
export declare function writeFileAtomic(filePath: string, content: string, hooks?: AtomicWriteHooks): void;
/**
 * Update one README.
 *
 * `init` seeds missing marker pairs at the legacy block position; `sync`
 * only rewrites already-marked text. In both modes a README with suspicious
 * merge-conflict residue or broken markers is left byte-identical.
 */
export declare function updateReadme(options: ReadmeUpdateOptions): ReadmeFileResult;
/**
 * Update every target root (CLI `--root`, repeatable).
 *
 * All targets are processed even when one fails, so a maintainer sees every
 * problem in one run; `--all` (the CLI flag) merely mirrors that policy for
 * the multi-repository workflow.
 */
export declare function updateReadmes(options: ReadmeSyncOptions): ReadmeBatchResult;
/** Options for updating an explicit list of targets (CLI `--all --repos`). */
export interface ReadmeTargetListOptions {
    /** `init` may insert missing marker pairs; `sync` only rewrites marked text. */
    command?: "init" | "sync";
    /** Report drift without writing. */
    check?: boolean;
}
/**
 * Update an explicit list of targets (CLI `--all --repos`).
 *
 * Unlike {@link updateReadmes}, which applies one set of options to several
 * roots, every target carries its own README path, language, self id and
 * per-repository star / thanks data. Every target is attempted even when one
 * fails, so the maintainer sees all problems in one run.
 */
export declare function updateReadmeTargets(targets: readonly ReadmeTargetOptions[], options?: ReadmeTargetListOptions): ReadmeBatchResult;
