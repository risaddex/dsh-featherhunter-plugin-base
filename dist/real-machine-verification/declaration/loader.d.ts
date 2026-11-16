import type { FsPort } from "../contracts/ports";
import { type Failure, type Result } from "../contracts/result";
import { type VerificationProfile } from "../contracts/verification-profile";
/** How the declaration is spelled on disk; decides the Node floor. */
export type DeclarationKind = "ts" | "js";
/** First Node with native TypeScript type stripping (flag-gated until 22.18). */
export declare const NODE_MIN_FOR_TYPESCRIPT = "22.6.0";
/** Floor inherited from the package's own engines field. */
export declare const NODE_MIN_FOR_JAVASCRIPT = "18.0.0";
/** The file the tool looks for when no `--declaration` is given. */
export declare const DECLARATION_RELATIVE_PATH = "verify/profile.ts";
export declare const DECLARATION_TEMPLATE: string;
/** A declaration that loaded and validated. */
export interface VerificationDeclaration {
    /** Absolute path of the file that was imported. */
    readonly path: string;
    readonly kind: DeclarationKind;
    /** Which export supplied the value (`default` or a named export). */
    readonly exportName: string;
    readonly profile: VerificationProfile;
    /** Node floor implied by the file kind, already known to be satisfied. */
    readonly requiredNode: string;
}
/**
 * A declaration failure, classified.
 *
 * `blocked` means the run proves nothing (no declaration, or a runtime too old to
 * read it); `failed` means the declaration is wrong and the plugin author must
 * fix it. The distinction is the same one the exit codes expose.
 */
export type DeclarationFailure = Failure & {
    readonly kind: "blocked" | "failed";
};
/** Import one module specifier. Injectable so tests need no real files. */
export type DeclarationImport = (specifier: string) => Promise<unknown>;
export interface LoadDeclarationOptions {
    readonly fs: FsPort;
    /** Repository root the declaration is discovered under. */
    readonly cwd: string;
    /** Running Node version, e.g. `v24.19.0`; decides whether `.ts` is importable. */
    readonly nodeVersion: string;
    /** Explicit `--declaration` path; relative paths resolve against `cwd`. */
    readonly declarationPath?: string;
    /** Defaults to a native dynamic import; tests inject their own. */
    readonly importModule?: DeclarationImport;
}
export type DeclarationLoadResult = Result<VerificationDeclaration, DeclarationFailure>;
/** Strip a leading `v` and parse the numeric triple; missing parts count as 0. */
export declare function parseNodeVersion(value: string): readonly [number, number, number];
/** Negative when `left` is older, positive when newer, 0 when equal. */
export declare function compareNodeVersions(left: string, right: string): number;
/** True when `current` satisfies `minimum`. */
export declare function meetsNodeVersion(current: string, minimum: string): boolean;
/** Infer the declaration kind from its extension; `null` when unrecognized. */
export declare function declarationKindFor(path: string): DeclarationKind | null;
/** The Node floor for a declaration kind. */
export declare function nodeRequirementFor(kind: DeclarationKind): string;
/** The hint shown whenever there is no declaration to load. */
export declare function missingDeclarationHint(): string;
/**
 * Discover, import and validate the declaration.
 *
 * Returns `blocked` for a missing declaration or an unimportable file kind, and
 * `failed` for a declaration whose content is wrong. The profile comes back
 * frozen and normalized, so no caller has to second-guess optional fields.
 */
export declare function loadVerificationDeclaration(options: LoadDeclarationOptions): Promise<DeclarationLoadResult>;
