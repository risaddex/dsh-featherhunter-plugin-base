// scripts/docs.ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/real-machine-verification/capability-description.ts
var EXIT_CODES = {
  ok: 0,
  hardFailure: 1,
  blocked: 2
};
var EXIT_CODE_SUMMARIES = {
  ok: "all checks passed; a skipped check is allowed and is reported as skipped",
  hardFailure: "a hard check failed; the report says which claim was falsified",
  blocked: "blocked: a prerequisite or adapter is missing, so the run proved nothing about the product"
};
var BUILT_IN_CHECK_IDS = [
  "dsh-runtime",
  "node-version",
  "profile-declaration",
  "profile-present",
  "isolation-home",
  "settings-isolated",
  "package-installed",
  "package-files",
  "skills-set",
  "model-configured",
  "model-credential",
  "instance-reachable",
  "instances-distinct",
  "instance-pages",
  "logs-readable",
  "teardown-clean",
  "candidate-identity",
  "batch-head-fresh",
  "batch-baseline-fresh",
  "batch-evidence-bound",
  "batch-record",
  "screen-present"
].map((id) => id);
var PROFILE_FIELDS = [
  "id",
  "packageName",
  "defaultProfile",
  "clientEntry",
  "pluginCacheDir",
  "pluginSettingsDir",
  "bundledSkills",
  "model",
  "browser",
  "ticketFace",
  "workspaceBackends",
  "build",
  "instanceEnvAllowlist",
  "hooks",
  "checks"
];
var GLOBAL_FLAGS = [
  { name: "--json", summary: "Print exactly one JSON document on stdout and nothing else." },
  {
    name: "--declaration",
    value: "<file>",
    summary: "Load the verification declaration from this file instead of discovering verify/profile.ts."
  },
  {
    name: "--work-root",
    value: "<dir>",
    summary: "Write run reports and evidence under this directory (default: <cwd>/.scratch/verify)."
  },
  { name: "--dry-run", summary: "Print the plan that would run; touch nothing." },
  { name: "--help", summary: "Print usage." },
  { name: "--version", summary: "Print the base package version and the capability fingerprint." }
];
var COMMANDS = [
  {
    name: "describe",
    layer: 1,
    summary: "Print this capability description (the entry point for an agent).",
    usage: "dsh-verify describe [--json]",
    writes: "nothing",
    flags: ["--json"]
  },
  {
    name: "self-check",
    layer: 1,
    summary: "Read-only checks: declaration, DSH runtime, Node floor, profile, installed package, display (with --screen).",
    usage: "dsh-verify self-check [--profile <p>] [--declaration <file>] [--work-root <dir>] [--screen] [--json] [--dry-run]",
    writes: "run.json and evidence files under the work root (nothing with --dry-run)",
    flags: ["--profile <p>", "--declaration <file>", "--work-root <dir>", "--screen", "--json", "--dry-run"]
  },
  {
    name: "launch",
    layer: 2,
    summary: "Launch one isolated instance and print its handle.",
    usage: "dsh-verify launch [--profile <p>] [--keep] [--port <n>] [--dry-run] [--json]",
    writes: "an isolated home, a working directory, instance.json (nothing with --dry-run)",
    flags: ["--profile <p>", "--keep", "--port <n>", "--dry-run", "--json"]
  },
  {
    name: "stop",
    layer: 2,
    summary: "Stop one instance by id or directory; --all reaps every instance in the work root.",
    usage: "dsh-verify stop [--id <id>] [--dir <d>] [--all] [--json] [--dry-run]",
    writes: "stopped.json in the instance directory (nothing with --dry-run)",
    flags: ["--id <id>", "--dir <d>", "--all", "--json", "--dry-run"]
  },
  {
    name: "isolation",
    layer: 2,
    summary: "Prove plugin settings are redirected: child-process probe plus real-file hash before/after.",
    usage: "dsh-verify isolation [--profile <p>] [--work-root <dir>] [--json] [--dry-run]",
    writes: "probe artifacts under the work root (nothing with --dry-run)",
    flags: ["--profile <p>", "--work-root <dir>", "--json", "--dry-run"]
  },
  {
    name: "model",
    layer: 2,
    summary: "Inspect or configure the model triple; verify cross-entry references agree.",
    usage: "dsh-verify model [--profile <p>] [--provider <p>] [--model <m>] [--api-key-env <ENV>] [--fix] [--json] [--dry-run]",
    writes: "nothing unless --fix is given",
    flags: ["--profile <p>", "--provider <p>", "--model <m>", "--api-key-env <ENV>", "--fix", "--json", "--dry-run"]
  },
  {
    name: "install",
    layer: 2,
    summary: "Install a candidate tgz into a profile and verify every file against the manifest.",
    usage: "dsh-verify install --tgz <file> [--method extract|cli] [--profile <p>] [--declaration <file>] [--work-root <dir>] [--json] [--dry-run]",
    writes: "the isolated profile's node_modules (nothing with --dry-run)",
    flags: [
      "--tgz <file>",
      "--method extract|cli",
      "--profile <p>",
      "--declaration <file>",
      "--work-root <dir>",
      "--candidate <dir>",
      "--json",
      "--dry-run"
    ]
  },
  {
    name: "skills",
    layer: 2,
    summary: "Compare registered skills by set equality against the declaration (never by count).",
    usage: "dsh-verify skills [--profile <p>] [--declaration <file>] [--json]",
    writes: "nothing",
    flags: ["--profile <p>", "--declaration <file>", "--json"]
  },
  {
    name: "single-instance",
    layer: 1,
    summary: "Launch, open the app shell, run declared checks, collect evidence, tear down.",
    usage: "dsh-verify single-instance [--profile <p>] [--declaration <file>] [--work-root <dir>] [--keep] [--dry-run] [--json]",
    writes: "a run directory under the work root: report, evidence, logs",
    flags: [
      "--profile <p>",
      "--declaration <file>",
      "--work-root <dir>",
      "--keep",
      "--dry-run",
      "--json"
    ]
  },
  {
    name: "concurrent",
    layer: 1,
    summary: "Launch N instances across profiles and assert pairwise isolation of home, port, cwd and logs.",
    usage: "dsh-verify concurrent --count <N> [--profiles a,b,c] [--dry-run] [--json]",
    writes: "the batch directory: evidence, summary, logs (nothing with --dry-run)",
    flags: ["--count <N>", "--profiles a,b,c", "--dry-run", "--json"]
  },
  {
    name: "freeze",
    layer: 1,
    summary: "Build, pack and record the candidate identity (commit, file digest, tgz digest).",
    usage: "dsh-verify freeze [--out <dir>] [--allow-dirty] [--json] [--dry-run]",
    writes: "candidate.json and the tgz under the given output directory (nothing with --dry-run)",
    flags: ["--out <dir>", "--allow-dirty", "--json", "--dry-run"]
  },
  {
    name: "batch",
    layer: 1,
    summary: "Open (prepare) or seal a verification batch, then inspect it: open writes the baseline, freeze drops the candidate inside, seal verifies it in spec order and writes the identity line; status checks freshness and candidate drift.",
    usage: "dsh-verify batch open|status [--name <n>] [--base-ref <r>] [--candidate <dir>] [--allow-stale] [--work-root <dir>] [--json] [--dry-run]",
    writes: "batch.json under the work root, the baseline line at open and the identity line once sealed",
    flags: [
      "--name <n>",
      "--base-ref <r>",
      "--candidate <dir>",
      "--allow-stale",
      "--profile <p>",
      "--declaration <file>",
      "--work-root <dir>",
      "--dry-run",
      "--json"
    ]
  },
  {
    name: "evidence",
    layer: 1,
    summary: "Add bound evidence, archive a batch with a sorted SHA256SUMS.txt, or verify an archive by recomputing it.",
    usage: "dsh-verify evidence add|archive|verify [--file <p>]... [--check <id>=pass|fail] [--archive-root <dir>] [--dir <batch-or-archive-dir>] [--name <batch-name>] [--work-root <dir>] [--json] [--dry-run]",
    writes: "evidence/files, evidence.json, the archive directory (nothing with --dry-run)",
    flags: [
      "--file <p>",
      "--check <id>=pass|fail",
      "--archive-root <dir>",
      "--dir <dir>",
      "--name <n>",
      "--work-root <dir>",
      "--json",
      "--dry-run"
    ]
  },
  {
    name: "run",
    layer: 1,
    summary: "Run a scenario file: steps in file order, bounded concurrency, fail-fast or collect-all.",
    usage: "dsh-verify run <scenario.ts> [--concurrency <n>] [--fail-fast|--collect-all] [--profile <p>] [--declaration <file>] [--work-root <dir>] [--json] [--dry-run]",
    writes: "a run directory under the work root: report, evidence, logs (nothing with --dry-run)",
    flags: [
      "--concurrency <n>",
      "--fail-fast",
      "--collect-all",
      "--profile <p>",
      "--declaration <file>",
      "--work-root <dir>",
      "--json",
      "--dry-run"
    ]
  },
  {
    name: "cleanup",
    layer: 1,
    summary: "Report or delete work-root artifacts by ownership and age; unknown entries are only reported.",
    usage: "dsh-verify cleanup [--yes] [--keep-batches <n>] [--keep-homes <n>] [--include-pkg] [--json] [--dry-run]",
    writes: "the work root, only with --yes (nothing with --dry-run)",
    flags: ["--yes", "--keep-batches <n>", "--keep-homes <n>", "--include-pkg", "--json", "--dry-run"]
  }
];
function describeCapability() {
  return {
    capability: "real-machine-verification",
    schemaVersion: 1,
    summary: "Run a plugin build inside a provably isolated DSH instance, check falsifiable claims, and keep evidence that another machine can re-verify.",
    layers: [
      { layer: 1, audience: "people and CI", use: "fixed-shape orchestration: one command per intent" },
      { layer: 2, audience: "agents and scripts", use: "composable primitives in any order" },
      { layer: 3, audience: "agents facing an unforeseen case", use: "break-glass: pages, raw handles, custom steps" }
    ],
    commands: COMMANDS,
    builtInCheckIds: BUILT_IN_CHECK_IDS,
    profileFields: PROFILE_FIELDS,
    exitCodes: EXIT_CODES,
    globalFlags: GLOBAL_FLAGS,
    docs: {
      readme: "README.md",
      agentUsage: "AGENTS-USAGE.md"
    }
  };
}

// src/real-machine-verification/docs.ts
function cell(value) {
  return value.replace(/\|/g, "\\|");
}
function table(headers, rows) {
  return [
    `| ${headers.map(cell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`)
  ];
}
function renderCapabilityMarkdown(description = describeCapability()) {
  const lines = [];
  lines.push(`# ${description.capability}`);
  lines.push("");
  lines.push(description.summary);
  lines.push("");
  lines.push("## Layers");
  lines.push("");
  lines.push(
    ...table(
      ["Layer", "Audience", "Use"],
      description.layers.map((layer) => [`L${layer.layer}`, layer.audience, layer.use])
    )
  );
  lines.push("");
  lines.push(`## Commands (${description.commands.length})`);
  lines.push("");
  lines.push(
    ...table(
      ["Layer", "Usage", "Writes"],
      description.commands.map((command) => [`L${command.layer}`, command.usage, command.writes])
    )
  );
  lines.push("");
  lines.push(`## Built-in check ids (${description.builtInCheckIds.length})`);
  lines.push("");
  lines.push("These ids are a stable contract: reports, comments and gates cite them.");
  lines.push("");
  for (const id of description.builtInCheckIds) lines.push(`- \`${id}\``);
  lines.push("");
  lines.push(`## Profile fields (${description.profileFields.length})`);
  lines.push("");
  for (const field of description.profileFields) lines.push(`- \`${field}\``);
  lines.push("");
  lines.push("## Exit codes");
  lines.push("");
  lines.push(
    ...table(
      ["Code", "Meaning"],
      ["ok", "hardFailure", "blocked"].map((key) => [
        String(description.exitCodes[key]),
        EXIT_CODE_SUMMARIES[key]
      ])
    )
  );
  lines.push("");
  lines.push("## Global options");
  lines.push("");
  lines.push(
    ...table(
      ["Option", "Meaning"],
      description.globalFlags.map((flag) => [
        flag.value === void 0 ? flag.name : `${flag.name} ${flag.value}`,
        flag.summary
      ])
    )
  );
  lines.push("");
  lines.push("## Documents");
  lines.push("");
  lines.push(`- \`${description.docs.readme}\` \u2014 how to install and run this capability.`);
  lines.push(`- \`${description.docs.agentUsage}\` \u2014 the agent-facing capability table and error codes.`);
  return `${lines.join("\n")}
`;
}

// scripts/docs.ts
var PACKAGE_NAME = "@risaddex/dsh-featherhunter-plugin-base";
var REFERENCE_BEGIN = "<!-- dsh-verify:reference:begin -->";
var REFERENCE_END = "<!-- dsh-verify:reference:end -->";
var DOC_TARGETS = [
  "src/real-machine-verification/README.md",
  "src/real-machine-verification/AGENTS-USAGE.md"
];
var GENERATED_NOTE = "<!-- \u672C\u6BB5\u7531 `dsh-verify describe` \u751F\u6210\uFF1A\u4E0D\u8981\u624B\u6539\uFF1B\u6539\u5B8C\u80FD\u529B\u63CF\u8FF0\u540E\u8FD0\u884C `npm run docs:sync`\u3002 -->";
function demoteHeadings(markdown) {
  return markdown.replace(/^(#{1,6})(\s)/gm, "#$1$2");
}
function renderReferenceBlock(description = describeCapability()) {
  const generated = demoteHeadings(renderCapabilityMarkdown(description)).trimEnd();
  return [GENERATED_NOTE, "", generated].join("\n");
}
function spliceReference(text, block) {
  const lines = text.split("\n");
  const begins = lines.flatMap((line, index) => line === REFERENCE_BEGIN ? [index] : []);
  const ends = lines.flatMap((line, index) => line === REFERENCE_END ? [index] : []);
  if (begins.length !== 1) {
    throw new Error(`expected exactly one ${REFERENCE_BEGIN} line, found ${begins.length}`);
  }
  if (ends.length !== 1) {
    throw new Error(`expected exactly one ${REFERENCE_END} line, found ${ends.length}`);
  }
  const begin = begins[0];
  const end = ends[0];
  if (end < begin) {
    throw new Error(`${REFERENCE_END} appears before ${REFERENCE_BEGIN}`);
  }
  return [...lines.slice(0, begin + 1), ...block.split("\n"), ...lines.slice(end)].join("\n");
}
function checkDocs(root, description = describeCapability()) {
  const block = renderReferenceBlock(description);
  const problems = [];
  for (const target of DOC_TARGETS) {
    const path = resolve(root, target);
    if (!existsSync(path)) {
      problems.push({ file: target, problem: "missing document" });
      continue;
    }
    const text = readFileSync(path, "utf8");
    let next;
    try {
      next = spliceReference(text, block);
    } catch (error) {
      problems.push({ file: target, problem: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (next !== text) {
      problems.push({ file: target, problem: "reference block is stale; run npm run docs:sync" });
    }
  }
  return { ok: problems.length === 0, problems };
}
function syncDocs(root, description = describeCapability()) {
  const block = renderReferenceBlock(description);
  const changed = [];
  for (const target of DOC_TARGETS) {
    const path = resolve(root, target);
    if (!existsSync(path)) throw new Error(`${target} not found under ${root}`);
    const text = readFileSync(path, "utf8");
    const next = spliceReference(text, block);
    if (next === text) continue;
    writeFileSync(path, next, "utf8");
    changed.push(target);
  }
  return changed;
}
function resolvePackageRoot(startDirectory = process.cwd()) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env["DSH_BASE_ROOT"],
    startDirectory,
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
  throw new Error(`cannot find the ${PACKAGE_NAME} package root; run this from packages/base`);
}
async function runCli(args) {
  const checkOnly = args.includes("--check");
  const unknown = args.filter((arg) => arg !== "--check");
  if (unknown.length > 0) {
    console.error(`docs: unknown argument ${unknown[0]}; usage: docs [--check]`);
    return 2;
  }
  let root;
  try {
    root = resolvePackageRoot();
  } catch (error) {
    console.error(`docs failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  if (checkOnly) {
    const result = checkDocs(root);
    if (!result.ok) {
      for (const problem of result.problems) console.error(`docs stale: ${problem.file}: ${problem.problem}`);
      return 1;
    }
    console.log("docs ok: README.md and AGENTS-USAGE.md match describe");
    return 0;
  }
  const changed = syncDocs(root);
  console.log(changed.length === 0 ? "docs ok: nothing to update" : `docs updated: ${changed.join(", ")}`);
  return 0;
}
export {
  DOC_TARGETS,
  REFERENCE_BEGIN,
  REFERENCE_END,
  checkDocs,
  demoteHeadings,
  renderReferenceBlock,
  resolvePackageRoot,
  runCli,
  spliceReference,
  syncDocs
};
