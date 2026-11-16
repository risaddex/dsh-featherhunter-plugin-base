import type * as ReactNamespace from "react";
import type { TextKey } from "./texts";
import type { ActionButtonsProps, ActionGroupProps, ContactButtonProps, HoverTipProps, IssueButtonProps, StarButtonProps } from "./types";
/** Everything the header actions read from one createBaseUI instance. */
export interface ActionsDeps {
    /** Localised copy resolver bound to the createBaseUI options. */
    text: (key: TextKey) => string;
    /** Opens the contact dialog; the trigger element restores focus on close. */
    openContact: (trigger: HTMLElement | null) => void;
    /** Default GitHub repo URL (Star target, Issue URL base). */
    repoUrl?: string;
    /** Default issues URL; derived from repoUrl when only that is given. */
    issuesUrl?: string;
}
export interface ActionsComponents {
    ContactButton: ReactNamespace.ComponentType<ContactButtonProps>;
    StarButton: ReactNamespace.ComponentType<StarButtonProps>;
    IssueButton: ReactNamespace.ComponentType<IssueButtonProps>;
    ActionButtons: ReactNamespace.ComponentType<ActionButtonsProps>;
    ActionGroup: ReactNamespace.ComponentType<ActionGroupProps>;
    HoverTip: ReactNamespace.ComponentType<HoverTipProps>;
}
/**
 * The three header actions as separate controls plus a single capsule that
 * packs all three next to a narrow page title. Star and Issue use the deck line
 * icons (24px grid, currentColor, 1.8 stroke); Contact reuses the QR outline.
 */
export declare function createActions(React: typeof ReactNamespace, deps: ActionsDeps): ActionsComponents;
