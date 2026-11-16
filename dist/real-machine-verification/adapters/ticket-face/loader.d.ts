import type { FsPort } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
import { type TicketFaceAdapter, type TicketFaceDeclaration } from "../../contracts/ticket-face";
/** Import one module specifier. Injectable so tests need no real files. */
export type TicketFaceImport = (specifier: string) => Promise<unknown>;
/** A loaded adapter plus enough provenance for a report to cite it. */
export interface LoadedTicketFaceAdapter {
    readonly adapter: TicketFaceAdapter;
    /** The specifier handed to import(): a file URL or a package name. */
    readonly specifier: string;
    /** The declared module value, unchanged. */
    readonly module: string;
    /** "default" or the named export that supplied the adapter. */
    readonly exportName: string;
}
/**
 * A ticket-face adapter failure, classified.
 *
 * `blocked` means the repository cannot provide the adapter (missing module,
 * unsupported runtime); `failed` means the module loaded but does not export
 * the promised shape. Both leave the product unobserved, so the gate turns
 * either into a blocked check.
 */
export type TicketFaceAdapterFailure = Failure & {
    readonly kind: "blocked" | "failed";
};
export type TicketFaceAdapterLoadResult = Result<LoadedTicketFaceAdapter, TicketFaceAdapterFailure>;
export interface LoadTicketFaceAdapterOptions {
    readonly fs: FsPort;
    /** Plugin repository root; relative modules resolve against it. */
    readonly repoRoot: string;
    readonly declaration: TicketFaceDeclaration;
    /** Defaults to a native dynamic import; tests inject their own. */
    readonly importModule?: TicketFaceImport;
}
/**
 * Copy-paste adapter skeleton.
 *
 * Deliberately protocol-neutral: the repository may talk to a remote API, shell
 * out to gh, or read markdown files, and this capability must not choose one.
 */
export declare const TICKET_FACE_ADAPTER_TEMPLATE = "// verify/ticket-face.mjs \u2014 the adapter the release gate imports.\n// Declare it in verify/profile.ts as:\n//   ticketFace: { module: \"verify/ticket-face.mjs\" }\nexport default {\n  kind: \"github\",\n  async listChecklistIssues() {\n    return []; // [{ number, title, state, body, url? }]\n  },\n  async listComments(issueNumber) {\n    return []; // [{ body, createdAt? }] oldest first\n  },\n  async resolveReleaseCommit() {\n    return \"\"; // the 40-hex release commit, or \"\" when it cannot be resolved\n  },\n  async isAncestor(commit, descendant) {\n    return \"unknown\"; // true / false / \"unknown\" \u2014 never false when Git cannot answer\n  },\n};\n";
/**
 * The sentence a blocked release check shows. It must be enough for a reader to
 * adopt the adapter without opening the source.
 */
export declare function missingTicketFaceHint(): string;
/**
 * Import the declared adapter and prove it has the promised shape.
 *
 * Nothing is fetched here: loading must stay side-effect free, so a plan or a
 * dry run can tell whether an adapter exists without touching the tracker.
 */
export declare function loadTicketFaceAdapter(options: LoadTicketFaceAdapterOptions): Promise<TicketFaceAdapterLoadResult>;
