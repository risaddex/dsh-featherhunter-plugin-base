export type RealPathResolver = (path: string) => string;
/**
 * True when the module at `moduleUrl` was started as the process entry point.
 *
 * @param argv1 `process.argv[1]` of the running process (may be undefined).
 * @param moduleUrl `import.meta.url` of the module that owns the entry guard.
 * @param resolveRealPath injectable for tests; defaults to `fs.realpathSync`.
 */
export declare function isCliEntryPoint(argv1: string | undefined, moduleUrl: string, resolveRealPath?: RealPathResolver): boolean;
