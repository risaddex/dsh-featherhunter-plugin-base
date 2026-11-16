import type * as ReactNamespace from "react";
/** h is the injected runtime's createElement, never an imported React. */
type H = typeof ReactNamespace.createElement;
/**
 * Contact affordance: a QR-code outline (frame, three finder squares, four
 * data modules). Line art in currentColor so it inherits the host theme.
 */
export declare function contactIcon(h: H, size: number): ReactNamespace.ReactElement;
/** 2x2 grid glyph used by the card title (14px) and each row (12px). */
export declare function gridIcon(h: H, size: number): ReactNamespace.ReactElement;
/**
 * Five-point star outline: the Star affordance. Same line grammar as
 * contactIcon (24px grid, currentColor, 1.8 stroke, round joins), so the three
 * header actions read as one family.
 */
export declare function starIcon(h: H, size: number): ReactNamespace.ReactElement;
/** Circled exclamation: the Issue affordance (GitHub "issue opened" meaning). */
export declare function issueIcon(h: H, size: number): ReactNamespace.ReactElement;
/** Square + diagonal arrow: the "opens in a new tab" affordance. */
export declare function externalLinkIcon(h: H): ReactNamespace.ReactElement;
export {};
