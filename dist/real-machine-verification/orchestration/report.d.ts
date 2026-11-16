/**
 * Report writing and the human rendering contract.
 *
 * `run.json` is the durable artifact: the same `RunReport` the JSON mode prints,
 * written before anything is printed so a crashed stdout cannot lose the report.
 * Its sha256 goes next to it (and is echoed in the human tail), which lets a
 * reviewer answer "is this the report I was shown?" with one command.
 *
 * The human line format is part of the CLI contract:
 *
 * ```text
 * ok dsh-runtime found the DSH install at ...
 * fail node-version Node v20.0.0 is older than the required 22.6.0
 *   expected: Node 22.6.0 or newer
 *   actual:   Node v20.0.0
 *   hint:     upgrade Node ...
 * ```
 *
 * A `fail` or `blocked` line is followed by indented comparison lines; nothing
 * else may appear between check lines. The tail names the report, its sha256 and
 * the evidence directory so a reader can leave the terminal and verify.
 */
import type { CheckResult } from "../contracts/check";
import type { FsPort } from "../contracts/ports";
import { type Result } from "../contracts/result";
import { type RunReport } from "../contracts/run-state";
/** What the tail of a human report needs to be verifiable off-line. */
export interface HumanReportTail {
    readonly reportPath: string;
    readonly reportSha256: string;
    readonly evidenceDir: string;
    readonly evidenceCount: number;
}
/**
 * Render one check and its comparison lines.
 *
 * Exported separately because the CLI's line format is asserted on its own: a
 * check line and its indented details are one unit, and a reader (or a regex)
 * should be able to parse them without the rest of the output.
 */
export declare function renderCheckLines(check: CheckResult): readonly string[];
/** Human-mode stdout: one block per check, then the verifiable tail. */
export declare function renderSelfCheckHuman(report: RunReport, tail?: HumanReportTail): string;
/** The durable pieces produced by writing a report. */
export interface WrittenRunReport {
    readonly reportPath: string;
    readonly reportSha256: string;
    readonly evidenceDir: string;
    /** Exact bytes written to `run.json`; the hash above is over these. */
    readonly content: string;
}
export interface WriteRunReportOptions {
    readonly fs: FsPort;
    readonly runDir: string;
    readonly report: RunReport;
}
/**
 * Write `run.json` and `run.json.sha256`.
 *
 * The hash is computed over exactly the bytes written, in the `sha256sum` format
 * (`<hex>  run.json`), so `sha256sum -c run.json.sha256` works without this tool.
 */
export declare function writeRunReport(options: WriteRunReportOptions): Promise<Result<WrittenRunReport>>;
/**
 * Add the digest to the in-memory report that is printed.
 *
 * `run.json` cannot contain its own hash, so the printed report carries the
 * digest of the file that was just written; a verifier hashes the file and
 * compares. This keeps the file and the printed claim linked without a
 * self-referential document.
 */
export declare function withReportDigest(report: RunReport, written: WrittenRunReport): RunReport;
