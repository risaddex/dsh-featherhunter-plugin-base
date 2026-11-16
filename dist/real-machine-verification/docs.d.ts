/**
 * Markdown projection of the capability description.
 *
 * The description is data so that `--help`, `describe` and the shipped markdown
 * (README.md / AGENTS-USAGE.md) can be *generated* from it instead of transcribed
 * next to it. This module owns only that projection; composing the sections into
 * the final documents belongs to the documentation ticket.
 */
import { type CapabilityDescription } from "./capability-description";
/**
 * Render the capability's reference section as markdown.
 *
 * Deterministic by construction: every line is derived from the argument, so the
 * same description always produces the same bytes (a useful property for a future
 * "docs are in sync" check).
 */
export declare function renderCapabilityMarkdown(description?: CapabilityDescription): string;
