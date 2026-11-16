/**
 * Profile rules: read and rewrite the two lines of a DSH profile patch file that
 * decide which model an instance uses.
 *
 * The file is YAML, but the rules are *not* a YAML library: this package is
 * allowed `node:` builtins only, and a general YAML round-trip would also destroy
 * the comments a human put there. So the work is split in two:
 *
 * - **read** the specific anchors this capability cares about (the
 *   `agent-default-model` entry and the `llm-pi-ai` provider entry) with a line
 *   scanner that refuses to guess;
 * - **write** by splicing lines into the existing text, so everything else in the
 *   profile survives byte for byte.
 *
 * Two failure modes are treated as hard prerequisites rather than repaired
 * silently: a profile with no `agent-default-model` entry, and one with no
 * `llm-pi-ai` entry. Inventing whole plugin entries would be guessing at a
 * schema this package does not own — better to say so and let the operator
 * install the provider.
 */
import { type Result } from "./result";
import type { ModelSelection } from "./verification-profile";
/** One top-level entry of a patch file: `- id: <id>` and its indented body. */
export interface PatchEntry {
    readonly id: string;
    /** 0-based index of the `- id:` line. */
    readonly startLine: number;
    /** 0-based index one past the last line of the entry. */
    readonly endLine: number;
}
export interface PatchScan {
    readonly lines: readonly string[];
    readonly entries: readonly PatchEntry[];
    readonly eol: "\n" | "\r\n";
    readonly trailingNewline: boolean;
}
export type ModelConfigProblemCode = "missing-default-model-entry" | "missing-provider-entry" | "provider-mismatch" | "model-mismatch" | "api-key-env-mismatch" | "model-not-declared" | "models-empty" | "reference-model-mismatch";
export interface ModelConfigProblem {
    readonly code: ModelConfigProblemCode;
    readonly message: string;
    readonly hint?: string;
    /** The literal the declaration asks for; for CLI rendering, never a secret. */
    readonly expected?: string;
    /** The literal the patch file carries (or a named absence). */
    readonly actual?: string;
    /** Which top-level entry the problem belongs to, when it is entry-specific. */
    readonly entryId?: string;
}
/** One reference party (e.g. vision-router) that names a provider/model pair. */
export interface ModelConfigReference {
    readonly entryId: string;
    readonly provider: string;
    readonly model: string | null;
}
/** What the patch file currently says about the model. */
export interface ModelConfigState {
    readonly configured: boolean;
    readonly defaultProvider: string | null;
    readonly defaultModel: string | null;
    readonly apiKeyEnv: string | null;
    readonly declaredModels: readonly string[];
    readonly references: readonly ModelConfigReference[];
    readonly problems: readonly ModelConfigProblem[];
}
/** Split a patch file into lines plus its top-level entry boundaries. */
export declare function scanPatch(text: string): PatchScan;
/** Read the model-relevant facts out of a patch file. */
export declare function inspectModelConfig(text: string, selection: ModelSelection): ModelConfigState;
export interface ModelConfigEditResult {
    readonly text: string;
    readonly changed: boolean;
    readonly notes: readonly string[];
}
/**
 * Produce text that satisfies `inspectModelConfig`, by editing only the lines
 * that are wrong or missing. Pure: callers own the write.
 */
export declare function planModelConfigEdit(text: string, selection: ModelSelection): Result<ModelConfigEditResult>;
