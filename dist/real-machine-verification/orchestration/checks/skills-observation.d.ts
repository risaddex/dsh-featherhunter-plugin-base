/**
 * Skill observation: turn the host's file-tree roots and the package's shipped
 * directory into a registry-shaped observation.
 *
 * Why the file tree and not skills/list or a model-facing catalog: the host
 * hides skills marked disable-model-invocation: true from the model, so a
 * count taken from that surface is wrong for most published plugins. The
 * registry the host builds is (a) the package's bundled skill directory and
 * (b) the per-user/per-project root table - both observable read-only as a tree
 * of <name>/SKILL.md directories and flat <name>.md files, with the
 * skill's own frontmatter name deciding registration. Everything here is a
 * batch of small, testable functions; the check composes them.
 */
import type { FsPort } from "../../contracts/ports";
import { type Result } from "../../contracts/result";
import type { ShippedSkill, SkillObservation } from "../../contracts/skills-rules";
/** One discoverable host root and the registry rank the host gives it. */
export interface SkillRootSpec {
    readonly source: string;
    readonly rank: number;
    /** Absolute path, or null for a root that cannot be observed read-only. */
    readonly path: string | null;
    readonly note: string | null;
}
/** Inputs for the root table. Paths are absolute; the port resolves them. */
export interface SkillRootInput {
    readonly cwd: string;
    readonly dshHome: string;
    readonly homeDir: string;
    /** DSH_AGENTS_HOME, when the environment sets it. */
    readonly agentsHome?: string | undefined;
    /** DSH_BUNDLED_SKILL_DIR, when the environment sets it. */
    readonly bundledSkillDir?: string | undefined;
}
/** One root after a best-effort read. A root that does not exist is data, not an error. */
export interface SkillRootObservation {
    readonly source: string;
    readonly rank: number;
    readonly path: string | null;
    readonly exists: boolean;
    /** Registered names (frontmatter name equal to the entry name). */
    readonly count: number;
    readonly names: readonly string[];
    /** Entries the host would silently skip, recorded only as notes. */
    readonly problems: readonly string[];
    readonly note: string | null;
}
/**
 * The host's project root: the nearest ancestor (including cwd) with a .git
 * entry, falling back to cwd when the checkout is not a git repository.
 */
export declare function findProjectRoot(fs: FsPort, cwd: string): Promise<string>;
/** The six-root table the host uses, lowest rank winning. */
export declare function planSkillRoots(projectRoot: string, input: SkillRootInput): readonly SkillRootSpec[];
/** Public enumeration for root observation: every candidate, kind erased. */
export declare function enumerateSkillDirectory(fs: FsPort, dir: string, options?: {
    readonly skip?: readonly string[];
}): Promise<Result<readonly ShippedSkill[]>>;
/** A file that lives next to the skills but is not one. */
export interface IgnoredSkillFile {
    readonly name: string;
    readonly reason: string;
}
/** What shipped-skill discovery found: the skills plus the docs files it skipped. */
export interface ShippedSkillDiscovery {
    readonly skills: readonly ShippedSkill[];
    /** Flat markdown files without a frontmatter name: the host would not register them. */
    readonly ignored: readonly IgnoredSkillFile[];
}
/**
 * Shipped-skill discovery for the repository and the installed package.
 *
 * The host only registers a flat <name>.md as a skill when its frontmatter has
 * a name; a README.md or LICENSE.md sitting next to the skills is a
 * documentation file, not a skill the host silently drops. Reporting it as a
 * missing name would turn every published package with a README into a false
 * red. The declared count still catches a *removed* skill through
 * compareSkillSets, and directory entries keep the strict missing-name failure.
 */
export declare function discoverShippedSkills(fs: FsPort, dir: string): Promise<Result<ShippedSkillDiscovery>>;
/** Read the host's root table. Missing/unreadable roots are observations, not errors. */
export declare function observeSkillRoots(fs: FsPort, input: SkillRootInput): Promise<readonly SkillRootObservation[]>;
/** Flatten root observations into registry observations (source = root source). */
export declare function skillObservationsFromRoots(roots: readonly SkillRootObservation[]): readonly SkillObservation[];
/** How the installed copy's skill directory was found. */
export type InstalledSkillsResolution = "declared-path" | "basename-at-package-root" | "missing";
/** Result of looking for the skills directory inside the installed package. */
export interface InstalledSkillsLookup {
    readonly path: string | null;
    readonly resolution: InstalledSkillsResolution;
    readonly tried: readonly string[];
}
/**
 * Find the shipped skill directory in the installed package.
 *
 * The declared dir is relative to the package root. A package that changes
 * its built layout may keep the directory only under its last segment, so the
 * basename at the package root is tried second. Which spelling was used is
 * recorded, because "found it somewhere else" is a fact the reader needs.
 */
export declare function findInstalledSkillsDir(fs: FsPort, packageDir: string, dir: string): Promise<InstalledSkillsLookup>;
/** One name the host registered twice from different sources. */
export interface SkillObservationConflict {
    readonly name: string;
    readonly kept: {
        readonly source: string;
        readonly rank: number | null;
    };
    readonly ignored: readonly {
        readonly source: string;
        readonly rank: number | null;
    }[];
}
/** The merged observation set plus the precedence conflicts it resolved. */
export interface MergedSkillObservations {
    readonly observations: readonly SkillObservation[];
    readonly conflicts: readonly SkillObservationConflict[];
}
/**
 * Merge the installed copy (source bundled, rank 600) with the host roots.
 *
 * Across sources the lowest rank wins, exactly as the host resolves a name held
 * by two providers; the conflict is recorded. Diagonally, duplicates inside
 * one source are kept, so compareSkillSets can report a registry that lists
 * the same name twice - a real defect, not a precedence decision.
 */
export declare function mergeSkillObservations(entries: readonly SkillObservation[]): MergedSkillObservations;
