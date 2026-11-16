/**
 * README block renderers (tickets 08-10).
 *
 * Every renderer is a pure string function: data (manifest / plugin list) +
 * language + image base in, Markdown/HTML out. No filesystem access and no
 * marker handling — the marker registry and the sync engine own that
 * (see ./readme-sync.ts). The returned string is the block *content*.
 */
import { pluginHref } from "../core/index";
import type { Group, Manifest } from "../core/types";
import type { BlockRenderOptions, ThanksAuthor } from "./types";
/** jsDelivr base of the published data package (exact-version images). */
export declare const DEFAULT_CDN_BASE = "https://cdn.jsdelivr.net/npm/dsh-featherhunter-plugin-base";
/** Whole-card image width used by the README contact table (spec rule 9). */
export declare const CONTACT_CARD_WIDTH = 260;
/** Fixed wording of the contact block, independent of the group data. */
export declare const CONTACT_TEXT: {
    readonly sub: "CONNECT";
    readonly heading: {
        readonly zh: "反馈与联系";
        readonly en: "Feedback and Contact";
    };
    readonly welcome: {
        readonly zh: "👏欢迎提交PR、ISSUE。星星之火可以燎原🔥有任何建议、意见、想法、吐槽、idea都可以进群交流。";
        readonly en: "👏Welcome PRs and issues. A single spark can start a prairie fire 🔥. Any suggestion, opinion, idea or rant — come join the group and talk.";
    };
};
/** Fixed wording of the author-plugins (MORE) block. */
export declare const MORE_TEXT: {
    readonly sub: "MORE";
    readonly heading: {
        readonly zh: "作者的其他作品";
        readonly en: "More from the author";
    };
    readonly leadIn: {
        readonly zh: "喜欢这个插件的话，这些可能你也用得上：";
        readonly en: "If you like this plugin, these might help too:";
    };
    readonly separator: {
        readonly zh: "——";
        readonly en: "—";
    };
};
/**
 * Cache-busting date for a limited-time card (`YYYYMMDD`), or null for a
 * permanent card.
 *
 * A card counts as limited-time when the manifest marks it with `validUntil`
 * or the published file name carries a `YYYY-MM-DD` date. The date in the
 * file name wins; otherwise the manifest `updatedAt` date is used, because
 * GitHub's camo proxy caches images by URL and a new QR code must get a new
 * URL.
 */
export declare function contactCardCacheDate(group: Group, manifest: Manifest): string | null;
/**
 * Absolute pristine CDN URL of one published card image.
 *
 * Shape: `<cdnBase>@<manifest.version>/data/img/<card>[?v=YYYYMMDD]`. The
 * base must be an absolute https URL — README images are never relative or
 * copied into the plugin repositories.
 */
export declare function contactCardUrl(group: Group, manifest: Manifest, options?: BlockRenderOptions): string;
/**
 * Render the README contact block content (no markers).
 *
 * Keeps the pre-migration structure: heading, centered wrapper, welcome line,
 * one header row and one row of {@link CONTACT_CARD_WIDTH}-wide whole cards.
 * Modal-only fields (`title`, `subtitle`, `note`, `qr`) never appear here.
 *
 * @param options data + language + image base; `variant` selects the standard
 *   CONNECT h2 (default) or ilife's Markdown `##` heading.
 */
export declare function renderContactBlock(options?: BlockRenderOptions): string;
/**
 * Link target of one plugin row (kept for the node entry API; the shared
 * implementation lives in ./core so the client rows resolve links identically).
 */
export declare const pluginLink: typeof pluginHref;
/**
 * Render the author-plugins (MORE) block content (no markers).
 *
 * Structure: heading, left-aligned wrapper, one lead-in sentence and four
 * `**[name](url)** —— description` rows, one per plugin other than the
 * repository being rendered. The standard heading is the HTML `<h2>` with the
 * MORE sub-label; the prompt repositories keep their Markdown `##` variant and
 * the en headings may keep a historical wording through `headingText`.
 *
 * @param options data + language; `selfId` excludes the current repository and
 *   `variant` / `headingText` preserve the repository heading conventions.
 */
export declare function renderMoreBlock(options?: BlockRenderOptions): string;
/** Default alt text of the star-history chart image. */
export declare const STAR_HISTORY_DEFAULT_ALT = "Star History Chart";
/** Fixed parts of the thanks table. */
export declare const THANKS_TEXT: {
    readonly header: {
        readonly zh: "| 贡献者 | 致敬 | 贡献 |";
        readonly en: "| Contributor | Tribute | Contributions |";
    };
    readonly separator: "| --- | --- | --- |";
};
/**
 * Render the star-history block content (no markers).
 *
 * The chart is a light/dark picture pair of the repository SVG assets, each
 * cache-busted with a minute-level ?v=YYYYMMDDHHmm query string. The optional
 * data fields keep the per-repository functional elements found before the
 * migration: deck links the pair to a standalone chart page, im renders it at
 * a fixed width with a caption note.
 */
export declare function renderStarHistoryBlock(options?: BlockRenderOptions): string;
/**
 * Contribution total of one author: every issue, pull request, discussion and
 * counted comment adds one flower.
 */
export declare function thanksTotal(author: ThanksAuthor): number;
/** Roses of one author, one symbol per tier (greedy, high to low). */
export declare function rosesFor(total: number): string;
/** Maintainer / bot / deleted accounts never enter the thanks table. */
export declare function isSkippedThanksLogin(login: string, owner: string): boolean;
/**
 * Contribution links of one author, grouped by URL segment (issue thread,
 * pull-request thread, discussions) and ascending inside a segment. Comments
 * inherit their thread segment so a comment and its issue stay adjacent.
 */
export declare function thanksLinks(author: ThanksAuthor, repo: string): string[];
/** One table row of the thanks block. */
export declare function thanksRow(login: string, author: ThanksAuthor, repo: string): string;
/**
 * Render the thanks block content (no markers, no heading / prose).
 *
 * The three-column table is the only managed part: its surrounding heading,
 * intro and footer stay byte-identical outside the marker pair. The row rules
 * are the ones the five repositories already use - maintainer / bot accounts
 * filtered out, one symbol per tier, and the segment-merged link order.
 */
export declare function renderThanksBlock(options?: BlockRenderOptions): string;
