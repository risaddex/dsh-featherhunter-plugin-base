import type * as ReactNamespace from "react";
import type { BaseUI, BaseUIOptions } from "./types";
export type * from "./types";
/**
 * Build the settings-panel widgets bound to the injected React runtime.
 *
 * The client bundle never imports React: the host passes its own copy so this
 * package shares the host's reconciler and context.
 */
export declare function createBaseUI(React: typeof ReactNamespace, options?: BaseUIOptions): BaseUI;
export { BASE_CSS, BASE_STYLE_ID, ensureBaseStyles } from "./styles";
export { MESSAGES, resolveText } from "./texts";
export type { TextKey, TextOverrides } from "./texts";
export { ALLOWED_CDN_HOSTS, ContentLoader, MANIFEST_CACHE_TTL_MS, MANIFEST_TIMEOUT_MS, MAX_IMAGE_BYTES, MAX_MANIFEST_BYTES, createContentLoader, defaultChannels, imageUrls, isAllowedCdnUrl, isHttpsUrl, resetContentCache, validateRemoteManifest, } from "./content";
export type { ContentLoaderOptions, FetchLike, FetchResponseLike, LoadedContent, ManifestChannel } from "./content";
