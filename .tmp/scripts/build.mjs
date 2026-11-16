// scripts/build.ts
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// scripts/bundle-contract.ts
function externalSpecifiers(source) {
  const specifiers = /* @__PURE__ */ new Set();
  for (const match of source.matchAll(/\bfrom\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier !== void 0) specifiers.add(specifier);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier !== void 0) specifiers.add(specifier);
  }
  return [...specifiers].filter((specifier) => !specifier.startsWith("."));
}
var SELF_CONTAINED_RULES = [
  ["static import", /(^|\n)\s*import\b/],
  ["require()", /\brequire\s*\(/],
  ["dynamic import()", /\bimport\s*\(/]
];
function checkBundleContract(id, source, contract) {
  if (contract === "self-contained") {
    return SELF_CONTAINED_RULES.filter(([, pattern]) => pattern.test(source)).map(([name]) => ({
      contract,
      message: `${id} must stay self-contained; found ${name}`
    }));
  }
  return externalSpecifiers(source).filter((specifier) => !specifier.startsWith("node:")).map((specifier) => ({
    contract,
    message: `${id} imports "${specifier}" \u2014 node-platform bundles may only import node: builtins`
  }));
}
function assertBundleContract(id, source, contract) {
  const violations = checkBundleContract(id, source, contract);
  if (violations.length > 0) throw new Error(violations.map((violation) => violation.message).join("; "));
}

// scripts/build.ts
var PACKAGE_NAME = "dsh-featherhunter-plugin-base";
var DIST_DIR = "dist";
var ENTRIES = [
  { id: "core/index", entry: "src/core/index.ts", platform: "neutral", contract: "self-contained" },
  {
    id: "client/index",
    entry: "src/client/index.ts",
    platform: "neutral",
    contract: "self-contained",
    banner: "package"
  },
  {
    id: "node/index",
    entry: "src/node/index.ts",
    platform: "node",
    contract: "node-builtins",
    banner: "package"
  },
  {
    id: "node/cli",
    entry: "src/node/cli.ts",
    platform: "node",
    contract: "node-builtins",
    banner: "shebang"
  },
  {
    id: "real-machine-verification/index",
    entry: "src/real-machine-verification/index.ts",
    platform: "node",
    contract: "node-builtins",
    banner: "package"
  },
  {
    id: "real-machine-verification/cli/main",
    entry: "src/real-machine-verification/cli/main.ts",
    platform: "node",
    contract: "node-builtins",
    banner: "shebang"
  }
];
var DOCUMENT_DIR = "real-machine-verification";
var DOCUMENT_FILES = ["README.md", "AGENTS-USAGE.md"];
function readManifest(root) {
  const path = resolve(root, "package.json");
  if (!existsSync(path)) throw new Error(`${path} not found; run this from the base package root`);
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (typeof manifest.name !== "string" || manifest.name.length === 0) {
    throw new Error(`${path} has no "name"`);
  }
  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${path} has no "version"`);
  }
  if (manifest.name !== PACKAGE_NAME) {
    throw new Error(`${path} is ${manifest.name}, expected ${PACKAGE_NAME}`);
  }
  return { name: manifest.name, version: manifest.version };
}
function resolvePackageRoot() {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env["DSH_BASE_ROOT"],
    process.cwd(),
    resolve(here, "..", ".."),
    resolve(here, "..")
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.length === 0) continue;
    const manifestPath = resolve(candidate, "package.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.name === PACKAGE_NAME) return resolve(candidate);
    } catch {
    }
  }
  throw new Error(
    `cannot find the ${PACKAGE_NAME} package root; run "npm run build" inside packages/base`
  );
}
function sharedOptions() {
  return {
    bundle: true,
    format: "esm",
    target: "es2022",
    sourcemap: false,
    legalComments: "none",
    logLevel: "warning"
  };
}
function assertEveryBundle(distRoot) {
  for (const spec of ENTRIES) {
    const file = resolve(distRoot, `${spec.id}.js`);
    assertBundleContract(spec.id, readFileSync(file, "utf8"), spec.contract);
  }
}
function copyDocuments(root, distRoot) {
  const target = resolve(distRoot, DOCUMENT_DIR);
  mkdirSync(target, { recursive: true });
  for (const name of DOCUMENT_FILES) {
    const from = resolve(root, "src", DOCUMENT_DIR, name);
    if (!existsSync(from)) throw new Error(`${from} not found; the capability docs must ship with the package`);
    copyFileSync(from, resolve(target, name));
  }
}
function emitDeclarations(root) {
  const tsc = resolve(root, "node_modules/typescript/bin/tsc");
  if (!existsSync(tsc)) throw new Error(`${tsc} not found; run "npm install" in packages/base first`);
  execFileSync(process.execPath, [tsc, "-p", resolve(root, "tsconfig.build.json")], {
    cwd: root,
    stdio: "inherit"
  });
}
async function buildDemo(root) {
  await build({
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    entryPoints: [resolve(root, "demo/main.tsx")],
    outfile: resolve(root, "demo/dist/demo.js"),
    logLevel: "warning"
  });
}
async function run(argv) {
  const root = resolvePackageRoot();
  const manifest = readManifest(root);
  const distRoot = resolve(root, DIST_DIR);
  const withDemo = argv.includes("--demo");
  const packageBanner = { js: `/*! ${manifest.name} v${manifest.version} */` };
  rmSync(distRoot, { recursive: true, force: true });
  const shared = sharedOptions();
  for (const spec of ENTRIES) {
    const banner = spec.banner === "shebang" ? { js: "#!/usr/bin/env node" } : spec.banner === "package" ? packageBanner : void 0;
    await build({
      ...shared,
      platform: spec.platform,
      entryPoints: { [spec.id]: resolve(root, spec.entry) },
      outdir: distRoot,
      ...banner === void 0 ? {} : { banner }
    });
  }
  emitDeclarations(root);
  assertEveryBundle(distRoot);
  copyDocuments(root, distRoot);
  if (withDemo) await buildDemo(root);
  const names = ENTRIES.map((spec) => spec.id);
  console.log(
    `build ok: ${names.join(", ")}; docs: ${DOCUMENT_FILES.join(", ")}${withDemo ? ", demo" : ""}`
  );
}
async function runCli(args) {
  try {
    await run(args);
    return 0;
  } catch (error) {
    console.error(`build failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
export {
  run,
  runCli
};
