/**
 * The HTTP port: the global `fetch` narrowed to what a check needs.
 *
 * The response is returned even for 4xx/5xx — a 500 is an observation about the
 * product, not a transport failure. `err` is reserved for "no response at all".
 * Redirects are not followed by default: a token redirect is a signal worth
 * recording, not a detour worth taking silently.
 */
import type { HttpPort } from "../../contracts/ports";
export declare function createHttpPort(): HttpPort;
