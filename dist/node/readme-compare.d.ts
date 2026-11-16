/**
 * README block extraction and normalized comparison.
 *
 * The five plugin repositories hand-write four README blocks (contact, star
 * history, thanks, author plugins) in slightly different shapes. This module
 * (a) locates those blocks in a README text, (b) parses each shape leniently
 * into a comparable structure, and (c) compares two blocks by *content*
 * (members / links / texts / widths / thanks table data), reporting pure
 * formatting differences separately.
 *
 * It is deliberately dependency-free (no node: imports) so both the ./node
 * entry and the fixture extraction script can use it.
 */
/** Kind of a managed README block. */
export type ReadmeBlockKind = "contact" | "star-history" | "thanks" | "more";
/** A line that looks like merge-conflict residue; writers must stop. */
export interface SuspiciousLine {
    /** 1-based line number. */
    line: number;
    /** The offending line, verbatim. */
    text: string;
    reason: "conflict-start" | "conflict-separator" | "conflict-end" | "merge-conflict-residue";
}
/** Raw block slices located in a README text. */
export interface LocatedBlocks {
    /** Raw block text per kind; null when the block is absent. */
    blocks: Record<ReadmeBlockKind, string | null>;
    /** Block kinds in the order they appear in the file. */
    order: ReadmeBlockKind[];
    /** Merge-conflict residue / suspicious lines found anywhere in the file. */
    suspicious: SuspiciousLine[];
}
/**
 * Locate the four managed blocks in a README text.
 *
 * Boundaries are the next managed-block start (or EOF), trimmed of blank lines
 * and trailing `---` rules. Block order is recorded but never assumed: the
 * five repos currently order the blocks differently.
 */
export declare function locateReadmeBlocks(markdown: string): LocatedBlocks;
/** Find merge-conflict residue. Writers must stop and hand the file to a human. */
export declare function findSuspiciousLines(markdown: string): SuspiciousLine[];
/** Parse an HTML attribute string into a lower-cased attribute map. */
export declare function parseAttributes(attributeText: string): Record<string, string>;
/** File name of an image src, dropping directory prefix, query and hash. */
export declare function assetName(src: string): string;
/** Parsed block heading; `sub` is the small label (CONNECT / THANKS / MORE). */
export interface ParsedHeading {
    sub: string | null;
    text: string;
}
/** Parse the heading of a managed block in either HTML or Markdown form. */
export declare function parseHeading(raw: string): ParsedHeading | null;
/** One group (chat group QR code) inside the contact block. */
export interface ContactGroup {
    /** Table header text, e.g. 飞书群（主）. */
    title: string;
    /** Image src exactly as written (relative or absolute). */
    src: string;
    /** Image file name; stable across relative prefixes and CDN URLs. */
    asset: string;
    /** Rendered image width, if any. */
    width: number | null;
    alt: string;
}
/** Parsed contact block. */
export interface ParsedContactBlock {
    variant: "html-heading" | "markdown-heading";
    heading: ParsedHeading | null;
    welcome: string | null;
    groups: ContactGroup[];
}
/** Parse the contact block in either heading variant. */
export declare function parseContactBlock(raw: string): ParsedContactBlock;
/** A dark/light `<source>` inside a `<picture>`. */
export interface StarSource {
    /** "dark" / "light" when declared, otherwise null. */
    media: string | null;
    src: string;
    /** Image file name, stable across CDN URLs and cache busters. */
    asset: string;
}
/** The visible star history image. */
export interface StarImage {
    alt: string;
    src: string;
    asset: string;
    width: number | null;
}
/** Parsed star history block. */
export interface ParsedStarHistoryBlock {
    variant: "picture-link" | "picture" | "markdown-image" | "unknown";
    /** Click-through link around the picture, e.g. deck's star-history.html. */
    link: string | null;
    sources: StarSource[];
    image: StarImage | null;
    /** Caption below the image (im keeps a two-axis explanation). */
    caption: string | null;
}
/** Parse the star history block in any of its four current shapes. */
export declare function parseStarHistoryBlock(raw: string): ParsedStarHistoryBlock;
/** One table cell of the thanks table. */
export interface ThanksCell {
    /** Visible text (links reduced to their label). */
    text: string;
    /** Link targets found in the cell, in order. */
    links: string[];
}
/** One row of the thanks table. */
export interface ThanksRow {
    cells: ThanksCell[];
}
/** Parsed thanks block. */
export interface ParsedThanksBlock {
    variant: "html-heading" | "markdown-heading";
    heading: ParsedHeading | null;
    /** Language of the table markers (THANKS-TABLE-ZH / -EN). */
    lang: "zh" | "en" | null;
    headers: string[];
    rows: ThanksRow[];
    /** Non-table prose around the table, kept for fixtures but not compared. */
    prose: string | null;
}
/** Parse the thanks block, including the empty-table case used by ilife. */
export declare function parseThanksBlock(raw: string): ParsedThanksBlock;
/** One plugin row in the "more from the author" block. */
export interface MoreItem {
    name: string;
    url: string;
    description: string;
}
/** Parsed "more from the author" block. */
export interface ParsedMoreBlock {
    variant: "html-heading" | "markdown-heading";
    heading: ParsedHeading | null;
    intro: string | null;
    items: MoreItem[];
    footer: string | null;
}
/** Parse the "more from the author" block. Rows are returned in file order. */
export declare function parseMoreBlock(raw: string): ParsedMoreBlock;
/** Formatting-only differences; they never make a block content-different. */
export type FormatStage = "line-endings" | "whitespace" | "quotes" | "attribute-order" | "self-closing";
/** A formatting difference kind (`markup` = structural markup beyond the stages). */
export type FormatDifferenceKind = FormatStage | "heading-variant" | "markup";
/** One detected pure-format difference. */
export interface FormatDifference {
    kind: FormatDifferenceKind;
    /** Set when the difference was found at README level. */
    block?: ReadmeBlockKind;
}
/** Content difference dimensions required by the equivalence criterion. */
export type DifferenceDimension = "presence" | "members" | "links" | "text" | "width" | "table" | "image";
/** One content difference, addressed by a structural path. */
export interface Difference {
    dimension: DifferenceDimension;
    path: string;
    expected: unknown;
    actual: unknown;
}
/** Comparison options. */
export interface CompareOptions {
    /**
     * How image sources are compared. `basename` (default) ignores relative/CDN
     * prefixes and `?v=` cache busters; `exact` compares the raw src.
     */
    imageSrc?: "basename" | "exact";
}
/** Result of comparing one managed block. */
export interface BlockComparison {
    kind: ReadmeBlockKind;
    /** Raw text is byte-identical. */
    identical: boolean;
    /** Content is equivalent under the F18 criterion. */
    equivalent: boolean;
    contentDifferences: Difference[];
    /** Only populated when content is equivalent but raw text differs. */
    formatDifferences: FormatDifference[];
}
/** Result of comparing two READMEs. */
export interface ReadmeComparison {
    equivalent: boolean;
    blocks: Record<ReadmeBlockKind, BlockComparison>;
    contentDifferences: Difference[];
    formatDifferences: FormatDifference[];
    order: {
        expected: ReadmeBlockKind[];
        actual: ReadmeBlockKind[];
        same: boolean;
    };
    /** Merge-conflict residue from the actual README: callers must stop. */
    suspicious: SuspiciousLine[];
}
/** Canonical form that erases whitespace, quote, attribute-order and self-close style. */
export declare function canonicalizeMarkup(markup: string): string;
/** Compare one managed block; null means the block is absent. */
export declare function compareBlocks(kind: ReadmeBlockKind, expectedRaw: string | null, actualRaw: string | null, options?: CompareOptions): BlockComparison;
/** Compare two READMEs (raw text or already-located blocks) block by block. */
export declare function compareReadmeBlocks(expected: string | LocatedBlocks, actual: string | LocatedBlocks, options?: CompareOptions): ReadmeComparison;
