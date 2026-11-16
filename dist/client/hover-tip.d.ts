import type * as ReactNamespace from "react";
import type { HoverTipProps } from "./types";
/** Class of the floating tooltip element (styled in styles.ts). */
export declare const TIP_CLASS = "dsh-base-tip";
export interface TipMountOptions {
    /** Max tooltip width in px (default 320). */
    maxWidth?: number;
    /** Preferred side; flips automatically when the viewport has no room. */
    placement?: "top" | "bottom";
    /**
     * Claim the document-wide single-tip slot (default true). Controlled tips
     * (screenshots, demos) opt out and may coexist.
     */
    exclusive?: boolean;
}
export interface TipHandle {
    /** Id of the mounted tooltip element (for aria-describedby). */
    readonly id: string;
    dispose(): void;
}
/** Default delay before hiding a tooltip after pointer leave (ms). */
export declare const TIP_HIDE_DELAY = 160;
export interface TipControllerOptions {
    /** Delay before hiding after pointer leave (default {@link TIP_HIDE_DELAY}). */
    hideDelay?: number;
    /** Max tooltip width in px (default 320). */
    maxWidth?: number;
}
export interface TipController {
    /** Mount the tooltip above (or below) the trigger and describe it. */
    show(anchor: HTMLElement, content: string): void;
    /** Hide after the shared leave delay; a re-enter cancels it. */
    hideSoon(): void;
    /** Hide immediately; also drops the aria wiring. */
    hideNow(): void;
    /** Permanent teardown for unmounting hosts. */
    dispose(): void;
}
/**
 * Imperative tooltip controller for controls that must keep their own DOM and
 * cannot add a wrapper element (header cluster buttons cannot, nor can author
 * plugin rows whose layout is driven by flex + text-overflow).
 *
 * It is the same engine as {@link createHoverTip} and {@link mountTip}: one
 * tooltip on screen at a time, the shared 160ms leave delay, aria-describedby
 * wired to the live trigger and Escape hides it at once.
 */
export declare function createTipController(options?: TipControllerOptions): TipController;
/**
 * Mount one tooltip for an anchor.
 *
 * Shared engine behind the public HoverTip control and the header action
 * cluster: one copy line above the trigger, flipped below near the top edge,
 * clamped inside the viewport, dark pill that escapes overflow:hidden panels by
 * living in document.body. It never receives pointer events, so it cannot steal
 * the hover from the trigger.
 */
export declare function mountTip(anchor: HTMLElement, content: string, options?: TipMountOptions): TipHandle;
/**
 * Port of the deck HoverTip as a public base control.
 *
 * The tooltip lives in document.body so it escapes panels with overflow:hidden;
 * it never receives pointer events, so it cannot steal the hover from the
 * trigger. Hovered tips are global (one at a time); a controlled tip (the
 * visible prop) is explicit and may coexist with others.
 */
export declare function createHoverTip(React: typeof ReactNamespace): ReactNamespace.ComponentType<HoverTipProps>;
