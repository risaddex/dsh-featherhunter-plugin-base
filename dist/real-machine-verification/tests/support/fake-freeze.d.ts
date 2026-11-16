import type { Ports } from "../../contracts/ports";
import type { VerificationDeclaration } from "../../declaration/loader";
import { FakeClock, FakeEnv, FakeFs } from "./fake-fs";
import { FakeCommand } from "./fake-ports";
/**
 * Write a `.tgz` whose entries have `package/` stripped by the reader. Paths
 * longer than 100 bytes get a PAX `path` record, like GNU tar would emit.
 */
export declare function makeTgz(files: Readonly<Record<string, string | Uint8Array>>): Uint8Array;
export interface FakeFreezeOptions {
    readonly cwd?: string;
    readonly head?: string;
    readonly branch?: string;
    readonly dirtyFiles?: readonly string[];
    readonly packageName?: string;
    readonly version?: string;
    readonly clientEntry?: string;
    readonly buildCommand?: string | null;
    readonly buildTimeoutMs?: number;
    readonly packFiles?: Readonly<Record<string, string | Uint8Array>>;
}
export declare const FIXTURE_HEAD = "0123456789abcdef0123456789abcdef01234567";
export declare class FakeFreezeWorld {
    readonly cwd: string;
    readonly packageName: string;
    readonly version: string;
    readonly clientEntry: string;
    readonly fs: FakeFs;
    readonly env: FakeEnv;
    readonly clock: FakeClock;
    readonly command: FakeCommand;
    readonly ports: Ports;
    readonly declaration: VerificationDeclaration;
    head: string;
    branch: string;
    dirtyFiles: string[];
    packNames: string[];
    packFiles: Readonly<Record<string, string | Uint8Array>>;
    headSequence?: readonly string[];
    dirtySequence?: readonly (readonly string[])[];
    onBuild?: () => void;
    private headReads;
    private statusReads;
    constructor(options?: FakeFreezeOptions);
    private handle;
}
