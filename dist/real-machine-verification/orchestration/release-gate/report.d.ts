/**
 * Human rendering for the release gate.
 *
 * The check lines reuse the self-check contract (status word, id, detail, then
 * indented comparison lines), so a reader and a log parser need only one
 * format. The footer adds what is specific to a release: the version, the
 * candidate, the checklist ticket and the decision with its exit code.
 */
import type { ReleaseGateReport } from "../../contracts/release-gate";
/** Render a release-gate report for a terminal or a CI log. */
export declare function renderReleaseGateHuman(report: ReleaseGateReport): string;
