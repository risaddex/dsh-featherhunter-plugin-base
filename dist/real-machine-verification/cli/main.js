#!/usr/bin/env node

// src/real-machine-verification/cli/main.ts
import { existsSync, readFileSync } from "node:fs";
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

// src/real-machine-verification/contracts/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}
function failure(code, message, hint, details) {
  return {
    code,
    message,
    ...hint === void 0 ? {} : { hint },
    ...details === void 0 ? {} : { details }
  };
}
function unwrapOrThrow(result, describeFailure) {
  if (result.ok) return result.value;
  throw new Error(describeFailure(result.error));
}
function formatFailure(error) {
  const hint = error.hint === void 0 ? "" : ` \u2014 ${error.hint}`;
  return `[${error.code}] ${error.message}${hint}`;
}

// src/real-machine-verification/contracts/branding.ts
var COMMIT_SHA_RE = /^[0-9a-f]{40}$/;
var SHA256_RE = /^[0-9a-f]{64}$/;
var BATCH_NAME_RE = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]{1,64}$/;
var CHECK_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
var PROFILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
function quote(value) {
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
function parseCommitSha(value) {
  if (typeof value !== "string" || !COMMIT_SHA_RE.test(value)) {
    return err(
      failure(
        "invalid-input",
        `not a 40-character lowercase commit sha: ${quote(value)}`,
        "pass the output of `git rev-parse HEAD` without shortening it"
      )
    );
  }
  return ok(value);
}
function parseSha256Hex(value) {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    return err(
      failure(
        "invalid-input",
        `not a 64-character lowercase sha256: ${quote(value)}`,
        "pass the digest produced by sha256sum / the tool's own manifest"
      )
    );
  }
  return ok(value);
}
function parseBatchName(value) {
  if (typeof value !== "string" || !BATCH_NAME_RE.test(value)) {
    return err(
      failure(
        "invalid-input",
        `not a usable batch name: ${quote(value)}`,
        "use letters, digits, dot, dash or underscore, and include at least one letter or digit"
      )
    );
  }
  if (value === "." || value === "..") {
    return err(
      failure("invalid-input", `batch name ${quote(value)} would escape the batches directory`)
    );
  }
  return ok(value);
}
function parseCheckId(value) {
  if (typeof value !== "string" || !CHECK_ID_RE.test(value)) {
    return err(
      failure(
        "invalid-input",
        `not a usable check id: ${quote(value)}`,
        "use lowercase kebab-case, e.g. isolation-home or model-credential"
      )
    );
  }
  return ok(value);
}
function parseProfileName(value) {
  if (typeof value !== "string" || !PROFILE_NAME_RE.test(value)) {
    return err(
      failure(
        "invalid-input",
        `not a usable profile name: ${quote(value)}`,
        "profile names are directory names under <home>/profiles/, e.g. web or desktop"
      )
    );
  }
  return ok(value);
}
function asEvidencePath(value) {
  return value;
}

// src/real-machine-verification/contracts/batch-rules.ts
var BATCH_SCHEMA_VERSION = 1;
function invalid(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readDate(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    return invalid(`${field} must be an ISO timestamp, got ${JSON.stringify(value)}`);
  }
  return ok(value);
}
function readCommit(value, field) {
  const parsed = parseCommitSha(value);
  return parsed.ok ? parsed : invalid(`${field} must be a 40-character lowercase hex commit`);
}
function parseBatchRecord(value) {
  if (!isRecord(value)) return invalid("batch record must be a JSON object");
  if (value.schemaVersion !== BATCH_SCHEMA_VERSION) {
    return invalid(
      `batch record schemaVersion ${JSON.stringify(value.schemaVersion)} is not ${BATCH_SCHEMA_VERSION}`,
      "an old batch cannot be read by this version; open a new batch instead"
    );
  }
  const batchName = parseBatchName(value.batchName);
  if (!batchName.ok) return invalid(`batchName ${JSON.stringify(value.batchName)} is not a valid batch name`);
  if (typeof value.batchDir !== "string" || value.batchDir.length === 0) {
    return invalid("batchDir must be a non-empty string");
  }
  const createdAt = readDate(value.createdAt, "createdAt");
  if (!createdAt.ok) return createdAt;
  const updatedAt = readDate(value.updatedAt, "updatedAt");
  if (!updatedAt.ok) return updatedAt;
  if (value.status !== "active" && value.status !== "stale") {
    return invalid(`batch status ${JSON.stringify(value.status)} must be "active" or "stale"`);
  }
  const startHead = readCommit(value.startHead, "startHead");
  if (!startHead.ok) return startHead;
  if (typeof value.startBranch !== "string" || value.startBranch.length === 0) {
    return invalid("startBranch must be a non-empty string");
  }
  let base = null;
  if (value.base !== void 0 && value.base !== null) {
    if (!isRecord(value.base)) return invalid("base must be an object or null");
    if (typeof value.base.ref !== "string" || value.base.ref.length === 0) return invalid("base.ref must be a non-empty string");
    const tip = readCommit(value.base.tip, "base.tip");
    if (!tip.ok) return tip;
    if (typeof value.base.expectedVersion !== "string" || value.base.expectedVersion.length === 0) {
      return invalid("base.expectedVersion must be a non-empty string");
    }
    if (typeof value.base.allowOutdated !== "boolean") return invalid("base.allowOutdated must be a boolean");
    base = { ref: value.base.ref, tip: tip.value, expectedVersion: value.base.expectedVersion, allowOutdated: value.base.allowOutdated };
  }
  let endHead;
  if (value.endHead !== void 0 && value.endHead !== null) {
    const parsed = readCommit(value.endHead, "endHead");
    if (!parsed.ok) return parsed;
    endHead = parsed.value;
  } else if (value.endHead === null) {
    endHead = null;
  }
  let endCheckedAt;
  if (value.endCheckedAt !== void 0 && value.endCheckedAt !== null) {
    const parsed = readDate(value.endCheckedAt, "endCheckedAt");
    if (!parsed.ok) return parsed;
    endCheckedAt = parsed.value;
  } else if (value.endCheckedAt === null) {
    endCheckedAt = null;
  }
  const record = {
    schemaVersion: BATCH_SCHEMA_VERSION,
    batchName: batchName.value,
    batchDir: value.batchDir,
    createdAt: createdAt.value,
    updatedAt: updatedAt.value,
    status: value.status,
    startHead: startHead.value,
    startBranch: value.startBranch,
    base,
    ...endHead === void 0 ? {} : { endHead },
    ...endCheckedAt === void 0 ? {} : { endCheckedAt },
    ...value.preflightOk === void 0 || value.preflightOk === null ? {} : { preflightOk: value.preflightOk === true },
    ...isRecord(value.candidate) ? { candidate: readCandidateIdentity(value.candidate) } : {}
  };
  return ok(record);
}
function readCandidateIdentity(value) {
  const commit = parseCommitSha(value.commit);
  const sha = parseSha256Hex(value.sha256);
  const tgzSha = parseSha256Hex(value.tgzSha256);
  const fileDigest = parseSha256Hex(value.fileDigest);
  const manifestDigest = parseSha256Hex(value.manifestDigest);
  if (!commit.ok || !sha.ok || !tgzSha.ok || !fileDigest.ok || !manifestDigest.ok) return null;
  if (typeof value.path !== "string" || typeof value.version !== "string" || typeof value.tgzPath !== "string") return null;
  if (value.validity !== "release" && value.validity !== "development") return null;
  return {
    path: value.path,
    sha256: sha.value,
    commit: commit.value,
    version: value.version,
    validity: value.validity,
    tgzPath: value.tgzPath,
    tgzSha256: tgzSha.value,
    fileDigest: fileDigest.value,
    manifestDigest: manifestDigest.value
  };
}
function judgeFreshness(facts, checkedAt) {
  const problems = [];
  const { record } = facts;
  if (facts.currentHead !== record.startHead) {
    problems.push({
      code: "head-moved",
      message: `HEAD moved from ${record.startHead} to ${facts.currentHead} since the batch opened`,
      hint: "re-run the affected checks on the current HEAD, or open a new batch"
    });
  }
  if (record.base === null) {
    problems.push({
      code: "no-baseline",
      message: "batch recorded no baseline ref, so freshness cannot be judged",
      hint: "open batches with --base-ref so later checks can tell whether the base advanced"
    });
  } else if (record.base.allowOutdated) {
    problems.push({
      code: "outdated-base-allowed",
      message: `batch was opened with --allow-stale against ${record.base.ref} ${record.base.tip}`,
      hint: "this batch verifies code that does not contain the current baseline; note it in the batch comment"
    });
  } else if (facts.baseReadError !== void 0) {
    problems.push({
      code: "baseline-unreadable",
      message: `could not read baseline ${record.base.ref}: ${facts.baseReadError}`,
      hint: "fetch the baseline ref locally; an unreadable baseline cannot be assumed unchanged"
    });
  } else if (facts.baseTipNow === null) {
    problems.push({
      code: "baseline-unreadable",
      message: `baseline ${record.base.ref} did not resolve to a commit`,
      hint: "the ref was deleted or renamed after the batch opened"
    });
  } else if (facts.baseTipNow !== record.base.tip) {
    problems.push({
      code: "baseline-advanced",
      message: `baseline ${record.base.ref} advanced from ${record.base.tip} to ${facts.baseTipNow}`,
      hint: "the branch now contains commits this batch was not verified against; re-merge and re-run the affected checks"
    });
  }
  const status = problems.length === 0 ? "active" : "stale";
  return {
    status,
    endHead: facts.currentHead,
    endCheckedAt: checkedAt,
    problems: Object.freeze(problems),
    message: status === "active" ? `active: HEAD ${facts.currentHead.slice(0, 12)} matches the batch start${record.base === null ? "" : ` and baseline ${record.base.ref} is unchanged`}` : `stale: ${problems.map((item) => item.message).join("; ")}`
  };
}
function judgeEvidenceBinding(facts) {
  const { record, meta } = facts;
  if (meta.batchName !== record.batchName) {
    return err({
      code: "identity-mismatch",
      message: `evidence belongs to batch ${JSON.stringify(meta.batchName)}, this batch is ${record.batchName}`,
      hint: "collect evidence with --batch of the batch you are verifying"
    });
  }
  const candidate = meta.candidate;
  if (candidate === void 0) {
    return err({
      code: "identity-mismatch",
      message: "evidence carries no candidate identity",
      hint: "collect evidence through the tool; identity is copied from batch.json, never hand-written"
    });
  }
  const recordCandidate = record.candidate ?? null;
  if (recordCandidate === null) {
    return err({
      code: "identity-mismatch",
      message: "batch record has no candidate identity yet",
      hint: "freeze a candidate and open the batch before collecting evidence"
    });
  }
  if (candidate.batchName !== void 0 && candidate.batchName !== record.batchName) {
    return err({
      code: "identity-mismatch",
      message: `evidence candidate names batch ${candidate.batchName}, batch record is ${record.batchName}`
    });
  }
  if (candidate.commit !== recordCandidate.commit) {
    return err({
      code: "identity-mismatch",
      message: `evidence candidate commit ${String(candidate.commit)} is not this batch's ${recordCandidate.commit}`,
      hint: "this evidence was collected against a different build and must not be counted here"
    });
  }
  if (candidate.packageSha256 !== recordCandidate.sha256) {
    return err({
      code: "identity-mismatch",
      message: `evidence candidate manifest sha256 ${String(candidate.packageSha256)} is not this batch's ${recordCandidate.sha256}`
    });
  }
  return ok({ batchName: record.batchName, commit: recordCandidate.commit, packageSha256: recordCandidate.sha256 });
}

// src/real-machine-verification/contracts/identity.ts
import { createHash } from "node:crypto";
var SCHEMA_VERSION = 1;
function sha256Text(text) {
  return sha256Hex(createHash("sha256").update(text, "utf8").digest("hex"));
}
function sha256Bytes(bytes) {
  return sha256Hex(createHash("sha256").update(bytes).digest("hex"));
}
function sha256Hex(digest) {
  if (!SHA256_RE.test(digest)) {
    throw new Error(`internal: crypto returned a non-sha256 digest ${JSON.stringify(digest)}`);
  }
  return digest;
}
function sortKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => sortKeys(entry));
  const record = value;
  const sorted = {};
  for (const key of Object.keys(record).sort()) sorted[key] = sortKeys(record[key]);
  return sorted;
}
function canonicalJson(value) {
  return JSON.stringify(sortKeys(value));
}
function digestOfFiles(entries) {
  const invalidDigests = [];
  const invalidPaths = [];
  for (const entry of entries) {
    if (!SHA256_RE.test(entry.sha256)) invalidDigests.push(`${entry.path}: ${entry.sha256}`);
    if (entry.path.includes("\\")) invalidPaths.push(entry.path);
  }
  if (invalidPaths.length > 0) {
    return err(
      failure(
        "invalid-input",
        `file digest paths must use "/" separators: ${invalidPaths.slice(0, 3).join(", ")}`,
        "normalize paths before hashing; a Windows path digest does not match a Linux one"
      )
    );
  }
  if (invalidDigests.length > 0) {
    return err(
      failure(
        "invalid-input",
        `file digest entries with a malformed sha256: ${invalidDigests.slice(0, 3).join(", ")}`
      )
    );
  }
  const lines = [...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0).map((entry) => `${entry.sha256}  ${entry.path}`);
  return ok(sha256Text(lines.join("\n")));
}
var IDENTITY_LINE_PREFIX = "- \u9A8C\u8BC1\u8EAB\u4EFD\uFF1A";
var IDENTITY_LINE_PREFIX_EN = "- Verification identity: ";
function formatIdentityLine(binding, language = "zh") {
  const name = parseBatchName(binding.batchName);
  if (!name.ok) return name;
  const commit = parseCommitSha(binding.commit);
  if (!commit.ok) return commit;
  const sha = parseSha256Hex(binding.packageSha256);
  if (!sha.ok) return sha;
  if (language === "en") {
    return ok(
      `${IDENTITY_LINE_PREFIX_EN}batch ${name.value}; candidate commit ${commit.value}; candidate package sha256 ${sha.value}`
    );
  }
  return ok(
    `${IDENTITY_LINE_PREFIX}\u6279\u6B21 ${name.value}\uFF1B\u5019\u9009\u63D0\u4EA4 ${commit.value}\uFF1B\u5019\u9009\u5305 sha256 ${sha.value}`
  );
}
var BASE_LINE_PREFIX = "- \u9A8C\u8BC1\u57FA\u7EBF\uFF1A";
var BASE_LINE_PREFIX_EN = "- Verification baseline: ";
function formatBaseLine(base, language = "zh") {
  if (base.ref.length === 0 || /\s/.test(base.ref)) {
    return err(failure("invalid-input", `base ref must be non-empty and space-free: ${base.ref}`));
  }
  if (base.expectedVersion.length === 0 || /\s/.test(base.expectedVersion)) {
    return err(
      failure("invalid-input", `expected version must be non-empty and space-free: ${base.expectedVersion}`)
    );
  }
  const tip = parseCommitSha(base.tip);
  if (!tip.ok) return tip;
  if (language === "en") {
    return ok(`${BASE_LINE_PREFIX_EN}local ${base.ref} ${tip.value}; target version ${base.expectedVersion}`);
  }
  return ok(`${BASE_LINE_PREFIX}\u672C\u5730 ${base.ref} ${tip.value}\uFF1B\u76EE\u6807\u7248\u672C ${base.expectedVersion}`);
}

// src/real-machine-verification/contracts/candidate-rules.ts
var CANDIDATE_SCHEMA_VERSION = 2;
function packageManifestDigest(packageManifest, commit) {
  return sha256Text(canonicalJson({ commit, manifest: packageManifest }));
}
function invalid2(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function readSha(value, field) {
  const parsed = parseSha256Hex(value);
  if (!parsed.ok) {
    return invalid2(`${field} must be a 64-character lowercase hex digest, got ${JSON.stringify(value)}`);
  }
  return parsed;
}
function readCommit2(value, field) {
  const parsed = parseCommitSha(value);
  if (!parsed.ok) {
    return invalid2(`${field} must be a 40-character lowercase hex commit, got ${JSON.stringify(value)}`);
  }
  return parsed;
}
function parseCandidateManifest(value) {
  if (!isRecord2(value)) return invalid2("candidate manifest must be a JSON object");
  if (value.schemaVersion !== CANDIDATE_SCHEMA_VERSION) {
    return invalid2(
      `candidate manifest schemaVersion ${JSON.stringify(value.schemaVersion)} is not ${CANDIDATE_SCHEMA_VERSION}`,
      "re-freeze the candidate with this version of the tool instead of reusing an old file"
    );
  }
  if (typeof value.generatedAt !== "string" || Number.isNaN(Date.parse(value.generatedAt))) {
    return invalid2("candidate manifest generatedAt must be an ISO timestamp");
  }
  if (typeof value.version !== "string" || value.version.length === 0) {
    return invalid2("candidate manifest version must be a non-empty string");
  }
  if (value.validity !== "release" && value.validity !== "development") {
    return invalid2(`candidate manifest validity ${JSON.stringify(value.validity)} must be "release" or "development"`);
  }
  if (typeof value.sourceStable !== "boolean") {
    return invalid2("candidate manifest sourceStable must be a boolean");
  }
  if (!isRecord2(value.git)) return invalid2("candidate manifest git must be an object");
  const commit = readCommit2(value.git.commit, "git.commit");
  if (!commit.ok) return commit;
  if (typeof value.git.branch !== "string") return invalid2("candidate manifest git.branch must be a string");
  if (typeof value.git.dirty !== "boolean") return invalid2("candidate manifest git.dirty must be a boolean");
  const dirtyFiles = [];
  if (value.git.dirtyFiles !== void 0) {
    if (!Array.isArray(value.git.dirtyFiles)) return invalid2("candidate manifest git.dirtyFiles must be an array");
    for (const [index, item] of value.git.dirtyFiles.entries()) {
      if (typeof item !== "string" || item.length === 0) {
        return invalid2(`candidate manifest git.dirtyFiles[${index}] must be a non-empty string`);
      }
      dirtyFiles.push(item);
    }
  }
  if (!isRecord2(value.package)) return invalid2("candidate manifest package must be an object");
  const pkg = value.package;
  if (typeof pkg.tgzPath !== "string" || pkg.tgzPath.length === 0) return invalid2("package.tgzPath must be a non-empty string");
  if (typeof pkg.filename !== "string" || !pkg.filename.endsWith(".tgz")) {
    return invalid2(`package.filename ${JSON.stringify(pkg.filename)} must end with .tgz`);
  }
  if (!Number.isInteger(pkg.tgzBytes) || pkg.tgzBytes <= 0) {
    return invalid2("package.tgzBytes must be a positive integer");
  }
  const tgzSha = readSha(pkg.tgzSha256, "package.tgzSha256");
  if (!tgzSha.ok) return tgzSha;
  const fileDigest = readSha(pkg.fileDigest, "package.fileDigest");
  if (!fileDigest.ok) return fileDigest;
  const manifestDigest = readSha(pkg.manifestDigest, "package.manifestDigest");
  if (!manifestDigest.ok) return manifestDigest;
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    return invalid2("package.files must be a non-empty array", "an empty file list proves nothing about the build");
  }
  const files = [];
  for (const [index, entry2] of pkg.files.entries()) {
    if (!isRecord2(entry2)) return invalid2(`package.files[${index}] must be an object`);
    if (typeof entry2.path !== "string" || entry2.path.length === 0 || entry2.path.includes("\\")) {
      return invalid2(`package.files[${index}].path must be a non-empty /-separated path`);
    }
    if (!Number.isInteger(entry2.bytes) || entry2.bytes < 0) {
      return invalid2(`package.files[${index}].bytes must be a non-negative integer`);
    }
    const sha = readSha(entry2.sha256, `package.files[${index}].sha256`);
    if (!sha.ok) return sha;
    files.push({ path: entry2.path, bytes: entry2.bytes, sha256: sha.value });
  }
  if (Number.isInteger(pkg.fileCount) && pkg.fileCount !== files.length) {
    return invalid2(`package.fileCount ${String(pkg.fileCount)} does not match package.files length ${files.length}`);
  }
  let buildCommit = null;
  if (pkg.buildCommit !== void 0 && pkg.buildCommit !== null) {
    const parsed = readCommit2(pkg.buildCommit, "package.buildCommit");
    if (!parsed.ok) return parsed;
    buildCommit = parsed.value;
  }
  let entry;
  if (value.entry !== void 0) {
    if (!isRecord2(value.entry)) return invalid2("candidate manifest entry must be an object");
    const raw = value.entry;
    if (typeof raw.clientEntry !== "string" || raw.clientEntry.length === 0 || raw.clientEntry.includes("\\")) {
      return invalid2("candidate manifest entry.clientEntry must be a non-empty /-separated path");
    }
    if (raw.status !== "ok" && raw.status !== "blocked" && raw.status !== "mismatch") {
      return invalid2(`candidate manifest entry.status ${JSON.stringify(raw.status)} must be "ok", "blocked" or "mismatch"`);
    }
    const found = (field) => {
      const rawValue = raw[field];
      if (rawValue === null) return null;
      if (typeof rawValue !== "string" || rawValue.length === 0) {
        throw new Error(`candidate manifest entry.${field} must be null or a non-empty string`);
      }
      return rawValue;
    };
    let foundPackageName;
    let foundVersion;
    try {
      foundPackageName = found("foundPackageName");
      foundVersion = found("foundVersion");
    } catch (error) {
      return invalid2(error instanceof Error ? error.message : String(error));
    }
    let entrySha = null;
    if (raw.sha256 !== null) {
      const parsed = readSha(raw.sha256, "entry.sha256");
      if (!parsed.ok) return parsed;
      entrySha = parsed.value;
    }
    entry = {
      clientEntry: raw.clientEntry,
      foundPackageName,
      foundVersion,
      status: raw.status,
      sha256: entrySha
    };
  }
  let notes;
  if (value.notes !== void 0) {
    if (!Array.isArray(value.notes)) return invalid2("candidate manifest notes must be an array");
    for (const [index, item] of value.notes.entries()) {
      if (typeof item !== "string" || item.length === 0) {
        return invalid2(`candidate manifest notes[${index}] must be a non-empty string`);
      }
    }
    notes = [...value.notes];
  }
  const manifest = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    generatedAt: value.generatedAt,
    tool: typeof value.tool === "string" ? value.tool : "unknown",
    version: value.version,
    validity: value.validity,
    sourceStable: value.sourceStable,
    git: { commit: commit.value, branch: value.git.branch, dirty: value.git.dirty, dirtyFiles },
    package: {
      tgzPath: pkg.tgzPath,
      tgzBytes: pkg.tgzBytes,
      tgzSha256: tgzSha.value,
      filename: pkg.filename,
      files,
      fileCount: files.length,
      fileDigest: fileDigest.value,
      manifestDigest: manifestDigest.value,
      buildCommit,
      ...typeof pkg.npmShasum === "string" ? { npmShasum: pkg.npmShasum } : {},
      ...typeof pkg.npmIntegrity === "string" ? { npmIntegrity: pkg.npmIntegrity } : {}
    },
    ...entry === void 0 ? {} : { entry },
    ...notes === void 0 ? {} : { notes }
  };
  return ok(manifest);
}
function candidateIdentityOf(manifest, manifestPath, manifestSha256) {
  return {
    path: manifestPath,
    sha256: manifestSha256,
    commit: manifest.git.commit,
    version: manifest.version,
    validity: manifest.validity,
    tgzPath: manifest.package.tgzPath,
    tgzSha256: manifest.package.tgzSha256,
    fileDigest: manifest.package.fileDigest,
    manifestDigest: manifest.package.manifestDigest
  };
}
function problem(code, message, hint) {
  return { code, message, ...hint === void 0 ? {} : { hint } };
}
function judgeCandidate(facts) {
  const problems = [];
  const { manifest, identity } = facts;
  const insideBatch = isPathInside(facts.manifestPath, facts.batchDir);
  if (!insideBatch) {
    problems.push(
      problem(
        "not-in-batch-dir",
        `candidate ${facts.manifestPath} is not inside the batch directory ${facts.batchDir}`,
        "copying a candidate from the previous batch makes this batch's identity ambiguous"
      )
    );
  }
  if (facts.generatedAtMs < facts.batchStartedAtMs) {
    problems.push(
      problem(
        "older-than-batch",
        "candidate was generated before this batch was opened",
        "re-freeze so the build is known to come from the code under verification"
      )
    );
  }
  if (manifest.git.commit !== facts.currentHead) {
    problems.push(
      problem(
        "head-mismatch",
        `candidate commit ${manifest.git.commit} is not the current HEAD ${facts.currentHead}`,
        "check out the commit under verification, or freeze again"
      )
    );
  }
  if (manifest.package.buildCommit !== null && manifest.package.buildCommit !== manifest.git.commit) {
    problems.push(
      problem(
        "build-commit-mismatch",
        `built client declares commit ${manifest.package.buildCommit}, source commit is ${manifest.git.commit}`,
        "rebuild with a forced rebuild; a cached artifact from an earlier commit is not this candidate"
      )
    );
  }
  if (!manifest.sourceStable) {
    problems.push(
      problem(
        "source-unstable",
        "HEAD or the dirty set changed while the package was being built",
        "freeze again without editing the tree"
      )
    );
  }
  if (facts.base !== null) {
    if (!facts.allowOutdatedBase) {
      if (facts.commitContainsBase === null) {
        problems.push(
          problem(
            "commit-not-contains-base",
            "could not determine whether the candidate descends from the baseline",
            "fetch the baseline ref locally first"
          )
        );
      } else if (!facts.commitContainsBase) {
        problems.push(
          problem(
            "commit-not-contains-base",
            `candidate commit ${manifest.git.commit} does not contain baseline ${facts.base.ref} (${facts.base.tip})`,
            "rebase or merge the baseline, then freeze again; an outdated base silently verifies old code"
          )
        );
      }
    }
    if (facts.expectedVersion === null) {
      problems.push(
        problem(
          "base-version-unreadable",
          `could not read the version baseline ${facts.base.ref} (${facts.base.tip}) declares`,
          "check that the baseline ref still resolves and contains a valid package.json"
        )
      );
    } else if (manifest.version !== facts.expectedVersion) {
      problems.push(
        problem(
          "version-mismatch",
          `candidate version ${manifest.version} does not match baseline version ${facts.expectedVersion}`,
          "bump the version on the branch under verification, not inside the candidate"
        )
      );
    }
  }
  if (!facts.tgzOnDisk.exists) {
    problems.push(
      problem("tgz-missing", `tarball for the candidate is missing: ${manifest.package.tgzPath}`, "freeze again")
    );
  } else if (facts.tgzOnDisk.sha256 !== manifest.package.tgzSha256) {
    problems.push(
      problem(
        "tgz-hash-mismatch",
        `tarball sha256 ${facts.tgzOnDisk.sha256 ?? "(unreadable)"} does not match the manifest ${manifest.package.tgzSha256}`,
        "the tarball was replaced after freezing; re-freeze"
      )
    );
  }
  if (facts.recomputedFileDigest !== null && facts.recomputedFileDigest !== manifest.package.fileDigest) {
    problems.push(
      problem(
        "file-digest-mismatch",
        `digest over package.files is ${facts.recomputedFileDigest}, manifest says ${manifest.package.fileDigest}`,
        "the file list was edited after freezing; re-freeze"
      )
    );
  }
  return { ok: problems.length === 0, identity, problems: Object.freeze(problems) };
}
function isPathInside(child, parent) {
  const normalize = (value) => {
    const trimmed = value.replace(/[\\/]+$/, "");
    return /^[A-Za-z]:/.test(trimmed) || trimmed.startsWith("\\") ? trimmed.toLowerCase().replace(/\//g, "\\") : trimmed;
  };
  const a = normalize(child);
  const b = normalize(parent);
  if (a === b) return true;
  const separator = b.includes("\\") ? "\\" : "/";
  return a.startsWith(`${b}${separator}`);
}
function describeCandidateVerdict(verdict) {
  if (verdict.ok) {
    return `candidate ok: ${verdict.identity.version} @ ${verdict.identity.commit} (tgz ${verdict.identity.tgzSha256.slice(0, 12)}\u2026)`;
  }
  const lines = [`candidate rejected with ${verdict.problems.length} problem(s):`];
  for (const item of verdict.problems) {
    lines.push(`- [${item.code}] ${item.message}${item.hint === void 0 ? "" : ` \u2014 ${item.hint}`}`);
  }
  return lines.join("\n");
}

// src/real-machine-verification/contracts/check.ts
function tallyChecks(checks) {
  let passed2 = 0;
  let failed2 = 0;
  let skipped2 = 0;
  let blocked2 = 0;
  let hardFailed = 0;
  for (const check of checks) {
    switch (check.status) {
      case "pass":
        passed2 += 1;
        break;
      case "fail":
        failed2 += 1;
        if (check.hard) hardFailed += 1;
        break;
      case "skip":
        skipped2 += 1;
        break;
      case "blocked":
        blocked2 += 1;
        break;
    }
  }
  return { total: checks.length, passed: passed2, failed: failed2, skipped: skipped2, blocked: blocked2, hardFailed };
}
function decideExitCode(checks) {
  const tally = tallyChecks(checks);
  if (tally.hardFailed > 0) return 1;
  if (tally.blocked > 0) return 2;
  return 0;
}
function describeFailures(checks) {
  const hard = checks.filter((check) => check.status === "fail" && check.hard);
  if (hard.length > 0) {
    const names = hard.map((check) => `${check.id} (${check.title})`).join(", ");
    return `hard checks failed (${hard.length}): ${names}`;
  }
  const blocked2 = checks.filter((check) => check.status === "blocked");
  if (blocked2.length > 0) {
    const names = blocked2.map((check) => `${check.id} (${check.title})`).join(", ");
    return `checks blocked (${blocked2.length}): ${names}`;
  }
  return null;
}

// src/real-machine-verification/runtime/paths.ts
function toPosixPath(value) {
  return value.replace(/\\/g, "/");
}
function pathSegments(value) {
  return toPosixPath(value).split("/").filter((segment) => segment.length > 0);
}
function baseName(value) {
  const segments = pathSegments(value);
  return segments.length === 0 ? "" : segments[segments.length - 1];
}
function parentPath(value) {
  const normalized = toPosixPath(value).replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return null;
  return normalized.slice(0, index);
}
function parentFsPath(value) {
  const normalized = value.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index <= 0) return null;
  const parent = normalized.slice(0, index);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}/` : parent;
}
function depthOf(value) {
  return pathSegments(value).length;
}
function isWindowsAbsolute(value) {
  return /^[A-Za-z]:[\\/]/.test(value);
}
function isPosixAbsolute(value) {
  return value.startsWith("/");
}
function joinFsPath(...segments) {
  const usable = segments.filter((segment) => segment.length > 0);
  if (usable.length === 0) return "";
  const [first, ...rest] = usable;
  const head = first.replace(/[\\/]+$/, "");
  const style = head.includes("\\") || isWindowsAbsolute(head) ? "\\" : "/";
  const tail4 = rest.map((segment) => segment.replace(/^[\\/]+/, "").replace(/[\\/]+$/, "")).filter((segment) => segment.length > 0);
  return [head, ...tail4].join(style);
}
function samePath(a, b) {
  const left = toPosixPath(a).replace(/\/+$/, "");
  const right = toPosixPath(b).replace(/\/+$/, "");
  if (isWindowsAbsolute(left) || isWindowsAbsolute(right)) return left.toLowerCase() === right.toLowerCase();
  return left === right;
}
function isInsidePath(child, parent) {
  const childPath = toPosixPath(child).replace(/\/+$/, "");
  const parentPathValue = toPosixPath(parent).replace(/\/+$/, "");
  const caseFold = isWindowsAbsolute(childPath) || isWindowsAbsolute(parentPathValue);
  const left = caseFold ? childPath.toLowerCase() : childPath;
  const right = caseFold ? parentPathValue.toLowerCase() : parentPathValue;
  if (left === right) return true;
  return left.startsWith(`${right}/`);
}
function resolveAgainst(base, target) {
  if (isWindowsAbsolute(target) || isPosixAbsolute(target)) return target;
  return joinFsPath(base, target);
}

// src/real-machine-verification/evidence/manifest.ts
var EVIDENCE_MANIFEST_FILENAME = "evidence.json";
var RESERVED_MANIFEST_KEYS = /* @__PURE__ */ new Set([
  "schemaVersion",
  "generatedAt",
  "batch",
  "meta",
  "summary",
  "checks",
  "items",
  "candidate"
]);
function buildEvidenceManifest(input) {
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    batch: input.batch,
    meta: { ...input.meta },
    summary: { ...input.summary },
    checks: [...input.checks],
    items: [...input.items]
  };
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    if (!RESERVED_MANIFEST_KEYS.has(key)) manifest[key] = value;
  }
  if (input.candidate !== void 0) manifest.candidate = input.candidate;
  return manifest;
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStringRecord(value) {
  return isRecord3(value) && Object.values(value).every((entry) => typeof entry === "string");
}
var EVIDENCE_KINDS = /* @__PURE__ */ new Set(["text", "json", "screenshot", "log-slice", "command", "file"]);
function isEvidenceManifestItem(value) {
  if (!isRecord3(value)) return false;
  if (typeof value.kind !== "string" || !EVIDENCE_KINDS.has(value.kind)) return false;
  if (typeof value.path !== "string" || !isRecordablePath(value.path)) return false;
  if (typeof value.bytes !== "number" || !Number.isSafeInteger(value.bytes) || value.bytes < 0) return false;
  if (typeof value.sha256 !== "string" || !SHA256_RE.test(value.sha256)) return false;
  if (typeof value.capturedAt !== "string" || value.capturedAt.length === 0) return false;
  if (value.note !== void 0 && typeof value.note !== "string") return false;
  return true;
}
function isRecordablePath(value) {
  return value.length > 0 && !value.includes("\\") && value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
function invalidManifest(detail) {
  return err(
    failure(
      "invalid-input",
      `\u8BC1\u636E\u6E05\u5355\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF1A${detail}`,
      "evidence.json \u5FC5\u987B\u7531 dsh-verify evidence add \u5199\u51FA\uFF1B\u624B\u5DE5\u7F16\u8F91\u6216\u622A\u65AD\u4F1A\u5BFC\u81F4\u6821\u9A8C\u5931\u8D25"
    )
  );
}
function validateEvidenceManifest(value) {
  if (!isRecord3(value)) return invalidManifest("\u9876\u5C42\u4E0D\u662F\u4E00\u4E2A JSON \u5BF9\u8C61");
  if (value.schemaVersion !== SCHEMA_VERSION) return invalidManifest(`schemaVersion \u5E94\u4E3A ${SCHEMA_VERSION}`);
  if (typeof value.generatedAt !== "string" || value.generatedAt.length === 0) return invalidManifest("generatedAt \u7F3A\u5931");
  if (!isRecord3(value.batch)) return invalidManifest("\u7F3A\u5C11 batch \u6BB5");
  if (typeof value.batch.name !== "string" || value.batch.name.length === 0) return invalidManifest("batch.name \u7F3A\u5931");
  const batchName = parseBatchName(value.batch.name);
  if (!batchName.ok) return invalidManifest(`batch.name \u4E0D\u5408\u6CD5\uFF1A${value.batch.name}`);
  if (typeof value.batch.dir !== "string" || value.batch.dir.length === 0) return invalidManifest("batch.dir \u7F3A\u5931");
  if (typeof value.batch.root !== "string" || value.batch.root.length === 0) return invalidManifest("batch.root \u7F3A\u5931");
  if (!isStringRecord(value.meta)) return invalidManifest("meta \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6620\u5C04");
  if (!isRecord3(value.summary)) return invalidManifest("summary \u5FC5\u987B\u662F\u5BF9\u8C61");
  if (!Array.isArray(value.checks)) return invalidManifest("checks \u5FC5\u987B\u662F\u6570\u7EC4");
  if (!Array.isArray(value.items)) return invalidManifest("items \u5FC5\u987B\u662F\u6570\u7EC4");
  const badItem = value.items.findIndex((item) => !isEvidenceManifestItem(item));
  if (badItem >= 0) return invalidManifest(`items[${badItem}] \u4E0D\u662F\u5408\u6CD5\u7684\u8BC1\u636E\u9879`);
  if (value.candidate !== void 0 && !isRecord3(value.candidate)) return invalidManifest("candidate \u5FC5\u987B\u662F\u5BF9\u8C61");
  if (value.extra !== void 0 && !isRecord3(value.extra)) return invalidManifest("extra \u5FC5\u987B\u662F\u5BF9\u8C61");
  return ok(value);
}
async function loadEvidenceManifest(fs, evidenceRoot) {
  const manifestPath = joinFsPath(evidenceRoot, EVIDENCE_MANIFEST_FILENAME);
  if (!await fs.exists(manifestPath)) return ok(null);
  const content = await fs.readText(manifestPath);
  if (!content.ok) return content;
  let parsed;
  try {
    parsed = JSON.parse(content.value);
  } catch {
    return err(
      failure(
        "invalid-input",
        `\u8BC1\u636E\u6E05\u5355\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${manifestPath}`,
        "\u6587\u4EF6\u53EF\u80FD\u88AB\u622A\u65AD\u6216\u624B\u5DE5\u6539\u574F\uFF1B\u91CD\u65B0\u6536\u96C6\u8BC1\u636E\u53EF\u4EE5\u751F\u6210\u65B0\u6E05\u5355",
        { manifestPath }
      )
    );
  }
  const validated = validateEvidenceManifest(parsed);
  if (!validated.ok) return validated;
  return ok({
    manifest: validated.value,
    manifestPath,
    content: content.value,
    manifestSha256: sha256Text(content.value)
  });
}
function extraFieldsOf(manifest) {
  const extra = {};
  for (const [key, value] of Object.entries(manifest)) {
    if (!RESERVED_MANIFEST_KEYS.has(key)) extra[key] = value;
  }
  return extra;
}
function mergeEvidenceManifest(existing, input) {
  if (existing.batch.name !== input.batch.name) {
    return err(
      failure(
        "invalid-input",
        `\u8BC1\u636E\u6E05\u5355\u5C5E\u4E8E\u6279\u6B21 ${existing.batch.name}\uFF0C\u4E0D\u80FD\u5408\u5E76\u6279\u6B21 ${input.batch.name} \u7684\u8BC1\u636E`,
        "\u4E00\u4E2A evidence.json \u53EA\u80FD\u63CF\u8FF0\u4E00\u4E2A\u6279\u6B21"
      )
    );
  }
  if (!samePath(existing.batch.dir, input.batch.dir)) {
    return err(
      failure(
        "invalid-input",
        `\u8BC1\u636E\u6E05\u5355\u7684\u6279\u6B21\u76EE\u5F55\u4E0D\u4E00\u81F4\uFF1A${existing.batch.dir} / ${input.batch.dir}`,
        "\u4E00\u4E2A evidence.json \u53EA\u80FD\u63CF\u8FF0\u4E00\u4E2A\u6279\u6B21\u76EE\u5F55"
      )
    );
  }
  if (existing.candidate !== void 0 && input.candidate !== void 0 && canonicalJson(existing.candidate) !== canonicalJson(input.candidate)) {
    return err(
      failure(
        "identity-mismatch",
        "\u5019\u9009\u8EAB\u4EFD\u4E0E\u5DF2\u8BB0\u5F55\u7684\u8BC1\u636E\u6E05\u5355\u4E0D\u4E00\u81F4",
        "\u5019\u9009\u8EAB\u4EFD\u53EA\u80FD\u7531\u547D\u4EE4\u5C42\u4ECE\u6279\u6B21\u8BB0\u5F55\u6CE8\u5165\uFF1B\u5DF2\u5199\u4E0B\u7684 candidate \u4E0D\u80FD\u88AB\u540E\u7EED add \u6216 --extra \u6539\u5199"
      )
    );
  }
  const candidate = input.candidate ?? existing.candidate;
  const itemsByPath = /* @__PURE__ */ new Map();
  for (const item of existing.items) itemsByPath.set(item.path, item);
  for (const item of input.items) {
    const recorded = itemsByPath.get(item.path);
    if (recorded !== void 0) {
      if (recorded.sha256 !== item.sha256 || recorded.bytes !== item.bytes) {
        return err(
          failure(
            "conflict",
            `\u540C\u4E00\u8DEF\u5F84\u7684\u8BC1\u636E\u5185\u5BB9\u4E0D\u540C\uFF1A${item.path}`,
            "\u8BC1\u636E\u6587\u4EF6\u4E0D\u53EF\u8986\u76D6\uFF1B\u65B0\u8BC1\u636E\u5E94\u8BE5\u4F7F\u7528\u5E26\u5E8F\u53F7\u7684\u53E6\u4E00\u4E2A\u6587\u4EF6\u540D",
            { path: item.path, recordedSha256: recorded.sha256, incomingSha256: item.sha256 }
          )
        );
      }
      continue;
    }
    itemsByPath.set(item.path, item);
  }
  return ok(
    buildEvidenceManifest({
      generatedAt: input.generatedAt,
      batch: existing.batch,
      meta: { ...existing.meta, ...input.meta },
      summary: { ...existing.summary, ...input.summary },
      checks: [...existing.checks, ...input.checks],
      items: [...itemsByPath.values()],
      extra: { ...extraFieldsOf(existing), ...input.extra ?? {} },
      ...candidate === void 0 ? {} : { candidate }
    })
  );
}
async function writeEvidenceManifest(options) {
  const { fs, evidenceRoot, manifest } = options;
  const manifestPath = joinFsPath(evidenceRoot, EVIDENCE_MANIFEST_FILENAME);
  const made = await fs.makeDir(evidenceRoot);
  if (!made.ok) return made;
  const alreadyExists = await fs.exists(manifestPath);
  if (alreadyExists && options.replace !== true) {
    return err(
      failure(
        "conflict",
        `\u8BC1\u636E\u6E05\u5355\u5DF2\u5B58\u5728\uFF1A${manifestPath}`,
        "\u8BC1\u636E\u5305\u4E0D\u53EF\u8986\u76D6\uFF1B\u5982\u9700\u91CD\u65B0\u6536\u96C6\uFF0C\u8BF7\u5F00\u4E00\u4E2A\u65B0\u6279\u6B21\u76EE\u5F55",
        { manifestPath }
      )
    );
  }
  const content = `${JSON.stringify(manifest, null, 2)}
`;
  const temporaryPath = joinFsPath(evidenceRoot, `.${EVIDENCE_MANIFEST_FILENAME}.${process.pid}.tmp`);
  const written = await fs.writeText(temporaryPath, content);
  if (!written.ok) return written;
  const moved = await fs.move(temporaryPath, manifestPath);
  if (!moved.ok) {
    await fs.remove(temporaryPath, { recursive: false });
    return moved;
  }
  return ok({ manifest, manifestPath, content, manifestSha256: sha256Text(content) });
}

// src/real-machine-verification/runtime/dsh/git-state.ts
var GIT_TIMEOUT_MS = 6e4;
async function runGit(options, argv) {
  const outcome = await options.ports.command.run({
    argv,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs ?? GIT_TIMEOUT_MS
  });
  if (!outcome.ok) return outcome;
  if (outcome.value.timedOut) {
    return err({ code: "timeout", message: `${argv.join(" ")} timed out after ${outcome.value.durationMs}ms` });
  }
  return ok({ exitCode: outcome.value.exitCode ?? -1, stdout: outcome.value.stdout, stderr: outcome.value.stderr });
}
function commandFailure(argv, run) {
  const detail = (run.stderr.trim() || run.stdout.trim()).split(/\r?\n/).slice(0, 4).join("\n");
  return err({
    code: "prerequisite",
    message: `${argv.join(" ")} failed with exit code ${run.exitCode}${detail.length === 0 ? "" : `: ${detail}`}`,
    hint: "freeze must run inside a git work tree with git on PATH"
  });
}
function parsePorcelainZ(stdout) {
  const tokens = stdout.split("\0");
  const paths = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length === 0) continue;
    if (token.length < 4 || token[2] !== " ") {
      return err({ code: "invalid-input", message: `unexpected git status --porcelain entry: ${JSON.stringify(token)}` });
    }
    const status = token.slice(0, 2);
    const path = token.slice(3);
    if (status.includes("R") || status.includes("C")) {
      if (index + 1 >= tokens.length || tokens[index + 1].length === 0) {
        return err({ code: "invalid-input", message: `git status rename entry has no source path: ${JSON.stringify(token)}` });
      }
      index += 1;
    }
    paths.push(path);
  }
  return ok(paths.sort());
}
async function readGitState(options) {
  const headArgv = ["git", "rev-parse", "HEAD"];
  const headRun = await runGit(options, headArgv);
  if (!headRun.ok) return headRun;
  if (headRun.value.exitCode !== 0) return commandFailure(headArgv, headRun.value);
  const commit = parseCommitSha(headRun.value.stdout.trim());
  if (!commit.ok) {
    return err({
      code: "prerequisite",
      message: `git rev-parse HEAD printed ${JSON.stringify(headRun.value.stdout.trim())}, not a commit`
    });
  }
  const branchArgv = ["git", "rev-parse", "--abbrev-ref", "HEAD"];
  const branchRun = await runGit(options, branchArgv);
  if (!branchRun.ok) return branchRun;
  if (branchRun.value.exitCode !== 0) return commandFailure(branchArgv, branchRun.value);
  const branch = branchRun.value.stdout.trim();
  if (branch.length === 0) return err({ code: "prerequisite", message: "git rev-parse --abbrev-ref HEAD printed nothing" });
  const statusArgv = ["git", "status", "--porcelain", "-z", "--untracked-files=all"];
  const statusRun = await runGit(options, statusArgv);
  if (!statusRun.ok) return statusRun;
  if (statusRun.value.exitCode !== 0) return commandFailure(statusArgv, statusRun.value);
  const dirtyFiles = parsePorcelainZ(statusRun.value.stdout);
  if (!dirtyFiles.ok) return dirtyFiles;
  return ok({
    commit: commit.value,
    branch,
    dirty: dirtyFiles.value.length > 0,
    dirtyFiles: dirtyFiles.value
  });
}
function sameGitState(left, right) {
  if (left.commit !== right.commit) return false;
  if (left.dirtyFiles.length !== right.dirtyFiles.length) return false;
  return left.dirtyFiles.every((path, index) => path === right.dirtyFiles[index]);
}

// src/real-machine-verification/contracts/verification-profile.ts
var PROFILE_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
var NPM_PACKAGE_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
var BROWSER_MODULE_RE = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*(?:\/(?=[A-Za-z0-9._-]*[A-Za-z0-9])[A-Za-z0-9._-]+)*$/;
var JAVASCRIPT_IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
var RELATIVE_POSIX_PATH_RE = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
var DIR_NAME_RE = /^[A-Za-z0-9._-]+$/;
function invalid3(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function parseVerificationProfile(input) {
  if (typeof input !== "object" || input === null) {
    return invalid3("profile must be an object", "call defineVerificationProfile({ ... }) in verify/profile.ts");
  }
  if (typeof input.id !== "string" || !PROFILE_ID_RE.test(input.id)) {
    return invalid3(`profile id ${JSON.stringify(input.id)} is not lowercase kebab-case`);
  }
  if (typeof input.packageName !== "string" || !NPM_PACKAGE_RE.test(input.packageName)) {
    return invalid3(
      `profile packageName ${JSON.stringify(input.packageName)} is not an npm package name`,
      "it must match the name field of the plugin's package.json"
    );
  }
  if (typeof input.defaultProfile !== "string") {
    return invalid3("profile defaultProfile is required", "no implicit default is applied");
  }
  const defaultProfile = parseProfileName(input.defaultProfile);
  if (!defaultProfile.ok) return defaultProfile;
  const clientEntry = input.clientEntry ?? "lib/client.js";
  if (!RELATIVE_POSIX_PATH_RE.test(clientEntry)) {
    return invalid3(
      `clientEntry ${JSON.stringify(clientEntry)} must be a relative /-separated path inside the package`
    );
  }
  if (input.pluginCacheDir !== void 0 && !DIR_NAME_RE.test(input.pluginCacheDir)) {
    return invalid3(
      `pluginCacheDir ${JSON.stringify(input.pluginCacheDir)} must be a single directory name`,
      "it is joined under the instance working directory, not an absolute path"
    );
  }
  if (input.pluginSettingsDir !== void 0 && !DIR_NAME_RE.test(input.pluginSettingsDir)) {
    return invalid3(
      `pluginSettingsDir ${JSON.stringify(input.pluginSettingsDir)} must be a single directory name`,
      "it is joined under the redirected home directory, not an absolute path"
    );
  }
  if (input.bundledSkills !== void 0 && input.bundledSkills !== false) {
    const skills = input.bundledSkills;
    if (!RELATIVE_POSIX_PATH_RE.test(skills.dir)) {
      return invalid3(`bundledSkills.dir ${JSON.stringify(skills.dir)} must be a relative /-separated path`);
    }
    if (!Number.isInteger(skills.expected) || skills.expected < 0) {
      return invalid3(`bundledSkills.expected must be a non-negative integer, got ${String(skills.expected)}`);
    }
  }
  if (input.model !== void 0 && input.model !== false) {
    const model = input.model;
    for (const field of ["provider", "model", "apiKeyEnv"]) {
      const value = model[field];
      if (typeof value !== "string" || value.length === 0) {
        return invalid3(`model.${field} must be a non-empty string`);
      }
    }
    if (model.contextWindow !== void 0 && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      return invalid3("model.contextWindow must be a positive integer");
    }
    if (model.maxTokens !== void 0 && (!Number.isInteger(model.maxTokens) || model.maxTokens <= 0)) {
      return invalid3("model.maxTokens must be a positive integer");
    }
  }
  if (input.browser !== void 0 && input.browser !== false) {
    if (typeof input.browser !== "object" || input.browser === null) {
      return invalid3(
        "browser must be an object { module, exportName? } or false",
        'omit it, set false, or declare browser: { module: "verify/browser.mjs" }'
      );
    }
    if (typeof input.browser.module !== "string" || !BROWSER_MODULE_RE.test(input.browser.module)) {
      return invalid3(
        `browser.module ${JSON.stringify(input.browser.module)} must be a relative /-separated path or a package name`,
        "for example verify/browser.mjs or @scope/browser-adapter; absolute paths and .. are rejected"
      );
    }
    if (input.browser.exportName !== void 0 && (typeof input.browser.exportName !== "string" || !JAVASCRIPT_IDENTIFIER_RE.test(input.browser.exportName))) {
      return invalid3(
        `browser.exportName ${JSON.stringify(input.browser.exportName)} must be a JavaScript identifier`,
        "omit it to use the module's default export"
      );
    }
  }
  if (input.ticketFace !== void 0 && input.ticketFace !== false) {
    if (typeof input.ticketFace !== "object" || input.ticketFace === null) {
      return invalid3(
        "ticketFace must be an object { module, exportName? } or false",
        'omit it, set false, or declare ticketFace: { module: "verify/ticket-face.mjs" }'
      );
    }
    if (typeof input.ticketFace.module !== "string" || !BROWSER_MODULE_RE.test(input.ticketFace.module)) {
      return invalid3(
        `ticketFace.module ${JSON.stringify(input.ticketFace.module)} must be a relative /-separated path or a package name`,
        "for example verify/ticket-face.mjs or @scope/ticket-face; absolute paths and .. are rejected"
      );
    }
    if (input.ticketFace.exportName !== void 0 && (typeof input.ticketFace.exportName !== "string" || !JAVASCRIPT_IDENTIFIER_RE.test(input.ticketFace.exportName))) {
      return invalid3(
        `ticketFace.exportName ${JSON.stringify(input.ticketFace.exportName)} must be a JavaScript identifier`,
        "omit it to use the module's default export"
      );
    }
  }
  if (input.build !== void 0) {
    if (typeof input.build.command !== "string" || input.build.command.trim().length === 0) {
      return invalid3("build.command must be a non-empty shell command");
    }
    if (input.build.timeoutMs !== void 0 && (!Number.isInteger(input.build.timeoutMs) || input.build.timeoutMs <= 0)) {
      return invalid3("build.timeoutMs must be a positive integer");
    }
  }
  if (input.checks !== void 0) {
    for (const check of input.checks) {
      const id = parseCheckId(String(check.id));
      if (!id.ok) return id;
      if (typeof check.title !== "string" || check.title.trim().length === 0) {
        return invalid3(`check ${check.id} needs a title`);
      }
      if (typeof check.run !== "function") {
        return invalid3(`check ${check.id} needs a run function`);
      }
    }
  }
  const workspaceBackends = input.workspaceBackends ?? [];
  for (const backend of workspaceBackends) {
    if (typeof backend !== "string" || backend.length === 0) {
      return invalid3("workspaceBackends entries must be non-empty strings");
    }
  }
  const instanceEnvAllowlist = input.instanceEnvAllowlist ?? [];
  for (const name of instanceEnvAllowlist) {
    if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return invalid3(`instanceEnvAllowlist entry ${JSON.stringify(name)} is not an environment variable name`);
    }
  }
  const profile = {
    id: input.id,
    packageName: input.packageName,
    defaultProfile: defaultProfile.value,
    clientEntry,
    ...input.pluginCacheDir === void 0 ? {} : { pluginCacheDir: input.pluginCacheDir },
    ...input.pluginSettingsDir === void 0 ? {} : { pluginSettingsDir: input.pluginSettingsDir },
    bundledSkills: input.bundledSkills === false || input.bundledSkills === void 0 ? input.bundledSkills ?? false : { dir: input.bundledSkills.dir, expected: input.bundledSkills.expected },
    model: input.model === false || input.model === void 0 ? false : { ...input.model },
    browser: input.browser === false || input.browser === void 0 ? false : {
      module: input.browser.module,
      ...input.browser.exportName === void 0 ? {} : { exportName: input.browser.exportName }
    },
    ticketFace: input.ticketFace === false || input.ticketFace === void 0 ? false : {
      module: input.ticketFace.module,
      ...input.ticketFace.exportName === void 0 ? {} : { exportName: input.ticketFace.exportName }
    },
    workspaceBackends: [...workspaceBackends],
    ...input.build === void 0 ? {} : { build: { command: input.build.command, timeoutMs: input.build.timeoutMs ?? 20 * 6e4 } },
    instanceEnvAllowlist: [...instanceEnvAllowlist],
    ...input.hooks === void 0 ? {} : { hooks: input.hooks },
    checks: [...input.checks ?? []]
  };
  return ok(Object.freeze(profile));
}
function resolveProfile(profile, override) {
  if (override === void 0) return ok(profile.defaultProfile);
  return parseProfileName(override);
}

// src/real-machine-verification/declaration/loader.ts
import { pathToFileURL } from "node:url";
var NODE_MIN_FOR_TYPESCRIPT = "22.6.0";
var NODE_MIN_FOR_JAVASCRIPT = "18.0.0";
var DECLARATION_RELATIVE_PATH = "verify/profile.ts";
var DECLARATION_SEARCH_PATHS = [
  DECLARATION_RELATIVE_PATH,
  "verify/profile.js",
  "verify/profile.mjs"
];
var DECLARATION_TEMPLATE_SPECIFIER = "dsh-featherhunter-plugin-base/real-machine-verification";
var DOUBLE_QUOTE = String.fromCharCode(34);
var DECLARATION_TEMPLATE = `import { defineVerificationProfile } from ${DOUBLE_QUOTE}${DECLARATION_TEMPLATE_SPECIFIER}${DOUBLE_QUOTE};

export default defineVerificationProfile({
  id: "my-plugin",
  packageName: "my-plugin",
  defaultProfile: "web",
  clientEntry: "lib/client.js",
});
`;
var nativeImport = (specifier) => {
  const load = new Function("specifier", "return import(specifier);");
  return load(specifier);
};
function parseNodeVersion(value) {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value.trim());
  if (match === null) return [0, 0, 0];
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}
function compareNodeVersions(left, right) {
  const a = parseNodeVersion(left);
  const b = parseNodeVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
function meetsNodeVersion(current, minimum) {
  return compareNodeVersions(current, minimum) >= 0;
}
function declarationKindFor(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts") || lower.endsWith(".mts")) return "ts";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "js";
  return null;
}
function nodeRequirementFor(kind) {
  return kind === "ts" ? NODE_MIN_FOR_TYPESCRIPT : NODE_MIN_FOR_JAVASCRIPT;
}
function declarationFailure(kind, code, message, hint) {
  return err({ ...failure(code, message, hint), kind });
}
function missingDeclarationHint() {
  return `create ${DECLARATION_RELATIVE_PATH} in the plugin repository root:

${DECLARATION_TEMPLATE}`;
}
async function locateDeclaration(options) {
  const { fs, cwd } = options;
  if (options.declarationPath !== void 0) {
    const path = isWindowsAbsolute(options.declarationPath) || isPosixAbsolute(options.declarationPath) ? options.declarationPath : resolveAgainst(cwd, options.declarationPath);
    if (!await fs.exists(path)) {
      return declarationFailure(
        "blocked",
        "prerequisite",
        `the --declaration file does not exist: ${path}`,
        missingDeclarationHint()
      );
    }
    const kind = declarationKindFor(path);
    if (kind === null) {
      return declarationFailure(
        "blocked",
        "unsupported",
        `the declaration ${path} has an extension this tool cannot import`,
        "use a .ts declaration (Node 22.6+), or compile it to .js/.mjs and pass that file"
      );
    }
    return { ok: true, value: { path, kind } };
  }
  for (const relative of DECLARATION_SEARCH_PATHS) {
    const candidate = joinFsPath(cwd, relative);
    if (!await fs.exists(candidate)) continue;
    const kind = declarationKindFor(candidate);
    if (kind === null) continue;
    return { ok: true, value: { path: candidate, kind } };
  }
  return declarationFailure(
    "blocked",
    "prerequisite",
    `no verification declaration found under ${cwd}`,
    missingDeclarationHint()
  );
}
function errorCode(error) {
  if (error === null || typeof error !== "object") return null;
  const code = error.code;
  return typeof code === "string" ? code : null;
}
function describeThrown(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function classifyImportFailure(error, path, kind) {
  const code = errorCode(error);
  const message = describeThrown(error);
  const olderRuntimeCodes = /* @__PURE__ */ new Set([
    "ERR_UNKNOWN_FILE_EXTENSION",
    "ERR_UNSUPPORTED_ESM_URL_SCHEME",
    "ERR_UNKNOWN_MODULE_FORMAT"
  ]);
  const resolutionCodes = /* @__PURE__ */ new Set([
    "ERR_MODULE_NOT_FOUND",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
    "ERR_UNSUPPORTED_DIR_IMPORT"
  ]);
  if (code !== null && resolutionCodes.has(code)) {
    const missingPackage = /Cannot find package '([^']+)'/.exec(message)?.[1] ?? null;
    if (missingPackage !== null) {
      return declarationFailure(
        "blocked",
        "prerequisite",
        `the declaration ${path} imports package ${missingPackage}, which is not installed in this repository: ${message}`,
        `install ${missingPackage} in the plugin repository (a declaration resolves its imports from there), then rerun self-check`
      );
    }
    return declarationFailure(
      code === "ERR_MODULE_NOT_FOUND" ? "failed" : "blocked",
      code === "ERR_MODULE_NOT_FOUND" ? "invalid-input" : "prerequisite",
      `the declaration ${path} could not resolve its imports: ${message}`,
      code === "ERR_MODULE_NOT_FOUND" ? "the declaration imports a file that does not exist; fix the specifier" : "install a version of the imported package that exports the declared entry point, then rerun self-check"
    );
  }
  if (code !== null && olderRuntimeCodes.has(code)) {
    const minimum = nodeRequirementFor(kind);
    return declarationFailure(
      "blocked",
      "unsupported",
      `Node could not import ${path} (it needs Node ${minimum}+ for a ${kind === "ts" ? "TypeScript" : "module"} declaration): ${code}`,
      `upgrade Node to ${minimum}+, or compile the declaration with tsc and pass the resulting .js file via --declaration`
    );
  }
  if (error instanceof SyntaxError) {
    return declarationFailure(
      "failed",
      "invalid-input",
      `the declaration ${path} has a syntax error: ${describeThrown(error)}`,
      "fix the syntax error, then rerun self-check"
    );
  }
  const invalidProfile = /^verification profile is invalid: (.+)$/.exec(message);
  if (invalidProfile !== null) {
    const detail = invalidProfile[1].split(" \u2014 ")[0] ?? invalidProfile[1];
    return declarationFailure(
      "failed",
      "invalid-input",
      `the declaration ${path} defines an invalid profile: ${detail}`,
      profileFieldHint(detail)
    );
  }
  return declarationFailure(
    "failed",
    "invalid-input",
    `the declaration ${path} threw while loading: ${describeThrown(error)}`,
    "the declaration must only define the profile; move side effects out of it"
  );
}
function profileFieldHint(message) {
  if (message.includes("defaultProfile")) {
    return 'add defaultProfile: "<name>" to defineVerificationProfile({ ... }); the name is a profile under <DSH_HOME>/profiles that DSH creates when you open it';
  }
  if (message.includes("clientEntry")) {
    return 'add clientEntry to defineVerificationProfile({ ... }); it is the package-relative path of the built client entry, for example "lib/client.js"';
  }
  return "fix the field named in the message; the declaration in the README shows a valid minimal profile";
}
var NAMED_EXPORT_CANDIDATES = ["profile", "verificationProfile", "declaration"];
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function selectDeclarationValue(namespace, path) {
  if (!isPlainObject(namespace)) {
    return declarationFailure(
      "failed",
      "invalid-input",
      `the declaration ${path} did not load as a module`,
      "export the profile from verify/profile.ts"
    );
  }
  for (const name of ["default", ...NAMED_EXPORT_CANDIDATES]) {
    if (Object.prototype.hasOwnProperty.call(namespace, name) && namespace[name] !== void 0) {
      return { ok: true, value: { value: namespace[name], exportName: name } };
    }
  }
  const objectExports = Object.entries(namespace).filter(
    ([name, value]) => name !== "__esModule" && isPlainObject(value) && "packageName" in value
  );
  if (objectExports.length === 1) {
    const [name, value] = objectExports[0];
    return { ok: true, value: { value, exportName: name } };
  }
  if (objectExports.length > 1) {
    const names = objectExports.map(([name]) => name).join(", ");
    return declarationFailure(
      "failed",
      "invalid-input",
      `the declaration ${path} exports more than one profile-like object (${names})`,
      "export exactly one: export default defineVerificationProfile({ ... })"
    );
  }
  return declarationFailure(
    "failed",
    "invalid-input",
    `the declaration ${path} does not export a verification profile`,
    "export default defineVerificationProfile({ ... }), or a plain profile object"
  );
}
async function loadVerificationDeclaration(options) {
  const located = await locateDeclaration(options);
  if (!located.ok) return located;
  const { path, kind } = located.value;
  const requiredNode = nodeRequirementFor(kind);
  if (!meetsNodeVersion(options.nodeVersion, requiredNode)) {
    return declarationFailure(
      "blocked",
      "unsupported",
      `a ${kind === "ts" ? "TypeScript" : "module"} declaration needs Node ${requiredNode}+, this run is Node ${options.nodeVersion}`,
      `upgrade Node to ${requiredNode}+, or compile the declaration with tsc and pass the resulting .js file via --declaration`
    );
  }
  let namespace;
  try {
    namespace = await (options.importModule ?? nativeImport)(pathToFileURL(path).href);
  } catch (error) {
    return classifyImportFailure(error, path, kind);
  }
  const selected = selectDeclarationValue(namespace, path);
  if (!selected.ok) return selected;
  const parsed = parseVerificationProfile(selected.value.value);
  if (!parsed.ok) {
    return err({
      ...parsed.error,
      kind: "failed",
      hint: parsed.error.hint ?? "fix the declaration fields; DECLARATION_TEMPLATE in the README shows a valid minimal profile"
    });
  }
  return {
    ok: true,
    value: {
      path,
      kind,
      exportName: selected.value.exportName,
      profile: parsed.value,
      requiredNode
    }
  };
}

// src/real-machine-verification/runtime/fs-utils.ts
var MAX_WALK_DEPTH = 32;
async function walkFiles(fs, root) {
  const stat2 = await fs.stat(root);
  if (!stat2.ok) return stat2;
  const collected = [];
  const visit = async (absolute, relative, depth) => {
    if (depth > MAX_WALK_DEPTH) {
      return err({
        code: "io",
        message: `directory tree under ${root} is deeper than ${MAX_WALK_DEPTH} levels`,
        hint: "a symlink loop or an unpacked archive is inside the tree; inspect it before retrying"
      });
    }
    const listed = await fs.list(absolute);
    if (!listed.ok) return listed;
    for (const entry of listed.value) {
      const childAbsolute = joinFsPath(absolute, entry.name);
      const childRelative = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      if (entry.kind === "directory") {
        collected.push({ relativePath: childRelative, absolutePath: childAbsolute, kind: "directory", bytes: 0 });
        const nested = await visit(childAbsolute, childRelative, depth + 1);
        if (!nested.ok) return nested;
        continue;
      }
      if (entry.kind === "file") {
        const details = await fs.stat(childAbsolute);
        if (!details.ok) return details;
        collected.push({
          relativePath: childRelative,
          absolutePath: childAbsolute,
          kind: "file",
          bytes: details.value.size
        });
        continue;
      }
      collected.push({ relativePath: childRelative, absolutePath: childAbsolute, kind: entry.kind, bytes: 0 });
    }
    return ok(void 0);
  };
  if (stat2.value.kind === "directory") {
    const failure2 = await visit(root, "", 0);
    if (!failure2.ok) return failure2;
  } else {
    collected.push({
      relativePath: baseName(root),
      absolutePath: root,
      kind: stat2.value.kind,
      bytes: stat2.value.size
    });
  }
  collected.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  return ok(collected);
}
async function measureTree(fs, root) {
  if (!await fs.exists(root)) return ok({ files: 0, directories: 0, bytes: 0 });
  const walked = await walkFiles(fs, root);
  if (!walked.ok) return walked;
  let files = 0;
  let directories = 0;
  let bytes = 0;
  for (const entry of walked.value) {
    if (entry.kind === "file") {
      files += 1;
      bytes += entry.bytes;
    } else if (entry.kind === "directory") {
      directories += 1;
    }
  }
  return ok({ files, directories, bytes });
}
function deleteGuardReason(target, protectedPaths = []) {
  if (target.length === 0) return "path is empty";
  const absolute = isWindowsAbsolute(target) || isPosixAbsolute(target);
  if (!absolute) return `path is not absolute: ${target}`;
  if (depthOf(target) < 3) return `path has fewer than three segments: ${target}`;
  const normalizedTarget = toPosixPath(target).replace(/\/+$/, "").toLowerCase();
  for (const protectedPath of protectedPaths) {
    const normalizedProtected = toPosixPath(protectedPath).replace(/\/+$/, "").toLowerCase();
    if (normalizedProtected.length > 0 && normalizedTarget === normalizedProtected) {
      return `path is a protected root: ${target}`;
    }
  }
  return null;
}
async function removeTree(fs, target, options = {}) {
  const reason = deleteGuardReason(target, options.protectedPaths ?? []);
  if (reason !== null) {
    return err({ code: "invalid-input", message: `refusing to delete: ${reason}`, hint: "check the path computation" });
  }
  if (!await fs.exists(target)) return ok(void 0);
  return fs.remove(target, { recursive: options.recursive ?? true });
}

// src/real-machine-verification/runtime/dsh/home.ts
function resolveRealHome(env) {
  const userProfile = env.get("USERPROFILE") ?? env.homeDir();
  return joinFsPath(userProfile, ".dsh");
}
async function canonicalPath(fs, path) {
  const resolved = await fs.realPath(path);
  return resolved.ok ? resolved.value : path;
}
async function findWriteUnderRealHome(options) {
  const realHome = resolveRealHome(options.env);
  const realHomeCanonical = await canonicalPath(options.fs, realHome);
  const candidates = [];
  if (options.dshHome !== void 0) candidates.push({ flag: "DSH_HOME", value: options.dshHome });
  for (const target of options.writeTargets ?? []) candidates.push(target);
  for (const candidate of candidates) {
    const absolute = resolveAgainst(options.cwd, candidate.value);
    if (isInsidePath(absolute, realHome)) return { realHome, flag: candidate.flag, value: absolute };
    const canonical = await canonicalPath(options.fs, absolute);
    if (isInsidePath(canonical, realHomeCanonical) || isInsidePath(canonical, realHome)) {
      return { realHome, flag: candidate.flag, value: absolute };
    }
  }
  return null;
}
async function copyProfile(options) {
  const { fs, sourceHome, targetHome, profile } = options;
  const sourceProfileDir = joinFsPath(sourceHome, "profiles", profile);
  const targetProfileDir = joinFsPath(targetHome, "profiles", profile);
  const sourceStat = await fs.stat(sourceProfileDir);
  if (!sourceStat.ok) {
    return err({
      code: "prerequisite",
      message: `source profile directory does not exist: ${sourceProfileDir}`,
      hint: "open DSH once with this profile, or pass --source-home pointing at a home that has it"
    });
  }
  if (sourceStat.value.kind !== "directory") {
    return err({ code: "prerequisite", message: `source profile is not a directory: ${sourceProfileDir}` });
  }
  const targetExists = await fs.exists(targetHome);
  if (targetExists) {
    if (options.force !== true) {
      return err({
        code: "conflict",
        message: `target home already exists: ${targetHome}`,
        hint: "pass --force to replace it, or choose a new batch name"
      });
    }
    const removed = await removeTree(fs, targetHome);
    if (!removed.ok) return removed;
  }
  const created = await fs.makeDir(joinFsPath(targetHome, "profiles"));
  if (!created.ok) return created;
  const copied = await fs.copy(sourceProfileDir, targetProfileDir, { recursive: true });
  if (!copied.ok) return copied;
  let removedLogDirectory = null;
  if (options.pluginCacheDir !== void 0 && options.pluginCacheDir.length > 0) {
    const logDirectory = joinFsPath(targetProfileDir, options.pluginCacheDir, "logs");
    if (await fs.exists(logDirectory)) {
      const removed = await removeTree(fs, logDirectory);
      if (!removed.ok) return removed;
      removedLogDirectory = logDirectory;
    }
  }
  const measured = await measureTree(fs, targetProfileDir);
  if (!measured.ok) return measured;
  return ok({
    sourceProfileDir,
    targetProfileDir,
    files: measured.value.files,
    bytes: measured.value.bytes,
    removedLogDirectory
  });
}

// src/real-machine-verification/orchestration/context.ts
function profileFailure(failure2) {
  return { stage: "profile", failure: failure2 };
}
function resolveWorkRoot(cwd, raw) {
  if (raw === void 0) return joinFsPath(cwd, ".scratch", "verify");
  return isWindowsAbsolute(raw) || isPosixAbsolute(raw) ? raw : resolveAgainst(cwd, raw);
}
function resolveDshHome(ports) {
  const configured = ports.env.get("DSH_HOME")?.trim();
  if (configured !== void 0 && configured.length > 0) {
    return isWindowsAbsolute(configured) || isPosixAbsolute(configured) ? configured : resolveAgainst(ports.env.cwd(), configured);
  }
  return resolveRealHome(ports.env);
}
function profileDirectory(dshHome, profile) {
  return joinFsPath(dshHome, "profiles", profile);
}
async function loadDeclarationContext(options) {
  const { ports, cwd } = options;
  const workRoot = resolveWorkRoot(cwd, options.workRoot);
  const dshHome = resolveDshHome(ports);
  const loadOptions = {
    fs: ports.fs,
    cwd,
    nodeVersion: options.nodeVersion,
    ...options.declarationPath === void 0 ? {} : { declarationPath: options.declarationPath }
  };
  const loaded = await (options.loadDeclaration ?? loadVerificationDeclaration)(loadOptions);
  if (!loaded.ok) return err({ stage: "declaration", failure: loaded.error });
  const declaration = loaded.value;
  const resolved = resolveProfile(declaration.profile, options.profileOverride);
  if (!resolved.ok) return err(profileFailure(resolved.error));
  return ok({
    cwd,
    workRoot,
    dshHome,
    declaration,
    profileName: resolved.value,
    profile: declaration.profile,
    profileDir: profileDirectory(dshHome, resolved.value)
  });
}

// src/real-machine-verification/orchestration/batch.ts
var BATCHES_DIRNAME = "batches";
var BATCH_RECORD_FILENAME = "batch.json";
var BATCH_CANDIDATES_DIRNAME = "candidates";
var BATCH_CANDIDATE_FILENAME = "candidate.json";
var EVIDENCE_SCAN_DEPTH = 8;
function batchesRoot(workRoot) {
  return joinFsPath(workRoot, BATCHES_DIRNAME);
}
function batchDirFor(workRoot, name) {
  return joinFsPath(batchesRoot(workRoot), name);
}
function batchFailure(stage, code, message, options = {}) {
  return {
    code,
    message,
    stage,
    blocked: options.blocked ?? false,
    ...options.hint === void 0 ? {} : { hint: options.hint },
    ...options.details === void 0 ? {} : { details: options.details }
  };
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function short(value, length = 12) {
  return value.length <= length ? value : value.slice(0, length);
}
function checkId(value) {
  const parsed = parseCheckId(value);
  if (!parsed.ok) throw new Error(`batch check id ${value} is invalid: ${parsed.error.message}`);
  return parsed.value;
}
function defaultBatchName(ports) {
  const stamp = ports.clock.iso().replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
  return parseBatchName(`batch-${stamp.length === 0 ? "now" : stamp}`);
}
function relativeTo(root, path) {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const normalizedPath = path.replace(/\\/g, "/");
  return normalizedPath.startsWith(`${normalizedRoot}/`) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}
function describeRef(ref) {
  return ref.length === 0 ? "(empty ref)" : ref;
}
async function loadBatchRecord(fs, batchDir) {
  const path = joinFsPath(batchDir, BATCH_RECORD_FILENAME);
  if (!await fs.exists(path)) {
    return err(
      batchFailure("record", "not-found", `no batch record at ${path}`, {
        hint: "open a batch first: dsh-verify batch open --name <name> --base-ref <ref>",
        blocked: true,
        details: { path }
      })
    );
  }
  const text = await fs.readText(path);
  if (!text.ok) {
    return err(
      batchFailure("record", "io", `could not read the batch record ${path}: ${text.error.message}`, {
        blocked: true,
        details: { path }
      })
    );
  }
  let value;
  try {
    value = JSON.parse(text.value);
  } catch (error) {
    return err(
      batchFailure("record", "invalid-input", `batch record ${path} is not valid JSON: ${error.message}`, {
        hint: "the record is machine-written; delete the batch directory and open the batch again",
        blocked: true,
        details: { path }
      })
    );
  }
  const parsed = parseBatchRecord(value);
  if (!parsed.ok) {
    return err(
      batchFailure("record", "invalid-input", `batch record ${path} does not match this version: ${parsed.error.message}`, {
        ...parsed.error.hint === void 0 ? {} : { hint: parsed.error.hint },
        blocked: true,
        details: { path }
      })
    );
  }
  return ok({
    record: parsed.value,
    raw: isRecord4(value) ? value : {},
    path,
    batchDir,
    text: text.value
  });
}
async function latestBatchRecord(fs, workRoot) {
  const root = batchesRoot(workRoot);
  const listed = await fs.list(root);
  if (!listed.ok) {
    return err(
      batchFailure("record", "not-found", `no batch directory at ${root}`, {
        hint: "open a batch first: dsh-verify batch open --name <name> --base-ref <ref>",
        blocked: true,
        details: { path: root }
      })
    );
  }
  const dirs = listed.value.filter((entry) => entry.kind === "directory").map((entry) => joinFsPath(root, entry.name)).sort();
  if (dirs.length === 0) {
    return err(
      batchFailure("record", "not-found", `no batch under ${root}`, {
        hint: "open a batch first: dsh-verify batch open --name <name> --base-ref <ref>",
        blocked: true,
        details: { path: root }
      })
    );
  }
  const loaded = [];
  let firstFailure = null;
  for (const dir of dirs) {
    const record = await loadBatchRecord(fs, dir);
    if (record.ok) loaded.push(record.value);
    else if (firstFailure === null) firstFailure = record.error;
  }
  if (loaded.length === 0 || firstFailure !== null && loaded.length === 0) {
    return err(firstFailure ?? batchFailure("record", "not-found", `no readable batch record under ${root}`, { blocked: true }));
  }
  loaded.sort(
    (left, right) => Date.parse(right.record.createdAt) - Date.parse(left.record.createdAt) || (left.batchDir < right.batchDir ? 1 : -1)
  );
  const newest = loaded[0];
  if (newest === void 0) {
    return err(batchFailure("record", "not-found", `no readable batch record under ${root}`, { blocked: true }));
  }
  return ok(newest);
}
async function resolveBatchForStatus(fs, workRoot, rawName) {
  if (rawName === void 0) return latestBatchRecord(fs, workRoot);
  const name = parseBatchName(rawName);
  if (!name.ok) {
    return err(
      batchFailure("context", "invalid-input", `--name is not a valid batch name: ${rawName}`, {
        hint: "use 1-64 characters from A-Z a-z 0-9 . _ - (at least one letter or digit)",
        blocked: true
      })
    );
  }
  return loadBatchRecord(fs, batchDirFor(workRoot, name.value));
}
async function readCandidateFile(fs, manifestPath) {
  const text = await fs.readText(manifestPath);
  if (!text.ok) {
    return err(
      batchFailure("candidate", "io", `could not read the candidate manifest ${manifestPath}: ${text.error.message}`, {
        hint: "run dsh-verify freeze, or pass --candidate with the directory it wrote",
        blocked: true,
        details: { path: manifestPath }
      })
    );
  }
  let value;
  try {
    value = JSON.parse(text.value);
  } catch (error) {
    return err(
      batchFailure("candidate", "invalid-input", `candidate manifest ${manifestPath} is not valid JSON: ${error.message}`, {
        hint: "re-run dsh-verify freeze",
        blocked: true,
        details: { path: manifestPath }
      })
    );
  }
  const parsed = parseCandidateManifest(value);
  if (!parsed.ok) {
    return err(
      batchFailure("candidate", "invalid-input", `candidate manifest ${manifestPath} is not usable: ${parsed.error.message}`, {
        ...parsed.error.hint === void 0 ? {} : { hint: parsed.error.hint },
        blocked: true,
        details: { path: manifestPath }
      })
    );
  }
  const manifestSha256 = sha256Text(text.value);
  return ok({
    manifest: parsed.value,
    manifestPath,
    dir: parentPath(manifestPath) ?? manifestPath,
    manifestSha256,
    identity: candidateIdentityOf(parsed.value, manifestPath, manifestSha256)
  });
}
async function resolveCandidate(fs, workRoot, explicit) {
  if (explicit !== void 0) {
    const manifestPath = explicit.toLowerCase().endsWith(".json") ? explicit : joinFsPath(explicit, BATCH_CANDIDATE_FILENAME);
    if (!await fs.exists(manifestPath)) {
      return err(
        batchFailure("candidate", "not-found", `no candidate manifest at ${manifestPath}`, {
          hint: "pass --candidate <dir> with the directory dsh-verify freeze wrote (or omit it to use the newest one)",
          blocked: true,
          details: { path: manifestPath }
        })
      );
    }
    return readCandidateFile(fs, manifestPath);
  }
  const root = joinFsPath(workRoot, BATCH_CANDIDATES_DIRNAME);
  const listed = await fs.list(root);
  if (!listed.ok) {
    return err(
      batchFailure("candidate", "not-found", `no candidate directory at ${root}`, {
        hint: "run dsh-verify freeze first, or pass --candidate <dir>",
        blocked: true,
        details: { path: root }
      })
    );
  }
  const dirs = listed.value.filter((entry) => entry.kind === "directory").map((entry) => joinFsPath(root, entry.name)).sort();
  const candidates = [];
  let lastFailure = null;
  for (const dir of dirs) {
    const read = await readCandidateFile(fs, joinFsPath(dir, BATCH_CANDIDATE_FILENAME));
    if (read.ok) candidates.push(read.value);
    else lastFailure = read.error;
  }
  if (candidates.length === 0) {
    return err(
      lastFailure === null ? batchFailure("candidate", "not-found", `no candidate manifest under ${root}`, {
        hint: "run dsh-verify freeze first, or pass --candidate <dir>",
        blocked: true,
        details: { path: root }
      }) : batchFailure("candidate", lastFailure.code, `no readable candidate manifest under ${root}: ${lastFailure.message}`, {
        ...lastFailure.hint === void 0 ? {} : { hint: lastFailure.hint },
        blocked: true,
        details: { path: root }
      })
    );
  }
  candidates.sort(
    (left, right) => Date.parse(right.manifest.generatedAt) - Date.parse(left.manifest.generatedAt) || (left.manifestPath < right.manifestPath ? 1 : -1)
  );
  const newest = candidates[0];
  if (newest === void 0) {
    return err(batchFailure("candidate", "not-found", `no candidate manifest under ${root}`, { blocked: true }));
  }
  return ok(newest);
}
async function readTargetPackage(fs, cwd) {
  const path = joinFsPath(cwd, "package.json");
  const read = await fs.readJson(path);
  if (!read.ok) {
    return err(
      batchFailure("context", "prerequisite", `could not read ${path}: ${read.error.message}`, {
        hint: "run batch open from the plugin repository root",
        blocked: true,
        details: { path }
      })
    );
  }
  if (!isRecord4(read.value)) {
    return err(
      batchFailure("context", "prerequisite", `${path} is not a JSON object`, {
        hint: "run batch open from the plugin repository root",
        blocked: true
      })
    );
  }
  const name = typeof read.value.name === "string" ? read.value.name : null;
  const version = typeof read.value.version === "string" ? read.value.version : null;
  if (name === null || name.length === 0 || version === null || version.length === 0) {
    return err(
      batchFailure("context", "prerequisite", `${path} has no name/version`, {
        hint: "a batch needs the package name and the version it is supposed to verify",
        blocked: true
      })
    );
  }
  return ok({ path, name, version });
}
async function readRefTip(ports, cwd, ref) {
  const argv = ["git", "rev-parse", "--verify", `${ref}^{commit}`];
  const run = await ports.command.run({ argv, cwd, timeoutMs: 15e3 });
  if (!run.ok) {
    return err(
      batchFailure("baseline", "prerequisite", `git could not run while reading baseline ${describeRef(ref)}: ${run.error.message}`, {
        hint: "install git and run inside the plugin repository",
        blocked: true,
        details: { ref, argv }
      })
    );
  }
  const outcome = run.value;
  if (outcome.exitCode !== 0) {
    const stderr = outcome.stderr.trim().split(/\r?\n/)[0] ?? "";
    return err(
      batchFailure(
        "baseline",
        "prerequisite",
        `git rev-parse --verify ${ref}^{commit} failed with exit code ${String(outcome.exitCode)}${stderr.length === 0 ? "" : `: ${stderr}`}`,
        {
          hint: `fetch ${describeRef(ref)} locally (git fetch origin ${ref}), or open the batch without --base-ref to record the explicit "no baseline" state`,
          blocked: true,
          details: { ref, exitCode: outcome.exitCode }
        }
      )
    );
  }
  const tip = parseCommitSha(outcome.stdout.trim());
  if (!tip.ok) {
    return err(
      batchFailure("baseline", "prerequisite", `reading baseline ${describeRef(ref)} printed no full commit sha`, {
        hint: `check that ${describeRef(ref)} names a commit`,
        blocked: true,
        details: { ref, stdout: outcome.stdout.trim().slice(0, 200) }
      })
    );
  }
  return ok(tip.value);
}
function sameCandidateIdentity(left, right) {
  return left.commit === right.commit && left.sha256 === right.sha256 && left.tgzSha256 === right.tgzSha256 && left.version === right.version;
}
function describeRecordIdentity(record) {
  const base = record.base === null ? "no baseline" : `${record.base.ref}@${short(record.base.tip)} (target ${record.base.expectedVersion})`;
  const candidate = record.candidate === null || record.candidate === void 0 ? "no candidate" : `${short(record.candidate.commit)} manifest ${short(record.candidate.sha256)}`;
  return `HEAD ${short(record.startHead)}, ${base}, ${candidate}`;
}
async function readRefPackageVersion(ports, cwd, ref) {
  const argv = ["git", "show", `${ref}:package.json`];
  const run = await ports.command.run({ argv, cwd, timeoutMs: 15e3 });
  if (!run.ok) {
    return err(
      batchFailure("baseline", "prerequisite", `git could not run while reading ${ref}:package.json: ${run.error.message}`, {
        hint: "install git and run inside the plugin repository",
        blocked: true,
        details: { ref, argv }
      })
    );
  }
  const outcome = run.value;
  if (outcome.exitCode !== 0) {
    const stderr = outcome.stderr.trim().split(/\r?\n/)[0] ?? "";
    return err(
      batchFailure(
        "baseline",
        "prerequisite",
        `could not read package.json at baseline ${describeRef(ref)} (git exit code ${String(outcome.exitCode)}${stderr.length === 0 ? "" : `: ${stderr}`})`,
        {
          hint: "the baseline must contain a valid package.json; check that the ref resolves to a commit of this repository",
          blocked: true,
          details: { ref, exitCode: outcome.exitCode }
        }
      )
    );
  }
  let value;
  try {
    value = JSON.parse(outcome.stdout);
  } catch (error) {
    return err(
      batchFailure("baseline", "prerequisite", `package.json at baseline ${describeRef(ref)} is not valid JSON: ${error.message}`, {
        blocked: true,
        details: { ref }
      })
    );
  }
  const version = isRecord4(value) && typeof value.version === "string" ? value.version : null;
  if (version === null || version.length === 0) {
    return err(
      batchFailure("baseline", "prerequisite", `package.json at baseline ${describeRef(ref)} declares no version`, {
        hint: "a batch cannot judge the version rule without the baseline's version",
        blocked: true,
        details: { ref }
      })
    );
  }
  return ok(version);
}
function resolveTgzPath(manifest, manifestDir) {
  const raw = manifest.package.tgzPath;
  if (isWindowsAbsolute(raw) || isPosixAbsolute(raw)) return raw;
  return joinFsPath(manifestDir, ...raw.split("/"));
}
async function measureCandidate(ports, candidate, base, cwd) {
  const manifest = candidate.manifest;
  const tgzPath = resolveTgzPath(manifest, candidate.dir);
  const exists = await ports.fs.exists(tgzPath);
  let tgzSha256 = null;
  if (exists) {
    const hashed = await ports.fs.hashFile(tgzPath);
    if (hashed.ok) tgzSha256 = hashed.value;
  }
  const digest = digestOfFiles(
    manifest.package.files.map((file) => ({ path: file.path, size: file.bytes, sha256: file.sha256 }))
  );
  let commitContainsBase = null;
  if (base !== null) {
    const argv = ["git", "merge-base", "--is-ancestor", base.tip, manifest.git.commit];
    const run = await ports.command.run({ argv, cwd, timeoutMs: 15e3 });
    if (run.ok && run.value.exitCode === 0) commitContainsBase = true;
    else if (run.ok && run.value.exitCode === 1) commitContainsBase = false;
  }
  return {
    tgzOnDisk: { exists, sha256: tgzSha256 },
    recomputedFileDigest: digest.ok ? digest.value : null,
    commitContainsBase
  };
}
async function writeBatchRecord(ports, batchDir, batchFile, raw, dryRun, notes) {
  const parsed = parseBatchRecord(raw);
  if (!parsed.ok) {
    return err(
      batchFailure("record", "internal", `the batch record this tool built is not valid: ${parsed.error.message}`, {
        hint: "this is a bug; please report the batch open output",
        blocked: true
      })
    );
  }
  if (dryRun) {
    notes.push("dry run: batch.json was not written");
    return ok(parsed.value);
  }
  const made = await ports.fs.makeDir(batchDir);
  if (!made.ok) {
    return err(
      batchFailure("io", "io", `could not create the batch directory ${batchDir}: ${made.error.message}`, {
        blocked: true,
        details: { path: batchDir }
      })
    );
  }
  const written = await ports.fs.writeText(batchFile, `${JSON.stringify(raw, null, 2)}
`);
  if (!written.ok) {
    return err(
      batchFailure("io", "io", `could not write ${batchFile}: ${written.error.message}`, {
        blocked: true,
        details: { path: batchFile }
      })
    );
  }
  return ok(parsed.value);
}
function formatLinesOrFail(name, candidate, base) {
  const identity = {
    batchName: name,
    commit: candidate.commit,
    // The identity line names the candidate *package* digest (the tarball), which
    // is what a release check can recompute from candidate.json on another
    // machine. The manifest file digest is a different value: it binds evidence.
    packageSha256: candidate.tgzSha256
  };
  const identityLine = formatIdentityLine(identity);
  if (!identityLine.ok) {
    return err(
      batchFailure("context", "invalid-input", `could not render the identity line: ${identityLine.error.message}`, {
        blocked: true
      })
    );
  }
  if (base === null) return ok({ identity, identityLine: identityLine.value, baseLine: null });
  const baseLine = formatBaseLine({ ref: base.ref, tip: base.tip, expectedVersion: base.expectedVersion });
  if (!baseLine.ok) {
    return err(
      batchFailure("baseline", "invalid-input", `could not render the base line: ${baseLine.error.message}`, {
        hint: "the ref and the version must be non-empty and space-free",
        blocked: true
      })
    );
  }
  return ok({ identity, identityLine: identityLine.value, baseLine: baseLine.value });
}
async function openBatch(options) {
  const { ports, cwd, workRoot } = options;
  const nameResult = options.name === void 0 ? defaultBatchName(ports) : parseBatchName(options.name);
  if (!nameResult.ok) {
    return err(
      batchFailure("context", "invalid-input", `batch name is not valid: ${options.name ?? ""}`, {
        hint: "use 1-64 characters from A-Z a-z 0-9 . _ - (at least one letter or digit)",
        blocked: true
      })
    );
  }
  const name = nameResult.value;
  const batchDir = batchDirFor(workRoot, name);
  const batchFile = joinFsPath(batchDir, BATCH_RECORD_FILENAME);
  const notes = [];
  const git = await readGitState({ ports, cwd });
  if (!git.ok) {
    return err(
      batchFailure("context", "prerequisite", `could not read the current git HEAD: ${git.error.message}`, {
        hint: "open a batch inside the plugin repository work tree",
        blocked: true
      })
    );
  }
  const pkg = await readTargetPackage(ports.fs, cwd);
  if (!pkg.ok) return err(pkg.error);
  const existing = await loadBatchRecord(ports.fs, batchDir);
  if (!existing.ok && existing.error.code !== "not-found") return err(existing.error);
  if (existing.ok) {
    const record = existing.value.record;
    const recordedCandidate = record.candidate ?? null;
    if (recordedCandidate !== null) {
      if (options.candidate === void 0) {
        const lines3 = formatLinesOrFail(name, recordedCandidate, record.base);
        if (!lines3.ok) return err(lines3.error);
        notes.push(`reused the existing batch record at ${batchFile}`);
        return ok({
          record,
          raw: existing.value.raw,
          batchDir,
          batchFile,
          phase: "reused",
          identity: lines3.value.identity,
          identityLine: lines3.value.identityLine,
          baseLine: lines3.value.baseLine,
          base: record.base,
          candidate: recordedCandidate,
          candidatePath: recordedCandidate.path,
          candidateProblems: [],
          reused: true,
          dryRun: options.dryRun,
          createdAt: record.createdAt,
          allowStale: options.allowStale,
          notes
        });
      }
      const resolved2 = await resolveCandidate(ports.fs, workRoot, options.candidate);
      if (!resolved2.ok) return err(resolved2.error);
      if (!sameCandidateIdentity(recordedCandidate, resolved2.value.identity)) {
        return err(
          batchFailure("conflict", "conflict", `batch ${name} already has a different candidate`, {
            hint: "pick another --name, or delete the stale batch directory if it is no longer needed",
            details: {
              path: existing.value.path,
              existing: describeRecordIdentity(record),
              requested: `${short(resolved2.value.identity.commit)} manifest ${short(resolved2.value.identity.sha256)}`
            }
          })
        );
      }
      const lines2 = formatLinesOrFail(name, recordedCandidate, record.base);
      if (!lines2.ok) return err(lines2.error);
      notes.push(`reused the existing batch record at ${batchFile}`);
      return ok({
        record,
        raw: existing.value.raw,
        batchDir,
        batchFile,
        phase: "reused",
        identity: lines2.value.identity,
        identityLine: lines2.value.identityLine,
        baseLine: lines2.value.baseLine,
        base: record.base,
        candidate: recordedCandidate,
        candidatePath: recordedCandidate.path,
        candidateProblems: [],
        reused: true,
        dryRun: options.dryRun,
        createdAt: record.createdAt,
        allowStale: options.allowStale,
        notes
      });
    }
    if (options.candidate === void 0) {
      if (options.baseRef !== void 0) {
        if (record.base === null || record.base.ref !== options.baseRef || record.base.allowOutdated !== options.allowStale) {
          return err(
            batchFailure("conflict", "conflict", `batch ${name} was prepared with a different baseline`, {
              hint: "re-open with the recorded baseline, or pick another --name",
              details: {
                path: existing.value.path,
                existing: describeRecordIdentity(record),
                requested: `${options.baseRef}${options.allowStale ? " (allow-stale)" : ""}`
              }
            })
          );
        }
      }
      const baseLine2 = record.base === null ? null : formatBaseLine({
        ref: record.base.ref,
        tip: record.base.tip,
        expectedVersion: record.base.expectedVersion
      });
      if (baseLine2 !== null && !baseLine2.ok) {
        return err(
          batchFailure("baseline", "invalid-input", `could not render the base line: ${baseLine2.error.message}`, {
            blocked: true
          })
        );
      }
      notes.push(
        `batch ${name} is prepared and waiting for a candidate: dsh-verify freeze --out ${batchDir}, then dsh-verify batch open --name ${name} --candidate <the directory freeze printed>`
      );
      return ok({
        record,
        raw: existing.value.raw,
        batchDir,
        batchFile,
        phase: "prepared",
        identity: null,
        identityLine: "",
        baseLine: baseLine2 === null ? null : baseLine2.value,
        base: record.base,
        candidate: null,
        candidatePath: null,
        candidateProblems: [],
        reused: true,
        dryRun: options.dryRun,
        createdAt: record.createdAt,
        allowStale: options.allowStale,
        notes
      });
    }
    const resolved = await resolveCandidate(ports.fs, workRoot, options.candidate);
    if (!resolved.ok) return err(resolved.error);
    const frozen = resolved.value;
    if (git.value.commit !== record.startHead) {
      return err(
        batchFailure(
          "candidate",
          "prerequisite",
          `HEAD moved since batch ${name} was prepared: ${record.startHead} \u2192 ${git.value.commit}`,
          {
            hint: "a candidate must be frozen on the commit the batch started at; re-open the batch on the current HEAD",
            blocked: true,
            details: { startHead: record.startHead, currentHead: git.value.commit }
          }
        )
      );
    }
    const measured = await measureCandidate(ports, frozen, record.base, cwd);
    const expectedVersion = record.base === null ? pkg.value.version : record.base.expectedVersion;
    const facts = {
      manifest: frozen.manifest,
      identity: frozen.identity,
      manifestPath: frozen.manifestPath,
      batchDir,
      generatedAtMs: Date.parse(frozen.manifest.generatedAt),
      batchStartedAtMs: Date.parse(record.createdAt),
      currentHead: git.value.commit,
      base: record.base,
      allowOutdatedBase: record.base?.allowOutdated ?? false,
      commitContainsBase: measured.commitContainsBase,
      expectedVersion,
      tgzOnDisk: measured.tgzOnDisk,
      recomputedFileDigest: measured.recomputedFileDigest
    };
    const verdict = judgeCandidate(facts);
    if (!verdict.ok) {
      const unverifiable = verdict.problems.some(
        (item) => item.code === "base-version-unreadable" || item.code === "commit-not-contains-base" && measured.commitContainsBase === null
      );
      return err(
        batchFailure(
          "candidate",
          unverifiable ? "prerequisite" : "identity-mismatch",
          describeCandidateVerdict(verdict),
          {
            ...unverifiable ? { blocked: true } : {},
            hint: "the candidate must be frozen after the batch opened, inside the batch directory, from the same HEAD and version; re-freeze and seal again",
            details: { batchDir, candidate: frozen.manifestPath, problems: verdict.problems }
          }
        )
      );
    }
    const lines = formatLinesOrFail(name, frozen.identity, record.base);
    if (!lines.ok) return err(lines.error);
    if (record.base !== null && record.base.allowOutdated && measured.commitContainsBase === false) {
      notes.push(
        `baseline ${record.base.ref}@${short(record.base.tip)} is not an ancestor of the candidate; this was explicitly allowed when the batch opened (--allow-stale) and the status report repeats it`
      );
    }
    if (frozen.manifest.validity === "development") {
      notes.push("candidate is a development build (dirty tree); it must not be published");
    }
    const sealedAt = ports.clock.iso();
    const nextRaw = {
      ...existing.value.raw,
      candidate: frozen.identity,
      updatedAt: sealedAt,
      identityLine: lines.value.identityLine
    };
    const written2 = await writeBatchRecord(ports, batchDir, batchFile, nextRaw, options.dryRun, notes);
    if (!written2.ok) return err(written2.error);
    return ok({
      record: written2.value,
      raw: nextRaw,
      batchDir,
      batchFile,
      phase: "sealed",
      identity: lines.value.identity,
      identityLine: lines.value.identityLine,
      baseLine: lines.value.baseLine,
      base: record.base,
      candidate: frozen.identity,
      candidatePath: frozen.manifestPath,
      candidateProblems: [],
      reused: false,
      dryRun: options.dryRun,
      createdAt: record.createdAt,
      allowStale: options.allowStale,
      notes
    });
  }
  let base = null;
  let baseLine = null;
  if (options.baseRef !== void 0) {
    const tip = await readRefTip(ports, cwd, options.baseRef);
    if (!tip.ok) return err(tip.error);
    const version = await readRefPackageVersion(ports, cwd, options.baseRef);
    if (!version.ok) return err(version.error);
    base = {
      ref: options.baseRef,
      tip: tip.value,
      expectedVersion: version.value,
      allowOutdated: options.allowStale
    };
    const rendered = formatBaseLine({ ref: base.ref, tip: base.tip, expectedVersion: base.expectedVersion });
    if (!rendered.ok) {
      return err(
        batchFailure("baseline", "invalid-input", `could not render the base line: ${rendered.error.message}`, {
          hint: "the ref and the version must be non-empty and space-free",
          blocked: true
        })
      );
    }
    baseLine = rendered.value;
  }
  const createdAt = ports.clock.iso();
  const annotations = {
    profile: {
      id: options.profile.id,
      packageName: options.profile.packageName,
      defaultProfile: options.profile.defaultProfile,
      clientEntry: options.profile.clientEntry
    },
    declaration: {
      path: options.declaration.path,
      kind: options.declaration.kind,
      exportName: options.declaration.exportName,
      requiredNode: options.declaration.requiredNode
    },
    profileName: options.profileName,
    identityLine: "",
    baseLine
  };
  const recordValue = {
    schemaVersion: BATCH_SCHEMA_VERSION,
    batchName: name,
    batchDir,
    createdAt,
    updatedAt: createdAt,
    status: base !== null && base.allowOutdated ? "stale" : "active",
    startHead: git.value.commit,
    startBranch: git.value.branch,
    base,
    candidate: null,
    preflightOk: true,
    ...annotations
  };
  const written = await writeBatchRecord(ports, batchDir, batchFile, recordValue, options.dryRun, notes);
  if (!written.ok) return err(written.error);
  notes.push(
    `batch ${name} is prepared: next freeze a candidate into the batch directory (dsh-verify freeze --out ${batchDir}) and seal it with dsh-verify batch open --name ${name} --candidate <dir>`
  );
  return ok({
    record: written.value,
    raw: recordValue,
    batchDir,
    batchFile,
    phase: "prepared",
    identity: null,
    identityLine: "",
    baseLine,
    base,
    candidate: null,
    candidatePath: null,
    candidateProblems: [],
    reused: false,
    dryRun: options.dryRun,
    createdAt,
    allowStale: options.allowStale,
    notes
  });
}
async function findEvidenceManifests(fs, root) {
  const paths = [];
  const stack = [{ path: root, depth: 0 }];
  let readable = false;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === void 0) break;
    const listed = await fs.list(current.path);
    if (!listed.ok) {
      if (current.depth === 0) return { readable: false, paths: [] };
      continue;
    }
    readable = true;
    for (const entry of listed.value) {
      const child = joinFsPath(current.path, entry.name);
      if (entry.kind === "directory") {
        if (current.depth >= EVIDENCE_SCAN_DEPTH) continue;
        if (entry.name === "files" || entry.name === ".git") continue;
        stack.push({ path: child, depth: current.depth + 1 });
      } else if (entry.name === EVIDENCE_MANIFEST_FILENAME) {
        paths.push(child);
      }
    }
  }
  return { readable, paths: paths.sort() };
}
function invalidEntry(path, relativePath2, reason, message) {
  return {
    path,
    relativePath: relativePath2,
    status: "rejected",
    reason,
    batchName: null,
    commit: null,
    packageSha256: null,
    message,
    expected: "an evidence.json written by dsh-verify evidence add",
    actual: message,
    hint: "delete the unreadable file or regenerate it through the tool"
  };
}
function bindOne(record, manifest, path, relativePath2) {
  const candidate = manifest.candidate === void 0 || !isRecord4(manifest.candidate) ? null : manifest.candidate;
  const batchName = candidate !== null && typeof candidate.batchName === "string" ? candidate.batchName : null;
  const commit = candidate !== null && typeof candidate.commit === "string" ? candidate.commit : null;
  const packageSha256 = candidate !== null && typeof candidate.packageSha256 === "string" ? candidate.packageSha256 : null;
  const verdict = judgeEvidenceBinding({
    record,
    meta: {
      batchName: manifest.batch.name,
      ...candidate === null ? {} : {
        candidate: {
          ...batchName === null ? {} : { batchName },
          ...commit === null ? {} : { commit },
          ...packageSha256 === null ? {} : { packageSha256 }
        }
      }
    }
  });
  const entry = {
    path,
    relativePath: relativePath2,
    status: "bound",
    reason: null,
    batchName: manifest.batch.name,
    commit,
    packageSha256,
    message: null,
    expected: null,
    actual: null,
    hint: null
  };
  if (verdict.ok) return entry;
  const recordCandidate = record.candidate ?? null;
  let reason;
  let expected;
  let actual;
  if (manifest.batch.name !== record.batchName) {
    reason = "batch-name";
    expected = record.batchName;
    actual = manifest.batch.name;
  } else if (candidate === null) {
    reason = "candidate-missing";
    expected = recordCandidate === null ? `batch ${record.batchName}` : `${recordCandidate.commit} / ${recordCandidate.sha256}`;
    actual = "evidence.json carries no candidate object";
  } else if (recordCandidate === null) {
    reason = "batch-candidate-missing";
    expected = "a frozen candidate in batch.json";
    actual = "batch.json candidate is null";
  } else if (batchName !== null && batchName !== record.batchName) {
    reason = "candidate-batch-name";
    expected = record.batchName;
    actual = batchName;
  } else if (commit !== recordCandidate.commit) {
    reason = "candidate-commit";
    expected = recordCandidate.commit;
    actual = commit ?? "(missing)";
  } else {
    reason = "candidate-package-sha256";
    expected = recordCandidate.sha256;
    actual = packageSha256 ?? "(missing)";
  }
  return {
    ...entry,
    status: "rejected",
    reason,
    message: verdict.error.message,
    expected,
    actual,
    hint: verdict.error.hint ?? null
  };
}
async function scanBatchEvidence(fs, batchDir, record) {
  const found = await findEvidenceManifests(fs, batchDir);
  if (!found.readable) {
    return { root: batchDir, readable: false, scanned: 0, bound: [], rejected: [] };
  }
  const bound = [];
  const rejected = [];
  for (const path of found.paths) {
    const relativePath2 = toPosixPath(relativeTo(batchDir, path));
    const text = await fs.readText(path);
    if (!text.ok) {
      rejected.push(
        invalidEntry(path, relativePath2, "manifest-unreadable", `could not read the manifest: ${text.error.message}`)
      );
      continue;
    }
    let value;
    try {
      value = JSON.parse(text.value);
    } catch (error) {
      rejected.push(
        invalidEntry(path, relativePath2, "manifest-invalid", `not valid JSON: ${error.message}`)
      );
      continue;
    }
    const manifest = validateEvidenceManifest(value);
    if (!manifest.ok) {
      rejected.push(
        invalidEntry(
          path,
          relativePath2,
          "manifest-invalid",
          `not a valid evidence manifest: ${manifest.error.message}`
        )
      );
      continue;
    }
    const entry = bindOne(record, manifest.value, path, relativePath2);
    if (entry.status === "bound") bound.push(entry);
    else rejected.push(entry);
  }
  return { root: batchDir, readable: true, scanned: found.paths.length, bound, rejected };
}
var CHECK_HEAD_FRESH = checkId("batch-head-fresh");
var CHECK_BASELINE_FRESH = checkId("batch-baseline-fresh");
var CHECK_CANDIDATE = checkId("candidate-identity");
var CHECK_EVIDENCE_BOUND = checkId("batch-evidence-bound");
var CHECK_BATCH_RECORD = checkId("batch-record");
var TITLE_HEAD = "the batch still starts at the current HEAD";
var TITLE_BASELINE = "the baseline ref still points where the batch opened";
var TITLE_CANDIDATE = "the sealed candidate still matches its manifest and tarball";
var TITLE_EVIDENCE = "every evidence manifest belongs to this batch's candidate";
var TITLE_RECORD = "the batch record could be read and updated";
function toCheck(draft) {
  return {
    id: draft.id,
    title: draft.title,
    hard: true,
    status: draft.status,
    detail: draft.detail,
    ...draft.expected === void 0 ? {} : { expected: draft.expected },
    ...draft.actual === void 0 ? {} : { actual: draft.actual },
    ...draft.hint === void 0 ? {} : { hint: draft.hint },
    // A blocked check always carries the structured reason the run.json contract
    // promises; the specific code stays in `reason` for filtering and the
    // human-readable detail stays in the message.
    ...draft.status === "blocked" ? {
      blockedReason: {
        code: "prerequisite-missing",
        message: draft.detail,
        ...draft.hint === void 0 ? {} : { hint: draft.hint }
      }
    } : {},
    evidence: [],
    durationMs: 0,
    reason: draft.reason
  };
}
function evidenceCheck(scan, record) {
  const candidate = record.candidate ?? null;
  const expected = candidate === null ? `evidence bound to batch ${record.batchName} (the record has no candidate)` : `batch ${record.batchName} / commit ${candidate.commit} / manifest sha256 ${candidate.sha256}`;
  if (!scan.readable) {
    return toCheck({
      id: CHECK_EVIDENCE_BOUND,
      title: TITLE_EVIDENCE,
      status: "blocked",
      detail: `could not list the batch directory ${scan.root}, so no evidence manifest was inspected`,
      reason: "evidence-scan",
      expected: "a readable batch directory",
      actual: "listing the batch directory failed",
      hint: "check that the batch directory still exists and is readable"
    });
  }
  if (scan.scanned === 0) {
    return toCheck({
      id: CHECK_EVIDENCE_BOUND,
      title: TITLE_EVIDENCE,
      status: "skip",
      detail: `no evidence.json under ${scan.root}; nothing to bind yet`,
      reason: "no-evidence",
      expected
    });
  }
  if (scan.rejected.length === 0) {
    return toCheck({
      id: CHECK_EVIDENCE_BOUND,
      title: TITLE_EVIDENCE,
      status: "pass",
      detail: `${scan.scanned} evidence manifest(s) belong to this batch (${short(candidate?.commit ?? record.startHead)}; manifest ${short(candidate?.sha256 ?? "")})`,
      reason: null,
      expected,
      actual: `${scan.scanned}/${scan.scanned} bound`
    });
  }
  const names = scan.rejected.map((entry) => `${entry.relativePath} (${entry.reason ?? "unknown"})`).join("; ");
  const details = scan.rejected.map(
    (entry) => `${entry.relativePath} (${entry.reason ?? "unknown"}): expected ${entry.expected ?? "(unknown)"}, actual ${entry.actual ?? "(unknown)"}`
  ).join("; ");
  return toCheck({
    id: CHECK_EVIDENCE_BOUND,
    title: TITLE_EVIDENCE,
    status: "fail",
    detail: `${scan.rejected.length}/${scan.scanned} evidence manifest(s) do not belong to this batch: ${names}`,
    reason: "evidence-binding",
    expected,
    actual: details,
    hint: "only evidence collected with --batch of this batch and this candidate is counted; re-collect it or move the foreign manifest out of the batch directory"
  });
}
async function candidateIdentityCheck(ports, record, batchDir) {
  const candidate = record.candidate ?? null;
  if (candidate === null) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "blocked",
      detail: `batch ${record.batchName} has no frozen candidate, so there is no identity to re-check`,
      reason: "candidate-missing",
      expected: "a candidate sealed with batch open --candidate",
      actual: "batch.json candidate is null",
      hint: `freeze a candidate into ${batchDir} and seal it: dsh-verify batch open --name ${record.batchName} --candidate <dir>`
    });
  }
  const expected = `manifest ${candidate.sha256} / tarball ${candidate.tgzSha256}`;
  const text = await ports.fs.readText(candidate.path);
  if (!text.ok) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "blocked",
      detail: `could not read the sealed candidate manifest ${candidate.path}: ${text.error.message}`,
      reason: "candidate-unreadable",
      expected,
      actual: "the manifest file is unreadable",
      hint: "restore the batch directory; an unreadable candidate cannot be re-verified"
    });
  }
  const manifestSha256 = sha256Text(text.value);
  if (manifestSha256 !== candidate.sha256) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the candidate manifest was changed after it was sealed: sha256 is ${manifestSha256}`,
      reason: "candidate-drift",
      expected: candidate.sha256,
      actual: manifestSha256,
      hint: "re-freeze and seal a new batch; do not edit candidate.json by hand"
    });
  }
  let value;
  try {
    value = JSON.parse(text.value);
  } catch (error) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the sealed candidate manifest is not valid JSON: ${error.message}`,
      reason: "candidate-drift",
      expected,
      actual: "candidate.json does not parse",
      hint: "re-freeze and seal a new batch"
    });
  }
  const parsed = parseCandidateManifest(value);
  if (!parsed.ok) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the sealed candidate manifest no longer parses: ${parsed.error.message}`,
      reason: "candidate-drift",
      expected,
      actual: "candidate.json is not a usable manifest",
      hint: "re-freeze and seal a new batch"
    });
  }
  const manifest = parsed.value;
  const manifestDir = parentPath(candidate.path) ?? batchDir;
  const tgzPath = resolveTgzPath(manifest, manifestDir);
  if (!await ports.fs.exists(tgzPath)) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the candidate tarball is missing: ${tgzPath}`,
      reason: "candidate-drift",
      expected: candidate.tgzSha256,
      actual: "the tarball file does not exist",
      hint: "re-freeze and seal a new batch; a candidate without its tarball cannot be published or verified"
    });
  }
  const hashed = await ports.fs.hashFile(tgzPath);
  if (!hashed.ok) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "blocked",
      detail: `could not hash the candidate tarball ${tgzPath}: ${hashed.error.message}`,
      reason: "candidate-unreadable",
      expected: candidate.tgzSha256,
      actual: "the tarball could not be read",
      hint: "check permissions on the batch directory"
    });
  }
  if (hashed.value !== candidate.tgzSha256 || manifest.package.tgzSha256 !== candidate.tgzSha256) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the candidate tarball was replaced after it was sealed: sha256 is ${hashed.value}`,
      reason: "candidate-drift",
      expected: candidate.tgzSha256,
      actual: hashed.value,
      hint: "re-freeze and seal a new batch; a replaced tarball is not the one the observations describe"
    });
  }
  const digest = digestOfFiles(
    manifest.package.files.map((file) => ({ path: file.path, size: file.bytes, sha256: file.sha256 }))
  );
  if (!digest.ok) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the sealed candidate file list is not usable: ${digest.error.message}`,
      reason: "candidate-drift",
      expected,
      actual: "package.files could not be digested",
      hint: "re-freeze and seal a new batch"
    });
  }
  if (digest.value !== candidate.fileDigest) {
    return toCheck({
      id: CHECK_CANDIDATE,
      title: TITLE_CANDIDATE,
      status: "fail",
      detail: `the candidate file digest drifted: recomputed ${digest.value}, sealed ${candidate.fileDigest}`,
      reason: "candidate-drift",
      expected: candidate.fileDigest,
      actual: digest.value,
      hint: "re-freeze and seal a new batch; the file list was edited after sealing"
    });
  }
  return toCheck({
    id: CHECK_CANDIDATE,
    title: TITLE_CANDIDATE,
    status: "pass",
    detail: `candidate ${short(candidate.commit)} is intact (manifest ${short(candidate.sha256)}, tarball ${short(candidate.tgzSha256)})`,
    reason: null,
    expected,
    actual: `manifest ${short(manifestSha256)} / tarball ${short(hashed.value)} / ${manifest.package.fileCount} file(s)`
  });
}
function problemOf(verdict, code) {
  return verdict.problems.find((problem2) => problem2.code === code);
}
async function checkBatch(options) {
  const { ports, workRoot } = options;
  const loaded = await resolveBatchForStatus(ports.fs, workRoot, options.name);
  if (!loaded.ok) return err(loaded.error);
  const record = loaded.value.record;
  const checkedAt = ports.clock.iso();
  const notes = [];
  const git = await readGitState({ ports, cwd: options.cwd });
  if (!git.ok) {
    notes.push(
      `could not read git HEAD (${git.error.message}); batch-head-fresh is blocked and the record status was left unchanged`
    );
  }
  const currentHead = git.ok ? git.value.commit : record.startHead;
  let baseTipNow = null;
  let baseReadError;
  if (record.base !== null && !record.base.allowOutdated) {
    const tip = await readRefTip(ports, options.cwd, record.base.ref);
    if (tip.ok) baseTipNow = tip.value;
    else baseReadError = tip.error.message;
  }
  const verdict = judgeFreshness(
    {
      record,
      currentHead,
      baseTipNow,
      ...baseReadError === void 0 ? {} : { baseReadError }
    },
    checkedAt
  );
  const checks = [];
  const headProblem = problemOf(verdict, "head-moved");
  if (!git.ok) {
    checks.push(
      toCheck({
        id: CHECK_HEAD_FRESH,
        title: TITLE_HEAD,
        status: "blocked",
        detail: `git HEAD is unreadable, so the batch start ${short(record.startHead)} cannot be confirmed: ${git.error.message}`,
        reason: "git-unreadable",
        expected: record.startHead,
        actual: "git HEAD unreadable",
        hint: git.error.hint ?? "restore git access to this work tree"
      })
    );
  } else if (headProblem !== void 0) {
    checks.push(
      toCheck({
        id: CHECK_HEAD_FRESH,
        title: TITLE_HEAD,
        status: options.allowStale ? "skip" : "fail",
        detail: options.allowStale ? `--allow-stale was given: ${headProblem.message}` : headProblem.message,
        reason: "head-moved",
        expected: record.startHead,
        actual: git.value.commit,
        ...headProblem.hint === void 0 ? {} : { hint: headProblem.hint }
      })
    );
    if (options.allowStale) {
      notes.push("--allow-stale: the moved HEAD is reported as skip, not fail (the batch record stays stale)");
    }
  } else {
    checks.push(
      toCheck({
        id: CHECK_HEAD_FRESH,
        title: TITLE_HEAD,
        status: "pass",
        detail: `HEAD is still ${short(record.startHead)}`,
        reason: null,
        expected: record.startHead,
        actual: git.value.commit
      })
    );
  }
  const base = record.base;
  if (base === null) {
    const noBaseline = problemOf(verdict, "no-baseline");
    checks.push(
      toCheck({
        id: CHECK_BASELINE_FRESH,
        title: TITLE_BASELINE,
        status: "blocked",
        detail: `${noBaseline?.message ?? "batch recorded no baseline ref"}; this is the explicit "no baseline" state, not "no check needed"`,
        reason: "no-baseline",
        expected: "a baseline ref recorded when the batch opened",
        actual: "base: null (explicit none)",
        ...noBaseline?.hint === void 0 ? {} : { hint: noBaseline.hint }
      })
    );
  } else if (base.allowOutdated) {
    const outdated = problemOf(verdict, "outdated-base-allowed");
    checks.push(
      toCheck({
        id: CHECK_BASELINE_FRESH,
        title: TITLE_BASELINE,
        status: "skip",
        detail: `${outdated?.message ?? `batch was opened with --allow-stale against ${base.ref} ${short(base.tip)}`}; the allowance is recorded in batch.json and reported here`,
        reason: "outdated-base-allowed",
        expected: `baseline ${base.ref} at ${base.tip}`,
        actual: "outdated base allowed when the batch opened",
        ...outdated?.hint === void 0 ? {} : { hint: outdated.hint }
      })
    );
  } else {
    const unreadable = problemOf(verdict, "baseline-unreadable");
    const advanced = problemOf(verdict, "baseline-advanced");
    if (unreadable !== void 0) {
      checks.push(
        toCheck({
          id: CHECK_BASELINE_FRESH,
          title: TITLE_BASELINE,
          status: "fail",
          detail: unreadable.message,
          reason: "baseline-unreadable",
          expected: base.tip,
          actual: baseReadError ?? "the ref did not resolve to a commit",
          ...unreadable.hint === void 0 ? {} : { hint: unreadable.hint }
        })
      );
    } else if (advanced !== void 0) {
      checks.push(
        toCheck({
          id: CHECK_BASELINE_FRESH,
          title: TITLE_BASELINE,
          status: options.allowStale ? "skip" : "fail",
          detail: options.allowStale ? `--allow-stale was given: ${advanced.message}` : advanced.message,
          reason: "baseline-advanced",
          expected: base.tip,
          actual: baseTipNow ?? "unknown",
          ...advanced.hint === void 0 ? {} : { hint: advanced.hint }
        })
      );
      if (options.allowStale) {
        notes.push("--allow-stale: the advanced baseline is reported as skip, not fail (the batch record stays stale)");
      }
    } else {
      checks.push(
        toCheck({
          id: CHECK_BASELINE_FRESH,
          title: TITLE_BASELINE,
          status: "pass",
          detail: `baseline ${base.ref} is still at ${short(base.tip)}`,
          reason: null,
          expected: base.tip,
          actual: baseTipNow ?? base.tip
        })
      );
    }
  }
  checks.push(await candidateIdentityCheck(ports, record, loaded.value.batchDir));
  const evidence = await scanBatchEvidence(ports.fs, loaded.value.batchDir, record);
  checks.push(evidenceCheck(evidence, record));
  let finalRecord = record;
  const nextRaw = {
    ...loaded.value.raw,
    endCheckedAt: checkedAt,
    updatedAt: checkedAt
  };
  if (git.ok) {
    nextRaw.status = verdict.status;
    nextRaw.endHead = git.value.commit;
  } else {
    notes.push("the batch record status was left untouched because HEAD could not be read");
  }
  if (!options.dryRun) {
    const nextRecord = parseBatchRecord(nextRaw);
    if (!nextRecord.ok) {
      checks.push(
        toCheck({
          id: CHECK_BATCH_RECORD,
          title: TITLE_RECORD,
          status: "fail",
          detail: `the updated batch record would not be readable: ${nextRecord.error.message}`,
          reason: "record-invalid",
          expected: "a batch.json this version can parse",
          actual: "the update was rejected by parseBatchRecord",
          ...nextRecord.error.hint === void 0 ? {} : { hint: nextRecord.error.hint }
        })
      );
    } else {
      finalRecord = nextRecord.value;
      const written = await ports.fs.writeText(
        loaded.value.path,
        `${JSON.stringify(nextRaw, null, 2)}
`
      );
      if (!written.ok) {
        checks.push(
          toCheck({
            id: CHECK_BATCH_RECORD,
            title: TITLE_RECORD,
            status: "fail",
            detail: `could not write the batch status back to ${loaded.value.path}: ${written.error.message}`,
            reason: "record-write",
            expected: `status ${verdict.status} persisted in batch.json`,
            actual: "the write failed",
            ...written.error.hint === void 0 ? {} : { hint: written.error.hint }
          })
        );
      }
    }
  } else {
    notes.push("dry run: batch.json was not updated");
  }
  return ok({
    record: finalRecord,
    raw: nextRaw,
    batchDir: loaded.value.batchDir,
    batchFile: loaded.value.path,
    identityLine: identityLineOf(finalRecord),
    baseLine: baseLineOf(finalRecord),
    checks,
    freshness: verdict,
    evidence,
    exitCode: decideExitCode(checks),
    allowedStale: options.allowStale,
    notes
  });
}
function baseLineOf(record) {
  if (record.base === null) return null;
  const line = formatBaseLine({
    ref: record.base.ref,
    tip: record.base.tip,
    expectedVersion: record.base.expectedVersion
  });
  return line.ok ? line.value : null;
}
function identityLineOf(record) {
  if (record.candidate === null || record.candidate === void 0) return "";
  const line = formatIdentityLine({
    batchName: record.batchName,
    commit: record.candidate.commit,
    // The tarball digest, not the manifest file digest; see `openBatch`.
    packageSha256: record.candidate.tgzSha256
  });
  return line.ok ? line.value : "";
}
async function loadBatchContextForEvidence(args, deps) {
  const raw = args.batch ?? args.name;
  if (raw === void 0) return ok(null);
  const name = parseBatchName(raw);
  if (!name.ok) {
    return err(
      batchFailure("context", "invalid-input", `--batch is not a valid batch name: ${raw}`, {
        hint: "use the name batch open printed; 1-64 characters from A-Z a-z 0-9 . _ -",
        blocked: true
      })
    );
  }
  const workRoot = resolveWorkRoot(deps.cwd, args.workRoot);
  const batchDir = batchDirFor(workRoot, name.value);
  const loaded = await loadBatchRecord(deps.ports.fs, batchDir);
  if (!loaded.ok) return err(loaded.error);
  const candidate = loaded.value.record.candidate ?? null;
  if (candidate === null) {
    return err(
      batchFailure(
        "record",
        "prerequisite",
        `batch ${name.value} has no candidate identity, so evidence cannot be bound to it`,
        {
          hint: "freeze a candidate and open the batch with --candidate before collecting evidence",
          blocked: true,
          details: { batchDir }
        }
      )
    );
  }
  return ok({
    batchName: name.value,
    batchDir,
    workRoot,
    candidate: {
      batchName: name.value,
      commit: candidate.commit,
      packageSha256: candidate.sha256,
      version: candidate.version,
      tgzSha256: candidate.tgzSha256
    }
  });
}

// src/real-machine-verification/runtime/platform/clock.ts
function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}
function formatIsoLocal(ms) {
  const date = new Date(ms);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}
function createClockPort() {
  return {
    nowMs: () => Date.now(),
    iso: (ms) => formatIsoLocal(ms ?? Date.now()),
    sleep: (ms) => new Promise((resolve2) => {
      setTimeout(resolve2, Math.max(0, ms));
    })
  };
}

// src/real-machine-verification/runtime/platform/command.ts
import { spawn } from "node:child_process";
var DEFAULT_MAX_BUFFER_BYTES = 2 * 1024 * 1024;
var TailBuffer = class {
  constructor(limit) {
    this.limit = limit;
  }
  limit;
  chunks = [];
  size = 0;
  append(chunk) {
    this.chunks.push(chunk);
    this.size += chunk.length;
    while (this.size > this.limit && this.chunks.length > 1) {
      const dropped = this.chunks.shift();
      this.size -= dropped === void 0 ? 0 : dropped.length;
    }
  }
  text() {
    if (this.size > this.limit) return Buffer.concat(this.chunks).subarray(-this.limit).toString("utf8");
    return Buffer.concat(this.chunks).toString("utf8");
  }
};
function quoteForCmd(argument) {
  if (!/[\s"&|<>^]/.test(argument)) return argument;
  return `"${argument.replace(/"/g, '""')}"`;
}
function createCommandPort(options = {}) {
  const platform = options.platform ?? process.platform;
  const comspec = options.comspec ?? process.env["ComSpec"] ?? "cmd.exe";
  return {
    async run(request) {
      const argv = [...request.argv];
      const executable = argv[0];
      if (executable === void 0 || executable.length === 0) {
        return err(failure("invalid-input", "a command needs at least one argv entry"));
      }
      const isWindowsScript = platform === "win32" && /\.(cmd|bat)$/i.test(executable);
      const file = isWindowsScript ? comspec : executable;
      const args = isWindowsScript ? ["/d", "/s", "/c", argv.map(quoteForCmd).join(" ")] : argv.slice(1);
      const startedAt = Date.now();
      const maxBuffer = request.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
      const cwd = request.cwd ?? process.cwd();
      const environment = request.env === void 0 ? process.env : { ...request.env };
      return await new Promise((resolve2) => {
        let settled = false;
        const settle = (value) => {
          if (settled) return;
          settled = true;
          resolve2(value);
        };
        let child;
        try {
          child = spawn(file, args, {
            cwd,
            env: environment,
            windowsHide: true,
            ...isWindowsScript ? { windowsVerbatimArguments: true } : {},
            stdio: ["pipe", "pipe", "pipe"]
          });
        } catch (error) {
          settle(
            err(
              failure(
                "io",
                `could not start ${executable}: ${error instanceof Error ? error.message : String(error)}`,
                "check the path or add the program to PATH",
                { argv }
              )
            )
          );
          return;
        }
        const stdout = new TailBuffer(maxBuffer);
        const stderr = new TailBuffer(maxBuffer);
        let timedOut = false;
        let timedOutTimer = null;
        child.stdout.on("data", (chunk) => stdout.append(chunk));
        child.stderr.on("data", (chunk) => stderr.append(chunk));
        child.on("error", (error) => {
          if (timedOutTimer !== null) clearTimeout(timedOutTimer);
          settle(
            err(
              failure(
                "io",
                `could not run ${executable}: ${error.message}`,
                "the executable may not exist or may not be executable",
                { argv }
              )
            )
          );
        });
        child.on("close", (code, signal) => {
          if (timedOutTimer !== null) clearTimeout(timedOutTimer);
          settle(
            ok({
              argv,
              cwd,
              exitCode: code,
              signal,
              stdout: stdout.text(),
              stderr: stderr.text(),
              durationMs: Date.now() - startedAt,
              timedOut
            })
          );
        });
        if (request.timeoutMs !== void 0 && request.timeoutMs > 0) {
          timedOutTimer = setTimeout(() => {
            timedOut = true;
            child.kill();
          }, request.timeoutMs);
        }
        child.stdin.end(request.stdin ?? "");
      });
    }
  };
}

// src/real-machine-verification/runtime/platform/env.ts
import { homedir, tmpdir } from "node:os";
function platformName() {
  if (process.platform === "win32") return "win32";
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  return "other";
}
function createEnvPort() {
  return {
    get: (name) => process.env[name],
    snapshot: () => {
      const values = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== void 0) values[key] = value;
      }
      return values;
    },
    homeDir: () => homedir(),
    tmpDir: () => tmpdir(),
    platform: platformName,
    execPath: () => process.execPath,
    cwd: () => process.cwd()
  };
}

// src/real-machine-verification/runtime/platform/fs.ts
import { cp, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
function ioFailure(message, error, hint) {
  const detail = error instanceof Error ? error.message : String(error);
  return err(failure("io", `${message}: ${detail}`, hint));
}
function kindOf(stats) {
  if (stats.isFile()) return "file";
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  return "other";
}
function createFsPort() {
  return {
    async readText(path) {
      try {
        return ok(await readFile(path, "utf8"));
      } catch (error) {
        return ioFailure(`could not read ${path}`, error);
      }
    },
    async writeText(path, text) {
      try {
        await writeFile(path, text, "utf8");
        return ok(void 0);
      } catch (error) {
        return ioFailure(`could not write ${path}`, error);
      }
    },
    async readJson(path) {
      const text = await this.readText(path);
      if (!text.ok) return text;
      try {
        return ok(JSON.parse(text.value));
      } catch (error) {
        return ioFailure(`${path} is not valid JSON`, error, "fix the file, or delete it so the tool can recreate it");
      }
    },
    async writeJson(path, value) {
      return this.writeText(path, `${JSON.stringify(value, null, 2)}
`);
    },
    async readBytes(path) {
      try {
        return ok(new Uint8Array(await readFile(path)));
      } catch (error) {
        return ioFailure(`could not read ${path}`, error);
      }
    },
    async hashFile(path) {
      const bytes = await this.readBytes(path);
      if (!bytes.ok) return bytes;
      return ok(sha256Bytes(bytes.value));
    },
    async exists(path) {
      try {
        await stat(path);
        return true;
      } catch {
        return false;
      }
    },
    async stat(path) {
      try {
        const stats = await stat(path);
        const value = { kind: kindOf(stats), size: stats.size, mtimeMs: stats.mtimeMs };
        return ok(value);
      } catch (error) {
        return ioFailure(`could not stat ${path}`, error);
      }
    },
    async list(path) {
      try {
        const entries = await readdir(path, { withFileTypes: true });
        const value = entries.map((entry) => ({
          name: entry.name,
          kind: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "other"
        })).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
        return ok(value);
      } catch (error) {
        return ioFailure(`could not list ${path}`, error);
      }
    },
    async makeDir(path) {
      try {
        await mkdir(path, { recursive: true });
        return ok(void 0);
      } catch (error) {
        return ioFailure(`could not create ${path}`, error);
      }
    },
    async remove(path, options) {
      try {
        await rm(path, { recursive: options?.recursive === true, force: false });
        return ok(void 0);
      } catch (error) {
        return ioFailure(`could not remove ${path}`, error);
      }
    },
    async copy(from, to, options) {
      try {
        await cp(from, to, { recursive: options?.recursive === true });
        const measured = await measureCopyTarget(to);
        return ok(measured);
      } catch (error) {
        return ioFailure(`could not copy ${from} to ${to}`, error);
      }
    },
    async move(from, to) {
      try {
        await rename(from, to);
        return ok(void 0);
      } catch (error) {
        return ioFailure(`could not move ${from} to ${to}`, error);
      }
    },
    async realPath(path) {
      try {
        return ok(await realpath(path));
      } catch (error) {
        return ioFailure(`could not resolve ${path}`, error);
      }
    }
  };
}
async function measureCopyTarget(path) {
  const stats = await lstat(path);
  if (stats.isFile()) return { files: 1, bytes: stats.size };
  const entries = await readdir(path, { withFileTypes: true });
  let files = 0;
  let bytes = 0;
  for (const entry of entries) {
    const child = `${path}/${entry.name}`;
    if (entry.isDirectory()) {
      const nested = await measureCopyTarget(child);
      files += nested.files;
      bytes += nested.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += (await lstat(child)).size;
    }
  }
  return { files, bytes };
}
var readFileSlice = async (path, offset, length) => {
  if (!Number.isInteger(offset) || offset < 0) {
    return err(failure("invalid-input", `slice offset must be a non-negative integer, got ${String(offset)}`));
  }
  if (!Number.isInteger(length) || length <= 0) {
    return err(failure("invalid-input", `slice length must be a positive integer, got ${String(length)}`));
  }
  const handle = await open(path, "r").catch(() => null);
  if (handle === null) {
    return err(failure("io", `could not open ${path}`));
  }
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return ok(new Uint8Array(buffer.subarray(0, bytesRead)));
  } catch (error) {
    return ioFailure(`could not read ${path}`, error);
  } finally {
    await handle.close().catch(() => void 0);
  }
};

// src/real-machine-verification/runtime/platform/http.ts
var DEFAULT_TIMEOUT_MS = 15e3;
function createHttpPort() {
  return {
    async request(request) {
      const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const init = {
        method: request.method ?? "GET",
        ...request.headers === void 0 ? {} : { headers: { ...request.headers } },
        ...request.body === void 0 ? {} : { body: request.body },
        redirect: request.followRedirects === true ? "follow" : "manual",
        signal: AbortSignal.timeout(timeoutMs)
      };
      try {
        const response = await fetch(request.url, init);
        const headers = {};
        response.headers.forEach((value, name) => {
          headers[name] = value;
        });
        const setCookie = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
        const body = await response.text();
        return ok({ status: response.status, headers, body, setCookie });
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          return err(
            failure("timeout", `${request.method ?? "GET"} ${request.url} timed out after ${timeoutMs} ms`, "check that the instance is up, then retry")
          );
        }
        return err(
          failure(
            "io",
            `${request.method ?? "GET"} ${request.url} failed: ${error instanceof Error ? error.message : String(error)}`,
            "the instance may not be listening yet"
          )
        );
      }
    }
  };
}

// src/real-machine-verification/runtime/platform/process.ts
import { spawn as spawn2, execFile } from "node:child_process";
import { closeSync, openSync } from "node:fs";
var DEFAULT_KILL_TIMEOUT_MS = 5e3;
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = error.code;
    return code === "EPERM";
  }
}
function execFileAsync(file, args) {
  return new Promise((resolve2) => {
    execFile(file, [...args], { windowsHide: true }, (error) => {
      if (error === null) {
        resolve2({ code: 0 });
        return;
      }
      resolve2({ code: typeof error.code === "number" ? error.code : null });
    });
  });
}
async function waitForDeath(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((resolve2) => {
      setTimeout(resolve2, 50);
    });
  }
  return !isAlive(pid);
}
function createProcessPort() {
  return {
    async spawnDetached(request) {
      const executable = request.argv[0];
      if (executable === void 0 || executable.length === 0) {
        return err(failure("invalid-input", "a spawned process needs at least one argv entry"));
      }
      let stdoutFd = null;
      let stderrFd = null;
      try {
        stdoutFd = openSync(request.stdoutPath, "a");
        stderrFd = openSync(request.stderrPath, "a");
        const child = spawn2(executable, request.argv.slice(1), {
          cwd: request.cwd,
          env: { ...request.env },
          detached: request.detached,
          windowsHide: request.windowsHide,
          stdio: ["ignore", stdoutFd, stderrFd]
        });
        if (child.pid === void 0) {
          return err(failure("io", `could not start ${executable}: no pid was assigned`));
        }
        child.unref();
        return ok({ pid: child.pid, stdoutPath: request.stdoutPath, stderrPath: request.stderrPath });
      } catch (error) {
        return err(
          failure(
            "io",
            `could not start ${executable}: ${error instanceof Error ? error.message : String(error)}`,
            "check the executable path"
          )
        );
      } finally {
        if (stdoutFd !== null) closeSync(stdoutFd);
        if (stderrFd !== null) closeSync(stderrFd);
      }
    },
    isAlive,
    async killTree(pid, killOptions) {
      if (!Number.isInteger(pid) || pid <= 0) {
        return err(failure("invalid-input", `not a process id: ${String(pid)}`));
      }
      const wasAlive = isAlive(pid);
      if (!wasAlive) return ok({ killed: false, alreadyGone: true });
      const timeoutMs = killOptions?.timeoutMs ?? DEFAULT_KILL_TIMEOUT_MS;
      if (process.platform === "win32") {
        const outcome = await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"]);
        const gone2 = await waitForDeath(pid, timeoutMs);
        if (!gone2) {
          return err(
            failure(
              "timeout",
              `process tree ${pid} is still alive after taskkill`,
              "stop it from Task Manager, then rerun cleanup",
              { taskkillExitCode: outcome.code }
            )
          );
        }
        return ok({ killed: true, alreadyGone: false });
      }
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
        }
      }
      if (await waitForDeath(pid, timeoutMs)) return ok({ killed: true, alreadyGone: false });
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
        }
      }
      const gone = await waitForDeath(pid, timeoutMs);
      if (!gone) {
        return err(failure("timeout", `process tree ${pid} survived SIGKILL`, "inspect the process table"));
      }
      return ok({ killed: true, alreadyGone: false });
    }
  };
}

// src/real-machine-verification/runtime/platform/screen.ts
var POWERSHELL_SCREENS = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{ Id = $_.DeviceName; Primary = [bool]$_.Primary; Width = $_.Bounds.Width; Height = $_.Bounds.Height } } | ConvertTo-Json -Compress";
function parseJsonScreens(text) {
  let parsed;
  try {
    parsed = JSON.parse(text.trim());
  } catch (error) {
    return err(failure("unsupported", `screen probe returned unparsable JSON: ${error instanceof Error ? error.message : String(error)}`));
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const screens = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry;
    const width = typeof record["Width"] === "number" ? record["Width"] : 0;
    const height = typeof record["Height"] === "number" ? record["Height"] : 0;
    if (width <= 0 || height <= 0) continue;
    screens.push({
      id: typeof record["Id"] === "string" && record["Id"].length > 0 ? record["Id"] : `screen-${screens.length + 1}`,
      primary: record["Primary"] === true,
      width,
      height
    });
  }
  return ok(screens);
}
function parseXRandR(text) {
  const seen = /* @__PURE__ */ new Set();
  const screens = [];
  for (const match of text.matchAll(/(\d+)x(\d+)\+\d+\+\d+/g)) {
    const width = Number(match[1]);
    const height = Number(match[2]);
    const key = `${width}x${height}`;
    if (!Number.isFinite(width) || !Number.isFinite(height) || seen.has(key)) continue;
    seen.add(key);
    screens.push({ id: key, primary: screens.length === 0, width, height });
  }
  return screens;
}
function createScreenPort(options) {
  return {
    async screens() {
      const platform = options.env.platform();
      if (platform === "win32") {
        const run = await options.command.run({
          argv: ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", POWERSHELL_SCREENS],
          timeoutMs: 2e4
        });
        if (!run.ok) return run;
        if (run.value.exitCode !== 0) {
          return err(
            failure(
              "unsupported",
              `PowerShell screen probe exited ${String(run.value.exitCode)}`,
              "inject a ScreenPort, or open a desktop session before asking for screen checks",
              { stderr: run.value.stderr.slice(-500) }
            )
          );
        }
        return parseJsonScreens(run.value.stdout);
      }
      if (platform === "darwin") {
        const run = await options.command.run({
          argv: ["system_profiler", "SPDisplaysDataType"],
          timeoutMs: 2e4
        });
        if (!run.ok) return run;
        const matches = [...run.value.stdout.matchAll(/Resolution:\s*(\d+)\s*x\s*(\d+)/gi)];
        const screens = matches.map((match, index) => ({
          id: `display-${index + 1}`,
          primary: index === 0,
          width: Number(match[1]),
          height: Number(match[2])
        }));
        if (screens.length === 0) {
          return err(failure("unsupported", "system_profiler reported no display resolution"));
        }
        return ok(screens);
      }
      if (platform === "linux") {
        const run = await options.command.run({ argv: ["xrandr", "--query"], timeoutMs: 1e4 });
        if (!run.ok) return run;
        const screens = parseXRandR(run.value.stdout);
        if (screens.length === 0) return err(failure("unsupported", "xrandr reported no connected display"));
        return ok(screens);
      }
      return err(failure("unsupported", `no screen probe for platform ${platform}`, "inject a ScreenPort in this runtime"));
    }
  };
}

// src/real-machine-verification/runtime/platform/defaults.ts
function createNodePorts(options = {}) {
  const env = createEnvPort();
  const command = createCommandPort();
  const ports = {
    fs: createFsPort(),
    command,
    process: createProcessPort(),
    http: createHttpPort(),
    clock: createClockPort(),
    env,
    screen: createScreenPort({ command, env }),
    browser: options.browser ?? null,
    ...options.overrides ?? {}
  };
  return ports;
}
function createRuntimeFacts() {
  return { nodeVersion: process.versions.node, readFileSlice };
}

// src/real-machine-verification/cli/args.ts
var VALUE_FLAG_SPECS = [
  { key: "declaration", spellings: ["--declaration"] },
  { key: "profile", spellings: ["--profile"] },
  { key: "workRoot", spellings: ["--work-root"] },
  { key: "port", spellings: ["--port"] },
  { key: "id", spellings: ["--id"] },
  { key: "dir", spellings: ["--dir"] },
  { key: "count", spellings: ["--count"] },
  { key: "profiles", spellings: ["--profiles"] },
  { key: "out", spellings: ["--out"] },
  { key: "name", spellings: ["--name"] },
  { key: "baseRef", spellings: ["--base-ref"] },
  { key: "batch", spellings: ["--batch"] },
  { key: "candidate", spellings: ["--candidate"] },
  { key: "archiveRoot", spellings: ["--archive-root"] },
  { key: "tgz", spellings: ["--tgz"] },
  { key: "method", spellings: ["--method"] },
  { key: "provider", spellings: ["--provider"] },
  { key: "model", spellings: ["--model"] },
  { key: "apiKeyEnv", spellings: ["--api-key-env"] },
  { key: "concurrency", spellings: ["--concurrency"] },
  { key: "keepBatches", spellings: ["--keep-batches"] },
  { key: "keepHomes", spellings: ["--keep-homes"] }
];
var MULTI_VALUE_FLAG_SPECS = [
  { key: "file", spellings: ["--file"] },
  { key: "check", spellings: ["--check"] }
];
var BOOLEAN_FLAG_SPECS = [
  { key: "json", spellings: ["--json"] },
  { key: "help", spellings: ["--help", "-h"] },
  { key: "version", spellings: ["--version", "-v"] },
  { key: "screen", spellings: ["--screen"] },
  { key: "keep", spellings: ["--keep"] },
  { key: "dryRun", spellings: ["--dry-run"] },
  { key: "all", spellings: ["--all"] },
  { key: "fix", spellings: ["--fix"] },
  { key: "failFast", spellings: ["--fail-fast"] },
  { key: "collectAll", spellings: ["--collect-all"] },
  { key: "yes", spellings: ["--yes"] },
  { key: "includePkg", spellings: ["--include-pkg"] },
  { key: "allowDirty", spellings: ["--allow-dirty"] },
  { key: "allowStale", spellings: ["--allow-stale"] }
];
function lookupMap(specs) {
  const map = /* @__PURE__ */ new Map();
  for (const spec of specs) {
    for (const spelling of spec.spellings) map.set(spelling, spec.key);
  }
  return map;
}
function canonicalRecord(specs) {
  const record = {};
  for (const spec of specs) record[spec.key] = spec.spellings[0];
  return record;
}
var VALUE_FLAGS = lookupMap(VALUE_FLAG_SPECS);
var VALUE_CANONICAL = canonicalRecord(VALUE_FLAG_SPECS);
var MULTI_VALUE_FLAGS = lookupMap(MULTI_VALUE_FLAG_SPECS);
var MULTI_VALUE_CANONICAL = canonicalRecord(MULTI_VALUE_FLAG_SPECS);
var BOOLEAN_FLAGS = lookupMap(BOOLEAN_FLAG_SPECS);
var BOOLEAN_CANONICAL = canonicalRecord(BOOLEAN_FLAG_SPECS);
function parseArgs(argv) {
  const booleans = Object.fromEntries(
    BOOLEAN_FLAG_SPECS.map((spec) => [spec.key, false])
  );
  const values = {};
  const multi = Object.fromEntries(
    MULTI_VALUE_FLAG_SPECS.map((spec) => [spec.key, []])
  );
  const positional = [];
  const unknown = [];
  const problems = [];
  const given = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? "";
    if (argument === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (argument.startsWith("--") && argument.includes("=")) {
      const equals = argument.indexOf("=");
      const name = argument.slice(0, equals);
      const value = argument.slice(equals + 1);
      const multiTarget = MULTI_VALUE_FLAGS.get(name);
      if (multiTarget !== void 0) {
        given.push(MULTI_VALUE_CANONICAL[multiTarget]);
        if (value.length === 0) {
          problems.push(`${name} needs a value`);
          continue;
        }
        multi[multiTarget].push(value);
        continue;
      }
      const target = VALUE_FLAGS.get(name);
      if (target === void 0) {
        unknown.push(argument);
        continue;
      }
      given.push(VALUE_CANONICAL[target]);
      if (value.length === 0) {
        problems.push(`${name} needs a value`);
        continue;
      }
      values[target] = value;
      continue;
    }
    if (argument.startsWith("-")) {
      const booleanFlag = BOOLEAN_FLAGS.get(argument);
      if (booleanFlag === void 0) {
        const multiTarget = MULTI_VALUE_FLAGS.get(argument);
        if (multiTarget !== void 0) {
          const value2 = argv[index + 1];
          given.push(MULTI_VALUE_CANONICAL[multiTarget]);
          if (value2 === void 0 || value2.startsWith("-")) {
            problems.push(`${argument} needs a value`);
            continue;
          }
          index += 1;
          multi[multiTarget].push(value2);
          continue;
        }
        const target = VALUE_FLAGS.get(argument);
        if (target === void 0) {
          unknown.push(argument);
          continue;
        }
        const value = argv[index + 1];
        given.push(VALUE_CANONICAL[target]);
        if (value === void 0 || value.startsWith("-")) {
          problems.push(`${argument} needs a value`);
          continue;
        }
        index += 1;
        values[target] = value;
        continue;
      }
      given.push(BOOLEAN_CANONICAL[booleanFlag]);
      booleans[booleanFlag] = true;
      continue;
    }
    positional.push(argument);
  }
  const definedValues = {};
  for (const key of Object.keys(values)) {
    const value = values[key];
    if (value !== void 0) definedValues[key] = value;
  }
  return {
    command: positional[0] ?? null,
    ...booleans,
    ...definedValues,
    files: multi.file,
    checks: multi.check,
    positional,
    unknown,
    problems,
    given
  };
}
function flagProblems(args, allowed) {
  const problems = [];
  if (args.unknown.length > 0) problems.push(`unknown option(s): ${args.unknown.join(", ")}`);
  for (const problem2 of args.problems) problems.push(problem2);
  const notAllowed = [...new Set(args.given)].filter((flag) => !allowed.has(flag)).sort();
  if (notAllowed.length > 0) problems.push(`option(s) not valid for this command: ${notAllowed.join(", ")}`);
  if (args.positional.length > 1) problems.push(`unexpected argument(s): ${args.positional.slice(1).join(" ")}`);
  return problems;
}

// src/real-machine-verification/cli/commands/batch.ts
var BATCH_USAGE = "dsh-verify batch open|status [--name <n>] [--base-ref <r>] [--candidate <dir>] [--allow-stale] [--json]";
var BATCH_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--name",
  "--base-ref",
  "--candidate",
  "--allow-stale",
  "--dry-run",
  "--work-root",
  "--profile",
  "--declaration"
]);
function errorJson(action, stage, failure2) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "batch",
    action,
    ok: false,
    error: {
      code: failure2.code,
      message: failure2.message,
      ...failure2.hint === void 0 ? {} : { hint: failure2.hint },
      ...failure2.details === void 0 ? {} : { details: failure2.details },
      stage
    }
  })}
`;
}
function usageFailure(message) {
  return {
    code: "invalid-input",
    message,
    hint: BATCH_USAGE
  };
}
function renderCheck(check) {
  if (check.status === "fail") {
    const expected = check.expected === void 0 ? "(not recorded)" : check.expected;
    const actual = check.actual === void 0 ? "(not recorded)" : check.actual;
    const hint = check.hint === void 0 ? "" : `; hint: ${check.hint}`;
    return `fail ${check.id} ${check.detail}; expected: ${expected}; actual: ${actual}${hint}`;
  }
  return `${check.status === "pass" ? "ok" : check.status === "skip" ? "skip" : "blocked"} ${check.id} ${check.detail}`;
}
function renderIdentityLines(outcome) {
  const lines = [];
  lines.push(
    outcome.identityLine.length > 0 ? outcome.identityLine : "\uFF08\u672C\u6279\u6B21\u5C1A\u672A\u51BB\u7ED3\u5019\u9009\uFF0C\u56E0\u6B64\u8FD8\u6CA1\u6709\u8EAB\u4EFD\u884C\uFF1Bfreeze \u5230\u6279\u6B21\u76EE\u5F55\u540E batch open --candidate \u624D\u4F1A\u751F\u6210\uFF09"
  );
  lines.push(
    outcome.baseLine ?? "- \u9A8C\u8BC1\u57FA\u7EBF\uFF1A\u65E0\uFF08\u672C\u6279\u6B21\u672A\u8BB0\u5F55\u57FA\u7EBF\uFF0C\u65B0\u9C9C\u5EA6\u5224\u4E3A blocked\uFF0C\u4E0D\u662F\u300C\u4E0D\u9700\u8981\u68C0\u67E5\u300D\uFF09"
  );
  return `${lines.join("\n")}
`;
}
function openJson(outcome) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "batch",
    action: "open",
    ok: true,
    exitCode: EXIT_CODES.ok,
    batch: {
      name: outcome.record.batchName,
      dir: outcome.batchDir,
      file: outcome.batchFile,
      createdAt: outcome.createdAt,
      reused: outcome.reused,
      dryRun: outcome.dryRun
    },
    profile: outcome.raw.profile ?? null,
    profileName: outcome.raw.profileName ?? null,
    phase: outcome.phase,
    candidate: outcome.candidate === null ? null : {
      path: outcome.candidate.path,
      manifest: outcome.candidatePath,
      commit: outcome.candidate.commit,
      version: outcome.candidate.version,
      manifestSha256: outcome.candidate.sha256,
      tgzSha256: outcome.candidate.tgzSha256
    },
    candidateProblems: outcome.candidateProblems,
    base: outcome.raw.base ?? null,
    identityLine: outcome.identityLine,
    baseLine: outcome.baseLine,
    allowStale: outcome.allowStale,
    record: outcome.raw,
    notes: outcome.notes
  })}
`;
}
function statusJson(outcome) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "batch",
    action: "status",
    ok: outcome.exitCode === EXIT_CODES.ok,
    exitCode: outcome.exitCode,
    batch: {
      name: outcome.record.batchName,
      dir: outcome.batchDir,
      file: outcome.batchFile,
      createdAt: outcome.record.createdAt,
      status: outcome.record.status
    },
    record: outcome.raw,
    identityLine: outcome.identityLine,
    baseLine: outcome.baseLine,
    freshness: outcome.freshness === null ? null : {
      status: outcome.freshness.status,
      message: outcome.freshness.message,
      problems: outcome.freshness.problems,
      endHead: outcome.freshness.endHead,
      endCheckedAt: outcome.freshness.endCheckedAt
    },
    allowedStale: outcome.allowedStale,
    evidence: {
      root: outcome.evidence.root,
      readable: outcome.evidence.readable,
      scanned: outcome.evidence.scanned,
      bound: outcome.evidence.bound,
      rejected: outcome.evidence.rejected
    },
    checks: outcome.checks.map((check) => ({
      id: check.id,
      title: check.title,
      hard: check.hard,
      status: check.status,
      detail: check.detail,
      ...check.expected === void 0 ? {} : { expected: check.expected },
      ...check.actual === void 0 ? {} : { actual: check.actual },
      ...check.hint === void 0 ? {} : { hint: check.hint },
      ...check.blockedReason === void 0 ? {} : { blockedReason: check.blockedReason },
      reason: check.reason
    })),
    notes: outcome.notes
  })}
`;
}
var ACTION_FLAGS = {
  open: BATCH_FLAGS,
  status: /* @__PURE__ */ new Set(["--json", "--name", "--allow-stale", "--dry-run", "--work-root"])
};
function validateInvocation(args) {
  if (args.command !== "batch") {
    return {
      ok: false,
      action: null,
      message: `batch command was dispatched wrongly (received ${args.command ?? "no command"})`
    };
  }
  const problems = [];
  if (args.unknown.length > 0) problems.push(`unknown option(s): ${args.unknown.join(", ")}`);
  for (const problem2 of args.problems) problems.push(problem2);
  const raw = args.positional[1];
  const action = raw === "open" || raw === "status" ? raw : null;
  if (action === null) {
    return {
      ok: false,
      action: null,
      message: raw === void 0 ? "missing subcommand (open|status)" : `unknown subcommand "${raw}" (expected open|status)`
    };
  }
  if (args.positional.length > 2) {
    problems.push(`unexpected argument(s): ${args.positional.slice(2).join(" ")}`);
  }
  const allowed = ACTION_FLAGS[action];
  const notAllowed = [...new Set(args.given)].filter((flag) => !allowed.has(flag)).sort();
  if (notAllowed.length > 0) {
    problems.push(`option(s) not valid for batch ${action}: ${notAllowed.join(", ")}`);
  }
  if (problems.length > 0) return { ok: false, action, message: problems.join("; ") };
  return { ok: true, action };
}
async function runOpen(action, args, deps) {
  const { ports, io } = deps;
  const cwd = ports.env.cwd();
  const context = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime?.nodeVersion ?? "0.0.0-unknown",
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!context.ok) {
    io.stderr(`dsh-verify batch open: ${formatFailure(context.error.failure)}
`);
    if (args.json) io.stdout(errorJson(action, context.error.stage, context.error.failure));
    return EXIT_CODES.blocked;
  }
  const declaration = context.value.declaration;
  const profile = context.value.profile;
  const candidateArg = args.candidate === void 0 ? void 0 : resolveAgainst(cwd, args.candidate);
  const opened = await openBatch({
    ports,
    cwd,
    workRoot: context.value.workRoot,
    ...args.name === void 0 ? {} : { name: args.name },
    ...args.baseRef === void 0 ? {} : { baseRef: args.baseRef },
    ...candidateArg === void 0 ? {} : { candidate: candidateArg },
    allowStale: args.allowStale,
    dryRun: args.dryRun,
    profile,
    profileName: context.value.profileName,
    declaration
  });
  if (!opened.ok) {
    io.stderr(`dsh-verify batch open: ${formatFailure(opened.error)}
`);
    if (args.json) io.stdout(errorJson(action, opened.error.stage, opened.error));
    return opened.error.blocked ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
  }
  const outcome = opened.value;
  for (const note of outcome.notes) io.stderr(`note: ${note}
`);
  if (args.json) {
    io.stdout(openJson(outcome));
    return EXIT_CODES.ok;
  }
  const verb = outcome.phase === "prepared" ? outcome.reused ? `\u6279\u6B21 ${outcome.record.batchName} \u5DF2\u7ECF\u51C6\u5907\u597D\uFF0C\u7B49\u5F85\u5019\u9009\uFF08\u672A\u6539\u5199 ${BATCH_RECORD_FILENAME}\uFF09` : args.dryRun ? `\u6279\u6B21 ${outcome.record.batchName} dry-run \u51C6\u5907\uFF08\u672A\u5199 ${BATCH_RECORD_FILENAME}\uFF09` : `\u6279\u6B21 ${outcome.record.batchName} \u5DF2\u51C6\u5907\u5230 ${outcome.batchFile}` : outcome.reused ? `\u6279\u6B21 ${outcome.record.batchName} \u5DF2\u5B58\u5728\u4E14\u8EAB\u4EFD\u4E00\u81F4\uFF08\u672A\u6539\u5199 ${BATCH_RECORD_FILENAME}\uFF09` : args.dryRun ? `\u6279\u6B21 ${outcome.record.batchName} dry-run \u5C01\u5B58\uFF08\u672A\u5199 ${BATCH_RECORD_FILENAME}\uFF09` : `\u6279\u6B21 ${outcome.record.batchName} \u5DF2\u5C01\u5B58\u5019\u9009\u5E76\u8BB0\u5F55\u5230 ${outcome.batchFile}`;
  io.stdout(`ok batch-open ${verb}
`);
  io.stdout(renderIdentityLines(outcome));
  return EXIT_CODES.ok;
}
async function runStatus(action, args, deps) {
  const { ports, io } = deps;
  const cwd = ports.env.cwd();
  const workRoot = resolveWorkRoot(cwd, args.workRoot);
  const checked = await checkBatch({
    ports,
    cwd,
    workRoot,
    ...args.name === void 0 ? {} : { name: args.name },
    allowStale: args.allowStale,
    dryRun: args.dryRun
  });
  if (!checked.ok) {
    io.stderr(`dsh-verify batch status: ${formatFailure(checked.error)}
`);
    if (args.json) io.stdout(errorJson(action, checked.error.stage, checked.error));
    return EXIT_CODES.blocked;
  }
  const outcome = checked.value;
  for (const note of outcome.notes) io.stderr(`note: ${note}
`);
  if (args.json) {
    io.stdout(statusJson(outcome));
    return outcome.exitCode;
  }
  io.stdout(renderIdentityLines(outcome));
  for (const check of outcome.checks) io.stdout(`${renderCheck(check)}
`);
  return outcome.exitCode;
}
async function runBatchCommand(args, deps) {
  const validation = validateInvocation(args);
  if (!validation.ok) {
    const failure2 = usageFailure(validation.message);
    deps.io.stderr(`dsh-verify batch: ${failure2.message}
${BATCH_USAGE}
`);
    if (args.json) deps.io.stdout(errorJson(validation.action, "usage", failure2));
    return EXIT_CODES.blocked;
  }
  return validation.action === "open" ? runOpen(validation.action, args, deps) : runStatus(validation.action, args, deps);
}

// src/real-machine-verification/orchestration/cleanup.ts
var GUARD_HINT = "choose a dedicated work root such as <repo>/.scratch/verify";
async function guardCleanupRoot(fs, workRoot, context) {
  const protectedPaths = [context.homeDir, context.cwd, context.tmpDir];
  const textual = deleteGuardReason(workRoot, protectedPaths);
  if (textual !== null) {
    return err(failure("invalid-input", `refusing to clean ${workRoot}: ${textual}`, GUARD_HINT));
  }
  const resolved = await fs.realPath(workRoot);
  if (!resolved.ok) {
    if (await fs.exists(workRoot)) {
      return err(
        failure(
          "io",
          `refusing to clean ${workRoot}: cannot resolve its real path: ${formatFailure(resolved.error)}`,
          GUARD_HINT
        )
      );
    }
    return ok({ realWorkRoot: null });
  }
  const resolvedReason = deleteGuardReason(resolved.value, protectedPaths);
  if (resolvedReason !== null) {
    return err(
      failure(
        "invalid-input",
        `refusing to clean ${workRoot}: resolves to ${resolved.value} (${resolvedReason})`,
        GUARD_HINT
      )
    );
  }
  for (const protectedPath of protectedPaths) {
    const protectedReal = await fs.realPath(protectedPath);
    if (protectedReal.ok && samePath(resolved.value, protectedReal.value)) {
      return err(
        failure(
          "invalid-input",
          `refusing to clean ${workRoot}: resolves to the protected directory ${protectedReal.value}`,
          GUARD_HINT
        )
      );
    }
  }
  return ok({ realWorkRoot: resolved.value });
}
function planEntry(entry, mtime) {
  return {
    path: entry.path,
    relativePath: entry.relativePath,
    category: entry.category,
    archived: entry.archived,
    kind: entry.kind,
    mtime,
    mtimeMs: entry.mtimeMs,
    bytes: entry.bytes,
    files: entry.files,
    directories: entry.directories,
    unsafe: entry.problem !== null
  };
}
function rankEligible(entries) {
  const ranks = /* @__PURE__ */ new Map();
  const counts = /* @__PURE__ */ new Map();
  for (const category of ["batch", "home", "temp", "candidate"]) {
    const eligible = entries.filter((entry) => entry.category === category && !entry.archived && entry.problem === null).sort((left, right) => {
      const byAge = (right.mtimeMs ?? 0) - (left.mtimeMs ?? 0);
      if (byAge !== 0) return byAge;
      return left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0;
    });
    eligible.forEach((entry, index) => ranks.set(entry.path, index + 1));
    counts.set(category, eligible.length);
  }
  return { ranks, counts };
}
function retainedEntry(entry, rank, count, keep, flag) {
  if (rank <= keep) {
    return { ...entry, rank, action: "keep", reason: `rank ${rank} of ${count} is within ${flag} ${keep}` };
  }
  return { ...entry, rank, action: "delete", reason: `rank ${rank} of ${count} exceeds ${flag} ${keep}` };
}
function planCleanup(scan, retention, clock) {
  const { ranks, counts } = rankEligible(scan.entries);
  const entries = scan.entries.map((entry) => {
    const base = planEntry(entry, entry.mtimeMs === null ? null : clock.iso(entry.mtimeMs));
    if (entry.category === "unknown") {
      return { ...base, rank: null, action: "report", reason: "unknown entry; never deleted" };
    }
    if (entry.archived) {
      return { ...base, rank: null, action: "keep", reason: "archived evidence is immutable" };
    }
    if (entry.problem !== null) {
      return { ...base, rank: null, action: "report", reason: `not deleted: ${entry.problem}` };
    }
    const rank = ranks.get(entry.path) ?? null;
    if (rank === null) {
      return { ...base, rank: null, action: "report", reason: "not ranked; never deleted" };
    }
    const count = counts.get(entry.category) ?? 0;
    switch (entry.category) {
      case "batch":
        return retainedEntry(base, rank, count, retention.batches, "--keep-batches");
      case "home":
        return retainedEntry(base, rank, count, retention.homes, "--keep-homes");
      case "temp":
        return { ...base, rank, action: "delete", reason: "temporary artifacts are not retained" };
      case "candidate":
        if (!retention.includePkg) {
          return {
            ...base,
            rank,
            action: "report",
            reason: "candidate packages are report-only; pass --include-pkg to delete"
          };
        }
        return {
          ...base,
          rank,
          action: "delete",
          reason: "--include-pkg was passed; candidate packages are not retained"
        };
      default:
        return { ...base, rank: null, action: "report", reason: "unknown entry; never deleted" };
    }
  });
  return {
    workRoot: scan.workRoot,
    realWorkRoot: scan.realWorkRoot,
    retention,
    entries,
    problems: scan.problems,
    summary: {
      entries: entries.length,
      keep: entries.filter((entry) => entry.action === "keep").length,
      delete: entries.filter((entry) => entry.action === "delete").length,
      report: entries.filter((entry) => entry.action === "report").length,
      unsafe: entries.filter((entry) => entry.unsafe).length
    }
  };
}
async function executeCleanup(plan, ports, protectedPaths) {
  const removed = [];
  const failed2 = [];
  let freedBytes = 0;
  for (const entry of plan.entries) {
    if (entry.action !== "delete" || entry.unsafe) continue;
    const refusal = deleteGuardReason(entry.path, [...protectedPaths, plan.workRoot]);
    if (refusal !== null) {
      failed2.push({ path: entry.path, relativePath: entry.relativePath, error: `refusing to delete: ${refusal}` });
      continue;
    }
    if (plan.realWorkRoot === null) {
      failed2.push({
        path: entry.path,
        relativePath: entry.relativePath,
        error: "work root has no resolved path; refusing to delete"
      });
      continue;
    }
    const resolved = await ports.fs.realPath(entry.path);
    if (!resolved.ok) {
      failed2.push({ path: entry.path, relativePath: entry.relativePath, error: formatFailure(resolved.error) });
      continue;
    }
    if (!isInsidePath(resolved.value, plan.realWorkRoot) || samePath(resolved.value, plan.realWorkRoot)) {
      failed2.push({
        path: entry.path,
        relativePath: entry.relativePath,
        error: `refusing to delete: ${resolved.value} is outside the work root ${plan.realWorkRoot}`
      });
      continue;
    }
    const deletion = await ports.fs.remove(entry.path, { recursive: true });
    if (!deletion.ok) {
      failed2.push({ path: entry.path, relativePath: entry.relativePath, error: formatFailure(deletion.error) });
      continue;
    }
    removed.push({ path: entry.path, relativePath: entry.relativePath, bytes: entry.bytes });
    freedBytes += entry.bytes;
  }
  return { removed, failed: failed2, freedBytes };
}

// src/real-machine-verification/runtime/dsh/cleanup-scan.ts
var KNOWN_ROOTS = /* @__PURE__ */ new Map([
  ["runs", { category: "temp", archived: false }],
  ["isolation", { category: "temp", archived: false }],
  ["instances", { category: "home", archived: false }],
  ["batches", { category: "batch", archived: false }],
  ["candidates", { category: "candidate", archived: false }],
  ["archive", { category: "batch", archived: true }]
]);
function byName(left, right) {
  return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
async function describeEntry(fs, path, relativePath2, listed, category, archived, realWorkRoot) {
  const issues = [];
  const kind = listed.kind;
  let mtimeMs = null;
  let bytes = 0;
  let files = 0;
  let directories = 0;
  const stat2 = await fs.stat(path);
  if (stat2.ok) {
    mtimeMs = stat2.value.mtimeMs;
    if (kind === "file") {
      bytes = stat2.value.size;
      files = 1;
    }
  } else {
    issues.push(`cannot stat: ${formatFailure(stat2.error)}`);
  }
  if (kind === "directory") {
    const measured = await measureTree(fs, path);
    if (measured.ok) {
      files = measured.value.files;
      directories = measured.value.directories;
      bytes = measured.value.bytes;
    } else {
      issues.push(`cannot measure tree: ${formatFailure(measured.error)}`);
    }
  }
  if (kind === "symlink") {
    issues.push("symbolic link: its target is not verified, so it is never deleted");
  } else if (kind === "other") {
    issues.push("not a regular file or directory: never deleted");
  }
  let realPath = null;
  let insideWorkRoot = false;
  if (kind === "file" || kind === "directory") {
    const resolved = await fs.realPath(path);
    if (!resolved.ok) {
      issues.push(`cannot resolve real path: ${formatFailure(resolved.error)}`);
    } else if (realWorkRoot === null) {
      issues.push("work root has no resolved path, so containment cannot be verified");
    } else {
      realPath = resolved.value;
      insideWorkRoot = isInsidePath(resolved.value, realWorkRoot) && !samePath(resolved.value, realWorkRoot);
      if (!insideWorkRoot) issues.push(`resolves outside the work root: ${resolved.value}`);
    }
  }
  return {
    path,
    relativePath: relativePath2,
    category,
    archived,
    kind,
    mtimeMs,
    bytes,
    files,
    directories,
    realPath,
    insideWorkRoot,
    problem: issues.length === 0 ? null : issues.join("; ")
  };
}
async function scanWorkRoot(fs, workRoot) {
  if (!await fs.exists(workRoot)) {
    return { workRoot, exists: false, realWorkRoot: null, entries: [], problems: [] };
  }
  const rootStat = await fs.stat(workRoot);
  if (!rootStat.ok) {
    return {
      workRoot,
      exists: true,
      realWorkRoot: null,
      entries: [],
      problems: [`cannot stat work root: ${formatFailure(rootStat.error)}`]
    };
  }
  if (rootStat.value.kind !== "directory") {
    return {
      workRoot,
      exists: true,
      realWorkRoot: null,
      entries: [],
      problems: [`work root is a ${rootStat.value.kind}, not a directory`]
    };
  }
  const resolvedRoot = await fs.realPath(workRoot);
  const realWorkRoot = resolvedRoot.ok ? resolvedRoot.value : null;
  const problems = [];
  if (!resolvedRoot.ok) {
    problems.push(`cannot resolve work root: ${formatFailure(resolvedRoot.error)}`);
  }
  const listed = await fs.list(workRoot);
  if (!listed.ok) {
    problems.push(`cannot list work root: ${formatFailure(listed.error)}`);
    return { workRoot, exists: true, realWorkRoot, entries: [], problems };
  }
  const entries = [];
  for (const child of [...listed.value].sort(byName)) {
    const childPath = joinFsPath(workRoot, child.name);
    const known = KNOWN_ROOTS.get(child.name);
    if (known === void 0) {
      entries.push(await describeEntry(fs, childPath, child.name, child, "unknown", false, realWorkRoot));
      continue;
    }
    if (child.kind !== "directory") {
      const described = await describeEntry(fs, childPath, child.name, child, "unknown", false, realWorkRoot);
      const knownRootProblem = `known root ${child.name} is a ${child.kind}, not a directory`;
      entries.push({
        ...described,
        problem: described.problem === null ? knownRootProblem : `${described.problem}; ${knownRootProblem}`
      });
      continue;
    }
    const nested = await fs.list(childPath);
    if (!nested.ok) {
      problems.push(`cannot list ${child.name}: ${formatFailure(nested.error)}`);
      continue;
    }
    for (const item of [...nested.value].sort(byName)) {
      const itemPath = joinFsPath(childPath, item.name);
      entries.push(
        await describeEntry(
          fs,
          itemPath,
          `${child.name}/${item.name}`,
          item,
          known.category,
          known.archived,
          realWorkRoot
        )
      );
    }
  }
  return { workRoot, exists: true, realWorkRoot, entries, problems };
}

// src/real-machine-verification/cli/commands/cleanup.ts
var CLEANUP_USAGE = "dsh-verify cleanup [--yes] [--keep-batches <n>] [--keep-homes <n>] [--include-pkg] [--json] [--dry-run]";
var CLEANUP_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--work-root",
  "--yes",
  "--keep-batches",
  "--keep-homes",
  "--include-pkg",
  "--dry-run"
]);
var DEFAULT_KEEP_BATCHES = 2;
var DEFAULT_KEEP_HOMES = 0;
var NOTHING_EXECUTED = { removed: [], failed: [], freedBytes: 0 };
function jsonEntry(entry) {
  return {
    path: entry.path,
    relativePath: entry.relativePath,
    category: entry.category,
    kind: entry.kind,
    archived: entry.archived,
    mtime: entry.mtime,
    bytes: entry.bytes,
    files: entry.files,
    directories: entry.directories,
    rank: entry.rank,
    action: entry.action,
    reason: entry.reason,
    unsafe: entry.unsafe
  };
}
function renderJson(input) {
  const summary = input.plan?.summary ?? { entries: 0, keep: 0, delete: 0, report: 0, unsafe: 0 };
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "cleanup",
    ok: input.ok,
    dryRun: input.dryRun,
    workRoot: input.workRoot,
    exists: input.exists,
    retention: {
      batches: input.retention.batches,
      homes: input.retention.homes,
      temp: 0,
      includePkg: input.retention.includePkg
    },
    entries: input.plan?.entries.map(jsonEntry) ?? [],
    summary: {
      entries: summary.entries,
      keep: summary.keep,
      delete: summary.delete,
      report: summary.report,
      unsafe: summary.unsafe,
      deleted: input.execution?.removed.length ?? 0,
      freedBytes: input.execution?.freedBytes ?? 0
    },
    failures: input.execution?.failed ?? [],
    problems: input.problems,
    ...input.error === void 0 ? {} : { error: input.error }
  })}
`;
}
function renderEntry(entry) {
  const mtime = entry.mtime ?? "unknown mtime";
  return `${entry.action.padEnd(6)} ${entry.category.padEnd(9)} ${entry.relativePath} \u2014 ${entry.reason} (${entry.bytes} bytes, ${entry.files} file(s), ${entry.directories} dir(s), ${mtime})
`;
}
function renderHuman(plan, execution, dryRun, exists) {
  if (!exists) return `cleanup: work root ${plan.workRoot} does not exist; nothing to clean
`;
  if (plan.entries.length === 0) return `cleanup: no entries under ${plan.workRoot}
`;
  const lines = plan.entries.map(renderEntry);
  if (dryRun) {
    lines.push(
      `cleanup: ${plan.summary.entries} entries; ${plan.summary.delete} would be deleted, ${plan.summary.keep} kept, ${plan.summary.report} report-only; dry run \u2014 nothing was deleted (pass --yes to delete)
`
    );
  } else {
    lines.push(
      `cleanup: ${plan.summary.entries} entries; deleted ${execution.removed.length} of ${plan.summary.delete}, freed ${execution.freedBytes} bytes; ${plan.summary.keep} kept, ${plan.summary.report} report-only
`
    );
  }
  return lines.join("");
}
function parseCount(raw, fallback, flag, problems) {
  if (raw === void 0) return fallback;
  if (!/^\d+$/.test(raw)) {
    problems.push(`${flag} expects a non-negative integer, got "${raw}"`);
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    problems.push(`${flag} is too large: ${raw}`);
    return fallback;
  }
  return value;
}
async function runCleanupCommand(args, deps) {
  const { ports, io } = deps;
  const dryRun = args.dryRun || !args.yes;
  const problems = [...flagProblems(args, CLEANUP_FLAGS)];
  const retention = {
    batches: parseCount(args.keepBatches, DEFAULT_KEEP_BATCHES, "--keep-batches", problems),
    homes: parseCount(args.keepHomes, DEFAULT_KEEP_HOMES, "--keep-homes", problems),
    includePkg: args.includePkg
  };
  const workRoot = resolveWorkRoot(ports.env.cwd(), args.workRoot);
  if (problems.length > 0) {
    const error = problems.join("; ");
    io.stderr(`dsh-verify cleanup: ${error}
${CLEANUP_USAGE}
`);
    if (args.json) {
      io.stdout(
        renderJson({
          ok: false,
          dryRun,
          workRoot,
          exists: false,
          retention,
          plan: null,
          execution: null,
          problems: [],
          error
        })
      );
    }
    return EXIT_CODES.blocked;
  }
  if (args.dryRun && args.yes) {
    io.stderr("dsh-verify cleanup: --dry-run overrides --yes; nothing will be deleted\n");
  }
  const guard = await guardCleanupRoot(ports.fs, workRoot, {
    homeDir: ports.env.homeDir(),
    cwd: ports.env.cwd(),
    tmpDir: ports.env.tmpDir()
  });
  if (!guard.ok) {
    const error = formatFailure(guard.error);
    io.stderr(`dsh-verify cleanup: ${error}
`);
    if (args.json) {
      io.stdout(
        renderJson({
          ok: false,
          dryRun,
          workRoot,
          exists: false,
          retention,
          plan: null,
          execution: null,
          problems: [],
          error
        })
      );
    }
    return EXIT_CODES.blocked;
  }
  const scan = await scanWorkRoot(ports.fs, workRoot);
  const plan = planCleanup(scan, retention, ports.clock);
  for (const problem2 of plan.problems) io.stderr(`dsh-verify cleanup: ${problem2}
`);
  const execution = dryRun ? NOTHING_EXECUTED : await executeCleanup(plan, ports, [ports.env.homeDir(), ports.env.cwd(), ports.env.tmpDir()]);
  for (const failure2 of execution.failed) {
    io.stderr(`dsh-verify cleanup: failed to delete ${failure2.relativePath}: ${failure2.error}
`);
  }
  const ok3 = plan.problems.length === 0 && execution.failed.length === 0;
  if (args.json) {
    io.stdout(
      renderJson({
        ok: ok3,
        dryRun,
        workRoot,
        exists: scan.exists,
        retention,
        plan,
        execution,
        problems: plan.problems
      })
    );
  } else {
    io.stdout(renderHuman(plan, execution, dryRun, scan.exists));
  }
  return ok3 ? EXIT_CODES.ok : EXIT_CODES.hardFailure;
}

// src/real-machine-verification/cli/commands/failure.ts
var CLI_NAME = "dsh-verify";
function failureJson(command, stage, error) {
  return {
    schemaVersion: 1,
    command,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  };
}
function emitFailure(io, json, command, stage, error) {
  io.stderr(`${CLI_NAME} ${command}: ${formatFailure(error)}
`);
  if (json) io.stdout(`${JSON.stringify(failureJson(command, stage, error))}
`);
  return EXIT_CODES.blocked;
}
function emitUsageFailure(io, json, command, problems, usage) {
  const message = problems.length === 0 ? "invalid arguments" : problems.join("; ");
  io.stderr(`${CLI_NAME} ${command}: ${message}
`);
  io.stderr(`  usage: ${usage}
`);
  if (json) {
    io.stdout(
      `${JSON.stringify(failureJson(command, "usage", { code: "invalid-input", message, hint: `usage: ${usage}` }))}
`
    );
  }
  return EXIT_CODES.blocked;
}

// src/real-machine-verification/contracts/run-state.ts
function createRunReport(init) {
  return {
    schemaVersion: 1,
    capability: "real-machine-verification",
    command: init.command,
    profile: init.profile,
    startedAt: init.startedAt,
    finishedAt: init.startedAt,
    state: "running",
    exitCode: 0,
    checks: [],
    steps: [],
    notes: [...init.notes ?? []]
  };
}
function stateFromChecks(checks) {
  const exitCode = decideExitCode(checks);
  if (exitCode === 1) return { state: "failed", exitCode };
  if (exitCode === 2) return { state: "blocked", exitCode };
  return { state: "passed", exitCode };
}
function finishRunReport(report, input) {
  const derived = stateFromChecks(input.checks);
  return {
    ...report,
    finishedAt: input.finishedAt,
    state: input.overrideState ?? derived.state,
    exitCode: input.overrideState === "aborted" ? 1 : derived.exitCode,
    checks: [...input.checks],
    steps: [...input.steps],
    ...input.evidence === void 0 ? {} : { evidence: input.evidence },
    ...input.batch === void 0 ? {} : { batch: input.batch },
    ...input.model === void 0 ? {} : { model: input.model },
    ...input.artifacts === void 0 ? {} : { artifacts: input.artifacts },
    notes: [...report.notes, ...input.notes ?? []]
  };
}
function exitCodeOfRun(report) {
  return report.exitCode;
}
function verdictLine(report) {
  const tally = tallyChecks(report.checks);
  const counts = `${tally.passed} pass, ${tally.failed} fail, ${tally.skipped} skip, ${tally.blocked} blocked`;
  const failure2 = describeFailures(report.checks);
  return failure2 === null ? `${report.state} (${counts})` : `${report.state} (${counts}) \u2014 ${failure2}`;
}
function runReportJson(report) {
  return JSON.stringify(report, null, 2);
}

// src/real-machine-verification/contracts/evidence-contract.ts
var EVIDENCE_STEM_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;
function isSafeEvidencePath(value) {
  if (value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  const segments = value.split(/[\\/]+/);
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

// src/real-machine-verification/evidence/store.ts
var TEXT_EXTENSION = ".txt";
var JSON_EXTENSION = ".json";
var MAX_ORDINAL = 999;
function evidenceRefs(items) {
  return items.map((item) => ({ path: item.path, sha256: item.sha256, kind: item.kind }));
}
var SCREENSHOT_EXTENSIONS = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
function relativeToRoot(root, absolute) {
  const rootPosix = toPosixPath(root).replace(/\/+$/, "");
  const filePosix = toPosixPath(absolute);
  if (filePosix === rootPosix) return null;
  if (!filePosix.startsWith(`${rootPosix}/`)) return null;
  const relative = filePosix.slice(rootPosix.length + 1);
  return isSafeEvidencePath(relative) ? relative : null;
}
function kindForExtension(relative) {
  const dot = relative.lastIndexOf(".");
  const extension = dot < 0 ? "" : relative.slice(dot).toLowerCase();
  if (SCREENSHOT_EXTENSIONS.has(extension)) return "screenshot";
  if (extension === ".json") return "json";
  if (extension === ".txt") return "text";
  return "file";
}
function createEvidenceStore(options) {
  const { fs, root, clock } = options;
  const recorded = [];
  const encoder2 = new TextEncoder();
  async function allocate(stem, extension) {
    if (!EVIDENCE_STEM_RE.test(stem)) {
      return err(
        failure(
          "invalid-input",
          `evidence name ${JSON.stringify(stem)} is not a safe file stem`,
          "use letters, digits, dot, dash or underscore"
        )
      );
    }
    const made = await fs.makeDir(root);
    if (!made.ok) return made;
    for (let ordinal = 1; ordinal <= MAX_ORDINAL; ordinal += 1) {
      const suffix = ordinal === 1 ? "" : `-${ordinal}`;
      const fileName = `${stem}${suffix}${extension}`;
      if (!isSafeEvidencePath(fileName)) continue;
      if (await fs.exists(joinFsPath(root, fileName))) continue;
      return ok(fileName);
    }
    return err(
      failure(
        "conflict",
        `every evidence file name for ${stem}${extension} is taken in ${root}`,
        "record fewer items under one name, or start a new run"
      )
    );
  }
  async function record(stem, extension, kind, content, recordOptions) {
    const fileName = await allocate(stem, extension);
    if (!fileName.ok) return fileName;
    const absolute = joinFsPath(root, fileName.value);
    const written = await fs.writeText(absolute, content);
    if (!written.ok) return written;
    const item = {
      kind: recordOptions?.kind ?? kind,
      path: asEvidencePath(toPosixPath(fileName.value)),
      bytes: encoder2.encode(content).byteLength,
      sha256: sha256Text(content),
      capturedAt: recordOptions?.capturedAt ?? clock.iso(),
      ...recordOptions?.note === void 0 ? {} : { note: recordOptions.note }
    };
    recorded.push(item);
    return ok(item);
  }
  return {
    root,
    items() {
      return [...recorded];
    },
    async recordText(name, content, recordOptions) {
      return record(name, TEXT_EXTENSION, "text", content, recordOptions);
    },
    async recordJson(name, value, recordOptions) {
      return record(name, JSON_EXTENSION, "json", `${JSON.stringify(value, null, 2)}
`, recordOptions);
    },
    async recordFile(path, fileOptions) {
      const relative = relativeToRoot(root, path);
      if (relative === null) {
        return err(
          failure(
            "invalid-input",
            `evidence file ${path} is outside the evidence root ${root}`,
            "write the artifact under the run evidence directory, then declare it"
          )
        );
      }
      const existing = recorded.find((item2) => item2.path === relative);
      if (existing !== void 0) {
        const digest2 = await fs.hashFile(path);
        if (!digest2.ok) return digest2;
        if (digest2.value === existing.sha256) return ok(existing);
        return err(
          failure(
            "conflict",
            `evidence file ${relative} changed after it was recorded`,
            "evidence is immutable: record the new bytes under a new name, or restore the original"
          )
        );
      }
      const stat2 = await fs.stat(path);
      if (!stat2.ok) return stat2;
      if (stat2.value.kind !== "file") {
        return err(
          failure("invalid-input", `evidence path ${relative} is not a regular file`, "declare a file, not a directory")
        );
      }
      if (stat2.value.size <= 0) {
        return err(
          failure("io", `evidence file ${relative} is empty`, "write the artifact before declaring it as evidence")
        );
      }
      const digest = await fs.hashFile(path);
      if (!digest.ok) return digest;
      const item = {
        kind: fileOptions?.kind ?? kindForExtension(relative),
        path: asEvidencePath(relative),
        bytes: stat2.value.size,
        sha256: digest.value,
        capturedAt: fileOptions?.capturedAt ?? clock.iso(),
        ...fileOptions?.note === void 0 ? {} : { note: fileOptions.note }
      };
      recorded.push(item);
      return ok(item);
    }
  };
}

// src/real-machine-verification/contracts/launch-plan.ts
var TOKEN_URL_PATTERN = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([^\s"'<>]+)/;
var DEFAULT_PORT = 0;
var BASE_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "windir",
  "ComSpec",
  "SHELL",
  "TERM",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "XDG_CACHE_HOME"
];
function invalid4(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function isAbsolutePath(value) {
  if (value.length === 0) return false;
  if (value.startsWith("/")) return true;
  return /^[A-Za-z]:[\\/]/.test(value);
}
function buildLaunchEnv(request) {
  const base = request.baseEnv ?? {};
  const env = {};
  for (const name of BASE_ENV_ALLOWLIST) {
    const value = base[name];
    if (value !== void 0) env[name] = value;
  }
  for (const name of request.instanceEnvAllowlist ?? []) {
    const value = base[name];
    if (value !== void 0) env[name] = value;
  }
  env.ELECTRON_RUN_AS_NODE = "1";
  env.DSH_HOME = request.home;
  env.USERPROFILE = request.userprofile;
  env.HOME = request.userprofile;
  for (const [name, value] of Object.entries(request.envFile?.values ?? {})) {
    env[name] = value;
  }
  for (const [name, value] of Object.entries(request.extraEnv ?? {})) {
    env[name] = value;
  }
  if (request.model) {
    env[request.model.apiKeyEnv] = request.model.secretValue;
  }
  return ok(Object.freeze(env));
}
function planLaunch(request) {
  if (!isAbsolutePath(request.home)) {
    return invalid4(`home must be an absolute path, got ${JSON.stringify(request.home)}`);
  }
  if (!isAbsolutePath(request.userprofile)) {
    return invalid4(`userprofile must be an absolute path, got ${JSON.stringify(request.userprofile)}`);
  }
  if (!isAbsolutePath(request.startCwd)) {
    return invalid4(`startCwd must be an absolute path, got ${JSON.stringify(request.startCwd)}`);
  }
  if (request.logDir !== void 0 && !isAbsolutePath(request.logDir)) {
    return invalid4(`logDir must be an absolute path, got ${JSON.stringify(request.logDir)}`);
  }
  if (!isAbsolutePath(request.runtime.exe)) {
    return invalid4(`runtime.exe must be an absolute path, got ${JSON.stringify(request.runtime.exe)}`);
  }
  if (!isAbsolutePath(request.runtime.cliJs)) {
    return invalid4(`runtime.cliJs must be an absolute path, got ${JSON.stringify(request.runtime.cliJs)}`);
  }
  const port = request.port ?? DEFAULT_PORT;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return invalid4(`port must be an integer between 0 and 65535, got ${String(port)}`);
  }
  const env = buildLaunchEnv(request);
  if (!env.ok) return env;
  const envNames = Object.keys(env.value).sort();
  const secretEnvNames = /* @__PURE__ */ new Set();
  if (request.model) secretEnvNames.add(request.model.apiKeyEnv);
  for (const name of request.envFile?.secretNames ?? []) secretEnvNames.add(name);
  const logDirectory = pluginLogDirectory(request);
  const notes = [];
  if (secretEnvNames.size > 0) {
    notes.push(`injected ${secretEnvNames.size} secret variable(s): ${[...secretEnvNames].join(", ")}`);
  }
  if (request.model) {
    notes.push(
      `model ${request.model.provider}/${request.model.model} via ${request.model.apiKeyEnv} (from ${request.model.source})`
    );
  }
  if (port === 0) {
    notes.push("port 0: the host chooses an ephemeral port, so concurrent instances cannot collide");
  }
  notes.push(`executable ${request.runtime.exe} (asar entry ${request.runtime.cliJs})`);
  const plan = {
    profile: request.profile,
    home: request.home,
    userprofile: request.userprofile,
    cwd: request.startCwd,
    port,
    // argv[0] is the executable itself: the process port spawns argv[0] and
    // passes the rest as arguments. The host CLI entry runs under
    // `--expose-internals` because it is an Electron main-process module.
    argv: [request.runtime.exe, "--expose-internals", request.runtime.cliJs, "--profile", request.profile, "--port", String(port), "--no-open"],
    env: env.value,
    envNames,
    secretEnvNames: [...secretEnvNames].sort(),
    logFiles: {
      stdout: joinPath(request.logDir ?? request.startCwd, "instance.stdout.log"),
      stderr: joinPath(request.logDir ?? request.startCwd, "instance.stderr.log"),
      pluginLogDir: logDirectory
    },
    tokenUrlPattern: TOKEN_URL_PATTERN,
    notes
  };
  return ok(plan);
}
function pluginLogDirectory(request) {
  if (request.pluginCacheDir === void 0) return null;
  return joinPath(request.startCwd, request.pluginCacheDir, "logs");
}
function joinPath(...segments) {
  const parts = segments.filter((segment) => segment.length > 0);
  if (parts.length === 0) return "";
  const [first, ...rest] = parts;
  const head = first.replace(/[\\/]+$/, "");
  const tail4 = rest.map((segment) => segment.replace(/^[\\/]+|[\\/]+$/g, "")).filter((segment) => segment.length > 0);
  const separator = head.includes("\\") || /^[A-Za-z]:/.test(head) ? "\\" : "/";
  return [head, ...tail4].join(separator);
}
function parseReadyUrl(line) {
  const match = TOKEN_URL_PATTERN.exec(line);
  if (match === null) return null;
  const port = Number.parseInt(match[1], 10);
  if (!Number.isInteger(port) || port <= 0) return null;
  return { url: match[0], port, token: match[2] };
}
function originOf(ready) {
  return `http://127.0.0.1:${ready.port}`;
}

// src/real-machine-verification/runtime/dsh/launch.ts
var INSTANCE_FILE = "instance.json";
var STOPPED_FILE = "stopped.json";
var DEFAULT_READY_TIMEOUT_MS = 12e4;
var POLL_MS = 150;
var REAP_TIMEOUT_MS = 1e4;
function instanceFilePath(startCwd) {
  return joinFsPath(startCwd, INSTANCE_FILE);
}
function instanceDirectory(record) {
  return record.dir ?? record.startCwd;
}
async function tailOf(fs, file, bytes = 2e3) {
  const read = await fs.readText(file);
  if (!read.ok) return "";
  const text = read.value;
  return text.length <= bytes ? text.trim() : text.slice(text.length - bytes).trim();
}
async function waitForReady(options, startedAtMs = options.clock.nowMs()) {
  const timeoutMs = options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS;
  const deadline = startedAtMs + timeoutMs;
  let lastStdout = "";
  while (options.clock.nowMs() <= deadline) {
    if (!options.process.isAlive(options.pid)) {
      const stderrTail = await tailOf(options.fs, options.stderrPath);
      const stdoutTail = await tailOf(options.fs, options.stdoutPath);
      return err({
        code: "prerequisite",
        message: "the DSH instance exited before printing its access URL",
        hint: [stderrTail, stdoutTail].filter((text) => text.length > 0).join("\n").slice(0, 2e3) || "no output was captured",
        details: { stdoutPath: options.stdoutPath, stderrPath: options.stderrPath }
      });
    }
    const read = await options.fs.readText(options.stdoutPath);
    if (read.ok) {
      lastStdout = read.value;
      for (const line of lastStdout.split(/\r?\n/)) {
        const ready = parseReadyUrl(line);
        if (ready !== null) return ok({ ready, readyMs: options.clock.nowMs() - startedAtMs });
      }
    }
    await options.clock.sleep(POLL_MS);
  }
  return err({
    code: "timeout",
    message: `the DSH instance did not print its access URL within ${timeoutMs}ms`,
    hint: `stdout tail: ${lastStdout.slice(-500) || "(empty)"}; full output: ${options.stdoutPath}`,
    details: { stdoutPath: options.stdoutPath, stderrPath: options.stderrPath }
  });
}
async function reapProcess(options) {
  const timeoutMs = options.timeoutMs ?? REAP_TIMEOUT_MS;
  if (!options.process.isAlive(options.pid)) return ok({ killed: false, alreadyGone: true });
  const killed = await options.process.killTree(options.pid, { timeoutMs });
  if (!killed.ok) return killed;
  const deadline = options.clock.nowMs() + timeoutMs;
  while (options.clock.nowMs() <= deadline) {
    if (!options.process.isAlive(options.pid)) return killed;
    await options.clock.sleep(POLL_MS);
  }
  return err({
    code: "timeout",
    message: `pid ${options.pid} is still alive ${timeoutMs}ms after the kill request`,
    hint: "a child process may be holding the port; close it from the task manager"
  });
}
async function startInstance(options) {
  const { ports, plan } = options;
  const { fs, process: processPort, clock } = ports;
  const note = options.note ?? (() => {
  });
  const stdoutInit = await fs.writeText(plan.logFiles.stdout, "");
  if (!stdoutInit.ok) return stdoutInit;
  const stderrInit = await fs.writeText(plan.logFiles.stderr, "");
  if (!stderrInit.ok) return stderrInit;
  const startedAtMs = clock.nowMs();
  note(`starting ${plan.argv[0] ?? "(no executable)"} in ${plan.cwd}`);
  const spawned = await processPort.spawnDetached({
    argv: plan.argv,
    cwd: plan.cwd,
    env: plan.env,
    stdoutPath: plan.logFiles.stdout,
    stderrPath: plan.logFiles.stderr,
    detached: true,
    windowsHide: true
  });
  if (!spawned.ok) return spawned;
  const ready = await waitForReady(
    {
      fs,
      clock,
      process: processPort,
      stdoutPath: plan.logFiles.stdout,
      stderrPath: plan.logFiles.stderr,
      pid: spawned.value.pid,
      ...options.readyTimeoutMs === void 0 ? {} : { readyTimeoutMs: options.readyTimeoutMs }
    },
    startedAtMs
  );
  if (!ready.ok) {
    await reapProcess({ fs, clock, process: processPort, pid: spawned.value.pid });
    return ready;
  }
  return ok({
    pid: spawned.value.pid,
    startedAtMs,
    startedAt: clock.iso(startedAtMs),
    ready: ready.value.ready,
    readyMs: ready.value.readyMs
  });
}
function buildInstanceRecord(options) {
  const { plan, started } = options;
  return {
    schemaVersion: 1,
    instanceId: options.instanceId,
    dir: options.dir,
    pid: started.pid,
    port: started.ready.port,
    tokenUrl: started.ready.url,
    originUrl: originOf(started.ready),
    profile: plan.profile,
    home: plan.home,
    userprofile: plan.userprofile,
    startCwd: plan.cwd,
    startedAt: started.startedAt,
    readyMs: started.readyMs,
    stdoutPath: plan.logFiles.stdout,
    stderrPath: plan.logFiles.stderr,
    pluginLogDir: plan.logFiles.pluginLogDir,
    exe: options.runtime.exe,
    cliJs: options.runtime.cliJs,
    envNames: plan.envNames,
    secretEnvNames: plan.secretEnvNames,
    model: options.model,
    readiness: options.readiness,
    keep: options.keep,
    planPath: options.planPath
  };
}
async function writeInstanceRecord(fs, record) {
  return fs.writeJson(instanceFilePath(instanceDirectory(record)), record);
}
function stoppedFilePath(record) {
  return joinFsPath(instanceDirectory(record), STOPPED_FILE);
}
async function stopRecord(ports, record, timeoutMs = 15e3) {
  const { process: processPort, clock, fs } = ports;
  const stoppedFile = stoppedFilePath(record);
  if (!processPort.isAlive(record.pid)) {
    await fs.writeJson(stoppedFile, { pid: record.pid, stoppedAt: clock.iso(), alreadyGone: true });
    return ok({ killed: false, alreadyGone: true });
  }
  const killed = await processPort.killTree(record.pid, { timeoutMs });
  if (!killed.ok) return killed;
  const deadline = clock.nowMs() + timeoutMs;
  while (clock.nowMs() <= deadline) {
    if (!processPort.isAlive(record.pid)) {
      await fs.writeJson(stoppedFile, {
        pid: record.pid,
        stoppedAt: clock.iso(),
        alreadyGone: killed.value.alreadyGone
      });
      return killed;
    }
    await clock.sleep(POLL_MS);
  }
  return err({
    code: "timeout",
    message: `instance pid ${record.pid} is still alive ${timeoutMs}ms after the kill request`,
    hint: "a child process may be holding the port; close it from the task manager and remove the instance directory",
    details: { pid: record.pid, instanceId: record.instanceId ?? null }
  });
}
async function loadInstance(fs, target) {
  const file = target.endsWith(".json") ? target : instanceFilePath(target);
  const raw = await fs.readJson(file);
  if (!raw.ok) {
    return err({
      code: "not-found",
      message: `no instance record at ${file}`,
      hint: "launch an instance first, or pass the directory that launch printed"
    });
  }
  const value = raw.value;
  if (typeof value !== "object" || value === null) {
    return err({ code: "io", message: `instance record is not a JSON object: ${file}` });
  }
  const record = value;
  const pid = record["pid"];
  const port = record["port"];
  const tokenUrl = record["tokenUrl"];
  if (typeof pid !== "number" || typeof port !== "number" || typeof tokenUrl !== "string") {
    return err({ code: "io", message: `instance record is incomplete: ${file}`, hint: "delete the directory and launch again" });
  }
  return ok(value);
}

// src/real-machine-verification/orchestration/types.ts
function checkId2(value) {
  return unwrapOrThrow(parseCheckId(value), formatFailure);
}
function passed(detail, evidence) {
  return { status: "pass", detail, ...evidence === void 0 ? {} : { evidence } };
}
function failed(detail, expected, actual, hint, evidence) {
  return { status: "fail", detail, expected, actual, hint, ...evidence === void 0 ? {} : { evidence } };
}
function skipped(detail, hint, evidence) {
  return { status: "skip", detail, ...hint === void 0 ? {} : { hint }, ...evidence === void 0 ? {} : { evidence } };
}
function blocked(detail, hint, evidence, reason) {
  return {
    status: "blocked",
    detail,
    hint,
    ...evidence === void 0 ? {} : { evidence },
    ...reason === void 0 ? {} : { blockedReason: reason }
  };
}
function toCheckResult(check, outcome, durationMs) {
  const normalized = normalizeOutcome(outcome);
  return {
    id: check.id,
    title: check.title,
    hard: check.hard,
    status: normalized.status,
    detail: normalized.detail,
    ...normalized.expected === void 0 ? {} : { expected: normalized.expected },
    ...normalized.actual === void 0 ? {} : { actual: normalized.actual },
    ...normalized.hint === void 0 ? {} : { hint: normalized.hint },
    ...normalized.status === "blocked" ? {
      blockedReason: normalized.blockedReason ?? {
        code: "prerequisite-missing",
        message: normalized.detail,
        ...normalized.hint === void 0 ? {} : { hint: normalized.hint }
      }
    } : {},
    evidence: normalized.evidence ?? [],
    durationMs
  };
}
function normalizeOutcome(outcome) {
  if (outcome.status === "fail") {
    return {
      ...outcome,
      expected: outcome.expected ?? "the check's claim holds",
      actual: outcome.actual ?? outcome.detail,
      hint: outcome.hint ?? "read the evidence referenced by this report"
    };
  }
  if (outcome.status === "blocked") {
    const hint = outcome.hint ?? "install or enable the missing prerequisite, then rerun";
    return {
      ...outcome,
      hint,
      blockedReason: outcome.blockedReason ?? {
        code: "prerequisite-missing",
        message: outcome.detail,
        hint
      }
    };
  }
  return outcome;
}

// src/real-machine-verification/orchestration/checks/instances-distinct.ts
var ISOLATION_FIELDS = [
  { label: "port", read: (row2) => row2.port === null ? null : String(row2.port) },
  { label: "DSH_HOME", read: (row2) => row2.home },
  { label: "start directory", read: (row2) => row2.workdir },
  { label: "plugin log directory", read: (row2) => row2.pluginLogDir }
];
function collisionsOf(rows) {
  const collisions = [];
  for (const field of ISOLATION_FIELDS) {
    const firstIndex = /* @__PURE__ */ new Map();
    for (const row2 of rows) {
      const value = field.read(row2);
      if (value === null) continue;
      const first = firstIndex.get(value);
      if (first === void 0) {
        firstIndex.set(value, row2.index);
        continue;
      }
      collisions.push(`${field.label}: instances #${first} and #${row2.index} share ${value}`);
    }
  }
  return collisions;
}
function createInstancesDistinctCheck() {
  return {
    id: checkId2("instances-distinct"),
    title: "instances are isolated on port, DSH_HOME, start directory and plugin log directory",
    hard: true,
    requires: [],
    onMissing: "skip",
    run(context) {
      const refs = context.evidenceRefs ?? [];
      if (context.failure !== null) {
        return blocked(
          `could not plan the isolated instances: ${context.failure.message}`,
          context.failure.hint ?? "fix the prerequisite named above, then rerun dsh-verify concurrent",
          refs
        );
      }
      const rows = context.rows;
      if (rows.length === 0) {
        return blocked(
          "no instance rows were recorded",
          "this is a defect in the concurrent planner; keep the report and open a ticket",
          refs
        );
      }
      const notReady2 = rows.filter((row2) => row2.readiness !== "ready");
      if (notReady2.length > 0) {
        const shown = notReady2.slice(0, 3).map(
          (row2) => `instance ${row2.index} (profile ${row2.profile}, id ${row2.instanceId}) ${row2.failure === null ? "did not reach readiness" : row2.failure.message}`
        ).join("; ");
        const more = notReady2.length > 3 ? `; +${notReady2.length - 3} more` : "";
        return failed(
          `only ${rows.length - notReady2.length} of ${rows.length} instance(s) reached readiness`,
          `all ${rows.length} requested instances start and become ready`,
          `${shown}${more}`,
          `read the instance stderr log: ${notReady2[0].dir}/instance.stderr.log, fix the failure and rerun`,
          refs
        );
      }
      const collisions = collisionsOf(rows);
      if (collisions.length > 0) {
        return failed(
          `${collisions.length} isolation field(s) collide across instances`,
          `port, DSH_HOME, start directory and plugin log directory are pairwise distinct across ${rows.length} instances`,
          collisions.slice(0, 3).join("; "),
          `each instance gets a fresh home, a fresh working directory and an ephemeral port; inspect ${rows[0].dir}/plan.json and the launch argv`,
          refs
        );
      }
      const ports = rows.map((row2) => row2.port === null ? "(none)" : String(row2.port)).join(", ");
      const pluginLogUndeclared = rows.every((row2) => row2.pluginLogDir === null);
      const suffix = pluginLogUndeclared ? "; plugin log directory is not declared (profile.pluginCacheDir missing), so that field was not compared" : "";
      return passed(
        `${rows.length} instance(s) are pairwise distinct on port (${ports}), DSH_HOME, start directory and plugin log directory${suffix}`,
        refs
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/teardown-clean.ts
function uncleanLine(row2) {
  const cleanup = row2.cleanup;
  const pid = row2.pid === null ? "(no pid)" : String(row2.pid);
  const why = cleanup === null ? "no cleanup observation was recorded" : cleanup.error !== null ? `stopRecord failed: ${cleanup.error}` : "is still alive after the stop request";
  return `pid ${pid} (instance ${row2.index}, id ${row2.instanceId}) ${why}`;
}
function createTeardownCleanCheck() {
  return {
    id: checkId2("teardown-clean"),
    title: "every launched instance is stopped and its process is gone",
    hard: true,
    requires: [],
    onMissing: "skip",
    run(context) {
      const refs = context.evidenceRefs ?? [];
      if (context.failure !== null) {
        return skipped(
          "no instance was started, so there is nothing to clean up",
          "the run stopped before the launch phase",
          refs
        );
      }
      const launched = context.rows.filter((row2) => row2.cleanup !== null);
      if (launched.length === 0) {
        return passed(
          "no instance survived the launch phase; every failed launch was reaped by executeInstance, so 0 residual process(es) were observed",
          refs
        );
      }
      const unclean = launched.filter(
        (row2) => row2.cleanup === null || !row2.cleanup.stopped || row2.cleanup.aliveAfter || row2.cleanup.error !== null
      );
      if (unclean.length > 0) {
        return failed(
          `${unclean.length} of ${launched.length} launched instance(s) could not be reclaimed`,
          "every launched instance is stopped and its pid is gone",
          unclean.slice(0, 3).map(uncleanLine).join("; "),
          `kill the named pid from the task manager, then remove its instance directory under ${context.workRoot}; a survivor holds a port and would poison the next run`,
          refs
        );
      }
      return passed(
        `stopped ${launched.length} instance(s); 0 residual process(es); stopped.json was written for each`,
        refs
      );
    }
  };
}

// src/real-machine-verification/runtime/dsh/credentials.ts
var REFS_HEADER_RE = /^refs:\s*(?:#.*)?$/;
var REF_KEY_RE = /^([A-Za-z_$][A-Za-z0-9_.$-]*):(?:\s|$)/;
function scanCredentialRefs(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const refs = [];
  const seen = /* @__PURE__ */ new Set();
  let inRefs = false;
  let headerSeen = false;
  let childIndent = null;
  for (const line of lines) {
    if (!inRefs) {
      if (REFS_HEADER_RE.test(line)) {
        inRefs = true;
        headerSeen = true;
      }
      continue;
    }
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const indentMatch = /^[ \t]*/.exec(line);
    const indent = indentMatch === null ? 0 : indentMatch[0].length;
    if (indent === 0) break;
    if (childIndent === null) childIndent = indent;
    if (indent !== childIndent) continue;
    const match = REF_KEY_RE.exec(trimmed);
    if (match === null) continue;
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    refs.push(name);
  }
  if (!headerSeen) return { refs: [], note: "the text has no top-level refs: block" };
  return { refs, note: null };
}
async function probeCredentialStore(fs, path, ref) {
  const text = await fs.readText(path);
  if (!text.ok) {
    return { path, readable: false, refPresent: false, refCount: 0, note: text.error.message };
  }
  const scan = scanCredentialRefs(text.value);
  return {
    path,
    readable: true,
    refPresent: scan.refs.includes(ref),
    refCount: scan.refs.length,
    note: scan.note
  };
}
function credentialStorePath(dshHome) {
  return joinFsPath(dshHome, ".credentials.yaml");
}

// src/real-machine-verification/runtime/dsh/credential-store.ts
var REFS_HEADER = /^refs:\s*(?:#.*)?$/;
var REF_ENTRY = /^\s+([A-Za-z_$][A-Za-z0-9_.$-]*):(?:\s*(.*))?$/;
function parseCredentialRefs(text) {
  const refs = /* @__PURE__ */ new Map();
  let inside = false;
  let entryIndent = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!inside) {
      if (REFS_HEADER.test(rawLine.trimEnd())) inside = true;
      continue;
    }
    if (rawLine.trim().length === 0) continue;
    if (/^\s*#/.test(rawLine)) continue;
    if (!/^\s/.test(rawLine)) break;
    const match = REF_ENTRY.exec(rawLine);
    if (match === null) continue;
    const indent = match[1] === void 0 ? 0 : rawLine.length - rawLine.trimStart().length;
    if (entryIndent === null) entryIndent = indent;
    if (indent !== entryIndent) continue;
    const name = match[1];
    if (name === void 0) continue;
    const value = unquote((match[2] ?? "").trim());
    if (!refs.has(name)) refs.set(name, value);
  }
  return refs;
}
function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === '"' && last === '"' || first === "'" && last === "'") {
      return value.slice(1, -1);
    }
  }
  return value;
}
async function readRefs(readText, home) {
  const text = await readText(credentialStorePath(home));
  if (!text.ok) return null;
  return parseCredentialRefs(text.value);
}
async function resolveModelCredential(options) {
  const { apiKeyEnv } = options;
  const notes = [];
  const batchRefs = await readRefs(options.readText, options.batchHome);
  const batchValue = batchRefs?.get(apiKeyEnv);
  if (batchValue !== void 0 && batchValue.length > 0) {
    return { credential: { name: apiKeyEnv, value: batchValue, source: "batch-home-store" }, notes };
  }
  notes.push(`${apiKeyEnv} is not in the batch home credential store`);
  const realRefs = await readRefs(options.readText, options.realHome);
  const realValue = realRefs?.get(apiKeyEnv);
  if (realValue !== void 0 && realValue.length > 0) {
    return { credential: { name: apiKeyEnv, value: realValue, source: "real-home-store" }, notes };
  }
  notes.push(`${apiKeyEnv} is not in the real home credential store`);
  const processValue = options.envGet(apiKeyEnv);
  if (processValue !== void 0 && processValue.length > 0) {
    return { credential: { name: apiKeyEnv, value: processValue, source: "process-env" }, notes };
  }
  notes.push(`${apiKeyEnv} is not set in the process environment`);
  return { credential: null, notes };
}

// src/real-machine-verification/runtime/dsh/http-session.ts
function cookieHeaderFrom(response) {
  return response.setCookie.map((value) => value.split(";")[0]?.trim() ?? "").filter((value) => value.length > 0).join("; ");
}
async function connectHost(options) {
  const origin = originOf(options.ready);
  const url = `${origin}/connect?token=${encodeURIComponent(options.ready.token)}`;
  const response = await options.http.request({
    url,
    method: "GET",
    timeoutMs: options.timeoutMs ?? 15e3,
    followRedirects: false
  });
  if (!response.ok) return response;
  const status = response.value.status;
  if (status === 401 || status === 403) {
    return err({
      code: "prerequisite",
      message: `the instance rejected the access token (HTTP ${status})`,
      hint: "the instance may have restarted; launch again and use the new instance.json"
    });
  }
  if (status >= 500) {
    return err({
      code: "prerequisite",
      message: `the instance failed the connect handshake (HTTP ${status})`,
      hint: response.value.body.slice(0, 300)
    });
  }
  if (status < 200 || status >= 400) {
    return err({
      code: "prerequisite",
      message: `the instance answered the connect handshake with HTTP ${status}`,
      hint: response.value.body.slice(0, 300)
    });
  }
  const cookie = cookieHeaderFrom(response.value);
  let counter = 0;
  const session = {
    origin,
    token: options.ready.token,
    status,
    cookie,
    get: async (path, getOptions) => {
      const result = await options.http.request({
        url: `${origin}${path.startsWith("/") ? path : `/${path}`}`,
        method: "GET",
        ...cookie.length === 0 ? {} : { headers: { Cookie: cookie } },
        timeoutMs: getOptions?.timeoutMs ?? 15e3,
        followRedirects: false
      });
      return result;
    },
    call: async (endpoint, args, callOptions) => {
      counter += 1;
      const rpcId = `verify-${options.clock.nowMs().toString(36)}-${counter}`;
      const body = JSON.stringify({
        type: "client-request",
        rpcId,
        method: endpoint,
        payload: { args: args ?? {} }
      });
      const response2 = await options.http.request({
        url: `${origin}/api/${endpoint}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...cookie.length === 0 ? {} : { Cookie: cookie }
        },
        body,
        timeoutMs: callOptions?.timeoutMs ?? 3e4,
        followRedirects: false
      });
      if (!response2.ok) return response2;
      if (response2.value.status < 200 || response2.value.status >= 300) {
        return err({
          code: "prerequisite",
          message: `host RPC ${endpoint} answered HTTP ${response2.value.status}`,
          hint: response2.value.body.slice(0, 300)
        });
      }
      let envelope;
      try {
        envelope = JSON.parse(response2.value.body);
      } catch {
        return err({
          code: "io",
          message: `host RPC ${endpoint} did not answer JSON`,
          hint: response2.value.body.slice(0, 200)
        });
      }
      return unwrapRpcEnvelope(envelope, endpoint);
    }
  };
  return ok(session);
}
function unwrapRpcEnvelope(envelope, endpoint) {
  if (typeof envelope !== "object" || envelope === null) {
    return err({
      code: "io",
      message: `host RPC ${endpoint} did not answer a server-response envelope`
    });
  }
  const result = envelope.result;
  if (typeof result !== "object" || result === null) {
    return err({
      code: "io",
      message: `host RPC ${endpoint} did not answer a server-response envelope`,
      hint: JSON.stringify(envelope).slice(0, 200)
    });
  }
  const { ok: succeeded, value, error } = result;
  if (succeeded === true) return ok(value);
  const message = typeof error?.message === "string" ? error.message : `host RPC ${endpoint} failed`;
  const code = typeof error?.code === "string" ? error.code : null;
  return err({
    code: "prerequisite",
    message,
    ...code === null ? {} : { details: { remoteCode: code } }
  });
}
async function pluginInventoryReadiness(session) {
  const value = await session.call("pluginInventory/list", {});
  if (!value.ok) return value;
  const inventory = value.value;
  if (typeof inventory !== "object" || inventory === null) {
    return err({
      code: "prerequisite",
      message: "pluginInventory/list did not answer an inventory object",
      hint: JSON.stringify(inventory).slice(0, 200)
    });
  }
  const rawEntries = inventory.entries;
  if (!Array.isArray(rawEntries)) {
    return err({
      code: "prerequisite",
      message: "pluginInventory/list did not answer an entries array",
      hint: JSON.stringify(inventory).slice(0, 200)
    });
  }
  const entries = rawEntries.map(readInventoryEntry);
  const enabled = entries.filter((entry) => entry.enabled);
  const offenders = enabled.filter((entry) => entry.fiberPhase !== "active").map((entry) => ({ entryId: entry.entryId, fiberPhase: entry.fiberPhase }));
  const managementAvailable = inventory.managementAvailable;
  return ok({
    entryCount: entries.length,
    enabledCount: enabled.length,
    activeCount: enabled.filter((entry) => entry.fiberPhase === "active").length,
    offenders,
    allReady: entries.length > 0 && offenders.length === 0,
    managementAvailable: typeof managementAvailable === "boolean" ? managementAvailable : null
  });
}
function readInventoryEntry(raw) {
  const record = typeof raw === "object" && raw !== null ? raw : {};
  const entryId = typeof record["entryId"] === "string" ? record["entryId"] : "";
  const moduleName = typeof record["moduleName"] === "string" ? record["moduleName"] : null;
  const enabled = record["enabled"] === true;
  const phase = record["fiberPhase"];
  return {
    entryId,
    moduleName,
    enabled,
    fiberPhase: typeof phase === "string" ? phase : null
  };
}

// src/real-machine-verification/orchestration/instance.ts
var READINESS_CRITERION = "the host printed its token URL and every enabled plugin entry reported fiberPhase active";
function instanceIdFor(profile, workRoot, startedAtMs) {
  return sha256Text(canonicalJson({ profile, workRoot, startedAtMs })).slice(0, 16);
}
function instanceLayoutFor(workRoot, instanceId) {
  const dir = joinFsPath(workRoot, "instances", instanceId);
  return {
    dir,
    home: joinFsPath(dir, "home"),
    userprofile: joinFsPath(dir, "userprofile"),
    workdir: joinFsPath(dir, "workdir"),
    stdoutLog: joinFsPath(dir, "instance.stdout.log"),
    stderrLog: joinFsPath(dir, "instance.stderr.log"),
    planPath: joinFsPath(dir, "plan.json"),
    instancePath: joinFsPath(dir, "instance.json")
  };
}
function stageFailure(stage, error, extraHint) {
  const hint = extraHint === void 0 ? error.hint : error.hint === void 0 ? extraHint : `${error.hint}; ${extraHint}`;
  return {
    code: error.code,
    message: error.message,
    ...hint === void 0 ? {} : { hint },
    ...error.details === void 0 ? {} : { details: error.details },
    stage
  };
}
function prerequisite(error, extraHint) {
  return err(stageFailure("prerequisite", error, extraHint));
}
function notReady(error, extraHint) {
  return err(stageFailure("not-ready", error, extraHint));
}
async function planModel(ports, profile, home, dshHome) {
  const selected = profile.model;
  if (selected === false) {
    return { modelPlan: null, model: null, note: null, notes: ["profile.model is false: the instance is not given a model credential"] };
  }
  const lookup = await resolveModelCredential({
    apiKeyEnv: selected.apiKeyEnv,
    batchHome: home,
    realHome: dshHome,
    readText: (path) => ports.fs.readText(path),
    envGet: (name) => ports.env.get(name)
  });
  const notes = [...lookup.notes];
  if (lookup.credential === null) {
    const note = `model ${selected.provider}/${selected.model} is configured but ${selected.apiKeyEnv} is missing (checked the batch home, the real home store and the process environment); the instance can start, but model calls may fail`;
    return {
      modelPlan: null,
      model: {
        provider: selected.provider,
        model: selected.model,
        apiKeyEnv: selected.apiKeyEnv,
        credentialSource: "missing",
        credentialAvailable: false,
        profileConfigured: true
      },
      note,
      notes
    };
  }
  const modelPlan = {
    provider: selected.provider,
    model: selected.model,
    apiKeyEnv: selected.apiKeyEnv,
    secretValue: lookup.credential.value,
    source: lookup.credential.source
  };
  notes.push(`model credential ${selected.apiKeyEnv} comes from ${lookup.credential.source}`);
  return {
    modelPlan,
    model: {
      provider: selected.provider,
      model: selected.model,
      apiKeyEnv: selected.apiKeyEnv,
      credentialSource: lookup.credential.source,
      credentialAvailable: true,
      profileConfigured: true
    },
    note: null,
    notes
  };
}
async function planInstance(options) {
  const { ports, profile, profileDir } = options;
  const stat2 = await ports.fs.stat(profileDir);
  if (!stat2.ok) {
    return prerequisite(
      failure(
        "prerequisite",
        `the profile directory does not exist: ${profileDir}`,
        "open DSH once with this profile, or point DSH_HOME at the home that has it",
        { profileDir, dshHome: options.dshHome }
      )
    );
  }
  if (stat2.value.kind !== "directory") {
    return prerequisite(failure("prerequisite", `the profile path is not a directory: ${profileDir}`, void 0, { profileDir }));
  }
  const instanceId = instanceIdFor(options.profileName, options.workRoot, options.startedAtMs);
  const layout = instanceLayoutFor(options.workRoot, instanceId);
  const copy = {
    sourceProfileDir: profileDir,
    targetProfileDir: joinFsPath(layout.home, "profiles", options.profileName),
    pluginCacheDir: profile.pluginCacheDir ?? null
  };
  const model = await planModel(ports, profile, layout.home, options.dshHome);
  const launched = planLaunch({
    profile: options.profileName,
    home: layout.home,
    userprofile: layout.userprofile,
    startCwd: layout.workdir,
    logDir: layout.dir,
    ...profile.pluginCacheDir === void 0 ? {} : { pluginCacheDir: profile.pluginCacheDir },
    runtime: options.runtime,
    ...options.port === void 0 ? {} : { port: options.port },
    ...model.modelPlan === null ? {} : { model: model.modelPlan },
    instanceEnvAllowlist: profile.instanceEnvAllowlist,
    baseEnv: ports.env.snapshot()
  });
  if (!launched.ok) {
    return prerequisite(launched.error, "the launch plan is invalid; this is a bug in the plan inputs, not a machine problem");
  }
  const notes = [
    `profile ${options.profileName} copied from ${copy.sourceProfileDir} into the isolated home`,
    `instance directory: ${layout.dir}`,
    `launch cwd: ${layout.workdir}`,
    `instance logs: ${layout.stdoutLog}`,
    ...model.notes
  ];
  if (copy.pluginCacheDir !== null) notes.push(`plugin log directory cleared in the copy: ${joinFsPath(copy.targetProfileDir, copy.pluginCacheDir, "logs")}`);
  notes.push(`launch argv: ${launched.value.argv.join(" ")}`);
  return ok({
    instanceId,
    profileName: options.profileName,
    profile,
    layout,
    copy,
    launch: launched.value,
    modelPlan: model.modelPlan,
    model: model.model,
    modelNote: model.note,
    notes,
    workRoot: options.workRoot,
    dshHome: options.dshHome,
    startedAtMs: options.startedAtMs,
    startedAt: ports.clock.iso(options.startedAtMs),
    keep: options.keep
  });
}
function projectInstancePlan(plan, copyOutcome) {
  return {
    schemaVersion: 1,
    instanceId: plan.instanceId,
    profile: plan.profileName,
    dir: plan.layout.dir,
    home: plan.layout.home,
    userprofile: plan.layout.userprofile,
    workdir: plan.layout.workdir,
    startedAt: plan.startedAt,
    argv: plan.launch.argv,
    envNames: plan.launch.envNames,
    secretEnvNames: plan.launch.secretEnvNames,
    port: plan.launch.port,
    logFiles: {
      stdout: plan.launch.logFiles.stdout,
      stderr: plan.launch.logFiles.stderr,
      pluginLogDir: plan.launch.logFiles.pluginLogDir
    },
    profileCopy: {
      sourceProfileDir: plan.copy.sourceProfileDir,
      targetProfileDir: plan.copy.targetProfileDir,
      pluginCacheDir: plan.copy.pluginCacheDir,
      ...copyOutcome === void 0 || copyOutcome === null ? {} : { files: copyOutcome.files, bytes: copyOutcome.bytes, removedLogDirectory: copyOutcome.removedLogDirectory }
    },
    model: plan.model,
    notes: plan.notes,
    keep: plan.keep
  };
}
async function reapAfterFailure(ports, pid, message) {
  const reaped = await reapProcess({ fs: ports.fs, clock: ports.clock, process: ports.process, pid });
  return reaped.ok ? message : `${message}; cleanup warning: ${reaped.error.message}`;
}
function readinessOf(sessionStatus, inventory, started, nowMs, checkedAt) {
  return {
    stdoutLine: true,
    connectStatus: sessionStatus,
    inventory: {
      entryCount: inventory.entryCount,
      enabledCount: inventory.enabledCount,
      activeCount: inventory.activeCount,
      offenders: inventory.offenders
    },
    checkedAt,
    elapsedMs: Math.max(0, nowMs - started.startedAtMs)
  };
}
function describeOffenders(offenders) {
  return offenders.slice(0, 5).map((offender) => `${offender.entryId || "(unnamed entry)"} fiberPhase=${offender.fiberPhase ?? "null"}`).join(", ");
}
async function executeInstance(options) {
  const { ports, plan } = options;
  const note = options.note ?? (() => {
  });
  const { fs, clock } = ports;
  note(`copying profile ${plan.profileName}: ${plan.copy.sourceProfileDir} -> ${plan.copy.targetProfileDir}`);
  const copied = await copyProfile({
    fs,
    sourceHome: plan.dshHome,
    targetHome: plan.layout.home,
    profile: plan.profileName,
    ...plan.profile.pluginCacheDir === void 0 ? {} : { pluginCacheDir: plan.profile.pluginCacheDir }
  });
  if (!copied.ok) return prerequisite(copied.error, "the isolated home could not be prepared");
  for (const directory of [plan.layout.dir, plan.layout.userprofile, plan.layout.workdir]) {
    const made = await fs.makeDir(directory);
    if (!made.ok) return prerequisite(made.error, `could not create ${directory}`);
  }
  if (options.beforeStart !== void 0) {
    try {
      await options.beforeStart({ home: plan.layout.home, dir: plan.layout.dir, profile: plan.profileName });
    } catch (error) {
      return prerequisite(
        failure(
          "prerequisite",
          `beforeStart hook failed: ${error instanceof Error ? error.message : String(error)}`,
          "the hook runs after the isolated home is copied and before the host starts; fix it and rerun"
        )
      );
    }
  }
  note(`starting the instance (${plan.launch.argv[0] ?? "no executable"})`);
  const started = await startInstance({
    ports,
    plan: plan.launch,
    runtime: options.runtime,
    note,
    ...options.readyTimeoutMs === void 0 ? {} : { readyTimeoutMs: options.readyTimeoutMs }
  });
  if (!started.ok) return notReady(started.error);
  const session = await connectHost({ http: ports.http, clock, ready: started.value.ready });
  if (!session.ok) {
    const reaped = await reapAfterFailure(ports, started.value.pid, session.error.hint ?? session.error.message);
    return notReady(
      { ...session.error, hint: reaped },
      "the instance was stopped after the readiness handshake failed"
    );
  }
  const inventory = await pluginInventoryReadiness(session.value);
  if (!inventory.ok) {
    const reaped = await reapAfterFailure(ports, started.value.pid, inventory.error.hint ?? inventory.error.message);
    return notReady(
      { ...inventory.error, hint: reaped },
      "the instance was stopped after the plugin inventory could not be read"
    );
  }
  if (!inventory.value.allReady) {
    const offenders = describeOffenders(inventory.value.offenders);
    await reapAfterFailure(ports, started.value.pid, "");
    return notReady(
      failure(
        "prerequisite",
        `the instance started but its plugin inventory is not ready: ${inventory.value.offenders.length} enabled entries are not active`,
        `offenders: ${offenders}; instance stdout: ${plan.layout.stdoutLog}; instance stderr: ${plan.layout.stderrLog}`,
        {
          entryCount: inventory.value.entryCount,
          enabledCount: inventory.value.enabledCount,
          activeCount: inventory.value.activeCount,
          offenders: inventory.value.offenders,
          pid: started.value.pid
        }
      ),
      "the instance was stopped because a half-loaded instance must not survive a launch"
    );
  }
  const checkedAt = clock.iso();
  const readiness = readinessOf(
    session.value.status,
    inventory.value,
    started.value,
    clock.nowMs(),
    checkedAt
  );
  const projection = projectInstancePlan(plan, copied.value);
  note(`writing the launch records under ${plan.layout.dir}`);
  const planWritten = await fs.writeJson(plan.layout.planPath, projection);
  if (!planWritten.ok) {
    await reapAfterFailure(ports, started.value.pid, "");
    return notReady(planWritten.error, "the instance was stopped because its plan could not be written");
  }
  const record = buildInstanceRecord({
    started: { ...started.value },
    plan: plan.launch,
    runtime: options.runtime,
    model: plan.model,
    readiness,
    instanceId: plan.instanceId,
    dir: plan.layout.dir,
    keep: plan.keep,
    planPath: plan.layout.planPath
  });
  const recorded = await writeInstanceRecord(fs, record);
  if (!recorded.ok) {
    await reapAfterFailure(ports, started.value.pid, "");
    return notReady(recorded.error, "the instance was stopped because its handle could not be written");
  }
  return ok({ record, readiness, copy: copied.value, plan: projection });
}

// src/real-machine-verification/orchestration/concurrent.ts
var CONCURRENT_COMMAND = "concurrent";
var DEFAULT_CONCURRENCY = 2;
var MAX_CONCURRENCY = 32;
async function planConcurrentInstances(options) {
  const plans = [];
  for (let offset = 0; offset < options.targets.length; offset += 1) {
    const target = options.targets[offset];
    const startedAtMs = options.startedAtMs + offset;
    const planned = await planInstance({
      ports: options.ports,
      runtime: options.runtime,
      dshHome: options.dshHome,
      profileName: target.profileName,
      profile: options.profile,
      profileDir: target.profileDir,
      workRoot: options.workRoot,
      keep: options.keep ?? false,
      startedAtMs
    });
    if (!planned.ok) {
      const error = planned.error;
      return err({
        code: error.code,
        message: `instance ${offset + 1} (profile ${target.profileName}): ${error.message}`,
        ...error.hint === void 0 ? {} : { hint: error.hint },
        ...error.details === void 0 ? {} : { details: error.details },
        instanceIndex: offset + 1,
        instanceId: instanceIdFor(target.profileName, options.workRoot, startedAtMs),
        profileName: target.profileName
      });
    }
    plans.push(planned.value);
  }
  return ok(plans);
}
function describeThrown2(error) {
  return error instanceof Error ? error.message : String(error);
}
async function executeConcurrent(options) {
  const note = options.note ?? (() => {
  });
  const tasks = options.plans.map(async (plan, offset) => {
    const index = offset + 1;
    note(`instance ${index}/${options.plans.length}: launching ${plan.instanceId} (profile ${plan.profileName})`);
    const result = await executeInstance({
      ports: options.ports,
      plan,
      runtime: options.runtime,
      note,
      ...options.readyTimeoutMs === void 0 ? {} : { readyTimeoutMs: options.readyTimeoutMs }
    });
    note(`instance ${index}/${options.plans.length}: ${result.ok ? "ready" : "failed"}`);
    return { index, plan, result };
  });
  const settled = await Promise.allSettled(tasks);
  return settled.map((entry, offset) => {
    const plan = options.plans[offset];
    const index = offset + 1;
    if (entry.status === "fulfilled") return entry.value;
    return {
      index,
      plan,
      result: err({
        code: "internal",
        message: `executeInstance threw: ${describeThrown2(entry.reason)}`,
        stage: "not-ready"
      })
    };
  });
}
async function instanceRecordFor(fs, fallback, directory) {
  const loaded = await loadInstance(fs, directory);
  if (loaded.ok && loaded.value.pid === fallback.pid) return loaded.value;
  return fallback;
}
async function cleanupConcurrent(options) {
  const note = options.note ?? (() => {
  });
  const rows = [];
  const residualPids = [];
  for (const item of options.executed) {
    if (!item.result.ok) continue;
    const record = await instanceRecordFor(options.ports.fs, item.result.value.record, item.plan.layout.dir);
    note(`instance ${item.index}/${options.executed.length}: stopping pid ${record.pid}`);
    const stopped = await stopRecord(options.ports, record);
    const aliveAfter = options.ports.process.isAlive(record.pid);
    const cleanup = stopped.ok ? {
      verified: !aliveAfter,
      stopped: true,
      alreadyGone: stopped.value.alreadyGone,
      aliveAfter,
      error: null
    } : {
      verified: false,
      stopped: false,
      alreadyGone: false,
      aliveAfter,
      error: stopped.error.message
    };
    rows.push({ index: item.index, instanceId: item.plan.instanceId, pid: record.pid, cleanup });
    if (!cleanup.verified) residualPids.push(record.pid);
  }
  return { rows, residualPids };
}
function buildConcurrentRows(options) {
  return options.plans.map((plan, offset) => {
    const index = offset + 1;
    const execution = options.executed.find((entry) => entry.index === index);
    const cleaned = options.cleanup.rows.find((entry) => entry.index === index);
    const base = {
      index,
      instanceId: plan.instanceId,
      profile: plan.profileName,
      dir: plan.layout.dir,
      home: plan.layout.home,
      workdir: plan.layout.workdir,
      pluginLogDir: plan.launch.logFiles.pluginLogDir
    };
    if (execution !== void 0 && execution.result.ok) {
      const record = execution.result.value.record;
      return {
        ...base,
        pid: record.pid,
        port: record.port,
        tokenPresent: record.tokenUrl.length > 0,
        readiness: "ready",
        failure: null,
        cleanup: cleaned === void 0 ? null : cleaned.cleanup
      };
    }
    const failureReason = execution === void 0 || execution.result.ok ? failure("internal", `instance ${index} was not executed`) : execution.result.error;
    return {
      ...base,
      pid: null,
      port: null,
      tokenPresent: false,
      readiness: execution === void 0 ? "not-started" : "failed",
      failure: failureReason,
      cleanup: null
    };
  });
}
function concurrentFailure(stage, error) {
  return {
    stage,
    message: error.message,
    hint: error.hint ?? null,
    ...error.details === void 0 ? {} : { details: error.details }
  };
}
function planConcurrentChecks() {
  return {
    command: CONCURRENT_COMMAND,
    checks: [createInstancesDistinctCheck(), createTeardownCleanCheck()]
  };
}
function describeConcurrentRow(row2) {
  const port = row2.port === null ? "(none)" : String(row2.port);
  const token = row2.tokenPresent ? "present" : "missing";
  const pluginLog = row2.pluginLogDir === null ? "(not declared)" : row2.pluginLogDir;
  const base = `#${row2.index} ${row2.instanceId} profile ${row2.profile} port ${port} token ${token} home ${row2.home} start-cwd ${row2.workdir} plugin-log ${pluginLog}`;
  return row2.failure === null ? base : `${base} \u2014 not ready: ${row2.failure.message}`;
}
function concurrentProfilesLabel(profiles) {
  return [...new Set(profiles)].join(",");
}

// src/real-machine-verification/orchestration/report.ts
var STATUS_WORD = {
  pass: "ok",
  fail: "fail",
  skip: "skip",
  blocked: "blocked"
};
function renderCheckLines(check) {
  const lines = [`${STATUS_WORD[check.status]} ${check.id} ${check.detail}`];
  if (check.status === "fail" || check.status === "blocked") {
    if (check.expected !== void 0) lines.push(`  expected: ${check.expected}`);
    if (check.actual !== void 0) lines.push(`  actual:   ${check.actual}`);
    if (check.hint !== void 0) lines.push(`  hint:     ${check.hint}`);
  }
  return lines;
}
function renderSelfCheckHuman(report, tail4) {
  const lines = [];
  for (const check of report.checks) lines.push(...renderCheckLines(check));
  if (tail4 !== void 0) {
    lines.push(`report: ${tail4.reportPath}`);
    lines.push(`report-sha256: ${tail4.reportSha256}`);
    lines.push(`evidence: ${tail4.evidenceDir} (${tail4.evidenceCount} item(s))`);
  }
  return lines.join("\n");
}
async function writeRunReport(options) {
  const { fs, runDir, report } = options;
  const reportPath = joinFsPath(runDir, "run.json");
  const content = `${runReportJson(report)}
`;
  const made = await fs.makeDir(runDir);
  if (!made.ok) return made;
  const written = await fs.writeText(reportPath, content);
  if (!written.ok) return written;
  const reportSha256 = sha256Text(content);
  const checksum = await fs.writeText(joinFsPath(runDir, "run.json.sha256"), `${reportSha256}  run.json
`);
  if (!checksum.ok) return checksum;
  return ok({
    reportPath,
    reportSha256,
    evidenceDir: joinFsPath(runDir, "evidence"),
    content
  });
}
function withReportDigest(report, written) {
  return {
    ...report,
    artifacts: {
      ...report.artifacts ?? {},
      report: written.reportPath,
      reportSha256: written.reportSha256
    }
  };
}

// src/real-machine-verification/orchestration/run-directory.ts
function toRunIdSegment(value) {
  const cleaned = value.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.length === 0 ? "run" : cleaned;
}
async function planRunDirectory(options) {
  const { fs, workRoot, command, startedAt } = options;
  const runsRoot = joinFsPath(workRoot, "runs");
  const baseId = `${toRunIdSegment(command)}-${toRunIdSegment(startedAt)}`;
  for (let ordinal = 1; ordinal <= 999; ordinal += 1) {
    const runId = ordinal === 1 ? baseId : `${baseId}-${ordinal}`;
    const runDir = joinFsPath(runsRoot, runId);
    if (await fs.exists(runDir)) continue;
    return ok({ runId, runDir, evidenceDir: joinFsPath(runDir, "evidence") });
  }
  return err(
    failure("conflict", `could not find a free run directory under ${runsRoot}`, "clean the work root or pass --work-root")
  );
}
async function prepareRunDirectory(options) {
  const { fs, workRoot } = options;
  const planned = await planRunDirectory(options);
  if (!planned.ok) return planned;
  const runsRoot = joinFsPath(workRoot, "runs");
  const madeRoot = await fs.makeDir(runsRoot);
  if (!madeRoot.ok) return madeRoot;
  const made = await fs.makeDir(planned.value.runDir);
  if (!made.ok) return made;
  return ok(planned.value);
}

// src/real-machine-verification/orchestration/runner.ts
function capabilityAvailable(ports, capability) {
  switch (capability) {
    case "browser":
      return ports.browser !== null && ports.browser !== void 0;
    case "screen":
      return ports.screen !== null && ports.screen !== void 0;
    case "command":
      return ports.command !== null && ports.command !== void 0;
    case "process":
      return ports.process !== null && ports.process !== void 0;
    case "http":
      return ports.http !== null && ports.http !== void 0;
    case "read-file-slice":
      return false;
  }
}
function describeThrown3(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function missingCapabilities(check, ports, overrides) {
  return check.requires.filter((capability) => {
    const override = overrides?.[capability];
    return override === void 0 ? !capabilityAvailable(ports, capability) : !override;
  });
}
async function executePlan(plan, context, options) {
  const results = [];
  for (const check of plan.checks) {
    const missing = missingCapabilities(check, options.ports, options.capabilities);
    if (missing.length > 0) {
      const names = missing.join(", ");
      const detail = `required capability unavailable: ${names}`;
      const hint = check.missingHint ?? `provide a ${names} adapter (see the capability description) so this check can observe the machine`;
      const status = check.onMissing === "blocked" ? "blocked" : "skip";
      const outcome2 = status === "blocked" ? {
        status: "blocked",
        detail,
        hint,
        blockedReason: { code: "adapter-missing", message: detail, hint }
      } : { status: "skip", detail, hint };
      results.push(toCheckResult(check, outcome2, 0));
      options.note?.(`${check.id}: ${status} (${names} unavailable)`);
      continue;
    }
    const startedAt = options.clock.nowMs();
    let outcome;
    try {
      outcome = await check.run(context);
    } catch (error) {
      const message = describeThrown3(error);
      outcome = failed(
        `the check threw: ${message}`,
        "the check completes and returns an observation",
        message,
        "this is a defect in the check; keep the report and open a ticket against the capability"
      );
    }
    const durationMs = Math.max(0, options.clock.nowMs() - startedAt);
    const result = toCheckResult(check, normalizeOutcome(outcome), durationMs);
    results.push(result);
    const marker = result.status === "pass" ? "ok" : result.status;
    options.note?.(`${result.id}: ${marker}`);
  }
  return { results, steps: [] };
}

// src/real-machine-verification/runtime/dsh/asar.ts
var ASAR_CLI_ENTRY = "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js";
var PREFIX_BYTES = 16;
var MAX_HEADER_BYTES = 64 * 1024 * 1024;
function parseAsarHeaderBounds(prefix) {
  if (prefix.byteLength < PREFIX_BYTES) {
    return err(
      failure("unsupported", `asar header prefix is ${prefix.byteLength} bytes, expected at least ${PREFIX_BYTES}`)
    );
  }
  const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
  const pickleSize = view.getUint32(0, true);
  const headerBytes = view.getUint32(4, true);
  const payloadSize = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  if (pickleSize !== 4 || payloadSize === 0) {
    return err(
      failure(
        "unsupported",
        `not an Electron asar archive: header pickle sizes are ${pickleSize}/${payloadSize}`,
        "point --dsh-exe at the desktop install whose resources/app.asar this path should be"
      )
    );
  }
  if (jsonLength === 0 || jsonLength > MAX_HEADER_BYTES) {
    return err(
      failure("unsupported", `asar header JSON length ${jsonLength} is not plausible for a DSH install`)
    );
  }
  if (headerBytes < jsonLength + 8) {
    return err(
      failure("unsupported", `asar header region ${headerBytes} cannot contain a ${jsonLength}-byte JSON header`)
    );
  }
  return ok({ jsonLength, headerBytes, dataOffset: 8 + headerBytes });
}
function findAsarEntry(header, entryPosixPath) {
  const segments = entryPosixPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return err(failure("invalid-input", "an asar entry path must name at least one segment"));
  }
  let node = header;
  for (const segment of segments) {
    const files = node !== null && typeof node === "object" ? node.files : void 0;
    if (files === void 0 || files === null || typeof files !== "object") {
      return err(
        failure(
          "not-found",
          `asar archive has no ${JSON.stringify(entryPosixPath)} (no file table at ${JSON.stringify(segment)})`
        )
      );
    }
    node = files[segment];
    if (node === void 0) {
      return err(
        failure(
          "not-found",
          `asar archive does not contain ${JSON.stringify(entryPosixPath)} (missing ${JSON.stringify(segment)})`
        )
      );
    }
  }
  if (node === null || typeof node !== "object") {
    return err(failure("not-found", `asar entry ${entryPosixPath} is not a file record`));
  }
  const record = node;
  if (typeof record.size !== "number" || record.size < 0) {
    return err(failure("not-found", `asar entry ${entryPosixPath} has no usable size`));
  }
  const rawOffset = record.offset;
  const offset = typeof rawOffset === "number" ? rawOffset : typeof rawOffset === "string" && rawOffset.length > 0 && /^\d+$/.test(rawOffset) ? Number(rawOffset) : null;
  const integrity = record.integrity;
  const integritySha256 = integrity !== null && typeof integrity === "object" && typeof integrity.hash === "string" ? integrity.hash : null;
  return ok({ path: entryPosixPath, size: record.size, offset, integritySha256 });
}
async function readAsarEntry(readSlice, asarPath, entryPosixPath = ASAR_CLI_ENTRY) {
  const prefix = await readSlice(asarPath, 0, PREFIX_BYTES);
  if (!prefix.ok) return prefix;
  const bounds = parseAsarHeaderBounds(prefix.value);
  if (!bounds.ok) return bounds;
  const json = await readSlice(asarPath, PREFIX_BYTES, bounds.value.jsonLength);
  if (!json.ok) return json;
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(json.value));
  } catch (error) {
    return err(
      failure(
        "unsupported",
        `asar header is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }
  return findAsarEntry(header, entryPosixPath);
}

// src/real-machine-verification/runtime/dsh/discover.ts
var ASAR_CLI_RELATIVE = `resources/app.asar/${ASAR_CLI_ENTRY}`;
var EXE_NAME = "DeepSeek Harness.exe";
var APP_NAME = "DeepSeek Harness";
var ASAR_NAME = "app.asar";
var APP_DIR_NAME = "app";
function hostCliPath(discovered) {
  if (discovered.asarPath === null) return discovered.cliJs;
  const archive = toPosixPath(discovered.asarPath);
  return archive.endsWith("/") ? archive + discovered.cliJs : archive + "/" + discovered.cliJs;
}
function failureWithStage(message, stage, hint, details) {
  return err(failure("prerequisite", message, hint, { stage, ...details }));
}
function exeNamesFor(platform) {
  if (platform === "win32" || platform === "darwin") return [EXE_NAME];
  return ["deepseek-harness", APP_NAME];
}
function splitAsarPath(value) {
  const posix = toPosixPath(value);
  const index = posix.toLowerCase().indexOf(`.${ASAR_NAME}/`.toLowerCase());
  if (index < 0) return null;
  const asarEnd = index + ASAR_NAME.length + 1;
  const asarPath = posix.slice(0, asarEnd);
  const entry = posix.slice(asarEnd + 1);
  if (entry.length === 0) return null;
  return { asarPath, entry };
}
function asarCandidatesFor(exe) {
  const directory = parentPath(exe);
  if (directory === null) return [];
  return [
    joinFsPath(directory, "resources", ASAR_NAME),
    joinFsPath(directory, ASAR_NAME)
  ];
}
function unpackedCliCandidatesFor(exe) {
  const directory = parentPath(exe);
  if (directory === null) return [];
  return [
    joinFsPath(directory, "resources", ASAR_CLI_ENTRY),
    joinFsPath(directory, APP_DIR_NAME, ASAR_CLI_ENTRY)
  ];
}
function exeCandidatesFor(root, platform) {
  return exeNamesFor(platform).map((name) => joinFsPath(root, name));
}
async function firstExisting(fs, candidates) {
  for (const candidate of candidates) {
    if (await fs.exists(candidate)) return candidate;
  }
  return null;
}
async function isRegularFile(fs, path) {
  const stats = await fs.stat(path);
  return stats.ok && stats.value.kind === "file";
}
async function resolveInstall(fs, platform, known, tried) {
  let exe = null;
  let asarPath = null;
  let cliJs = null;
  let installRoot = null;
  if (known.exePath !== void 0) {
    tried.push(`exe: ${known.exePath}`);
    if (!await fs.exists(known.exePath)) {
      return failureWithStage(
        `the DSH executable is missing: ${known.exePath}`,
        "exe-missing",
        "check the path, or pass --dsh-exe with an existing file",
        { tried }
      );
    }
    exe = known.exePath;
  }
  if (known.cliJsPath !== void 0) {
    tried.push(`cli: ${known.cliJsPath}`);
    const split = splitAsarPath(known.cliJsPath);
    if (split !== null) {
      asarPath = split.asarPath;
      cliJs = split.entry;
      if (!await fs.exists(asarPath)) {
        return failureWithStage(
          `the CLI entry names an asar archive that is missing: ${asarPath}`,
          "structure-missing",
          "pass the archive path that exists, or reinstall DSH",
          { tried }
        );
      }
    } else if (await fs.exists(known.cliJsPath)) {
      cliJs = known.cliJsPath;
    } else {
      return failureWithStage(
        `the DSH CLI entry is missing: ${known.cliJsPath}`,
        "structure-missing",
        "pass --dsh-cli-js with an existing file, or a path inside resources/app.asar",
        { tried }
      );
    }
  }
  if (exe !== null && asarPath === null && cliJs === null) {
    const archives = asarCandidatesFor(exe);
    tried.push(...archives.map((candidate) => `derived asar: ${candidate}`));
    const foundArchive = await firstExisting(fs, archives);
    if (foundArchive !== null) {
      asarPath = foundArchive;
      cliJs = ASAR_CLI_ENTRY;
    } else {
      const unpacked = unpackedCliCandidatesFor(exe);
      tried.push(...unpacked.map((candidate) => `derived cli: ${candidate}`));
      const foundCli = await firstExisting(fs, unpacked);
      if (foundCli === null) {
        return failureWithStage(
          `the DSH executable exists but its install has no app.asar: ${exe}`,
          "structure-missing",
          "reinstall DSH, or pass --dsh-cli-js with the cli.js inside resources/app.asar",
          { tried, exe }
        );
      }
      cliJs = foundCli;
    }
  }
  if (exe === null && asarPath !== null) {
    const posix = toPosixPath(asarPath);
    const suffix = `/resources/${ASAR_NAME}`;
    const fromArchive = posix.toLowerCase().endsWith(suffix.toLowerCase()) ? posix.slice(0, posix.length - suffix.length) : parentPath(asarPath) ?? null;
    if (fromArchive !== null) {
      installRoot = fromArchive;
      const candidates = exeCandidatesFor(fromArchive, platform);
      tried.push(...candidates.map((candidate) => `derived exe: ${candidate}`));
      exe = await firstExisting(fs, candidates);
    }
  }
  if (exe === null) {
    return failureWithStage(
      "could not find the DSH executable",
      "exe-missing",
      "pass --dsh-exe, set DSH_EXE, or put the install's dsh wrapper on PATH",
      { tried }
    );
  }
  if (cliJs === null) {
    return failureWithStage(
      "found the DSH executable but not its CLI entry",
      "structure-missing",
      "the install looks incomplete: resources/app.asar is missing next to the executable; reinstall DSH",
      { tried, exe }
    );
  }
  if (installRoot === null) {
    const directory = parentPath(exe);
    if (directory !== null) {
      installRoot = directory.toLowerCase().endsWith(`/${"resources"}`) ? parentPath(directory) ?? directory : directory;
    }
  }
  return ok({ exe, asarPath, cliJs, installRoot });
}
function conventionalInstallDirs(env, platform) {
  const candidates = [];
  if (platform === "win32") {
    const localAppData = env.get("LOCALAPPDATA");
    if (localAppData !== void 0) candidates.push(joinFsPath(localAppData, "Programs", APP_NAME));
    const programFiles = env.get("PROGRAMFILES");
    if (programFiles !== void 0) candidates.push(joinFsPath(programFiles, APP_NAME));
    const programFilesX86 = env.get("PROGRAMFILES(X86)");
    if (programFilesX86 !== void 0) candidates.push(joinFsPath(programFilesX86, APP_NAME));
    return candidates;
  }
  if (platform === "darwin") {
    candidates.push(`/Applications/${APP_NAME}.app/Contents`);
    const home = env.homeDir();
    candidates.push(joinFsPath(home, "Applications", `${APP_NAME}.app`, "Contents"));
    return candidates;
  }
  candidates.push(`/opt/${APP_NAME}`, `/usr/lib/${APP_NAME}`, "/usr/local/lib/deepseek-harness");
  return candidates;
}
function pathDirectories(env, platform) {
  const raw = env.get("PATH") ?? env.get("Path") ?? env.get("path") ?? "";
  const separator = platform === "win32" ? ";" : ":";
  return raw.split(separator).map((entry) => entry.trim().replace(/^"(.*)"$/, "$1")).filter((entry) => entry.length > 0);
}
async function findPathWrapper(fs, env, platform) {
  const names = platform === "win32" ? ["dsh.cmd", "dsh.exe", "dsh.bat", "dsh"] : ["dsh"];
  for (const directory of pathDirectories(env, platform)) {
    for (const name of names) {
      const candidate = joinFsPath(directory, name);
      if (await fs.exists(candidate)) return candidate;
    }
  }
  return null;
}
async function installRootsFromWrapper(fs, platform, wrapper) {
  const resolved = await fs.realPath(wrapper);
  const base = resolved.ok ? resolved.value : wrapper;
  const roots = [];
  let directory = parentPath(base);
  for (let depth = 0; depth < 8 && directory !== null; depth += 1) {
    const archive = joinFsPath(directory, "resources", ASAR_NAME);
    const exe = await firstExisting(fs, exeCandidatesFor(directory, platform));
    if (await isRegularFile(fs, archive) || exe !== null) roots.push(directory);
    directory = parentPath(directory);
  }
  return roots;
}
async function discoverDsh(options) {
  const { fs, env } = options;
  const platform = env.platform();
  const tried = [];
  let structureFailure = null;
  if (options.exePath !== void 0 || options.cliJsPath !== void 0) {
    const resolved = await resolveInstall(
      fs,
      platform,
      { exePath: options.exePath, cliJsPath: options.cliJsPath },
      tried
    );
    if (!resolved.ok) return resolved;
    return ok({ ...resolved.value, source: "argument", tried });
  }
  const envExe = env.get("DSH_EXE");
  const envCli = env.get("DSH_CLI_JS");
  if (envExe !== void 0 || envCli !== void 0) {
    const envTried = [];
    const resolved = await resolveInstall(fs, platform, { exePath: envExe, cliJsPath: envCli }, envTried);
    tried.push(...envTried.map((line) => `env ${line}`));
    if (resolved.ok) return ok({ ...resolved.value, source: "environment", tried });
    if (resolved.error.details?.["stage"] === "structure-missing") structureFailure = resolved;
  }
  const wrapper = await findPathWrapper(fs, env, platform);
  if (wrapper !== null) {
    tried.push(`path wrapper: ${wrapper}`);
    const roots = await installRootsFromWrapper(fs, platform, wrapper);
    tried.push(...roots.map((root) => `wrapper install root: ${root}`));
    for (const root of roots) {
      const exe = await firstExisting(fs, exeCandidatesFor(root, platform));
      if (exe === null) continue;
      const resolved = await resolveInstall(fs, platform, { exePath: exe }, tried);
      if (resolved.ok) {
        return ok({ ...resolved.value, installRoot: root, source: "path-wrapper", tried });
      }
      if (resolved.error.details?.["stage"] === "structure-missing") structureFailure = resolved;
    }
  }
  const installDirs = [...options.extraInstallDirs ?? [], ...conventionalInstallDirs(env, platform)];
  for (const directory of installDirs) {
    const candidates = exeCandidatesFor(directory, platform);
    tried.push(...candidates.map((candidate) => `conventional exe: ${candidate}`));
    const exe = await firstExisting(fs, candidates);
    if (exe === null) continue;
    const resolved = await resolveInstall(fs, platform, { exePath: exe }, tried);
    if (resolved.ok) return ok({ ...resolved.value, source: "conventional", tried });
    if (resolved.error.details?.["stage"] === "structure-missing") structureFailure = resolved;
  }
  if (structureFailure !== null) return structureFailure;
  return failureWithStage(
    "could not find the DSH executable",
    "exe-missing",
    "install the DeepSeek Harness desktop app, pass --dsh-exe / set DSH_EXE, or put the install's dsh wrapper on PATH",
    { tried, platform }
  );
}

// src/real-machine-verification/cli/commands/concurrent.ts
var CONCURRENT_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--profile",
  "--declaration",
  "--work-root",
  "--count",
  "--profiles",
  "--keep",
  "--dry-run"
]);
var CONCURRENT_USAGE = "usage: dsh-verify concurrent [--count N] [--profiles a,b,c] [--profile name] [--declaration path] [--work-root dir] [--keep] [--dry-run] [--json]";
function parseCount2(raw) {
  if (raw === void 0) return { count: DEFAULT_CONCURRENCY };
  if (!/^[0-9]+$/.test(raw)) {
    return { problem: `--count needs an integer between 1 and ${MAX_CONCURRENCY}, got "${raw}"` };
  }
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_CONCURRENCY) {
    return { problem: `--count needs an integer between 1 and ${MAX_CONCURRENCY}, got "${raw}"` };
  }
  return { count };
}
function parseProfiles(raw, count, baseProfile) {
  if (raw === void 0) {
    return { names: Array.from({ length: count }, () => baseProfile) };
  }
  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.length !== count) {
    return {
      problem: `--profiles needs exactly ${count} comma separated name(s) to match --count ${count}, got ${entries.length}: "${raw}"`
    };
  }
  const names = [];
  for (const entry of entries) {
    if (entry.length === 0) return { problem: `--profiles has an empty entry: "${raw}"` };
    const parsed = parseProfileName(entry);
    if (!parsed.ok) {
      return {
        problem: `--profiles entry "${entry}" is not a valid profile name: ${formatFailure(parsed.error)}`
      };
    }
    names.push(parsed.value);
  }
  return { names };
}
function failureJson2(stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: CONCURRENT_COMMAND,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject(args, deps, stage, message) {
  deps.io.stderr(`dsh-verify ${CONCURRENT_COMMAND}: ${message}
`);
  if (args.json) deps.io.stdout(failureJson2(stage, { code: "invalid-input", message }));
  return EXIT_CODES.blocked;
}
function renderConcurrentHuman(report, rows, tail4) {
  const lines = [];
  for (const check of report.checks) lines.push(...renderCheckLines(check));
  lines.push(`instances (${rows.length}):`);
  for (const row2 of rows) lines.push(`  ${describeConcurrentRow(row2)}`);
  lines.push(`report: ${tail4.reportPath}`);
  lines.push(`report-sha256: ${tail4.reportSha256}`);
  lines.push(`evidence: ${tail4.evidenceDir} (${tail4.evidenceCount} item(s))`);
  return lines.join("\n");
}
function renderDryRunHuman(names, projections) {
  const lines = [
    "concurrent plan (dry run) \u2014 nothing was written and no process was started",
    `instances: ${projections.length}`,
    `profiles: ${names.join(", ")}`
  ];
  projections.forEach((projection, offset) => {
    lines.push(`instance ${offset + 1}: id ${projection.instanceId} profile ${projection.profile}`);
    lines.push(`  dir: ${projection.dir}`);
    lines.push(`  home: ${projection.home}`);
    lines.push(`  start-cwd: ${projection.workdir}`);
    lines.push(
      `  port: ${projection.port === 0 ? "0 (ephemeral, assigned by the host)" : String(projection.port)}`
    );
    lines.push(`  plugin-log: ${projection.logFiles.pluginLogDir ?? "(not declared)"}`);
    lines.push(`  argv: ${projection.argv.join(" ")}`);
  });
  return lines.join("\n");
}
async function finishAndEmit(options) {
  const { args, deps, report, rows } = options;
  const { fs } = deps.ports;
  const written = await writeRunReport({ fs, runDir: options.runDir, report });
  if (!written.ok) {
    deps.io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: could not write the run report: ${formatFailure(written.error)}
`
    );
    return EXIT_CODES.blocked;
  }
  const finalReport = withReportDigest(report, written.value);
  const tail4 = {
    reportPath: written.value.reportPath,
    reportSha256: written.value.reportSha256,
    evidenceDir: options.evidence.root,
    evidenceCount: options.evidence.items().length
  };
  const human = renderConcurrentHuman(finalReport, rows, tail4);
  if (args.json) {
    deps.io.stdout(`${runReportJson(finalReport)}
`);
    deps.io.stderr(`${human}
`);
    deps.io.stderr(`${verdictLine(finalReport)}
`);
  } else {
    deps.io.stdout(`${human}
`);
  }
  const code = exitCodeOfRun(finalReport);
  options.note?.(`exit ${code}`);
  return code;
}
async function emitBlocked(options) {
  const { args, deps, error } = options;
  const { ports, io } = deps;
  const { clock, fs } = ports;
  io.stderr(`dsh-verify ${CONCURRENT_COMMAND}: ${formatFailure(error)}
`);
  if (args.dryRun) {
    if (args.json) io.stdout(failureJson2(options.stage, error));
    return EXIT_CODES.blocked;
  }
  const prepared = await prepareRunDirectory({
    fs,
    workRoot: options.workRoot,
    command: CONCURRENT_COMMAND,
    startedAt: options.startedAt
  });
  if (!prepared.ok) {
    io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: could not create the run directory under ${options.workRoot}: ${formatFailure(prepared.error)}
`
    );
    return EXIT_CODES.blocked;
  }
  const evidence = createEvidenceStore({ fs, root: prepared.value.evidenceDir, clock });
  const recorded = await evidence.recordJson(
    "concurrent-blocked",
    {
      stage: options.stage,
      code: error.code,
      message: error.message,
      hint: error.hint ?? null,
      details: error.details ?? null,
      workRoot: options.workRoot,
      dshHome: options.dshHome
    },
    { note: "why the concurrent run could not plan its instances" }
  );
  if (!recorded.ok) {
    io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: could not record the blocked evidence: ${formatFailure(recorded.error)}
`
    );
  }
  const context = {
    count: options.count,
    rows: [],
    failure: concurrentFailure(options.stage, error),
    workRoot: options.workRoot,
    dshHome: options.dshHome ?? "",
    ports,
    evidenceRefs: evidenceRefs(evidence.items())
  };
  const outcome = await executePlan(planConcurrentChecks(), context, { ports, clock });
  const report = finishRunReport(
    createRunReport({
      command: CONCURRENT_COMMAND,
      profile: options.profiles.length === 0 ? args.profile ?? "(declaration not loaded)" : concurrentProfilesLabel(options.profiles),
      startedAt: options.startedAt,
      notes: [`work root: ${options.workRoot}`]
    }),
    {
      checks: outcome.results,
      steps: [],
      finishedAt: clock.iso(),
      artifacts: { report: joinFsPath(prepared.value.runDir, "run.json"), evidence: prepared.value.evidenceDir }
    }
  );
  return finishAndEmit({
    args,
    deps,
    report,
    rows: [],
    runDir: prepared.value.runDir,
    evidence
  });
}
function buildSteps(input) {
  return [
    {
      id: "plan",
      title: `plan ${input.plannedIds.length} isolated instance(s)`,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: "done",
      detail: `instance ids: ${input.plannedIds.join(", ")}`
    },
    {
      id: "launch",
      title: `launch ${input.plannedIds.length} instance(s) concurrently`,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: input.failedCount === 0 ? "done" : "failed",
      detail: `${input.readyCount} ready, ${input.failedCount} failed`
    },
    {
      id: "cleanup",
      title: "stop every launched instance and verify its pid is gone",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: input.cleanup.residualPids.length === 0 ? "done" : "failed",
      detail: `stopped ${input.cleanup.stopped} instance(s), ${input.cleanup.residualPids.length} residual process(es)`
    }
  ];
}
async function runConcurrentCommand(args, deps) {
  const { ports, io } = deps;
  const { clock, fs } = ports;
  const problems = flagProblems(args, CONCURRENT_FLAGS);
  if (problems.length > 0) {
    return reject(args, deps, "usage", `${problems.join("; ")}
${CONCURRENT_USAGE}`);
  }
  const parsedCount = parseCount2(args.count);
  if ("problem" in parsedCount) return reject(args, deps, "usage", parsedCount.problem);
  const count = parsedCount.count;
  const cwd = ports.env.cwd();
  const startedAt = clock.iso();
  const workRoot = resolveWorkRoot(cwd, args.workRoot);
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    workRoot,
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    return emitBlocked({
      args,
      deps,
      stage: loaded.error.stage,
      error: loaded.error.failure,
      workRoot,
      startedAt,
      count,
      profiles: [],
      dshHome: null
    });
  }
  const context = loaded.value;
  const dshHome = context.dshHome;
  const parsedProfiles = parseProfiles(args.profiles, count, context.profileName);
  if ("problem" in parsedProfiles) return reject(args, deps, "profiles", parsedProfiles.problem);
  const names = parsedProfiles.names;
  const discovered = await discoverDsh({ fs, env: ports.env });
  if (!discovered.ok) {
    return emitBlocked({
      args,
      deps,
      stage: "runtime",
      error: discovered.error,
      workRoot,
      startedAt,
      count,
      profiles: names,
      dshHome
    });
  }
  const runtime = { exe: discovered.value.exe, cliJs: hostCliPath(discovered.value) };
  const targets = names.map((profileName) => ({
    profileName,
    profileDir: profileDirectory(dshHome, profileName)
  }));
  const planned = await planConcurrentInstances({
    ports,
    runtime,
    dshHome,
    profile: context.profile,
    workRoot,
    targets,
    startedAtMs: clock.nowMs(),
    keep: args.keep
  });
  if (!planned.ok) {
    return emitBlocked({
      args,
      deps,
      stage: "plan",
      error: planned.error,
      workRoot,
      startedAt,
      count,
      profiles: names,
      dshHome
    });
  }
  const plans = planned.value;
  if (args.dryRun) {
    const projections = plans.map((plan) => projectInstancePlan(plan));
    if (args.json) {
      io.stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          command: CONCURRENT_COMMAND,
          ok: true,
          dryRun: true,
          count: plans.length,
          instances: projections
        })}
`
      );
    } else {
      io.stdout(`${renderDryRunHuman(names, projections)}
`);
    }
    return EXIT_CODES.ok;
  }
  const prepared = await prepareRunDirectory({ fs, workRoot, command: CONCURRENT_COMMAND, startedAt });
  if (!prepared.ok) {
    io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: could not create the run directory under ${workRoot}: ${formatFailure(prepared.error)}
`
    );
    return EXIT_CODES.blocked;
  }
  const { runDir, evidenceDir } = prepared.value;
  const evidence = createEvidenceStore({ fs, root: evidenceDir, clock });
  const note = (message) => {
    io.stderr(`dsh-verify ${CONCURRENT_COMMAND}: ${message}
`);
  };
  const environment = await evidence.recordJson(
    "environment",
    {
      platform: ports.env.platform(),
      nodeVersion: deps.runtime.nodeVersion,
      cwd,
      workRoot,
      dshHome,
      count,
      profiles: names,
      declaration: {
        path: context.declaration.path,
        kind: context.declaration.kind,
        exportName: context.declaration.exportName,
        requiredNode: context.declaration.requiredNode
      }
    },
    { note: "the environment this concurrent run observed" }
  );
  if (!environment.ok) {
    io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: could not record the environment evidence: ${formatFailure(environment.error)}
`
    );
  }
  note(`launching ${count} instance(s) for profile(s) ${concurrentProfilesLabel(names)} under ${workRoot}`);
  const executed = await executeConcurrent({ ports, runtime, plans, note });
  note("cleaning up every launched instance");
  const cleanup = await cleanupConcurrent({ ports, executed, note });
  if (cleanup.residualPids.length > 0) {
    io.stderr(
      `dsh-verify ${CONCURRENT_COMMAND}: warning: ${cleanup.residualPids.length} instance process(es) survived the stop request: ${cleanup.residualPids.join(", ")}
`
    );
  }
  const rows = buildConcurrentRows({ plans, executed, cleanup });
  const recorded = await evidence.recordJson(
    "instances",
    {
      count,
      profiles: names,
      rows: rows.map((row2) => ({
        index: row2.index,
        instanceId: row2.instanceId,
        profile: row2.profile,
        dir: row2.dir,
        home: row2.home,
        workdir: row2.workdir,
        pluginLogDir: row2.pluginLogDir,
        pid: row2.pid,
        port: row2.port,
        tokenPresent: row2.tokenPresent,
        readiness: row2.readiness,
        failure: row2.failure === null ? null : { code: row2.failure.code, message: row2.failure.message, hint: row2.failure.hint ?? null },
        cleanup: row2.cleanup
      })),
      residualPids: cleanup.residualPids
    },
    { note: "the per-instance four-field comparison this report is based on" }
  );
  const artifactPath = recorded.ok ? joinFsPath(evidenceDir, recorded.value.path) : void 0;
  const checkContext = {
    count,
    rows,
    failure: null,
    workRoot,
    dshHome,
    ports,
    evidenceRefs: evidenceRefs(evidence.items())
  };
  const processed = await executePlan(planConcurrentChecks(), checkContext, { ports, clock, note });
  const readyCount = rows.filter((row2) => row2.readiness === "ready").length;
  const failedCount = rows.filter((row2) => row2.readiness === "failed").length;
  const finishedAt = clock.iso();
  const steps = buildSteps({
    startedAt,
    finishedAt,
    plannedIds: plans.map((plan) => plan.instanceId),
    readyCount,
    failedCount,
    cleanup: { stopped: cleanup.rows.length, residualPids: cleanup.residualPids }
  });
  const report = finishRunReport(
    createRunReport({
      command: CONCURRENT_COMMAND,
      profile: concurrentProfilesLabel(names),
      startedAt,
      notes: [`work root: ${workRoot}`, `instances: ${count} (${concurrentProfilesLabel(names)})`]
    }),
    {
      checks: processed.results,
      steps,
      finishedAt,
      artifacts: {
        report: joinFsPath(runDir, "run.json"),
        evidence: evidenceDir,
        ...artifactPath === void 0 ? {} : { instances: artifactPath }
      },
      notes: [
        `dsh home: ${dshHome}`,
        `ready: ${readyCount}/${count}; failed: ${failedCount}`,
        actualRowNotes(rows)
      ].flat().filter((line) => line.length > 0)
    }
  );
  return finishAndEmit({ args, deps, report, rows, runDir, evidence, note });
}
function actualRowNotes(rows) {
  return rows.map((row2) => describeConcurrentRow(row2));
}

// src/real-machine-verification/evidence/paths.ts
var EVIDENCE_DIRNAME = "evidence";
var EVIDENCE_FILES_DIRNAME = "files";
var SHA256SUMS_FILENAME = "SHA256SUMS.txt";
var ARCHIVE_NOTES_DIRNAME = "notes";
var DEFAULT_ARCHIVE_ROOT_DIRNAME = "evidence-archive";
var SHA256SUMS_LINE_TERMINATOR = "\n";
var MAX_EVIDENCE_ORDINAL = 999;
function withOrdinal(name, ordinal) {
  if (ordinal <= 1) return name;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return `${name}-${ordinal}`;
  return `${name.slice(0, dot)}-${ordinal}${name.slice(dot)}`;
}
function isRecordableEvidencePath(value) {
  return isSafeEvidencePath(value) && !value.includes("\\");
}
function isReservedArchivePath(path) {
  return path === SHA256SUMS_FILENAME || path === ARCHIVE_NOTES_DIRNAME || path.startsWith(`${ARCHIVE_NOTES_DIRNAME}/`);
}
function evidenceFilesRelativePath(fileName) {
  return `${EVIDENCE_FILES_DIRNAME}/${fileName}`;
}
function sanitizeEvidenceFileName(fileName) {
  const posix = toPosixPath(fileName);
  const base = posix.slice(posix.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < base.length - 1;
  const rawStem = hasExtension ? base.slice(0, dot) : base;
  const rawExtension = hasExtension ? base.slice(dot + 1) : "";
  const stem = toSafeStem(rawStem);
  const extension = rawExtension.replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  return extension.length === 0 ? stem : `${stem}.${extension}`;
}
function toSafeStem(raw) {
  let cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 96);
  if (cleaned.length === 0) cleaned = "evidence";
  if (!/^[A-Za-z0-9]/.test(cleaned)) cleaned = `evidence-${cleaned}`.slice(0, 96);
  return cleaned;
}
function renderSha256Sums(entries) {
  const seen = /* @__PURE__ */ new Set();
  for (const entry of entries) {
    if (!SHA256_RE.test(entry.sha256)) {
      return err(
        failure(
          "invalid-input",
          `\u6458\u8981\u6761\u76EE\u542B\u975E\u6CD5\u7684 sha256\uFF1A${entry.path}`,
          "SHA256SUMS.txt \u53EA\u63A5\u53D7 64 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236\u6458\u8981"
        )
      );
    }
    if (!isRecordableEvidencePath(entry.path)) {
      return err(
        failure(
          "invalid-input",
          `\u6458\u8981\u6761\u76EE\u8DEF\u5F84\u4E0D\u5408\u6CD5\uFF1A${entry.path}`,
          "\u6458\u8981\u4E2D\u7684\u8DEF\u5F84\u5FC5\u987B\u662F\u4EE5 / \u5206\u9694\u3001\u843D\u5728\u5F52\u6863\u6839\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84"
        )
      );
    }
    if (isReservedArchivePath(entry.path)) {
      return err(
        failure(
          "invalid-input",
          `\u6458\u8981\u6761\u76EE\u4F7F\u7528\u4E86\u5F52\u6863\u4FDD\u7559\u8DEF\u5F84\uFF1A${entry.path}`,
          "SHA256SUMS.txt \u4E0E notes/ \u662F\u5F52\u6863\u5143\u6570\u636E\uFF0C\u4E0D\u53C2\u4E0E\u6458\u8981"
        )
      );
    }
    if (seen.has(entry.path)) {
      return err(failure("invalid-input", `\u6458\u8981\u6761\u76EE\u8DEF\u5F84\u91CD\u590D\uFF1A${entry.path}`, "\u6BCF\u4E2A\u6587\u4EF6\u5728 SHA256SUMS.txt \u4E2D\u53EA\u80FD\u51FA\u73B0\u4E00\u6B21"));
    }
    seen.add(entry.path);
  }
  const sorted = [...entries].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return ok(sorted.map((entry) => `${entry.sha256}  ${entry.path}${SHA256SUMS_LINE_TERMINATOR}`).join(""));
}
function archiveDirectoryBaseName(batchName, isoTimestamp) {
  const stamp = isoTimestamp.replace(/[^0-9A-Za-z]+/g, "-").replace(/^-+|-+$/g, "");
  return `${batchName}-${stamp.length === 0 ? "archive" : stamp}`;
}

// src/real-machine-verification/evidence/archive.ts
function joinRelativePath(root, relativePath2) {
  return relativePath2.split("/").reduce((current, segment) => joinFsPath(current, segment), root);
}
async function planEvidenceArchive(options) {
  const { fs, clock, batchDir, archiveRoot } = options;
  const batchName = parseBatchName(options.batchName);
  if (!batchName.ok) return batchName;
  if (batchDir.length === 0) {
    return err(failure("invalid-input", "\u6279\u6B21\u76EE\u5F55\u4E3A\u7A7A", "\u8BF7\u4F20\u5165\u6279\u6B21\u76EE\u5F55\uFF08<workRoot>/batches/<\u6279\u6B21\u540D>\uFF09"));
  }
  if (archiveRoot.length === 0) {
    return err(failure("invalid-input", "\u5F52\u6863\u6839\u76EE\u5F55\u4E3A\u7A7A", "\u8BF7\u4F20\u5165\u5F52\u6863\u6839\u76EE\u5F55\uFF08\u9ED8\u8BA4 <workRoot>/evidence-archive\uFF09"));
  }
  const batchStat = await fs.stat(batchDir);
  if (!batchStat.ok) {
    return err(
      failure("not-found", `\u6279\u6B21\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${batchDir}`, "\u5148\u8FD0\u884C\u8BC1\u636E\u91C7\u96C6\uFF08dsh-verify evidence add\uFF09\u518D\u5F52\u6863", {
        batchDir
      })
    );
  }
  if (batchStat.value.kind !== "directory") {
    return err(failure("invalid-input", `\u6279\u6B21\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55\uFF1A${batchDir}`, "archive \u53EA\u63A5\u53D7\u6279\u6B21\u76EE\u5F55", { batchDir }));
  }
  const walked = await walkFiles(fs, batchDir);
  if (!walked.ok) return walked;
  const entries = walked.value;
  const files = [];
  for (const entry of entries) {
    if (entry.kind === "directory") continue;
    if (entry.kind !== "file") {
      return err(
        failure(
          "invalid-input",
          `\u6279\u6B21\u76EE\u5F55\u542B\u4E0D\u652F\u6301\u7684\u6587\u4EF6\u7C7B\u578B\uFF1A${entry.relativePath}`,
          "\u5F52\u6863\u53EA\u63A5\u53D7\u666E\u901A\u6587\u4EF6\u4E0E\u76EE\u5F55\uFF1B\u7B26\u53F7\u94FE\u63A5\u8BF7\u5148\u7269\u5316\u4E3A\u771F\u5B9E\u6587\u4EF6",
          { path: entry.relativePath }
        )
      );
    }
    if (!isRecordableEvidencePath(entry.relativePath) || isReservedArchivePath(entry.relativePath)) {
      return err(
        failure(
          "invalid-input",
          `\u6279\u6B21\u76EE\u5F55\u542B\u4FDD\u7559\u6216\u975E\u6CD5\u8DEF\u5F84\uFF1A${entry.relativePath}`,
          "SHA256SUMS.txt \u4E0E notes/ \u662F\u5F52\u6863\u5143\u6570\u636E\uFF0C\u4E0D\u80FD\u51FA\u73B0\u5728\u6279\u6B21\u76EE\u5F55\u4E2D",
          { path: entry.relativePath }
        )
      );
    }
    const hashed = await fs.hashFile(entry.absolutePath);
    if (!hashed.ok) return hashed;
    files.push({ path: entry.relativePath, bytes: entry.bytes, sha256: hashed.value });
  }
  const createdAt = clock.iso();
  const baseName2 = archiveDirectoryBaseName(batchName.value, createdAt);
  let directory = "";
  for (let ordinal = 1; ordinal <= MAX_EVIDENCE_ORDINAL; ordinal += 1) {
    const candidate = joinFsPath(archiveRoot, ordinal === 1 ? baseName2 : `${baseName2}-${ordinal}`);
    if (await fs.exists(candidate)) continue;
    directory = candidate;
    break;
  }
  if (directory === "") {
    return err(
      failure(
        "conflict",
        `\u5F52\u6863\u76EE\u5F55\u5E8F\u53F7\u5DF2\u7528\u5C3D\uFF1A${baseName2}`,
        "\u540C\u4E00\u79D2\u5185\u5DF2\u5F52\u6863 999 \u6B21\uFF1B\u7B49\u5F85\u4E0B\u4E00\u79D2\u6216\u7528 --archive-root \u6362\u4E00\u4E2A\u5F52\u6863\u6839",
        { archiveRoot, baseName: baseName2 }
      )
    );
  }
  const digest = digestOfFiles(files.map((file) => ({ path: file.path, size: file.bytes, sha256: file.sha256 })));
  if (!digest.ok) return digest;
  return ok({
    batchName: batchName.value,
    batchDir,
    archiveRoot,
    createdAt,
    baseName: baseName2,
    directory,
    entries,
    files,
    copied: {
      files: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0)
    },
    fileDigest: digest.value
  });
}
async function archiveEvidence(options) {
  const { fs } = options;
  const planned = await planEvidenceArchive(options);
  if (!planned.ok) return planned;
  const plan = planned.value;
  const directory = plan.directory;
  const createdRoot = await fs.makeDir(plan.archiveRoot);
  if (!createdRoot.ok) return createdRoot;
  const madeDirectory = await fs.makeDir(directory);
  if (!madeDirectory.ok) return madeDirectory;
  const entries = plan.entries;
  const files = plan.files;
  const discardPartial = async () => {
    await fs.remove(directory, { recursive: true });
  };
  const sourceSha = new Map(files.map((file) => [file.path, file.sha256]));
  for (const entry of entries) {
    const targetPath = joinRelativePath(directory, entry.relativePath);
    if (entry.kind === "directory") {
      const made = await fs.makeDir(targetPath);
      if (!made.ok) {
        await discardPartial();
        return made;
      }
      continue;
    }
    const copied = await fs.copy(entry.absolutePath, targetPath, { recursive: false });
    if (!copied.ok) {
      await discardPartial();
      return copied;
    }
    const copiedHash = await fs.hashFile(targetPath);
    if (!copiedHash.ok) {
      await discardPartial();
      return copiedHash;
    }
    const expected = sourceSha.get(entry.relativePath);
    if (copiedHash.value !== expected) {
      await discardPartial();
      return err(
        failure(
          "io",
          `\u5F52\u6863\u590D\u5236\u540E\u54C8\u5E0C\u4E0D\u4E00\u81F4\uFF1A${entry.relativePath}`,
          "\u6E90\u6587\u4EF6\u5728\u590D\u5236\u8FC7\u7A0B\u4E2D\u88AB\u6539\u52A8\uFF0C\u6216\u6587\u4EF6\u7CFB\u7EDF\u4E0D\u53EF\u9760\uFF1B\u8BF7\u91CD\u8BD5\u5F52\u6863",
          { path: entry.relativePath, expected, actual: copiedHash.value }
        )
      );
    }
  }
  const sums = renderSha256Sums(files.map((file) => ({ path: file.path, sha256: file.sha256 })));
  if (!sums.ok) {
    await discardPartial();
    return sums;
  }
  const sumsPath = joinFsPath(directory, SHA256SUMS_FILENAME);
  const writtenSums = await fs.writeText(sumsPath, sums.value);
  if (!writtenSums.ok) {
    await discardPartial();
    return writtenSums;
  }
  return ok({
    directory,
    batchName: plan.batchName,
    batchDir: plan.batchDir,
    createdAt: plan.createdAt,
    files,
    sumsPath,
    sumsSha256: sha256Text(sums.value),
    fileDigest: plan.fileDigest,
    copied: plan.copied
  });
}

// src/real-machine-verification/evidence/verify.ts
function malformedIssue(lineNumber, detail, hint) {
  return {
    kind: "malformed",
    line: lineNumber,
    message: `${SHA256SUMS_FILENAME} \u7B2C ${lineNumber} \u884C\u683C\u5F0F\u4E0D\u5408\u6CD5\uFF1A${detail}`,
    ...hint === void 0 ? {} : { hint }
  };
}
function parseSha256Sums(text) {
  const entries = [];
  const issues = [];
  const seen = /* @__PURE__ */ new Set();
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.length === 0) {
      issues.push(malformedIssue(lineNumber, "\u7A7A\u884C", "\u6458\u8981\u6587\u4EF6\u53EA\u5141\u8BB8\u6587\u4EF6\u672B\u5C3E\u7684\u4E00\u4E2A\u6362\u884C\uFF1B\u4E2D\u95F4\u4E0D\u80FD\u6709\u7A7A\u884C"));
      return;
    }
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (match === null) {
      issues.push(
        malformedIssue(
          lineNumber,
          "\u5E94\u4E3A '<sha256>  <\u76F8\u5BF9\u8DEF\u5F84>'\uFF0864 \u4F4D\u5C0F\u5199\u5341\u516D\u8FDB\u5236 + \u4E24\u4E2A\u7A7A\u683C + \u8DEF\u5F84\uFF09",
          "\u624B\u6539\u6458\u8981\u6587\u4EF6\u4F1A\u8BA9\u5F52\u6863\u5931\u53BB\u53EF\u6821\u9A8C\u6027\uFF1B\u6062\u590D\u539F\u4EF6\u540E\u91CD\u8DD1 archive"
        )
      );
      return;
    }
    const sha256 = match[1];
    const path = match[2];
    if (path !== path.trim() || path.includes("	")) {
      issues.push(malformedIssue(lineNumber, `\u8DEF\u5F84\u542B\u9996\u5C3E\u7A7A\u767D\u6216\u5236\u8868\u7B26\uFF1A${JSON.stringify(path)}`));
      return;
    }
    if (!isRecordableEvidencePath(path) || isReservedArchivePath(path)) {
      issues.push(
        malformedIssue(
          lineNumber,
          `\u8DEF\u5F84\u4E0D\u5408\u6CD5\u6216\u4F7F\u7528\u4E86\u5F52\u6863\u4FDD\u7559\u8DEF\u5F84\uFF1A${path}`,
          "\u6458\u8981\u53EA\u80FD\u5217\u51FA\u5F52\u6863\u6839\u4E0B\u7684\u666E\u901A\u6587\u4EF6\uFF1BSHA256SUMS.txt \u4E0E notes/ \u4E0D\u53C2\u4E0E\u6458\u8981"
        )
      );
      return;
    }
    if (seen.has(path)) {
      issues.push(malformedIssue(lineNumber, `\u8DEF\u5F84\u91CD\u590D\uFF1A${path}`, "\u6BCF\u4E2A\u6587\u4EF6\u5728 SHA256SUMS.txt \u4E2D\u53EA\u80FD\u51FA\u73B0\u4E00\u6B21"));
      return;
    }
    seen.add(path);
    entries.push({ path, sha256, line: lineNumber });
  });
  return { entries, issues };
}
function joinArchivePath(root, relativePath2) {
  return relativePath2.split("/").reduce((current, segment) => joinFsPath(current, segment), root);
}
async function verifyEvidenceArchive(options) {
  const { fs, directory } = options;
  if (directory.length === 0) {
    return err(failure("invalid-input", "\u5F52\u6863\u76EE\u5F55\u4E3A\u7A7A", "\u8BF7\u4F20\u5165\u5F52\u6863\u76EE\u5F55\uFF08dsh-verify evidence verify --dir <dir>\uFF09"));
  }
  const directoryStat = await fs.stat(directory);
  if (!directoryStat.ok) {
    return err(failure("not-found", `\u5F52\u6863\u76EE\u5F55\u4E0D\u5B58\u5728\uFF1A${directory}`, "\u5148\u8FD0\u884C dsh-verify evidence archive", { directory }));
  }
  if (directoryStat.value.kind !== "directory") {
    return err(failure("invalid-input", `\u5F52\u6863\u8DEF\u5F84\u4E0D\u662F\u76EE\u5F55\uFF1A${directory}`, "verify \u53EA\u63A5\u53D7\u5F52\u6863\u76EE\u5F55", { directory }));
  }
  const sumsPath = joinFsPath(directory, SHA256SUMS_FILENAME);
  const sumsText = await fs.readText(sumsPath);
  if (!sumsText.ok) {
    return err(
      failure(
        "not-found",
        `\u5F52\u6863\u7F3A\u5C11 ${SHA256SUMS_FILENAME}\uFF1A${directory}`,
        "verify \u53EA\u6821\u9A8C\u7531 archive \u5199\u51FA\u7684\u5F52\u6863\uFF1B\u6458\u8981\u6587\u4EF6\u662F\u6821\u9A8C\u57FA\u51C6",
        { directory, sumsPath }
      )
    );
  }
  const parsed = parseSha256Sums(sumsText.value);
  const issues = [...parsed.issues];
  let checked = 0;
  for (const entry of parsed.entries) {
    const absolutePath = joinArchivePath(directory, entry.path);
    const fileStat = await fs.stat(absolutePath);
    if (!fileStat.ok) {
      issues.push({
        kind: "missing",
        path: entry.path,
        expected: entry.sha256,
        message: `\u6458\u8981\u5217\u51FA\u7684\u6587\u4EF6\u7F3A\u5931\uFF1A${entry.path}`,
        hint: "\u5F52\u6863\u5E94\u4FDD\u6301\u4E0D\u53D8\uFF1B\u5982\u679C\u8FD9\u662F\u6709\u610F\u7684\u66F4\u6B63\uFF0C\u5E94\u6062\u590D\u539F\u4EF6\u5E76\u7528 notes/ \u5199\u65C1\u6CE8"
      });
      continue;
    }
    if (fileStat.value.kind !== "file") {
      issues.push({
        kind: "modified",
        path: entry.path,
        expected: entry.sha256,
        message: `\u6458\u8981\u5217\u51FA\u7684\u8DEF\u5F84\u4E0D\u662F\u666E\u901A\u6587\u4EF6\uFF1A${entry.path}`,
        hint: "\u5F52\u6863\u5185\u8BE5\u8DEF\u5F84\u88AB\u76EE\u5F55/\u94FE\u63A5\u66FF\u6362\u4E86"
      });
      continue;
    }
    const hashed = await fs.hashFile(absolutePath);
    if (!hashed.ok) {
      issues.push({
        kind: "modified",
        path: entry.path,
        expected: entry.sha256,
        message: `\u65E0\u6CD5\u8BFB\u53D6\u6458\u8981\u5217\u51FA\u7684\u6587\u4EF6\uFF1A${entry.path}`
      });
      continue;
    }
    checked += 1;
    if (hashed.value !== entry.sha256) {
      issues.push({
        kind: "modified",
        path: entry.path,
        expected: entry.sha256,
        actual: hashed.value,
        message: `\u6587\u4EF6\u5185\u5BB9\u4E0E\u6458\u8981\u4E0D\u7B26\uFF1A${entry.path}`,
        hint: "\u5F52\u6863\u4E0D\u53EF\u53D8\uFF1B\u82E5\u8FD9\u662F\u6709\u610F\u66F4\u6B63\uFF0C\u8BF7\u6062\u590D\u539F\u4EF6\u5E76\u5728 notes/ \u5199\u65C1\u6CE8"
      });
    }
  }
  const walked = await walkFiles(fs, directory);
  if (!walked.ok) return walked;
  const listedPaths = new Set(parsed.entries.map((entry) => entry.path));
  const annotations = [];
  for (const entry of walked.value) {
    if (entry.kind === "directory") continue;
    if (entry.relativePath === SHA256SUMS_FILENAME) continue;
    if (listedPaths.has(entry.relativePath)) continue;
    if (entry.relativePath === ARCHIVE_NOTES_DIRNAME || entry.relativePath.startsWith(`${ARCHIVE_NOTES_DIRNAME}/`)) {
      if (entry.relativePath !== ARCHIVE_NOTES_DIRNAME) annotations.push(entry.relativePath);
      continue;
    }
    issues.push({
      kind: "extra",
      path: entry.relativePath,
      message: `\u5F52\u6863\u91CC\u6709\u6458\u8981\u672A\u5217\u51FA\u7684\u6587\u4EF6\uFF1A${entry.relativePath}`,
      hint: "\u5F52\u6863\u4E0D\u53EF\u53D8\uFF1B\u65B0\u6587\u4EF6\u5E94\u5199\u8FDB notes/ \u6216\u7528\u65B0\u7684\u5F52\u6863\u76EE\u5F55"
    });
  }
  const counts = { modified: 0, missing: 0, extra: 0, malformed: 0 };
  for (const issue of issues) counts[issue.kind] += 1;
  return ok({
    directory,
    sumsPath,
    checked,
    ok: issues.length === 0,
    issues,
    counts,
    annotations: annotations.sort()
  });
}

// src/real-machine-verification/cli/commands/evidence.ts
var EVIDENCE_USAGE = "dsh-verify evidence add|archive|verify [--file <p>]... [--check <id>=pass|fail] [--archive-root <dir>] [--dir <batch-or-archive-dir>] [--name <batch-name>] [--work-root <dir>] [--json] [--dry-run]";
var EVIDENCE_SUBCOMMANDS = ["add", "archive", "verify"];
var ADD_FLAGS = /* @__PURE__ */ new Set(["--json", "--dry-run", "--file", "--check", "--dir", "--name", "--work-root"]);
var ARCHIVE_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--archive-root",
  "--dir",
  "--name",
  "--work-root"
]);
var VERIFY_FLAGS = /* @__PURE__ */ new Set(["--json", "--dir"]);
var SUBCOMMAND_FLAGS = {
  add: ADD_FLAGS,
  archive: ARCHIVE_FLAGS,
  verify: VERIFY_FLAGS
};
function failureJson3(subcommand, stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "evidence",
    subcommand,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject2(args, io, subcommand, stage, message) {
  io.stderr(`dsh-verify evidence: ${message}
`);
  if (args.json) io.stdout(failureJson3(subcommand, stage, failure("invalid-input", message)));
  return EXIT_CODES.blocked;
}
function failWith(args, deps, subcommand, error, stage) {
  deps.io.stderr(`dsh-verify evidence ${subcommand}: ${formatFailure(error)}
`);
  if (args.json) deps.io.stdout(failureJson3(subcommand, stage, error));
  return error.code === "not-found" || error.code === "prerequisite" ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
}
function isEvidenceSubcommand(value) {
  return EVIDENCE_SUBCOMMANDS.includes(value);
}
function validateInvocation2(args) {
  if (args.command !== "evidence") {
    return { ok: false, message: `\u8BC1\u636E\u547D\u4EE4\u88AB\u9519\u8BEF\u5206\u53D1\uFF08\u6536\u5230 ${args.command ?? "\u7A7A\u547D\u4EE4"}\uFF09` };
  }
  const problems = [];
  if (args.unknown.length > 0) problems.push(`unknown option(s): ${args.unknown.join(", ")}`);
  for (const problem2 of args.problems) problems.push(problem2);
  const subcommand = args.positional[1];
  if (subcommand === void 0) {
    return { ok: false, message: `\u7F3A\u5C11\u5B50\u547D\u4EE4\uFF08add|archive|verify\uFF09
${EVIDENCE_USAGE}` };
  }
  if (!isEvidenceSubcommand(subcommand)) {
    return { ok: false, message: `\u672A\u77E5\u5B50\u547D\u4EE4 "${subcommand}"\uFF08\u652F\u6301 add|archive|verify\uFF09
${EVIDENCE_USAGE}` };
  }
  if (args.positional.length > 2) {
    problems.push(`unexpected argument(s): ${args.positional.slice(2).join(" ")}`);
  }
  const allowed = SUBCOMMAND_FLAGS[subcommand];
  const notAllowed = [...new Set(args.given)].filter((flag) => !allowed.has(flag)).sort();
  if (notAllowed.length > 0) {
    problems.push(`option(s) not valid for evidence ${subcommand}: ${notAllowed.join(", ")}`);
  }
  if (problems.length > 0) return { ok: false, message: `${problems.join("; ")}
${EVIDENCE_USAGE}` };
  return { ok: true, subcommand };
}
function resolveBatchContext(args, ports, deps) {
  const cwd = ports.env.cwd();
  const workRoot = resolveWorkRoot(cwd, args.workRoot);
  if (deps.batch !== void 0) {
    const name = parseBatchName(deps.batch.batchName);
    if (!name.ok) return { ok: false, error: name.error };
    return {
      ok: true,
      batch: {
        batchName: name.value,
        batchDir: resolveAgainst(cwd, deps.batch.batchDir),
        workRoot: deps.batch.workRoot === void 0 ? workRoot : resolveAgainst(cwd, deps.batch.workRoot),
        meta: deps.batch.meta ?? {},
        summary: deps.batch.summary ?? {},
        ...deps.batch.candidate === void 0 ? {} : { candidate: deps.batch.candidate },
        ...deps.batch.extra === void 0 ? {} : { extra: deps.batch.extra }
      }
    };
  }
  if (args.dir !== void 0) {
    const batchDir = resolveAgainst(cwd, args.dir);
    const rawName = args.name ?? baseName(batchDir);
    const name = parseBatchName(rawName);
    if (!name.ok) {
      return {
        ok: false,
        error: failure(
          "invalid-input",
          `\u65E0\u6CD5\u4ECE --dir \u63A8\u5BFC\u6279\u6B21\u540D\uFF1A${rawName}`,
          "\u8BF7\u663E\u5F0F\u4F20 --name <\u6279\u6B21\u540D>\uFF08\u5B57\u6BCD/\u6570\u5B57/._-\uFF0C1-64 \u5B57\u7B26\uFF0C\u4E14\u4E0D\u80FD\u662F . \u6216 ..\uFF09"
        )
      };
    }
    return {
      ok: true,
      batch: { batchName: name.value, batchDir, workRoot, meta: {}, summary: {} }
    };
  }
  if (args.name !== void 0) {
    const name = parseBatchName(args.name);
    if (!name.ok) return { ok: false, error: name.error };
    return {
      ok: true,
      batch: {
        batchName: name.value,
        batchDir: joinFsPath(workRoot, "batches", name.value),
        workRoot,
        meta: {},
        summary: {}
      }
    };
  }
  return {
    ok: false,
    error: failure(
      "prerequisite",
      "\u65E0\u6CD5\u786E\u5B9A\u6279\u6B21\u76EE\u5F55",
      "\u4F20 --dir <\u6279\u6B21\u76EE\u5F55> \u6216 --name <\u6279\u6B21\u540D>\uFF1B\u7F16\u7A0B\u8C03\u7528\u65F6\u7531\u547D\u4EE4\u5C42\u6CE8\u5165 batch \u4E0A\u4E0B\u6587"
    )
  };
}
function parseCheckSpec(raw, recordedAt) {
  const equals = raw.indexOf("=");
  if (equals <= 0 || equals === raw.length - 1) {
    return { ok: false, message: `--check \u9700\u8981 <\u68C0\u67E5\u9879 id>=pass|fail\uFF0C\u6536\u5230 "${raw}"` };
  }
  const id = raw.slice(0, equals);
  const verdict = raw.slice(equals + 1);
  if (verdict !== "pass" && verdict !== "fail") {
    return { ok: false, message: `--check \u7ED3\u8BBA\u53EA\u80FD\u662F pass \u6216 fail\uFF0C\u6536\u5230 "${verdict}"` };
  }
  const parsedId = parseCheckId(id);
  if (!parsedId.ok) {
    const hint = parsedId.error.hint === void 0 ? "" : `\uFF08${parsedId.error.hint}\uFF09`;
    return { ok: false, message: `${parsedId.error.message}${hint}` };
  }
  return {
    ok: true,
    line: {
      name: parsedId.value,
      ok: verdict === "pass",
      detail: "recorded by dsh-verify evidence add",
      recordedAt
    }
  };
}
async function allocateEvidenceName(fs, filesDir, requested, planned) {
  for (let ordinal = 1; ordinal <= MAX_EVIDENCE_ORDINAL; ordinal += 1) {
    const name = withOrdinal(requested, ordinal);
    if (planned.has(name)) continue;
    if (await fs.exists(joinFsPath(filesDir, name))) continue;
    planned.add(name);
    return name;
  }
  return null;
}
async function runAdd(args, deps) {
  const { ports, io } = deps;
  const { fs, clock } = ports;
  if (args.files.length === 0 && args.checks.length === 0) {
    return reject2(args, io, "add", "usage", "add \u9700\u8981\u81F3\u5C11\u4E00\u4E2A --file \u6216 --check");
  }
  const resolution = resolveBatchContext(args, ports, deps);
  if (!resolution.ok) return failWith(args, deps, "add", resolution.error, "prerequisite");
  const batch = resolution.batch;
  const capturedAt = clock.iso();
  const checks = [];
  for (const raw of args.checks) {
    const spec = parseCheckSpec(raw, capturedAt);
    if (!spec.ok) return reject2(args, io, "add", "usage", spec.message);
    checks.push(spec.line);
  }
  const cwd = ports.env.cwd();
  const evidenceRoot = joinFsPath(batch.batchDir, EVIDENCE_DIRNAME);
  const filesDir = joinFsPath(evidenceRoot, EVIDENCE_FILES_DIRNAME);
  const plannedNames = /* @__PURE__ */ new Set();
  const prepared = [];
  for (const rawPath of args.files) {
    const absolutePath = resolveAgainst(cwd, rawPath);
    const stat2 = await fs.stat(absolutePath);
    if (!stat2.ok) {
      return failWith(
        args,
        deps,
        "add",
        failure("not-found", `\u8BC1\u636E\u6E90\u6587\u4EF6\u4E0D\u5B58\u5728\uFF1A${rawPath}`, "\u68C0\u67E5 --file \u8DEF\u5F84\uFF1B\u8BC1\u636E\u91C7\u96C6\u4E0D\u66FF\u8C03\u7528\u65B9\u521B\u5EFA\u6587\u4EF6", {
          file: rawPath
        }),
        "collect"
      );
    }
    if (stat2.value.kind !== "file") {
      return failWith(
        args,
        deps,
        "add",
        failure("invalid-input", `\u8BC1\u636E\u6E90\u4E0D\u662F\u666E\u901A\u6587\u4EF6\uFF1A${rawPath}`, "\u53EA\u63A5\u53D7\u666E\u901A\u6587\u4EF6\uFF1B\u76EE\u5F55\u8BF7\u5148\u5C55\u5F00\u6210\u6587\u4EF6\u5217\u8868", {
          file: rawPath
        }),
        "collect"
      );
    }
    const hashed = await fs.hashFile(absolutePath);
    if (!hashed.ok) return failWith(args, deps, "add", hashed.error, "collect");
    const requestedName = sanitizeEvidenceFileName(baseName(absolutePath));
    const name = await allocateEvidenceName(fs, filesDir, requestedName, plannedNames);
    if (name === null) {
      return failWith(
        args,
        deps,
        "add",
        failure("conflict", `\u540C\u540D\u8BC1\u636E\u5E8F\u53F7\u5DF2\u7528\u5C3D\uFF1A${requestedName}`, "\u540C\u4E00\u6279\u6B21\u6700\u591A 999 \u4E2A\u540C\u540D\u8BC1\u636E\uFF1B\u8BF7\u6362\u4E00\u4E2A\u6587\u4EF6\u540D\u6216\u5F00\u65B0\u6279\u6B21"),
        "collect"
      );
    }
    prepared.push({ absolutePath, name, bytes: stat2.value.size, sha256: hashed.value });
  }
  const items = prepared.map((file) => ({
    kind: "file",
    path: asEvidencePath(evidenceFilesRelativePath(file.name)),
    bytes: file.bytes,
    sha256: file.sha256,
    capturedAt
  }));
  const existing = await loadEvidenceManifest(fs, evidenceRoot);
  if (!existing.ok) return failWith(args, deps, "add", existing.error, "manifest");
  const input = {
    generatedAt: capturedAt,
    batch: { name: batch.batchName, dir: batch.batchDir, root: batch.workRoot },
    meta: batch.meta,
    summary: batch.summary,
    checks,
    items,
    ...batch.candidate === void 0 ? {} : { candidate: batch.candidate },
    ...batch.extra === void 0 ? {} : { extra: batch.extra }
  };
  let merged;
  if (existing.value === null) {
    merged = buildEvidenceManifest(input);
  } else {
    const mergeResult = mergeEvidenceManifest(existing.value.manifest, input);
    if (!mergeResult.ok) return failWith(args, deps, "add", mergeResult.error, "manifest");
    merged = mergeResult.value;
  }
  if (args.dryRun) {
    const manifestPath = existing.value === null ? joinFsPath(evidenceRoot, EVIDENCE_MANIFEST_FILENAME) : existing.value.manifestPath;
    const plan = {
      batch: { name: batch.batchName, dir: batch.batchDir, root: batch.workRoot },
      evidenceRoot,
      filesDir,
      files: prepared.map((file) => ({
        source: file.absolutePath,
        name: file.name,
        target: joinFsPath(filesDir, file.name),
        bytes: file.bytes,
        sha256: file.sha256
      })),
      fileCount: prepared.length,
      items,
      checks,
      manifest: {
        path: manifestPath,
        replacing: existing.value !== null,
        itemCount: merged.items.length
      }
    };
    if (args.json) {
      io.stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          command: "evidence",
          subcommand: "add",
          ok: true,
          dryRun: true,
          plan
        })}
`
      );
    } else {
      io.stdout(`batch ${batch.batchName} (${batch.batchDir})
`);
      io.stdout(`would copy ${prepared.length} file(s):
`);
      for (const file of plan.files) {
        io.stdout(`  ${file.source} -> ${file.target} (${file.bytes} bytes, sha256 ${file.sha256})
`);
      }
      for (const check of checks) {
        io.stdout(`check ${check.name} ${check.ok ? "pass" : "fail"}
`);
      }
      io.stdout(
        `manifest ${manifestPath} (${existing.value === null ? "new" : "replace"}, ${merged.items.length} item(s))
`
      );
      io.stdout("dry run: nothing was written\n");
    }
    return EXIT_CODES.ok;
  }
  const copiedPaths = [];
  const rollbackCopies = async () => {
    for (const path of copiedPaths) await fs.remove(path, { recursive: false });
  };
  for (const file of prepared) {
    const targetPath = joinFsPath(filesDir, file.name);
    const made = await fs.makeDir(filesDir);
    if (!made.ok) {
      await rollbackCopies();
      return failWith(args, deps, "add", made.error, "copy");
    }
    const copied = await fs.copy(file.absolutePath, targetPath, { recursive: false });
    if (!copied.ok) {
      await rollbackCopies();
      return failWith(args, deps, "add", copied.error, "copy");
    }
    copiedPaths.push(targetPath);
    const copiedHash = await fs.hashFile(targetPath);
    if (!copiedHash.ok) {
      await rollbackCopies();
      return failWith(args, deps, "add", copiedHash.error, "copy");
    }
    if (copiedHash.value !== file.sha256) {
      await rollbackCopies();
      return failWith(
        args,
        deps,
        "add",
        failure(
          "io",
          `\u8BC1\u636E\u6587\u4EF6\u590D\u5236\u540E\u54C8\u5E0C\u4E0D\u4E00\u81F4\uFF1A${file.absolutePath}`,
          "\u6E90\u6587\u4EF6\u5728\u590D\u5236\u8FC7\u7A0B\u4E2D\u88AB\u6539\u52A8\uFF0C\u6216\u6587\u4EF6\u7CFB\u7EDF\u4E0D\u53EF\u9760\uFF1B\u8BF7\u91CD\u8BD5",
          { path: file.absolutePath, expected: file.sha256, actual: copiedHash.value }
        ),
        "copy"
      );
    }
  }
  const written = await writeEvidenceManifest({
    fs,
    evidenceRoot,
    manifest: merged,
    replace: existing.value !== null
  });
  if (!written.ok) {
    await rollbackCopies();
    return failWith(args, deps, "add", written.error, "manifest");
  }
  if (args.json) {
    io.stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        command: "evidence",
        subcommand: "add",
        ok: true,
        batch: { name: batch.batchName, dir: batch.batchDir, root: batch.workRoot },
        evidence: {
          root: evidenceRoot,
          manifest: written.value.manifestPath,
          manifestSha256: written.value.manifestSha256
        },
        items,
        checks
      })}
`
    );
  } else {
    io.stdout(`batch ${batch.batchName} (${batch.batchDir})
`);
    for (const item of items) {
      io.stdout(`added ${item.path} (${item.bytes} bytes, sha256 ${item.sha256})
`);
    }
    for (const check of checks) {
      io.stdout(`check ${check.name} ${check.ok ? "pass" : "fail"}
`);
    }
    io.stdout(`evidence ${evidenceRoot}
`);
    io.stdout(`manifest ${written.value.manifestPath} (sha256 ${written.value.manifestSha256})
`);
  }
  return EXIT_CODES.ok;
}
async function runArchive(args, deps) {
  const { ports, io } = deps;
  const resolution = resolveBatchContext(args, ports, deps);
  if (!resolution.ok) return failWith(args, deps, "archive", resolution.error, "prerequisite");
  const batch = resolution.batch;
  const archiveRoot = args.archiveRoot === void 0 ? joinFsPath(batch.workRoot, DEFAULT_ARCHIVE_ROOT_DIRNAME) : resolveAgainst(ports.env.cwd(), args.archiveRoot);
  if (args.dryRun) {
    const planned = await planEvidenceArchive({
      fs: ports.fs,
      clock: ports.clock,
      batchDir: batch.batchDir,
      batchName: batch.batchName,
      archiveRoot
    });
    if (!planned.ok) return failWith(args, deps, "archive", planned.error, "archive");
    const plan = planned.value;
    if (args.json) {
      io.stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          command: "evidence",
          subcommand: "archive",
          ok: true,
          dryRun: true,
          plan: {
            batch: { name: batch.batchName, dir: batch.batchDir },
            archiveRoot,
            directory: plan.directory,
            createdAt: plan.createdAt,
            files: plan.files,
            fileCount: plan.files.length,
            copied: plan.copied,
            fileDigest: plan.fileDigest,
            sumsPath: joinFsPath(plan.directory, "SHA256SUMS.txt")
          }
        })}
`
      );
    } else {
      io.stdout(`archive ${plan.directory} (dry run)
`);
      io.stdout(`batch ${batch.batchName} (${batch.batchDir})
`);
      io.stdout(`would copy ${plan.copied.files} file(s), ${plan.copied.bytes} byte(s)
`);
      for (const file of plan.files) io.stdout(`  ${file.path} (${file.bytes} bytes, sha256 ${file.sha256})
`);
      io.stdout(`SHA256SUMS.txt ${joinFsPath(plan.directory, "SHA256SUMS.txt")}
`);
      io.stdout(`digest ${plan.fileDigest}
`);
      io.stdout("dry run: nothing was written\n");
    }
    return EXIT_CODES.ok;
  }
  const archived = await archiveEvidence({
    fs: ports.fs,
    clock: ports.clock,
    batchDir: batch.batchDir,
    batchName: batch.batchName,
    archiveRoot
  });
  if (!archived.ok) return failWith(args, deps, "archive", archived.error, "archive");
  const result = archived.value;
  if (args.json) {
    io.stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        command: "evidence",
        subcommand: "archive",
        ok: true,
        batch: { name: batch.batchName, dir: batch.batchDir },
        archive: {
          directory: result.directory,
          batchName: result.batchName,
          createdAt: result.createdAt,
          files: result.files,
          sumsPath: result.sumsPath,
          sumsSha256: result.sumsSha256,
          fileDigest: result.fileDigest,
          copied: result.copied
        }
      })}
`
    );
  } else {
    io.stdout(`archive ${result.directory}
`);
    io.stdout(`batch ${batch.batchName} (${batch.batchDir})
`);
    io.stdout(`copied ${result.copied.files} file(s), ${result.copied.bytes} byte(s)
`);
    io.stdout(`SHA256SUMS.txt ${result.sumsPath} (sha256 ${result.sumsSha256})
`);
    io.stdout(`digest ${result.fileDigest}
`);
  }
  return EXIT_CODES.ok;
}
async function runVerify(args, deps) {
  const { ports, io } = deps;
  if (args.dir === void 0) {
    return reject2(args, io, "verify", "usage", `verify \u9700\u8981 --dir <\u5F52\u6863\u76EE\u5F55>
${EVIDENCE_USAGE}`);
  }
  const directory = resolveAgainst(ports.env.cwd(), args.dir);
  const verified = await verifyEvidenceArchive({ fs: ports.fs, directory });
  if (!verified.ok) return failWith(args, deps, "verify", verified.error, "verify");
  const result = verified.value;
  if (args.json) {
    io.stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        command: "evidence",
        subcommand: "verify",
        ok: result.ok,
        directory: result.directory,
        sumsPath: result.sumsPath,
        checked: result.checked,
        counts: result.counts,
        issues: result.issues,
        annotations: result.annotations
      })}
`
    );
  } else {
    for (const issue of result.issues) {
      if (issue.kind === "malformed") {
        io.stdout("malformed line " + (issue.line ?? "?") + " " + issue.message + "\n");
      } else {
        io.stdout(`${issue.kind} ${issue.path ?? "?"} ${issue.message}
`);
      }
      if (issue.expected !== void 0) io.stdout(`  expected: ${issue.expected}
`);
      if (issue.actual !== void 0) io.stdout(`  actual:   ${issue.actual}
`);
      if (issue.hint !== void 0) io.stdout(`  hint:     ${issue.hint}
`);
    }
    for (const annotation of result.annotations) io.stdout(`note ${annotation}
`);
    io.stdout(
      `${result.ok ? "ok" : "fail"} archive ${result.directory} (${result.checked} file(s) verified, ${result.issues.length} issue(s))
`
    );
  }
  return result.ok ? EXIT_CODES.ok : EXIT_CODES.hardFailure;
}
async function runEvidenceCommand(args, deps) {
  const validation = validateInvocation2(args);
  if (!validation.ok) {
    return reject2(args, deps.io, args.positional[1] ?? null, "usage", validation.message);
  }
  const subcommand = validation.subcommand;
  let resolved = deps;
  if (deps.batch === void 0 && deps.loadBatch !== void 0) {
    const loaded = await deps.loadBatch(args);
    if (!loaded.ok) return failWith(args, deps, subcommand, loaded.error, "batch");
    if (loaded.value !== null) resolved = { ...deps, batch: loaded.value };
  }
  if (subcommand === "add") return runAdd(args, resolved);
  if (subcommand === "archive") return runArchive(args, resolved);
  return runVerify(args, resolved);
}

// src/real-machine-verification/runtime/dsh/npm-pack.ts
import { gunzipSync } from "node:zlib";
var BLOCK = 512;
var MAX_ENTRIES = 1e5;
var MAX_TOTAL_BYTES = 512 * 1024 * 1024;
function invalid5(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseNpmPackJson(stdout) {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) return invalid5("npm pack printed nothing on stdout", "run `npm pack --json` by hand to see the failure");
  let value;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return invalid5(
      `npm pack stdout is not JSON: ${JSON.stringify(trimmed.slice(0, 200))}`,
      "npm wrappers sometimes print banners; run npm directly or fix the wrapper"
    );
  }
  if (!Array.isArray(value) || value.length === 0) {
    return invalid5("npm pack JSON must be a non-empty array of pack results");
  }
  const entries = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord5(item)) return invalid5(`npm pack JSON[${index}] must be an object`);
    if (typeof item.filename !== "string" || !item.filename.endsWith(".tgz")) {
      return invalid5(`npm pack JSON[${index}].filename ${JSON.stringify(item.filename)} must end with .tgz`);
    }
    const optionalString = (field) => {
      const raw = item[field];
      return typeof raw === "string" ? raw : void 0;
    };
    const name = optionalString("name");
    const version = optionalString("version");
    const shasum = optionalString("shasum");
    const integrity = optionalString("integrity");
    const size = typeof item.size === "number" && Number.isFinite(item.size) ? item.size : void 0;
    entries.push({
      filename: item.filename,
      ...name === void 0 ? {} : { name },
      ...version === void 0 ? {} : { version },
      ...shasum === void 0 ? {} : { shasum },
      ...integrity === void 0 ? {} : { integrity },
      ...size === void 0 ? {} : { size }
    });
  }
  return ok(entries);
}
function allZero(block) {
  for (const byte of block) if (byte !== 0) return false;
  return true;
}
function readCString(block, offset, length) {
  const slice = block.subarray(offset, offset + length);
  const end = slice.indexOf(0);
  return Buffer.from(slice.subarray(0, end === -1 ? slice.length : end)).toString("utf8");
}
function readOctal(block, offset, length) {
  const slice = block.subarray(offset, offset + length);
  if (slice.length > 0 && (slice[0] & 128) !== 0) {
    let value = slice[0] & 127;
    for (let index = 1; index < slice.length; index += 1) value = value * 256 + slice[index];
    return value;
  }
  const text = readCString(block, offset, length).trim();
  if (text.length === 0) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error(`tar header field at ${offset} is not octal: ${JSON.stringify(text)}`);
  return Number.parseInt(text, 8);
}
function parsePax(payload) {
  const records = /* @__PURE__ */ new Map();
  let offset = 0;
  while (offset < payload.length) {
    const space = payload.subarray(offset).indexOf(32);
    if (space <= 0) throw new Error("PAX record has no length separator");
    const lengthText = Buffer.from(payload.subarray(offset, offset + space)).toString("ascii");
    if (!/^[0-9]+$/.test(lengthText)) throw new Error(`PAX record length is not decimal: ${JSON.stringify(lengthText)}`);
    const recordLength = Number.parseInt(lengthText, 10);
    if (recordLength <= space + 1 || offset + recordLength > payload.length) throw new Error("PAX record length is out of bounds");
    const record = payload.subarray(offset + space + 1, offset + recordLength - 1);
    if (payload[offset + recordLength - 1] !== 10) throw new Error("PAX record does not end with a newline");
    const equals = record.indexOf(61);
    if (equals <= 0) throw new Error("PAX record has no key");
    const key = Buffer.from(record.subarray(0, equals)).toString("utf8");
    const value = Buffer.from(record.subarray(equals + 1)).toString("utf8");
    records.set(key, value);
    offset += recordLength;
  }
  return records;
}
function normalizeEntryPath(raw) {
  let path = raw;
  if (path.startsWith("./")) path = path.slice(2);
  if (path.startsWith("package/")) path = path.slice("package/".length);
  if (path.length === 0 || path.includes("\\") || path.includes("\0")) return null;
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return path;
}
function unpackNpmTarball(bytes) {
  let data;
  try {
    data = gunzipSync(bytes);
  } catch (error) {
    return invalid5(`package is not a readable gzip archive: ${error instanceof Error ? error.message : String(error)}`);
  }
  const files = /* @__PURE__ */ new Map();
  let offset = 0;
  let totalBytes = 0;
  let pendingLongName = null;
  let pendingPaxPath = null;
  let entryCount = 0;
  try {
    while (offset + BLOCK <= data.length) {
      const header = data.subarray(offset, offset + BLOCK);
      if (allZero(header)) break;
      entryCount += 1;
      if (entryCount > MAX_ENTRIES) return invalid5(`package has more than ${MAX_ENTRIES} entries`);
      const typeByte = header[156];
      const type = typeByte === 0 ? "\0" : String.fromCharCode(typeByte);
      const headerSize = readOctal(header, 124, 12);
      const headerName = readCString(header, 0, 100);
      const magic = readCString(header, 257, 6);
      const prefix = magic.startsWith("ustar") ? readCString(header, 345, 155) : "";
      const headerPath = prefix.length > 0 ? `${prefix}/${headerName}` : headerName;
      offset += BLOCK;
      if (headerSize < 0 || offset + headerSize > data.length) throw new Error(`tar entry ${JSON.stringify(headerPath)} declares ${headerSize} bytes beyond the archive`);
      const payload = data.subarray(offset, offset + headerSize);
      offset += Math.ceil(headerSize / BLOCK) * BLOCK;
      if (type === "L") {
        pendingLongName = Buffer.from(payload).toString("utf8").replace(/\0+$/, "");
        continue;
      }
      if (type === "K") continue;
      if (type === "x") {
        const pax = parsePax(payload);
        pendingPaxPath = pax.get("path") ?? pendingPaxPath;
        continue;
      }
      if (type === "g") continue;
      const rawPath = pendingPaxPath ?? pendingLongName ?? headerPath;
      pendingLongName = null;
      pendingPaxPath = null;
      if (type === "5") continue;
      if (type !== "0" && type !== "\0" && type !== "7") {
        return invalid5(`package contains unsupported tar entry type ${JSON.stringify(type)} at ${JSON.stringify(rawPath)}`, "only regular files can be hashed as package contents");
      }
      const path = normalizeEntryPath(rawPath);
      if (path === null) return invalid5(`package contains an unsafe path: ${JSON.stringify(rawPath)}`);
      if (files.has(path)) return invalid5(`package lists the same path twice: ${path}`);
      totalBytes += payload.length;
      if (totalBytes > MAX_TOTAL_BYTES) return invalid5(`package expands to more than ${MAX_TOTAL_BYTES} bytes`);
      files.set(path, { path, bytes: payload.length, content: Uint8Array.from(payload) });
    }
  } catch (error) {
    return invalid5(`package tar is malformed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const packageJsonFile = files.get("package.json");
  if (packageJsonFile === void 0) return invalid5("package tarball has no package.json at its root");
  let packageJson;
  try {
    packageJson = JSON.parse(Buffer.from(packageJsonFile.content).toString("utf8"));
  } catch {
    return invalid5("package/package.json inside the tarball is not valid JSON");
  }
  if (!isRecord5(packageJson)) return invalid5("package/package.json inside the tarball is not an object");
  const sorted = [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return ok({ files: sorted, packageJson });
}

// src/real-machine-verification/orchestration/freeze.ts
var TOOL_NAME = "dsh-verify";
var PACK_TIMEOUT_MS = 10 * 6e4;
function freezeFailure(stage, code, message, options = {}) {
  return {
    code,
    message,
    ...options.hint === void 0 ? {} : { hint: options.hint },
    ...options.details === void 0 ? {} : { details: options.details },
    stage,
    blocked: options.blocked === true
  };
}
function wrapFailure(result, stage, prefix, blockedFor = []) {
  if (result.ok) return ok(result.value);
  const { code, message, hint, details } = result.error;
  return err(
    freezeFailure(stage, code, `${prefix}: ${message}`, {
      ...blockedFor.includes(code) ? { blocked: true } : {},
      ...hint === void 0 ? {} : { hint },
      ...details === void 0 ? {} : { details }
    })
  );
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function tail(text, limit = 1500) {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `\u2026${trimmed.slice(-limit)}`;
}
function timestampForDirectory(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (match === null) return iso.replace(/[^0-9T]/g, "").slice(0, 15) || "unknown-time";
  return `${match[1]}${match[2]}${match[3]}T${match[4]}${match[5]}${match[6]}`;
}
function shellArgv(ports, command) {
  if (ports.env.platform() === "win32") {
    return [ports.env.get("ComSpec") ?? "cmd.exe", "/d", "/s", "/c", command];
  }
  return ["/bin/sh", "-c", command];
}
function npmExecutable(ports) {
  return ports.env.platform() === "win32" ? "npm.cmd" : "npm";
}
async function discard(fs, dir) {
  await fs.remove(dir, { recursive: true });
}
function readEntryClaims(text) {
  const banner = /\/\*!\s*([^\s*]+)\s+v([^\s*]+)\s*\*\//.exec(text);
  let name = banner?.[1] ?? null;
  let version = banner?.[2] ?? null;
  if (name === null) {
    name = /(?:PLUGIN_NAME|PACKAGE_NAME|pluginName|packageName)\s*[:=]\s*["']([^"']+)["']/.exec(text)?.[1] ?? null;
  }
  if (version === null) {
    version = /(?:PLUGIN_VERSION|PACKAGE_VERSION|pluginVersion|packageVersion|VERSION|version)\s*[:=]\s*["']([^"']+)["']/.exec(text)?.[1] ?? null;
  }
  const rawCommit = /(?:DSW_BUILD_COMMIT|DSH_BUILD_COMMIT|BUILD_COMMIT|buildCommit)\s*[:=]\s*["']([0-9a-fA-F]{40})["']/.exec(text)?.[1];
  const parsed = rawCommit === void 0 ? null : parseCommitSha(rawCommit.toLowerCase());
  return { name, version, buildCommit: parsed !== null && parsed.ok ? parsed.value : null };
}
function entryStatus(foundName, foundVersion, expectedName, expectedVersion) {
  if (foundName === null || foundVersion === null) return "blocked";
  return foundName === expectedName && foundVersion === expectedVersion ? "ok" : "mismatch";
}
async function findPreviousCandidate(fs, outDir, currentDir, commit) {
  const listed = await fs.list(outDir);
  if (!listed.ok) return null;
  let best = null;
  for (const entry of listed.value) {
    if (entry.kind !== "directory") continue;
    const dir = joinFsPath(outDir, entry.name);
    if (dir === currentDir) continue;
    const manifestPath = joinFsPath(dir, "candidate.json");
    const text = await fs.readText(manifestPath);
    if (!text.ok) continue;
    let json;
    try {
      json = JSON.parse(text.value);
    } catch {
      continue;
    }
    const parsed = parseCandidateManifest(json);
    if (!parsed.ok) continue;
    if (parsed.value.git.commit !== commit) continue;
    const ms = Date.parse(parsed.value.generatedAt);
    const candidate = {
      dir,
      manifestPath,
      manifestSha256: sha256Bytes(Buffer.from(text.value, "utf8")),
      manifest: parsed.value
    };
    if (best === null || ms > best.ms || ms === best.ms && manifestPath > best.candidate.manifestPath) {
      best = { candidate, ms };
    }
  }
  return best === null ? null : best.candidate;
}
function diffCandidates(previous, current) {
  const previousByPath = new Map(previous.package.files.map((file) => [file.path, file]));
  const currentByPath = new Map(current.package.files.map((file) => [file.path, file]));
  const added = [];
  const changed = [];
  for (const file of current.package.files) {
    const before = previousByPath.get(file.path);
    if (before === void 0) added.push(file.path);
    else if (before.sha256 !== file.sha256) {
      changed.push({ path: file.path, previousSha256: before.sha256, sha256: file.sha256 });
    }
  }
  const removed = previous.package.files.filter((file) => !currentByPath.has(file.path)).map((file) => file.path);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort((a, b) => a.path < b.path ? -1 : 1) };
}
async function readRootPackage(fs, cwd) {
  const path = joinFsPath(cwd, "package.json");
  const raw = await fs.readJson(path);
  if (!raw.ok) return wrapFailure(raw, "manifest", `could not read ${path}`);
  if (!isRecord6(raw.value)) return err(freezeFailure("manifest", "invalid-input", `${path} must contain a JSON object`));
  if (typeof raw.value.name !== "string" || raw.value.name.length === 0) {
    return err(freezeFailure("manifest", "invalid-input", `${path} has no package name`, { hint: 'add "name" to package.json' }));
  }
  if (typeof raw.value.version !== "string" || raw.value.version.length === 0) {
    return err(freezeFailure("manifest", "invalid-input", `${path} has no package version`, { hint: 'add "version" to package.json' }));
  }
  return ok({ name: raw.value.name, version: raw.value.version });
}
async function planFreeze(options) {
  const { ports, context, outDir, allowDirty } = options;
  const fs = ports.fs;
  const rootPackage = await readRootPackage(fs, context.cwd);
  if (!rootPackage.ok) return rootPackage;
  if (rootPackage.value.name !== context.profile.packageName) {
    return err(
      freezeFailure(
        "manifest",
        "identity-mismatch",
        `package.json names ${rootPackage.value.name}, but the profile verifies ${context.profile.packageName}`,
        { hint: "freeze from the package root the profile describes" }
      )
    );
  }
  const beforeResult = await readGitState({ ports, cwd: context.cwd });
  if (!beforeResult.ok) {
    return wrapFailure(beforeResult, "git", "could not read git state", ["prerequisite", "unsupported", "timeout"]);
  }
  const before = beforeResult.value;
  if (before.dirty && !allowDirty) {
    return err(
      freezeFailure(
        "git",
        "prerequisite",
        `working tree is dirty (${before.dirtyFiles.length} path(s)); refusing to freeze a release candidate`,
        {
          blocked: true,
          hint: "commit or stash the changes, or pass --allow-dirty to record a development candidate",
          details: { commit: before.commit, dirtyFiles: before.dirtyFiles.slice(0, 50) }
        }
      )
    );
  }
  const generatedAt = ports.clock.iso();
  const candidateName = `${before.commit.slice(0, 12)}-${timestampForDirectory(generatedAt)}`;
  let candidateDir = "";
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const dir = joinFsPath(outDir, suffix === 1 ? candidateName : `${candidateName}-${suffix}`);
    if (await fs.exists(dir)) continue;
    candidateDir = dir;
    break;
  }
  if (candidateDir === "") {
    return err(
      freezeFailure("report", "conflict", `could not find a free candidate directory name for ${candidateName} under ${outDir}`, {
        hint: "remove stale candidates or freeze in a different second"
      })
    );
  }
  const previous = await findPreviousCandidate(fs, outDir, candidateDir, before.commit);
  const notes = [];
  const build = context.profile.build;
  const buildPlan = build === void 0 ? null : { argv: shellArgv(ports, build.command), cwd: context.cwd, timeoutMs: build.timeoutMs };
  if (buildPlan === null) {
    notes.push("profile declares no build command; the existing tree was packed without rebuilding");
  }
  const packPlan = {
    argv: [npmExecutable(ports), "pack", "--json", "--ignore-scripts", "--pack-destination", candidateDir],
    cwd: context.cwd,
    timeoutMs: PACK_TIMEOUT_MS
  };
  return ok({
    outDir,
    rootPackage: rootPackage.value,
    before,
    generatedAt,
    candidateName,
    candidateDir,
    previous,
    build: buildPlan,
    pack: packPlan,
    notes
  });
}
async function claimCandidateDirectory(fs, plan) {
  const madeOut = await fs.makeDir(plan.outDir);
  if (!madeOut.ok) return wrapFailure(madeOut, "report", `could not create candidate root ${plan.outDir}`);
  const made = await fs.makeDir(plan.candidateDir);
  if (!made.ok) return wrapFailure(made, "report", `could not create candidate directory ${plan.candidateDir}`);
  return ok(plan.candidateDir);
}
async function freezeCandidate(options) {
  const { ports, context } = options;
  const fs = ports.fs;
  const planned = await planFreeze(options);
  if (!planned.ok) return planned;
  const plan = planned.value;
  const { rootPackage, before, generatedAt } = plan;
  const claimed = await claimCandidateDirectory(fs, plan);
  if (!claimed.ok) return claimed;
  const candidateDir = claimed.value;
  const fail = async (stage, code, message, options2 = {}) => {
    await discard(fs, candidateDir);
    return err(freezeFailure(stage, code, message, options2));
  };
  const previous = plan.previous;
  const notes = [...plan.notes];
  const build = context.profile.build;
  if (build === void 0) {
  } else {
    const run = await ports.command.run({
      argv: plan.build?.argv ?? [],
      cwd: plan.build?.cwd ?? context.cwd,
      env: {
        ...ports.env.snapshot(),
        DSH_BUILD_COMMIT: before.commit,
        DSW_BUILD_COMMIT: before.commit
      },
      timeoutMs: build.timeoutMs
    });
    if (!run.ok) return wrapFailure(run, "build", "could not start the build command");
    if (run.value.timedOut) {
      return fail("build", "timeout", `build command timed out after ${build.timeoutMs}ms: ${build.command}`, {
        hint: "raise profile.build.timeoutMs or make the build finish sooner"
      });
    }
    if (run.value.exitCode !== 0) {
      return fail("build", "prerequisite", `build command failed with exit code ${String(run.value.exitCode)}: ${build.command}`, {
        hint: `build stderr: ${tail(run.value.stderr) || "(empty)"}`,
        details: { exitCode: run.value.exitCode, stdoutTail: tail(run.value.stdout), stderrTail: tail(run.value.stderr) }
      });
    }
  }
  const packed = await ports.command.run({
    argv: plan.pack.argv,
    cwd: plan.pack.cwd,
    timeoutMs: plan.pack.timeoutMs
  });
  if (!packed.ok) return wrapFailure(packed, "pack", "could not start npm pack");
  if (packed.value.timedOut) {
    return fail("pack", "timeout", `npm pack timed out after ${PACK_TIMEOUT_MS}ms`, { hint: "check whether npm is waiting on a network prompt" });
  }
  if (packed.value.exitCode !== 0) {
    return fail("pack", "prerequisite", `npm pack failed with exit code ${String(packed.value.exitCode)}`, {
      hint: `npm stderr: ${tail(packed.value.stderr) || "(empty)"}`,
      details: { stdoutTail: tail(packed.value.stdout), stderrTail: tail(packed.value.stderr) }
    });
  }
  const packJson = parseNpmPackJson(packed.value.stdout);
  if (!packJson.ok) return fail("pack", "invalid-input", packJson.error.message, { hint: packJson.error.hint });
  if (packJson.value.length !== 1) {
    return fail(
      "pack",
      "conflict",
      `npm pack produced ${packJson.value.length} package(s); a candidate must be exactly one tarball`,
      { hint: "check the package's files/workspaces configuration so pack emits one package" }
    );
  }
  const packEntry = packJson.value[0];
  const listed = await fs.list(candidateDir);
  if (!listed.ok) return wrapFailure(listed, "pack", `could not list ${candidateDir}`);
  const tgzNames = listed.value.filter((entry2) => entry2.kind === "file" && entry2.name.toLowerCase().endsWith(".tgz")).map((entry2) => entry2.name);
  if (tgzNames.length !== 1) {
    return fail(
      "pack",
      "conflict",
      `npm pack left ${tgzNames.length} .tgz file(s) in ${candidateDir}; a candidate must be exactly one tarball`,
      { details: { files: tgzNames } }
    );
  }
  if (tgzNames[0] !== packEntry.filename) {
    return fail(
      "pack",
      "identity-mismatch",
      `npm pack reported ${JSON.stringify(packEntry.filename)} but wrote ${JSON.stringify(tgzNames[0])}`
    );
  }
  const tgzPath = joinFsPath(candidateDir, tgzNames[0]);
  const tgzBytesResult = await fs.readBytes(tgzPath);
  if (!tgzBytesResult.ok) return wrapFailure(tgzBytesResult, "pack", `could not read ${tgzPath}`);
  const diskHash = await fs.hashFile(tgzPath);
  if (!diskHash.ok) return wrapFailure(diskHash, "pack", `could not hash ${tgzPath}`);
  const tgzSha256 = sha256Bytes(tgzBytesResult.value);
  if (diskHash.value !== tgzSha256) {
    return fail("pack", "io", "the tarball changed while it was being read; the candidate would not describe the file on disk", {
      hint: "freeze again on a quiet tree"
    });
  }
  const tgzBytes = tgzBytesResult.value;
  const unpacked = unpackNpmTarball(tgzBytes);
  if (!unpacked.ok) return fail("pack", "invalid-input", unpacked.error.message, { hint: unpacked.error.hint });
  const packedPackage = unpacked.value.packageJson;
  if (packedPackage.name !== plan.rootPackage.name) {
    return fail(
      "manifest",
      "identity-mismatch",
      `the packed package.json names ${JSON.stringify(packedPackage.name)}, but the source package is ${plan.rootPackage.name}`
    );
  }
  if (packedPackage.version !== plan.rootPackage.version) {
    return fail(
      "manifest",
      "identity-mismatch",
      `the build changed the package version from ${plan.rootPackage.version} to ${JSON.stringify(packedPackage.version)}`,
      { hint: "bump the version in source before freezing; a candidate must name one version" }
    );
  }
  const files = unpacked.value.files.map((file) => ({
    path: file.path,
    bytes: file.bytes,
    sha256: sha256Bytes(file.content)
  }));
  const fileDigest = digestOfFiles(files.map((file) => ({ path: file.path, size: file.bytes, sha256: file.sha256 })));
  if (!fileDigest.ok) return fail("manifest", "internal", `could not digest the package file list: ${fileDigest.error.message}`);
  let entry;
  let buildCommit = null;
  const clientEntry = context.profile.clientEntry;
  const entryFile = unpacked.value.files.find((file) => file.path === clientEntry);
  if (entryFile === void 0) {
    entry = {
      clientEntry,
      foundPackageName: null,
      foundVersion: null,
      status: "blocked",
      sha256: null
    };
    notes.push(`client entry ${clientEntry} is not in the package; its plugin name and version could not be checked`);
  } else {
    const text = Buffer.from(entryFile.content).toString("utf8");
    const claims = readEntryClaims(text);
    const status = entryStatus(claims.name, claims.version, context.profile.packageName, plan.rootPackage.version);
    entry = {
      clientEntry,
      foundPackageName: claims.name,
      foundVersion: claims.version,
      status,
      sha256: sha256Bytes(entryFile.content)
    };
    buildCommit = claims.buildCommit;
    if (status === "mismatch") {
      return fail(
        "entry",
        "identity-mismatch",
        `packaged client entry states ${JSON.stringify(claims.name)} v${JSON.stringify(claims.version)}, expected ${context.profile.packageName} v${plan.rootPackage.version}`,
        {
          details: {
            clientEntry,
            expectedPackageName: context.profile.packageName,
            expectedVersion: plan.rootPackage.version,
            foundPackageName: claims.name,
            foundVersion: claims.version
          }
        }
      );
    }
    if (status === "blocked") {
      notes.push(
        `client entry ${clientEntry} does not declare ${claims.name === null ? "a plugin name" : "a version"}; the entry check is blocked, not passed`
      );
    }
    if (buildCommit === null) {
      notes.push(`client entry ${clientEntry} does not embed a build commit; package.buildCommit is null (unknown, not a pass)`);
    } else if (buildCommit !== before.commit) {
      return fail(
        "entry",
        "identity-mismatch",
        `client entry declares build commit ${buildCommit}, but the frozen source is ${before.commit}`,
        { hint: "rebuild from scratch; a cached bundle from another commit is not this candidate" }
      );
    }
  }
  const afterResult = await readGitState({ ports, cwd: context.cwd });
  if (!afterResult.ok) return wrapFailure(afterResult, "git", "could not re-read git state after packing");
  const after = afterResult.value;
  if (after.commit !== before.commit) {
    return fail(
      "git",
      "conflict",
      `HEAD changed during freeze (${before.commit} -> ${after.commit}); \u5019\u9009\u8BF4\u4E0D\u6E05\u4ECE\u54EA\u4EFD\u6E90\u7801\u505A\u51FA\u6765\u7684`,
      { hint: "freeze again from a checkout that does not move while building" }
    );
  }
  if (after.branch !== before.branch) notes.push(`branch changed during freeze: ${before.branch} -> ${after.branch}`);
  const sourceStable = sameGitState(before, after);
  if (!sourceStable) {
    notes.push("the dirty file set changed while the package was built; sourceStable is false");
  }
  const manifest = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    generatedAt,
    tool: TOOL_NAME,
    version: plan.rootPackage.version,
    validity: before.dirty ? "development" : "release",
    sourceStable,
    git: { commit: before.commit, branch: before.branch, dirty: before.dirty, dirtyFiles: before.dirtyFiles },
    package: {
      tgzPath,
      tgzBytes: tgzBytes.length,
      tgzSha256,
      filename: tgzNames[0],
      ...packEntry.shasum === void 0 ? {} : { npmShasum: packEntry.shasum },
      ...packEntry.integrity === void 0 ? {} : { npmIntegrity: packEntry.integrity },
      files,
      fileCount: files.length,
      fileDigest: fileDigest.value,
      manifestDigest: packageManifestDigest(packedPackage, before.commit),
      buildCommit
    },
    ...entry === void 0 ? {} : { entry },
    ...notes.length === 0 ? {} : { notes }
  };
  const check = parseCandidateManifest(manifest);
  if (!check.ok) {
    return fail("manifest", "internal", `freeze produced a manifest its own parser rejects: ${check.error.message}`);
  }
  const candidatePath = joinFsPath(candidateDir, "candidate.json");
  const written = await fs.writeJson(candidatePath, manifest);
  if (!written.ok) return wrapFailure(written, "report", `could not write ${candidatePath}`);
  const candidateBytes = await fs.readBytes(candidatePath);
  if (!candidateBytes.ok) return wrapFailure(candidateBytes, "report", `could not read back ${candidatePath}`);
  const candidateSha256 = sha256Bytes(candidateBytes.value);
  const changes = previous === null ? null : diffCandidates(previous.manifest, manifest);
  return ok({ candidate: manifest, candidatePath, candidateSha256, previous, changes, notes });
}

// src/real-machine-verification/cli/commands/freeze.ts
var FREEZE_USAGE = "dsh-verify freeze [--out <dir>] [--allow-dirty] [--json] [--dry-run]";
var FREEZE_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--profile",
  "--declaration",
  "--work-root",
  "--out",
  "--allow-dirty"
]);
function changesJson(outcome) {
  if (outcome.changes === null || outcome.previous === null) return null;
  return {
    previous: {
      path: outcome.previous.manifestPath,
      sha256: outcome.previous.manifestSha256,
      commit: outcome.previous.manifest.git.commit,
      generatedAt: outcome.previous.manifest.generatedAt,
      dir: outcome.previous.dir
    },
    added: outcome.changes.added,
    changed: outcome.changes.changed,
    removed: outcome.changes.removed
  };
}
function failureJson4(stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "freeze",
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function outcomeJson(outcome, ok3, error, stage) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "freeze",
    ok: ok3,
    candidate: outcome.candidate,
    candidatePath: outcome.candidatePath,
    candidateSha256: outcome.candidateSha256,
    entry: outcome.candidate.entry ?? null,
    notes: outcome.notes,
    changes: changesJson(outcome),
    ...ok3 || error === void 0 || stage === void 0 ? {} : {
      error: {
        code: error.code,
        message: error.message,
        ...error.hint === void 0 ? {} : { hint: error.hint },
        ...error.details === void 0 ? {} : { details: error.details },
        stage
      }
    }
  })}
`;
}
function renderEntry2(entry) {
  if (entry === void 0) return "entry: not inspected";
  const found = entry.foundPackageName === null && entry.foundVersion === null ? "no name/version found" : `${entry.foundPackageName ?? "?"} v${entry.foundVersion ?? "?"}`;
  return `entry: ${entry.clientEntry} \u2014 ${entry.status} (${found})`;
}
function renderOutcome(outcome) {
  const { candidate } = outcome;
  const lines = [];
  lines.push(`candidate ${candidate.version} @ ${candidate.git.commit} (${candidate.validity}, sourceStable=${String(candidate.sourceStable)})`);
  lines.push(`candidate.json: ${outcome.candidatePath} (sha256 ${outcome.candidateSha256})`);
  lines.push(`tarball: ${candidate.package.tgzPath} (sha256 ${candidate.package.tgzSha256})`);
  lines.push(`files: ${candidate.package.fileCount} (fileDigest ${candidate.package.fileDigest})`);
  lines.push(`build commit: ${candidate.package.buildCommit ?? "not embedded"}`);
  lines.push(renderEntry2(candidate.entry));
  if (outcome.changes !== null && outcome.previous !== null) {
    lines.push(`changes vs ${outcome.previous.dir}:`);
    for (const path of outcome.changes.added) lines.push(`  + ${path}`);
    for (const item of outcome.changes.changed) lines.push(`  ~ ${item.path}`);
    for (const path of outcome.changes.removed) lines.push(`  - ${path}`);
    if (outcome.changes.added.length + outcome.changes.changed.length + outcome.changes.removed.length === 0) {
      lines.push("  (no file changes)");
    }
  } else {
    lines.push(`changes: no earlier candidate for ${candidate.git.commit.slice(0, 12)}`);
  }
  return `${lines.join("\n")}
`;
}
function planJson(plan) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "freeze",
    ok: true,
    dryRun: true,
    plan: {
      outDir: plan.outDir,
      candidateName: plan.candidateName,
      candidateDir: plan.candidateDir,
      rootPackage: plan.rootPackage,
      git: plan.before,
      generatedAt: plan.generatedAt,
      build: plan.build,
      pack: plan.pack,
      previous: plan.previous === null ? null : {
        dir: plan.previous.dir,
        manifestPath: plan.previous.manifestPath,
        manifestSha256: plan.previous.manifestSha256,
        commit: plan.previous.manifest.git.commit
      },
      notes: plan.notes
    }
  })}
`;
}
function renderDryRun(plan) {
  const lines = [];
  lines.push("freeze plan (dry run) \u2014 nothing was written");
  lines.push(`package: ${plan.rootPackage.name}@${plan.rootPackage.version}`);
  lines.push(`candidate: ${plan.candidateName}`);
  lines.push(`candidate dir: ${plan.candidateDir}`);
  lines.push(`out dir: ${plan.outDir}`);
  lines.push(`git: ${plan.before.commit} (${plan.before.branch}, dirty=${String(plan.before.dirty)})`);
  if (plan.before.dirty) lines.push(`dirty files: ${plan.before.dirtyFiles.length}`);
  lines.push(plan.build === null ? "build: no build command declared" : `build: ${plan.build.argv.join(" ")} (cwd ${plan.build.cwd})`);
  lines.push(`pack: ${plan.pack.argv.join(" ")}`);
  lines.push(
    plan.previous === null ? `previous: none for ${plan.before.commit.slice(0, 12)}` : `previous: ${plan.previous.dir} (sha256 ${plan.previous.manifestSha256})`
  );
  for (const note of plan.notes) lines.push(`note: ${note}`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runFreezeCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, FREEZE_FLAGS);
  if (problems.length > 0) {
    const message = `${problems.join("; ")}
${FREEZE_USAGE}`;
    io.stderr(`dsh-verify freeze: ${message}
`);
    if (args.json) io.stdout(failureJson4("usage", { code: "invalid-input", message }));
    return EXIT_CODES.blocked;
  }
  const cwd = ports.env.cwd();
  const context = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime?.nodeVersion ?? "0.0.0-unknown",
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!context.ok) {
    io.stderr(`dsh-verify freeze: ${formatFailure(context.error.failure)}
`);
    if (args.json) io.stdout(failureJson4(context.error.stage, context.error.failure));
    return EXIT_CODES.blocked;
  }
  const outDir = args.out === void 0 ? joinFsPath(context.value.workRoot, "candidates") : resolveAgainst(cwd, args.out);
  if (args.dryRun) {
    const planned = await planFreeze({ ports, context: context.value, outDir, allowDirty: args.allowDirty });
    if (!planned.ok) {
      const error = planned.error;
      io.stderr(`dsh-verify freeze: ${formatFailure(error)} (stage: ${error.stage})
`);
      if (args.json) io.stdout(failureJson4(error.stage, error));
      return error.blocked ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
    }
    if (args.json) io.stdout(planJson(planned.value));
    else io.stdout(renderDryRun(planned.value));
    return EXIT_CODES.ok;
  }
  io.stderr(`dsh-verify freeze: building ${context.value.profile.packageName} from ${cwd}
`);
  const frozen = await freezeCandidate({
    ports,
    context: context.value,
    outDir,
    allowDirty: args.allowDirty
  });
  if (!frozen.ok) {
    const error = frozen.error;
    io.stderr(`dsh-verify freeze: ${formatFailure(error)} (stage: ${error.stage})
`);
    if (args.json) io.stdout(failureJson4(error.stage, error));
    return error.blocked ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
  }
  const outcome = frozen.value;
  for (const note of outcome.notes) io.stderr(`dsh-verify freeze: note: ${note}
`);
  if (outcome.candidate.entry?.status === "blocked") {
    const entry = outcome.candidate.entry;
    const message = `packaged client entry ${entry.clientEntry} could not be checked (name=${String(entry.foundPackageName)}, version=${String(entry.foundVersion)})`;
    if (args.json) {
      io.stdout(outcomeJson(outcome, false, { code: "prerequisite", message, hint: "declare the plugin name and version in the client bundle" }, "entry"));
    } else {
      io.stdout(renderOutcome(outcome));
      io.stderr(`dsh-verify freeze: blocked: ${message}
`);
    }
    return EXIT_CODES.blocked;
  }
  if (!outcome.candidate.sourceStable) {
    const message = "HEAD or the dirty file set changed while the package was built; the candidate is recorded with sourceStable=false";
    if (args.json) {
      io.stdout(outcomeJson(outcome, false, { code: "conflict", message, hint: "freeze again on a quiet tree" }, "git"));
    } else {
      io.stdout(renderOutcome(outcome));
      io.stderr(`dsh-verify freeze: fail: ${message}
`);
    }
    return EXIT_CODES.hardFailure;
  }
  if (args.json) io.stdout(outcomeJson(outcome, true));
  else io.stdout(renderOutcome(outcome));
  return EXIT_CODES.ok;
}

// src/real-machine-verification/orchestration/install-package.ts
var INSTALL_METHODS = ["extract", "cli"];
var DEFAULT_INSTALL_METHOD = "extract";
var CANDIDATE_FILE = "candidate.json";
function installFailure(stage, failureValue) {
  return { ...failureValue, stage };
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function readString(record, key) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
function tail2(text, limit = 1200) {
  return text.length <= limit ? text : text.slice(text.length - limit);
}
function driveOf(path) {
  const match = /^([A-Za-z]):[\\/]/.exec(path);
  return match === null ? null : (match[1] ?? "").toLowerCase();
}
function relativePath(root, absolute) {
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  const normalizedAbsolute = absolute.replace(/\\/g, "/");
  const prefix = normalizedRoot.replace(/\\/g, "/") + "/";
  return normalizedAbsolute.startsWith(prefix) ? normalizedAbsolute.slice(prefix.length) : normalizedAbsolute;
}
async function listInstalledFiles(ports, root) {
  const files = /* @__PURE__ */ new Map();
  const walk = async (dir) => {
    const listed = await ports.fs.list(dir);
    if (!listed.ok) return listed;
    for (const entry of listed.value) {
      const absolute = joinFsPath(dir, entry.name);
      if (entry.kind === "directory") {
        const nested = await walk(absolute);
        if (!nested.ok) return nested;
      } else if (entry.kind === "file") {
        files.set(relativePath(root, absolute), absolute);
      }
    }
    return ok(void 0);
  };
  const walked = await walk(root);
  return walked.ok ? ok(files) : walked;
}
async function readCandidate(ports, rawPath) {
  const stat2 = await ports.fs.stat(rawPath);
  if (!stat2.ok) {
    return err(
      installFailure(
        "input",
        failure(
          "prerequisite",
          `candidate path ${rawPath} is not readable: ${stat2.error.message}`,
          "pass the candidate directory produced by freeze (it holds candidate.json), or omit --candidate to verify against the tarball itself"
        )
      )
    );
  }
  const file = stat2.value.kind === "directory" ? joinFsPath(rawPath, CANDIDATE_FILE) : rawPath;
  const raw = await ports.fs.readJson(file);
  if (!raw.ok) {
    return err(
      installFailure(
        "input",
        failure(
          "prerequisite",
          `could not read ${file}: ${raw.error.message}`,
          "pass the candidate directory produced by freeze (it holds candidate.json), or omit --candidate to verify against the tarball itself"
        )
      )
    );
  }
  const parsed = parseCandidateManifest(raw.value);
  if (!parsed.ok) {
    return err(
      installFailure(
        "input",
        failure(
          "invalid-input",
          `${file} is not a candidate manifest: ${parsed.error.message}`,
          "regenerate the candidate with dsh-verify freeze"
        )
      )
    );
  }
  return ok({ manifest: parsed.value, path: file });
}
function expectedFromTarball(unpacked) {
  return unpacked.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: sha256Bytes(file.content) })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
function expectedFromCandidate(manifest) {
  return manifest.package.files.map((file) => ({ path: file.path, bytes: file.bytes, sha256: file.sha256 })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}
function row(id, title, status, detail, extra = {}) {
  return {
    id: checkId2(id),
    title,
    hard: true,
    status,
    detail,
    ...extra.expected === void 0 ? {} : { expected: extra.expected },
    ...extra.actual === void 0 ? {} : { actual: extra.actual },
    ...extra.hint === void 0 ? {} : { hint: extra.hint },
    evidence: [],
    durationMs: 0,
    source: "builtin"
  };
}
function installedFilesDetail(expected, actual) {
  const missing = [];
  const changed = [];
  const expectedPaths = /* @__PURE__ */ new Set();
  for (const file of expected) {
    expectedPaths.add(file.path);
    const found = actual.get(file.path);
    if (found === void 0) {
      missing.push(file.path);
    } else if (found.sha256 !== file.sha256 || found.bytes !== file.bytes) {
      changed.push(`${file.path} (expected ${file.bytes}B/${file.sha256.slice(0, 12)}, got ${found.bytes}B/${found.sha256.slice(0, 12)})`);
    }
  }
  const extra = [...actual.keys()].filter((path) => !expectedPaths.has(path)).sort();
  const problems = [];
  if (missing.length > 0) problems.push(`missing: ${missing.join(", ")}`);
  if (changed.length > 0) problems.push(`changed: ${changed.join(", ")}`);
  if (extra.length > 0) problems.push(`extra: ${extra.join(", ")}`);
  const actualText = `${actual.size} installed file(s)`;
  return {
    ok: problems.length === 0,
    detail: problems.length === 0 ? `${expected.length} file(s) match byte-for-byte` : problems.join("; "),
    actual: actualText
  };
}
async function writeProfileDependency(ports, profileDir, profileName, packageName, tgzPath) {
  const manifestPath = joinFsPath(profileDir, "package.json");
  const existing = await ports.fs.readJson(manifestPath);
  let manifest;
  let created = false;
  if (existing.ok) {
    const record = asRecord(existing.value);
    if (record === null) {
      return err(
        installFailure(
          "profile",
          failure(
            "invalid-input",
            `${manifestPath} is not a JSON object`,
            "fix or remove the profile package.json, then rerun install"
          )
        )
      );
    }
    manifest = record;
  } else {
    manifest = { name: profileName, private: true };
    created = true;
  }
  const dependencies = asRecord(manifest.dependencies) ?? {};
  const spec = `file:${tgzPath.replace(/\\/g, "/")}`;
  manifest = { ...manifest, dependencies: { ...dependencies, [packageName]: spec } };
  const written = await ports.fs.writeJson(manifestPath, manifest);
  if (!written.ok) {
    return err(
      installFailure(
        "profile",
        failure("io", `could not write ${manifestPath}: ${written.error.message}`, "check the profile directory is writable")
      )
    );
  }
  return ok({ created });
}
async function planInstall(options) {
  const { ports, tgzPath, method, profileDir, packageName, clientEntry } = options;
  const notes = [];
  const bytes = await ports.fs.readBytes(tgzPath);
  if (!bytes.ok) {
    return err(
      installFailure(
        "input",
        failure(
          "not-found",
          `could not read tarball ${tgzPath}: ${bytes.error.message}`,
          "pass the .tgz produced by npm pack or dsh-verify freeze"
        )
      )
    );
  }
  const unpacked = unpackNpmTarball(bytes.value);
  if (!unpacked.ok) {
    return err(installFailure("unpack", unpacked.error));
  }
  const packageJson = asRecord(unpacked.value.packageJson);
  const packageVersion = packageJson === null ? null : readString(packageJson, "version");
  const packedName = packageJson === null ? null : readString(packageJson, "name");
  if (packedName === null || packageVersion === null) {
    return err(
      installFailure(
        "unpack",
        failure(
          "invalid-input",
          `${tgzPath} has no readable package name/version`,
          "the tarball must contain package/package.json with name and version"
        )
      )
    );
  }
  if (packedName !== packageName) {
    return err(
      installFailure(
        "input",
        failure(
          "identity-mismatch",
          `tarball contains ${packedName}@${packageVersion}, but the profile expects ${packageName}`,
          "install the tarball this profile declares, or change the profile's packageName"
        )
      )
    );
  }
  let candidate = null;
  let candidateFile = null;
  if (options.candidatePath !== void 0 && options.candidatePath !== null && options.candidatePath !== "") {
    const read = await readCandidate(ports, options.candidatePath);
    if (!read.ok) return err(installFailure("input", read.error));
    candidate = read.value.manifest;
    candidateFile = read.value.path;
    notes.push(`expected file list comes from ${candidateFile}`);
  } else {
    notes.push("expected file list comes from the tarball itself (no --candidate)");
  }
  const expectedFiles = candidate === null ? expectedFromTarball(unpacked.value) : expectedFromCandidate(candidate);
  const expectedSource = candidate === null ? "tgz" : "candidate";
  const targetDir = joinFsPath(profileDir, "node_modules", packageName);
  const platform = ports.env.platform();
  if (method === "cli") {
    const sourceDrive = driveOf(tgzPath);
    const targetDrive = driveOf(profileDir);
    if (platform === "win32" && sourceDrive !== null && targetDrive !== null && sourceDrive !== targetDrive) {
      return err(
        installFailure(
          "input",
          failure(
            "unsupported",
            `npm cannot install across drives (${sourceDrive}: -> ${targetDrive}:) without hard links`,
            "rerun with --method extract; it unpacks the same tarball and does not need a shared drive"
          )
        )
      );
    }
  }
  const npmArgv = method === "cli" ? [
    options.npmCommand ?? (platform === "win32" ? "npm.cmd" : "npm"),
    "install",
    tgzPath,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund"
  ] : null;
  return ok({
    tgzPath,
    tgzSha256: sha256Bytes(bytes.value),
    method,
    profileDir,
    targetDir,
    nodeModulesDir: joinFsPath(profileDir, "node_modules"),
    packageName,
    packageVersion,
    clientEntry,
    expectedSource,
    candidatePath: candidateFile,
    expectedFiles,
    expectedFileCount: expectedFiles.length,
    willReplaceExisting: await ports.fs.exists(targetDir),
    profileManifestPath: joinFsPath(profileDir, "package.json"),
    dependencySpec: `file:${tgzPath.replace(/\\/g, "/")}`,
    npmArgv,
    notes,
    candidate,
    unpacked: unpacked.value
  });
}
async function installPackage(options) {
  const { ports, method, profileDir, profileName, packageName, tgzPath } = options;
  const note = options.note ?? (() => void 0);
  note(`reading ${tgzPath}`);
  const planned = await planInstall({
    ports,
    tgzPath,
    method,
    dshHome: options.dshHome,
    profileName,
    profileDir,
    packageName,
    clientEntry: options.clientEntry,
    ...options.candidatePath === void 0 ? {} : { candidatePath: options.candidatePath },
    ...options.npmCommand === void 0 ? {} : { npmCommand: options.npmCommand }
  });
  if (!planned.ok) return err(planned.error);
  const plan = planned.value;
  const notes = [...plan.notes];
  const { packageVersion, targetDir, expectedFiles, expectedSource, clientEntry } = plan;
  note(`installing ${plan.packageName}@${packageVersion} into ${targetDir} via ${method}`);
  const made = await ports.fs.makeDir(plan.nodeModulesDir);
  if (!made.ok) {
    return err(
      installFailure(
        "install",
        failure("io", `could not create ${plan.nodeModulesDir}: ${made.error.message}`, "check the profile directory is writable")
      )
    );
  }
  if (plan.willReplaceExisting) {
    const removed = await ports.fs.remove(targetDir, { recursive: true });
    if (!removed.ok) {
      return err(
        installFailure(
          "install",
          failure("io", `could not replace ${targetDir}: ${removed.error.message}`, "stop the instance and retry; a running process may hold files")
        )
      );
    }
  }
  const targetMade = await ports.fs.makeDir(targetDir);
  if (!targetMade.ok) {
    return err(
      installFailure(
        "install",
        failure("io", `could not create ${targetDir}: ${targetMade.error.message}`, "check the profile directory is writable")
      )
    );
  }
  if (method === "extract") {
    for (const file of plan.unpacked.files) {
      const target = joinFsPath(targetDir, ...file.path.split("/"));
      const parent = parentPath(target) ?? targetDir;
      const parentMade = await ports.fs.makeDir(parent);
      if (!parentMade.ok) {
        return err(
          installFailure("install", failure("io", `could not create ${parent}: ${parentMade.error.message}`))
        );
      }
      const written = await options.binaryWriter.write(target, file.content);
      if (!written.ok) {
        return err(installFailure("install", written.error));
      }
    }
  } else {
    const npmArgv = plan.npmArgv ?? [];
    const npm = npmArgv[0] ?? "npm";
    const run = await ports.command.run({
      argv: npmArgv,
      cwd: profileDir,
      timeoutMs: 18e4
    });
    if (!run.ok) {
      return err(
        installFailure(
          "install",
          failure("io", `could not run ${npm}: ${run.error.message}`, "install Node.js/npm on PATH, or rerun with --method extract")
        )
      );
    }
    if (run.value.exitCode !== 0) {
      return err(
        installFailure(
          "install",
          failure(
            "io",
            `${npm} install exited with ${run.value.exitCode ?? run.value.signal ?? "no status"}`,
            "rerun with --method extract; it does not invoke npm",
            { stderr: tail2(run.value.stderr), stdout: tail2(run.value.stdout) }
          )
        )
      );
    }
  }
  const dependency = await writeProfileDependency(ports, profileDir, profileName, packageName, tgzPath);
  if (!dependency.ok) return err(installFailure("profile", dependency.error));
  note("verifying installed bytes");
  const checks = [];
  const installedManifestPath = joinFsPath(targetDir, "package.json");
  const installedManifest = await ports.fs.readJson(installedManifestPath);
  const installedRecord = installedManifest.ok ? asRecord(installedManifest.value) : null;
  const installedName = installedRecord === null ? null : readString(installedRecord, "name");
  const installedVersion = installedRecord === null ? null : readString(installedRecord, "version");
  checks.push(
    installedName === packageName ? row("package-installed", "package is installed", "pass", `${packageName}@${installedVersion ?? "?"} is at ${targetDir}`) : row(
      "package-installed",
      "package is installed",
      "fail",
      installedManifest.ok ? `${installedManifestPath} does not name ${packageName}` : `${installedManifestPath} is unreadable`,
      {
        expected: `${installedManifestPath} with name ${packageName}`,
        actual: installedManifest.ok ? JSON.stringify(installedManifest.value) : installedManifest.error.message,
        hint: "rerun install; if the profile was modified by hand, remove node_modules and install again"
      }
    )
  );
  checks.push(
    installedVersion === packageVersion ? row("package-version", "installed version matches the tarball", "pass", `version ${packageVersion}`) : row(
      "package-version",
      "installed version matches the tarball",
      "fail",
      `installed version is ${installedVersion ?? "missing"}`,
      {
        expected: packageVersion,
        actual: installedVersion ?? "missing",
        hint: "the profile is holding a different build; rerun install from this tarball"
      }
    )
  );
  const entryExpected = plan.candidate?.entry !== void 0 && plan.candidate.entry.clientEntry === clientEntry ? plan.candidate.entry.sha256 : expectedFiles.find((file) => file.path === clientEntry)?.sha256 ?? null;
  const entryPath = joinFsPath(targetDir, ...clientEntry.split("/"));
  const entryHash = await ports.fs.hashFile(entryPath);
  checks.push(
    entryExpected === null ? row("package-client-entry", "client entry matches the tarball", "fail", `${clientEntry} is not in the expected file list`, {
      expected: clientEntry,
      actual: "absent from the tarball/candidate file list",
      hint: "check profile.clientEntry; the tarball must contain that path"
    }) : entryHash.ok && entryHash.value === entryExpected ? row("package-client-entry", "client entry matches the tarball", "pass", `${clientEntry} sha256 ${entryExpected.slice(0, 12)}\u2026`) : row(
      "package-client-entry",
      "client entry matches the tarball",
      "fail",
      entryHash.ok ? `${clientEntry} sha256 differs` : `${clientEntry} is unreadable`,
      {
        expected: entryExpected,
        actual: entryHash.ok ? entryHash.value : entryHash.error.message,
        hint: "rerun install; a stale or partial client entry means the install did not copy the candidate"
      }
    )
  );
  const entryText = await ports.fs.readText(entryPath);
  const claims = entryText.ok ? readEntryClaims(entryText.value) : null;
  const claimsMatch = claims !== null && claims.name === packageName && claims.version === packageVersion;
  checks.push(
    claimsMatch ? row("package-version-constant", "client entry states the package identity", "pass", `${packageName}@${packageVersion}`) : row(
      "package-version-constant",
      "client entry states the package identity",
      "fail",
      claims === null ? `${clientEntry} is unreadable` : `client entry states ${claims.name ?? "no name"}@${claims.version ?? "no version"}`,
      {
        expected: `${packageName}@${packageVersion}`,
        actual: claims === null ? "unreadable" : `${claims.name ?? "no name"}@${claims.version ?? "no version"}`,
        hint: "the build must embed its package name and version; rebuild before freezing the candidate"
      }
    )
  );
  const listed = await listInstalledFiles(ports, targetDir);
  let fileCheck;
  if (!listed.ok) {
    fileCheck = row("package-files", "installed files match the expected list", "fail", `could not list ${targetDir}: ${listed.error.message}`, {
      expected: `${expectedFiles.length} file(s) from ${expectedSource}`,
      actual: listed.error.message,
      hint: "check the profile directory permissions"
    });
  } else {
    const actualFiles = /* @__PURE__ */ new Map();
    let hashFailure = null;
    for (const [path, absolute] of listed.value) {
      const [hashed, stat2] = await Promise.all([ports.fs.hashFile(absolute), ports.fs.stat(absolute)]);
      if (!hashed.ok || !stat2.ok) {
        hashFailure = `${path}: ${hashed.ok ? stat2.ok ? "unknown" : stat2.error.message : hashed.error.message}`;
        break;
      }
      actualFiles.set(path, { bytes: stat2.value.size, sha256: hashed.value });
    }
    if (hashFailure !== null) {
      fileCheck = row("package-files", "installed files match the expected list", "fail", hashFailure, {
        expected: `${expectedFiles.length} file(s) from ${expectedSource}`,
        actual: hashFailure,
        hint: "rerun install; an unreadable installed file cannot be verified"
      });
    } else {
      const compared = installedFilesDetail(expectedFiles, actualFiles);
      fileCheck = row(
        "package-files",
        "installed files match the expected list",
        compared.ok ? "pass" : "fail",
        compared.ok ? `${compared.detail} (source: ${expectedSource})` : compared.detail,
        compared.ok ? {} : {
          expected: `${expectedFiles.length} file(s) from ${expectedSource}`,
          actual: compared.actual,
          hint: expectedSource === "candidate" ? "rerun install from the candidate tarball; do not edit installed files" : "rerun install; the tarball and installed tree differ"
        }
      );
    }
  }
  checks.push(fileCheck);
  const installedFileCount = listed.ok ? listed.value.size : 0;
  if (dependency.value.created) notes.push(`created ${joinFsPath(profileDir, "package.json")} with the package dependency`);
  return ok({
    method,
    targetDir,
    packageName,
    packageVersion,
    clientEntry,
    expectedSource,
    candidatePath: plan.candidatePath,
    expectedFileCount: plan.expectedFileCount,
    installedFileCount,
    checks,
    notes
  });
}

// src/real-machine-verification/runtime/platform/binary-writer.ts
import { writeFile as writeFile2 } from "node:fs/promises";
function createBinaryWriter() {
  return {
    async write(path, bytes) {
      try {
        await writeFile2(path, bytes);
        return ok({ bytes: bytes.byteLength });
      } catch (error) {
        return err(failure("io", `failed to write ${path}: ${error instanceof Error ? error.message : String(error)}`, "check the target directory exists and is writable"));
      }
    }
  };
}

// src/real-machine-verification/cli/commands/install.ts
var INSTALL_USAGE = "dsh-verify install --tgz <file> [--method extract|cli] [--profile <p>] [--json] [--dry-run]";
var INSTALL_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--profile",
  "--declaration",
  "--work-root",
  "--tgz",
  "--method",
  "--candidate"
]);
function parseMethod(raw) {
  if (raw === void 0) return { method: DEFAULT_INSTALL_METHOD };
  if (!INSTALL_METHODS.includes(raw)) {
    return { problem: `--method must be one of ${INSTALL_METHODS.join(", ")}, got "${raw}"` };
  }
  return { method: raw };
}
function installPlanJson(plan) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "install",
    ok: true,
    dryRun: true,
    plan: {
      tgzPath: plan.tgzPath,
      tgzSha256: plan.tgzSha256,
      method: plan.method,
      packageName: plan.packageName,
      packageVersion: plan.packageVersion,
      profileDir: plan.profileDir,
      targetDir: plan.targetDir,
      nodeModulesDir: plan.nodeModulesDir,
      willReplaceExisting: plan.willReplaceExisting,
      expectedSource: plan.expectedSource,
      candidatePath: plan.candidatePath,
      expectedFileCount: plan.expectedFileCount,
      expectedFiles: plan.expectedFiles.map((file) => ({ path: file.path, bytes: file.bytes })),
      profileManifestPath: plan.profileManifestPath,
      dependencySpec: plan.dependencySpec,
      npmArgv: plan.npmArgv,
      notes: plan.notes
    }
  })}
`;
}
function renderInstallPlan(plan) {
  const lines = [];
  lines.push("install plan (dry run) \u2014 nothing was written");
  lines.push(`tarball: ${plan.tgzPath} (sha256 ${plan.tgzSha256})`);
  lines.push(`package: ${plan.packageName}@${plan.packageVersion}`);
  lines.push(`method: ${plan.method}`);
  lines.push(`target: ${plan.targetDir}`);
  lines.push(`existing target: ${plan.willReplaceExisting ? "yes, it would be replaced" : "no"}`);
  lines.push(`expected files: ${plan.expectedFileCount} (source: ${plan.expectedSource})`);
  for (const file of plan.expectedFiles) lines.push(`  - ${file.path} (${file.bytes} bytes)`);
  lines.push(`profile manifest: ${plan.profileManifestPath} (dependencies[${plan.packageName}] = ${plan.dependencySpec})`);
  if (plan.npmArgv !== null) lines.push(`npm: ${plan.npmArgv.join(" ")}`);
  for (const note of plan.notes) lines.push(`note: ${note}`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runInstallCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, INSTALL_FLAGS);
  if (problems.length > 0) return emitUsageFailure(io, args.json, "install", problems, INSTALL_USAGE);
  if (args.tgz === void 0 || args.tgz.trim().length === 0) {
    return emitUsageFailure(io, args.json, "install", ["install requires --tgz <file>"], INSTALL_USAGE);
  }
  const method = parseMethod(args.method);
  if ("problem" in method) {
    return emitUsageFailure(io, args.json, "install", [method.problem], INSTALL_USAGE);
  }
  const cwd = ports.env.cwd();
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    return emitFailure(io, args.json, "install", loaded.error.stage, loaded.error.failure);
  }
  const context = loaded.value;
  const tgzPath = resolveAgainst(cwd, args.tgz);
  const candidatePath = args.candidate === void 0 ? null : resolveAgainst(cwd, args.candidate);
  const note = (message) => {
    io.stderr(`dsh-verify install: ${message}
`);
  };
  const realHomeHit = await findWriteUnderRealHome({
    fs: ports.fs,
    env: ports.env,
    cwd,
    dshHome: context.dshHome
  });
  if (realHomeHit !== null && !args.dryRun) {
    return emitFailure(io, args.json, "install", "prerequisite", {
      code: "prerequisite",
      message: `refusing to install into the real DSH home ${realHomeHit.realHome}: DSH_HOME ${realHomeHit.value}`,
      hint: "copy the profile into a batch home and set DSH_HOME to that copy; this tool never writes the real user home",
      details: { dshHome: context.dshHome, profileDir: context.profileDir, realHome: realHomeHit.realHome }
    });
  }
  if (realHomeHit !== null) {
    note(
      `warning: the target DSH home ${context.dshHome} belongs to the real user home ${realHomeHit.realHome}, so ${context.profileDir} belongs to it; a real install would be refused; copy the profile into a batch home and set DSH_HOME to that copy`
    );
  }
  if (args.dryRun) {
    const planned = await planInstall({
      ports,
      tgzPath,
      method: method.method,
      dshHome: context.dshHome,
      profileName: context.profileName,
      profileDir: context.profileDir,
      packageName: context.profile.packageName,
      clientEntry: context.profile.clientEntry,
      ...candidatePath === null ? {} : { candidatePath }
    });
    if (!planned.ok) {
      return emitFailure(io, args.json, "install", planned.error.stage, planned.error);
    }
    if (args.json) io.stdout(installPlanJson(planned.value));
    else io.stdout(renderInstallPlan(planned.value));
    return EXIT_CODES.ok;
  }
  note(`installing ${tgzPath} into ${context.profileDir} (${method.method})`);
  const installed = await installPackage({
    ports,
    binaryWriter: deps.binaryWriter ?? createBinaryWriter(),
    tgzPath,
    method: method.method,
    dshHome: context.dshHome,
    profileName: context.profileName,
    profileDir: context.profileDir,
    packageName: context.profile.packageName,
    clientEntry: context.profile.clientEntry,
    candidatePath,
    note
  });
  if (!installed.ok) {
    return emitFailure(io, args.json, "install", installed.error.stage, installed.error);
  }
  const outcome = installed.value;
  const exitCode = stateFromChecks(outcome.checks).exitCode;
  const lines = outcome.checks.flatMap((check) => renderCheckLines(check));
  if (args.json) {
    const payload = {
      schemaVersion: 1,
      command: "install",
      ok: exitCode === 0,
      profile: context.profileName,
      ...outcome
    };
    io.stdout(`${JSON.stringify(payload)}
`);
    for (const line of lines) io.stderr(`${line}
`);
  } else {
    for (const line of lines) io.stdout(`${line}
`);
  }
  if (exitCode !== 0) {
    const failed2 = outcome.checks.filter((check) => check.status === "fail" || check.status === "blocked");
    io.stderr(`dsh-verify install: ${failed2.length} check(s) did not pass; expectedSource=${outcome.expectedSource}
`);
  }
  return exitCode === 0 ? EXIT_CODES.ok : exitCode;
}

// src/real-machine-verification/runtime/dsh/isolation.ts
var PROBE_MARKER_CONTENT = `${JSON.stringify({
  schemaVersion: 1,
  probe: "dsh-verify-settings-isolation",
  marker: "isolated"
})}
`;
var DEFAULT_PROBE_TIMEOUT_MS = 6e4;
function isolationProbePaths(workRoot, probeId) {
  const probeRoot = joinFsPath(workRoot, "isolation", probeId);
  return {
    probeRoot,
    redirectedHome: joinFsPath(probeRoot, "userprofile"),
    workdir: joinFsPath(probeRoot, "workdir")
  };
}
function realSettingsFilePath(realHome, pluginSettingsDir) {
  return joinFsPath(realHome, ".dsh", pluginSettingsDir, "settings.yaml");
}
function probeScript(pluginSettingsDir) {
  const dirLiteral = JSON.stringify(pluginSettingsDir);
  const contentLiteral = JSON.stringify(PROBE_MARKER_CONTENT);
  return [
    "const os=require('os'),fs=require('fs'),path=require('path'),crypto=require('crypto');",
    `const content=${contentLiteral};`,
    "const home=os.homedir();",
    `const marker=path.join(home,'.dsh',${dirLiteral},'settings.yaml');`,
    "let wrote=false,readBack=false,bytes=0,sha256=null;",
    "try{",
    "fs.mkdirSync(path.dirname(marker),{recursive:true});",
    "fs.writeFileSync(marker,content);",
    "wrote=true;",
    "const back=fs.readFileSync(marker,'utf8');",
    "readBack=back===content;",
    "bytes=Buffer.byteLength(back);",
    "sha256=crypto.createHash('sha256').update(back).digest('hex');",
    "console.log(JSON.stringify({home,markerPath:marker,wrote,readBack,bytes,sha256}));",
    "}catch(error){",
    "process.exitCode=1;",
    "console.log(JSON.stringify({home,markerPath:marker,wrote,readBack,bytes,sha256,error:String((error&&error.message)||error)}));",
    "}"
  ].join("");
}
function buildProbeEnv(parent, redirectedHome) {
  const env = {};
  for (const name of BASE_ENV_ALLOWLIST) {
    const value = parent[name];
    if (value !== void 0) env[name] = value;
  }
  env["USERPROFILE"] = redirectedHome;
  env["HOME"] = redirectedHome;
  env["DSH_HOME"] = joinFsPath(redirectedHome, ".dsh");
  return env;
}
async function fingerprint(fs, path) {
  if (!await fs.exists(path)) return { path, existed: false, sha256: null, readError: null };
  const hashed = await fs.hashFile(path);
  if (!hashed.ok) {
    return { path, existed: true, sha256: null, readError: hashed.error.message };
  }
  return { path, existed: true, sha256: hashed.value, readError: null };
}
function describeFingerprint(value) {
  if (!value.existed) return "absent";
  return value.sha256 === null ? "existed, unreadable" : `existed, sha256 ${value.sha256}`;
}
function fingerprintsMatch(before, after) {
  if (before.existed !== after.existed) return false;
  if (!before.existed) return true;
  return before.sha256 !== null && before.sha256 === after.sha256;
}
function parseProbeStdout(stdout) {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const lastLine = lines[lines.length - 1];
  if (lastLine === void 0) return null;
  let value;
  try {
    value = JSON.parse(lastLine);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value;
  const home = record["home"];
  const markerPath = record["markerPath"];
  const bytes = record["bytes"];
  const sha256 = record["sha256"];
  return {
    home: typeof home === "string" ? home : null,
    markerPath: typeof markerPath === "string" ? markerPath : null,
    wrote: record["wrote"] === true,
    readBack: record["readBack"] === true,
    bytes: typeof bytes === "number" && Number.isFinite(bytes) ? bytes : null,
    sha256: typeof sha256 === "string" && /^[0-9a-f]{64}$/.test(sha256) ? sha256 : null
  };
}
function tail3(text, limit = 2e3) {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : trimmed.slice(trimmed.length - limit);
}
function planSettingsIsolation(options) {
  const { env, pluginSettingsDir, realHome, redirectedHome, workdir } = options;
  const probeEnv = buildProbeEnv(env.snapshot(), redirectedHome);
  return {
    argv: [env.execPath(), "-e", "<probe script>"],
    cwd: workdir,
    env: probeEnv,
    envNames: Object.keys(probeEnv).sort(),
    timeoutMs: options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    markerPath: joinFsPath(redirectedHome, ".dsh", pluginSettingsDir, "settings.yaml"),
    realSettingsPath: realSettingsFilePath(realHome, pluginSettingsDir)
  };
}
async function probeSettingsIsolation(options) {
  const { ports, probeRoot, pluginSettingsDir, realHome, redirectedHome, workdir } = options;
  const { fs, command, env } = ports;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const realSettingsPath = realSettingsFilePath(realHome, pluginSettingsDir);
  const before = await fingerprint(fs, realSettingsPath);
  for (const directory of [probeRoot, redirectedHome, workdir]) {
    const made = await fs.makeDir(directory);
    if (!made.ok) return made;
  }
  const probeEnv = buildProbeEnv(env.snapshot(), redirectedHome);
  const script = probeScript(pluginSettingsDir);
  const run = await command.run({
    argv: [env.execPath(), "-e", script],
    cwd: workdir,
    env: probeEnv,
    timeoutMs
  });
  if (!run.ok) return run;
  const outcome = run.value;
  const after = await fingerprint(fs, realSettingsPath);
  const expectedMarkerPath = joinFsPath(redirectedHome, ".dsh", pluginSettingsDir, "settings.yaml");
  const markerPresent = await fs.exists(expectedMarkerPath);
  let markerSha256 = null;
  let markerReadError = null;
  if (markerPresent) {
    const hashed = await fs.hashFile(expectedMarkerPath);
    if (hashed.ok) markerSha256 = hashed.value;
    else markerReadError = hashed.error.message;
  }
  const child = parseProbeStdout(outcome.stdout);
  const problems = [];
  if (outcome.timedOut) {
    problems.push({ code: "probe-exit", message: `the probe child did not exit within ${String(timeoutMs)}ms` });
  } else if (outcome.exitCode !== 0) {
    problems.push({ code: "probe-exit", message: `the probe child exited with code ${String(outcome.exitCode)}` });
  }
  if (child === null) {
    problems.push({ code: "probe-output", message: "the probe child did not print one JSON line on stdout" });
  } else {
    if (child.home === null) {
      problems.push({ code: "probe-output", message: "the probe child's JSON line did not report a home directory" });
    } else if (!samePath(child.home, redirectedHome)) {
      problems.push({
        code: "child-home",
        message: `the child resolved its home to ${child.home}, not the redirected ${redirectedHome}`
      });
    }
    if (!child.wrote) {
      problems.push({ code: "marker-write", message: `the child could not write the marker file under ${redirectedHome}` });
    }
    if (!child.readBack) {
      problems.push({ code: "marker-readback", message: "the child could not read back the bytes it wrote" });
    }
    if (!markerPresent) {
      problems.push({ code: "marker-missing", message: `no marker file at ${expectedMarkerPath} after the child exited` });
    } else if (markerSha256 === null) {
      const reason = markerReadError === null ? "" : `: ${markerReadError}`;
      problems.push({ code: "marker-hash", message: `the marker file at ${expectedMarkerPath} could not be hashed${reason}` });
    } else if (child.sha256 === null || child.sha256 !== markerSha256) {
      problems.push({
        code: "marker-hash",
        message: `the marker file at ${expectedMarkerPath} hashes to ${markerSha256}, but the child read back ${child.sha256 ?? "(no sha256)"}`
      });
    }
  }
  const realSettingsUnchanged = fingerprintsMatch(before, after);
  if (before.existed && before.sha256 === null) {
    const reason = before.readError === null ? "" : `: ${before.readError}`;
    problems.push({
      code: "real-settings-unreadable",
      message: `could not hash the real settings file ${realSettingsPath} before the probe${reason}`
    });
  } else if (after.existed && after.sha256 === null) {
    const reason = after.readError === null ? "" : `: ${after.readError}`;
    problems.push({
      code: "real-settings-unreadable",
      message: `could not hash the real settings file ${realSettingsPath} after the probe${reason}`
    });
  } else if (!realSettingsUnchanged) {
    problems.push({
      code: "real-settings-changed",
      message: `the real settings file ${realSettingsPath} changed while the probe ran (before: ${describeFingerprint(before)}, after: ${describeFingerprint(after)})`
    });
  }
  return ok({
    ok: problems.length === 0,
    probeRoot,
    redirectedHome,
    workdir,
    realSettings: before,
    realSettingsAfter: after,
    realSettingsUnchanged,
    expectedMarkerPath,
    markerPresent,
    markerSha256,
    child: child ?? { home: null, markerPath: null, wrote: false, readBack: false, bytes: null, sha256: null },
    reported: child !== null,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    problems: Object.freeze(problems),
    redirectEnv: Object.freeze({
      USERPROFILE: redirectedHome,
      HOME: redirectedHome,
      DSH_HOME: joinFsPath(redirectedHome, ".dsh")
    }),
    envNames: Object.freeze(Object.keys(probeEnv).sort()),
    argv: Object.freeze([env.execPath(), "-e", "<probe script>"]),
    stdout: tail3(outcome.stdout),
    stderr: tail3(outcome.stderr)
  });
}

// src/real-machine-verification/orchestration/checks/shared.ts
async function recordEvidence(store, name, value, note, warn) {
  const written = await store.recordJson(name, value, { note });
  if (!written.ok) {
    warn(`could not record evidence "${name}": ${written.error.message}`);
    return [];
  }
  return [{ path: written.value.path, sha256: written.value.sha256, kind: written.value.kind }];
}
function asRecord2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value;
}
function stringField(record, field) {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}
async function readJsonRecord(fs, path) {
  const raw = await fs.readJson(path);
  if (!raw.ok) return raw;
  const record = asRecord2(raw.value);
  if (record === null) {
    return {
      ok: false,
      error: {
        code: "invalid-input",
        message: `${path} is not a JSON object`,
        hint: "the file is corrupt; reinstall or regenerate it"
      }
    };
  }
  return { ok: true, value: record };
}

// src/real-machine-verification/orchestration/checks/isolation-home.ts
var MISSING_SETTINGS_DIR_DETAIL = "the verification declaration does not set profile.pluginSettingsDir, so there is no plugin settings directory to prove isolated";
var MISSING_SETTINGS_DIR_HINT = "add pluginSettingsDir (the single directory name under <userprofile>/.dsh/) to verify/profile.ts and rerun; the probe will not claim isolation without it";
var HOME_PROBLEM_CODES = /* @__PURE__ */ new Set([
  "probe-exit",
  "probe-output",
  "child-home"
]);
function hintFor(problems, result) {
  if (problems.some((problem2) => problem2.code === "child-home")) {
    return "the redirect did not reach the child: pass USERPROFILE and HOME in the child environment (the runtime sets them from the probe root) and have the child resolve its home through the platform API";
  }
  if (problems.some((problem2) => problem2.code === "probe-output")) {
    return "the child must print exactly one JSON line as the last line of stdout; inspect the recorded stderr and rerun the probe command by hand under " + result.probeRoot;
  }
  return "run the probe command by hand under " + result.probeRoot + "; check the node executable path and the allowlisted child environment";
}
function createIsolationHomeCheck() {
  return {
    id: checkId2("isolation-home"),
    title: "a child process resolves its home inside the redirected directory",
    hard: true,
    requires: ["command"],
    onMissing: "blocked",
    missingHint: "inject a CommandPort (runtime/platform/defaults.ts creates the Node one) so the probe can start a real child process",
    async run(context) {
      if (context.pluginSettingsDir === null) {
        return blocked(MISSING_SETTINGS_DIR_DETAIL, MISSING_SETTINGS_DIR_HINT);
      }
      const probed = await context.probe();
      if (!probed.ok) {
        return blocked(
          `the isolation probe could not run: ${formatFailure(probed.error)}`,
          probed.error.hint ?? "make sure the node executable and the work root are usable, then rerun"
        );
      }
      const result = probed.value;
      const problems = result.problems.filter((problem2) => HOME_PROBLEM_CODES.has(problem2.code));
      const evidence = await recordEvidence(
        context.evidence,
        "isolation-home",
        {
          probeRoot: result.probeRoot,
          redirectedHome: result.redirectedHome,
          workdir: result.workdir,
          redirectEnv: result.redirectEnv,
          envNames: result.envNames,
          argv: result.argv,
          exitCode: result.exitCode,
          timedOut: result.timedOut,
          child: result.child,
          problems: result.problems.map((problem2) => ({ code: problem2.code, message: problem2.message })),
          stdout: result.stdout,
          stderr: result.stderr
        },
        "the child-process home probe",
        context.note
      );
      if (problems.length > 0) {
        const actualHome = result.child.home ?? "(not reported)";
        const actualExit = result.exitCode === null ? "(none)" : String(result.exitCode);
        return failed(
          problems.map((problem2) => problem2.message).join("; "),
          `child home: ${result.redirectedHome}; exit code: 0`,
          `child home: ${actualHome}; exit code: ${actualExit}`,
          hintFor(problems, result),
          evidence
        );
      }
      return passed(
        `the child resolved its home to ${result.redirectedHome} and wrote its marker under it`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/settings-isolated.ts
var SETTINGS_PROBLEM_CODES = /* @__PURE__ */ new Set([
  "marker-write",
  "marker-readback",
  "marker-missing",
  "marker-hash",
  "real-settings-changed",
  "real-settings-unreadable"
]);
function describeFingerprint2(value) {
  if (!value.existed) return "absent";
  return value.sha256 === null ? "existed, unreadable" : `existed sha256 ${value.sha256}`;
}
function hintFor2(problems) {
  if (problems.some((problem2) => problem2.code === "real-settings-changed")) {
    return "the real settings file changed while the probe ran; do not launch the plugin again until it is restored, and follow the four-step fallback plan printed with this report";
  }
  return "check that the redirected home is writable and that the child's settings path is <userprofile>/.dsh/<pluginSettingsDir>/settings.yaml; inspect the recorded settings-isolated evidence";
}
function passDetail(result) {
  if (!result.realSettings.existed) {
    return `the real settings file ${result.realSettings.path} did not exist before or after (existed=false); the marker was written and reread under ${result.redirectedHome}`;
  }
  return `the real settings file ${result.realSettings.path} kept sha256 ${result.realSettings.sha256 ?? "(unreadable)"}`;
}
function createSettingsIsolatedCheck() {
  return {
    id: checkId2("settings-isolated"),
    title: "the plugin's real settings file stays byte-identical",
    hard: true,
    requires: ["command"],
    onMissing: "blocked",
    missingHint: "inject a CommandPort (runtime/platform/defaults.ts creates the Node one) so the probe can start a real child process",
    async run(context) {
      if (context.pluginSettingsDir === null) {
        return blocked(MISSING_SETTINGS_DIR_DETAIL, MISSING_SETTINGS_DIR_HINT);
      }
      const probed = await context.probe();
      if (!probed.ok) {
        return blocked(
          `the isolation probe could not run: ${probed.error.message}`,
          probed.error.hint ?? "make sure the node executable and the work root are usable, then rerun"
        );
      }
      const result = probed.value;
      const problems = result.problems.filter((problem2) => SETTINGS_PROBLEM_CODES.has(problem2.code));
      const evidence = await recordEvidence(
        context.evidence,
        "settings-isolated",
        {
          realSettings: {
            path: result.realSettings.path,
            existedBefore: result.realSettings.existed,
            existedAfter: result.realSettingsAfter.existed,
            sha256Before: result.realSettings.sha256,
            sha256After: result.realSettingsAfter.sha256,
            unchanged: result.realSettingsUnchanged
          },
          marker: {
            expectedPath: result.expectedMarkerPath,
            reportedPath: result.child.markerPath,
            present: result.markerPresent,
            sha256: result.markerSha256,
            childSha256: result.child.sha256,
            bytes: result.child.bytes
          },
          child: {
            home: result.child.home,
            wrote: result.child.wrote,
            readBack: result.child.readBack
          },
          problems: result.problems.map((problem2) => ({ code: problem2.code, message: problem2.message }))
        },
        "the real settings file fingerprint and the redirected marker",
        context.note
      );
      if (!result.reported) {
        const detail = result.problems.length === 0 ? "the probe child did not print a parsable result" : result.problems.map((problem2) => problem2.message).join("; ");
        return blocked(
          `the probe child did not report its write/read result, so settings isolation could not be observed: ${detail}`,
          "run the probe command by hand and inspect stdout; the isolation-home check in this report explains why the child failed",
          evidence
        );
      }
      if (problems.length > 0) {
        const onlyUnreadable = problems.every((problem2) => problem2.code === "real-settings-unreadable");
        if (onlyUnreadable) {
          return blocked(
            problems.map((problem2) => problem2.message).join("; "),
            "make the real settings file readable (check its permissions and the current user) and rerun; the probe will not claim pass without comparing hashes",
            evidence
          );
        }
        const expectedReal = result.realSettings.existed ? `real settings: ${result.realSettings.path} keeps sha256 ${result.realSettings.sha256 ?? "(unreadable)"}` : `real settings: ${result.realSettings.path} stays absent (existed=false)`;
        return failed(
          problems.map((problem2) => problem2.message).join("; "),
          `marker: ${result.expectedMarkerPath} exists with the child's read-back sha256; ${expectedReal}`,
          `marker present: ${String(result.markerPresent)}; child wrote: ${String(result.child.wrote)}, read back: ${String(result.child.readBack)}; real settings before: ${describeFingerprint2(result.realSettings)}; after: ${describeFingerprint2(result.realSettingsAfter)}`,
          hintFor2(problems),
          evidence
        );
      }
      return passed(passDetail(result), evidence);
    }
  };
}

// src/real-machine-verification/cli/commands/isolation.ts
var ISOLATION_COMMAND = "isolation";
var ISOLATION_USAGE = "dsh-verify isolation [--profile <p>] [--work-root <dir>] [--json] [--dry-run]";
var ISOLATION_FLAGS = /* @__PURE__ */ new Set(["--json", "--dry-run", "--profile", "--declaration", "--work-root"]);
var FALLBACK_PLAN = [
  "fallback plan (printed only; dsh-verify executed none of these steps):",
  "  1. back up the real settings file and record its sha256 and mtime before touching anything",
  "  2. take a global mutex on the plugin settings directory so no other process writes while you repair",
  "  3. restore the file from the backup and confirm its sha256 matches the recorded hash",
  "  4. release the mutex, then rerun `dsh-verify isolation` before any other launch"
];
function failureJson5(command, stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject3(args, io, command, stage, message) {
  io.stderr(`dsh-verify ${command}: ${message}
`);
  if (args.json) io.stdout(failureJson5(command, stage, { code: "invalid-input", message }));
  return EXIT_CODES.blocked;
}
function declarationChecks(failure2, durationMs) {
  const status = failure2.kind === "failed" ? "fail" : "blocked";
  const hint = failure2.hint ?? "fix verify/profile.ts and rerun `dsh-verify isolation`";
  const make = (id, title) => ({
    id: checkId2(id),
    title,
    hard: true,
    status,
    detail: failure2.message,
    ...status === "fail" ? { expected: "a loadable, valid verification declaration", actual: failure2.message } : {},
    hint,
    evidence: [],
    durationMs
  });
  return [
    make("isolation-home", "a child process resolves its home inside the redirected directory"),
    make("settings-isolated", "the plugin's real settings file stays byte-identical")
  ];
}
async function runIsolationDryRun(args, deps, cwd, workRoot, startedAt) {
  const { ports, io } = deps;
  const { fs, env } = ports;
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    io.stderr(`dsh-verify isolation: ${formatFailure(loaded.error.failure)}
`);
    if (args.json) io.stdout(failureJson5(ISOLATION_COMMAND, loaded.error.stage, loaded.error.failure));
    return EXIT_CODES.blocked;
  }
  const plannedRun = await planRunDirectory({ fs, workRoot, command: ISOLATION_COMMAND, startedAt });
  if (!plannedRun.ok) {
    io.stderr(`dsh-verify isolation: ${formatFailure(plannedRun.error)}
`);
    if (args.json) io.stdout(failureJson5(ISOLATION_COMMAND, "run-directory", plannedRun.error));
    return EXIT_CODES.blocked;
  }
  const { profile, profileName, profileDir, dshHome } = loaded.value;
  const run = plannedRun.value;
  const realHome = env.homeDir();
  const pluginSettingsDir = profile.pluginSettingsDir ?? null;
  const probePaths = isolationProbePaths(workRoot, run.runId);
  const realSettingsPath = pluginSettingsDir === null ? null : realSettingsFilePath(realHome, pluginSettingsDir);
  const probe = pluginSettingsDir === null ? null : planSettingsIsolation({
    env,
    pluginSettingsDir,
    realHome,
    redirectedHome: probePaths.redirectedHome,
    workdir: probePaths.workdir
  });
  const checks = [createIsolationHomeCheck(), createSettingsIsolatedCheck()];
  const checkJson = checks.map((check) => ({
    id: check.id,
    title: check.title,
    hard: check.hard,
    requires: check.requires,
    onMissing: check.onMissing
  }));
  if (args.json) {
    io.stdout(
      `${JSON.stringify({
        schemaVersion: 1,
        command: ISOLATION_COMMAND,
        ok: true,
        dryRun: true,
        plan: {
          workRoot,
          runId: run.runId,
          runDir: run.runDir,
          evidenceDir: run.evidenceDir,
          profile: profileName,
          profileDir,
          dshHome,
          realHome,
          pluginSettingsDir,
          realSettingsPath,
          probeRoot: probePaths.probeRoot,
          redirectedHome: probePaths.redirectedHome,
          workdir: probePaths.workdir,
          probe: probe === null ? null : {
            argv: probe.argv,
            cwd: probe.cwd,
            env: probe.env,
            envNames: probe.envNames,
            timeoutMs: probe.timeoutMs,
            markerPath: probe.markerPath
          },
          checks: checkJson,
          note: probe === null ? "the profile declares no pluginSettingsDir; both checks would be blocked before spawning" : null
        }
      })}
`
    );
  } else {
    const lines = [];
    lines.push("isolation plan (dry run) \u2014 nothing was written and no child was started");
    lines.push(`profile: ${profileName} (${profileDir})`);
    lines.push(`dsh home: ${dshHome}`);
    lines.push(`real home: ${realHome}`);
    lines.push(`plugin settings dir: ${pluginSettingsDir ?? "(not declared)"}`);
    lines.push(`real settings: ${realSettingsPath ?? "(not declared)"}`);
    lines.push(`run dir: ${run.runDir}`);
    lines.push(`probe root: ${probePaths.probeRoot}`);
    lines.push(`redirected home: ${probePaths.redirectedHome}`);
    lines.push(`workdir: ${probePaths.workdir}`);
    if (probe === null) {
      lines.push("probe: none (both checks would be blocked before spawning)");
    } else {
      lines.push(`probe argv: ${probe.argv.join(" ")}`);
      lines.push(`probe cwd: ${probe.cwd}`);
      lines.push(`probe env: ${probe.envNames.join(", ")}`);
      lines.push(`probe timeout: ${String(probe.timeoutMs)}ms`);
      lines.push(`marker: ${probe.markerPath}`);
    }
    lines.push(`checks: ${checkJson.length}`);
    for (const check of checkJson) lines.push(`  - ${check.id} (${check.hard ? "hard" : "soft"}): ${check.title}`);
    lines.push("dry run: nothing was written");
    io.stdout(`${lines.join("\n")}
`);
  }
  return EXIT_CODES.ok;
}
async function runIsolationCommand(args, deps) {
  const { ports, io } = deps;
  const { clock, env, fs } = ports;
  const problems = flagProblems(args, ISOLATION_FLAGS);
  if (problems.length > 0) {
    return reject3(args, io, ISOLATION_COMMAND, "usage", `${problems.join("; ")}
${ISOLATION_USAGE}`);
  }
  const cwd = env.cwd();
  const startedMs = clock.nowMs();
  const startedAt = clock.iso(startedMs);
  const workRoot = resolveWorkRoot(cwd, args.workRoot);
  if (args.dryRun) return runIsolationDryRun(args, deps, cwd, workRoot, startedAt);
  const prepared = await prepareRunDirectory({ fs, workRoot, command: ISOLATION_COMMAND, startedAt });
  if (!prepared.ok) {
    io.stderr(`dsh-verify: could not create the run directory under ${workRoot}: ${formatFailure(prepared.error)}
`);
    if (args.json) io.stdout(failureJson5(ISOLATION_COMMAND, "run-directory", prepared.error));
    return EXIT_CODES.blocked;
  }
  const { runId, runDir, evidenceDir } = prepared.value;
  const evidence = createEvidenceStore({ fs, root: evidenceDir, clock });
  async function finishAndEmit3(report2, fallback) {
    const written = await writeRunReport({ fs, runDir, report: report2 });
    if (!written.ok) {
      io.stderr(`dsh-verify: could not write the run report: ${formatFailure(written.error)}
`);
      if (args.json) io.stdout(failureJson5(ISOLATION_COMMAND, "report", written.error));
      return EXIT_CODES.blocked;
    }
    const finalReport = withReportDigest(report2, written.value);
    const tail4 = {
      reportPath: written.value.reportPath,
      reportSha256: written.value.reportSha256,
      evidenceDir,
      evidenceCount: evidence.items().length
    };
    const humanLines = [renderSelfCheckHuman(finalReport, tail4)];
    if (fallback) humanLines.push("", ...FALLBACK_PLAN);
    const human = humanLines.join("\n");
    if (args.json) {
      io.stdout(`${runReportJson(finalReport)}
`);
      io.stderr(`${human}
`);
      io.stderr(`${verdictLine(finalReport)}
`);
    } else {
      io.stdout(`${human}
`);
    }
    return exitCodeOfRun(finalReport);
  }
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    const contextFailure = loaded.error;
    if (contextFailure.stage === "profile") {
      const profileFailure2 = contextFailure.failure;
      io.stderr(`dsh-verify isolation: ${formatFailure(profileFailure2)}
`);
      if (args.json) io.stdout(failureJson5(ISOLATION_COMMAND, "profile", profileFailure2));
      return EXIT_CODES.blocked;
    }
    const failure2 = contextFailure.failure;
    const recorded = await evidence.recordJson(
      "declaration-failure",
      {
        kind: failure2.kind,
        code: failure2.code,
        message: failure2.message,
        hint: failure2.hint ?? null,
        requestedPath: args.declaration ?? null,
        cwd
      },
      { note: "why the verification declaration could not be loaded" }
    );
    const refs = recorded.ok ? [{ path: recorded.value.path, sha256: recorded.value.sha256, kind: recorded.value.kind }] : [];
    const checks = declarationChecks(failure2, Math.max(0, clock.nowMs() - startedMs)).map((check) => ({
      ...check,
      evidence: refs
    }));
    const report2 = finishRunReport(
      createRunReport({
        command: ISOLATION_COMMAND,
        profile: args.profile ?? "(declaration not loaded)",
        startedAt,
        notes: [`work root: ${workRoot}`]
      }),
      {
        checks,
        steps: [],
        finishedAt: clock.iso(),
        artifacts: { report: joinFsPath(runDir, "run.json"), evidence: evidenceDir },
        notes: [`declaration: ${failure2.message}`]
      }
    );
    return finishAndEmit3(report2, false);
  }
  const { profile, profileName } = loaded.value;
  const realHome = env.homeDir();
  const pluginSettingsDir = profile.pluginSettingsDir ?? null;
  const probePaths = isolationProbePaths(workRoot, runId);
  const realSettingsPath = pluginSettingsDir === null ? null : realSettingsFilePath(realHome, pluginSettingsDir);
  let probePromise = null;
  let probeRan = false;
  const probe = () => {
    if (pluginSettingsDir === null) {
      return Promise.resolve(err(failure("prerequisite", MISSING_SETTINGS_DIR_DETAIL, MISSING_SETTINGS_DIR_HINT)));
    }
    if (probePromise === null) {
      probeRan = true;
      probePromise = probeSettingsIsolation({
        ports,
        probeRoot: probePaths.probeRoot,
        pluginSettingsDir,
        realHome,
        redirectedHome: probePaths.redirectedHome,
        workdir: probePaths.workdir
      });
    }
    return probePromise;
  };
  const note = (message) => {
    if (args.json) io.stderr(`dsh-verify: ${message}
`);
  };
  const context = {
    probeRoot: probePaths.probeRoot,
    redirectedHome: probePaths.redirectedHome,
    workdir: probePaths.workdir,
    pluginSettingsDir,
    evidence,
    note,
    probe
  };
  const plan = {
    command: ISOLATION_COMMAND,
    checks: [createIsolationHomeCheck(), createSettingsIsolatedCheck()]
  };
  const outcome = await executePlan(plan, context, { ports, clock, note });
  const fallbackNeeded = probeRan && outcome.results.some((check) => check.status === "fail");
  const report = finishRunReport(
    createRunReport({
      command: ISOLATION_COMMAND,
      profile: profileName,
      startedAt,
      notes: [`work root: ${workRoot}`]
    }),
    {
      checks: outcome.results,
      steps: outcome.steps,
      finishedAt: clock.iso(),
      artifacts: { report: joinFsPath(runDir, "run.json"), evidence: evidenceDir },
      notes: [
        `probe root: ${probePaths.probeRoot}`,
        `redirected home: ${probePaths.redirectedHome}`,
        `real settings: ${realSettingsPath ?? "(pluginSettingsDir not declared)"}`,
        `real user profile: ${realHome}`,
        ...fallbackNeeded ? FALLBACK_PLAN : []
      ]
    }
  );
  return finishAndEmit3(report, fallbackNeeded);
}

// src/real-machine-verification/cli/commands/launch.ts
var LAUNCH_USAGE = "dsh-verify launch [--profile <p>] [--keep] [--port <n>] [--dry-run] [--json]";
var LAUNCH_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--profile",
  "--declaration",
  "--work-root",
  "--port",
  "--keep",
  "--dry-run"
]);
var DEFAULT_PORT2 = 0;
function parsePort(raw) {
  if (raw === void 0) return { port: DEFAULT_PORT2 };
  if (!/^[0-9]+$/.test(raw)) return { problem: `--port needs an integer between 0 and 65535, got "${raw}"` };
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    return { problem: `--port needs an integer between 0 and 65535, got "${raw}"` };
  }
  return { port };
}
function renderModel(model) {
  if (model === null) return "none (profile.model is false)";
  const credential = model.credentialAvailable ? `credential ${model.credentialSource}` : `credential missing (${model.apiKeyEnv} was not found)`;
  return `${model.provider}/${model.model} \u2014 ${credential}`;
}
function renderDryRun2(plan, projection) {
  const lines = [];
  lines.push("launch plan (dry run) \u2014 nothing was written and no process was started");
  lines.push(`instance id: ${plan.instanceId}`);
  lines.push(`profile: ${plan.profileName}`);
  lines.push(`instance dir: ${plan.layout.dir}`);
  lines.push(`home: ${plan.layout.home}`);
  lines.push(`userprofile: ${plan.layout.userprofile}`);
  lines.push(`workdir: ${plan.layout.workdir}`);
  lines.push(`argv: ${projection.argv.join(" ")}`);
  lines.push(`injected env: ${projection.envNames.length === 0 ? "(none)" : projection.envNames.join(", ")}`);
  lines.push(
    `secret env (names only): ${projection.secretEnvNames.length === 0 ? "(none)" : projection.secretEnvNames.join(", ")}`
  );
  lines.push(`stdout log: ${projection.logFiles.stdout}`);
  lines.push(`stderr log: ${projection.logFiles.stderr}`);
  lines.push(`plugin log dir: ${projection.logFiles.pluginLogDir ?? "(none)"}`);
  lines.push(`profile copy: ${projection.profileCopy.sourceProfileDir} -> ${projection.profileCopy.targetProfileDir}`);
  lines.push(`model: ${renderModel(projection.model)}`);
  lines.push("notes:");
  for (const note of projection.notes) lines.push(`  - ${note}`);
  return lines.join("\n") + "\n";
}
function renderLaunched(record, readiness, instancePath, workRoot) {
  const lines = [];
  lines.push(`instance ${record.instanceId ?? "(no id)"} is ready`);
  lines.push(`pid: ${record.pid}`);
  lines.push(`port: ${record.port}`);
  lines.push(
    `readyMs: ${record.readyMs} (connect HTTP ${readiness.connectStatus}, ${readiness.inventory.activeCount}/${readiness.inventory.enabledCount} enabled entries active)`
  );
  lines.push(`home: ${record.home}`);
  lines.push(`workdir: ${record.startCwd}`);
  lines.push(`stdout log: ${record.stdoutPath}`);
  lines.push(`stderr log: ${record.stderrPath}`);
  lines.push(`model: ${renderModel(record.model)}`);
  lines.push(`instance: ${instancePath}`);
  lines.push(`stop: dsh-verify stop --id ${record.instanceId ?? "<id>"} --work-root ${workRoot}`);
  return lines.join("\n") + "\n";
}
function failureJson6(command, stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject4(args, io, command, stage, message) {
  io.stderr(`dsh-verify ${command}: ${message}
`);
  if (args.json) io.stdout(failureJson6(command, stage, { code: "invalid-input", message }));
  return EXIT_CODES.blocked;
}
async function runLaunchCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, LAUNCH_FLAGS);
  if (problems.length > 0) return reject4(args, io, "launch", "usage", `${problems.join("; ")}
${LAUNCH_USAGE}`);
  const port = parsePort(args.port);
  if ("problem" in port) return reject4(args, io, "launch", "usage", port.problem);
  const cwd = ports.env.cwd();
  const context = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!context.ok) {
    const stage = context.error.stage;
    const failure2 = context.error.failure;
    io.stderr(`dsh-verify launch: ${formatFailure(failure2)}
`);
    if (args.json) io.stdout(failureJson6("launch", stage, failure2));
    return EXIT_CODES.blocked;
  }
  const runtime = await discoverDsh({ fs: ports.fs, env: ports.env });
  if (!runtime.ok) {
    io.stderr(`dsh-verify launch: ${formatFailure(runtime.error)}
`);
    if (args.json) io.stdout(failureJson6("launch", "runtime", runtime.error));
    return EXIT_CODES.blocked;
  }
  const runtimePaths = { exe: runtime.value.exe, cliJs: hostCliPath(runtime.value) };
  const planned = await planInstance({
    ports,
    runtime: runtimePaths,
    dshHome: context.value.dshHome,
    profileName: context.value.profileName,
    profile: context.value.profile,
    profileDir: context.value.profileDir,
    workRoot: context.value.workRoot,
    port: port.port,
    keep: args.keep,
    startedAtMs: ports.clock.nowMs()
  });
  if (!planned.ok) {
    const failure2 = planned.error;
    io.stderr(`dsh-verify launch: ${formatFailure(failure2)}
`);
    if (args.json) io.stdout(failureJson6("launch", failure2.stage, failure2));
    return failure2.stage === "prerequisite" ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
  }
  const plan = planned.value;
  if (args.dryRun) {
    const projection2 = projectInstancePlan(plan);
    if (args.json) io.stdout(`${JSON.stringify({ schemaVersion: 1, command: "launch", ok: true, dryRun: true, plan: projection2 })}
`);
    else io.stdout(renderDryRun2(plan, projection2));
    if (plan.modelNote !== null) io.stderr(`dsh-verify launch: warning: ${plan.modelNote}
`);
    return EXIT_CODES.ok;
  }
  if (plan.modelNote !== null) io.stderr(`dsh-verify launch: warning: ${plan.modelNote}
`);
  const note = (message) => {
    io.stderr(`dsh-verify launch: ${message}
`);
  };
  const executed = await executeInstance({ ports, plan, runtime: runtimePaths, note });
  if (!executed.ok) {
    const failure2 = executed.error;
    io.stderr(`dsh-verify launch: ${formatFailure(failure2)} (stage: ${failure2.stage})
`);
    if (args.json) io.stdout(failureJson6("launch", failure2.stage, failure2));
    return failure2.stage === "not-ready" ? EXIT_CODES.hardFailure : EXIT_CODES.blocked;
  }
  const { record, readiness, plan: projection } = executed.value;
  const instancePath = joinFsPath(instanceDirectory(record), "instance.json");
  if (args.json) {
    io.stdout(
      `${JSON.stringify({ schemaVersion: 1, command: "launch", ok: true, instance: record, readiness, plan: projection })}
`
    );
  } else {
    io.stdout(renderLaunched(record, readiness, instancePath, context.value.workRoot));
  }
  return EXIT_CODES.ok;
}

// src/real-machine-verification/contracts/profile-rules.ts
var ENTRY_START_RE = /^-\s/;
var ENTRY_ID_RE = /^\s*-?\s*id:\s*(.*?)\s*$/;
function scanPatch(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = text.endsWith(eol);
  const body = trailingNewline ? text.slice(0, -eol.length) : text;
  const lines = body.length === 0 ? [] : body.split(eol);
  const entries = [];
  let open2 = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (ENTRY_START_RE.test(line)) {
      if (open2 !== null) entries.push({ id: open2.id, startLine: open2.startLine, endLine: index });
      const idMatch = ENTRY_ID_RE.exec(line);
      const id = idMatch === null ? "" : unquoteScalar(idMatch[1]);
      open2 = { id, startLine: index };
    }
  }
  if (open2 !== null) entries.push({ id: open2.id, startLine: open2.startLine, endLine: lines.length });
  return { lines, entries, eol, trailingNewline };
}
function unquoteScalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, "").trim();
  return withoutComment.replace(/^(['"])(.*)\1$/, "$2").trim();
}
function indentOf(line) {
  const match = /^(\s*)/.exec(line);
  return match === null ? 0 : match[1].length;
}
function isBlankOrComment(line) {
  const trimmed = line.trim();
  return trimmed.length === 0 || trimmed.startsWith("#");
}
function findEntry(scan, id) {
  for (const entry of scan.entries) {
    if (entry.id === id) return entry;
  }
  return null;
}
function findScalar(lines, start, end, key) {
  const re = new RegExp(`^(\\s*)(?:-\\s+)?${escapeRegExp(key)}:\\s*(.*)$`);
  for (let index = start; index < end; index += 1) {
    const match = re.exec(lines[index]);
    if (match === null) continue;
    const value = unquoteScalar(match[2]);
    if (value.length === 0) continue;
    return { line: index, indent: match[1].length, value };
  }
  return null;
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function findBlock(lines, start, end, key) {
  const re = new RegExp(`^(\\s*)${escapeRegExp(key)}:\\s*(?:#.*)?$`);
  for (let index = start; index < end; index += 1) {
    const match = re.exec(lines[index]);
    if (match !== null) return { line: index, indent: match[1].length };
  }
  return null;
}
function blockEnd(lines, line, indent) {
  for (let index = line + 1; index < lines.length; index += 1) {
    if (isBlankOrComment(lines[index])) continue;
    if (indentOf(lines[index]) <= indent) return index;
  }
  return lines.length;
}
function inspectModelConfig(text, selection) {
  const scan = scanPatch(text);
  const problems = [];
  const defaultEntry = findEntry(scan, "agent-default-model");
  const providerEntry = findEntry(scan, "llm-pi-ai");
  let defaultProvider = null;
  let defaultModel = null;
  if (defaultEntry === null) {
    problems.push({
      code: "missing-default-model-entry",
      message: "profile has no agent-default-model entry",
      hint: "the profile cannot name a default model; install or repair the profile first",
      expected: "agent-default-model entry",
      actual: "absent",
      entryId: "agent-default-model"
    });
  } else {
    const provider = findScalar(scan.lines, defaultEntry.startLine, defaultEntry.endLine, "provider");
    const model = findScalar(scan.lines, defaultEntry.startLine, defaultEntry.endLine, "model");
    defaultProvider = provider?.value ?? null;
    defaultModel = model?.value ?? null;
    if (defaultProvider !== selection.provider) {
      problems.push({
        code: "provider-mismatch",
        message: `default provider is ${JSON.stringify(defaultProvider)}, expected ${JSON.stringify(selection.provider)}`,
        expected: selection.provider,
        actual: defaultProvider ?? "(missing)",
        entryId: "agent-default-model"
      });
    }
    if (defaultModel !== selection.model) {
      problems.push({
        code: "model-mismatch",
        message: `default model is ${JSON.stringify(defaultModel)}, expected ${JSON.stringify(selection.model)}`,
        hint: "model ids are compared verbatim; a near-miss id is a different model to the host",
        expected: selection.model,
        actual: defaultModel ?? "(missing)",
        entryId: "agent-default-model"
      });
    }
  }
  let apiKeyEnv = null;
  let declaredModels = [];
  if (providerEntry === null) {
    problems.push({
      code: "missing-provider-entry",
      message: "profile has no llm-pi-ai entry",
      hint: "enable the pi-ai provider in this profile before verifying a model",
      expected: "llm-pi-ai entry",
      actual: "absent",
      entryId: "llm-pi-ai"
    });
  } else {
    const providers = findBlock(scan.lines, providerEntry.startLine, providerEntry.endLine, "providers");
    if (providers !== null) {
      const providersEnd = Math.min(blockEnd(scan.lines, providers.line, providers.indent), providerEntry.endLine);
      const providerKey = findBlock(scan.lines, providers.line + 1, providersEnd, selection.provider);
      if (providerKey === null) {
        problems.push({
          code: "provider-mismatch",
          message: `llm-pi-ai declares no provider ${JSON.stringify(selection.provider)}`,
          expected: selection.provider,
          actual: "(no such provider block)",
          entryId: "llm-pi-ai"
        });
      } else {
        const providerEnd = Math.min(blockEnd(scan.lines, providerKey.line, providerKey.indent), providersEnd);
        const keyEnv = findScalar(scan.lines, providerKey.line + 1, providerEnd, "apiKeyEnv");
        apiKeyEnv = keyEnv?.value ?? null;
        if (apiKeyEnv !== selection.apiKeyEnv) {
          problems.push({
            code: "api-key-env-mismatch",
            message: `provider ${selection.provider} reads its key from ${JSON.stringify(apiKeyEnv)}, expected ${JSON.stringify(selection.apiKeyEnv)}`,
            expected: selection.apiKeyEnv,
            actual: apiKeyEnv ?? "(missing)",
            entryId: "llm-pi-ai"
          });
        }
        const models = findBlock(scan.lines, providerKey.line + 1, providerEnd, "models");
        if (models === null) {
          problems.push({
            code: "models-empty",
            message: `provider ${selection.provider} declares no models list`,
            expected: `a models list declaring ${selection.model}`,
            actual: "no models list",
            entryId: "llm-pi-ai"
          });
        } else {
          const modelsEnd = Math.min(blockEnd(scan.lines, models.line, models.indent), providerEnd);
          const ids = [];
          for (let index = models.line + 1; index < modelsEnd; index += 1) {
            const match = /^\s*-\s+id:\s*(.*?)\s*$/.exec(scan.lines[index]);
            if (match !== null) ids.push(unquoteScalar(match[1]));
          }
          declaredModels = ids;
          if (ids.length === 0) {
            problems.push({
              code: "models-empty",
              message: `provider ${selection.provider} declares an empty models list`,
              expected: `a models list declaring ${selection.model}`,
              actual: "empty models list",
              entryId: "llm-pi-ai"
            });
          } else if (!ids.includes(selection.model)) {
            problems.push({
              code: "model-not-declared",
              message: `provider ${selection.provider} does not declare model ${JSON.stringify(selection.model)}`,
              hint: "a model id that is referenced elsewhere but not declared here fails at request time, not at boot",
              expected: selection.model,
              actual: ids.join(", "),
              entryId: "llm-pi-ai"
            });
          }
        }
      }
    } else {
      problems.push({
        code: "provider-mismatch",
        message: "llm-pi-ai entry has no providers block",
        expected: selection.provider,
        actual: "(no providers block)",
        entryId: "llm-pi-ai"
      });
    }
  }
  const references = [];
  for (const entry of scan.entries) {
    if (entry.id === "agent-default-model" || entry.id === "llm-pi-ai") continue;
    for (const item of collectReferenceItems(scan.lines, entry)) {
      references.push({ entryId: item.entryId, provider: item.provider, model: item.model });
      if (item.provider === selection.provider && item.model !== null && item.model !== selection.model) {
        problems.push({
          code: "reference-model-mismatch",
          message: `${entry.id} references provider ${JSON.stringify(item.provider)} with model ${JSON.stringify(item.model)}, expected ${JSON.stringify(selection.model)}`,
          hint: "reference parties must use the declared model id verbatim; a near-miss id is a different model at request time",
          expected: selection.model,
          actual: item.model,
          entryId: entry.id
        });
      }
    }
  }
  return {
    configured: problems.length === 0,
    defaultProvider,
    defaultModel,
    apiKeyEnv,
    declaredModels: Object.freeze(declaredModels),
    references: Object.freeze(references),
    problems: Object.freeze(problems)
  };
}
function collectReferenceItems(lines, entry) {
  const found = [];
  const itemRe = /^(\s*)-\s+provider:\s*(.*?)\s*$/;
  for (let index = entry.startLine; index < entry.endLine; index += 1) {
    const match = itemRe.exec(lines[index]);
    if (match === null) continue;
    const itemIndent = match[1].length;
    let itemEnd = index + 1;
    for (; itemEnd < entry.endLine; itemEnd += 1) {
      if (isBlankOrComment(lines[itemEnd])) continue;
      if (indentOf(lines[itemEnd]) <= itemIndent) break;
    }
    const model = findScalar(lines, index + 1, itemEnd, "model");
    found.push({
      entryId: entry.id,
      provider: unquoteScalar(match[2]),
      modelLine: model?.line ?? null,
      model: model?.value ?? null
    });
    index = itemEnd - 1;
  }
  return found;
}
function planModelConfigEdit(text, selection) {
  const scan = scanPatch(text);
  const before = inspectModelConfig(text, selection);
  if (before.configured) return ok({ text, changed: false, notes: [] });
  const defaultEntry = findEntry(scan, "agent-default-model");
  if (defaultEntry === null) {
    return err({
      code: "prerequisite",
      message: "cannot configure the model: profile has no agent-default-model entry",
      hint: "this tool only edits an existing entry; open the profile once in the desktop app so DSH writes it"
    });
  }
  const providerEntry = findEntry(scan, "llm-pi-ai");
  if (providerEntry === null) {
    return err({
      code: "prerequisite",
      message: "cannot configure the model: profile has no llm-pi-ai entry",
      hint: "enable the pi-ai provider in this profile first"
    });
  }
  let lines = [...scan.lines];
  const notes = [];
  const entry = findEntry(scanPatch(lines.join(scan.eol)), "agent-default-model");
  lines = setScalar(lines, entry, "provider", selection.provider, notes);
  const refreshed = findEntry(scanPatch(lines.join(scan.eol)), "agent-default-model");
  lines = setScalar(lines, refreshed, "model", selection.model, notes);
  const refreshedAgain = findEntry(scanPatch(lines.join(scan.eol)), "agent-default-model");
  const reasoning = findScalar(lines, refreshedAgain.startLine, refreshedAgain.endLine, "reasoningEffort");
  if (reasoning !== null) {
    lines.splice(reasoning.line, 1);
    notes.push("removed agent-default-model.reasoningEffort: it is provider-specific and can make the request shape invalid");
  }
  lines = ensureProviderEntry(lines, selection, notes);
  lines = alignReferenceModels(lines, selection, notes);
  const nextText = lines.join(scan.eol) + (scan.trailingNewline ? scan.eol : "");
  const after = inspectModelConfig(nextText, selection);
  if (!after.configured) {
    return err({
      code: "internal",
      message: "model configuration edit did not converge; the profile file needs manual review",
      hint: after.problems.map((item) => item.message).join("; ")
    });
  }
  return ok({ text: nextText, changed: true, notes: Object.freeze(notes) });
}
function setScalar(lines, entry, key, value, notes) {
  const next = [...lines];
  const existing = findScalar(next, entry.startLine, entry.endLine, key);
  const rendered = `${key}: ${renderScalar(value)}`;
  if (existing !== null) {
    const indent = " ".repeat(existing.indent);
    next[existing.line] = `${indent}${rendered}`;
    notes.push(`set ${key} to ${value}`);
    return next;
  }
  const insertion = insertionPointForScalar(next, entry);
  next.splice(insertion.at, 0, `${" ".repeat(insertion.indent)}${rendered}`);
  notes.push(`added ${key}: ${value}`);
  return next;
}
function insertionPointForScalar(lines, entry) {
  for (let index = entry.startLine; index < entry.endLine; index += 1) {
    const match = /^(\s*)config:\s*(?:#.*)?$/.exec(lines[index]);
    if (match !== null) return { at: index + 1, indent: match[1].length + 2 };
  }
  const idIndent = indentOf(lines[entry.startLine]);
  return { at: entry.startLine + 1, indent: idIndent + 2 };
}
function ensureProviderEntry(initial, selection, notes) {
  const lines = [...initial];
  const modelsFields = modelItemLines(selection);
  const locate = () => {
    const entry = findEntry(scanPatch(lines.join("\n")), "llm-pi-ai");
    if (entry === null) return null;
    const providers = findBlock(lines, entry.startLine, entry.endLine, "providers");
    if (providers === null) {
      return { entry, providers: null, providersEnd: 0, provider: null, providerEnd: 0, models: null };
    }
    const providersEnd = Math.min(blockEnd(lines, providers.line, providers.indent), entry.endLine);
    const provider = findBlock(lines, providers.line + 1, providersEnd, selection.provider);
    if (provider === null) return { entry, providers, providersEnd, provider: null, providerEnd: 0, models: null };
    const providerEnd = Math.min(blockEnd(lines, provider.line, provider.indent), providersEnd);
    const models = findBlock(lines, provider.line + 1, providerEnd, "models");
    return { entry, providers, providersEnd, provider, providerEnd, models };
  };
  let state = locate();
  if (state === null) return lines;
  if (state.providers === null) {
    const at = insertionPointForScalar(lines, state.entry);
    lines.splice(at.at, 0, `${" ".repeat(at.indent)}providers:`);
    notes.push("added llm-pi-ai.config.providers block");
    state = locate();
    if (state === null || state.providers === null) return lines;
  }
  if (state.provider === null) {
    const providerIndent = state.providers.indent + 2;
    const fieldsIndent = providerIndent + 2;
    lines.splice(
      state.providers.line + 1,
      0,
      `${" ".repeat(providerIndent)}${renderKey(selection.provider)}:`,
      `${" ".repeat(fieldsIndent)}apiKeyEnv: ${renderScalar(selection.apiKeyEnv)}`,
      `${" ".repeat(fieldsIndent)}models:`,
      ...modelsFields.map((line) => `${" ".repeat(fieldsIndent + 2)}${line}`)
    );
    notes.push(`added provider ${selection.provider} with apiKeyEnv ${selection.apiKeyEnv} and model ${selection.model}`);
    return lines;
  }
  const keyEnv = findScalar(lines, state.provider.line + 1, state.providerEnd, "apiKeyEnv");
  if (keyEnv === null) {
    lines.splice(
      state.provider.line + 1,
      0,
      `${" ".repeat(state.provider.indent + 2)}apiKeyEnv: ${renderScalar(selection.apiKeyEnv)}`
    );
    notes.push(`added apiKeyEnv ${selection.apiKeyEnv}`);
    state = locate();
    if (state === null || state.provider === null) return lines;
  } else if (keyEnv.value !== selection.apiKeyEnv) {
    lines[keyEnv.line] = `${" ".repeat(keyEnv.indent)}apiKeyEnv: ${renderScalar(selection.apiKeyEnv)}`;
    notes.push(`changed apiKeyEnv from ${keyEnv.value} to ${selection.apiKeyEnv}`);
  }
  if (state.models === null) {
    const modelsIndent = state.provider.indent + 2;
    const afterKeyEnv = findScalar(lines, state.provider.line + 1, state.providerEnd, "apiKeyEnv");
    lines.splice(
      afterKeyEnv === null ? state.provider.line + 1 : afterKeyEnv.line + 1,
      0,
      `${" ".repeat(modelsIndent)}models:`,
      ...modelsFields.map((line) => `${" ".repeat(modelsIndent + 2)}${line}`)
    );
    notes.push(`added models list with ${selection.model}`);
    return lines;
  }
  const modelsEnd = Math.min(blockEnd(lines, state.models.line, state.models.indent), state.providerEnd);
  let itemIndent = state.models.indent + 2;
  let hasModel = false;
  for (let index = state.models.line + 1; index < modelsEnd; index += 1) {
    const match = /^(\s*)-\s+id:\s*(.*?)\s*$/.exec(lines[index]);
    if (match === null) continue;
    itemIndent = match[1].length;
    if (unquoteScalar(match[2]) === selection.model) hasModel = true;
  }
  if (hasModel) return lines;
  lines.splice(modelsEnd, 0, ...modelsFields.map((line) => `${" ".repeat(itemIndent)}${line}`));
  notes.push(`added model ${selection.model} to provider ${selection.provider}`);
  return lines;
}
function alignReferenceModels(initial, selection, notes) {
  const lines = [...initial];
  const scan = scanPatch(lines.join("\n"));
  for (const entry of scan.entries) {
    if (entry.id === "agent-default-model" || entry.id === "llm-pi-ai") continue;
    for (const item of collectReferenceItems(lines, entry)) {
      if (item.provider !== selection.provider) continue;
      if (item.modelLine === null || item.model === null || item.model === selection.model) continue;
      const line = lines[item.modelLine];
      const match = /^(\s*model:\s*)(.*?)(\s+#.*)?$/.exec(line);
      if (match === null) continue;
      lines[item.modelLine] = `${match[1]}${renderScalar(selection.model)}${match[3] ?? ""}`;
      notes.push(
        `aligned ${entry.id} reference model id from ${item.model} to ${selection.model}`
      );
    }
  }
  return lines;
}
function renderKey(value) {
  return /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(value) ? value : JSON.stringify(value);
}
function modelItemLines(selection) {
  const fields = [
    "- id: " + renderScalar(selection.model),
    "  name: " + renderScalar(selection.model),
    ...selection.contextWindow === void 0 ? [] : [`  contextWindow: ${selection.contextWindow}`],
    ...selection.maxTokens === void 0 ? [] : [`  maxTokens: ${selection.maxTokens}`],
    ...selection.input === void 0 ? [] : [`  input: [${selection.input.join(", ")}]`]
  ];
  return fields;
}
function renderScalar(value) {
  if (/^[A-Za-z0-9_./-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

// src/real-machine-verification/runtime/dsh/model-configurator.ts
var MODEL_PATCH_FILE = "cordis.patch.yml";
function modelPatchPath(profileDir) {
  return joinFsPath(profileDir, MODEL_PATCH_FILE);
}
async function readModelConfig(fs, profileDir, selection) {
  const patchPath = modelPatchPath(profileDir);
  const read = await fs.readText(patchPath);
  if (!read.ok) {
    return {
      ok: false,
      error: failure(
        read.error.code,
        `cannot read the profile patch layer ${patchPath}: ${read.error.message}`,
        `open the profile once (or launch DSH with --profile <name>) so DSH writes ${MODEL_PATCH_FILE}, then rerun; this command never creates the file`,
        { patchPath }
      )
    };
  }
  return {
    ok: true,
    value: {
      patchPath,
      text: read.value,
      state: inspectModelConfig(read.value, selection)
    }
  };
}
async function fixModelConfig(fs, observation, selection) {
  const plan = planModelConfigEdit(observation.text, selection);
  if (!plan.ok) {
    return { changed: false, written: false, notes: [], after: null, failure: plan.error };
  }
  if (!plan.value.changed) {
    return {
      changed: false,
      written: false,
      notes: [...plan.value.notes],
      after: observation,
      failure: null
    };
  }
  const write = await fs.writeText(observation.patchPath, plan.value.text);
  if (!write.ok) {
    return {
      changed: true,
      written: false,
      notes: [...plan.value.notes],
      after: null,
      failure: failure(
        "io",
        `could not write the profile patch layer ${observation.patchPath}: ${write.error.message}`,
        "the patch file is unchanged; fix the file permission or the disk and rerun --fix",
        { patchPath: observation.patchPath }
      )
    };
  }
  const readBack = await fs.readText(observation.patchPath);
  if (!readBack.ok) {
    return {
      changed: true,
      written: true,
      notes: [...plan.value.notes],
      after: null,
      failure: failure(
        "io",
        `wrote the profile patch layer ${observation.patchPath}, but could not read it back: ${readBack.error.message}`,
        "the file was changed; inspect it by hand before rerunning, and do not assume the fix took effect",
        { patchPath: observation.patchPath }
      )
    };
  }
  return {
    changed: true,
    written: true,
    notes: [...plan.value.notes],
    after: {
      patchPath: observation.patchPath,
      text: readBack.value,
      state: inspectModelConfig(readBack.value, selection)
    },
    failure: null
  };
}
async function observeCredentialPresence(fs, env, dshHome, ref) {
  const storePath = credentialStorePath(dshHome);
  const store = await probeCredentialStore(fs, storePath, ref);
  if (store.refPresent) {
    return {
      ref,
      available: true,
      source: "dsh-home",
      storePath,
      storeReadable: store.readable,
      storeRefPresent: true,
      note: null
    };
  }
  const value = env.get(ref);
  if (value !== void 0 && value.length > 0) {
    return {
      ref,
      available: true,
      source: "env",
      storePath,
      storeReadable: store.readable,
      storeRefPresent: false,
      note: null
    };
  }
  const notes = [];
  if (!store.readable) {
    notes.push(`the credential store ${storePath} is not readable (${store.note ?? "no detail"})`);
  } else {
    notes.push(`${storePath} does not list ${ref}`);
  }
  notes.push(`the process environment does not define ${ref}`);
  return {
    ref,
    available: false,
    source: null,
    storePath,
    storeReadable: store.readable,
    storeRefPresent: false,
    note: notes.join("; ")
  };
}

// src/real-machine-verification/cli/commands/model.ts
var MODEL_USAGE = "dsh-verify model [--profile <p>] [--provider <p>] [--model <m>] [--api-key-env <ENV>] [--fix] [--json] [--dry-run]";
var MODEL_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--profile",
  "--declaration",
  "--provider",
  "--model",
  "--api-key-env",
  "--fix"
]);
var DEFAULT_FAIL_HINT = "run dsh-verify model --fix (it only edits existing entries) or edit the patch entry by hand; values are compared verbatim";
function problemOf2(state, code, entryId) {
  return state.problems.find(
    (problem2) => problem2.code === code && (entryId === void 0 || problem2.entryId === entryId)
  ) ?? null;
}
function failFromProblem(id, problem2) {
  return {
    id,
    status: "fail",
    detail: problem2.message,
    expected: problem2.expected ?? "(not stated)",
    actual: problem2.actual ?? "(not stated)",
    hint: problem2.hint ?? DEFAULT_FAIL_HINT
  };
}
function buildChecks(state, selection, credential) {
  const checks = [];
  const missingDefault = problemOf2(state, "missing-default-model-entry");
  if (missingDefault !== null) {
    checks.push({
      id: "model-default-entry",
      status: "blocked",
      detail: missingDefault.message,
      blockedReason: {
        code: "prerequisite-missing",
        message: missingDefault.message,
        ...missingDefault.hint === void 0 ? {} : { hint: missingDefault.hint }
      },
      expected: missingDefault.expected ?? "agent-default-model entry",
      actual: missingDefault.actual ?? "absent",
      ...missingDefault.hint === void 0 ? {} : { hint: missingDefault.hint }
    });
  } else {
    checks.push({
      id: "model-default-entry",
      status: "pass",
      detail: "agent-default-model entry exists"
    });
    const provider = problemOf2(state, "provider-mismatch", "agent-default-model");
    checks.push(
      provider === null ? {
        id: "model-default-provider",
        status: "pass",
        detail: `default provider is ${state.defaultProvider ?? "(missing)"}`
      } : failFromProblem("model-default-provider", provider)
    );
    const model = problemOf2(state, "model-mismatch", "agent-default-model");
    checks.push(
      model === null ? {
        id: "model-default-model",
        status: "pass",
        detail: `default model is ${state.defaultModel ?? "(missing)"}`
      } : failFromProblem("model-default-model", model)
    );
  }
  const missingProvider = problemOf2(state, "missing-provider-entry");
  const providerBlock = problemOf2(state, "provider-mismatch", "llm-pi-ai");
  if (missingProvider !== null) {
    checks.push({
      id: "model-provider-entry",
      status: "blocked",
      detail: missingProvider.message,
      blockedReason: {
        code: "prerequisite-missing",
        message: missingProvider.message,
        ...missingProvider.hint === void 0 ? {} : { hint: missingProvider.hint }
      },
      expected: missingProvider.expected ?? "llm-pi-ai entry",
      actual: missingProvider.actual ?? "absent",
      ...missingProvider.hint === void 0 ? {} : { hint: missingProvider.hint }
    });
  } else {
    checks.push({
      id: "model-provider-entry",
      status: "pass",
      detail: "llm-pi-ai entry exists"
    });
  }
  if (missingProvider !== null) {
    checks.push({
      id: "model-provider-block",
      status: "skip",
      detail: "skipped because the llm-pi-ai entry is missing"
    });
    checks.push({
      id: "model-credential-ref",
      status: "skip",
      detail: "skipped because the llm-pi-ai entry is missing"
    });
    checks.push({
      id: "model-declared-models",
      status: "skip",
      detail: "skipped because the llm-pi-ai entry is missing"
    });
  } else {
    checks.push(
      providerBlock === null ? {
        id: "model-provider-block",
        status: "pass",
        detail: `llm-pi-ai declares provider ${selection.provider}`
      } : failFromProblem("model-provider-block", providerBlock)
    );
    if (providerBlock !== null) {
      checks.push({
        id: "model-credential-ref",
        status: "skip",
        detail: `skipped because provider ${selection.provider} is not configured`
      });
      checks.push({
        id: "model-declared-models",
        status: "skip",
        detail: `skipped because provider ${selection.provider} is not configured`
      });
    } else {
      const keyEnv = problemOf2(state, "api-key-env-mismatch");
      checks.push(
        keyEnv === null ? {
          id: "model-credential-ref",
          status: "pass",
          detail: `provider ${selection.provider} reads its key from ${selection.apiKeyEnv}`
        } : failFromProblem("model-credential-ref", keyEnv)
      );
      const models = problemOf2(state, "models-empty") ?? problemOf2(state, "model-not-declared");
      checks.push(
        models === null ? {
          id: "model-declared-models",
          status: "pass",
          detail: `models list declares ${selection.model} (${state.declaredModels.length} id(s))`
        } : failFromProblem("model-declared-models", models)
      );
    }
  }
  const mismatches = state.problems.filter((problem2) => problem2.code === "reference-model-mismatch");
  if (mismatches.length === 0) {
    checks.push({
      id: "model-reference-model",
      status: "pass",
      detail: state.references.length === 0 ? "no reference parties name a provider/model pair" : `${state.references.length} reference item(s) agree with the declared model id`
    });
  } else {
    checks.push({
      id: "model-reference-model",
      status: "fail",
      detail: mismatches.map((problem2) => problem2.message).join("; "),
      expected: selection.model,
      actual: mismatches.map((problem2) => `${problem2.entryId ?? "?"}=${problem2.actual ?? "?"}`).join(", "),
      hint: mismatches[0]?.hint ?? DEFAULT_FAIL_HINT
    });
  }
  const credentialApplies = missingProvider === null && providerBlock === null && problemOf2(state, "api-key-env-mismatch") === null;
  if (!credentialApplies) {
    checks.push({
      id: "model-credential-value",
      status: "skip",
      detail: `skipped because the patch layer does not reference ${selection.apiKeyEnv}`
    });
  } else if (credential.available) {
    checks.push({
      id: "model-credential-value",
      status: "pass",
      detail: `${credential.ref} is available from ${credential.source === "env" ? "the process environment" : "the DSH home credential store"}`
    });
  } else {
    checks.push({
      id: "model-credential-value",
      status: "blocked",
      detail: `no value for ${credential.ref}: ${credential.note ?? "not found"}`,
      expected: `a value for ${credential.ref}`,
      actual: "not found",
      hint: `add ${credential.ref} to ${credential.storePath} or set it in the environment; this command never invents credential values`,
      blockedReason: {
        code: "prerequisite-missing",
        message: `no value for ${credential.ref}: ${credential.note ?? "not found"}`,
        hint: `add ${credential.ref} to ${credential.storePath} or set it in the environment`
      }
    });
  }
  return checks;
}
function exitCodeFor(checks) {
  if (checks.some((check) => check.status === "fail")) return EXIT_CODES.hardFailure;
  if (checks.some((check) => check.status === "blocked")) return EXIT_CODES.blocked;
  return EXIT_CODES.ok;
}
function renderCheckLine(check) {
  const extras = [];
  if (check.status === "fail") {
    extras.push(`expected ${check.expected ?? "(not stated)"}`);
    extras.push(`actual ${check.actual ?? "(not stated)"}`);
  }
  if (check.hint !== void 0) extras.push(`hint: ${check.hint}`);
  const suffix = extras.length === 0 ? "" : `; ${extras.join("; ")}`;
  return `${check.status} ${check.id} ${check.detail}${suffix}`;
}
function failureJson7(stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "model",
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject5(args, io, stage, error) {
  io.stderr(`dsh-verify model: ${formatFailure(error)}
`);
  if (args.json) io.stdout(failureJson7(stage, error));
  return EXIT_CODES.blocked;
}
function emitReport(args, io, report, exitCode) {
  const sink = args.json ? io.stderr : io.stdout;
  for (const check of report.checks) sink(`${renderCheckLine(check)}
`);
  if (args.json) {
    io.stdout(`${JSON.stringify({ ...report, ok: exitCode === EXIT_CODES.ok })}
`);
  }
  return exitCode;
}
function fixRefusalCheck(error) {
  return {
    id: "model-fix",
    status: "blocked",
    detail: `refused to edit the patch layer: ${error.message}`,
    expected: "an existing patch entry that can be repaired in place",
    actual: error.message,
    hint: error.hint ?? "repair or install the profile first; this command never invents a plugin entry",
    blockedReason: {
      code: "prerequisite-missing",
      message: `refused to edit the patch layer: ${error.message}`,
      ...error.hint === void 0 ? {} : { hint: error.hint }
    }
  };
}
function fixPlanFailureCheck(error) {
  return {
    id: "model-fix",
    status: "fail",
    detail: `could not plan an edit for the patch layer: ${error.message}`,
    expected: "a minimal edit plan that re-inspects as conforming",
    actual: error.message,
    hint: error.hint ?? "review the patch layer by hand; this tool will not write a plan it cannot verify"
  };
}
function fixWriteFailureCheck(error) {
  return {
    id: "model-fix",
    status: "fail",
    detail: "the patch layer could not be written",
    expected: "the patch layer written with the planned edit",
    actual: error.message,
    hint: error.hint ?? "the patch file is unchanged; fix the file permission or the disk and rerun"
  };
}
function resolveSelection(args, profile) {
  const declared = profile.model;
  if (declared === false) {
    const missing = [
      ...args.provider === void 0 ? ["--provider"] : [],
      ...args.model === void 0 ? ["--model"] : [],
      ...args.apiKeyEnv === void 0 ? ["--api-key-env"] : []
    ];
    if (missing.length > 0) {
      return {
        selection: { provider: "", model: "", apiKeyEnv: "" },
        failure: {
          code: "prerequisite",
          message: `the profile declares no model (model: false); ${missing.length === 3 ? "pass --provider, --model and --api-key-env together" : `missing ${missing.join(", ")}`}`,
          hint: "set model: { provider, model, apiKeyEnv } in the declaration, or pass all three flags"
        }
      };
    }
  }
  const base = declared === false ? void 0 : declared;
  const provider = args.provider ?? base?.provider;
  const model = args.model ?? base?.model;
  const apiKeyEnv = args.apiKeyEnv ?? base?.apiKeyEnv;
  const missingNames = [
    ...provider === void 0 || provider.length === 0 ? ["provider"] : [],
    ...model === void 0 || model.length === 0 ? ["model"] : [],
    ...apiKeyEnv === void 0 || apiKeyEnv.length === 0 ? ["apiKeyEnv"] : []
  ];
  if (provider === void 0 || model === void 0 || apiKeyEnv === void 0 || missingNames.length > 0) {
    return {
      selection: { provider: "", model: "", apiKeyEnv: "" },
      failure: {
        code: "prerequisite",
        message: `the model selection is incomplete: ${missingNames.join(", ")} missing`,
        hint: "pass --provider, --model and --api-key-env, or declare them in the profile"
      }
    };
  }
  for (const [name, value] of [
    ["provider", provider],
    ["model", model],
    ["apiKeyEnv", apiKeyEnv]
  ]) {
    if (/[\r\n]/.test(value)) {
      return {
        selection: { provider: "", model: "", apiKeyEnv: "" },
        failure: {
          code: "invalid-input",
          message: `${name} must not contain a line break`,
          hint: "provider, model and apiKeyEnv are single-line YAML scalars"
        }
      };
    }
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.$-]*$/.test(apiKeyEnv)) {
    return {
      selection: { provider: "", model: "", apiKeyEnv: "" },
      failure: {
        code: "invalid-input",
        message: `apiKeyEnv ${JSON.stringify(apiKeyEnv)} is not an environment-variable-shaped reference name`,
        hint: "use letters, digits, underscore, dot, dollar or dash, starting with a letter or underscore"
      }
    };
  }
  return {
    selection: {
      provider,
      model,
      apiKeyEnv,
      ...base?.contextWindow === void 0 ? {} : { contextWindow: base.contextWindow },
      ...base?.maxTokens === void 0 ? {} : { maxTokens: base.maxTokens },
      ...base?.input === void 0 ? {} : { input: base.input }
    },
    failure: null
  };
}
function modelPlanJson(context, patchPath, selection, before, credential, edit, checks, fixRequested, exitCode, predictedChecks) {
  const editJson = "error" in edit ? { changed: false, notes: [], error: edit.error } : { changed: edit.changed, notes: edit.notes, error: null };
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "model",
    ok: exitCode === EXIT_CODES.ok,
    exitCode,
    dryRun: true,
    plan: {
      profile: context.profileName,
      profileDir: context.profileDir,
      patchPath,
      selection,
      fixRequested,
      current: {
        configured: before.state.configured,
        problems: before.state.problems
      },
      edit: editJson,
      wouldWrite: fixRequested && !before.state.configured && !("error" in edit) && edit.changed,
      credential: {
        ref: credential.ref,
        available: credential.available,
        source: credential.source,
        storePath: credential.storePath,
        storeRefPresent: credential.storeRefPresent
      },
      checks,
      // What the run would report: with --fix the checks of the planned text,
      // without it the current checks. ok/exitCode above follow this block.
      predicted: { exitCode, checks: predictedChecks }
    }
  })}
`;
}
function renderModelPlan(context, patchPath, selection, before, edit, checks, fixRequested) {
  const lines = [];
  lines.push("model plan (dry run) \u2014 nothing was written");
  lines.push(`profile: ${context.profileName} (${context.profileDir})`);
  lines.push(`patch: ${patchPath}`);
  lines.push(`selection: ${selection.provider}/${selection.model} (credential ref ${selection.apiKeyEnv})`);
  lines.push(`current: configured=${String(before.state.configured)}, problems=${before.state.problems.length}`);
  lines.push(`fix requested: ${String(fixRequested)}`);
  if ("error" in edit) {
    lines.push(`edit: cannot be planned \u2014 ${formatFailure(edit.error)}`);
  } else {
    lines.push(`edit: ${edit.changed ? `${edit.notes.length} change(s)` : "no change"}`);
    for (const note of edit.notes) lines.push(`  - ${note}`);
  }
  lines.push(`checks (current state): ${checks.length}`);
  for (const check of checks) lines.push(`  - ${check.status} ${check.id} ${check.detail}`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runModelCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, MODEL_FLAGS);
  if (problems.length > 0) {
    return reject5(args, io, "usage", {
      code: "invalid-input",
      message: `${problems.join("; ")}; usage: ${MODEL_USAGE}`
    });
  }
  const context = await loadDeclarationContext({
    ports,
    cwd: ports.env.cwd(),
    nodeVersion: deps.runtime.nodeVersion,
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!context.ok) {
    return reject5(args, io, context.error.stage, context.error.failure);
  }
  const resolved = resolveSelection(args, context.value.profile);
  if (resolved.failure !== null) {
    return reject5(args, io, "selection", resolved.failure);
  }
  const selection = resolved.selection;
  const patchPath = modelPatchPath(context.value.profileDir);
  io.stderr(
    `dsh-verify model: profile ${context.value.profileName}, patch ${patchPath}, selection ${selection.provider}/${selection.model}, credential ref ${selection.apiKeyEnv}
`
  );
  const observed = await readModelConfig(ports.fs, context.value.profileDir, selection);
  if (!observed.ok) {
    const check = {
      id: "model-patch",
      status: "blocked",
      detail: observed.error.message,
      expected: `a readable ${patchPath}`,
      actual: "missing or unreadable",
      ...observed.error.hint === void 0 ? {} : { hint: observed.error.hint },
      blockedReason: {
        code: "prerequisite-missing",
        message: observed.error.message,
        ...observed.error.hint === void 0 ? {} : { hint: observed.error.hint }
      }
    };
    const report2 = {
      schemaVersion: 1,
      command: "model",
      ok: false,
      profile: context.value.profileName,
      profileDir: context.value.profileDir,
      patchPath,
      selection,
      before: null,
      after: null,
      checks: [check],
      credential: null,
      fix: { requested: args.fix, changed: false, written: false, notes: [], error: null }
    };
    return emitReport(args, io, report2, EXIT_CODES.blocked);
  }
  const before = observed.value;
  const credential = await observeCredentialPresence(
    ports.fs,
    ports.env,
    context.value.dshHome,
    selection.apiKeyEnv
  );
  const realHomeHit = args.fix ? await findWriteUnderRealHome({
    fs: ports.fs,
    env: ports.env,
    cwd: ports.env.cwd(),
    dshHome: context.value.dshHome
  }) : null;
  if (realHomeHit !== null && !args.dryRun) {
    return reject5(args, io, "fix", {
      code: "prerequisite",
      message: `refusing to edit the real DSH home ${realHomeHit.realHome}: DSH_HOME ${realHomeHit.value}`,
      hint: "copy the profile into a batch home and set DSH_HOME to that copy, then rerun with --fix",
      details: { dshHome: context.value.dshHome, patchPath, realHome: realHomeHit.realHome }
    });
  }
  if (realHomeHit !== null) {
    io.stderr(
      `dsh-verify model: warning: the target DSH home ${context.value.dshHome} belongs to the real user home ${realHomeHit.realHome}; a real --fix would be refused (the dry run writes nothing)
`
    );
  }
  if (args.dryRun) {
    const edit = planModelConfigEdit(before.text, selection);
    const editPlan = edit.ok ? { changed: edit.value.changed, notes: edit.value.notes } : { error: edit.error };
    const checks2 = buildChecks(before.state, selection, credential);
    let predictedChecks = [...checks2];
    if (args.fix) {
      if (!edit.ok) {
        predictedChecks.push(edit.error.code === "prerequisite" ? fixRefusalCheck(edit.error) : fixPlanFailureCheck(edit.error));
      } else {
        predictedChecks = buildChecks(inspectModelConfig(edit.value.text, selection), selection, credential);
      }
    }
    const dryRunExit = exitCodeFor(predictedChecks);
    if (args.json) {
      io.stdout(
        modelPlanJson(
          { profileName: context.value.profileName, profileDir: context.value.profileDir },
          patchPath,
          selection,
          before,
          credential,
          editPlan,
          checks2,
          args.fix,
          dryRunExit,
          predictedChecks
        )
      );
    } else {
      io.stdout(
        renderModelPlan(
          { profileName: context.value.profileName, profileDir: context.value.profileDir },
          patchPath,
          selection,
          before,
          editPlan,
          checks2,
          args.fix
        )
      );
    }
    return dryRunExit;
  }
  let checks = buildChecks(before.state, selection, credential);
  let fix = {
    requested: args.fix,
    changed: false,
    written: false,
    notes: [],
    error: null
  };
  let after = null;
  let stateAfter = before.state;
  if (args.fix && !before.state.configured) {
    const outcome = await fixModelConfig(ports.fs, before, selection);
    fix = {
      requested: true,
      changed: outcome.changed,
      written: outcome.written,
      notes: outcome.notes,
      error: outcome.failure
    };
    if (outcome.failure !== null && !outcome.written) {
      if (outcome.changed) {
        checks = [...checks, fixWriteFailureCheck(outcome.failure)];
      } else if (outcome.failure.code === "prerequisite") {
        checks = [...checks, fixRefusalCheck(outcome.failure)];
      } else {
        checks = [...checks, fixPlanFailureCheck(outcome.failure)];
      }
    } else if (outcome.written && outcome.after !== null) {
      stateAfter = outcome.after.state;
      after = stateAfter;
      checks = buildChecks(stateAfter, selection, credential);
      const changeNote = outcome.notes.length === 0 ? "nothing to change; no write was made" : `wrote ${outcome.notes.length} change(s): ${outcome.notes.join("; ")}`;
      checks = [
        ...checks,
        {
          id: "model-fix",
          status: "pass",
          detail: changeNote
        },
        stateAfter.configured ? {
          id: "model-recheck",
          status: "pass",
          detail: "re-read the written patch layer: every model rule passes"
        } : {
          id: "model-recheck",
          status: "fail",
          detail: "the patch layer was written, but re-inspection still fails: " + checks.filter((item) => item.status === "fail").map((item) => item.id).join(", ") + " (" + stateAfter.problems.map((problem2) => problem2.code).join(", ") + ")",
          expected: "a re-read patch layer that passes every model rule",
          actual: stateAfter.problems.map((problem2) => problem2.message).join("; "),
          hint: "the file changed but the rules still disagree; review the failing checks and edit the patch entry by hand"
        }
      ];
    } else if (outcome.written) {
      checks = [
        ...checks,
        {
          id: "model-fix",
          status: "pass",
          detail: `wrote ${outcome.notes.length} change(s); the result could not be read back`
        },
        {
          id: "model-recheck",
          status: "fail",
          detail: "the patch layer was written, but could not be re-read for inspection",
          expected: "the written patch layer re-read and inspected",
          actual: outcome.failure?.message ?? "read-back failed",
          hint: outcome.failure?.hint ?? "inspect the patch file by hand before rerunning"
        }
      ];
    }
  } else if (args.fix) {
    fix = {
      requested: true,
      changed: false,
      written: false,
      notes: ["already conforming; nothing written"],
      error: null
    };
    checks = [
      ...checks,
      {
        id: "model-fix",
        status: "pass",
        detail: "already conforming; nothing written"
      }
    ];
  }
  const report = {
    schemaVersion: 1,
    command: "model",
    ok: false,
    profile: context.value.profileName,
    profileDir: context.value.profileDir,
    patchPath,
    selection,
    before: before.state,
    after,
    checks,
    credential,
    fix
  };
  return emitReport(args, io, report, exitCodeFor(checks));
}

// src/real-machine-verification/contracts/skills-rules.ts
var MODEL_CATALOG_CAVEAT = "do not count skills from a model-facing catalog: the host hides skills marked disable-model-invocation";
function compareSkillSets(expectation, observed) {
  const expected = /* @__PURE__ */ new Set();
  for (const name of expectation.names) {
    if (typeof name !== "string" || name.length === 0) {
      return err({ code: "invalid-input", message: "expected skill names must be non-empty strings" });
    }
    if (expected.has(name)) {
      return err({
        code: "invalid-input",
        message: `expected skill set lists ${name} twice`,
        hint: "the declaration and the shipped directory list disagree; fix the declaration"
      });
    }
    expected.add(name);
  }
  if (expectation.expectedCount !== expected.size) {
    return err({
      code: "invalid-input",
      message: `declared expectedCount ${expectation.expectedCount} does not match the ${expected.size} declared names`,
      hint: "count and names must describe the same set, otherwise a dropped skill can pass unnoticed"
    });
  }
  const counts = /* @__PURE__ */ new Map();
  for (const skill of observed) {
    counts.set(skill.name, (counts.get(skill.name) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name).sort();
  const observedNames = new Set(counts.keys());
  const missing = [...expected].filter((name) => !observedNames.has(name)).sort();
  const extra = [...observedNames].filter((name) => !expected.has(name) && observed.some((skill) => skill.name === name && skill.source === "bundled")).sort();
  const notes = [];
  if (duplicated.length > 0) {
    notes.push(`registry reported duplicate names: ${duplicated.join(", ")}`);
  }
  if (observed.length !== expected.size) {
    notes.push(
      `registry returned ${observed.length} skill(s), the package declares ${expected.size}; extra non-bundled sources are expected to be filtered by the caller`
    );
  }
  return ok({
    ok: missing.length === 0 && extra.length === 0 && duplicated.length === 0,
    missing: Object.freeze(missing),
    extra: Object.freeze(extra),
    duplicated: Object.freeze(duplicated),
    observedCount: observed.length,
    expectedCount: expected.size,
    notes: Object.freeze(notes)
  });
}
function readFrontmatterName(content) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") return null;
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") return null;
    const match = /^name:\s*(.*)$/.exec(line);
    if (match !== null) {
      const raw = match[1].trim();
      const unquoted = raw.replace(/^(['"])(.*)\1$/, "$2").trim();
      return unquoted.length === 0 ? null : unquoted;
    }
  }
  return null;
}
function inspectShippedSkills(skills) {
  if (skills.length === 0) {
    return err({
      code: "prerequisite",
      message: "no skill directories were found in the package",
      hint: "check the declaration's bundledSkills.dir and that the package was built with its bundled directory"
    });
  }
  const names = [];
  const mismatches = [];
  const missingFrontmatter = [];
  for (const skill of skills) {
    const declared = readFrontmatterName(skill.content);
    if (declared === null) {
      missingFrontmatter.push(skill.dirName);
      continue;
    }
    if (declared !== skill.dirName) {
      mismatches.push({ dirName: skill.dirName, declared });
      continue;
    }
    names.push(declared);
  }
  names.sort();
  return ok({
    names: Object.freeze(names),
    mismatches: Object.freeze(mismatches),
    missingFrontmatter: Object.freeze(missingFrontmatter)
  });
}
function describeComparison(comparison) {
  if (comparison.ok) {
    return `registry contains exactly the ${comparison.expectedCount} declared skill(s)`;
  }
  const parts = [];
  if (comparison.missing.length > 0) parts.push(`missing ${comparison.missing.join(", ")}`);
  if (comparison.extra.length > 0) parts.push(`unexpected ${comparison.extra.join(", ")}`);
  if (comparison.duplicated.length > 0) parts.push(`duplicated ${comparison.duplicated.join(", ")}`);
  return parts.join("; ");
}

// src/real-machine-verification/orchestration/checks/skills-observation.ts
var MAX_PROJECT_DEPTH = 64;
async function findProjectRoot(fs, cwd) {
  let current = cwd;
  for (let depth = 0; current !== null && depth < MAX_PROJECT_DEPTH; depth += 1) {
    if (await fs.exists(joinFsPath(current, ".git"))) return current;
    current = parentFsPath(current);
  }
  return cwd;
}
function planSkillRoots(projectRoot, input) {
  const agentsHome = (input.agentsHome ?? "").trim().length > 0 ? resolveAgainst(input.cwd, (input.agentsHome ?? "").trim()) : joinFsPath(input.homeDir, ".agents");
  const roots = [
    { source: "project-dsh", rank: 100, path: joinFsPath(projectRoot, ".dsh", "skills"), note: null },
    { source: "project-agents", rank: 200, path: joinFsPath(projectRoot, ".agents", "skills"), note: null },
    {
      source: "custom",
      rank: 300,
      path: null,
      note: "custom root (config.customSkillDirs) cannot be observed read-only; ignored"
    },
    { source: "user-dsh", rank: 400, path: joinFsPath(input.dshHome, "skills"), note: null },
    { source: "user-agents", rank: 500, path: joinFsPath(agentsHome, "skills"), note: null }
  ];
  const bundled = (input.bundledSkillDir ?? "").trim();
  if (bundled.length > 0) {
    roots.push({
      source: "bundled-env",
      rank: 600,
      path: resolveAgainst(input.cwd, bundled),
      note: "from DSH_BUNDLED_SKILL_DIR"
    });
  }
  return roots;
}
async function enumerateSkillTree(fs, dir, options = {}) {
  const listed = await fs.list(dir);
  if (!listed.ok) return listed;
  const skip = new Set(options.skip ?? []);
  const entries = [];
  for (const entry of listed.value) {
    if (skip.has(entry.name) || entry.name.length === 0) continue;
    if (entry.kind === "directory") {
      const read = await fs.readText(joinFsPath(dir, entry.name, "SKILL.md"));
      if (read.ok) entries.push({ dirName: entry.name, content: read.value, kind: "directory" });
      continue;
    }
    if (entry.kind === "file" && /\.md$/i.test(entry.name)) {
      const read = await fs.readText(joinFsPath(dir, entry.name));
      if (read.ok) entries.push({ dirName: entry.name.replace(/\.md$/i, ""), content: read.value, kind: "file" });
    }
  }
  entries.sort((left, right) => left.dirName < right.dirName ? -1 : left.dirName > right.dirName ? 1 : 0);
  return ok(entries);
}
async function enumerateSkillDirectory(fs, dir, options = {}) {
  const entries = await enumerateSkillTree(fs, dir, options);
  if (!entries.ok) return entries;
  return ok(entries.value.map((entry) => ({ dirName: entry.dirName, content: entry.content })));
}
async function discoverShippedSkills(fs, dir) {
  const entries = await enumerateSkillTree(fs, dir);
  if (!entries.ok) return entries;
  const skills = [];
  const ignored = [];
  for (const entry of entries.value) {
    if (entry.kind === "file" && readFrontmatterName(entry.content) === null) {
      ignored.push({
        name: entry.dirName,
        reason: "flat markdown file without a readable frontmatter name is documentation, not a skill"
      });
      continue;
    }
    skills.push({ dirName: entry.dirName, content: entry.content });
  }
  return ok({ skills, ignored });
}
async function observeSkillRoots(fs, input) {
  const projectRoot = await findProjectRoot(fs, input.cwd);
  const roots = planSkillRoots(projectRoot, input);
  const observed = [];
  for (const root of roots) {
    if (root.path === null) {
      observed.push({ source: root.source, rank: root.rank, path: null, exists: false, count: 0, names: [], problems: [], note: root.note });
      continue;
    }
    const listed = await enumerateSkillDirectory(fs, root.path, {
      skip: root.source === "user-dsh" ? [".system"] : []
    });
    if (!listed.ok) {
      observed.push({
        source: root.source,
        rank: root.rank,
        path: root.path,
        exists: false,
        count: 0,
        names: [],
        problems: [],
        note: listed.error.code === "not-found" ? root.note : listed.error.message
      });
      continue;
    }
    const names = [];
    const problems = [];
    for (const skill of listed.value) {
      const declared = readFrontmatterName(skill.content);
      if (declared === null) {
        problems.push(root.source + ": " + skill.dirName + " has no readable frontmatter name; the host would skip it");
        continue;
      }
      if (declared !== skill.dirName) {
        problems.push(root.source + ": " + skill.dirName + " declares name " + JSON.stringify(declared) + "; the host would skip it");
        continue;
      }
      names.push(declared);
    }
    names.sort();
    observed.push({
      source: root.source,
      rank: root.rank,
      path: root.path,
      exists: true,
      count: names.length,
      names,
      problems,
      note: root.note
    });
  }
  return observed;
}
function skillObservationsFromRoots(roots) {
  const observations = [];
  for (const root of roots) {
    for (const name of root.names) {
      observations.push({
        name,
        source: root.source,
        rank: root.rank,
        ...root.path === null ? {} : { dir: joinFsPath(root.path, name) }
      });
    }
  }
  return observations;
}
async function findInstalledSkillsDir(fs, packageDir, dir) {
  const declared = joinFsPath(packageDir, ...dir.split("/"));
  const candidates = [
    { path: declared, resolution: "declared-path" }
  ];
  const fallback = joinFsPath(packageDir, baseName(dir));
  if (!samePath(fallback, declared)) candidates.push({ path: fallback, resolution: "basename-at-package-root" });
  const tried = [];
  for (const candidate of candidates) {
    tried.push(candidate.path);
    const listed = await fs.list(candidate.path);
    if (listed.ok) return { path: candidate.path, resolution: candidate.resolution, tried };
  }
  return { path: null, resolution: "missing", tried };
}
function rankOf(observation) {
  return observation.rank ?? Number.MAX_SAFE_INTEGER;
}
function mergeSkillObservations(entries) {
  const indexed = entries.map((entry, index) => ({ entry, index }));
  indexed.sort((left, right) => rankOf(left.entry) - rankOf(right.entry) || left.index - right.index);
  const groups = /* @__PURE__ */ new Map();
  for (const item of indexed) {
    const group = groups.get(item.entry.name);
    if (group === void 0) groups.set(item.entry.name, [item]);
    else group.push(item);
  }
  const observations = [];
  const conflicts = [];
  for (const [name, group] of groups) {
    const sources = new Set(group.map((item) => item.entry.source));
    if (sources.size <= 1) {
      for (const item of group) observations.push(item.entry);
      continue;
    }
    const [first, ...rest] = group;
    observations.push(first.entry);
    conflicts.push({
      name,
      kept: { source: first.entry.source, rank: first.entry.rank ?? null },
      ignored: rest.map((item) => ({ source: item.entry.source, rank: item.entry.rank ?? null }))
    });
  }
  return { observations, conflicts };
}

// src/real-machine-verification/orchestration/scenario-run.ts
import { pathToFileURL as pathToFileURL3 } from "node:url";

// src/real-machine-verification/contracts/scenario.ts
var SCENARIO_STEP_KINDS = /* @__PURE__ */ new Set([
  "check",
  "launch",
  "stop",
  "sleep",
  "logs",
  "model",
  "install",
  "skills",
  "evidence",
  "custom"
]);
var SCENARIO_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
var STEP_ID_RE = /^[a-z][a-z0-9-]{1,63}$/;
function invalid6(message, hint) {
  return err({ code: "invalid-input", message, ...hint === void 0 ? {} : { hint } });
}
function isRecord7(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseScenario(definition) {
  if (typeof definition !== "object" || definition === null) {
    return invalid6("scenario must be an object");
  }
  if (typeof definition.id !== "string" || !SCENARIO_ID_RE.test(definition.id)) {
    return invalid6(`scenario id ${JSON.stringify(definition.id)} must be lowercase kebab-case`);
  }
  if (typeof definition.title !== "string" || definition.title.trim().length === 0) {
    return invalid6(`scenario ${definition.id} needs a title`);
  }
  if (definition.profile !== void 0) {
    const profile = parseProfileName(definition.profile);
    if (!profile.ok) {
      return invalid6(`scenario ${definition.id}: profile ${JSON.stringify(definition.profile)} is not a valid profile name`);
    }
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    return invalid6(`scenario ${definition.id} needs at least one step`);
  }
  if (definition.hooks !== void 0) {
    if (!isRecord7(definition.hooks)) {
      return invalid6(`scenario ${definition.id}: hooks must be an object`);
    }
    for (const name of ["beforeLaunch", "prepareHome", "afterLaunch"]) {
      const hook = definition.hooks[name];
      if (hook !== void 0 && typeof hook !== "function") {
        return invalid6(`scenario ${definition.id}: hooks.${name} must be a function`);
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  for (const step of definition.steps) {
    if (typeof step !== "object" || step === null) {
      return invalid6(`scenario ${definition.id}: every step must be an object`);
    }
    if (typeof step.id !== "string" || !STEP_ID_RE.test(step.id)) {
      return invalid6(`scenario ${definition.id}: step id ${JSON.stringify(step.id)} must be lowercase kebab-case`);
    }
    if (seen.has(step.id)) {
      return invalid6(`scenario ${definition.id}: step id ${step.id} is duplicated`);
    }
    seen.add(step.id);
    if (typeof step.title !== "string" || step.title.trim().length === 0) {
      return invalid6(`scenario ${definition.id}: step ${step.id} needs a title`);
    }
    if (!SCENARIO_STEP_KINDS.has(step.kind)) {
      return invalid6(
        `scenario ${definition.id}: step ${step.id} has unknown kind ${JSON.stringify(step.kind)}`,
        `use one of: ${[...SCENARIO_STEP_KINDS].join(", ")}`
      );
    }
    if (step.kind === "custom" && typeof step.run !== "function") {
      return invalid6(`scenario ${definition.id}: custom step ${step.id} must provide run()`);
    }
    if (step.kind !== "custom" && step.run !== void 0) {
      return invalid6(
        `scenario ${definition.id}: step ${step.id} is ${step.kind} but provides run(); use kind "custom" or drop run`,
        "built-in steps are executed by the runner, so a body on them is silently ignored \u2014 which hides mistakes"
      );
    }
    if (step.kind === "custom" && step.params !== void 0) {
      return invalid6(
        `scenario ${definition.id}: custom step ${step.id} cannot carry params`,
        "close over the values inside run() instead; params belong to built-in primitives"
      );
    }
    if (step.params !== void 0 && !isRecord7(step.params)) {
      return invalid6(`scenario ${definition.id}: step ${step.id} params must be an object`);
    }
    if (step.timeoutMs !== void 0 && (!Number.isInteger(step.timeoutMs) || step.timeoutMs <= 0)) {
      return invalid6(`scenario ${definition.id}: step ${step.id} timeoutMs must be a positive integer`);
    }
    if (step.skipWhen !== void 0 && typeof step.skipWhen !== "function") {
      return invalid6(`scenario ${definition.id}: step ${step.id} skipWhen must be a function`);
    }
  }
  return ok({
    ...definition,
    steps: [...definition.steps],
    ...definition.notes === void 0 ? {} : { notes: [...definition.notes] }
  });
}
function scenarioPassed(steps) {
  return steps.every((step) => step.state === "done" && step.observations.every((observation) => observation.ok));
}

// src/real-machine-verification/orchestration/checks/model-configured.ts
var ABSENCE_CODES = /* @__PURE__ */ new Set(["missing-default-model-entry", "missing-provider-entry"]);
function createModelConfiguredCheck() {
  return {
    id: checkId2("model-configured"),
    title: "the profile's patch layer declares the selected provider, model and credential reference",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const selection = context.profile.model;
      if (selection === false) {
        return skipped(
          "the profile declares no model",
          "set model: { provider, model, apiKeyEnv } in verify/profile.ts to verify the profile's model configuration"
        );
      }
      const patchPath = joinFsPath(context.profileDir, "cordis.patch.yml");
      const patch = await context.ports.fs.readText(patchPath);
      if (!patch.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "model-config",
          {
            profileName: context.profileName,
            patchPath,
            readable: false,
            error: patch.error.message,
            provider: selection.provider,
            model: selection.model,
            apiKeyEnv: selection.apiKeyEnv,
            problemCodes: []
          },
          "the profile patch layer could not be read",
          context.note
        );
        return blocked(
          "the profile patch layer " + patchPath + " is missing or unreadable: " + patch.error.message,
          "open this profile once (or launch DSH with --profile <name>) so its patch layer is written, then rerun; this check is read-only and never invents a patch entry",
          evidence2
        );
      }
      const state = inspectModelConfig(patch.value, selection);
      const mismatch = state.problems.filter((problem2) => !ABSENCE_CODES.has(problem2.code));
      const absence = state.problems.filter((problem2) => ABSENCE_CODES.has(problem2.code));
      const evidence = await recordEvidence(
        context.evidence,
        "model-config",
        {
          profileName: context.profileName,
          patchPath,
          provider: selection.provider,
          model: selection.model,
          apiKeyEnv: selection.apiKeyEnv,
          defaultProvider: state.defaultProvider,
          defaultModel: state.defaultModel,
          declaredModels: [...state.declaredModels],
          problemCodes: state.problems.map((problem2) => problem2.code)
        },
        "the model facts read from the profile patch layer (no patch text recorded)",
        context.note
      );
      if (mismatch.length > 0) {
        return failed(
          "the profile patch layer disagrees with the declaration: " + mismatch.map((problem2) => problem2.message).join("; "),
          "provider=" + selection.provider + " model=" + selection.model + " apiKeyEnv=" + selection.apiKeyEnv,
          "provider=" + (state.defaultProvider ?? "(none)") + " model=" + (state.defaultModel ?? "(none)") + " apiKeyEnv=" + (state.apiKeyEnv ?? "(none)") + " models=[" + state.declaredModels.join(", ") + "]",
          "run dsh-verify model --fix (ticket 10) or edit the patch entry by hand; model ids and credential references are compared verbatim",
          evidence
        );
      }
      if (absence.length > 0) {
        return blocked(
          "the profile patch layer has no " + absence.map((problem2) => problem2.code).join(" / ") + " entry, so the declared model cannot be confirmed: " + absence.map((problem2) => problem2.message).join("; ") + "; only the patch layer is readable, so whether the bundle layer supplies a provider cannot be judged",
          "if this profile should not use the declared pi-ai provider, set model: false in verify/profile.ts; otherwise add the entry to the patch layer (model --fix only edits existing entries, it does not create them)",
          evidence
        );
      }
      return passed(
        "profile " + JSON.stringify(context.profileName) + " declares provider " + selection.provider + ", model " + selection.model + " and apiKeyEnv " + selection.apiKeyEnv + " verbatim in " + patchPath + "; the provider's models list contains " + selection.model,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/model-credential.ts
function createModelCredentialCheck() {
  return {
    id: checkId2("model-credential"),
    title: "the declared credential reference resolves without reading its value",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const selection = context.profile.model;
      if (selection === false) {
        return skipped(
          "the profile declares no model",
          "set model: { provider, model, apiKeyEnv } in verify/profile.ts to verify its credential reference"
        );
      }
      const ref = selection.apiKeyEnv;
      const storePath = credentialStorePath(context.dshHome);
      const store = await probeCredentialStore(context.ports.fs, storePath, ref);
      const envValue = context.ports.env.get(ref);
      const envPresent = envValue !== void 0 && envValue.length > 0;
      const sources = [
        {
          source: "batch-home",
          available: false,
          reason: "not applicable: self-check launches no instance, so there is no batch home"
        },
        {
          source: "real-home-store",
          path: storePath,
          available: store.refPresent,
          refPresent: store.refPresent,
          ...store.readable && store.refPresent ? {} : {
            reason: store.readable ? "the refs block does not list " + ref + (store.note === null ? "" : " (" + store.note + ")") : "no readable credential store at this path: " + (store.note ?? "unknown error")
          }
        },
        {
          source: "process-env",
          available: envPresent,
          ...envPresent ? {} : { reason: "environment variable " + ref + " is not set" }
        }
      ];
      const resolved = sources.find((source) => source.available);
      const evidence = await recordEvidence(
        context.evidence,
        "model-credential",
        { apiKeyEnv: ref, sources, valueRead: false },
        "which credential stores list the declared reference name (names only, never values)",
        context.note
      );
      if (resolved !== void 0) {
        const where = resolved.path === void 0 ? resolved.source : resolved.source + " (" + resolved.path + ")";
        return passed(
          "credential ref " + ref + " resolves via " + where + "; the value was not read",
          evidence
        );
      }
      return blocked(
        "credential ref " + ref + " was not found in the batch home, the real-home store (" + storePath + ") or the process environment",
        "set " + ref + " in the environment that runs self-check, or add a credential named " + ref + " in DSH settings (it lands under refs in " + storePath + "), then rerun",
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/package-installed.ts
function installHint(packageName, profileDir, version) {
  const spec = version === void 0 ? packageName : `${packageName}@${version}`;
  return `copy ${profileDir} into an isolated home, set DSH_HOME to it, run \`npm install ${spec}\` inside the copy, then rerun self-check; writing the real user-home profile is not isolated evidence`;
}
function createPackageInstalledCheck() {
  return {
    id: checkId2("package-installed"),
    title: "the profile loads the package under verification and its client entry",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { fs } = context.ports;
      const { profile, profileName, profileDir, cwd } = context;
      const packageName = profile.packageName;
      const directory = await fs.stat(profileDir);
      if (!directory.ok || directory.value.kind !== "directory") {
        const actual = directory.ok ? `found a ${directory.value.kind}` : directory.error.message;
        return blocked(
          `profile "${profileName}" has no directory at ${profileDir} (${actual}), so ${packageName} cannot be installed there`,
          `pass --profile with an existing profile under the DSH home (or create the isolated copy first); profile-present reports whether the profile exists`
        );
      }
      const manifestPath = joinFsPath(profileDir, "package.json");
      const profileManifest = await readJsonRecord(fs, manifestPath);
      if (!profileManifest.ok) {
        return failed(
          `could not read the profile manifest: ${manifestPath}`,
          `a readable JSON manifest at ${manifestPath}`,
          profileManifest.error.message,
          "reinstall the profile, or run profile-present to see the profile state"
        );
      }
      const dependencies = asRecord2(profileManifest.value["dependencies"]) ?? {};
      const declared = stringField(dependencies, packageName);
      if (declared === null) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "package-installed",
          { profileName, profileDir, packageName, declared: false, manifestPath },
          "the package is not declared by the profile",
          context.note
        );
        return failed(
          `profile "${profileName}" does not declare ${packageName} as a dependency`,
          `dependencies["${packageName}"] in ${manifestPath}`,
          "not declared",
          installHint(packageName, profileDir),
          evidence2
        );
      }
      const packageDir = joinFsPath(profileDir, "node_modules", ...packageName.split("/"));
      const installedManifestPath = joinFsPath(packageDir, "package.json");
      const installedManifest = await readJsonRecord(fs, installedManifestPath);
      if (!installedManifest.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "package-installed",
          {
            profileName,
            profileDir,
            packageName,
            declaredVersion: declared,
            packageDir,
            installedManifestPath,
            installed: false
          },
          "the declared package is not installed",
          context.note
        );
        return failed(
          `${packageName} is declared by the profile but not installed at ${packageDir}`,
          `a readable ${installedManifestPath}`,
          installedManifest.error.message,
          installHint(packageName, profileDir),
          evidence2
        );
      }
      const installedVersion = stringField(installedManifest.value, "version");
      if (installedVersion === null) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "package-installed",
          { packageName, installedManifestPath, installedVersion: null },
          "the installed manifest has no version",
          context.note
        );
        return failed(
          `the installed ${packageName} has no version in ${installedManifestPath}`,
          "the installed manifest declares a version",
          "no version field",
          installHint(packageName, profileDir),
          evidence2
        );
      }
      const clientEntry = profile.clientEntry;
      const clientEntryPath = joinFsPath(packageDir, clientEntry);
      const clientStats = await fs.stat(clientEntryPath);
      if (!clientStats.ok || clientStats.value.kind !== "file") {
        const actual = clientStats.ok ? `found a ${clientStats.value.kind}` : clientStats.error.message;
        const evidence2 = await recordEvidence(
          context.evidence,
          "package-installed",
          {
            profileName,
            packageName,
            installedVersion,
            packageDir,
            clientEntry,
            clientEntryPath,
            clientEntryPresent: false,
            actual
          },
          "the installed package has no client entry",
          context.note
        );
        return failed(
          `the installed ${packageName} has no client entry ${clientEntry}`,
          `${clientEntryPath} exists as a regular file inside the installed package`,
          actual,
          `rebuild the package (npm run build) and reinstall it: ${installHint(packageName, profileDir)}`,
          evidence2
        );
      }
      const clientHash = await fs.hashFile(clientEntryPath);
      if (!clientHash.ok) {
        return failed(
          `could not hash the installed client entry: ${clientEntryPath}`,
          "a readable client entry file",
          clientHash.error.message,
          "check file permissions, then rerun self-check",
          []
        );
      }
      const localManifestPath = joinFsPath(cwd, "package.json");
      const localManifest = await fs.readJson(localManifestPath);
      const localRecord = localManifest.ok ? asRecord2(localManifest.value) : null;
      const localName = localRecord === null ? null : stringField(localRecord, "name");
      const localVersion = localRecord === null ? null : stringField(localRecord, "version");
      const localMatches = localName === packageName && localVersion !== null;
      const evidence = await recordEvidence(
        context.evidence,
        "package-installed",
        {
          profileName,
          profileDir,
          packageName,
          declaredVersion: declared,
          packageDir,
          installedManifestPath,
          installedVersion,
          clientEntry,
          clientEntryPath,
          clientEntryBytes: clientStats.value.size,
          clientEntrySha256: clientHash.value,
          local: localMatches ? { name: localName, version: localVersion, manifestPath: localManifestPath } : { name: localName, version: localVersion, manifestPath: localManifestPath, notThePackage: true },
          versionComparison: localMatches ? "compared" : "skipped"
        },
        "the installed package, its version and its client entry hash",
        context.note
      );
      if (localMatches) {
        if (localVersion !== installedVersion) {
          return failed(
            `the installed ${packageName} is ${installedVersion} but the checked-out repository is ${localVersion}`,
            localVersion,
            installedVersion,
            `the profile is running an older/newer build; reinstall it: ${installHint(packageName, profileDir, localVersion)}`,
            evidence
          );
        }
        return passed(
          `${packageName} ${installedVersion} is installed in profile ${profileName} and matches the checked-out repository; clientEntry ${clientEntry} sha256 ${clientHash.value}`,
          evidence
        );
      }
      const basis = localManifestPath === null ? "the working directory has no package.json" : `the working directory's package.json ${localName === null ? "has no name" : `is ${localName}`}`;
      return passed(
        `${packageName} ${installedVersion} is installed in profile ${profileName}; clientEntry ${clientEntry} sha256 ${clientHash.value}; version comparison skipped because ${basis}, not ${packageName}`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/screen-present.ts
function createScreenPresentCheck() {
  return {
    id: checkId2("screen-present"),
    title: "the machine exposes at least one display",
    hard: false,
    requires: ["screen"],
    onMissing: "blocked",
    missingHint: "inject a ScreenPort (runtime/platform/screen.ts creates the Node one) so this check can enumerate displays",
    async run(context) {
      const screens = await context.ports.screen.screens();
      if (!screens.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "screen-present",
          { probed: true, ok: false, message: screens.error.message },
          "the screen probe failed",
          context.note
        );
        return blocked(
          `the screen probe could not report displays: ${screens.error.message}`,
          screens.error.hint ?? "provide a working ScreenPort (runtime/platform/screen.ts creates the Node one) or omit --screen to skip it",
          evidence2,
          {
            code: "prerequisite-missing",
            message: "the screen probe failed",
            hint: screens.error.hint ?? "provide a working ScreenPort, or omit --screen"
          }
        );
      }
      const list = screens.value;
      if (list.length === 0) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "screen-present",
          { probed: true, ok: true, screens: [] },
          "the screen probe reported no displays",
          context.note
        );
        return blocked(
          "the screen probe reported no displays (headless session?)",
          "run on a machine with a display, or omit --screen",
          evidence2,
          {
            code: "platform-unsupported",
            message: "the host exposes no display",
            hint: "run on a machine with a display, or omit --screen"
          }
        );
      }
      const primary = list.find((screen) => screen.primary) ?? list[0];
      const evidence = await recordEvidence(
        context.evidence,
        "screen-present",
        {
          probed: true,
          ok: true,
          screens: list.map((screen) => ({ id: screen.id, primary: screen.primary, width: screen.width, height: screen.height }))
        },
        "the displays the probe reported",
        context.note
      );
      return passed(
        list.length === 1 ? `one display: ${primary.width}x${primary.height}` : `${list.length} displays; primary ${primary.width}x${primary.height}`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/skills-set.ts
function describeDefects(shipped) {
  const defects = [];
  for (const mismatch of shipped.mismatches) {
    const declared = mismatch.declared === null ? "(missing)" : JSON.stringify(mismatch.declared);
    defects.push(mismatch.dirName + ": frontmatter name is " + declared);
  }
  for (const dirName of shipped.missingFrontmatter) {
    defects.push(dirName + ": SKILL.md has no readable frontmatter name");
  }
  return defects;
}
function createSkillsSetCheck() {
  return {
    id: checkId2("skills-set"),
    title: "the package ships exactly the declared skill set, in the repository and in the installed copy",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const declaration = context.profile.bundledSkills;
      if (declaration === false) {
        return skipped(
          "the profile declares no bundled skills",
          "set bundledSkills: { dir, expected } in verify/profile.ts to verify the shipped skill set"
        );
      }
      const { fs } = context.ports;
      const repoPath = joinFsPath(context.cwd, ...declaration.dir.split("/"));
      const repoShipped = await discoverShippedSkills(fs, repoPath);
      if (!repoShipped.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          { dir: declaration.dir, repo: { path: repoPath, readable: false, error: repoShipped.error.message } },
          "the repository skill directory is not readable",
          context.note
        );
        return failed(
          "could not read the repository skill directory " + repoPath + ": " + repoShipped.error.message,
          "a readable " + repoPath + " holding " + declaration.expected + " skill(s)",
          repoShipped.error.message,
          "check bundledSkills.dir in verify/profile.ts and that the package is built with its bundled skills directory",
          evidence2
        );
      }
      const repoDiscovery = repoShipped.value;
      const repoInspected = await inspectShippedSkills(repoDiscovery.skills);
      if (!repoInspected.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            repo: { path: repoPath, readable: true, names: [], ignored: [...repoDiscovery.ignored] }
          },
          "the repository skill directory holds no skills",
          context.note
        );
        return failed(
          "the repository ships no readable skills under " + repoPath,
          "a " + repoPath + " holding " + declaration.expected + " skill(s)",
          "no <name>/SKILL.md directory or flat <name>.md file was found",
          "build the bundled skills directory or fix bundledSkills.dir in verify/profile.ts",
          evidence2
        );
      }
      const repo = repoInspected.value;
      const repoDefects = describeDefects(repo);
      if (repoDefects.length > 0) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            repo: {
              path: repoPath,
              names: [...repo.names],
              mismatches: repo.mismatches,
              missingFrontmatter: repo.missingFrontmatter,
              ignored: [...repoDiscovery.ignored]
            }
          },
          "the repository ships skills the host would skip",
          context.note
        );
        return failed(
          "the repository ships skills the host would skip: " + repoDefects.join("; "),
          "every SKILL.md under " + repoPath + " has a frontmatter name equal to its directory name",
          repoDefects.join("; "),
          "rename the directory or fix the frontmatter name; the host drops a skill whose name and directory disagree without reporting an error",
          evidence2
        );
      }
      const packageName = context.profile.packageName;
      const packageDir = joinFsPath(context.profileDir, "node_modules", ...packageName.split("/"));
      const lookup = await findInstalledSkillsDir(fs, packageDir, declaration.dir);
      const installedDir = lookup.path;
      if (installedDir === null) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            repo: { path: repoPath, names: [...repo.names] },
            installed: { path: null, resolution: lookup.resolution, tried: lookup.tried, names: [], count: 0 }
          },
          "the installed package has no bundled skills directory",
          context.note
        );
        return blocked(
          "the installed " + packageName + " at " + packageDir + " has no " + declaration.dir + " skills directory (tried: " + lookup.tried.join(", ") + ")",
          "reinstall/rebuild " + packageName + " so it ships " + declaration.dir + ", or set bundledSkills: false in verify/profile.ts if this package does not ship skills",
          evidence2
        );
      }
      const installedShipped = await discoverShippedSkills(fs, installedDir);
      if (!installedShipped.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          { dir: declaration.dir, installed: { path: installedDir, resolution: lookup.resolution, readable: false } },
          "the installed skills directory is not readable",
          context.note
        );
        return failed(
          "could not read the installed skills directory " + installedDir + ": " + installedShipped.error.message,
          "a readable " + installedDir + " holding " + declaration.expected + " skill(s)",
          installedShipped.error.message,
          "rebuild the package and reinstall it into the profile, then rerun self-check",
          evidence2
        );
      }
      const installedDiscovery = installedShipped.value;
      const installedInspected = await inspectShippedSkills(installedDiscovery.skills);
      if (!installedInspected.ok) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            installed: {
              path: installedDir,
              resolution: lookup.resolution,
              names: [],
              ignored: [...installedDiscovery.ignored]
            }
          },
          "the installed skills directory holds no skills",
          context.note
        );
        return failed(
          "the installed " + packageName + " ships no readable skills under " + installedDir,
          declaration.expected + " skill(s) under " + installedDir,
          "no <name>/SKILL.md directory or flat <name>.md file was found",
          "rebuild the package and reinstall it into the profile, then rerun self-check",
          evidence2
        );
      }
      const installed = installedInspected.value;
      const installedDefects = describeDefects(installed);
      if (installedDefects.length > 0) {
        const evidence2 = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            installed: {
              path: installedDir,
              resolution: lookup.resolution,
              names: [...installed.names],
              mismatches: installed.mismatches,
              missingFrontmatter: installed.missingFrontmatter,
              ignored: [...installedDiscovery.ignored]
            }
          },
          "the installed package ships skills the host would skip",
          context.note
        );
        return failed(
          "the installed " + packageName + " ships skills the host would skip: " + installedDefects.join("; "),
          "every SKILL.md under " + installedDir + " has a frontmatter name equal to its directory name",
          installedDefects.join("; "),
          "rebuild the package so its bundled skills have matching directory and frontmatter names, then reinstall it",
          evidence2
        );
      }
      const missingInstalled = repo.names.filter((name) => !installed.names.includes(name));
      if (missingInstalled.length > 0) {
        const missingEvidence = await recordEvidence(
          context.evidence,
          "skills-set",
          {
            dir: declaration.dir,
            expected: declaration.expected,
            repo: {
              path: repoPath,
              names: [...repo.names],
              count: repo.names.length,
              mismatches: repo.mismatches,
              missingFrontmatter: repo.missingFrontmatter,
              ignored: [...repoDiscovery.ignored]
            },
            installed: {
              path: installedDir,
              resolution: lookup.resolution,
              tried: lookup.tried,
              names: [...installed.names],
              count: installed.names.length,
              ignored: [...installedDiscovery.ignored]
            },
            missingInstalled,
            modelCatalogUsed: false,
            caveat: MODEL_CATALOG_CAVEAT
          },
          "the installed package is missing skills the repository declares",
          context.note
        );
        return failed(
          "the installed " + packageName + " is missing " + missingInstalled.length + " skill(s) the repository ships: " + missingInstalled.join(", "),
          "the installed copy under " + installedDir + " ships all " + repo.names.length + " declared skill(s)",
          "missing from the installed copy: " + missingInstalled.join(", ") + "; installed: " + (installed.names.length === 0 ? "(none)" : installed.names.join(", ")),
          "rebuild the package so " + declaration.dir + " includes " + (missingInstalled.length === 1 ? "the missing skill" : "the missing skills") + ", then reinstall it into the profile; host user/project skill roots do not count as the package shipping a skill",
          missingEvidence
        );
      }
      const roots = await observeSkillRoots(fs, {
        cwd: context.cwd,
        dshHome: context.dshHome,
        homeDir: context.ports.env.homeDir(),
        agentsHome: context.ports.env.get("DSH_AGENTS_HOME"),
        bundledSkillDir: context.ports.env.get("DSH_BUNDLED_SKILL_DIR")
      });
      const installedObservations = installed.names.map((name) => ({
        name,
        source: "bundled",
        rank: 600,
        dir: joinFsPath(installedDir, name)
      }));
      const merged = mergeSkillObservations([
        ...installedObservations,
        ...skillObservationsFromRoots(roots)
      ]);
      const expectation = { names: repo.names, expectedCount: declaration.expected };
      const compared = compareSkillSets(expectation, merged.observations);
      const installedLeftovers = installed.names.filter((name) => !repo.names.includes(name));
      const rootSummary = roots.filter((root) => root.exists).length === 0 ? "none present" : roots.filter((root) => root.exists).map((root) => root.source + "=" + root.count).join(", ");
      const evidence = await recordEvidence(
        context.evidence,
        "skills-set",
        {
          dir: declaration.dir,
          expected: declaration.expected,
          repo: {
            path: repoPath,
            names: [...repo.names],
            count: repo.names.length,
            mismatches: repo.mismatches,
            missingFrontmatter: repo.missingFrontmatter,
            ignored: [...repoDiscovery.ignored]
          },
          installed: {
            path: installedDir,
            resolution: lookup.resolution,
            tried: lookup.tried,
            names: [...installed.names],
            count: installed.names.length,
            ignored: [...installedDiscovery.ignored]
          },
          roots: roots.map((root) => ({
            source: root.source,
            rank: root.rank,
            path: root.path,
            exists: root.exists,
            count: root.count,
            names: [...root.names],
            problems: [...root.problems]
          })),
          merged: {
            observations: merged.observations.map((observation) => ({
              name: observation.name,
              source: observation.source,
              rank: observation.rank ?? null
            })),
            conflicts: merged.conflicts
          },
          comparison: compared.ok ? compared.value : null,
          comparisonError: compared.ok ? null : compared.error.message,
          unexpectedInstalled: installedLeftovers,
          modelCatalogUsed: false,
          caveat: MODEL_CATALOG_CAVEAT
        },
        "the skill set observed in the repository, the installed package and the host roots",
        context.note
      );
      if (!compared.ok) {
        const leftover = installedLeftovers.length === 0 ? "" : "; the installed copy still declares " + installedLeftovers.join(", ") + ", which the repository no longer ships";
        return failed(
          "the declared skill count and the repository's skill set disagree" + leftover,
          "bundledSkills.expected = " + declaration.expected + " skill(s) in " + repoPath,
          repo.names.length + " skill(s) with a valid frontmatter name" + leftover,
          "restore the missing skill under " + repoPath + " or change bundledSkills.expected in verify/profile.ts to " + repo.names.length,
          evidence
        );
      }
      const comparison = compared.value;
      if (!comparison.ok) {
        return failed(
          "the observed skill registry does not match the declaration: " + describeComparison(comparison),
          "the declared set (" + comparison.expectedCount + "): " + repo.names.join(", "),
          "observed " + comparison.observedCount + " across the installed copy (" + installed.names.length + ") and host roots (" + rootSummary + ")",
          "reinstall/rebuild the package or fix bundledSkills in verify/profile.ts; a skill dropped on either side changes the set",
          evidence
        );
      }
      const ignoredDocs = [...repoDiscovery.ignored, ...installedDiscovery.ignored];
      const ignoredSummary = ignoredDocs.length === 0 ? "" : "; ignored non-skill markdown without frontmatter: " + ignoredDocs.map((entry) => entry.name).join(", ");
      return passed(
        "the repository ships " + repo.names.length + " skill(s) and the installed package ships " + installed.names.length + "; the merged registry contains exactly the declared " + comparison.expectedCount + "; host roots: " + rootSummary + ignoredSummary + "; judged from the file tree and frontmatter, not from a model-facing skill catalog",
        evidence
      );
    }
  };
}

// src/real-machine-verification/adapters/browser/loader.ts
import { pathToFileURL as pathToFileURL2 } from "node:url";
var nativeImport2 = (specifier) => {
  const load = new Function("specifier", "return import(specifier);");
  return load(specifier);
};
var BROWSER_ADAPTER_TEMPLATE = `// verify/browser.mjs \u2014 the adapter page checks import.
// Declare it in verify/profile.ts as:
//   browser: { module: "verify/browser.mjs" }
export default {
  async launch({ headless }) {
    const driver = await startMyBrowser({ headless }); // the plugin's own driver
    return {
      ok: true,
      value: {
        async newPage() {
          const page = await driver.openPage();
          return { ok: true, value: page }; // page implements BrowserPageHandle
        },
        async close() {
          await driver.close();
        },
      },
    };
  },
};
`;
function missingBrowserAdapterHint() {
  return [
    "inject a browser adapter for page-level checks:",
    `  1. add to verify/profile.ts: browser: { module: "verify/browser.mjs" }`,
    `     (or browser: { module: "verify/browser.mjs", exportName: "createBrowserAdapter" } for a named export)`,
    "  2. the module must export { launch({ headless }) } where launch returns",
    "     { ok: true, value: { newPage(), close() } } (or { ok: false, error })",
    "  3. every page must implement url(), evaluate(), innerSize(), outerSize(),",
    "     text(), screenshot(), pageErrors() and close() (contracts/ports.ts)",
    "without an adapter, page checks report blocked (exit 2), never fail.",
    "",
    BROWSER_ADAPTER_TEMPLATE
  ].join("\n");
}
function errorCode2(error) {
  if (error === null || typeof error !== "object") return null;
  const code = error.code;
  return typeof code === "string" ? code : null;
}
function describeThrown4(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function adapterFailure(kind, code, message, hint) {
  return err({ ...failure(code, message, hint), kind });
}
function looksLikePath(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/") || specifier.startsWith("\\") || /^[A-Za-z]:[\\/]/.test(specifier);
}
async function resolveSpecifier(fs, repoRoot, module) {
  let candidate = null;
  if (looksLikePath(module)) {
    candidate = isWindowsAbsolute(module) || isPosixAbsolute(module) ? module : resolveAgainst(repoRoot, module);
  } else if (module.includes("/") && !module.startsWith("@")) {
    candidate = joinFsPath(repoRoot, module);
  } else if (await fs.exists(joinFsPath(repoRoot, module))) {
    candidate = joinFsPath(repoRoot, module);
  }
  if (candidate === null) return { specifier: module, isPath: false, absolutePath: null };
  return { specifier: pathToFileURL2(candidate).href, isPath: true, absolutePath: candidate };
}
function classifyImportFailure2(error, specifier, isPath) {
  const code = errorCode2(error);
  const message = describeThrown4(error);
  const resolutionCodes = /* @__PURE__ */ new Set([
    "ERR_MODULE_NOT_FOUND",
    "ERR_PACKAGE_PATH_NOT_EXPORTED",
    "ERR_UNSUPPORTED_DIR_IMPORT"
  ]);
  if (code !== null && resolutionCodes.has(code)) {
    const missingPackage = /Cannot find package '([^']+)'/.exec(message)?.[1] ?? null;
    if (missingPackage !== null && !isPath) {
      return adapterFailure(
        "blocked",
        "prerequisite",
        `the browser adapter package ${missingPackage} is not installed in this repository: ${message}`,
        `install ${missingPackage} in the plugin repository (the adapter resolution starts there), then rerun`
      );
    }
    return adapterFailure(
      "blocked",
      "prerequisite",
      `the browser adapter module could not be resolved: ${specifier} (${message})`,
      missingBrowserAdapterHint()
    );
  }
  const runtimeCodes = /* @__PURE__ */ new Set([
    "ERR_UNKNOWN_FILE_EXTENSION",
    "ERR_UNSUPPORTED_ESM_URL_SCHEME",
    "ERR_UNKNOWN_MODULE_FORMAT"
  ]);
  if (code !== null && runtimeCodes.has(code)) {
    return adapterFailure(
      "blocked",
      "unsupported",
      `this Node cannot import the browser adapter (${code}): ${specifier}`,
      "upgrade Node (22.6+ can strip TypeScript types), or compile the adapter to .js/.mjs and point browser.module at the output; " + missingBrowserAdapterHint()
    );
  }
  return adapterFailure(
    "failed",
    "invalid-input",
    `the browser adapter module threw while loading: ${message}`,
    "the adapter must only define its factory; move side effects into launch();\n\n" + missingBrowserAdapterHint()
  );
}
function asFactory(value) {
  if (typeof value !== "object" || value === null) return null;
  const launch = value.launch;
  if (typeof launch !== "function") return null;
  return value;
}
async function loadBrowserAdapter(options) {
  const { fs, repoRoot, declaration } = options;
  if (typeof declaration.module !== "string" || declaration.module.length === 0) {
    return adapterFailure(
      "blocked",
      "invalid-input",
      "profile.browser.module is empty",
      missingBrowserAdapterHint()
    );
  }
  const resolved = await resolveSpecifier(fs, repoRoot, declaration.module);
  if (resolved.isPath && resolved.absolutePath !== null) {
    if (!await fs.exists(resolved.absolutePath)) {
      return adapterFailure(
        "blocked",
        "prerequisite",
        `the browser adapter module does not exist: ${resolved.absolutePath}`,
        `create the module, or point profile.browser.module at a path relative to ${repoRoot};

` + missingBrowserAdapterHint()
      );
    }
  }
  let namespace;
  try {
    namespace = await (options.importModule ?? nativeImport2)(resolved.specifier);
  } catch (error) {
    return classifyImportFailure2(error, resolved.specifier, resolved.isPath);
  }
  if (typeof namespace !== "object" || namespace === null) {
    return adapterFailure(
      "failed",
      "invalid-input",
      `the browser adapter ${resolved.specifier} did not load as a module`,
      missingBrowserAdapterHint()
    );
  }
  const exports = namespace;
  const requested = declaration.exportName;
  let value;
  let exportName;
  if (requested !== void 0) {
    if (!Object.prototype.hasOwnProperty.call(exports, requested)) {
      return adapterFailure(
        "failed",
        "invalid-input",
        `the browser adapter ${resolved.specifier} has no export named ${JSON.stringify(requested)}`,
        `export it, or drop browser.exportName to use the default export;

` + missingBrowserAdapterHint()
      );
    }
    value = exports[requested];
    exportName = requested;
  } else if (exports.default !== void 0) {
    value = exports.default;
    exportName = "default";
  } else {
    value = exports;
    exportName = "module";
  }
  const factory = asFactory(value);
  if (factory === null) {
    return adapterFailure(
      "failed",
      "invalid-input",
      `the browser adapter ${resolved.specifier} export ${exportName} is not a BrowserProbeFactory`,
      "expected an object with a launch({ headless }) function;\n\n" + missingBrowserAdapterHint()
    );
  }
  return {
    ok: true,
    value: { factory, specifier: resolved.specifier, module: declaration.module, exportName }
  };
}

// src/real-machine-verification/orchestration/primitives.ts
var PRIMITIVE_CHECK_IDS = [
  "package-installed",
  "skills-set",
  "model-configured",
  "model-credential",
  "screen-present"
];
function pageFailure(kind, failureValue) {
  return { ...failureValue, kind };
}
function resolveCheckModule(name) {
  switch (name) {
    case "package-installed":
      return createPackageInstalledCheck();
    case "skills-set":
      return createSkillsSetCheck();
    case "model-configured":
      return createModelConfiguredCheck();
    case "model-credential":
      return createModelCredentialCheck();
    case "screen-present":
      return createScreenPresentCheck();
  }
}
function pageWrapper(page) {
  return {
    page,
    url: () => page.url(),
    evaluate: (script) => page.evaluate(script),
    innerSize: () => page.innerSize(),
    outerSize: () => page.outerSize(),
    text: (selector) => page.text(selector),
    screenshot: (path, options) => page.screenshot(path, options),
    pageErrors: () => page.pageErrors(),
    close: () => page.close()
  };
}
function createPrimitives(options) {
  const { ports, profile, profileName, profileDir, dshHome, workRoot, repoRoot } = options;
  const note = options.note ?? (() => void 0);
  const binaryWriter = options.binaryWriter ?? createBinaryWriter();
  const active = [];
  const pages = /* @__PURE__ */ new Set();
  let pageFactory;
  let disposed = false;
  const selfCheckDeclaration = {
    path: "<scenario>",
    kind: "ts",
    exportName: "default",
    requiredNode: ">=22"
  };
  const selfCheckContext = () => ({
    profile,
    profileName,
    ports,
    cwd: repoRoot,
    dshHome,
    profileDir,
    workRoot,
    nodeVersion: options.runtime.nodeVersion,
    readFileSlice: options.runtime.readFileSlice,
    declaration: selfCheckDeclaration,
    screenRequested: true,
    evidence: options.evidence,
    note
  });
  async function resolveAdapter2() {
    if (options.adapter !== void 0) {
      return options.adapter === null ? err(pageFailure("blocked", failure("prerequisite", "no browser adapter was supplied to this scenario", "inject a BrowserProbeFactory or declare profile.browser"))) : ok(options.adapter);
    }
    if (ports.browser !== null) return ok(ports.browser);
    if (profile.browser === false) {
      return err(pageFailure("blocked", failure("prerequisite", "profile declares no browser adapter", "set profile.browser or inject one through the scenario runner")));
    }
    const loader = options.loadAdapter;
    if (loader !== void 0) {
      const loaded2 = await loader({ fs: ports.fs, repoRoot, declaration: profile.browser });
      return loaded2;
    }
    const loaded = await loadBrowserAdapter({
      fs: ports.fs,
      repoRoot,
      declaration: profile.browser,
      ...options.importModule === void 0 ? {} : { importModule: options.importModule }
    });
    if (!loaded.ok) return err(pageFailure(loaded.error.kind, loaded.error));
    return ok(loaded.value.factory);
  }
  async function adapter() {
    if (pageFactory !== void 0) {
      return pageFactory === null ? err(pageFailure("blocked", failure("prerequisite", "no browser adapter is available", "inject one or declare profile.browser"))) : ok(pageFactory);
    }
    const resolved = await resolveAdapter2();
    pageFactory = resolved.ok ? resolved.value : null;
    return resolved;
  }
  function rawProcess(handle) {
    return {
      pid: handle.record.pid,
      isAlive: () => ports.process.isAlive(handle.record.pid),
      kill: () => handle.stop()
    };
  }
  function makeHandle(executed) {
    let pageSession = null;
    let pageHandle = null;
    const closePage = async () => {
      if (pageHandle !== null) {
        try {
          await pageHandle.close();
        } catch {
        }
        pageHandle = null;
      }
      if (pageSession !== null) {
        for (const entry of [...pages]) {
          if (entry.session === pageSession) pages.delete(entry);
        }
        try {
          await pageSession.close();
        } catch {
        }
        pageSession = null;
      }
    };
    const handle = {
      record: executed.record,
      plan: executed.plan,
      pid: executed.record.pid,
      isAlive: () => ports.process.isAlive(executed.record.pid),
      stop: async () => {
        await closePage();
        return stopRecord(ports, executed.record);
      },
      kill: async () => handle.stop(),
      logs: async (bytes = 2e3) => {
        const stdout = await tailOf(ports.fs, executed.record.stdoutPath, bytes);
        const stderr = await tailOf(ports.fs, executed.record.stderrPath, bytes);
        const [stdoutExists, stderrExists] = await Promise.all([
          ports.fs.exists(executed.record.stdoutPath),
          ports.fs.exists(executed.record.stderrPath)
        ]);
        return ok({
          stdout,
          stderr,
          stdoutPath: executed.record.stdoutPath,
          stderrPath: executed.record.stderrPath,
          bytes,
          pid: executed.record.pid,
          alive: ports.process.isAlive(executed.record.pid),
          readable: stdoutExists && stderrExists
        });
      },
      page: async () => {
        if (pageHandle !== null) return ok(pageHandle);
        const factory = await adapter();
        if (!factory.ok) return factory;
        note("launching the browser adapter");
        const session = await factory.value.launch({ headless: options.headless ?? true });
        if (!session.ok) return err(pageFailure("blocked", session.error));
        const created = await session.value.newPage();
        if (!created.ok) {
          await session.value.close().catch(() => void 0);
          return err(pageFailure("blocked", created.error));
        }
        pageSession = session.value;
        pageHandle = pageWrapper(created.value);
        pages.add({ session: session.value, page: pageHandle });
        return ok(pageHandle);
      },
      rawProcess: () => rawProcess(handle)
    };
    return handle;
  }
  async function stopHandle(handle) {
    const stopped = await handle.stop();
    const index = active.indexOf(handle);
    if (index >= 0) active.splice(index, 1);
    return stopped;
  }
  async function findTarget(target) {
    if (target === void 0) return ok(active.length === 0 ? null : active[active.length - 1] ?? null);
    if (typeof target !== "string") return ok(target);
    const found = active.find(
      (handle) => handle.record.instanceId === target || handle.record.dir === target || String(handle.pid) === target
    );
    return found === void 0 ? err(failure("not-found", `no active instance matches ${JSON.stringify(target)}`, "launch it first in this scenario")) : ok(found);
  }
  const primitives = {
    async launch(launchOptions = {}) {
      if (disposed) return err({ code: "internal", message: "primitives were disposed", stage: "not-ready" });
      const startedAtMs = ports.clock.nowMs();
      const planned = await planInstance({
        ports,
        runtime: options.runtimePaths,
        dshHome,
        profileName,
        profile,
        profileDir,
        workRoot,
        ...launchOptions.port === void 0 ? {} : { port: launchOptions.port },
        keep: launchOptions.keep ?? false,
        startedAtMs
      });
      if (!planned.ok) return planned;
      const plan = planned.value;
      if (launchOptions.beforeLaunch !== void 0) {
        try {
          await launchOptions.beforeLaunch({ home: plan.layout.home, dir: plan.layout.dir, profile: profileName });
        } catch (error) {
          return err({
            code: "internal",
            message: `beforeLaunch hook failed: ${error instanceof Error ? error.message : String(error)}`,
            hint: "the hook runs before the process starts; fix it and rerun",
            stage: "prerequisite"
          });
        }
      }
      const beforeStart = launchOptions.prepareHome === void 0 ? void 0 : async (info) => {
        await launchOptions.prepareHome?.(info);
      };
      note(`launching ${profileName}`);
      const executed = await executeInstance({
        ports,
        plan,
        runtime: options.runtimePaths,
        note,
        ...launchOptions.readyTimeoutMs === void 0 ? {} : { readyTimeoutMs: launchOptions.readyTimeoutMs },
        ...beforeStart === void 0 ? {} : { beforeStart }
      });
      if (!executed.ok) return executed;
      const handle = makeHandle(executed.value);
      active.push(handle);
      if (launchOptions.afterLaunch !== void 0) {
        try {
          await launchOptions.afterLaunch(handle);
        } catch (error) {
          await stopHandle(handle);
          return err({
            code: "internal",
            message: `afterLaunch hook failed: ${error instanceof Error ? error.message : String(error)}`,
            hint: "the instance was stopped after the hook threw; fix the hook and rerun",
            stage: "not-ready"
          });
        }
      }
      return ok(handle);
    },
    async stop(target) {
      if (target === void 0) {
        const outcomes = [];
        for (const handle of [...active]) {
          const stopped2 = await stopHandle(handle);
          if (!stopped2.ok) return stopped2;
          outcomes.push(stopped2.value);
        }
        return ok(outcomes);
      }
      const found = await findTarget(target);
      if (!found.ok) return found;
      if (found.value === null) return ok([]);
      const stopped = await stopHandle(found.value);
      return stopped.ok ? ok([stopped.value]) : stopped;
    },
    async logs(target, bytes = 2e3) {
      const found = await findTarget(target);
      if (!found.ok) return found;
      if (found.value === null) return err(failure("not-found", "there is no active instance whose logs can be read", "launch an instance first"));
      return found.value.logs(bytes);
    },
    async page(target) {
      const found = await findTarget(target);
      if (!found.ok) return err(pageFailure("failed", found.error));
      if (found.value === null) return err(pageFailure("blocked", failure("prerequisite", "no active instance to open a page on", "launch an instance first")));
      return found.value.page();
    },
    async model() {
      if (profile.model === false) {
        return ok({ selection: false, patchPath: "", configured: false, observation: null, credential: null, note: "profile declares model: false" });
      }
      const observation = await readModelConfig(ports.fs, profileDir, profile.model);
      if (!observation.ok) return observation;
      const credential = await observeCredentialPresence(ports.fs, ports.env, dshHome, profile.model.apiKeyEnv);
      return ok({
        selection: profile.model,
        patchPath: observation.value.patchPath,
        configured: observation.value.state.configured,
        observation: observation.value,
        credential,
        note: observation.value.state.configured ? null : "the patch layer does not configure the declared model"
      });
    },
    async install(params) {
      return installPackage({
        ports,
        binaryWriter,
        tgzPath: params.tgz,
        method: params.method ?? "extract",
        dshHome,
        profileName,
        profileDir,
        packageName: profile.packageName,
        clientEntry: profile.clientEntry,
        candidatePath: params.candidate ?? null,
        note,
        ...options.npmCommand === void 0 ? {} : { npmCommand: options.npmCommand }
      });
    },
    async skills() {
      return primitives.check("skills-set");
    },
    async check(name) {
      if (!PRIMITIVE_CHECK_IDS.includes(name)) {
        return err(failure("invalid-input", `unknown built-in check ${JSON.stringify(name)}`, `use one of: ${PRIMITIVE_CHECK_IDS.join(", ")}`));
      }
      const module = resolveCheckModule(name);
      try {
        const outcome = await module.run(selfCheckContext());
        return ok({ id: name, title: module.title, outcome });
      } catch (error) {
        const failed2 = {
          status: "fail",
          detail: `check ${name} threw: ${error instanceof Error ? error.message : String(error)}`,
          expected: "the check returns an observation",
          actual: error instanceof Error ? error.message : String(error),
          hint: "this is a bug in the check; report it with the scenario file"
        };
        return ok({ id: name, title: module.title, outcome: failed2 });
      }
    },
    async evidence(name, value, evidenceOptions = {}) {
      if (evidenceOptions.json === true || typeof value !== "string") {
        return options.evidence.recordJson(name, value, {
          ...evidenceOptions.kind === void 0 ? {} : { kind: evidenceOptions.kind },
          ...evidenceOptions.note === void 0 ? {} : { note: evidenceOptions.note }
        });
      }
      return options.evidence.recordText(name, value, {
        ...evidenceOptions.kind === void 0 ? {} : { kind: evidenceOptions.kind },
        ...evidenceOptions.note === void 0 ? {} : { note: evidenceOptions.note }
      });
    },
    expect(observation) {
      return { ...observation, source: observation.source ?? "custom" };
    },
    async sleep(ms) {
      await ports.clock.sleep(ms);
    },
    instances() {
      return [...active];
    },
    lastInstance() {
      return active.length === 0 ? null : active[active.length - 1] ?? null;
    },
    async dispose() {
      if (disposed) return ok([]);
      disposed = true;
      const outcomes = [];
      for (const handle of [...active]) {
        const stopped = await stopHandle(handle);
        if (!stopped.ok) {
          for (const page of [...pages]) {
            await page.session.close().catch(() => void 0);
            pages.delete(page);
          }
          return stopped;
        }
        outcomes.push(stopped.value);
      }
      for (const page of [...pages]) {
        await page.session.close().catch(() => void 0);
        pages.delete(page);
      }
      return ok(outcomes);
    }
  };
  return primitives;
}
function checkObservation(result, options = {}) {
  const outcome = result.outcome;
  const status = outcome.status;
  return {
    checkId: result.id,
    title: options.title ?? result.title,
    ok: status === "pass" || status === "skip",
    status,
    detail: outcome.detail,
    ...outcome.expected === void 0 ? {} : { expected: outcome.expected },
    ...outcome.actual === void 0 ? {} : { actual: outcome.actual },
    ...outcome.hint === void 0 ? {} : { hint: outcome.hint },
    ...outcome.evidence === void 0 ? {} : { evidence: outcome.evidence.map((item) => item.path) },
    source: options.source ?? "builtin",
    hard: options.hard ?? true
  };
}
function observationToCheck(observation, fallback, index, evidenceRefs2) {
  const status = observation.status ?? (observation.ok ? "pass" : "fail");
  const effectiveStatus = status === "pass" && !observation.ok ? "fail" : status;
  const requestedId = observation.checkId ?? (index === 0 ? fallback.id : `${fallback.id}-${index + 1}`);
  const parsed = parseCheckId(requestedId);
  const id = parsed.ok ? parsed.value : checkId2(fallback.id);
  const normalized = normalizeOutcome({
    status: effectiveStatus,
    detail: observation.detail,
    ...observation.expected === void 0 ? {} : { expected: observation.expected },
    ...observation.actual === void 0 ? {} : { actual: observation.actual },
    ...observation.hint === void 0 ? {} : { hint: observation.hint },
    ...observation.evidence === void 0 ? {} : { evidence: evidenceRefs2(observation.evidence) }
  });
  return {
    id,
    title: observation.title ?? fallback.title,
    hard: observation.hard ?? true,
    status: normalized.status,
    detail: normalized.detail,
    ...normalized.expected === void 0 ? {} : { expected: normalized.expected },
    ...normalized.actual === void 0 ? {} : { actual: normalized.actual },
    ...normalized.hint === void 0 ? {} : { hint: normalized.hint },
    ...normalized.blockedReason === void 0 ? {} : { blockedReason: normalized.blockedReason },
    evidence: normalized.evidence ?? [],
    durationMs: 0,
    source: observation.source ?? fallback.source
  };
}

// src/real-machine-verification/orchestration/scenario-run.ts
var RUN_COMMAND = "run";
var MAX_SCENARIO_CONCURRENCY = 32;
function nativeImport3(specifier) {
  const load = new Function("specifier", "return import(specifier);");
  return load(specifier);
}
function loadFailure(stage, failureValue) {
  return { ...failureValue, stage };
}
function isRecord8(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function looksLikeScenario(value) {
  return isRecord8(value) && typeof value.id === "string" && typeof value.title === "string" && Array.isArray(value.steps);
}
function classifyImportError(error) {
  const code = isRecord8(error) && typeof error.code === "string" ? error.code : null;
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof SyntaxError) {
    return loadFailure("import", failure("invalid-input", `scenario module has a syntax error: ${message}`, "fix the scenario file; it is imported as plain ESM/TypeScript"));
  }
  if (code === "ERR_MODULE_NOT_FOUND" || code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || code === "ERR_UNSUPPORTED_DIR_IMPORT") {
    return loadFailure(
      "import",
      failure(
        "prerequisite",
        `scenario module could not be resolved: ${message}`,
        "check the path and that the scenario's imports exist; a scenario may only import this capability through its public entry"
      )
    );
  }
  if (code === "ERR_UNKNOWN_FILE_EXTENSION" || code === "ERR_UNSUPPORTED_ESM_URL_SCHEME" || code === "ERR_UNKNOWN_MODULE_FORMAT") {
    return loadFailure(
      "import",
      failure(
        "unsupported",
        `this Node runtime cannot import the scenario module: ${message}`,
        "run with a Node version that supports the scenario's extension, or write the scenario as .mjs/.js"
      )
    );
  }
  return loadFailure("import", failure("invalid-input", `scenario module failed to load: ${message}`, "fix the scenario file and rerun"));
}
function scenarioCandidates(module) {
  const candidates = [];
  const push = (name, value) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => candidates.push({ name: `${name}[${index}]`, value: entry }));
      return;
    }
    candidates.push({ name, value });
  };
  if ("default" in module) push("default", module.default);
  if ("scenarios" in module) push("scenarios", module.scenarios);
  for (const [name, value] of Object.entries(module)) {
    if (name === "default" || name === "scenarios") continue;
    if (looksLikeScenario(value)) push(name, value);
  }
  return candidates;
}
async function loadScenarioFile(options) {
  const { ports, cwd, repoRoot, specifier } = options;
  if (specifier.trim().length === 0) {
    return err(loadFailure("path", failure("invalid-input", "scenario path is empty", "pass a .ts/.mjs/.js file")));
  }
  const absolute = isWindowsAbsolute(specifier) || isPosixAbsolute(specifier);
  const bases = absolute ? [""] : [cwd, ...repoRoot === cwd ? [] : [repoRoot]];
  const extensions = ["", ".ts", ".mjs", ".js"];
  const tried = [];
  let resolved = null;
  for (const base of bases) {
    for (const extension of extensions) {
      const candidate = absolute ? specifier + extension : resolveAgainst(base, specifier + extension);
      tried.push(candidate);
      if (await ports.fs.exists(candidate)) {
        resolved = candidate;
        break;
      }
    }
    if (resolved !== null) break;
  }
  if (resolved === null) {
    return err(
      loadFailure(
        "path",
        failure(
          "prerequisite",
          `scenario file not found: ${specifier}`,
          `tried: ${tried.slice(0, 6).join(", ")}${tried.length > 6 ? " \u2026" : ""}`
        )
      )
    );
  }
  let module;
  try {
    module = await (options.importModule ?? nativeImport3)(pathToFileURL3(resolved).href);
  } catch (error) {
    return err(classifyImportError(error));
  }
  if (!isRecord8(module)) {
    return err(loadFailure("export", failure("invalid-input", `${resolved} did not export a module object`, "export a scenario with defineScenario()")));
  }
  const candidates = scenarioCandidates(module);
  if (candidates.length === 0) {
    return err(
      loadFailure(
        "export",
        failure(
          "invalid-input",
          `${resolved} exports no scenario`,
          "export one with `export default defineScenario({...})`, or export a `scenarios` array"
        )
      )
    );
  }
  const byId = /* @__PURE__ */ new Map();
  for (const candidate of candidates) {
    if (!looksLikeScenario(candidate.value)) {
      return err(
        loadFailure(
          "export",
          failure(
            "invalid-input",
            `${resolved} export ${candidate.name} is not a scenario`,
            "a scenario needs id, title and steps; use defineScenario() so this is checked where it is written"
          )
        )
      );
    }
    const parsed = parseScenario(candidate.value);
    if (!parsed.ok) {
      return err(loadFailure("validate", failure(parsed.error.code, `${candidate.name}: ${parsed.error.message}`, parsed.error.hint)));
    }
    const existing = byId.get(parsed.value.id);
    if (existing !== void 0) {
      if (existing.value === parsed.value) continue;
      return err(
        loadFailure(
          "validate",
          failure(
            "invalid-input",
            `scenario id ${parsed.value.id} is exported twice (${existing.name} and ${candidate.name})`,
            "give each scenario in the file a unique id"
          )
        )
      );
    }
    byId.set(parsed.value.id, { name: candidate.name, value: parsed.value });
  }
  return ok({ path: resolved, scenarios: [...byId.values()].map((entry) => entry.value) });
}
function stepSource(step) {
  return step.kind === "custom" ? "custom" : "builtin";
}
function failureObservation(step, detail, options = {}) {
  const status = options.status ?? "fail";
  return {
    checkId: step.id,
    title: step.title,
    ok: status === "pass" || status === "skip",
    status,
    detail,
    ...options.expected === void 0 ? {} : { expected: options.expected },
    ...options.actual === void 0 ? {} : { actual: options.actual },
    ...options.hint === void 0 ? {} : { hint: options.hint },
    source: options.source ?? stepSource(step)
  };
}
function paramsRecord(step) {
  return step.params ?? {};
}
function unknownParams(step, allowed) {
  const unknown = Object.keys(paramsRecord(step)).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return null;
  return failureObservation(step, `step ${step.id} has unknown param(s): ${unknown.join(", ")}`, {
    expected: `params from: ${allowed.join(", ") || "(none)"}`,
    actual: unknown.join(", "),
    hint: "remove the typo; built-in steps validate their parameters"
  });
}
function stringParam(record, key) {
  const value = record[key];
  return typeof value === "string" ? value : null;
}
function numberParam(record, key) {
  const value = record[key];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function booleanParam(record, key) {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}
function instanceFailureObservation(step, error) {
  const blocked2 = error.stage === "prerequisite";
  return failureObservation(step, error.message, {
    expected: "the instance reaches the ready line",
    actual: error.message,
    hint: error.hint ?? "read the launch logs and fix the prerequisite, then rerun",
    status: blocked2 ? "blocked" : "fail"
  });
}
function installFailureObservation(step, error) {
  const blocked2 = error.code === "prerequisite" || error.code === "unsupported";
  return failureObservation(step, error.message, {
    expected: "the candidate installs into the isolated profile",
    actual: error.message,
    hint: error.hint ?? "fix the tarball or profile, then rerun",
    status: blocked2 ? "blocked" : "fail"
  });
}
function checkToObservation(step, result, hard = true) {
  return checkObservation(result, { hard });
}
function checkResultToObservation(step, check) {
  return {
    checkId: check.id,
    title: check.title,
    ok: check.status === "pass" || check.status === "skip",
    status: check.status,
    detail: check.detail,
    ...check.expected === void 0 ? {} : { expected: check.expected },
    ...check.actual === void 0 ? {} : { actual: check.actual },
    ...check.hint === void 0 ? {} : { hint: check.hint },
    source: check.source ?? "builtin",
    hard: check.hard
  };
}
function normalizeCustomObservation(step, value) {
  if (!isRecord8(value)) {
    return failureObservation(step, "custom step returned a non-object observation", {
      expected: "ScenarioObservation objects",
      actual: JSON.stringify(value),
      hint: "return [{ ok, detail }] from run()"
    });
  }
  const detail = typeof value.detail === "string" ? value.detail : "custom observation has no detail";
  const ok3 = typeof value.ok === "boolean" ? value.ok : false;
  const status = typeof value.status === "string" ? value.status : void 0;
  if (status !== void 0 && !["pass", "fail", "skip", "blocked"].includes(status)) {
    return failureObservation(step, `custom observation has unknown status ${JSON.stringify(status)}`, {
      expected: "pass, fail, skip or blocked",
      actual: status,
      hint: "use one of the four CheckStatus values"
    });
  }
  const checkIdValue = typeof value.checkId === "string" ? value.checkId : void 0;
  if (checkIdValue !== void 0 && !CHECK_ID_RE.test(checkIdValue)) {
    return failureObservation(step, `custom observation checkId ${JSON.stringify(checkIdValue)} is not a check id`, {
      expected: "lowercase kebab-case, e.g. dock-below-360",
      actual: checkIdValue,
      hint: "check ids use the same rule as built-in ids: [a-z][a-z0-9-]{1,63}"
    });
  }
  const effectiveStatus = status ?? (ok3 ? "pass" : "fail");
  const effectiveOk = ok3 && effectiveStatus !== "fail" && effectiveStatus !== "blocked";
  return {
    ...checkIdValue === void 0 ? {} : { checkId: checkIdValue },
    ...typeof value.title === "string" ? { title: value.title } : {},
    ok: effectiveOk,
    status: effectiveStatus,
    detail,
    ...typeof value.expected === "string" ? { expected: value.expected } : {},
    ...typeof value.actual === "string" ? { actual: value.actual } : {},
    ...typeof value.hint === "string" ? { hint: value.hint } : {},
    ...Array.isArray(value.evidence) ? { evidence: value.evidence.filter((entry) => typeof entry === "string") } : {},
    ...typeof value.hard === "boolean" ? { hard: value.hard } : {},
    // A custom step is always custom: letting it claim "builtin" would erase the
    // one field the report uses to separate plugin checks from core checks.
    source: "custom"
  };
}
function observationsFrom(value, step) {
  if (!Array.isArray(value)) {
    return [
      failureObservation(step, "custom step run() did not return an array", {
        expected: "readonly ScenarioObservation[]",
        actual: typeof value,
        hint: "return an array, even when it holds one observation"
      })
    ];
  }
  return value.map((entry) => normalizeCustomObservation(step, entry));
}
async function executeStep(step, context, definition) {
  const { primitives } = context;
  switch (step.kind) {
    case "launch": {
      const unknown = unknownParams(step, ["port", "keep", "readyTimeoutMs"]);
      if (unknown !== null) return [unknown];
      const params = paramsRecord(step);
      const port = params.port === void 0 ? void 0 : numberParam(params, "port");
      if (params.port !== void 0 && (port === null || port === void 0 || port < 0 || port > 65535)) {
        return [failureObservation(step, "launch port must be an integer between 0 and 65535", {
          expected: "0..65535",
          actual: String(params.port),
          hint: "omit --port to let DSH choose one"
        })];
      }
      const keep = params.keep === void 0 ? false : booleanParam(params, "keep");
      if (keep === null) {
        return [failureObservation(step, "launch keep must be a boolean", { expected: "true or false", actual: String(params.keep), hint: "drop keep to default to false" })];
      }
      const readyTimeoutMs = params.readyTimeoutMs === void 0 ? void 0 : numberParam(params, "readyTimeoutMs");
      if (params.readyTimeoutMs !== void 0 && (readyTimeoutMs === null || readyTimeoutMs === void 0 || readyTimeoutMs <= 0)) {
        return [failureObservation(step, "launch readyTimeoutMs must be a positive integer", { expected: "positive integer", actual: String(params.readyTimeoutMs), hint: "drop readyTimeoutMs to use the launch default" })];
      }
      const launched = await primitives.launch({
        ...port === null || port === void 0 ? {} : { port },
        keep,
        ...readyTimeoutMs === null || readyTimeoutMs === void 0 ? {} : { readyTimeoutMs },
        ...definition.hooks?.beforeLaunch === void 0 ? {} : { beforeLaunch: (info) => definition.hooks?.beforeLaunch?.(context, info) },
        ...definition.hooks?.prepareHome === void 0 ? {} : { prepareHome: (info) => definition.hooks?.prepareHome?.(context, info) },
        ...definition.hooks?.afterLaunch === void 0 ? {} : { afterLaunch: (handle) => definition.hooks?.afterLaunch?.(context, { instance: handle }) }
      });
      if (!launched.ok) return [instanceFailureObservation(step, launched.error)];
      return [
        {
          checkId: step.id,
          title: step.title,
          ok: true,
          status: "pass",
          detail: `instance ${launched.value.record.instanceId ?? launched.value.pid} is ready at ${launched.value.record.originUrl} (pid ${launched.value.pid})`,
          source: "builtin"
        }
      ];
    }
    case "stop": {
      const unknown = unknownParams(step, ["id"]);
      if (unknown !== null) return [unknown];
      const id = stringParam(paramsRecord(step), "id") ?? void 0;
      const stopped = await primitives.stop(id);
      if (!stopped.ok) {
        return [failureObservation(step, stopped.error.message, { expected: "the instance stops", actual: stopped.error.message, hint: stopped.error.hint })];
      }
      return [
        {
          checkId: step.id,
          title: step.title,
          ok: true,
          status: "pass",
          detail: `stopped ${stopped.value.length} instance(s)`,
          source: "builtin"
        }
      ];
    }
    case "logs": {
      const unknown = unknownParams(step, ["id", "bytes"]);
      if (unknown !== null) return [unknown];
      const params = paramsRecord(step);
      const id = stringParam(params, "id") ?? void 0;
      const bytes = params.bytes === void 0 ? 4e3 : numberParam(params, "bytes");
      if (bytes === null || bytes <= 0) {
        return [failureObservation(step, "logs bytes must be a positive integer", { expected: "positive integer", actual: String(params.bytes), hint: "omit bytes to read the last 4000 bytes" })];
      }
      const logs = await primitives.logs(id, bytes);
      if (!logs.ok) {
        return [failureObservation(step, logs.error.message, { expected: "stdout/stderr log files", actual: logs.error.message, hint: logs.error.hint })];
      }
      if (!logs.value.readable) {
        return [failureObservation(step, "instance log files are missing", {
          expected: `${logs.value.stdoutPath} and ${logs.value.stderrPath}`,
          actual: "one or both files are absent",
          hint: "the instance may have been stopped and its directory cleaned; read logs before stop"
        })];
      }
      return [
        {
          checkId: step.id,
          title: step.title,
          ok: true,
          status: "pass",
          detail: `read ${bytes} bytes from stdout/stderr (pid ${logs.value.pid}, alive: ${logs.value.alive})`,
          source: "builtin"
        }
      ];
    }
    case "model": {
      const unknown = unknownParams(step, []);
      if (unknown !== null) return [unknown];
      const model = await primitives.model();
      if (!model.ok) {
        return [failureObservation(step, model.error.message, {
          expected: "a readable profile patch layer",
          actual: model.error.message,
          hint: model.error.hint,
          status: model.error.code === "prerequisite" ? "blocked" : "fail"
        })];
      }
      if (model.value.selection === false) {
        return [{ checkId: step.id, title: step.title, ok: true, status: "skip", detail: "profile declares model: false", source: "builtin" }];
      }
      if (!model.value.configured) {
        return [failureObservation(step, "the profile does not configure the declared model", {
          expected: `${model.value.selection.provider}/${model.value.selection.model}`,
          actual: model.value.observation?.state.problems?.map((problem2) => problem2.code).join(", ") ?? "not configured",
          hint: "run dsh-verify model --fix against this profile, then rerun"
        })];
      }
      return [
        {
          checkId: step.id,
          title: step.title,
          ok: true,
          status: "pass",
          detail: `${model.value.selection.provider}/${model.value.selection.model} is configured; credential ${model.value.credential?.available === true ? `present via ${model.value.credential.source}` : "not observed"}`,
          source: "builtin"
        }
      ];
    }
    case "install": {
      const unknown = unknownParams(step, ["tgz", "method", "candidate"]);
      if (unknown !== null) return [unknown];
      const params = paramsRecord(step);
      const tgz = stringParam(params, "tgz");
      if (tgz === null || tgz.length === 0) {
        return [failureObservation(step, "install requires a tgz path", { expected: "params.tgz", actual: String(params.tgz), hint: "pass the candidate .tgz" })];
      }
      const method = params.method === void 0 ? "extract" : stringParam(params, "method");
      if (method !== "extract" && method !== "cli") {
        return [failureObservation(step, "install method must be extract or cli", { expected: "extract | cli", actual: String(params.method), hint: "omit method to default to extract" })];
      }
      const candidate = params.candidate === void 0 ? null : stringParam(params, "candidate");
      if (params.candidate !== void 0 && candidate === null) {
        return [failureObservation(step, "install candidate must be a path", { expected: "a candidate directory or candidate.json", actual: String(params.candidate), hint: "omit candidate to verify against the tarball" })];
      }
      const installed = await primitives.install({ tgz, method, candidate });
      if (!installed.ok) return [installFailureObservation(step, installed.error)];
      return installed.value.checks.map((check) => checkResultToObservation(step, check));
    }
    case "skills": {
      const unknown = unknownParams(step, []);
      if (unknown !== null) return [unknown];
      const skills = await primitives.skills();
      if (!skills.ok) {
        return [failureObservation(step, skills.error.message, { expected: "the skills-set check runs", actual: skills.error.message, hint: skills.error.hint })];
      }
      return [checkToObservation(step, skills.value)];
    }
    case "check": {
      const unknown = unknownParams(step, ["check", "hard"]);
      if (unknown !== null) return [unknown];
      const params = paramsRecord(step);
      const name = stringParam(params, "check");
      if (name === null || !PRIMITIVE_CHECK_IDS.includes(name)) {
        return [failureObservation(step, `unknown built-in check ${JSON.stringify(params.check)}`, {
          expected: PRIMITIVE_CHECK_IDS.join(", "),
          actual: String(params.check),
          hint: "use one of the built-in check ids"
        })];
      }
      const hard = params.hard === void 0 ? true : booleanParam(params, "hard");
      if (hard === null) {
        return [failureObservation(step, "check hard must be a boolean", { expected: "true or false", actual: String(params.hard), hint: "omit hard to default to true" })];
      }
      const checked = await primitives.check(name);
      if (!checked.ok) {
        return [failureObservation(step, checked.error.message, { expected: "the built-in check runs", actual: checked.error.message, hint: checked.error.hint })];
      }
      return [checkToObservation(step, checked.value, hard)];
    }
    case "evidence": {
      const unknown = unknownParams(step, ["name", "text", "json", "kind", "note"]);
      if (unknown !== null) return [unknown];
      const params = paramsRecord(step);
      const name = stringParam(params, "name");
      if (name === null || name.length === 0) {
        return [failureObservation(step, "evidence requires a name", { expected: "params.name", actual: String(params.name), hint: "pass a stable evidence stem" })];
      }
      if (params.text !== void 0 && params.json !== void 0) {
        return [failureObservation(step, "evidence takes text or json, not both", { expected: "one of text/json", actual: "both", hint: "drop one of them" })];
      }
      const kind = params.kind === void 0 ? void 0 : stringParam(params, "kind");
      const note = params.note === void 0 ? void 0 : stringParam(params, "note");
      const recorded = await primitives.evidence(
        name,
        params.json !== void 0 ? params.json : params.text,
        {
          ...params.json === void 0 ? {} : { json: true },
          ...kind === null || kind === void 0 ? {} : { kind },
          ...note === null || note === void 0 ? {} : { note }
        }
      );
      if (!recorded.ok) {
        return [failureObservation(step, recorded.error.message, { expected: "the evidence item is recorded", actual: recorded.error.message, hint: recorded.error.hint })];
      }
      return [{
        checkId: step.id,
        title: step.title,
        ok: true,
        status: "pass",
        detail: `recorded evidence ${recorded.value.path}`,
        evidence: [recorded.value.path],
        source: "builtin"
      }];
    }
    case "sleep": {
      const unknown = unknownParams(step, ["ms"]);
      if (unknown !== null) return [unknown];
      const ms = numberParam(paramsRecord(step), "ms");
      if (ms === null || ms < 0) {
        return [failureObservation(step, "sleep requires a non-negative integer ms", { expected: "ms >= 0", actual: String(paramsRecord(step).ms), hint: "pass params: { ms: 500 }" })];
      }
      await primitives.sleep(ms);
      return [{ checkId: step.id, title: step.title, ok: true, status: "pass", detail: `slept ${ms}ms`, source: "builtin" }];
    }
    case "custom": {
      if (step.run === void 0) {
        return [failureObservation(step, "custom step has no run()", { expected: "run()", actual: "missing", hint: "define the step with kind custom and a body" })];
      }
      try {
        return observationsFrom(await step.run(context), step);
      } catch (error) {
        return [failureObservation(step, `custom step threw: ${error instanceof Error ? error.message : String(error)}`, {
          expected: "run() returns observations",
          actual: error instanceof Error ? error.message : String(error),
          hint: "catch expected errors inside the scenario and return an observation instead"
        })];
      }
    }
  }
}
function stepFailed(observations) {
  return observations.some(
    (observation) => observation.ok === false || observation.status === "fail" || observation.status === "blocked"
  );
}
function skippedObservation(step, reason) {
  return {
    checkId: step.id,
    title: step.title,
    ok: true,
    status: "skip",
    detail: reason,
    source: stepSource(step)
  };
}
async function adoptDeclaredEvidence(observations, store, adopted, note) {
  for (const observation of observations) {
    for (const declared of observation.evidence ?? []) {
      if (adopted.has(declared)) continue;
      const absolute = isPosixAbsolute(declared) || isWindowsAbsolute(declared) ? declared : joinFsPath(store.root, declared);
      const recorded = await store.recordFile(absolute);
      if (!recorded.ok) {
        note(`evidence ${declared} was not recorded: ${recorded.error.message}`);
        continue;
      }
      adopted.set(declared, { path: recorded.value.path, sha256: recorded.value.sha256, kind: recorded.value.kind });
    }
  }
}
function evidenceResolver(store, adopted) {
  const items = store.items();
  return (paths) => paths.flatMap((path) => {
    const registered = adopted.get(path);
    if (registered !== void 0) return [registered];
    const found = items.find(
      (item) => item.path === path || item.path.endsWith(`/${path}`) || item.path.endsWith(`\\${path}`)
    );
    return found === void 0 ? [] : [{ path: found.path, sha256: found.sha256, kind: found.kind }];
  });
}
async function runOne(definition, options) {
  const note = options.note ?? (() => void 0);
  const prefix = `scenario ${definition.id}`;
  const primitives = createPrimitives({
    ports: options.ports,
    runtime: options.runtime,
    runtimePaths: options.runtimePaths,
    dshHome: options.dshHome,
    workRoot: options.workRoot,
    repoRoot: options.repoRoot,
    profileName: options.profileName,
    profile: options.profile,
    profileDir: options.profileDir,
    evidence: options.evidence,
    note: (message) => note(`${prefix}: ${message}`),
    ...options.binaryWriter === void 0 ? {} : { binaryWriter: options.binaryWriter },
    ...options.adapter === void 0 ? {} : { adapter: options.adapter },
    ...options.importModule === void 0 ? {} : { importModule: options.importModule },
    ...options.npmCommand === void 0 ? {} : { npmCommand: options.npmCommand },
    ...options.headless === void 0 ? {} : { headless: options.headless }
  });
  const context = () => ({
    scenarioId: definition.id,
    primitives,
    instance: primitives.lastInstance(),
    instances: primitives.instances(),
    evidence: options.evidence,
    note
  });
  const stepResults = [];
  const runSteps = [];
  const adoptedEvidence = /* @__PURE__ */ new Map();
  let stopped = false;
  for (const step of definition.steps) {
    const startedAt = options.ports.clock.nowMs();
    const startedIso = options.ports.clock.iso(startedAt);
    if (stopped) {
      const observations2 = [skippedObservation(step, `not run: --fail-fast stopped after the first failing step`)];
      stepResults.push({ stepId: step.id, title: step.title, state: "skipped", observations: observations2, durationMs: 0 });
      runSteps.push({ id: step.id, title: step.title, startedAt: startedIso, finishedAt: startedIso, state: "skipped", detail: "not run: --fail-fast" });
      continue;
    }
    const current = context();
    if (step.skipWhen !== void 0) {
      let skip = false;
      try {
        skip = await step.skipWhen(current);
      } catch (error) {
        const observations2 = [failureObservation(step, `skipWhen threw: ${error instanceof Error ? error.message : String(error)}`, {
          expected: "skipWhen returns a boolean",
          actual: error instanceof Error ? error.message : String(error),
          hint: "fix the predicate; a throwing predicate is a failed step, not a skip"
        })];
        const finishedAt2 = options.ports.clock.nowMs();
        stepResults.push({ stepId: step.id, title: step.title, state: "failed", observations: observations2, durationMs: finishedAt2 - startedAt });
        runSteps.push({ id: step.id, title: step.title, startedAt: startedIso, finishedAt: options.ports.clock.iso(finishedAt2), state: "failed", detail: observations2[0]?.detail });
        if (options.failFast === true) stopped = true;
        continue;
      }
      if (skip) {
        const observations2 = [skippedObservation(step, "skipWhen returned true")];
        const finishedAt2 = options.ports.clock.nowMs();
        stepResults.push({ stepId: step.id, title: step.title, state: "skipped", observations: observations2, durationMs: finishedAt2 - startedAt });
        runSteps.push({ id: step.id, title: step.title, startedAt: startedIso, finishedAt: options.ports.clock.iso(finishedAt2), state: "skipped", detail: "skipWhen returned true" });
        continue;
      }
    }
    let observations;
    try {
      observations = await executeStep(step, current, definition);
    } catch (error) {
      observations = [failureObservation(step, `step threw: ${error instanceof Error ? error.message : String(error)}`, {
        expected: "the step returns observations",
        actual: error instanceof Error ? error.message : String(error),
        hint: "this is a bug in the step; report it with the scenario file"
      })];
    }
    const finishedAt = options.ports.clock.nowMs();
    await adoptDeclaredEvidence(observations, options.evidence, adoptedEvidence, note);
    const failed2 = stepFailed(observations);
    stepResults.push({
      stepId: step.id,
      title: step.title,
      state: failed2 ? "failed" : "done",
      observations,
      durationMs: finishedAt - startedAt
    });
    runSteps.push({
      id: step.id,
      title: step.title,
      startedAt: startedIso,
      finishedAt: options.ports.clock.iso(finishedAt),
      state: failed2 ? "failed" : "done",
      ...failed2 ? { detail: observations.find((observation) => observation.ok === false)?.detail ?? "step failed" } : {}
    });
    if (failed2 && options.failFast === true) stopped = true;
  }
  const checks = [];
  const refs = evidenceResolver(options.evidence, adoptedEvidence);
  for (const stepResult of stepResults) {
    stepResult.observations.forEach((observation, index) => {
      checks.push(
        observationToCheck(
          observation,
          { id: stepResult.stepId, title: stepResult.title, source: stepResult.observations[0]?.source ?? "builtin" },
          index,
          refs
        )
      );
    });
    if (stepResult.state === "failed" && stepResult.observations.length === 0) {
      checks.push({
        id: checkId2(stepResult.stepId),
        title: stepResult.title,
        hard: true,
        status: "fail",
        detail: "step failed without an observation",
        expected: "at least one observation",
        actual: "none",
        hint: "this is a bug in the runner or the step",
        evidence: [],
        durationMs: 0,
        source: "custom"
      });
    }
  }
  const disposed = await primitives.dispose();
  let cleanupCheck = null;
  if (!disposed.ok) {
    const detail = `could not stop every instance: ${disposed.error.message}`;
    const hint = disposed.error.hint ?? "run dsh-verify cleanup and stop the residual process";
    cleanupCheck = {
      id: checkId2("teardown-clean"),
      title: "scenario teardown leaves no process",
      hard: true,
      status: "blocked",
      detail,
      hint,
      blockedReason: { code: "prerequisite-missing", message: detail, hint },
      evidence: [],
      durationMs: 0,
      source: "builtin"
    };
  }
  const result = {
    scenarioId: definition.id,
    title: definition.title,
    ok: scenarioPassed(stepResults),
    steps: stepResults
  };
  return { result, checks, steps: runSteps, cleanupCheck };
}
async function runScenarios(definitions, options) {
  const note = options.note ?? (() => void 0);
  const concurrency = Math.max(1, Math.min(MAX_SCENARIO_CONCURRENCY, options.concurrency ?? 1));
  if (definitions.length === 0) {
    return err(failure("invalid-input", "no scenarios to run", "export at least one scenario from the file"));
  }
  for (const definition of definitions) {
    if (definition.profile !== void 0) {
      const parsed = parseProfileName(definition.profile);
      if (!parsed.ok) {
        return err(failure("invalid-input", `scenario ${definition.id} has an invalid profile ${JSON.stringify(definition.profile)}`, "profile names are lowercase kebab-case"));
      }
      if (parsed.value !== options.profileName) {
        return err(
          failure(
            "invalid-input",
            `scenario ${definition.id} targets profile ${parsed.value}, but this run loaded ${options.profileName}`,
            `rerun with --profile ${parsed.value}; one run loads one profile`
          )
        );
      }
    }
  }
  const ordered = new Array(definitions.length).fill(void 0);
  let next = 0;
  let stopScheduling = false;
  const worker = async () => {
    for (; ; ) {
      if (stopScheduling) return;
      const index = next;
      next += 1;
      if (index >= definitions.length) return;
      const definition = definitions[index];
      if (definition === void 0) return;
      note(`${definition.id}: starting`);
      const entry = await runOne(definition, options);
      ordered[index] = entry;
      if (options.failFast === true && entry.checks.some((check) => check.status === "fail" || check.status === "blocked")) {
        stopScheduling = true;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, definitions.length) }, () => worker()));
  const scenarios = [];
  const checks = [];
  const steps = [];
  for (const entry of ordered) {
    if (entry === void 0) continue;
    scenarios.push(entry.result);
    checks.push(...entry.checks);
    steps.push(...entry.steps);
    if (entry.cleanupCheck !== null) checks.push(entry.cleanupCheck);
  }
  const derived = stateFromChecks(checks);
  const skippedScenarios = definitions.length - scenarios.length;
  return ok({
    scenarios,
    checks,
    steps,
    notes: skippedScenarios > 0 ? [`--fail-fast stopped scheduling after the first failing scenario; ${skippedScenarios} of ${definitions.length} scenario(s) were not run`] : [],
    state: derived.state,
    exitCode: derived.exitCode
  });
}
function describeScenarioResult(result) {
  const failed2 = result.steps.filter((step) => step.state === "failed").length;
  const skipped2 = result.steps.filter((step) => step.state === "skipped").length;
  return `${result.scenarioId}: ${result.ok ? "passed" : "failed"} \u2014 ${result.steps.length} step(s), ${failed2} failed, ${skipped2} skipped`;
}

// src/real-machine-verification/cli/commands/run.ts
var RUN_USAGE = "dsh-verify run <scenario.ts> [--concurrency <n>] [--fail-fast|--collect-all] [--json] [--dry-run]";
var RUN_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--profile",
  "--declaration",
  "--work-root",
  "--concurrency",
  "--fail-fast",
  "--collect-all"
]);
function parseConcurrency(raw) {
  if (raw === void 0) return { value: 1 };
  if (!/^[0-9]+$/.test(raw)) {
    return { problem: `--concurrency needs an integer between 1 and ${MAX_SCENARIO_CONCURRENCY}, got "${raw}"` };
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_SCENARIO_CONCURRENCY) {
    return { problem: `--concurrency needs an integer between 1 and ${MAX_SCENARIO_CONCURRENCY}, got "${raw}"` };
  }
  return { value };
}
function runPlanJson(plan, context, scenarioFile, scenarios, options) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "run",
    ok: true,
    dryRun: true,
    plan: {
      workRoot: context.workRoot,
      runId: plan.runId,
      runDir: plan.runDir,
      evidenceDir: plan.evidenceDir,
      scenarioFile,
      scenarios: scenarios.map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        stepCount: scenario.steps.length
      })),
      scenarioCount: scenarios.length,
      stepCount: scenarios.reduce((total, scenario) => total + scenario.steps.length, 0),
      concurrency: options.concurrency,
      failFast: options.failFast,
      collectAll: options.collectAll,
      profile: context.profileName,
      profileDir: context.profileDir,
      dshHome: context.dshHome,
      repoRoot: options.repoRoot,
      runtime: options.runtime
    }
  })}
`;
}
function renderRunPlan(plan, scenarioFile, scenarios, options) {
  const lines = [];
  lines.push("run plan (dry run) \u2014 nothing was written and no scenario was executed");
  lines.push(`scenario file: ${scenarioFile}`);
  lines.push(`scenarios: ${scenarios.length} (${scenarios.reduce((total, item) => total + item.steps.length, 0)} step(s))`);
  for (const scenario of scenarios) lines.push(`  - ${scenario.id}: ${scenario.title} (${scenario.steps.length} step(s))`);
  lines.push(`run dir: ${plan.runDir}`);
  lines.push(`evidence dir: ${plan.evidenceDir}`);
  lines.push(`work root: ${options.workRoot}`);
  lines.push(`concurrency: ${options.concurrency} (mode: ${options.failFast ? "fail-fast" : "collect-all"})`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runScenarioCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems({ ...args, positional: args.positional.slice(0, 1) }, RUN_FLAGS);
  if (problems.length > 0) return emitUsageFailure(io, args.json, RUN_COMMAND, problems, RUN_USAGE);
  if (args.positional.length < 2) {
    return emitUsageFailure(io, args.json, RUN_COMMAND, ["run requires a scenario file"], RUN_USAGE);
  }
  if (args.positional.length > 2) {
    return emitUsageFailure(
      io,
      args.json,
      RUN_COMMAND,
      [`run takes exactly one scenario file, got ${args.positional.length - 1}`],
      RUN_USAGE
    );
  }
  if (args.failFast && args.collectAll) {
    return emitUsageFailure(
      io,
      args.json,
      RUN_COMMAND,
      ["--fail-fast and --collect-all are mutually exclusive"],
      RUN_USAGE
    );
  }
  const concurrency = parseConcurrency(args.concurrency);
  if ("problem" in concurrency) {
    return emitUsageFailure(io, args.json, RUN_COMMAND, [concurrency.problem], RUN_USAGE);
  }
  const cwd = ports.env.cwd();
  const repoRoot = await findProjectRoot(ports.fs, cwd);
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, loaded.error.stage, loaded.error.failure);
  }
  const context = loaded.value;
  const discovered = await discoverDsh({ fs: ports.fs, env: ports.env });
  if (!discovered.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, "runtime", discovered.error);
  }
  const runtimePaths = { exe: discovered.value.exe, cliJs: hostCliPath(discovered.value) };
  const scenarioSpecifier = args.positional[1] ?? "";
  const scenarioLoaded = await loadScenarioFile({
    ports,
    cwd,
    repoRoot,
    specifier: scenarioSpecifier,
    ...deps.importModule === void 0 ? {} : { importModule: deps.importModule }
  });
  if (!scenarioLoaded.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, `scenario-${scenarioLoaded.error.stage}`, scenarioLoaded.error);
  }
  const startedMs = ports.clock.nowMs();
  const startedAt = ports.clock.iso(startedMs);
  if (args.dryRun) {
    const planned = await planRunDirectory({
      fs: ports.fs,
      workRoot: context.workRoot,
      command: RUN_COMMAND,
      startedAt
    });
    if (!planned.ok) {
      return emitFailure(io, args.json, RUN_COMMAND, "report", planned.error);
    }
    if (args.json) {
      io.stdout(
        runPlanJson(
          planned.value,
          context,
          scenarioLoaded.value.path,
          scenarioLoaded.value.scenarios,
          {
            concurrency: concurrency.value,
            failFast: args.failFast,
            collectAll: args.collectAll,
            repoRoot,
            runtime: runtimePaths
          }
        )
      );
    } else {
      io.stdout(
        renderRunPlan(planned.value, scenarioLoaded.value.path, scenarioLoaded.value.scenarios, {
          concurrency: concurrency.value,
          failFast: args.failFast,
          collectAll: args.collectAll,
          workRoot: context.workRoot
        })
      );
    }
    return 0;
  }
  const prepared = await prepareRunDirectory({
    fs: ports.fs,
    workRoot: context.workRoot,
    command: RUN_COMMAND,
    startedAt
  });
  if (!prepared.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, "report", prepared.error);
  }
  const { runDir, runId, evidenceDir } = prepared.value;
  const evidence = createEvidenceStore({ fs: ports.fs, root: evidenceDir, clock: ports.clock });
  const note = (message) => {
    io.stderr(`dsh-verify run: ${message}
`);
  };
  const environment = await evidence.recordJson(
    "environment",
    {
      platform: ports.env.platform(),
      nodeVersion: deps.runtime.nodeVersion,
      cwd,
      workRoot: context.workRoot,
      dshHome: context.dshHome,
      profile: context.profileName,
      scenarioFile: scenarioLoaded.value.path,
      concurrency: concurrency.value,
      failFast: args.failFast,
      collectAll: args.collectAll
    },
    { note: "the environment this run observed" }
  );
  if (!environment.ok) note(`could not record environment evidence: ${formatFailure(environment.error)}`);
  const executed = await runScenarios(scenarioLoaded.value.scenarios, {
    ports,
    runtime: { nodeVersion: deps.runtime.nodeVersion, readFileSlice: deps.runtime.readFileSlice },
    runtimePaths,
    dshHome: context.dshHome,
    workRoot: context.workRoot,
    repoRoot,
    profileName: context.profileName,
    profile: context.profile,
    profileDir: context.profileDir,
    evidence,
    binaryWriter: deps.binaryWriter ?? createBinaryWriter(),
    ...deps.adapter === void 0 ? {} : { adapter: deps.adapter },
    ...deps.importModule === void 0 ? {} : { importModule: deps.importModule },
    ...deps.npmCommand === void 0 ? {} : { npmCommand: deps.npmCommand },
    ...deps.headless === void 0 ? {} : { headless: deps.headless },
    note,
    concurrency: concurrency.value,
    failFast: args.failFast
  });
  if (!executed.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, "scenario", executed.error);
  }
  const outcome = executed.value;
  const summary = await evidence.recordJson(
    "scenarios",
    {
      scenarios: outcome.scenarios.map((scenario) => ({
        id: scenario.scenarioId,
        title: scenario.title,
        ok: scenario.ok,
        steps: scenario.steps.map((step) => ({ id: step.stepId, state: step.state }))
      })),
      state: outcome.state,
      exitCode: outcome.exitCode
    },
    { note: "per-scenario step states" }
  );
  if (!summary.ok) note(`could not record the scenario summary: ${formatFailure(summary.error)}`);
  const items = evidence.items();
  const manifest = buildEvidenceManifest({
    generatedAt: ports.clock.iso(),
    batch: { name: runId, dir: runDir, root: context.workRoot },
    meta: {
      command: RUN_COMMAND,
      profile: context.profileName,
      scenarioFile: scenarioLoaded.value.path
    },
    summary: {
      state: outcome.state,
      exitCode: outcome.exitCode,
      scenarios: outcome.scenarios.length,
      checks: outcome.checks.length
    },
    checks: outcome.checks.map((check) => ({
      name: check.id,
      ok: check.status === "pass" || check.status === "skip",
      detail: check.detail,
      recordedAt: ports.clock.iso()
    })),
    items
  });
  const writtenManifest = await writeEvidenceManifest({
    fs: ports.fs,
    evidenceRoot: evidenceDir,
    manifest
  });
  if (!writtenManifest.ok) {
    note(`could not write the evidence manifest: ${formatFailure(writtenManifest.error)}`);
  }
  const report = finishRunReport(
    createRunReport({
      command: RUN_COMMAND,
      profile: context.profileName,
      startedAt,
      notes: [`work root: ${context.workRoot}`, `scenario: ${scenarioLoaded.value.path}`]
    }),
    {
      checks: outcome.checks,
      steps: outcome.steps,
      finishedAt: ports.clock.iso(),
      ...writtenManifest.ok ? { evidence: { manifestPath: writtenManifest.value.manifestPath, itemCount: items.length } } : {},
      artifacts: { report: joinFsPath(runDir, "run.json"), evidence: evidenceDir },
      notes: [
        `scenario file: ${scenarioLoaded.value.path}`,
        `concurrency: ${concurrency.value}`,
        `mode: ${args.failFast ? "fail-fast" : "collect-all"}`,
        ...outcome.notes
      ]
    }
  );
  const written = await writeRunReport({ fs: ports.fs, runDir, report });
  if (!written.ok) {
    return emitFailure(io, args.json, RUN_COMMAND, "report", written.error);
  }
  const finalReport = withReportDigest(report, written.value);
  const tail4 = {
    reportPath: written.value.reportPath,
    reportSha256: written.value.reportSha256,
    evidenceDir,
    evidenceCount: evidence.items().length
  };
  const scenarioLines = outcome.scenarios.map((scenario) => describeScenarioResult(scenario));
  const human = renderSelfCheckHuman(finalReport, tail4);
  if (args.json) {
    io.stdout(`${runReportJson(finalReport)}
`);
    io.stderr(`${[...scenarioLines, human].join("\n")}
`);
    io.stderr(`${verdictLine(finalReport)}
`);
  } else {
    if (scenarioLines.length > 0) io.stderr(`${scenarioLines.join("\n")}
`);
    io.stdout(`${human}
`);
  }
  return exitCodeOfRun(finalReport);
}

// src/real-machine-verification/orchestration/checks/dsh-runtime.ts
function discoveryStage(details) {
  const stage = details?.["stage"];
  return typeof stage === "string" ? stage : "exe-missing";
}
function createDshRuntimeCheck() {
  return {
    id: checkId2("dsh-runtime"),
    title: "DSH is installed with an executable and its host CLI entry",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { fs, env } = context.ports;
      const discovery = await discoverDsh({ fs, env });
      if (!discovery.ok) {
        const stage = discoveryStage(discovery.error.details);
        const tried = discovery.error.details?.["tried"];
        const evidence2 = await recordEvidence(
          context.evidence,
          "dsh-runtime",
          {
            found: false,
            stage,
            platform: env.platform(),
            message: discovery.error.message,
            tried: Array.isArray(tried) ? tried : []
          },
          "the DSH discovery attempt",
          context.note
        );
        const hint = discovery.error.hint ?? "install the DSH desktop app, pass --dsh-exe, set DSH_EXE, or put its dsh wrapper on PATH";
        if (stage === "structure-missing") {
          return failed(
            `found a DSH executable but the install is incomplete: ${discovery.error.message}`,
            "a DSH install with both an executable and resources/app.asar containing the host CLI entry",
            discovery.error.message,
            hint,
            evidence2
          );
        }
        return blocked("could not find a DSH desktop install on this machine", hint, evidence2);
      }
      const found = discovery.value;
      const exeStats = await fs.stat(found.exe);
      if (!exeStats.ok || exeStats.value.kind !== "file") {
        const actual = exeStats.ok ? `found a ${exeStats.value.kind}` : exeStats.error.message;
        const evidence2 = await recordEvidence(
          context.evidence,
          "dsh-runtime",
          { found: true, exe: found.exe, source: found.source, exeKind: exeStats.ok ? exeStats.value.kind : null },
          "the DSH executable that discovery reported",
          context.note
        );
        return failed(
          `the discovered DSH executable is not a regular file: ${found.exe}`,
          "the DSH executable is a regular file",
          actual,
          "reinstall DSH, or pass --dsh-exe/DSH_EXE pointing at the real executable",
          evidence2
        );
      }
      if (found.asarPath !== null) {
        if (context.readFileSlice === null) {
          const evidence3 = await recordEvidence(
            context.evidence,
            "dsh-runtime",
            { found: true, exe: found.exe, asarPath: found.asarPath, readFileSlice: false },
            "the install was found but its archive could not be inspected",
            context.note
          );
          return blocked(
            "cannot inspect resources/app.asar: the runtime did not provide a bounded file reader",
            "run this check through the dsh-verify CLI (or inject RuntimeFacts.readFileSlice) so the archive header is readable",
            evidence3
          );
        }
        const entry = await readAsarEntry(context.readFileSlice, found.asarPath, found.cliJs);
        if (!entry.ok) {
          const evidence3 = await recordEvidence(
            context.evidence,
            "dsh-runtime",
            {
              found: true,
              exe: found.exe,
              asarPath: found.asarPath,
              cliJs: found.cliJs,
              error: entry.error.message
            },
            "the archive was found but the host CLI entry is not in it",
            context.note
          );
          return failed(
            `app.asar does not contain the DSH host CLI entry: ${entry.error.message}`,
            `the archive at ${found.asarPath} contains ${found.cliJs}`,
            entry.error.message,
            "reinstall DSH; a desktop install without its host CLI entry cannot run an instance",
            evidence3
          );
        }
        const evidence2 = await recordEvidence(
          context.evidence,
          "dsh-runtime",
          {
            found: true,
            exe: found.exe,
            asarPath: found.asarPath,
            source: found.source,
            installRoot: found.installRoot,
            cliEntry: {
              path: entry.value.path,
              size: entry.value.size,
              offset: entry.value.offset,
              integritySha256: entry.value.integritySha256
            },
            tried: found.tried
          },
          "the DSH install and its archive entry",
          context.note
        );
        const location = found.installRoot ?? found.exe;
        const named = found.installRoot === null ? location : `${location} (executable ${found.exe})`;
        return passed(
          `found DSH at ${named}; app.asar contains ${entry.value.path} (${entry.value.size} bytes)`,
          evidence2
        );
      }
      const cliStats = await fs.stat(found.cliJs);
      const evidence = await recordEvidence(
        context.evidence,
        "dsh-runtime",
        {
          found: true,
          exe: found.exe,
          asarPath: null,
          cliJs: found.cliJs,
          source: found.source,
          installRoot: found.installRoot,
          cliKind: cliStats.ok ? cliStats.value.kind : null
        },
        "the unpacked DSH install",
        context.note
      );
      if (!cliStats.ok || cliStats.value.kind !== "file") {
        const actual = cliStats.ok ? `found a ${cliStats.value.kind}` : cliStats.error.message;
        return failed(
          `the DSH CLI entry is not a regular file: ${found.cliJs}`,
          "the DSH host CLI is a regular file",
          actual,
          "reinstall DSH, or pass --dsh-cli-js pointing at the real cli.js",
          evidence
        );
      }
      return passed(
        `found DSH at ${found.installRoot ?? found.exe} (unpacked CLI ${found.cliJs})`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/node-version.ts
function createNodeVersionCheck() {
  return {
    id: checkId2("node-version"),
    title: "the running Node satisfies the declaration's floor",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { nodeVersion, declaration } = context;
      const required = declaration.requiredNode;
      const satisfied = compareNodeVersions(nodeVersion, required) >= 0;
      const evidence = await recordEvidence(
        context.evidence,
        "node-version",
        {
          nodeVersion,
          requiredNode: required,
          declarationKind: declaration.kind,
          satisfied,
          floors: { typescript: NODE_MIN_FOR_TYPESCRIPT, javascript: NODE_MIN_FOR_JAVASCRIPT }
        },
        "the Node version and the floor it was compared with",
        context.note
      );
      if (satisfied) {
        return passed(
          `Node ${nodeVersion} satisfies the ${required} floor for ${declaration.kind} declarations`,
          evidence
        );
      }
      return failed(
        `Node ${nodeVersion} is older than the ${required} floor for ${declaration.kind} declarations`,
        `Node ${required} or newer`,
        `Node ${nodeVersion}`,
        declaration.kind === "ts" ? `upgrade Node to ${required}+ (native type stripping), or compile the declaration with tsc and pass the .js file via --declaration` : `upgrade Node to ${required}+, the base package's engines floor`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/profile-declaration.ts
function createProfileDeclarationCheck() {
  return {
    id: checkId2("profile-declaration"),
    title: "the plugin declares and loads its verification profile",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { declaration, profile } = context;
      const evidence = await recordEvidence(
        context.evidence,
        "profile-declaration",
        {
          path: declaration.path,
          kind: declaration.kind,
          exportName: declaration.exportName,
          requiredNode: declaration.requiredNode,
          profile: {
            id: profile.id,
            packageName: profile.packageName,
            defaultProfile: profile.defaultProfile,
            clientEntry: profile.clientEntry
          }
        },
        "the declaration this run trusted",
        context.note
      );
      return passed(
        `loaded ${declaration.kind} declaration ${declaration.path} (export ${declaration.exportName})`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/checks/profile-present.ts
function createProfilePresentCheck() {
  return {
    id: checkId2("profile-present"),
    title: "the DSH home contains the profile under verification",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { fs } = context.ports;
      const { profileName, profileDir, dshHome } = context;
      const directory = await fs.stat(profileDir);
      if (!directory.ok || directory.value.kind !== "directory") {
        const actual = directory.ok ? `found a ${directory.value.kind}` : directory.error.message;
        const evidence2 = await recordEvidence(
          context.evidence,
          "profile-present",
          { dshHome, profileName, profileDir, present: false, actual },
          "the profile directory was not found",
          context.note
        );
        return blocked(
          `profile "${profileName}" was not found under ${dshHome}`,
          `open DSH once with the "${profileName}" profile (or pass --profile with an existing one); expected ${profileDir}`,
          evidence2
        );
      }
      const manifestPath = `${profileDir}/package.json`;
      const manifest = await readJsonRecord(fs, manifestPath);
      if (!manifest.ok) {
        const exists = await fs.exists(manifestPath);
        const evidence2 = await recordEvidence(
          context.evidence,
          "profile-present",
          { dshHome, profileName, profileDir, manifestPath, manifestReadable: false },
          "the profile directory exists but its manifest could not be read",
          context.note
        );
        if (!exists) {
          return blocked(
            `profile "${profileName}" has no package.json`,
            `open DSH once with this profile so it writes ${manifestPath}, or reinstall the profile`,
            evidence2
          );
        }
        return failed(
          `the profile manifest is not readable JSON: ${manifestPath}`,
          "a readable JSON profile manifest",
          manifest.error.message,
          "repair or reinstall the profile; DSH will not load a corrupt one either",
          evidence2
        );
      }
      const evidence = await recordEvidence(
        context.evidence,
        "profile-present",
        {
          dshHome,
          profileName,
          profileDir,
          manifestPath,
          manifestName: stringField(manifest.value, "name"),
          manifestVersion: stringField(manifest.value, "version")
        },
        "the profile that will be verified",
        context.note
      );
      const version = stringField(manifest.value, "version");
      return passed(
        `profile "${profileName}" is present under ${dshHome}${version === null ? "" : ` (manifest ${version})`}`,
        evidence
      );
    }
  };
}

// src/real-machine-verification/orchestration/self-check.ts
var SELF_CHECK_COMMAND = "self-check";
function toCustomCheck(custom) {
  return {
    id: custom.id,
    title: custom.title,
    hard: custom.hard ?? true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const observed = await custom.run(context);
      if (typeof observed === "boolean") {
        return observed ? passed("the custom check reported success") : failed(
          "the custom check reported failure",
          "the custom check's claim holds",
          "the check returned false",
          "inspect the plugin's custom check implementation"
        );
      }
      const status = observed.status ?? (observed.ok === void 0 ? "fail" : observed.ok ? "pass" : "fail");
      if (status === "pass") return passed(observed.detail);
      if (status === "skip") return skipped(observed.detail, observed.hint, void 0);
      if (status === "blocked") {
        return blocked(
          observed.detail,
          observed.hint ?? "the plugin check could not observe the product; resolve the blocker and rerun",
          void 0,
          observed.blockedReason
        );
      }
      return failed(
        observed.detail,
        observed.expected ?? "the custom check's claim holds",
        observed.actual ?? observed.detail,
        observed.hint ?? "inspect the plugin's custom check implementation"
      );
    }
  };
}
function planSelfCheck(input) {
  const checks = [
    createProfileDeclarationCheck(),
    createDshRuntimeCheck(),
    createNodeVersionCheck(),
    createProfilePresentCheck(),
    createPackageInstalledCheck(),
    createSkillsSetCheck(),
    createModelConfiguredCheck(),
    createModelCredentialCheck()
  ];
  if (input.screenRequested) checks.push(createScreenPresentCheck());
  const seen = new Set(checks.map((check) => check.id));
  for (const custom of input.profile.checks) {
    if (seen.has(custom.id)) continue;
    seen.add(custom.id);
    checks.push(toCustomCheck(custom));
  }
  return { command: SELF_CHECK_COMMAND, checks };
}

// src/real-machine-verification/cli/commands/self-check.ts
var DECLARATION_CHECK_ID = checkId2("profile-declaration");
var DECLARATION_CHECK_TITLE = "the plugin declares and loads its verification profile";
var SELF_CHECK_USAGE = "dsh-verify self-check [--profile <p>] [--declaration <file>] [--work-root <dir>] [--screen] [--json] [--dry-run]";
var SELF_CHECK_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--dry-run",
  "--profile",
  "--declaration",
  "--work-root",
  "--screen"
]);
function selfCheckPlanJson(plan, environment, checks) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: SELF_CHECK_COMMAND,
    ok: true,
    dryRun: true,
    plan: {
      workRoot: environment.workRoot,
      runId: plan.runId,
      runDir: plan.runDir,
      evidenceDir: plan.evidenceDir,
      profile: environment.profile,
      profileDir: environment.profileDir,
      dshHome: environment.dshHome,
      declaration: environment.declaration,
      screenRequested: environment.screenRequested,
      checks: checks.map((check) => ({
        id: check.id,
        title: check.title,
        hard: check.hard,
        requires: check.requires,
        onMissing: check.onMissing
      })),
      checkCount: checks.length
    }
  })}
`;
}
function renderSelfCheckPlan(plan, environment, checks) {
  const lines = [];
  lines.push("self-check plan (dry run) \u2014 nothing was written and nothing was executed");
  lines.push(`declaration: ${environment.declaration.path} (${environment.declaration.kind}, export ${environment.declaration.exportName})`);
  lines.push(`required node: ${environment.declaration.requiredNode}`);
  lines.push(`profile: ${environment.profile}`);
  lines.push(`profile dir: ${environment.profileDir}`);
  lines.push(`dsh home: ${environment.dshHome}`);
  lines.push(`work root: ${environment.workRoot}`);
  lines.push(`run dir: ${plan.runDir}`);
  lines.push(`evidence dir: ${plan.evidenceDir}`);
  lines.push(`screen requested: ${String(environment.screenRequested)}`);
  lines.push(`checks: ${checks.length}`);
  for (const check of checks) lines.push(`  - ${check.id} (${check.hard ? "hard" : "soft"}): ${check.title}`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runSelfCheckCommand(args, deps) {
  const { ports, io } = deps;
  const { clock, env, fs } = ports;
  const cwd = env.cwd();
  const problems = flagProblems(args, SELF_CHECK_FLAGS);
  if (problems.length > 0) return emitUsageFailure(io, args.json, SELF_CHECK_COMMAND, problems, SELF_CHECK_USAGE);
  const startedMs = clock.nowMs();
  const startedAt = clock.iso(startedMs);
  const workRoot = resolveWorkRoot(cwd, args.workRoot);
  if (args.dryRun) {
    const loadOptions2 = {
      fs,
      cwd,
      nodeVersion: deps.runtime.nodeVersion,
      ...args.declaration === void 0 ? {} : { declarationPath: args.declaration }
    };
    const declarationLoaded = await (deps.loadDeclaration ?? loadVerificationDeclaration)(loadOptions2);
    if (!declarationLoaded.ok) {
      const failure2 = declarationLoaded.error;
      io.stderr(`dsh-verify self-check: ${formatFailure(failure2)}
`);
      if (args.json) io.stdout(`${JSON.stringify(failureJson(SELF_CHECK_COMMAND, "declaration", failure2))}
`);
      return failure2.kind === "failed" ? EXIT_CODES.hardFailure : EXIT_CODES.blocked;
    }
    const declaration2 = declarationLoaded.value;
    const resolved2 = resolveProfile(declaration2.profile, args.profile);
    if (!resolved2.ok) {
      io.stderr(`dsh-verify self-check: ${formatFailure(resolved2.error)}
`);
      if (args.json) io.stdout(`${JSON.stringify(failureJson(SELF_CHECK_COMMAND, "profile", resolved2.error))}
`);
      return EXIT_CODES.blocked;
    }
    const profileName2 = resolved2.value;
    const dshHome2 = resolveDshHome(ports);
    const profileDir2 = profileDirectory(dshHome2, profileName2);
    const plannedRun = await planRunDirectory({ fs, workRoot, command: SELF_CHECK_COMMAND, startedAt });
    if (!plannedRun.ok) {
      io.stderr(`dsh-verify self-check: ${formatFailure(plannedRun.error)}
`);
      if (args.json) io.stdout(`${JSON.stringify(failureJson(SELF_CHECK_COMMAND, "report", plannedRun.error))}
`);
      return EXIT_CODES.blocked;
    }
    const plannedChecks = planSelfCheck({ profile: declaration2.profile, screenRequested: args.screen });
    const environment2 = {
      workRoot,
      profile: profileName2,
      dshHome: dshHome2,
      profileDir: profileDir2,
      screenRequested: args.screen,
      declaration: {
        path: declaration2.path,
        kind: declaration2.kind,
        exportName: declaration2.exportName,
        requiredNode: declaration2.requiredNode
      }
    };
    if (args.json) io.stdout(selfCheckPlanJson(plannedRun.value, environment2, plannedChecks.checks));
    else io.stdout(renderSelfCheckPlan(plannedRun.value, environment2, plannedChecks.checks));
    return EXIT_CODES.ok;
  }
  const prepared = await prepareRunDirectory({ fs, workRoot, command: SELF_CHECK_COMMAND, startedAt });
  if (!prepared.ok) {
    io.stderr(`dsh-verify: could not create the run directory under ${workRoot}: ${formatFailure(prepared.error)}
`);
    return EXIT_CODES.blocked;
  }
  const { runDir, evidenceDir } = prepared.value;
  const evidence = createEvidenceStore({ fs, root: evidenceDir, clock });
  async function finishAndEmit3(report2) {
    const written = await writeRunReport({ fs, runDir, report: report2 });
    if (!written.ok) {
      io.stderr(`dsh-verify: could not write the run report: ${formatFailure(written.error)}
`);
      return EXIT_CODES.blocked;
    }
    const finalReport = withReportDigest(report2, written.value);
    const tail4 = {
      reportPath: written.value.reportPath,
      reportSha256: written.value.reportSha256,
      evidenceDir,
      evidenceCount: evidence.items().length
    };
    const human = renderSelfCheckHuman(finalReport, tail4);
    if (args.json) {
      io.stdout(`${runReportJson(finalReport)}
`);
      io.stderr(`${human}
`);
      io.stderr(`${verdictLine(finalReport)}
`);
    } else {
      io.stdout(`${human}
`);
    }
    return exitCodeOfRun(finalReport);
  }
  const loadOptions = {
    fs,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration }
  };
  const loaded = await (deps.loadDeclaration ?? loadVerificationDeclaration)(loadOptions);
  if (!loaded.ok) {
    const failure2 = loaded.error;
    const status = failure2.kind === "failed" ? "fail" : "blocked";
    const recorded = await evidence.recordJson(
      "declaration-failure",
      {
        kind: failure2.kind,
        code: failure2.code,
        message: failure2.message,
        hint: failure2.hint ?? null,
        requestedPath: args.declaration ?? null,
        cwd
      },
      { note: "why the verification declaration could not be loaded" }
    );
    const refs = recorded.ok ? [{ path: recorded.value.path, sha256: recorded.value.sha256, kind: recorded.value.kind }] : [];
    const check = {
      id: DECLARATION_CHECK_ID,
      title: DECLARATION_CHECK_TITLE,
      hard: true,
      status,
      detail: failure2.message,
      ...status === "fail" ? { expected: "a loadable, valid verification declaration", actual: failure2.message } : {},
      ...failure2.hint === void 0 ? {} : { hint: failure2.hint },
      evidence: refs,
      durationMs: Math.max(0, clock.nowMs() - startedMs)
    };
    const report2 = finishRunReport(
      createRunReport({
        command: SELF_CHECK_COMMAND,
        profile: args.profile ?? "(declaration not loaded)",
        startedAt,
        notes: [`work root: ${workRoot}`]
      }),
      {
        checks: [check],
        steps: [],
        finishedAt: clock.iso(),
        artifacts: { report: joinFsPath(runDir, "run.json"), evidence: evidenceDir }
      }
    );
    return finishAndEmit3(report2);
  }
  const declaration = loaded.value;
  const resolved = resolveProfile(declaration.profile, args.profile);
  if (!resolved.ok) {
    io.stderr(`dsh-verify: ${formatFailure(resolved.error)}
`);
    return EXIT_CODES.blocked;
  }
  const profileName = resolved.value;
  const dshHome = resolveDshHome(ports);
  const profileDir = profileDirectory(dshHome, profileName);
  const environment = await evidence.recordJson(
    "environment",
    {
      platform: env.platform(),
      nodeVersion: deps.runtime.nodeVersion,
      cwd,
      workRoot,
      dshHome,
      profile: profileName,
      declaration: {
        path: declaration.path,
        kind: declaration.kind,
        exportName: declaration.exportName,
        requiredNode: declaration.requiredNode
      },
      screenRequested: args.screen
    },
    { note: "the environment this run observed" }
  );
  if (!environment.ok) {
    io.stderr(`dsh-verify: could not record the environment evidence: ${formatFailure(environment.error)}
`);
  }
  const note = (message) => {
    if (args.json) io.stderr(`dsh-verify: ${message}
`);
  };
  const context = {
    profile: declaration.profile,
    profileName,
    ports,
    cwd,
    dshHome,
    profileDir,
    workRoot,
    nodeVersion: deps.runtime.nodeVersion,
    readFileSlice: deps.runtime.readFileSlice,
    declaration: {
      path: declaration.path,
      kind: declaration.kind,
      exportName: declaration.exportName,
      requiredNode: declaration.requiredNode
    },
    screenRequested: args.screen,
    evidence,
    note
  };
  const plan = planSelfCheck({ profile: declaration.profile, screenRequested: args.screen });
  const outcome = await executePlan(plan, context, { ports, clock, note });
  const report = finishRunReport(
    createRunReport({
      command: SELF_CHECK_COMMAND,
      profile: profileName,
      startedAt,
      notes: [`work root: ${workRoot}`, `declaration: ${declaration.path}`]
    }),
    {
      checks: outcome.results,
      steps: outcome.steps,
      finishedAt: clock.iso(),
      artifacts: { report: joinFsPath(runDir, "run.json"), evidence: evidenceDir },
      notes: [`node: ${deps.runtime.nodeVersion}`, `dsh home: ${dshHome}`]
    }
  );
  return finishAndEmit3(report);
}

// src/real-machine-verification/runtime/dsh/logs.ts
var LOG_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})\.log$/;
function pluginLogDirectory2(startCwd, pluginCacheDir) {
  return joinFsPath(startCwd, pluginCacheDir, "logs");
}
async function findLatestPluginLog(fs, logDir, options = {}) {
  const listed = await fs.list(logDir);
  if (!listed.ok) {
    return err({
      code: "not-found",
      message: `plugin log directory does not exist: ${logDir}`,
      hint: "the instance may have failed before the plugin loaded; check instance.stderr.log"
    });
  }
  const matches = (entries) => entries.filter((entry) => entry.kind === "file" && LOG_FILE_PATTERN.test(entry.name));
  const candidates = matches(listed.value).map((entry) => entry.name).filter((name) => options.date === void 0 || name.startsWith(`${options.date}.log`) || name.startsWith(options.date)).sort();
  if (candidates.length === 0) {
    return err({
      code: "not-found",
      message: `no log file ${options.date === void 0 ? "" : `for ${options.date} `}in ${logDir}`,
      hint: `expected a file named <YYYY-MM-DD>.log; found: ${listed.value.map((entry) => entry.name).slice(0, 10).join(", ") || "(empty)"}`
    });
  }
  return ok(joinFsPath(logDir, candidates[candidates.length - 1]));
}
function asString(value) {
  return typeof value === "string" ? value : null;
}
async function readPluginLog(fs, file) {
  const read = await fs.readText(file);
  if (!read.ok) return read;
  const rawLines = read.value.split(/\r?\n/);
  const events = [];
  let badLines = 0;
  for (const [index, raw] of rawLines.entries()) {
    if (raw.trim().length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      badLines += 1;
      events.push({ line: index + 1, raw, json: null, event: null, level: null, ts: null });
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      badLines += 1;
      events.push({ line: index + 1, raw, json: null, event: null, level: null, ts: null });
      continue;
    }
    const json = parsed;
    events.push({
      line: index + 1,
      raw,
      json,
      event: asString(json.event) ?? asString(json.fields?.event),
      level: asString(json.level),
      ts: asString(json.ts) ?? asString(json.timestamp)
    });
  }
  return ok({ file, events, badLines, bytes: read.value.length });
}
function summarizeLogEvents(events, badLines = 0) {
  const byEvent = {};
  const byLevel = {};
  let firstTs = null;
  let lastTs = null;
  for (const event of events) {
    if (event.event !== null) byEvent[event.event] = (byEvent[event.event] ?? 0) + 1;
    if (event.level !== null) byLevel[event.level] = (byLevel[event.level] ?? 0) + 1;
    if (event.ts !== null) {
      const parsed = Date.parse(event.ts);
      if (!Number.isNaN(parsed)) {
        if (firstTs === null || parsed < Date.parse(firstTs)) firstTs = event.ts;
        if (lastTs === null || parsed > Date.parse(lastTs)) lastTs = event.ts;
      }
    }
  }
  return { total: events.length, badLines, firstTs, lastTs, byEvent, byLevel };
}

// src/real-machine-verification/orchestration/checks/logs-readable.ts
function unreadableSummary(state, logDirectory, extra = {}) {
  return { check: "logs-readable", state, logDirectory, ...extra };
}
function createLogsReadableCheck() {
  return {
    id: checkId2("logs-readable"),
    title: "the plugin wrote a non-empty, parseable log inside the isolated instance",
    hard: true,
    requires: [],
    onMissing: "skip",
    async run(context) {
      const { ports, profile, instance, evidence, note } = context;
      const { fs } = ports;
      if (profile.pluginCacheDir === void 0 || profile.pluginCacheDir.length === 0) {
        const refs2 = await recordEvidence(
          evidence,
          "logs-readable",
          unreadableSummary("not-declared", null, { profile: profile.id }),
          "the profile declares no plugin cache directory, so there is no log to read",
          note
        );
        return blocked(
          "the profile does not declare a plugin cache directory, so the plugin log has no known location",
          "declare pluginCacheDir in the profile declaration, then rerun; without it this check cannot observe the plugin",
          refs2
        );
      }
      const logDirectory = pluginLogDirectory2(instance.startCwd, profile.pluginCacheDir);
      const stat2 = await fs.stat(logDirectory);
      if (!stat2.ok || stat2.value.kind !== "directory") {
        const refs2 = await recordEvidence(
          evidence,
          "logs-readable",
          unreadableSummary("missing-directory", logDirectory, {
            instanceId: instance.instanceId ?? null,
            statError: stat2.ok ? `kind=${stat2.value.kind}` : stat2.error.message
          }),
          "the plugin log directory was absent when the check ran",
          note
        );
        return blocked(
          `the plugin log directory does not exist yet: ${logDirectory}`,
          "the plugin creates this directory when it loads; check instance.stderr.log and the plugin inventory, then rerun",
          refs2
        );
      }
      const found = await findLatestPluginLog(fs, logDirectory);
      if (!found.ok) {
        const refs2 = await recordEvidence(
          evidence,
          "logs-readable",
          unreadableSummary("no-log-file", logDirectory, { message: found.error.message }),
          "the log directory existed but held no dated log file",
          note
        );
        return failed(
          "the plugin log file is missing",
          `a <YYYY-MM-DD>.log file in ${logDirectory}`,
          found.error.message,
          found.error.hint ?? "the plugin writes one JSON object per line into the log directory",
          refs2
        );
      }
      const file = found.value;
      const read = await readPluginLog(fs, file);
      if (!read.ok) {
        const refs2 = await recordEvidence(
          evidence,
          "logs-readable",
          unreadableSummary("unreadable", logDirectory, { file, message: read.error.message }),
          "the plugin log existed but could not be read",
          note
        );
        return failed(
          `the plugin log could not be read: ${file}`,
          "the plugin log opens and parses as newline-delimited JSON",
          read.error.message,
          read.error.hint ?? "check the file permissions and that the instance still owns the directory",
          refs2
        );
      }
      const summary = summarizeLogEvents(read.value.events, read.value.badLines);
      const parsedCount = read.value.events.filter((event) => event.json !== null).length;
      const firstBadLine = read.value.events.find((event) => event.json === null)?.line ?? null;
      const observed = {
        check: "logs-readable",
        state: "read",
        file,
        logDirectory,
        bytes: read.value.bytes,
        total: parsedCount,
        lines: read.value.events.length,
        badLines: summary.badLines,
        firstTs: summary.firstTs,
        lastTs: summary.lastTs,
        byEvent: summary.byEvent,
        byLevel: summary.byLevel,
        firstBadLine
      };
      if (parsedCount === 0) {
        const refs2 = await recordEvidence(
          evidence,
          "logs-readable",
          observed,
          "the plugin log existed but contained no parsed events",
          note
        );
        return failed(
          "the plugin log contains zero events",
          "the plugin log contains at least one parsed event",
          `${file}: 0 parsed event(s), ${summary.badLines} unparsable line(s), ${read.value.bytes} byte(s)` + (firstBadLine === null ? "" : `; first unparsable line: ${firstBadLine}`),
          "the plugin loaded but never wrote a log event; check instance.stderr.log and whether the plugin's log writer ran",
          refs2
        );
      }
      const refs = await recordEvidence(
        evidence,
        "logs-readable",
        observed,
        "the plugin log summary behind the logs-readable verdict",
        note
      );
      return passed(
        `plugin log ${file} has ${parsedCount} parsed event(s)` + (summary.badLines === 0 ? "" : ` (${summary.badLines} unparsable line(s) tolerated)`) + (summary.lastTs === null ? "" : `, last at ${summary.lastTs}`),
        refs
      );
    }
  };
}

// src/real-machine-verification/orchestration/page-check.ts
var PAGE_CHECK_ID = "instance-pages";
var PAGE_CHECK_TITLE = "the instance page renders and its window matches the display";
var DEFAULT_TIMEOUT_MS2 = 15e3;
var DEFAULT_TOLERANCE_PX = 2;
var DEFAULT_SELECTORS = ["body"];
var POLL_INTERVAL_MS = 50;
var MAX_SCREENSHOT_ORDINAL = 999;
function sizeText(size) {
  return size === null ? "unknown" : `${size.width}x${size.height}`;
}
function sameSize(left, right, tolerance) {
  return Math.abs(left.width - right.width) <= tolerance && Math.abs(left.height - right.height) <= tolerance;
}
function asSize(value) {
  if (typeof value !== "object" || value === null) return null;
  const width = value.width;
  const height = value.height;
  if (typeof width !== "number" || typeof height !== "number") return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}
function describeSizes(viewport) {
  return `innerSize=${sizeText(viewport.inner)} outerSize=${sizeText(viewport.outer)} screen=${sizeText(viewport.screen)} tolerance=${viewport.tolerance}`;
}
function resolveTargetUrl(instance, expectations) {
  if (expectations.path === void 0 || expectations.path.length === 0) return instance.url;
  try {
    return new URL(expectations.path, instance.url).toString();
  } catch {
    return instance.url;
  }
}
function originOf2(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
function safePageUrl(page) {
  try {
    return page.url();
  } catch {
    return "";
  }
}
async function pageReady(page) {
  const state = await page.evaluate("document.readyState");
  return state.ok && state.value === "complete";
}
async function openPage(page, url, timeoutMs, nowMs, sleep) {
  const navigable = page;
  if (typeof navigable.goto === "function") {
    const navigated = await navigable.goto(url);
    if (!navigated.ok) return { ok: false, error: navigated.error.message };
  } else {
    try {
      await page.evaluate(`window.location.assign(${JSON.stringify(url)});`);
    } catch (error) {
      void error;
    }
  }
  const expectedOrigin = originOf2(url);
  const deadline = nowMs() + timeoutMs;
  while (nowMs() < deadline) {
    const current = safePageUrl(page);
    const currentOrigin = originOf2(current);
    const arrived = current.length > 0 && current !== "about:blank" && (expectedOrigin === null || currentOrigin === expectedOrigin);
    if (arrived && await pageReady(page)) return { ok: true };
    await sleep(POLL_INTERVAL_MS);
  }
  return {
    ok: false,
    error: `the page did not reach ${url} and finish loading within ${timeoutMs} ms (last url: ${safePageUrl(page) || "about:blank"})`
  };
}
async function resolveScreen(context) {
  if (context.screen !== void 0) return context.screen;
  const screens = await context.ports.screen.screens();
  if (!screens.ok) return null;
  return screens.value.find((screen) => screen.primary) ?? screens.value[0] ?? null;
}
function relativeToEvidenceRoot(root, absolute) {
  if (!isInsidePath(absolute, root)) return null;
  const rootPosix = toPosixPath(root).replace(/\/+$/, "");
  const filePosix = toPosixPath(absolute);
  const windows = /^[A-Za-z]:/.test(rootPosix) || /^[A-Za-z]:/.test(filePosix);
  const comparableRoot = windows ? rootPosix.toLowerCase() : rootPosix;
  const comparableFile = windows ? filePosix.toLowerCase() : filePosix;
  if (comparableFile === comparableRoot) return null;
  if (!comparableFile.startsWith(`${comparableRoot}/`)) return null;
  return filePosix.slice(rootPosix.length + 1);
}
async function allocateScreenshotName(fs, dir) {
  for (let ordinal = 1; ordinal <= MAX_SCREENSHOT_ORDINAL; ordinal += 1) {
    const fileName = ordinal === 1 ? "instance-pages.png" : `instance-pages-${ordinal}.png`;
    if (!await fs.exists(joinFsPath(dir, fileName))) return fileName;
  }
  return null;
}
async function captureScreenshot(context, page) {
  const { fs } = context.ports;
  const dir = context.evidenceDir ?? joinFsPath(context.evidence.root, "screenshots");
  const made = await fs.makeDir(dir);
  if (!made.ok) return made;
  const fileName = await allocateScreenshotName(fs, dir);
  if (fileName === null) {
    return err(failure("conflict", `every screenshot name is taken in ${dir}`, "start a new run or clear the directory"));
  }
  const absolute = joinFsPath(dir, fileName);
  const relative = relativeToEvidenceRoot(context.evidence.root, absolute);
  if (relative === null || !isSafeEvidencePath(relative)) {
    return err(
      failure(
        "invalid-input",
        `the screenshot directory ${dir} is outside the evidence root ${context.evidence.root}`,
        "pass an evidenceDir inside the evidence root so the item keeps a re-verifiable relative path"
      )
    );
  }
  const captured = await page.screenshot(absolute, { fullPage: false });
  if (!captured.ok) return captured;
  return context.evidence.recordFile(absolute, {
    kind: "screenshot",
    note: `the instance page captured by ${PAGE_CHECK_ID}`
  });
}
function screenshotRef(item) {
  return { path: item.path, sha256: item.sha256, kind: item.kind };
}
async function resolveAdapter(context) {
  if (context.adapter !== void 0) {
    if (context.adapter === null) {
      return {
        ok: false,
        report: { source: "none", ...context.adapterFailure === void 0 ? {} : { failure: context.adapterFailure.message } },
        failure: context.adapterFailure ?? null
      };
    }
    return { ok: true, factory: context.adapter, report: { source: "context" } };
  }
  if (context.ports.browser !== null && context.ports.browser !== void 0) {
    return { ok: true, factory: context.ports.browser, report: { source: "ports" } };
  }
  if (context.profile.browser === false) {
    return { ok: false, report: { source: "none" }, failure: null };
  }
  const declaration = context.profile.browser;
  const repoRoot = context.repoRoot ?? context.ports.env.cwd();
  const loaded = await (context.loadAdapter ?? loadBrowserAdapter)({
    fs: context.ports.fs,
    repoRoot,
    declaration
  });
  if (!loaded.ok) {
    return {
      ok: false,
      report: {
        source: "profile",
        module: declaration.module,
        ...declaration.exportName === void 0 ? {} : { exportName: declaration.exportName },
        failure: loaded.error.message
      },
      failure: loaded.error
    };
  }
  return {
    ok: true,
    factory: loaded.value.factory,
    report: {
      source: "profile",
      module: declaration.module,
      exportName: loaded.value.exportName
    }
  };
}
function blockedOutcome(detail, hint, adapter, viewport, code) {
  return { ...blocked(detail, hint, void 0, { code, message: detail, hint }), adapter, viewport };
}
async function runPageChecks(context, options = {}) {
  const note = context.note ?? (() => {
  });
  const { clock } = context.ports;
  const expectations = options.expectations ?? {};
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS2;
  const tolerance = expectations.sizeTolerance ?? DEFAULT_TOLERANCE_PX;
  const selectors = expectations.selectors ?? DEFAULT_SELECTORS;
  const headless = context.headless ?? true;
  const resolvedAdapter = await resolveAdapter(context);
  if (!resolvedAdapter.ok) {
    const loading = resolvedAdapter.report.source === "profile";
    const detail = loading ? `the browser adapter declared by profile.browser could not be loaded: ${resolvedAdapter.failure?.message ?? "unknown error"}` : context.adapter === null ? "no browser adapter was injected for page checks" : "no browser adapter is available: profile.browser is false and ports.browser is null";
    const hint = [resolvedAdapter.failure?.hint, missingBrowserAdapterHint()].filter((part) => part !== void 0 && part.length > 0).join("\n\n");
    return blockedOutcome(detail, hint, resolvedAdapter.report, null, "adapter-missing");
  }
  const adapter = resolvedAdapter.factory;
  const adapterReport = resolvedAdapter.report;
  let screenshotItem;
  note(`${PAGE_CHECK_ID}: adapter from ${adapterReport.source}${adapterReport.module === void 0 ? "" : ` (${adapterReport.module})`}`);
  const screen = await resolveScreen(context);
  const screenSize = screen === null ? null : { width: screen.width, height: screen.height };
  const baseViewport = {
    inner: null,
    outer: null,
    screen: screenSize,
    tolerance,
    fullscreen: expectations.fullscreen === true ? false : null
  };
  if (expectations.fullscreen === true && screenSize === null) {
    return blockedOutcome(
      "fullscreen was requested but no display is available to compare the window against",
      "run on a machine with a display, or omit the fullscreen expectation; page checks never infer fullscreen from a resized viewport",
      adapterReport,
      baseViewport,
      "platform-unsupported"
    );
  }
  if (expectations.fullscreen === true && headless) {
    return blockedOutcome(
      "fullscreen was requested while the browser runs headless: a headless window has no real fullscreen state",
      "run this check with a headed browser (a display is required), or omit the fullscreen expectation",
      adapterReport,
      baseViewport,
      "platform-unsupported"
    );
  }
  let session;
  try {
    const launched = await adapter.launch({ headless });
    if (!launched.ok) {
      return blockedOutcome(
        `the browser adapter could not launch a browser: ${launched.error.message}`,
        launched.error.hint ?? missingBrowserAdapterHint(),
        adapterReport,
        baseViewport,
        "adapter-missing"
      );
    }
    session = launched.value;
    const opened = await session.newPage();
    if (!opened.ok) {
      return blockedOutcome(
        `the browser adapter could not open a page: ${opened.error.message}`,
        opened.error.hint ?? "the adapter's newPage() must return a BrowserPageHandle",
        adapterReport,
        baseViewport,
        "adapter-missing"
      );
    }
    const page = opened.value;
    const targetUrl = resolveTargetUrl(context.instance, expectations);
    try {
      const navigation = await openPage(page, targetUrl, timeoutMs, () => clock.nowMs(), (ms) => clock.sleep(ms));
      const failures = [];
      const blockers = [];
      const evidence = [];
      let inner = null;
      const innerRead = await page.innerSize();
      if (innerRead.ok) inner = asSize(innerRead.value);
      else blockers.push({ detail: `innerSize() failed: ${innerRead.error.message}`, hint: "the adapter must report the layout viewport" });
      if (innerRead.ok && inner === null) {
        blockers.push({ detail: "innerSize() returned a malformed value", hint: "return { width, height } in CSS pixels" });
      }
      let outer = null;
      const outerRead = await page.outerSize();
      if (outerRead.ok) outer = asSize(outerRead.value);
      else blockers.push({ detail: `outerSize() failed: ${outerRead.error.message}`, hint: "the adapter must report the real window size" });
      if (outerRead.ok && outer === null) {
        blockers.push({ detail: "outerSize() returned a malformed value", hint: "return { width, height } in CSS pixels" });
      }
      let windowState;
      const probe = page;
      if (typeof probe.windowState === "function") {
        const state = await probe.windowState();
        if (state.ok) windowState = typeof state.value.state === "string" ? state.value.state : void 0;
      }
      const viewport = {
        inner,
        outer,
        screen: screenSize,
        tolerance,
        fullscreen: expectations.fullscreen === true ? outer !== null && screenSize !== null && sameSize(outer, screenSize, tolerance) : null,
        ...windowState === void 0 ? {} : { windowState }
      };
      const textValues = {};
      const missingSelectors = [];
      for (const selector of selectors) {
        const text = await page.text(selector);
        if (!text.ok) {
          blockers.push({ detail: `text(${JSON.stringify(selector)}) failed: ${text.error.message}`, hint: "the adapter must read element text" });
          textValues[selector] = null;
          continue;
        }
        textValues[selector] = text.value;
        if (text.value === null) missingSelectors.push(selector);
      }
      const pageErrors = [...page.pageErrors()];
      const screenshot = await captureScreenshot(context, page);
      if (screenshot.ok) {
        screenshotItem = screenshot.value;
        evidence.push(screenshotRef(screenshot.value));
      } else {
        blockers.push({ detail: `the screenshot could not be recorded: ${screenshot.error.message}`, hint: "the adapter must write a PNG screenshot to the given path" });
      }
      if (!navigation.ok) {
        failures.push({
          summary: "navigation failed",
          expected: `the page at ${targetUrl} completed loading`,
          actual: navigation.error,
          hint: "check the instance URL and that the app shell responds; the page itself never loaded"
        });
      }
      if (missingSelectors.length > 0) {
        failures.push({
          summary: `${missingSelectors.length} selector(s) had no text`,
          expected: `selectors with text: ${selectors.join(", ")}`,
          actual: `selectors with no matching element: ${missingSelectors.join(", ")}`,
          hint: "the page rendered without the expected shell; compare the screenshot with the expected DOM"
        });
      }
      if (pageErrors.length > 0) {
        failures.push({
          summary: `the page reported ${pageErrors.length} uncaught error(s)`,
          expected: "no uncaught page errors",
          actual: pageErrors.slice(0, 5).join(" | "),
          hint: "read the page errors and the screenshot; an uncaught exception means the shell did not finish loading"
        });
      }
      if (expectations.innerSize !== void 0 && inner !== null && !sameSize(inner, expectations.innerSize, tolerance)) {
        failures.push({
          summary: "the layout viewport has the wrong size",
          expected: `innerSize=${sizeText(expectations.innerSize)} (${describeSizes(viewport)})`,
          actual: `innerSize=${sizeText(inner)} (${describeSizes(viewport)})`,
          hint: "compare the screenshot with the expected layout; resize assertions belong to the page, not the window"
        });
      }
      if (expectations.outerSize !== void 0 && outer !== null && !sameSize(outer, expectations.outerSize, tolerance)) {
        failures.push({
          summary: "the window has the wrong size",
          expected: `outerSize=${sizeText(expectations.outerSize)} (${describeSizes(viewport)})`,
          actual: `outerSize=${sizeText(outer)} (${describeSizes(viewport)})`,
          hint: "the adapter controls the real window; a viewport resize must not be reported as a window size"
        });
      }
      if (expectations.fullscreen === true && outer !== null && screenSize !== null && !sameSize(outer, screenSize, tolerance)) {
        failures.push({
          summary: "the window is not fullscreen",
          expected: `outerSize=${sizeText(screenSize)} (screen=${sizeText(screenSize)}, ${describeSizes(viewport)})`,
          actual: `outerSize=${sizeText(outer)} (screen=${sizeText(screenSize)}, ${describeSizes(viewport)})`,
          hint: "make the launched window actually fullscreen through the adapter's window state; do not resize the viewport to imitate it"
        });
      }
      if (expectations.fullscreen === true && windowState !== void 0 && windowState !== "fullscreen") {
        failures.push({
          summary: "the window state is not fullscreen",
          expected: `windowState=fullscreen (${describeSizes(viewport)})`,
          actual: `windowState=${windowState} (${describeSizes(viewport)})`,
          hint: "the adapter reports the real window state; set it to fullscreen before measuring"
        });
      }
      const observation = {
        check: PAGE_CHECK_ID,
        url: targetUrl,
        instanceUrl: context.instance.url,
        origin: context.instance.origin,
        ...context.instance.tokenUrl === void 0 ? {} : { tokenUrl: context.instance.tokenUrl },
        headless,
        innerSize: inner,
        outerSize: outer,
        screen: screenSize,
        tolerance,
        fullscreen: expectations.fullscreen === true ? viewport.fullscreen : null,
        ...windowState === void 0 ? {} : { windowState },
        text: textValues,
        pageErrors,
        navigation: navigation.ok ? { ok: true } : { ok: false, error: navigation.error },
        failures: failures.map((item) => item.summary),
        blockers: blockers.map((item) => item.detail),
        capturedAt: clock.iso()
      };
      const recorded = await context.evidence.recordJson(PAGE_CHECK_ID, observation, {
        note: `the page observation behind ${PAGE_CHECK_ID}`
      });
      if (recorded.ok) evidence.push({ path: recorded.value.path, sha256: recorded.value.sha256, kind: recorded.value.kind });
      else note(`${PAGE_CHECK_ID}: could not record the observation: ${recorded.error.message}`);
      if (failures.length > 0) {
        const detail2 = `the instance page failed ${failures.length} expectation${failures.length === 1 ? "" : "s"}: ${failures.map((item) => item.summary).join("; ")}`;
        const outcome2 = failed(
          detail2,
          failures.map((item) => item.expected).join(" | "),
          failures.map((item) => item.actual).join(" | "),
          failures[0]?.hint ?? "read the screenshot and the page observation",
          evidence
        );
        return {
          ...outcome2,
          adapter: adapterReport,
          viewport,
          ...screenshotItem === void 0 ? {} : { screenshot: screenshotItem }
        };
      }
      if (blockers.length > 0) {
        const detail2 = `the page could not be fully observed: ${blockers.map((item) => item.detail).join("; ")}`;
        const hint = blockers[0]?.hint ?? "the adapter could not complete the measurement";
        const outcome2 = blocked(detail2, hint, evidence, { code: "adapter-missing", message: detail2, hint });
        return {
          ...outcome2,
          adapter: adapterReport,
          viewport,
          ...screenshotItem === void 0 ? {} : { screenshot: screenshotItem }
        };
      }
      const detail = `the page at ${context.instance.origin} rendered (${describeSizes(viewport)}${expectations.fullscreen === true ? ", window covers the display" : ""}); no page errors`;
      const outcome = passed(detail, evidence);
      return {
        ...outcome,
        adapter: adapterReport,
        viewport,
        ...screenshotItem === void 0 ? {} : { screenshot: screenshotItem }
      };
    } finally {
      try {
        await page.close();
      } catch {
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return blockedOutcome(
      `the browser adapter threw while opening the page: ${message}`,
      "this is an adapter defect: launch(), newPage() and the page handle must return Result values instead of throwing",
      adapterReport,
      baseViewport,
      "adapter-missing"
    );
  } finally {
    if (session !== void 0) {
      try {
        await session.close();
      } catch {
      }
    }
  }
}
function createPageCheckModule(options = {}) {
  return {
    id: checkId2(PAGE_CHECK_ID),
    title: options.title ?? PAGE_CHECK_TITLE,
    hard: options.hard ?? true,
    requires: [],
    onMissing: "blocked",
    missingHint: missingBrowserAdapterHint(),
    run: (context) => runPageChecks(context, options)
  };
}

// src/real-machine-verification/cli/commands/single-instance.ts
var SINGLE_INSTANCE_COMMAND = "single-instance";
var SINGLE_INSTANCE_USAGE = "dsh-verify single-instance [--profile <p>] [--declaration <file>] [--work-root <dir>] [--keep] [--dry-run] [--json]";
var SINGLE_INSTANCE_FLAGS = /* @__PURE__ */ new Set([
  "--json",
  "--profile",
  "--declaration",
  "--work-root",
  "--keep",
  "--dry-run"
]);
function createInstanceReachableCheck() {
  return {
    id: checkId2("instance-reachable"),
    title: "the instance answers on its token URL with every enabled plugin active",
    hard: true,
    requires: [],
    onMissing: "skip",
    run(context) {
      const launch = context.launch;
      if (launch.outcome === "ready") {
        const { record, readiness } = launch;
        return passed(
          `instance ${record.instanceId ?? "(no id)"} is ready: pid ${record.pid}, port ${record.port}, connect HTTP ${readiness.connectStatus}, ${readiness.inventory.activeCount}/${readiness.inventory.enabledCount} enabled plugin entries active`,
          launch.evidence
        );
      }
      const failure2 = launch.failure;
      if (failure2.stage === "prerequisite") {
        return blocked(
          `the instance could not be started: ${failure2.message}`,
          failure2.hint ?? "fix the missing prerequisite and rerun single-instance",
          launch.evidence
        );
      }
      const actual = `${failure2.message} (stage: ${failure2.stage})
stderr tail: ${launch.stderrTail.length === 0 ? "(empty)" : launch.stderrTail}
stdout tail: ${launch.stdoutTail.length === 0 ? "(empty)" : launch.stdoutTail}`;
      return failed(
        "the instance did not reach readiness",
        READINESS_CRITERION,
        actual,
        failure2.hint ?? "read the instance logs for the first error; the tails above are the end of each log",
        launch.evidence
      );
    }
  };
}
function createSingleInstancePagesCheck() {
  const delegate = createPageCheckModule();
  return {
    id: delegate.id,
    title: delegate.title,
    hard: delegate.hard,
    requires: [],
    onMissing: "blocked",
    ...delegate.missingHint === void 0 ? {} : { missingHint: delegate.missingHint },
    run: (context) => delegate.run({
      ports: context.ports,
      instance: context.page,
      profile: context.profile,
      evidence: context.evidence,
      note: context.note,
      headless: true,
      repoRoot: context.cwd
    })
  };
}
function createSingleInstanceTeardownCheck() {
  const delegate = createTeardownCleanCheck();
  return {
    id: delegate.id,
    title: delegate.title,
    hard: delegate.hard,
    requires: [],
    onMissing: "skip",
    run(context) {
      const record = context.instance;
      const instanceId = record.instanceId ?? String(record.pid);
      if (context.keep) {
        return skipped(
          `--keep was requested: instance ${instanceId} (pid ${record.pid}) is still running`,
          `stop it with: dsh-verify stop --id ${instanceId} --work-root ${context.workRoot}`
        );
      }
      if (context.cleanup === null) {
        return failed(
          "the teardown could not be observed",
          "every launched instance is stopped and its pid is gone",
          `pid ${record.pid} has no cleanup observation`,
          `stop it with: dsh-verify stop --id ${instanceId} --work-root ${context.workRoot}`
        );
      }
      const row2 = {
        index: 1,
        instanceId,
        profile: record.profile,
        dir: record.dir ?? record.startCwd,
        home: record.home,
        workdir: record.startCwd,
        pluginLogDir: record.pluginLogDir,
        pid: record.pid,
        port: record.port,
        tokenPresent: record.tokenUrl.length > 0,
        readiness: "ready",
        failure: null,
        cleanup: context.cleanup
      };
      const concurrent = {
        count: 1,
        rows: [row2],
        failure: null,
        workRoot: context.workRoot,
        dshHome: context.dshHome,
        ports: context.ports,
        evidenceRefs: evidenceRefs(context.evidence.items())
      };
      return delegate.run(concurrent);
    }
  };
}
function renderModel2(model) {
  if (model === null) return "none (profile.model is false)";
  const credential = model.credentialAvailable ? `credential ${model.credentialSource}` : `credential missing (${model.apiKeyEnv} was not found)`;
  return `${model.provider}/${model.model} \u2014 ${credential}`;
}
function renderDryRunHuman2(plan, projection) {
  const lines = [];
  lines.push("single-instance plan (dry run) \u2014 nothing was written and no process was started");
  lines.push(`instance id: ${plan.instanceId}`);
  lines.push(`profile: ${plan.profileName}`);
  lines.push(`instance dir: ${plan.layout.dir}`);
  lines.push(`home: ${plan.layout.home}`);
  lines.push(`userprofile: ${plan.layout.userprofile}`);
  lines.push(`workdir: ${plan.layout.workdir}`);
  lines.push(`argv: ${projection.argv.join(" ")}`);
  lines.push(`injected env: ${projection.envNames.length === 0 ? "(none)" : projection.envNames.join(", ")}`);
  lines.push(
    `secret env (names only): ${projection.secretEnvNames.length === 0 ? "(none)" : projection.secretEnvNames.join(", ")}`
  );
  lines.push(`stdout log: ${projection.logFiles.stdout}`);
  lines.push(`stderr log: ${projection.logFiles.stderr}`);
  lines.push(`plugin log dir: ${projection.logFiles.pluginLogDir ?? "(not declared)"}`);
  lines.push(`profile copy: ${projection.profileCopy.sourceProfileDir} -> ${projection.profileCopy.targetProfileDir}`);
  lines.push(`port: ${projection.port === 0 ? "0 (ephemeral, assigned by the host)" : String(projection.port)}`);
  lines.push(`model: ${renderModel2(projection.model)}`);
  lines.push(`keep: ${projection.keep ? "true (the instance would be left running)" : "false (the instance would be stopped after the checks)"}`);
  lines.push("notes:");
  for (const line of projection.notes) lines.push(`  - ${line}`);
  return `${lines.join("\n")}
`;
}
function renderHuman2(report, record, keep, workRoot, tail4) {
  const lines = [];
  for (const check of report.checks) lines.push(...renderCheckLines(check));
  if (record !== null) {
    lines.push(
      `instance: ${record.instanceId ?? "(no id)"} pid ${record.pid} port ${record.port}`
    );
    lines.push(`home: ${record.home}`);
    lines.push(`workdir: ${record.startCwd}`);
    if (keep) {
      lines.push(
        `kept: the instance is still running; stop it with dsh-verify stop --id ${record.instanceId ?? record.pid} --work-root ${workRoot}`
      );
    }
  }
  lines.push(`report: ${tail4.reportPath}`);
  lines.push(`report-sha256: ${tail4.reportSha256}`);
  lines.push(`evidence: ${tail4.evidenceDir} (${tail4.evidenceCount} item(s))`);
  return lines.join("\n");
}
function failureJson8(stage, error) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: SINGLE_INSTANCE_COMMAND,
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.hint === void 0 ? {} : { hint: error.hint },
      ...error.details === void 0 ? {} : { details: error.details },
      stage
    }
  })}
`;
}
function reject6(args, io, stage, message) {
  io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: ${message}
`);
  if (args.json) io.stdout(failureJson8(stage, { code: "invalid-input", message }));
  return EXIT_CODES.blocked;
}
function buildSteps2(input) {
  return [
    {
      id: "plan",
      title: "resolve the declaration and plan one isolated instance",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: "done",
      detail: "one isolated instance planned; the same plan is what the launch step executed"
    },
    {
      id: "launch",
      title: "start the host and wait for readiness",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: input.launchState,
      detail: input.launchDetail
    },
    {
      id: "checks",
      title: "run the instance checks",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: "done",
      detail: `${input.checkCount} check(s)`
    },
    {
      id: "cleanup",
      title: "stop the instance and confirm its pid is gone",
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      state: input.cleanupState,
      detail: input.cleanupDetail
    }
  ];
}
async function finishAndEmit2(input) {
  const { args, deps, io } = { args: input.args, deps: input.deps, io: input.deps.io };
  const written = await writeRunReport({ fs: deps.ports.fs, runDir: input.runDir, report: input.report });
  if (!written.ok) {
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: could not write the report: ${formatFailure(written.error)}
`);
    if (args.json) io.stdout(failureJson8("report", written.error));
    return EXIT_CODES.blocked;
  }
  const report = withReportDigest(input.report, written.value);
  const tail4 = {
    reportPath: written.value.reportPath,
    reportSha256: written.value.reportSha256,
    evidenceDir: input.evidence.root,
    evidenceCount: input.evidence.items().length
  };
  const human = renderHuman2(report, input.record, input.keep, input.workRoot, tail4);
  if (args.json) {
    io.stdout(`${runReportJson(report)}
`);
    io.stderr(`${human}
`);
    io.stderr(`${verdictLine(report)}
`);
  } else {
    io.stdout(`${human}
`);
  }
  return exitCodeOfRun(report);
}
async function recordInstance(evidence, record, readiness, warn) {
  return recordEvidence(
    evidence,
    "single-instance-instance",
    {
      instanceId: record.instanceId ?? null,
      pid: record.pid,
      port: record.port,
      profile: record.profile,
      home: record.home,
      userprofile: record.userprofile,
      workdir: record.startCwd,
      readyMs: record.readyMs,
      connectStatus: readiness.connectStatus,
      inventory: readiness.inventory,
      pluginLogDir: record.pluginLogDir
    },
    "instance readiness as reported by the host; the token URL is deliberately not recorded",
    warn
  );
}
async function runSingleInstanceCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, SINGLE_INSTANCE_FLAGS);
  if (problems.length > 0) {
    return reject6(args, io, "usage", `${problems.join("; ")}
${SINGLE_INSTANCE_USAGE}`);
  }
  const startedAt = ports.clock.iso();
  const cwd = ports.env.cwd();
  const context = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.workRoot === void 0 ? {} : { workRoot: args.workRoot },
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!context.ok) {
    const stage = context.error.stage;
    const failure2 = context.error.failure;
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: ${formatFailure(failure2)}
`);
    if (args.json) io.stdout(failureJson8(stage, failure2));
    return EXIT_CODES.blocked;
  }
  const runtime = await discoverDsh({ fs: ports.fs, env: ports.env });
  if (!runtime.ok) {
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: ${formatFailure(runtime.error)}
`);
    if (args.json) io.stdout(failureJson8("runtime", runtime.error));
    return EXIT_CODES.blocked;
  }
  const runtimePaths = { exe: runtime.value.exe, cliJs: hostCliPath(runtime.value) };
  const planned = await planInstance({
    ports,
    runtime: runtimePaths,
    dshHome: context.value.dshHome,
    profileName: context.value.profileName,
    profile: context.value.profile,
    profileDir: context.value.profileDir,
    workRoot: context.value.workRoot,
    port: 0,
    keep: args.keep,
    startedAtMs: ports.clock.nowMs()
  });
  if (!planned.ok) {
    const failure2 = planned.error;
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: ${formatFailure(failure2)}
`);
    if (args.json) io.stdout(failureJson8(failure2.stage, failure2));
    return failure2.stage === "prerequisite" ? EXIT_CODES.blocked : EXIT_CODES.hardFailure;
  }
  const plan = planned.value;
  const projection = projectInstancePlan(plan);
  if (args.dryRun) {
    if (args.json) {
      io.stdout(
        `${JSON.stringify({
          schemaVersion: 1,
          command: SINGLE_INSTANCE_COMMAND,
          ok: true,
          dryRun: true,
          plan: projection
        })}
`
      );
    } else {
      io.stdout(renderDryRunHuman2(plan, projection));
    }
    if (plan.modelNote !== null) io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: warning: ${plan.modelNote}
`);
    return EXIT_CODES.ok;
  }
  if (plan.modelNote !== null) io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: warning: ${plan.modelNote}
`);
  const note = (message) => {
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: ${message}
`);
  };
  const warn = (message) => {
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: warning: ${message}
`);
  };
  const prepared = await prepareRunDirectory({
    fs: ports.fs,
    workRoot: context.value.workRoot,
    command: SINGLE_INSTANCE_COMMAND,
    startedAt
  });
  if (!prepared.ok) {
    io.stderr(`dsh-verify ${SINGLE_INSTANCE_COMMAND}: could not prepare a run directory: ${formatFailure(prepared.error)}
`);
    if (args.json) io.stdout(failureJson8("run-directory", prepared.error));
    return EXIT_CODES.blocked;
  }
  const runDir = prepared.value.runDir;
  const evidence = createEvidenceStore({ fs: ports.fs, root: prepared.value.evidenceDir, clock: ports.clock });
  const executed = await executeInstance({ ports, plan, runtime: runtimePaths, note });
  if (!executed.ok) {
    const failure2 = executed.error;
    const stdoutTail = await tailOf(ports.fs, plan.layout.stdoutLog);
    const stderrTail = await tailOf(ports.fs, plan.layout.stderrLog);
    const refs = await recordEvidence(
      evidence,
      "single-instance-launch",
      {
        stage: failure2.stage,
        code: failure2.code,
        message: failure2.message,
        hint: failure2.hint ?? null,
        stdoutTail,
        stderrTail,
        instanceDir: plan.layout.dir
      },
      "launch failure with the tail of each instance log",
      warn
    );
    const launch = { outcome: "failed", failure: failure2, stdoutTail, stderrTail, evidence: refs };
    const reachable2 = createInstanceReachableCheck();
    const outcome = await executePlan(
      { command: SINGLE_INSTANCE_COMMAND, checks: [reachable2] },
      { launch },
      { ports, clock: ports.clock, note }
    );
    const results2 = outcome.results;
    const finishedAt2 = ports.clock.iso();
    const report2 = createRunReport({
      command: SINGLE_INSTANCE_COMMAND,
      profile: plan.profileName,
      startedAt,
      notes: [`work root: ${context.value.workRoot}`, `instance dir: ${plan.layout.dir}`]
    });
    const finished2 = finishRunReport(report2, {
      checks: results2,
      steps: buildSteps2({
        startedAt,
        finishedAt: finishedAt2,
        launchState: "failed",
        launchDetail: `launch failed: ${failure2.message}`,
        checkCount: results2.length,
        cleanupState: "done",
        cleanupDetail: "executeInstance reaped the failed launch; no process was left behind"
      }),
      finishedAt: finishedAt2,
      artifacts: { evidence: evidence.root },
      notes: [`stopped: true (executeInstance reaped the failed launch)`]
    });
    return finishAndEmit2({
      args,
      deps,
      report: finished2,
      runDir,
      evidence,
      record: null,
      keep: args.keep,
      workRoot: context.value.workRoot
    });
  }
  const { record, readiness } = executed.value;
  const readinessRefs = await recordInstance(evidence, record, readiness, warn);
  const reachable = createInstanceReachableCheck();
  const logsReadable = createLogsReadableCheck();
  const pageCheck = createSingleInstancePagesCheck();
  const contextBase = {
    ports,
    profile: context.value.profile,
    instance: record,
    evidence,
    note,
    launch: { outcome: "ready", record, readiness, evidence: readinessRefs },
    page: { url: record.tokenUrl, origin: record.originUrl, tokenUrl: record.tokenUrl },
    cleanup: null,
    keep: args.keep,
    workRoot: context.value.workRoot,
    dshHome: context.value.dshHome,
    cwd
  };
  const preTeardownOutcome = await executePlan(
    {
      command: SINGLE_INSTANCE_COMMAND,
      checks: [
        { ...reachable, run: (ctx) => reachable.run(ctx) },
        { ...logsReadable, run: (ctx) => logsReadable.run(ctx) },
        pageCheck
      ]
    },
    contextBase,
    { ports, clock: ports.clock, note }
  );
  let cleanup = null;
  let cleanupDetail = "the cleanup step was skipped";
  if (args.keep) {
    cleanupDetail = `instance ${record.instanceId ?? record.pid} (pid ${record.pid}) is still running (--keep)`;
  } else {
    const reclaimed = await cleanupConcurrent({
      ports,
      executed: [{ index: 1, plan, result: { ok: true, value: executed.value } }],
      note
    });
    cleanup = reclaimed.rows[0]?.cleanup ?? null;
    cleanupDetail = cleanup === null ? "no cleanup observation was recorded" : cleanup.verified ? `pid ${record.pid} is gone; stopped.json was written` : `pid ${record.pid} could not be reclaimed: ${cleanup.error ?? "still alive"}`;
  }
  const teardown = createSingleInstanceTeardownCheck();
  const teardownResult = await executePlan(
    { command: SINGLE_INSTANCE_COMMAND, checks: [teardown] },
    { ...contextBase, cleanup },
    { ports, clock: ports.clock, note }
  );
  const results = [...preTeardownOutcome.results, ...teardownResult.results];
  const finishedAt = ports.clock.iso();
  const stopNote = args.keep ? `stopped: false (--keep: instance ${record.instanceId ?? record.pid}, pid ${record.pid}, is still running)` : cleanup === null ? "stopped: unknown (no cleanup observation)" : `stopped: ${cleanup.stopped ? "true" : "false"} (pid ${record.pid}; stopped.json was written)`;
  const report = createRunReport({
    command: SINGLE_INSTANCE_COMMAND,
    profile: plan.profileName,
    startedAt,
    notes: [
      `work root: ${context.value.workRoot}`,
      `instance dir: ${plan.layout.dir}`,
      `plugin log dir: ${record.pluginLogDir ?? "(not declared)"}`
    ]
  });
  const finished = finishRunReport(report, {
    checks: results,
    steps: buildSteps2({
      startedAt,
      finishedAt,
      launchState: "done",
      launchDetail: `instance ${plan.instanceId} ready in ${record.readyMs}ms on port ${record.port}`,
      checkCount: results.length,
      cleanupState: args.keep ? "skipped" : "done",
      cleanupDetail
    }),
    finishedAt,
    ...projection.model === null ? {} : { model: projection.model },
    artifacts: { evidence: evidence.root, instance: plan.layout.instancePath },
    notes: [stopNote]
  });
  return finishAndEmit2({
    args,
    deps,
    report: finished,
    runDir,
    evidence,
    record,
    keep: args.keep,
    workRoot: context.value.workRoot
  });
}

// src/real-machine-verification/cli/commands/skills.ts
var SKILLS_USAGE = "dsh-verify skills [--profile <p>] [--json]";
var SKILLS_FLAGS = /* @__PURE__ */ new Set(["--json", "--profile", "--declaration"]);
var encoder = new TextEncoder();
function createMemoryEvidenceStore(clock) {
  const recorded = [];
  const record = (name, content, kind, options) => {
    const item = {
      kind: options?.kind ?? kind,
      path: asEvidencePath(name),
      bytes: encoder.encode(content).byteLength,
      sha256: sha256Text(content),
      capturedAt: options?.capturedAt ?? clock.iso(),
      ...options?.note === void 0 ? {} : { note: options.note }
    };
    recorded.push(item);
    return ok(item);
  };
  return {
    root: "(memory)",
    items: () => [...recorded],
    recordText: async (name, content, options) => record(name, content, "text", options),
    recordJson: async (name, value, options) => record(name, `${JSON.stringify(value, null, 2)}
`, "json", options),
    recordFile: async (path) => err(
      failure(
        "invalid-input",
        `the in-memory evidence store cannot adopt the file ${path}`,
        "this command writes nothing; use a command that owns an evidence directory"
      )
    )
  };
}
async function runSkillsCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, SKILLS_FLAGS);
  if (problems.length > 0) return emitUsageFailure(io, args.json, "skills", problems, SKILLS_USAGE);
  const cwd = ports.env.cwd();
  const loaded = await loadDeclarationContext({
    ports,
    cwd,
    nodeVersion: deps.runtime.nodeVersion,
    ...args.declaration === void 0 ? {} : { declarationPath: args.declaration },
    ...args.profile === void 0 ? {} : { profileOverride: args.profile },
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  });
  if (!loaded.ok) {
    return emitFailure(io, args.json, "skills", loaded.error.stage, loaded.error.failure);
  }
  const context = loaded.value;
  const evidence = createMemoryEvidenceStore(ports.clock);
  const note = (message) => {
    io.stderr(`dsh-verify skills: ${message}
`);
  };
  const checkContext = {
    profile: context.profile,
    profileName: context.profileName,
    ports,
    cwd,
    dshHome: context.dshHome,
    profileDir: context.profileDir,
    workRoot: context.workRoot,
    nodeVersion: deps.runtime.nodeVersion,
    readFileSlice: deps.runtime.readFileSlice,
    declaration: {
      path: context.declaration.path,
      kind: context.declaration.kind,
      exportName: context.declaration.exportName,
      requiredNode: context.declaration.requiredNode
    },
    screenRequested: false,
    evidence,
    note
  };
  const module = createSkillsSetCheck();
  const startedMs = ports.clock.nowMs();
  const outcome = await module.run(checkContext);
  const check = {
    ...toCheckResult(module, outcome, Math.max(0, ports.clock.nowMs() - startedMs)),
    source: "builtin"
  };
  const exitCode = stateFromChecks([check]).exitCode;
  const lines = renderCheckLines(check);
  if (args.json) {
    const payload = {
      schemaVersion: 1,
      command: "skills",
      ok: exitCode === 0,
      profile: context.profileName,
      checks: [check],
      notes: [MODEL_CATALOG_CAVEAT]
    };
    io.stdout(`${JSON.stringify(payload)}
`);
    for (const line of lines) io.stderr(`${line}
`);
  } else {
    for (const line of lines) io.stdout(`${line}
`);
    io.stdout(`note: ${MODEL_CATALOG_CAVEAT}
`);
  }
  return exitCode === 0 ? EXIT_CODES.ok : exitCode;
}

// src/real-machine-verification/cli/commands/stop.ts
var STOP_USAGE = "dsh-verify stop [--id <id>] [--dir <d>] [--all] [--json] [--dry-run]";
var STOP_FLAGS = /* @__PURE__ */ new Set(["--json", "--dry-run", "--work-root", "--id", "--dir", "--all"]);
function failureJson9(results, ok3) {
  return `${JSON.stringify({ schemaVersion: 1, command: "stop", ok: ok3, results })}
`;
}
async function enumerateInstances(ports, workRoot) {
  const instancesRoot = joinFsPath(workRoot, "instances");
  const listed = await ports.fs.list(instancesRoot);
  if (!listed.ok) return [];
  const targets = [];
  for (const entry of listed.value) {
    if (entry.kind !== "directory") continue;
    const dir = joinFsPath(instancesRoot, entry.name);
    if (await ports.fs.exists(joinFsPath(dir, "instance.json"))) targets.push({ dir, id: entry.name });
  }
  return targets;
}
async function resolveTargets(args, ports, workRoot) {
  if (args.all && (args.id !== void 0 || args.dir !== void 0)) {
    return { problem: "--all cannot be combined with --id or --dir" };
  }
  if (args.id !== void 0 && args.dir !== void 0) {
    return { problem: "--id and --dir address different instances; pass one of them" };
  }
  if (args.all) {
    const targets = await enumerateInstances(ports, workRoot);
    return { targets, enumerateEmpty: targets.length === 0 };
  }
  if (args.id !== void 0) {
    return { targets: [{ dir: joinFsPath(workRoot, "instances", args.id), id: args.id }], enumerateEmpty: false };
  }
  if (args.dir !== void 0) {
    const absolute = isAbsolutePath(args.dir) ? args.dir : resolveAgainst(ports.env.cwd(), args.dir);
    return { targets: [{ dir: absolute }], enumerateEmpty: false };
  }
  return { problem: `nothing to stop; pass --id, --dir or --all
${STOP_USAGE}` };
}
async function stopTarget(ports, target) {
  const loaded = await loadInstance(ports.fs, target.dir);
  if (!loaded.ok) {
    return { ...target.id === void 0 ? {} : { id: target.id }, dir: target.dir, error: formatFailure(loaded.error) };
  }
  const record = loaded.value;
  const stopped = await stopRecord(ports, record);
  if (!stopped.ok) {
    return {
      ...record.instanceId === void 0 && target.id === void 0 ? {} : { id: record.instanceId ?? target.id },
      dir: instanceDirectory(record),
      pid: record.pid,
      killed: false,
      alreadyGone: false,
      aliveAfter: ports.process.isAlive(record.pid),
      error: formatFailure(stopped.error)
    };
  }
  return {
    ...record.instanceId === void 0 && target.id === void 0 ? {} : { id: record.instanceId ?? target.id },
    dir: instanceDirectory(record),
    pid: record.pid,
    killed: stopped.value.killed,
    alreadyGone: stopped.value.alreadyGone,
    aliveAfter: ports.process.isAlive(record.pid)
  };
}
function renderResult(result) {
  const label = result.id ?? result.dir;
  if (result.error !== void 0) return `failed ${label}: ${result.error}`;
  if (result.alreadyGone === true) return `already gone ${label} (pid ${result.pid ?? "?"})`;
  return `stopped ${label} (pid ${result.pid ?? "?"})`;
}
async function inspectTargets(ports, workRoot, targets, enumerateEmpty) {
  const inspected = [];
  const failed2 = [];
  for (const target of targets) {
    const loaded = await loadInstance(ports.fs, target.dir);
    if (!loaded.ok) {
      failed2.push({
        ...target.id === void 0 ? {} : { id: target.id },
        dir: target.dir,
        error: formatFailure(loaded.error)
      });
      continue;
    }
    const record = loaded.value;
    inspected.push({
      id: record.instanceId ?? target.id ?? null,
      dir: instanceDirectory(record),
      recordPath: joinFsPath(target.dir, "instance.json"),
      pid: record.pid,
      instanceId: record.instanceId ?? null,
      alive: ports.process.isAlive(record.pid)
    });
  }
  if (failed2.length > 0) return { failed: failed2 };
  return {
    plan: {
      workRoot,
      instancesRoot: joinFsPath(workRoot, "instances"),
      enumerateEmpty,
      targets: inspected
    }
  };
}
function stopPlanJson(plan) {
  return `${JSON.stringify({
    schemaVersion: 1,
    command: "stop",
    ok: true,
    dryRun: true,
    plan: {
      workRoot: plan.workRoot,
      instancesRoot: plan.instancesRoot,
      enumerateEmpty: plan.enumerateEmpty,
      targets: plan.targets,
      wouldSignal: plan.targets.filter((target) => target.alive).length
    }
  })}
`;
}
function renderStopPlan(plan) {
  const lines = [];
  lines.push("stop plan (dry run) \u2014 no process was signalled");
  lines.push(`work root: ${plan.workRoot}`);
  if (plan.targets.length === 0) {
    lines.push(`no instances found under ${plan.instancesRoot}`);
  }
  for (const target of plan.targets) {
    const label = target.id ?? target.dir;
    lines.push(`target: ${label} (pid ${target.pid ?? "?"}, ${target.alive ? "alive" : "already gone"}) at ${target.dir}`);
    lines.push(`  record: ${target.recordPath}`);
  }
  lines.push(`would signal: ${plan.targets.filter((target) => target.alive).length} process(es)`);
  lines.push("dry run: nothing was written");
  return `${lines.join("\n")}
`;
}
async function runStopCommand(args, deps) {
  const { ports, io } = deps;
  const problems = flagProblems(args, STOP_FLAGS);
  if (problems.length > 0) {
    io.stderr(`dsh-verify stop: ${problems.join("; ")}
`);
    if (args.json) io.stdout(failureJson9([], false));
    return EXIT_CODES.blocked;
  }
  const workRoot = resolveWorkRoot(ports.env.cwd(), args.workRoot);
  const resolved = await resolveTargets(args, ports, workRoot);
  if ("problem" in resolved) {
    io.stderr(`dsh-verify stop: ${resolved.problem}
`);
    if (args.json) io.stdout(failureJson9([], false));
    return EXIT_CODES.blocked;
  }
  if (args.dryRun) {
    const inspection = await inspectTargets(ports, workRoot, resolved.targets, resolved.enumerateEmpty);
    if ("failed" in inspection) {
      for (const result of inspection.failed) {
        io.stderr(`dsh-verify stop: ${renderResult(result)}
`);
      }
      io.stderr("dsh-verify stop: cannot plan a stop for a target without a readable instance.json\n");
      if (args.json) io.stdout(failureJson9(inspection.failed, false));
      return EXIT_CODES.hardFailure;
    }
    const plan = inspection.plan;
    if (args.json) io.stdout(stopPlanJson(plan));
    else io.stdout(renderStopPlan(plan));
    return EXIT_CODES.ok;
  }
  const results = [];
  for (const target of resolved.targets) {
    const result = await stopTarget(ports, target);
    results.push(result);
    io.stderr(`dsh-verify stop: ${renderResult(result)}
`);
  }
  const ok3 = results.every((result) => result.error === void 0 && result.aliveAfter === false);
  if (args.json) {
    io.stdout(failureJson9(results, ok3));
  } else if (results.length === 0) {
    io.stdout(`no instances found under ${joinFsPath(workRoot, "instances")}
`);
  } else {
    const stopped = results.filter((result) => result.error === void 0).length;
    io.stdout(`stopped ${stopped}/${results.length} instance(s) under ${workRoot}
`);
  }
  return ok3 ? EXIT_CODES.ok : EXIT_CODES.hardFailure;
}

// src/real-machine-verification/cli/entry.ts
import { realpathSync } from "node:fs";
import { pathToFileURL as pathToFileURL4 } from "node:url";
function toFileUrl(path) {
  try {
    return pathToFileURL4(path).href;
  } catch {
    return "";
  }
}
function isCliEntryPoint(argv1, moduleUrl, resolveRealPath = realpathSync) {
  if (argv1 === void 0 || argv1 === "") return false;
  const direct = toFileUrl(argv1);
  if (direct !== "" && direct === moduleUrl) return true;
  try {
    const real = toFileUrl(resolveRealPath(argv1));
    return real !== "" && real === moduleUrl;
  } catch {
    return false;
  }
}

// src/real-machine-verification/cli/io.ts
function createNodeIo() {
  return {
    stdout(text) {
      process.stdout.write(text);
    },
    stderr(text) {
      process.stderr.write(text);
    }
  };
}

// src/real-machine-verification/cli/main.ts
var CLI_NAME2 = "dsh-verify";
var IMPLEMENTED = /* @__PURE__ */ new Set([
  "describe",
  "self-check",
  "launch",
  "stop",
  "isolation",
  "model",
  "freeze",
  "evidence",
  "concurrent",
  "cleanup",
  "batch",
  "run",
  "install",
  "skills",
  "single-instance"
]);
function readPackageVersion() {
  let current = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 8; depth += 1) {
    const manifestPath = resolve(current, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (typeof manifest.version === "string" && manifest.version.length > 0) return manifest.version;
      } catch {
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return "0.0.0-unknown";
}
function renderHelp(description = describeCapability()) {
  const lines = [];
  lines.push(`${CLI_NAME2} ${readPackageVersion()} \u2014 ${description.summary}`);
  lines.push("");
  lines.push("Usage:");
  for (const command of description.commands) lines.push(`  ${command.usage}`);
  lines.push("");
  lines.push("Layers:");
  for (const layer of description.layers) {
    lines.push(`  L${layer.layer}  ${layer.audience.padEnd(32)} ${layer.use}`);
  }
  lines.push("");
  lines.push("Global options:");
  for (const flag of description.globalFlags) {
    const rendered = flag.value === void 0 ? flag.name : `${flag.name} ${flag.value}`;
    lines.push(`  ${rendered.padEnd(26)}${flag.summary}`);
  }
  lines.push("");
  lines.push(`Built-in checks (${description.builtInCheckIds.length}):`);
  lines.push(`  ${description.builtInCheckIds.join(", ")}`);
  lines.push("");
  lines.push(`Profile fields (${description.profileFields.length}): ${description.profileFields.join(", ")}`);
  lines.push("");
  lines.push("Exit codes:");
  for (const key of ["ok", "hardFailure", "blocked"]) {
    lines.push(`  ${description.exitCodes[key]}  ${EXIT_CODE_SUMMARIES[key]}`);
  }
  return lines.join("\n") + "\n";
}
function renderDescription(description = describeCapability()) {
  const lines = [];
  lines.push(`capability ${description.capability} (schema ${description.schemaVersion})`);
  lines.push("");
  lines.push("commands:");
  for (const command of description.commands) {
    lines.push(`  L${command.layer}  ${command.name.padEnd(16)}${command.summary}`);
    lines.push(`        writes: ${command.writes}`);
  }
  lines.push("");
  lines.push(`built-in checks (${description.builtInCheckIds.length}): ${description.builtInCheckIds.join(", ")}`);
  lines.push(`profile fields: ${description.profileFields.join(", ")}`);
  lines.push(
    `exit codes: ok=${description.exitCodes.ok} hardFailure=${description.exitCodes.hardFailure} blocked=${description.exitCodes.blocked}`
  );
  return lines.join("\n") + "\n";
}
function runtimeFacts(deps) {
  const provided = deps.runtime;
  const nodeVersion = provided?.nodeVersion ?? process.versions.node;
  const explicit = provided !== void 0 && Object.prototype.hasOwnProperty.call(provided, "readFileSlice");
  const readFileSlice2 = explicit ? provided?.readFileSlice ?? null : createRuntimeFacts().readFileSlice;
  return { nodeVersion, readFileSlice: readFileSlice2 };
}
async function main(argv = process.argv.slice(2), deps = {}) {
  const io = deps.io ?? createNodeIo();
  const description = describeCapability();
  const parsed = parseArgs(argv);
  const invocationProblems = parsed.unknown.length > 0 ? [`unknown option(s): ${parsed.unknown.join(", ")}`, ...parsed.problems] : [...parsed.problems];
  if (argv.length === 0 || parsed.help || parsed.command === "help") {
    io.stdout(renderHelp(description));
    return EXIT_CODES.ok;
  }
  if (parsed.version || parsed.command === "version") {
    io.stdout(
      `${readPackageVersion()}
capability ${description.capability} (schema ${description.schemaVersion})
`
    );
    return EXIT_CODES.ok;
  }
  if (parsed.command === null) {
    const message = invocationProblems.length > 0 ? invocationProblems.join("; ") : "no command given";
    io.stderr(`${CLI_NAME2}: ${message}

${renderHelp(description)}`);
    if (parsed.json) {
      io.stdout(
        `${JSON.stringify(
          failureJson("", "usage", {
            code: "invalid-input",
            message,
            hint: `usage: ${CLI_NAME2} <command> [flags]; run "${CLI_NAME2} --help" for the command list`
          })
        )}
`
      );
    }
    return EXIT_CODES.blocked;
  }
  if (invocationProblems.length > 0) {
    const message = invocationProblems.join("; ");
    io.stderr(`${CLI_NAME2} ${parsed.command}: ${message}
`);
    const usage = description.commands.find((entry) => entry.name === parsed.command)?.usage;
    if (usage !== void 0) io.stderr(`  usage: ${usage}
`);
    if (parsed.json) {
      io.stdout(
        `${JSON.stringify(
          failureJson(parsed.command, "usage", {
            code: "invalid-input",
            message,
            ...usage === void 0 ? {} : { hint: `usage: ${usage}` }
          })
        )}
`
      );
    }
    return EXIT_CODES.blocked;
  }
  if (parsed.command === "describe") {
    io.stdout(parsed.json ? `${JSON.stringify(description, null, 2)}
` : renderDescription(description));
    return EXIT_CODES.ok;
  }
  const known = description.commands.some((entry) => entry.name === parsed.command);
  if (!known) {
    io.stderr(`${CLI_NAME2}: unknown command "${parsed.command}"

${renderHelp(description)}`);
    return EXIT_CODES.blocked;
  }
  if (!IMPLEMENTED.has(parsed.command)) {
    io.stderr(
      `${CLI_NAME2}: "${parsed.command}" is described but not implemented in this build; use "describe --json" to see the contract
`
    );
    return EXIT_CODES.blocked;
  }
  const ports = deps.ports ?? createNodePorts();
  const common = {
    ports,
    io,
    runtime: runtimeFacts(deps),
    ...deps.loadDeclaration === void 0 ? {} : { loadDeclaration: deps.loadDeclaration }
  };
  const writeTargets = [];
  if (parsed.workRoot !== void 0) {
    writeTargets.push({ flag: "--work-root", value: resolveAgainst(ports.env.cwd(), parsed.workRoot) });
  }
  if (parsed.out !== void 0) {
    writeTargets.push({ flag: "--out", value: resolveAgainst(ports.env.cwd(), parsed.out) });
  }
  if (parsed.archiveRoot !== void 0) {
    writeTargets.push({ flag: "--archive-root", value: resolveAgainst(ports.env.cwd(), parsed.archiveRoot) });
  }
  const realHomeHit = await findWriteUnderRealHome({ fs: ports.fs, env: ports.env, cwd: ports.env.cwd(), writeTargets });
  if (realHomeHit !== null) {
    const message = `refusing to write under the real DSH home ${realHomeHit.realHome}: ${realHomeHit.flag} ${realHomeHit.value}`;
    const hint = `point ${realHomeHit.flag} at a batch home or a system temp directory; this tool never writes the real user home`;
    if (parsed.dryRun) {
      io.stderr(`${CLI_NAME2} ${parsed.command}: warning: ${message} (the dry run writes nothing)
`);
    } else {
      io.stderr(`${CLI_NAME2} ${parsed.command}: ${message}
  hint: ${hint}
`);
      if (parsed.json) {
        io.stdout(`${JSON.stringify(failureJson(parsed.command, "prerequisite", { code: "prerequisite", message, hint }))}
`);
      }
      return EXIT_CODES.blocked;
    }
  }
  if (parsed.command === "self-check") {
    return runSelfCheckCommand(parsed, common);
  }
  if (parsed.command === "launch") {
    return runLaunchCommand(parsed, common);
  }
  if (parsed.command === "isolation") {
    return runIsolationCommand(parsed, common);
  }
  if (parsed.command === "freeze") {
    return runFreezeCommand(parsed, common);
  }
  if (parsed.command === "model") {
    return runModelCommand(parsed, common);
  }
  if (parsed.command === "concurrent") {
    return runConcurrentCommand(parsed, common);
  }
  if (parsed.command === "batch") {
    return runBatchCommand(parsed, common);
  }
  if (parsed.command === "run") {
    return runScenarioCommand(parsed, common);
  }
  if (parsed.command === "install") {
    return runInstallCommand(parsed, common);
  }
  if (parsed.command === "skills") {
    return runSkillsCommand(parsed, common);
  }
  if (parsed.command === "single-instance") {
    return runSingleInstanceCommand(parsed, common);
  }
  if (parsed.command === "evidence") {
    return runEvidenceCommand(parsed, {
      ports,
      io,
      loadBatch: (context) => loadBatchContextForEvidence(
        {
          ...context.batch === void 0 ? {} : { batch: context.batch },
          ...context.name === void 0 ? {} : { name: context.name },
          ...context.workRoot === void 0 ? {} : { workRoot: context.workRoot }
        },
        { ports, cwd: ports.env.cwd() }
      )
    });
  }
  if (parsed.command === "cleanup") {
    return runCleanupCommand(parsed, { ports, io });
  }
  if (parsed.command === "stop") {
    return runStopCommand(parsed, { ports, io });
  }
  io.stderr(`${CLI_NAME2}: "${parsed.command}" reached an unexpected dispatch branch
`);
  return EXIT_CODES.blocked;
}
if (isCliEntryPoint(process.argv[1], import.meta.url)) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
export {
  IMPLEMENTED,
  main,
  renderDescription,
  renderHelp
};
