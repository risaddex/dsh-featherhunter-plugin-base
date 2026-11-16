/**
 * Credential-store observation: which reference *names* a store lists.
 *
 * The host keeps credential references in <DSH_HOME>/.credentials.yaml: a
 * plain-text store whose top-level "refs:" block maps each reference name
 * (an environment-variable-shaped name) to a value. This module reads that file
 * only far enough to answer "is this reference listed?" - it never returns,
 * logs, or hands on a value. A report that says "the reference resolves" is
 * enough to explain a run; a report that quotes the secret is a leak.
 *
 * The scanner is a pure function over text so tests can feed it LF/CRLF, a
 * missing block, comments and malformed input without touching a real home.
 */
import type { FsPort } from "../../contracts/ports";
/** Reference names read out of a store's top-level refs block. */
export interface CredentialRefScan {
    /** Names only, in file order, without duplicates. Never the values. */
    readonly refs: readonly string[];
    /** Why the text does not look like a credential store; never the text itself. */
    readonly note: string | null;
}
/**
 * Extract the reference names from a credential store's refs block.
 *
 * Only direct children of the top-level block are names: a nested mapping under
 * a reference belongs to its value and must never be mistaken for a name. The
 * function is total - malformed input returns an empty list with a note rather
 * than throwing.
 */
export declare function scanCredentialRefs(text: string): CredentialRefScan;
/** What one credential store said about one reference name. */
export interface CredentialStoreObservation {
    readonly path: string;
    /** The file could be read and parsed as a store. */
    readonly readable: boolean;
    readonly refPresent: boolean;
    /** How many names the store lists; never the names of unrelated refs. */
    readonly refCount: number;
    /** Why the store is unreadable or unusable; never file content. */
    readonly note: string | null;
}
/** Read one store and report whether it lists ref; values are never read out. */
export declare function probeCredentialStore(fs: FsPort, path: string, ref: string): Promise<CredentialStoreObservation>;
/** The real home's credential store: <DSH_HOME>/.credentials.yaml. */
export declare function credentialStorePath(dshHome: string): string;
