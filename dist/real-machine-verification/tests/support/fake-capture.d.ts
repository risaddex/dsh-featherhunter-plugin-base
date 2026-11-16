import type { CliIo } from "../../cli/io";
export interface CapturedIo {
    readonly io: CliIo;
    stdout(): string;
    stderr(): string;
    combined(): string;
    lines(): string[];
}
export declare function captureIo(): CapturedIo;
