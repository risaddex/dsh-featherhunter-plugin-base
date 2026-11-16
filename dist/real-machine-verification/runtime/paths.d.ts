/**
 * Path helpers for the runtime half.
 *
 * `node:path` is available here, but these helpers stay free of it on purpose:
 * plans, digests and reports are compared across machines, so every path this
 * tool writes down must use one spelling. Keeping joining and splitting in one
 * place means a Windows run and a Linux CI run produce comparable artifacts.
 */
/** Normalize every separator to `/`, which is the spelling used inside artifacts. */
export declare function toPosixPath(value: string): string;
/** Segment list without the root marker; `C:/a/b` → `["C:", "a", "b"]`. */
export declare function pathSegments(value: string): readonly string[];
export declare function baseName(value: string): string;
/** `null` for a drive root such as `C:/` or for `/`. */
export declare function parentPath(value: string): string | null;
/**
 * Parent path for walking the file system, preserving the separator style of
 * the input; `null` at a drive root such as `C:/` or `/`.
 *
 * `parentPath` normalizes to `/` because artifacts are compared across
 * machines; that is the wrong spelling for an `fs.exists` walk (`C:/repo` must
 * yield `C:/`, not `C:`). This helper keeps the input style so the walk can
 * hand every result straight back to the file-system port.
 */
export declare function parentFsPath(value: string): string | null;
/** How many segments a path has; used by the delete guard, never by business rules. */
export declare function depthOf(value: string): number;
export declare function isWindowsAbsolute(value: string): boolean;
export declare function isPosixAbsolute(value: string): boolean;
/**
 * Join path fragments, keeping the separator style of the first fragment.
 * An empty tail segment is dropped instead of producing `a//b`.
 */
export declare function joinFsPath(...segments: readonly string[]): string;
/**
 * True when two paths name the same location as far as a Windows user would
 * agree. Case-insensitive when either side looks like a Windows path, because
 * `C:\Users\X` and `c:\users\x` are the same directory there.
 */
export declare function samePath(a: string, b: string): boolean;
/**
 * True when `child` is `parent` itself or below it. Sibling directories that
 * merely share a prefix (`/work/batch` vs `/work/batch-2`) must not match.
 */
export declare function isInsidePath(child: string, parent: string): boolean;
/** Resolve `target` against `base` when it is relative; returns an absolute spelling. */
export declare function resolveAgainst(base: string, target: string): string;
/** `/` or `\` depending on the style of the path itself. */
export declare function separatorOf(value: string): "/" | "\\";
