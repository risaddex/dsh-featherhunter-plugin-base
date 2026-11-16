import type { I18nText, Lang, Manifest, PluginEntry } from "./types";
export * from "./types";
export { BASELINE } from "./baseline";
/** Pick the localized variant, falling back to the other language. */
export declare function pickText(text: I18nText | undefined, lang: Lang): string;
export interface LangHints {
    /** Explicit user setting. */
    explicit?: string | null;
    /** `<html lang>` of the host page. */
    htmlLang?: string | null;
    /** `navigator.languages` of the host page. */
    navigatorLanguages?: readonly string[] | null;
}
/**
 * Language fallback chain: explicit setting -> page `<html lang>` ->
 * `navigator.languages` -> `zh`.
 */
export declare function resolveLang(hints?: LangHints): Lang;
/** Copy sorted by display order (stable, input untouched). */
export declare function sortByOrder<T extends {
    order: number;
}>(items: readonly T[]): T[];
/**
 * Link target of one plugin row: the explicit url when the data provides a
 * non-empty one, otherwise the canonical GitHub repository page.
 */
export declare function pluginHref(plugin: PluginEntry): string;
/** Strict `YYYY-MM-DD` parser (UTC midnight). Invalid dates return null. */
export declare function parseDateOnly(value: string): Date | null;
/** `validUntil` is inclusive; a group without `validUntil` never expires. */
export declare function isExpired(validUntil: string | undefined, now?: Date): boolean;
export interface ValidityOptions {
    lang: Lang;
    now?: Date;
}
/**
 * Human validity line for the modal footnote. Returns null for permanent codes
 * and for expired ones (the caller falls back to the link).
 */
export declare function formatValidity(validUntil: string | undefined, options: ValidityOptions): string | null;
/** Narrow an unknown JSON value to a plain object (arrays and null excluded). */
export declare function isRecord(value: unknown): value is Record<string, unknown>;
/**
 * Validate a published `data/manifest.json` payload. Throws on the first
 * structural problem so a bad deploy fails loudly instead of rendering blanks.
 */
export declare function parseManifest(raw: unknown): Manifest;
