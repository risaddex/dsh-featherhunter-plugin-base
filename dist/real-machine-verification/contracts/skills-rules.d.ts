/**
 * Skill rules: compare what a package *ships* with what the host actually
 * registered, without falling into the trap that made the old check lie.
 *
 * A plugin may ship N skills; the host registers all N under one provider. The
 * model-facing catalog, however, only lists *model-invocable* skills. A plugin
 * that marks most of its skills `disable-model-invocation: true` therefore shows
 * a much smaller number in a model's tool list, and a check that counts that list
 * reports a false failure — for years, silently.
 *
 * The correct observation is the registry itself (names + source), compared as a
 * set. Everything here is pure: the caller lists directories, reads frontmatter
 * and asks the host; these functions decide whether the set is right.
 */
import { type Result } from "./result";
/** One skill as the host registry reports it. */
export interface SkillObservation {
    readonly name: string;
    /** Where it came from: `bundled`, `project`, `user`, `custom`… Host-defined. */
    readonly source: string;
    /** Provider precedence when the host reports it (lower wins). */
    readonly rank?: number;
    readonly dir?: string;
}
/** What the package claims to ship. */
export interface SkillSetExpectation {
    /** Exact skill names, in any order. */
    readonly names: readonly string[];
    /** Count the package expects. Kept explicit so a wrong list cannot pass silently. */
    readonly expectedCount: number;
}
/** The outcome of comparing an expectation with an observation. */
export interface SkillSetComparison {
    readonly ok: boolean;
    readonly missing: readonly string[];
    readonly extra: readonly string[];
    readonly duplicated: readonly string[];
    readonly observedCount: number;
    readonly expectedCount: number;
    readonly notes: readonly string[];
}
/**
 * A const attached to hints, because this is the single most likely
 * misinterpretation of an otherwise correct run.
 */
export declare const MODEL_CATALOG_CAVEAT = "do not count skills from a model-facing catalog: the host hides skills marked disable-model-invocation";
/**
 * Compare the declared set with the observed registry snapshot.
 *
 * `extra` only lists observed skills from `source === "bundled"`: the host also
 * registers project and user skills, and those are not this plugin's business.
 */
export declare function compareSkillSets(expectation: SkillSetExpectation, observed: readonly SkillObservation[]): Result<SkillSetComparison>;
/** One skill directory as found inside the package. */
export interface ShippedSkill {
    /** Directory name, e.g. `grilling`. */
    readonly dirName: string;
    /** Raw `SKILL.md` content. */
    readonly content: string;
}
/** The names a shipped directory set declares, after checking the frontmatter matches. */
export interface ShippedSkillSet {
    readonly names: readonly string[];
    /** Skills whose frontmatter `name:` disagrees with their directory name. */
    readonly mismatches: readonly {
        readonly dirName: string;
        readonly declared: string | null;
    }[];
    readonly missingFrontmatter: readonly string[];
}
/**
 * Extract `name` from a Markdown file's YAML frontmatter.
 *
 * A deliberately small reader: frontmatter is a `---` fence at the top followed
 * by `key: value` lines. It returns `null` rather than guessing, because a skill
 * with broken frontmatter is skipped by the host *silently* — the exact failure
 * this check exists to catch.
 */
export declare function readFrontmatterName(content: string): string | null;
/**
 * Check every shipped skill's frontmatter against its directory name.
 *
 * The host requires `frontmatter.name === directory name` to register a skill; a
 * mismatch is dropped without an error, so a package can "ship 27 skills" and
 * register 26 with a green build.
 */
export declare function inspectShippedSkills(skills: readonly ShippedSkill[]): Result<ShippedSkillSet>;
/** One sentence describing a failed comparison, for a check's `detail`. */
export declare function describeComparison(comparison: SkillSetComparison): string;
