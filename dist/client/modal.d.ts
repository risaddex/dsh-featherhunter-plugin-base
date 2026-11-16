import type { Group, Lang } from "../core/types";
import { type TextOverrides } from "./texts";
/** Everything the modal needs; built by createBaseUI's openContactModal. */
export interface ContactModalConfig {
    doc: Document;
    lang: Lang;
    groups: readonly Group[];
    /** Already clamped to 1..4 columns (and to the group count). */
    columns: number;
    trigger: HTMLElement | null;
    fallbackUrl: string;
    texts?: TextOverrides;
    /** Returns null when no image is available (card degrades to a link). */
    resolveQr: (group: Group) => string | null;
    /** Clock override for date-dependent validity text. */
    now?: Date;
}
export interface ContactModalUpdate {
    groups?: readonly Group[];
    /** Already clamped to 1..4 columns. */
    columns?: number;
    /** Returns null when no image is available (card degrades to a link). */
    resolveQr?: (group: Group) => string | null;
    fallbackUrl?: string;
    now?: Date;
}
export interface ContactModalHandle {
    dialog: HTMLDialogElement;
    /** Destroy the dialog; restore focus by default. */
    close: (restoreFocus?: boolean) => void;
    /**
     * Re-render the group cards in place. Used when the remote manifest arrives
     * after the baseline was painted, so the dialog is never rebuilt.
     */
    update: (next: ContactModalUpdate) => void;
}
/**
 * Build the contact dialog, enter it into the top layer with showModal() and
 * wire the close paths (Esc, backdrop, close button). The dialog element is
 * the public seam: tests and hosts can query it in the document.
 */
export declare function mountContactModal(config: ContactModalConfig): ContactModalHandle;
