/** Style element id shared by every widget of this package (spec §1: fixed id). */
export declare const BASE_STYLE_ID = "dsh-base-ui-style";
/**
 * One stylesheet for the whole package, injected once per document.
 *
 * Theme colours read the host CSS variables first and fall back to the values
 * shipped with the package, so the widgets match whatever theme the host uses
 * while never rendering unstyled (spec §1, §4, §5).
 *
 * The modal mirrors a README-in-a-dialog: 800px panel, centered heading,
 * centered card grid (four columns at most) and 10-13px type. Narrow screens
 * collapse the grid through media queries because the inline column count only
 * expresses the data-driven part of the layout.
 */
export declare const BASE_CSS: string;
/** Inject the stylesheet once per document. */
export declare function ensureBaseStyles(doc: Document): void;
