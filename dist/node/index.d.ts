import { BLOCK_MARKERS } from "./readme-sync";
import type { VerifyResult } from "./types";
export * from "./types";
export * from "./readme-compare";
export * from "./renderers";
export * from "./readme-sync";
export * from "./targets";
export * from "./doctor";
/** Check that a rendered block has balanced markers. */
export declare function verifyBlock(block: string, name: keyof typeof BLOCK_MARKERS): VerifyResult;
