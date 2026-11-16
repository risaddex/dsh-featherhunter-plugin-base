import type * as ReactNamespace from "react";
/** h is the injected runtime's createElement, never an imported React. */
type H = typeof ReactNamespace.createElement;
/**
 * Contact / community: two stacked speech bubbles (blue -> purple gradient).
 * The three white dots on the front bubble pulse while the button is hovered,
 * so the affordance reads as "talking to us" instead of a grey QR outline.
 */
export declare function contactClusterIcon(h: H, size?: number, uid?: string): ReactNamespace.ReactElement;
/**
 * Star: a gold gradient five-pointed star with an inner highlight, a soft halo
 * and four sparkles around it. Hover twinkles the big star, breathes the halo
 * and blinks the sparkles out of phase.
 */
export declare function starClusterIcon(h: H, size?: number, uid?: string): ReactNamespace.ReactElement;
/**
 * Issue / feedback: a coral speech bubble with a white exclamation mark.
 * Hover wiggles the bubble, bounces the mark and blinks the corner sparkle.
 */
export declare function issueClusterIcon(h: H, size?: number, uid?: string): ReactNamespace.ReactElement;
/** Neutral three-dot glyph for the overflow trigger of the cluster. */
export declare function moreClusterIcon(h: H, size?: number): ReactNamespace.ReactElement;
export {};
