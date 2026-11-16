/**
 * The `Result` type used on every boundary of this capability.
 *
 * Machine verification fails for reasons that are *not* exceptions: a candidate
 * file was tampered with, an adapter is missing, a timeout elapsed. Throwing
 * turns all of those into one indistinguishable stack trace, so every layer
 * returns `Result` and only the CLI converts a failure into a process exit code.
 */
/** Why an operation could not produce a value. Stable strings, safe to switch on. */
export type FailureCode = "invalid-input" | "prerequisite" | "identity-mismatch" | "not-found" | "io" | "timeout" | "conflict" | "unsupported" | "internal";
/** A machine-readable failure. `hint` is the sentence a human needs to act on. */
export interface Failure {
    readonly code: FailureCode;
    /** What went wrong, in one sentence. */
    readonly message: string;
    /** What to do about it. Optional only when the message already says it. */
    readonly hint?: string;
    /** Structured context for `--json` consumers (never contains secret values). */
    readonly details?: Readonly<Record<string, unknown>>;
}
/** Success or failure, always explicit. */
export type Result<TValue, TFailure = Failure> = {
    readonly ok: true;
    readonly value: TValue;
} | {
    readonly ok: false;
    readonly error: TFailure;
};
/** Wrap a success. */
export declare function ok<TValue>(value: TValue): Result<TValue, never>;
/** Wrap a failure. */
export declare function err<TFailure>(error: TFailure): Result<never, TFailure>;
/** Build a `Failure` without repeating the object shape at every call site. */
export declare function failure(code: FailureCode, message: string, hint?: string, details?: Readonly<Record<string, unknown>>): Failure;
/** Type guard for the success branch. */
export declare function isOk<TValue, TFailure>(result: Result<TValue, TFailure>): result is {
    readonly ok: true;
    readonly value: TValue;
};
/** Type guard for the failure branch. */
export declare function isErr<TValue, TFailure>(result: Result<TValue, TFailure>): result is {
    readonly ok: false;
    readonly error: TFailure;
};
/** Map the success value, leaving a failure untouched. */
export declare function mapOk<TValue, TNext, TFailure>(result: Result<TValue, TFailure>, map: (value: TValue) => TNext): Result<TNext, TFailure>;
/** Map the failure, leaving a success untouched. */
export declare function mapErr<TValue, TFailure, TNextFailure>(result: Result<TValue, TFailure>, map: (error: TFailure) => TNextFailure): Result<TValue, TNextFailure>;
/** Unwrap for call sites (CLI, tests) where a failure really is fatal. */
export declare function unwrapOrThrow<TValue, TFailure>(result: Result<TValue, TFailure>, describeFailure: (error: TFailure) => string): TValue;
/** Render a failure as one line for stderr. */
export declare function formatFailure(error: Failure): string;
