/**
 * `dsh-verify evidence` — attach evidence to a batch, archive a batch, or
 * verify an archive.
 *
 * The command is deliberately thin: copying, manifest merging, checksum
 * rendering and archive verification all live in `evidence/`, are injected with
 * ports, and are tested without a machine. What is here is the CLI contract —
 * which flags each subcommand accepts, how a batch directory is located, the two
 * output modes and the exit-code mapping (0 ok, 1 hard failure, 2 prerequisite).
 *
 * Two decisions worth calling out:
 *
 * - The candidate identity is never read from argv. It arrives in the injected
 *   batch context (the batch record, ticket 09); `buildEvidenceManifest` writes
 *   it last and skips reserved keys from `extra`, so no flag can shadow it.
 * - When no batch context is injected, `--dir` or `--name` locate the batch for
 *   manual use. That fallback exists for humans and tests, not for the runner,
 *   which always injects the batch it just created.
 *
 * Output contract: with `--json`, stdout carries exactly one JSON document and
 * everything else goes to stderr; without it, stdout carries the human result
 * lines. `verify` reports archive disagreements as `ok:false` in the same JSON
 * shape as a successful verification (plus `issues`), and exits 1.
 */
import type { Ports } from "../../contracts/ports";
import { type Failure, type Result } from "../../contracts/result";
import type { ParsedArgs } from "../args";
import type { CliIo } from "../io";
/** The usage line, repeated in errors so a caller never has to read `describe`. */
export declare const EVIDENCE_USAGE = "dsh-verify evidence add|archive|verify [--file <p>]... [--check <id>=pass|fail] [--archive-root <dir>] [--dir <batch-or-archive-dir>] [--name <batch-name>] [--work-root <dir>] [--json] [--dry-run]";
/**
 * Batch context injected by the command layer.
 *
 * `candidate` is the identity binding from the batch record; it is the only
 * source for `evidence.json.candidate`. CLI flags cannot provide it.
 */
export interface EvidenceBatchContext {
    readonly batchName: string;
    readonly batchDir: string;
    readonly workRoot?: string;
    readonly candidate?: Readonly<Record<string, unknown>>;
    readonly meta?: Readonly<Record<string, string>>;
    readonly summary?: Readonly<Record<string, unknown>>;
    readonly extra?: Readonly<Record<string, unknown>>;
}
/** Everything the command needs injected; the CLI wires the real machine. */
export interface EvidenceCommandDeps {
    readonly ports: Ports;
    readonly io: CliIo;
    readonly batch?: EvidenceBatchContext;
    /**
     * Resolve `--batch` / `--name` into the identity-bearing batch context.
     *
     * The CLI wires this to the batch layer so a named batch that has no record or
     * no frozen candidate is a blocked prerequisite instead of an evidence package
     * that can never be bound. Injected context still wins; no name means `null`
     * and the command keeps its own default.
     */
    readonly loadBatch?: (args: ParsedArgs) => Promise<Result<EvidenceBatchContext | null, Failure>>;
}
/** Run one `evidence` invocation and return its exit code. */
export declare function runEvidenceCommand(args: ParsedArgs, deps: EvidenceCommandDeps): Promise<number>;
