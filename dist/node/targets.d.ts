import type { I18nText, Lang, Manifest } from "../core/types";
import type { ReadmeTargetOptions } from "./readme-sync";
import type { StarHistoryData, ThanksData } from "./types";
export { STAR_CHART_DEFAULT_DARK, STAR_CHART_DEFAULT_LIGHT } from "./star-assets";
/**
 * Static description of one README managed by `readme:init` / `readme:sync --all`.
 *
 * The table is the single source of truth for the multi-repository workflow:
 * the CLI expands it into concrete targets, and the release pipeline imports it
 * to know which READMEs to sync. Everything a renderer needs that cannot be
 * detected from the README itself (repository full name, default branch,
 * per-repository star-chart shape, thanks data file) lives here.
 */
export interface ReadmeTarget {
    /** Directory name of the repository under the repositories parent directory. */
    repo: string;
    /** README path relative to the repository root. */
    readme: string;
    /** Primary language of that README. */
    lang: Lang;
    /** Plugin id of the repository; the MORE block excludes it. */
    selfId: string;
    /** Star-history chart of the repository. */
    star: {
        /** GitHub "owner/repo" that publishes the chart assets. */
        repo: string;
        /** Branch that publishes the chart assets; defaults to `main`. */
        branch?: string;
        /** Dark-mode chart path; defaults to `docs/star-history-dark.svg`. */
        darkPath?: string;
        /** Light-mode chart path; defaults to `docs/star-history-light.svg`. */
        lightPath?: string;
        /** Optional link to a standalone chart page. */
        pageUrl?: string;
        /** Optional rendered image width. */
        width?: number;
        /** Image alt text. */
        alt: I18nText;
        /** Optional caption note under the chart. */
        note?: I18nText;
    };
    /** Repository-relative thanks data file; defaults to `docs/thanks-data.json`. */
    thanksDataFile?: string;
}
/** Package name, duplicated here so the CLI and release script agree. */
export declare const PACKAGE_NAME = "dsh-featherhunter-plugin-base";
/** Star-history data file kept by every repository that publishes a chart. */
export declare const STAR_DATA_FILE = "docs/star-history.json";
/**
 * The eleven READMEs of the five plugin repositories.
 *
 * Order follows the release pipeline (deck, palette, im, prompt, ilife) and the
 * same order inside each repository (root README, package README, English docs).
 */
export declare const README_TARGETS: readonly ReadmeTarget[];
/** One target resolved against a concrete repositories parent directory. */
export interface ResolvedReadmeTarget extends ReadmeTargetOptions {
    /** Repository directory name (also the key used by the CLI report). */
    repo: string;
    /** README path relative to the repository root. */
    readme: string;
    /** Declared star-history configuration (asset paths, link, width, note). */
    star: ReadmeTarget["star"];
}
/** Read and validate the packaged `data/manifest.json`. */
export declare function readPackagedManifest(): Manifest;
/** Read the packaged `package.json` version. */
export declare function readPackageVersion(): string;
/** Turn an ISO timestamp into a minute-level `YYYYMMDDHHmm` query string. */
export declare function starVersionFromTimestamp(iso: string): string;
/**
 * Detect the chart version already used by a README.
 *
 * Repositories migrate from an 8-digit `?v=YYYYMMDD` query to the 12-digit
 * `?v=YYYYMMDDHHmm` form; an 8-digit value is padded with `0000` so the
 * existing chart keeps its date instead of jumping to the manifest timestamp.
 */
export declare function detectStarVersion(markdown: string): string | undefined;
/**
 * Derive the chart version from the repository's own star-history data file.
 *
 * The data file is rewritten by the repository's star workflow on every day a
 * star arrives, so its last entry dates the chart the SVG currently shows.
 * Deriving the cache buster from it keeps the README stamp in step with the
 * data and removes the workflow's second README write path (the old
 * `node -e` stamp rewrite). A repository without the file falls back to the
 * version already present in its README, then to the manifest timestamp.
 */
export declare function starVersionFromDataFile(repoRoot: string): string | undefined;
/**
 * Whether a README embeds its star-history chart as a Markdown image.
 *
 * The form is detected from the README rather than declared per target, so a
 * repository keeps the shape it already publishes: deck / im use raw HTML
 * (`<picture>`), palette / prompt use `![alt](raw-url)`.
 */
export declare function detectStarMarkdownImage(markdown: string): boolean;
/** Resolve the dark / light chart asset paths declared by one target. */
export declare function starChartPaths(target: {
    star: ReadmeTarget["star"];
}): {
    dark: string;
    light: string;
};
/**
 * Chart assets a repository must provide before its star block can be written.
 *
 * The charts are generated by each repository's own star-history workflow; the
 * base package only renders the URL. A repository without the assets (ilife
 * today) skips the block instead of publishing a broken image, and `doctor`
 * reports the missing files.
 */
export declare function missingStarChartAssets(repoRoot: string, target: {
    star: ReadmeTarget["star"];
}): string[];
/**
 * Build the star-history data of one target.
 *
 * Version precedence: the repository's star data file (see
 * {@link starVersionFromDataFile}), then the version already in the README,
 * then the packaged manifest timestamp.
 */
export declare function buildStarHistoryData(target: ReadmeTarget, markdown: string | undefined, manifest: Manifest, repoRoot?: string): StarHistoryData;
/**
 * Load one repository's thanks data.
 *
 * The file is written by the repository's own generator and has no `repo`
 * field; the GitHub repository name comes from the target table. A missing file
 * means the repository has not enabled the thanks table yet: the block is
 * skipped instead of failing the whole run.
 */
export declare function loadThanksData(repoRoot: string, target: Pick<ReadmeTarget, "repo" | "thanksDataFile">, repoName?: string): ThanksData | undefined;
/** Resolve the target table against a repositories parent directory. */
export declare function resolveReadmeTargets(reposDir: string, options?: {
    manifest?: Manifest;
    targets?: readonly ReadmeTarget[];
}): ResolvedReadmeTarget[];
/** Directory names of the five managed repositories, in table order. */
export declare function readmeTargetRepos(): string[];
/**
 * Resolve the targets of one repository directory (`doctor <repo-dir>`).
 *
 * The directory name must match one of the five managed repositories, so a
 * mistyped path fails loudly instead of silently checking nothing.
 */
export declare function resolveRepoReadmeTargets(repoRoot: string, options?: {
    manifest?: Manifest;
}): ResolvedReadmeTarget[];
/** Expand one or more repositories parent directories into targets. */
export declare function expandReadmeTargets(reposDirs: readonly string[], options?: {
    manifest?: Manifest;
}): ResolvedReadmeTarget[];
