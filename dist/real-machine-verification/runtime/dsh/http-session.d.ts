/**
 * Talking to a running instance over its local HTTP API.
 *
 * The access URL carries a one-time token. Two calls follow it:
 *
 * 1. `GET /connect?token=...` (no extra parameters) answers `302` plus a
 *    `dsh-auth-...` session cookie. The token alone is not a session; without the
 *    cookie every later call is rejected. This was verified against a real
 *    instance: the connect route rejects unknown query parameters.
 * 2. `POST /api/<endpoint>` with a `client-request` envelope is the *single*
 *    channel the web client uses to invoke host RPCs; an endpoint may contain a
 *    slash (`pluginInventory/list`). The payload must be exactly one plain
 *    object under `args` — sending the object as the payload itself makes the
 *    gateway answer HTTP 200 with `result.ok = false` and
 *    `"Remote payload must contain exactly one plain-object args field"`.
 *
 * The endpoint names are host-defined and may move between releases, so this
 * module is deliberately thin: callers name the endpoints they need; when one is
 * missing, the caller reports `blocked` with the endpoint in the hint rather
 * than guessing.
 */
import type { ClockPort, HttpPort, HttpResponse } from "../../contracts/ports";
import { type ReadyUrl } from "../../contracts/launch-plan";
import { type Result } from "../../contracts/result";
/** One row of `pluginInventory/list`: a host entry and its fiber lifecycle state. */
export interface InventoryEntry {
    readonly entryId: string;
    readonly moduleName: string | null;
    readonly enabled: boolean;
    /** `null` for disabled entries (they have no fiber); a string once one exists. */
    readonly fiberPhase: string | null;
}
/** An enabled entry whose fiber is not `active` — the reason an instance is not ready. */
export interface InventoryOffender {
    readonly entryId: string;
    readonly fiberPhase: string | null;
}
/** The ready criterion derived from `pluginInventory/list`. */
export interface InventoryReadiness {
    readonly entryCount: number;
    readonly enabledCount: number;
    readonly activeCount: number;
    readonly offenders: readonly InventoryOffender[];
    /** Every enabled entry is active, and the inventory is not empty. */
    readonly allReady: boolean;
    readonly managementAvailable: boolean | null;
}
export interface HostSession {
    readonly origin: string;
    readonly token: string;
    /** HTTP status of the connect handshake (302 on a real host), for readiness evidence. */
    readonly status: number;
    /** Session cookie header (`name=value` pairs joined with `; `). */
    readonly cookie: string;
    /** GET a path on the instance; the caller decides which status means what. */
    get(path: string, options?: {
        readonly timeoutMs?: number;
    }): Promise<Result<HttpResponse>>;
    /**
     * Invoke one host RPC. `args` becomes the single `args` field of the payload;
     * the value of `result.value` is returned on success.
     */
    call(endpoint: string, args?: Readonly<Record<string, unknown>>, options?: {
        readonly timeoutMs?: number;
    }): Promise<Result<unknown>>;
}
export interface ConnectHostOptions {
    readonly http: HttpPort;
    readonly clock: ClockPort;
    readonly ready: ReadyUrl;
    readonly timeoutMs?: number;
}
/** Join every `set-cookie` pair into one `Cookie` header (attributes dropped). */
export declare function cookieHeaderFrom(response: HttpResponse): string;
/**
 * Exchange the token for a session cookie.
 *
 * A 401/403 here is a *prerequisite* failure, not a bug: the token was rejected,
 * which normally means the instance was restarted or the URL came from a stale
 * `instance.json`.
 */
export declare function connectHost(options: ConnectHostOptions): Promise<Result<HostSession>>;
/**
 * Ask the running host which entries it loaded and whether every enabled one has
 * finished activating. This is the structural half of the readiness criterion:
 * the token URL proves the process printed a line, the inventory proves the
 * plugin loader actually finished.
 */
export declare function pluginInventoryReadiness(session: Pick<HostSession, "call">): Promise<Result<InventoryReadiness>>;
/**
 * Wait until the web server answers a plain page request.
 *
 * The readiness line proves the process printed a URL; this proves the server is
 * accepting requests. They are different claims, and a run that reports "the
 * instance is reachable" should mean the second one.
 */
export declare function waitForOrigin(http: HttpPort, clock: ClockPort, ready: ReadyUrl, options?: {
    readonly timeoutMs?: number;
    readonly pollMs?: number;
}): Promise<Result<{
    readonly status: number;
    readonly elapsedMs: number;
}>>;
