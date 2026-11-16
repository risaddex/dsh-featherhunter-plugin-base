/**
 * The checklist template shape, as data.
 *
 * The gate must not hard-code the wording of one repository's issue template.
 * A plugin repository declares the headings, columns and vocabulary it uses;
 * the rules in `checklist-rules.ts` consume this declaration. The default is
 * the template this capability ships with, so a repository that adopts the
 * template unchanged needs no configuration.
 */
import { type Result } from "./result";
/** Default title prefix of the release checklist ticket. */
export declare const DEFAULT_CHECKLIST_TITLE_PREFIX = "[\u771F\u673A\u9A8C\u8BC1]";
/** Default placeholder version used before a release checklist exists. */
export declare const DEFAULT_PLACEHOLDER_WORD = "\u4E0B\u4E00\u7248";
export interface ChecklistFormat {
    /** Title prefix, for example `[真机验证]`. */
    readonly titlePrefix: string;
    /** Placeholder version, for example `下一版`. */
    readonly placeholderWord: string;
    /** Heading that opens the scenario overview table. */
    readonly overviewHeading: string;
    /** Expected table columns, in order; rows with fewer cells are malformed. */
    readonly overviewColumns: readonly string[];
    /** Every status word the template allows. */
    readonly statusVocabulary: readonly string[];
    /** Priority for several conclusions in one comment (low to high; highest wins). */
    readonly resultPriority: readonly string[];
    /**
     * What each status word means when the body is tallied. The vocabulary is a
     * list of words; the tally needs semantics, and those must not be hard-coded
     * in Chinese or a translated checklist could never be counted.
     */
    readonly statusRoles: StatusRoles;
    /** Word that opens a batch-start comment, for example 批次开始. */
    readonly batchStartMarker: string;
    /** Pattern that matches one scenario id, for example `1600-01`. */
    readonly scenarioIdPattern: RegExp;
    /** Heading of the batch-record section in the ticket body. */
    readonly batchHeading: string;
    /** Heading of the candidate-versus-release audit section. */
    readonly auditHeading: string;
}
/** The documented template, unchanged. */
/** Semantic roles of the status vocabulary, so the tally is language-agnostic. */
export interface StatusRoles {
    /** Words that count as a pass (an already-verified scenario counts as a pass). */
    readonly passed: readonly string[];
    /** Words that count as a failure. */
    readonly failed: readonly string[];
    /** Words that count as an accepted exemption. */
    readonly exempt: readonly string[];
    /** Words whose row must be shown to come from a comment result. */
    readonly needsComment: readonly string[];
}
/** Roles of the shipped Chinese vocabulary. */
export declare const DEFAULT_STATUS_ROLES: StatusRoles;
/** Word that opens a batch-start comment in the shipped template. */
export declare const DEFAULT_BATCH_START_MARKER = "\u6279\u6B21\u5F00\u59CB";
export declare const DEFAULT_CHECKLIST_FORMAT: ChecklistFormat;
/**
 * Validate a declared format and freeze it.
 *
 * The pattern is kept as declared (the rules clone it when they need a global
 * matcher); rejecting a non-RegExp here keeps every later parse total.
 */
export declare function parseChecklistFormat(input: unknown): Result<ChecklistFormat>;
/** Clone the id pattern with global matching; flags `g`/`y` are replaced. */
export declare function scenarioIdMatcher(format: ChecklistFormat, anchored: boolean): RegExp;
