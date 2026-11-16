import type * as ReactNamespace from "react";
import type { Lang, PluginEntry } from "../core/types";
import type { TipController } from "./hover-tip";
/**
 * Default row cap of the author plugin card. The list is the five finalised
 * plugins (contact/plugins.json); after dropping the host plugin four remain,
 * so five is a natural ceiling that never hides a sibling by accident.
 */
export declare const DEFAULT_MAX_ROWS = 5;
/** Options that decide which plugin rows are visible. */
export interface AuthorPluginRowsOptions {
    /** Full plugin list, usually manifest.plugins. */
    plugins: readonly PluginEntry[];
    /** Id of the host plugin; excluded unless showSelf is on. */
    selfId?: string;
    /** Show the host plugin itself. */
    showSelf?: boolean;
    /** Hard cap on rendered rows (default {@link DEFAULT_MAX_ROWS}). */
    maxRows?: number;
}
/**
 * Visible rows: data order (order asc), host plugin dropped unless asked for,
 * then capped. An undecorated list keeps the exact order of the manifest.
 */
export declare function selectAuthorPlugins(options: AuthorPluginRowsOptions): PluginEntry[];
export { pluginHref } from "../core/index";
/** Everything the pure renderer needs; built by createBaseUI's wire-up. */
export interface RenderAuthorPluginsOptions extends AuthorPluginRowsOptions {
    /** Injected runtime: the package never imports React itself. */
    React: typeof ReactNamespace;
    lang: Lang;
    /** Already localised, already overridden card title. */
    title: string;
    className?: string;
    /**
     * Shared tooltip controller. When present, hovering or focusing a row shows
     * the full description through the same engine as the header actions; the
     * visible line is clipped with an ellipsis, so the tooltip is the only place
     * the complete copy can be read.
     */
    tip?: TipController;
}
/**
 * Render the settings-panel card, or null when nothing is left to show: an
 * empty list, a failed manifest, or a list containing only the host plugin
 * must not leave an empty container in the settings page.
 */
export declare function renderAuthorPlugins(options: RenderAuthorPluginsOptions): ReactNamespace.ReactElement | null;
