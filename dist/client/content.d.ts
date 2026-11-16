import type { Manifest } from "../core/types";
/**
 * Remote manifest transport (ticket 05).
 *
 * The contact modal must always paint the bundled baseline first and only then
 * swap in the published manifest. Everything in this module is therefore
 * best-effort: any failure (timeout, HTTP error, invalid JSON, invalid data,
 * oversized image) silently degrades to the baseline, never to an error state.
 */
/** Published package name; the CDN URLs below are derived from it. */
export declare const PACKAGE_NAME = "dsh-featherhunter-plugin-base";
/** One manifest request may take at most 1.5s; there are no retries inside a load. */
export declare const MANIFEST_TIMEOUT_MS = 1500;
/**
 * QR images get a much longer window than the manifest. A cold TLS handshake
 * to a CDN measured 2.0s on the maintainer network, and a missing code is
 * user-visible while a slow manifest only delays the background refresh.
 */
export declare const CONTENT_IMAGE_TIMEOUT_MS = 6000;
/** A successful manifest is reused for 30 minutes. */
export declare const MANIFEST_CACHE_TTL_MS: number;
/**
 * A failed manifest fetch is only remembered for a minute, so reopening the
 * dialog retries instead of losing the remote cards for half an hour.
 */
export declare const MANIFEST_FAILURE_TTL_MS: number;
/** Hard cap for a single QR image, enforced before it is shown. */
export declare const MAX_IMAGE_BYTES: number;
/**
 * Hard cap for the manifest document itself. The size check runs before
 * JSON.parse so a hostile or broken CDN response cannot freeze the page; a
 * manifest that large is treated like any other transport failure (fall
 * through to the next channel, then to the bundled baseline).
 */
export declare const MAX_MANIFEST_BYTES: number;
/** The only hosts the client is allowed to talk to (images and manifest). */
export declare const ALLOWED_CDN_HOSTS: readonly string[];
/** Minimal structural view of a fetch Response; easy to fake in tests. */
export interface FetchResponseLike {
    ok: boolean;
    status: number;
    headers: {
        get(name: string): string | null;
    };
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
}
export type FetchLike = (url: string, init?: {
    signal?: AbortSignal;
    cache?: string;
    credentials?: string;
}) => Promise<FetchResponseLike>;
/** A loaded and validated manifest plus the QR images prefetched for it. */
export interface LoadedContent {
    manifest: Manifest;
    /** Channel name that produced the manifest ("unpkg" / "npmmirror" / ...). */
    source: string;
    /** Timestamp (loader clock) at which the manifest was accepted. */
    fetchedAt: number;
    /** Prefetched QR images keyed by "<version>/<path>", values are data URIs. */
    images: Map<string, string>;
}
/** Context handed to a channel loader. */
export interface ChannelContext {
    packageName: string;
    fetchText: (url: string) => Promise<string>;
    fetchJson: (url: string) => Promise<unknown>;
}
/** One CDN channel; the channels are tried in array order. */
export interface ManifestChannel {
    name: string;
    load: (context: ChannelContext) => Promise<{
        raw: unknown;
        url: string;
    }>;
}
export interface ContentLoaderOptions {
    /** Explicit manifest URL; when set, the default CDN channels are not used. */
    manifestUrl?: string;
    packageName?: string;
    fetchImpl?: FetchLike;
    /** Window for one manifest request (default 1.5s). */
    timeoutMs?: number;
    /** Window for one QR image request (default 6s). */
    imageTimeoutMs?: number;
    /** How long a completely failed load is remembered (default 60s). */
    failureTtlMs?: number;
    maxImageBytes?: number;
    /** Clock override (testing seam). */
    now?: () => number;
    /** Channel override (testing seam). */
    channels?: ManifestChannel[];
}
/** True for https URLs only. */
export declare function isHttpsUrl(value: string): boolean;
/** True when the URL is https and its host is on the CDN allowlist. */
export declare function isAllowedCdnUrl(value: string): boolean;
/** Exact-version QR image URLs, primary jsDelivr then the npmmirror mirror. */
export declare function imageUrls(version: string, path: string, packageName?: string): string[];
/** The three published channels, in fallback order. */
export declare function defaultChannels(packageName?: string): ManifestChannel[];
/**
 * Validate a remote manifest beyond what parseManifest checks: length limits
 * for user-visible text, a sane version, safe image paths and https links.
 * Throws an Error whose message starts with "manifest: ".
 */
export declare function validateRemoteManifest(raw: unknown): Manifest;
/** Drop the module cache; tests use this, production never needs it. */
export declare function resetContentCache(): void;
export declare class ContentLoader {
    readonly packageName: string;
    readonly timeoutMs: number;
    readonly imageTimeoutMs: number;
    readonly failureTtlMs: number;
    readonly maxImageBytes: number;
    private readonly fetchImpl;
    private readonly now;
    private readonly channels;
    constructor(options?: ContentLoaderOptions);
    /** Success lives 30 minutes; a hard failure only 60 seconds. */
    private ttlFor;
    /** Cached result while it is still inside its own window. */
    getCached(): LoadedContent | null;
    /**
     * Fetch and validate the manifest once per window; concurrent callers share
     * one request. Resolves to null when every channel failed, and that empty
     * result is only kept for a minute so the next open can retry.
     */
    load(): Promise<LoadedContent | null>;
    /** Prefetch every remote QR image of a manifest (best effort). */
    ensureImages(content: LoadedContent): Promise<void>;
    /** Data URI for a remote QR path, or null when it is not prefetched. */
    imageFor(content: LoadedContent | null, path: string): string | null;
    /** Warm the cache: manifest plus images. Never rejects. */
    preload(): Promise<void>;
    private loadImage;
    private fetchImage;
    private fetchContent;
    private fetchText;
    /** One request with its own abort window; the timer is always cleared. */
    private request;
}
/** Build a loader bound to the published package (or a custom manifest URL). */
export declare function createContentLoader(options?: ContentLoaderOptions): ContentLoader;
