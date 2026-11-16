/**
 * A ticket-face adapter with assertions built in.
 *
 * The gate only sees the adapter contract, so a fake at that seam exercises the
 * real rules without a tracker, a network, or a repository. Every method is
 * scripted; tests that care about a failure pass the matching option instead of
 * inventing a second adapter.
 */
import type { CandidateManifest } from "../../contracts/candidate-rules";
import type { ChecklistIssue, TicketComment, TicketFaceAdapter } from "../../contracts/ticket-face";
export interface FakeTicketFaceOptions {
    readonly issues?: readonly ChecklistIssue[];
    readonly comments?: readonly TicketComment[];
    /** Defaults to "" so collection does not compare commits unless a test asks. */
    readonly releaseCommit?: string;
    /** Defaults to true: the happy path needs a decisive answer. */
    readonly ancestry?: boolean | "unknown";
    readonly candidateManifest?: CandidateManifest;
    /** Make one method throw, to prove collection classifies adapter failures. */
    readonly throws?: "issues" | "comments" | "ancestry";
}
/** Build a scripted adapter; arrays are copied so a test can reuse its fixtures. */
export declare function fakeTicketFace(options?: FakeTicketFaceOptions): TicketFaceAdapter;
