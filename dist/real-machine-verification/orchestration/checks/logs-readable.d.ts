import type { Ports } from "../../contracts/ports";
import type { VerificationProfile } from "../../contracts/verification-profile";
import type { EvidenceStore } from "../../evidence/store";
import type { InstanceRecord } from "../../runtime/dsh/launch";
import { type CheckModule } from "../types";
/** What `logs-readable` needs; the single-instance command supplies the rest. */
export interface SingleInstanceCheckContext {
    readonly ports: Ports;
    readonly profile: VerificationProfile;
    readonly instance: InstanceRecord;
    readonly evidence: EvidenceStore;
    /** Progress/warning sink; never stdout in JSON mode. */
    readonly note: (message: string) => void;
}
/** Build the check module; the command decides when it runs. */
export declare function createLogsReadableCheck(): CheckModule<SingleInstanceCheckContext>;
