/*! dsh-featherhunter-plugin-base v0.2.0 */

// src/node/readme-sync.ts
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

// src/node/readme-compare.ts
var MORE_HEADING = /\bMORE\b|作者的其他作品|More from the author|More by the author/i;
var THANKS_HEADING = /\bTHANKS\b|致谢|\bThanks\b|\bContributors\b/i;
var CONTACT_HEADING = /\bCONNECT\b|反馈与联系|Feedback and Contact/i;
var STAR_MARKER = /star-history[-a-z]*\.svg|star-history\.html|星标增长曲线|Star history chart/i;
var DIV_OPEN = /^\s*<div\b/i;
function headingKind(line) {
  const trimmed = line.trim();
  const isHtmlH2 = /^<h2\b/i.test(trimmed);
  const isMarkdownH2 = /^##\s+/.test(trimmed) && !/^###/.test(trimmed);
  if (!isHtmlH2 && !isMarkdownH2) return null;
  if (MORE_HEADING.test(trimmed)) return "more";
  if (THANKS_HEADING.test(trimmed)) return "thanks";
  if (CONTACT_HEADING.test(trimmed)) return "contact";
  return null;
}
function includeWrappingDiv(lines, start) {
  let index = start - 1;
  while (index >= 0 && lines[index].trim() === "") index -= 1;
  if (index >= 0 && DIV_OPEN.test(lines[index])) return index;
  return start;
}
function findStarBlockStart(lines, marker) {
  for (let index = marker; index >= 0 && marker - index <= 8; index -= 1) {
    if (DIV_OPEN.test(lines[index])) return index;
  }
  return marker;
}
function trimBlock(rawLines) {
  const lines = [...rawLines];
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  for (; ; ) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    if (lines.length > 0 && /^-{3,}$/.test(lines[lines.length - 1].trim())) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n");
}
function locateReadmeBlocks(markdown) {
  const lines = markdown.split(/\r?\n/);
  const candidates = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const kind = headingKind(line);
    if (kind !== null) {
      candidates.push({ kind, start: includeWrappingDiv(lines, index) });
      continue;
    }
    if (STAR_MARKER.test(line)) {
      candidates.push({ kind: "star-history", start: findStarBlockStart(lines, index) });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const ordered = [];
  for (const candidate of candidates.sort((a, b) => a.start - b.start)) {
    if (seen.has(candidate.kind)) continue;
    seen.add(candidate.kind);
    ordered.push(candidate);
  }
  const blocks = {
    contact: null,
    "star-history": null,
    thanks: null,
    more: null
  };
  const order = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const candidate = ordered[index];
    const end = index + 1 < ordered.length ? ordered[index + 1].start : lines.length;
    blocks[candidate.kind] = trimBlock(lines.slice(candidate.start, end));
    order.push(candidate.kind);
  }
  return { blocks, order, suspicious: findSuspiciousLines(markdown) };
}
var CONFLICT_START = /^\s*<{7}(?:\s|$)/;
var CONFLICT_SEPARATOR = /^\s*={7}\s*$/;
var CONFLICT_END = /^\s*>{7}(?:\s|$)/;
var MERGE_RESIDUE = /<{7}\s+\S|>{7}\s+\S/;
function findSuspiciousLines(markdown) {
  const found = [];
  markdown.split(/\r?\n/).forEach((line, index) => {
    let reason = null;
    if (CONFLICT_START.test(line)) reason = "conflict-start";
    else if (CONFLICT_SEPARATOR.test(line)) reason = "conflict-separator";
    else if (CONFLICT_END.test(line)) reason = "conflict-end";
    else if (MERGE_RESIDUE.test(line)) reason = "merge-conflict-residue";
    if (reason !== null) found.push({ line: index + 1, text: line, reason });
  });
  return found;
}
var NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};
function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, body) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isNaN(code) ? entity : String.fromCodePoint(code);
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isNaN(code) ? entity : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}
function stripTags(html) {
  let text = html.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}
function parseAttributes(attributeText) {
  const attributes = {};
  const pattern = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\`]+)))?/g;
  let match;
  while ((match = pattern.exec(attributeText)) !== null) {
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    attributes[match[1].toLowerCase()] = decodeEntities(value);
  }
  return attributes;
}
function assetName(src) {
  const clean = src.split(/[?#]/)[0].trim();
  const segments = clean.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : "";
}
function toWidth(value) {
  if (value === void 0) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}
function parseHeading(raw) {
  const html = /<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(raw);
  const markdown = /^##\s+(.+)$/m.exec(raw);
  const inner = html !== null ? html[1] : markdown !== null ? markdown[1] : null;
  if (inner === null) return null;
  const subMatch = /<sub>([\s\S]*?)<\/sub>/i.exec(inner);
  const sub = subMatch !== null ? stripTags(subMatch[1]) : null;
  const text = stripTags(inner.replace(/<sub>[\s\S]*?<\/sub>/i, " "));
  return { sub: sub !== null && sub !== "" ? sub : null, text };
}
function parseContactBlock(raw) {
  const variant = /<h2\b/i.test(raw) ? "html-heading" : "markdown-heading";
  const heading = parseHeading(raw);
  const table = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(raw);
  const rows = table !== null ? [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)] : [];
  const titleRow = rows.find((row) => /<b\b/i.test(row[1]));
  const imageRow = rows.find((row) => /<img\b/i.test(row[1]));
  const titles = titleRow !== void 0 ? [...titleRow[1].matchAll(/<b\b[^>]*>([\s\S]*?)<\/b>/gi)].map((match) => stripTags(match[1])) : [];
  const images = imageRow !== void 0 ? [...imageRow[1].matchAll(/<img\b([^>]*)>/gi)].map((match) => parseAttributes(match[1])) : [];
  const groups = images.map((attributes, index) => {
    const src = attributes.src ?? "";
    return {
      title: titles[index] ?? "",
      src,
      asset: assetName(src),
      width: toWidth(attributes.width),
      alt: attributes.alt ?? ""
    };
  });
  let rest = raw;
  const htmlHeading = /<h2\b[^>]*>[\s\S]*?<\/h2>/i.exec(rest);
  if (htmlHeading !== null) rest = rest.replace(htmlHeading[0], " ");
  else rest = rest.replace(/^##\s+.*$/m, " ");
  rest = rest.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, " ");
  const welcome = stripTags(rest);
  return { variant, heading, welcome: welcome === "" ? null : welcome, groups };
}
function firstSourceValue(attributes) {
  const raw = attributes.srcset ?? attributes.src ?? "";
  return raw.split(/[\s,]+/).filter(Boolean)[0] ?? "";
}
function sourceMedia(attributes) {
  const media = attributes.media ?? "";
  const match = /prefers-color-scheme:\s*(dark|light)/i.exec(media);
  return match !== null ? match[1].toLowerCase() : null;
}
function toImage(attributes) {
  const src = attributes.src ?? "";
  return { alt: attributes.alt ?? "", src, asset: assetName(src), width: toWidth(attributes.width) };
}
function parseStarHistoryBlock(raw) {
  const picture = /<picture\b[^>]*>([\s\S]*?)<\/picture>/i.exec(raw);
  const imageTag = /<img\b([^>]*)>/i.exec(picture !== null ? picture[1] : raw);
  let image = imageTag !== null ? toImage(parseAttributes(imageTag[1])) : null;
  if (image === null) {
    const markdownImage = /!\[([^\]]*)\]\(\s*([^)\s]+)/.exec(raw);
    if (markdownImage !== null) {
      const src = markdownImage[2];
      image = { alt: markdownImage[1], src, asset: assetName(src), width: null };
    }
  }
  const sources = [];
  if (picture !== null) {
    for (const match of picture[1].matchAll(/<source\b([^>]*)>/gi)) {
      const attributes = parseAttributes(match[1]);
      const src = firstSourceValue(attributes);
      sources.push({ media: sourceMedia(attributes), src, asset: assetName(src) });
    }
  }
  const linkTag = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/i.exec(raw);
  const link = linkTag !== null ? decodeEntities(linkTag[1]) : null;
  const sub = /<sub>([\s\S]*?)<\/sub>/i.exec(raw);
  const caption = sub !== null ? stripTags(sub[1]) : null;
  let variant;
  if (picture !== null) variant = link !== null ? "picture-link" : "picture";
  else if (/!\[[^\]]*\]\([^)]*\)/.test(raw)) variant = "markdown-image";
  else variant = "unknown";
  return {
    variant,
    link,
    sources,
    image,
    caption: caption !== null && caption !== "" ? caption : null
  };
}
function removeHeading(raw) {
  const html = /<h2\b[^>]*>[\s\S]*?<\/h2>/i.exec(raw);
  if (html !== null) return raw.replace(html[0], " ");
  return raw.replace(/^##\s+.*$/m, " ");
}
function prose(lines) {
  const text = stripTags(lines.filter((line) => !/^\s*-{3,}\s*$/.test(line)).join("\n"));
  return text === "" ? null : text;
}
function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let buffer = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (character === "\\" && trimmed[index + 1] === "|") {
      buffer += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(buffer);
      buffer = "";
    } else {
      buffer += character;
    }
  }
  cells.push(buffer);
  return cells.map((cell) => cell.trim());
}
function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*\|?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
}
function toThanksCell(rawCell) {
  const links = [];
  for (const match of rawCell.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)) links.push(match[2]);
  return { text: stripTags(rawCell), links };
}
function parseThanksBlock(raw) {
  const variant = /<h2\b/i.test(raw) ? "html-heading" : "markdown-heading";
  const heading = parseHeading(raw);
  const marker = /<!--\s*THANKS-TABLE-(ZH|EN)-START\s*-->/i.exec(raw);
  const lang = marker !== null ? marker[1].toLowerCase() : null;
  const tableLines = raw.split(/\r?\n/).filter((line) => /^\s*\|/.test(line));
  const dataLines = tableLines.filter((line) => !isTableSeparator(line));
  const headers = dataLines.length > 0 ? splitTableRow(dataLines[0]).map((cell) => stripTags(cell)) : [];
  const rows = dataLines.slice(1).map((line) => ({ cells: splitTableRow(line).map(toThanksCell) }));
  const body = removeHeading(raw);
  const proseText = prose(body.split(/\r?\n/).filter((line) => !/^\s*\|/.test(line)));
  return { variant, heading, lang, headers, rows, prose: proseText };
}
var MORE_ITEM = /^\s*\*\*\s*\[([^\]]+)\]\(([^)\s]+)\)\s*\*\*\s*(.*)$/;
function parseMoreBlock(raw) {
  const variant = /<h2\b/i.test(raw) ? "html-heading" : "markdown-heading";
  const heading = parseHeading(raw);
  const lines = raw.split(/\r?\n/);
  const itemIndexes = [];
  const items = [];
  lines.forEach((line, index) => {
    const match = MORE_ITEM.exec(line);
    if (match === null) return;
    const description = match[3].replace(/^(?:——|—|--|-)\s*/, "").trim();
    items.push({ name: stripTags(match[1]), url: match[2], description: stripTags(description) });
    itemIndexes.push(index);
  });
  const headingRemoved = removeHeading(raw).split(/\r?\n/);
  const firstItem = itemIndexes.length > 0 ? itemIndexes[0] : -1;
  const lastItem = itemIndexes.length > 0 ? itemIndexes[itemIndexes.length - 1] : -1;
  const intro = prose(headingRemoved.slice(0, firstItem === -1 ? headingRemoved.length : firstItem));
  const footer = lastItem === -1 ? null : prose(headingRemoved.slice(lastItem + 1));
  return { variant, heading, intro, items, footer };
}
var MARKUP_STAGES = [
  "line-endings",
  "whitespace",
  "quotes",
  "attribute-order",
  "self-closing"
];
var SELF_CLOSING_VOID = /<(img|source|br|hr|input|meta|link)\b([^>]*?)\s*\/>/gi;
function normalizeForCompare(value) {
  if (value === void 0) return null;
  if (Array.isArray(value)) return value.map(normalizeForCompare);
  if (value !== null && typeof value === "object") {
    const source = value;
    const normalized = {};
    for (const key of Object.keys(source).sort()) normalized[key] = normalizeForCompare(source[key]);
    return normalized;
  }
  return value;
}
function sameValue(expected, actual) {
  return JSON.stringify(normalizeForCompare(expected)) === JSON.stringify(normalizeForCompare(actual));
}
function pushDifference(differences, dimension, path, expected, actual) {
  if (sameValue(expected, actual)) return;
  differences.push({ dimension, path, expected, actual });
}
function canonicalTag(tag) {
  const match = /^<([a-zA-Z][\w:-]*)((?:\s[^>]*?)?)\s*(\/?)>$/.exec(tag);
  if (match === null) return tag;
  const name = match[1];
  const attributes = parseAttributes(match[2] ?? "");
  const rebuilt = Object.keys(attributes).sort().map((key) => key + '="' + attributes[key] + '"').join(" ");
  const selfClosing = match[3] === "/" ? " /" : "";
  return "<" + name + (rebuilt === "" ? "" : " " + rebuilt) + selfClosing + ">";
}
function applyStage(text, stage) {
  switch (stage) {
    case "line-endings":
      return text.replace(/\r\n?/g, "\n");
    case "whitespace": {
      const collapsedTags = text.replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/\s+/g, " "));
      const lines = collapsedTags.split(/\r?\n/).map((line) => line.replace(/[ \t]+/g, " ").trim()).filter((line) => line !== "");
      return lines.join("\n").replace(/>\s*\n\s*</g, "><").trim();
    }
    case "quotes":
      return text.replace(/<[a-zA-Z][^>]*>/g, (tag) => tag.replace(/([a-zA-Z-]+)\s*=\s*'([^']*)'/g, '$1="$2"'));
    case "attribute-order":
      return text.replace(/<[a-zA-Z][^>]*>/g, canonicalTag);
    case "self-closing":
      return text.replace(SELF_CLOSING_VOID, "<$1$2>");
  }
}
function canonicalizeMarkup(markup) {
  return MARKUP_STAGES.reduce((text, stage) => applyStage(text, stage), markup);
}
function detectFormatHints(expected, actual) {
  const changed = [];
  let expectedText = expected;
  let actualText = actual;
  for (const stage of MARKUP_STAGES) {
    const nextExpected = applyStage(expectedText, stage);
    const nextActual = applyStage(actualText, stage);
    const stageChanged = nextExpected !== expectedText || nextActual !== actualText;
    expectedText = nextExpected;
    actualText = nextActual;
    if (stageChanged) changed.push({ kind: stage });
    if (expectedText === actualText) return changed;
  }
  return [{ kind: "markup" }];
}
function headingVariant(kind, raw) {
  switch (kind) {
    case "contact":
      return parseContactBlock(raw).variant;
    case "star-history":
      return null;
    case "thanks":
      return parseThanksBlock(raw).variant;
    case "more":
      return parseMoreBlock(raw).variant;
  }
}
function compareContactBlocks(expectedRaw, actualRaw, options) {
  const expected = parseContactBlock(expectedRaw);
  const actual = parseContactBlock(actualRaw);
  const differences = [];
  pushDifference(differences, "text", "contact.heading", expected.heading?.text ?? null, actual.heading?.text ?? null);
  pushDifference(differences, "members", "contact.groups", expected.groups.length, actual.groups.length);
  const count = Math.max(expected.groups.length, actual.groups.length);
  for (let index = 0; index < count; index += 1) {
    const expectedGroup = expected.groups[index];
    const actualGroup = actual.groups[index];
    const path = "contact.groups[" + index + "]";
    if (expectedGroup === void 0 || actualGroup === void 0) {
      pushDifference(differences, "members", path, expectedGroup ?? null, actualGroup ?? null);
      continue;
    }
    pushDifference(differences, "text", path + ".title", expectedGroup.title, actualGroup.title);
    pushDifference(differences, "text", path + ".alt", expectedGroup.alt, actualGroup.alt);
    pushDifference(differences, "width", path + ".width", expectedGroup.width, actualGroup.width);
    if (options.imageSrc === "exact") {
      pushDifference(differences, "image", path + ".src", expectedGroup.src, actualGroup.src);
    } else {
      pushDifference(differences, "image", path + ".asset", expectedGroup.asset, actualGroup.asset);
    }
  }
  return differences;
}
function sortedSources(sources) {
  return [...sources].sort((left, right) => {
    const byMedia = (left.media ?? "").localeCompare(right.media ?? "");
    return byMedia !== 0 ? byMedia : left.asset.localeCompare(right.asset);
  });
}
function compareStarHistoryBlocks(expectedRaw, actualRaw, options) {
  const expected = parseStarHistoryBlock(expectedRaw);
  const actual = parseStarHistoryBlock(actualRaw);
  const differences = [];
  pushDifference(differences, "links", "star-history.link", expected.link, actual.link);
  if (expected.image === null || actual.image === null) {
    pushDifference(
      differences,
      "image",
      "star-history.image",
      expected.image === null ? null : "present",
      actual.image === null ? null : "present"
    );
  } else {
    pushDifference(differences, "text", "star-history.image.alt", expected.image.alt, actual.image.alt);
    pushDifference(differences, "width", "star-history.image.width", expected.image.width, actual.image.width);
    if (options.imageSrc === "exact") {
      pushDifference(differences, "image", "star-history.image.src", expected.image.src, actual.image.src);
    } else {
      pushDifference(differences, "image", "star-history.image.asset", expected.image.asset, actual.image.asset);
    }
  }
  const expectedSources = sortedSources(expected.sources);
  const actualSources = sortedSources(actual.sources);
  if (expectedSources.length !== actualSources.length) {
    pushDifference(
      differences,
      "image",
      "star-history.sources",
      expectedSources.map((source) => [source.media, source.asset]),
      actualSources.map((source) => [source.media, source.asset])
    );
  } else {
    expectedSources.forEach((source, index) => {
      const actualSource = actualSources[index];
      pushDifference(differences, "image", "star-history.sources[" + index + "].media", source.media, actualSource.media);
      if (options.imageSrc === "exact") {
        pushDifference(differences, "image", "star-history.sources[" + index + "].src", source.src, actualSource.src);
      } else {
        pushDifference(differences, "image", "star-history.sources[" + index + "].asset", source.asset, actualSource.asset);
      }
    });
  }
  pushDifference(differences, "text", "star-history.caption", expected.caption, actual.caption);
  return differences;
}
function compareThanksBlocks(expectedRaw, actualRaw) {
  const expected = parseThanksBlock(expectedRaw);
  const actual = parseThanksBlock(actualRaw);
  const differences = [];
  pushDifference(differences, "text", "thanks.heading", expected.heading?.text ?? null, actual.heading?.text ?? null);
  pushDifference(differences, "table", "thanks.headers", expected.headers, actual.headers);
  const headerCount = Math.max(expected.headers.length, actual.headers.length);
  for (let index = 0; index < headerCount; index += 1) {
    pushDifference(differences, "table", "thanks.headers[" + index + "]", expected.headers[index] ?? null, actual.headers[index] ?? null);
  }
  pushDifference(differences, "table", "thanks.rows", expected.rows.length, actual.rows.length);
  const rowCount = Math.max(expected.rows.length, actual.rows.length);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const expectedRow = expected.rows[rowIndex];
    const actualRow = actual.rows[rowIndex];
    const rowPath = "thanks.rows[" + rowIndex + "]";
    if (expectedRow === void 0 || actualRow === void 0) {
      pushDifference(differences, "table", rowPath, expectedRow ?? null, actualRow ?? null);
      continue;
    }
    pushDifference(differences, "table", rowPath + ".cells", expectedRow.cells.length, actualRow.cells.length);
    const cellCount = Math.max(expectedRow.cells.length, actualRow.cells.length);
    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const expectedCell = expectedRow.cells[cellIndex];
      const actualCell = actualRow.cells[cellIndex];
      const cellPath = rowPath + ".cells[" + cellIndex + "]";
      if (expectedCell === void 0 || actualCell === void 0) {
        pushDifference(differences, "table", cellPath, expectedCell ?? null, actualCell ?? null);
        continue;
      }
      pushDifference(differences, "table", cellPath + ".text", expectedCell.text, actualCell.text);
      pushDifference(differences, "links", cellPath + ".links", expectedCell.links, actualCell.links);
      const linkCount = Math.max(expectedCell.links.length, actualCell.links.length);
      for (let linkIndex = 0; linkIndex < linkCount; linkIndex += 1) {
        pushDifference(
          differences,
          "links",
          cellPath + ".links[" + linkIndex + "]",
          expectedCell.links[linkIndex] ?? null,
          actualCell.links[linkIndex] ?? null
        );
      }
    }
  }
  return differences;
}
function compareMoreBlocks(expectedRaw, actualRaw) {
  const expected = parseMoreBlock(expectedRaw);
  const actual = parseMoreBlock(actualRaw);
  const differences = [];
  pushDifference(differences, "text", "more.heading", expected.heading?.text ?? null, actual.heading?.text ?? null);
  const expectedNames = expected.items.map((item) => item.name);
  const actualNames = actual.items.map((item) => item.name);
  const expectedSorted = [...expectedNames].sort();
  const actualSorted = [...actualNames].sort();
  const sameMemberSet = sameValue(expectedSorted, actualSorted);
  const sameOrder = sameValue(expectedNames, actualNames);
  if (!sameOrder) {
    pushDifference(differences, "members", "more.items", expectedNames, actualNames);
    if (sameMemberSet) return differences;
  }
  const count = Math.max(expected.items.length, actual.items.length);
  for (let index = 0; index < count; index += 1) {
    const expectedItem = expected.items[index];
    const actualItem = actual.items[index];
    const path = "more.items[" + index + "]";
    if (expectedItem === void 0 || actualItem === void 0) {
      pushDifference(differences, "members", path, expectedItem ?? null, actualItem ?? null);
      continue;
    }
    pushDifference(differences, "text", path + ".name", expectedItem.name, actualItem.name);
    pushDifference(differences, "links", path + ".url", expectedItem.url, actualItem.url);
    pushDifference(differences, "text", path + ".description", expectedItem.description, actualItem.description);
  }
  return differences;
}
function compareBlockContent(kind, expectedRaw, actualRaw, options) {
  switch (kind) {
    case "contact":
      return compareContactBlocks(expectedRaw, actualRaw, options);
    case "star-history":
      return compareStarHistoryBlocks(expectedRaw, actualRaw, options);
    case "thanks":
      return compareThanksBlocks(expectedRaw, actualRaw);
    case "more":
      return compareMoreBlocks(expectedRaw, actualRaw);
  }
}
function compareBlocks(kind, expectedRaw, actualRaw, options = {}) {
  if (expectedRaw === null && actualRaw === null) {
    return { kind, identical: true, equivalent: true, contentDifferences: [], formatDifferences: [] };
  }
  if (expectedRaw === null || actualRaw === null) {
    return {
      kind,
      identical: false,
      equivalent: false,
      contentDifferences: [
        {
          dimension: "presence",
          path: kind,
          expected: expectedRaw === null ? null : "present",
          actual: actualRaw === null ? null : "present"
        }
      ],
      formatDifferences: []
    };
  }
  const contentDifferences = compareBlockContent(kind, expectedRaw, actualRaw, options);
  const identical = expectedRaw === actualRaw;
  let formatDifferences = [];
  if (!identical && contentDifferences.length === 0) {
    formatDifferences = detectFormatHints(expectedRaw, actualRaw);
    const expectedVariant = headingVariant(kind, expectedRaw);
    const actualVariant = headingVariant(kind, actualRaw);
    if (expectedVariant !== null && actualVariant !== null && expectedVariant !== actualVariant) {
      formatDifferences = [{ kind: "heading-variant" }, ...formatDifferences.filter((entry) => entry.kind !== "heading-variant")];
    }
  }
  return { kind, identical, equivalent: contentDifferences.length === 0, contentDifferences, formatDifferences };
}
var BLOCK_KINDS = ["contact", "star-history", "thanks", "more"];
function compareReadmeBlocks(expected, actual, options = {}) {
  const expectedLocated = typeof expected === "string" ? locateReadmeBlocks(expected) : expected;
  const actualLocated = typeof actual === "string" ? locateReadmeBlocks(actual) : actual;
  const blocks = {};
  const contentDifferences = [];
  const formatDifferences = [];
  for (const kind of BLOCK_KINDS) {
    const comparison = compareBlocks(kind, expectedLocated.blocks[kind], actualLocated.blocks[kind], options);
    blocks[kind] = comparison;
    contentDifferences.push(...comparison.contentDifferences);
    for (const difference of comparison.formatDifferences) formatDifferences.push({ ...difference, block: kind });
  }
  return {
    equivalent: contentDifferences.length === 0,
    blocks,
    contentDifferences,
    formatDifferences,
    order: {
      expected: expectedLocated.order,
      actual: actualLocated.order,
      same: sameValue(expectedLocated.order, actualLocated.order)
    },
    suspicious: actualLocated.suspicious
  };
}

// src/core/baseline.ts
var BASELINE = {
  "manifest": {
    "schema": 1,
    "version": "0.1.8",
    "revision": 3,
    "updatedAt": "2026-11-01T00:00:00+08:00",
    "fallbackUrl": "https://github.com/FeatherHunter/featherhunter-plugin-manage",
    "groups": [
      {
        "id": "feishu",
        "platform": "feishu",
        "order": 10,
        "readmeTitle": {
          "zh": "\u98DE\u4E66\u7FA4\uFF08\u4E3B\uFF09",
          "en": "Feishu Group (Main)"
        },
        "alt": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4 \u98DE\u4E66\u7FA4\u4E8C\u7EF4\u7801",
          "en": "DSH plugin community group Feishu QR code"
        },
        "card": "card-feishu.png",
        "qr": {
          "kind": "bundled",
          "key": "qr-feishu"
        },
        "title": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4",
          "en": "DSH Plugin Community"
        },
        "subtitle": {
          "zh": "\u7528\u6237418832\u7684\u7EC4\u7EC7",
          "en": "User 418832's organization"
        },
        "note": {
          "zh": "\u8BE5\u4E8C\u7EF4\u7801\u6C38\u4E45\u6709\u6548",
          "en": "This QR code never expires"
        }
      },
      {
        "id": "qq",
        "platform": "qq",
        "order": 20,
        "readmeTitle": {
          "zh": "QQ\u7FA4\uFF08\u65B0\uFF09",
          "en": "QQ Group (New)"
        },
        "alt": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4 QQ \u7FA4\u4E8C\u7EF4\u7801",
          "en": "DSH plugin community group QQ QR code"
        },
        "card": "card-qq.png",
        "qr": {
          "kind": "bundled",
          "key": "qr-qq"
        },
        "title": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4",
          "en": "DSH Plugin Community"
        },
        "subtitle": {
          "zh": "\u7FA4\u53F7\uFF1A1020866453",
          "en": "Group ID: 1020866453"
        },
        "note": {
          "zh": "\u626B\u4E00\u626B\u4E8C\u7EF4\u7801\uFF0C\u52A0\u5165\u7FA4\u804A",
          "en": "Scan the QR code to join the group chat"
        }
      },
      {
        "id": "wechat",
        "platform": "wechat",
        "order": 30,
        "readmeTitle": {
          "zh": "\u5FAE\u4FE1\u7FA4\uFF08\u65B0\uFF09",
          "en": "WeChat Group (New)"
        },
        "alt": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4\u5FAE\u4FE1\u7FA4\u4E8C\u7EF4\u7801",
          "en": "DSH plugin community group WeChat QR code"
        },
        "card": "card-wechat-2026-10-31.png",
        "qr": {
          "kind": "bundled",
          "key": "qr-wechat"
        },
        "title": {
          "zh": "DSH \u63D2\u4EF6\u4EA4\u6D41\u7FA4",
          "en": "DSH Plugin Community"
        },
        "validUntil": "2026-11-07"
      }
    ],
    "plugins": [
      {
        "id": "deck",
        "order": 10,
        "verifiedAt": "2026-10-30",
        "name": "dsh-mattpocock-skills-deck",
        "repo": "FeatherHunter/dsh-mattpocock-skills-deck",
        "desc": {
          "zh": "\u8FD1 30 \u4E07 star \u7684 mattpocock/skills \u6574\u5957\u9884\u7F6E\u597D\uFF0827 \u4E2A\u6280\u80FD\uFF09\uFF0C\u88C5\u597D\u5373\u7528\u3002",
          "en": "The whole mattpocock/skills set (nearly 300k stars) preinstalled \u2014 27 skills, ready as soon as it is installed."
        },
        "url": "https://github.com/FeatherHunter/dsh-mattpocock-skills-deck"
      },
      {
        "id": "prompt",
        "order": 20,
        "verifiedAt": "2026-10-30",
        "name": "dsh-prompt",
        "repo": "FeatherHunter/dsh-prompt",
        "desc": {
          "zh": "\u7ECF\u5E38\u53CD\u590D\u91CD\u590D\u7684\u6A21\u677F\u5316\u63D0\u793A\u8BCD\uFF0C\u5B58\u6210\u81EA\u5B9A\u4E49\u6A21\u677F\uFF0C\u9009\u4E2D\u540E\u76F4\u63A5\u6CE8\u5165\uFF0C\u4E0D\u518D\u9700\u8981\u8017\u8D39\u7CBE\u529B\u3002",
          "en": "The boilerplate prompts you keep retyping, saved as custom templates and injected on selection \u2014 no more wasted effort."
        },
        "url": "https://github.com/FeatherHunter/dsh-prompt"
      },
      {
        "id": "palette",
        "order": 30,
        "verifiedAt": "2026-10-30",
        "name": "dsh-opencode-palette",
        "repo": "FeatherHunter/dsh-opencode-palette",
        "desc": {
          "zh": "38 \u6B3E opencode \u7ECF\u5178\u914D\u8272 + 20+\u81EA\u5B9A\u4E49\u4E3B\u9898 \u4E00\u952E\u6362\u88C5 DSH\u3002",
          "en": "38 classic opencode themes + 20+ custom themes \u2014 reskin DSH in one click."
        },
        "url": "https://github.com/FeatherHunter/dsh-opencode-palette"
      },
      {
        "id": "im",
        "order": 40,
        "verifiedAt": "2026-10-30",
        "name": "dsh-im-companion",
        "repo": "FeatherHunter/dsh-im-companion",
        "desc": {
          "zh": "\u7ED9 dsh-im \u52A0\u4E86\u300C\u52A9\u7406\u300D\u548C\u300C\u5BB6\u300D\u7684\u6982\u5FF5\u3002",
          "en": "Adds the ideas of an \u201Cassistant\u201D and a \u201Chome\u201D to dsh-im."
        },
        "url": "https://github.com/FeatherHunter/dsh-im-companion"
      },
      {
        "id": "ilife",
        "order": 50,
        "verifiedAt": "2026-10-30",
        "name": "ilife",
        "repo": "FeatherHunter/ilife",
        "desc": {
          "zh": "\u26A0\uFE0F\u5EFA\u8BBE\u4E2D\u26A0\uFE0F\u7231\u751F\u6D3B\uFF1A\u5C45\u5BB6\u751F\u6D3B\u5957\u4EF6\uFF0C\u8BB0\u8D26\u3001\u8FD0\u52A8\u3001\u996E\u98DF\u3001\u4F53\u91CD\u3001\u98DF\u8C31\u3001\u7269\u54C1\u7BA1\u7406\u3001\u4F5C\u606F\u89C4\u5212\u3001\u5907\u5FD8\u5F55\u7B49\u3002",
          "en": "\u26A0\uFE0FWork in progress\u26A0\uFE0F iLife, the home-life suite: bookkeeping, exercise, diet, weight, recipes, item management, schedule planning, memos and more."
        },
        "url": "https://github.com/FeatherHunter/ilife"
      }
    ]
  },
  "qr": {
    "qr-feishu": "data:image/png;base64,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",
    "qr-qq": "data:image/png;base64,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",
    "qr-wechat": "data:image/png;base64,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"
  }
};

// src/core/index.ts
var DAY_MS = 24 * 60 * 60 * 1e3;
var DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function pickText(text, lang) {
  if (!text) return "";
  return text[lang] ?? text.zh ?? text.en ?? "";
}
function sortByOrder(items) {
  return [...items].sort((a, b) => a.order - b.order);
}
function pluginHref(plugin) {
  const url = plugin.url;
  return url !== void 0 && url.length > 0 ? url : "https://github.com/" + plugin.repo;
}
function parseDateOnly(value) {
  const match = DATE_ONLY_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireString(record, key, where) {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`manifest: ${where}.${key} must be a non-empty string`);
  }
  return value;
}
function requireI18n(record, key, where) {
  const value = record[key];
  if (!isRecord(value)) throw new Error(`manifest: ${where}.${key} must be an object`);
  const zh = value.zh;
  const en = value.en;
  if (typeof zh !== "string" || zh.length === 0) {
    throw new Error(`manifest: ${where}.${key}.zh must be a non-empty string`);
  }
  if (typeof en !== "string" || en.length === 0) {
    throw new Error(`manifest: ${where}.${key}.en must be a non-empty string`);
  }
  return { zh, en };
}
function requireOrder(record, where) {
  const value = record["order"];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`manifest: ${where}.order must be a number`);
  }
  return value;
}
function validateGroup(value, index) {
  const where = `groups[${index}]`;
  if (!isRecord(value)) throw new Error(`manifest: ${where} must be an object`);
  const id = requireString(value, "id", where);
  const platform = requireString(value, "platform", where);
  const order = requireOrder(value, where);
  const readmeTitle = requireI18n(value, "readmeTitle", where);
  const alt = requireI18n(value, "alt", where);
  const card = requireString(value, "card", where);
  const title = requireI18n(value, "title", where);
  const qrRaw = value["qr"];
  if (!isRecord(qrRaw)) throw new Error(`manifest: ${where}.qr must be an object`);
  const kind = qrRaw["kind"];
  let qr;
  if (kind === "bundled") {
    qr = { kind: "bundled", key: requireString(qrRaw, "key", `${where}.qr`) };
  } else if (kind === "remote") {
    qr = { kind: "remote", path: requireString(qrRaw, "path", `${where}.qr`) };
  } else {
    throw new Error(`manifest: ${where}.qr.kind must be "bundled" or "remote"`);
  }
  const group = { id, platform, order, readmeTitle, alt, card, qr, title };
  const subtitle = value["subtitle"];
  if (subtitle !== void 0) {
    if (!isRecord(subtitle)) throw new Error(`manifest: ${where}.subtitle must be an object`);
    group.subtitle = requireI18n(value, "subtitle", where);
  }
  const note = value["note"];
  if (note !== void 0) {
    if (!isRecord(note)) throw new Error(`manifest: ${where}.note must be an object`);
    group.note = requireI18n(value, "note", where);
  }
  const validUntil = value["validUntil"];
  if (validUntil !== void 0) {
    if (typeof validUntil !== "string" || parseDateOnly(validUntil) === null) {
      throw new Error(`manifest: ${where}.validUntil must be a valid YYYY-MM-DD date`);
    }
    group.validUntil = validUntil;
  }
  return group;
}
function validatePlugin(value, index) {
  const where = `plugins[${index}]`;
  if (!isRecord(value)) throw new Error(`manifest: ${where} must be an object`);
  const id = requireString(value, "id", where);
  const order = requireOrder(value, where);
  const verifiedAt = requireString(value, "verifiedAt", where);
  if (parseDateOnly(verifiedAt) === null) {
    throw new Error(`manifest: ${where}.verifiedAt must be a valid YYYY-MM-DD date`);
  }
  const name = requireString(value, "name", where);
  const repo = requireString(value, "repo", where);
  const desc = requireI18n(value, "desc", where);
  const entry = { id, order, verifiedAt, name, repo, desc };
  const url = value["url"];
  if (url !== void 0) entry.url = requireString(value, "url", where);
  return entry;
}
function parseManifest(raw) {
  if (!isRecord(raw)) throw new Error("manifest: root must be an object");
  if (raw["schema"] !== 1) throw new Error("manifest: schema must be 1");
  const version = requireString(raw, "version", "manifest");
  const revision = raw["revision"];
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) {
    throw new Error("manifest: revision must be a non-negative integer");
  }
  const updatedAt = requireString(raw, "updatedAt", "manifest");
  if (Number.isNaN(Date.parse(updatedAt))) {
    throw new Error("manifest: updatedAt must be a parseable timestamp");
  }
  const fallbackUrl = requireString(raw, "fallbackUrl", "manifest");
  if (!/^https?:\/\//.test(fallbackUrl)) {
    throw new Error("manifest: fallbackUrl must be an absolute http(s) URL");
  }
  const groupsRaw = raw["groups"];
  if (!Array.isArray(groupsRaw)) throw new Error("manifest: groups must be an array");
  if (groupsRaw.length === 0) throw new Error("manifest: groups must not be empty");
  const pluginsRaw = raw["plugins"];
  if (!Array.isArray(pluginsRaw)) throw new Error("manifest: plugins must be an array");
  if (pluginsRaw.length === 0) throw new Error("manifest: plugins must not be empty");
  const groups = groupsRaw.map(validateGroup);
  const plugins = pluginsRaw.map(validatePlugin);
  const ids = /* @__PURE__ */ new Set();
  for (const group of groups) {
    if (ids.has(group.id)) throw new Error(`manifest: duplicate group id "${group.id}"`);
    ids.add(group.id);
  }
  return { schema: 1, version, revision, updatedAt, fallbackUrl, groups, plugins };
}

// src/node/star-assets.ts
var STAR_CHART_DEFAULT_DARK = "docs/star-history-dark.svg";
var STAR_CHART_DEFAULT_LIGHT = "docs/star-history-light.svg";

// src/node/renderers.ts
var DEFAULT_CDN_BASE = "https://cdn.jsdelivr.net/npm/dsh-featherhunter-plugin-base";
var CONTACT_CARD_WIDTH = 260;
var CONTACT_TEXT = {
  sub: "CONNECT",
  heading: {
    zh: "\u53CD\u9988\u4E0E\u8054\u7CFB",
    en: "Feedback and Contact"
  },
  welcome: {
    zh: "\u{1F44F}\u6B22\u8FCE\u63D0\u4EA4PR\u3001ISSUE\u3002\u661F\u661F\u4E4B\u706B\u53EF\u4EE5\u71CE\u539F\u{1F525}\u6709\u4EFB\u4F55\u5EFA\u8BAE\u3001\u610F\u89C1\u3001\u60F3\u6CD5\u3001\u5410\u69FD\u3001idea\u90FD\u53EF\u4EE5\u8FDB\u7FA4\u4EA4\u6D41\u3002",
    en: "\u{1F44F}Welcome PRs and issues. A single spark can start a prairie fire \u{1F525}. Any suggestion, opinion, idea or rant \u2014 come join the group and talk."
  }
};
var MORE_TEXT = {
  sub: "MORE",
  heading: {
    zh: "\u4F5C\u8005\u7684\u5176\u4ED6\u4F5C\u54C1",
    en: "More from the author"
  },
  leadIn: {
    zh: "\u559C\u6B22\u8FD9\u4E2A\u63D2\u4EF6\u7684\u8BDD\uFF0C\u8FD9\u4E9B\u53EF\u80FD\u4F60\u4E5F\u7528\u5F97\u4E0A\uFF1A",
    en: "If you like this plugin, these might help too:"
  },
  separator: {
    zh: "\u2014\u2014",
    en: "\u2014"
  }
};
var DATE_IN_FILENAME = /(\d{4})-(\d{2})-(\d{2})/;
var DATE_IN_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})/;
function resolveManifest(options) {
  return options.manifest ?? BASELINE.manifest;
}
function resolveLang(options) {
  return options.lang ?? "zh";
}
function escapeAttribute(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function contactCardCacheDate(group, manifest) {
  const fromCard = DATE_IN_FILENAME.exec(group.card);
  if (fromCard !== null) return fromCard[1] + fromCard[2] + fromCard[3];
  if (group.validUntil === void 0) return null;
  const fromManifest = DATE_IN_TIMESTAMP.exec(manifest.updatedAt);
  if (fromManifest === null) {
    throw new Error(
      "manifest.updatedAt must start with YYYY-MM-DD when a group has validUntil (group: " + group.id + ")"
    );
  }
  return fromManifest[1] + fromManifest[2] + fromManifest[3];
}
function contactCardUrl(group, manifest, options = {}) {
  const base = (options.cdnBase ?? DEFAULT_CDN_BASE).replace(/\/+$/, "");
  if (!/^https:\/\/[^\s"'<>]+$/i.test(base)) {
    throw new Error('contact CDN base must be an absolute https URL (got "' + base + '")');
  }
  const card = group.card.trim();
  if (card === "") throw new Error('contact group "' + group.id + '" has an empty card file name');
  if (card.includes("/") || card.includes("\\") || /^[a-z]+:/i.test(card)) {
    throw new Error('contact card must be a bare file name under data/img/ (got "' + card + '")');
  }
  const version = options.version ?? manifest.version;
  if (version === "") throw new Error("contact CDN URL needs a manifest version");
  let url = base + "@" + version + "/data/img/" + card;
  const cacheDate = contactCardCacheDate(group, manifest);
  if (cacheDate !== null) url += "?v=" + cacheDate;
  return url;
}
function contactHeading(lang, options) {
  if (options.variant === "markdown-heading") {
    return [
      '<div align="center">',
      "",
      "## " + (options.headingText ?? CONTACT_TEXT.heading[lang]),
      "",
      "</div>"
    ].join("\n");
  }
  return '<h2 align="center"><sub>' + CONTACT_TEXT.sub + "</sub><br>" + CONTACT_TEXT.heading[lang] + "</h2>";
}
function renderContactBlock(options = {}) {
  const manifest = resolveManifest(options);
  const lang = resolveLang(options);
  const groups = sortByOrder(manifest.groups);
  if (groups.length === 0) throw new Error("contact block needs at least one group in the manifest");
  const headerCells = groups.map((group) => '<td align="center"><b>' + escapeAttribute(pickText(group.readmeTitle, lang)) + "</b></td>").join("");
  const cardCells = groups.map((group) => {
    const src = contactCardUrl(group, manifest, options);
    const alt = escapeAttribute(pickText(group.alt, lang));
    return '<td><img src="' + src + '" width="' + CONTACT_CARD_WIDTH + '" alt="' + alt + '" /></td>';
  }).join("");
  return [
    contactHeading(lang, options),
    "",
    '<div align="center">',
    "",
    CONTACT_TEXT.welcome[lang],
    "",
    '<table align="center"><tr>' + headerCells + "</tr><tr>" + cardCells + "</tr></table>",
    "",
    "</div>"
  ].join("\n");
}
var pluginLink = pluginHref;
function renderMoreBlock(options = {}) {
  const manifest = resolveManifest(options);
  const lang = resolveLang(options);
  if (manifest.plugins.length === 0) {
    throw new Error("more block needs at least one plugin in the manifest");
  }
  const plugins = sortByOrder(manifest.plugins).filter((plugin) => plugin.id !== options.selfId);
  if (plugins.length === 0) {
    throw new Error('more block needs at least one plugin besides "' + String(options.selfId) + '"');
  }
  const headingText = options.headingText ?? MORE_TEXT.heading[lang];
  const heading = options.variant === "markdown-heading" ? [
    '<div align="center">',
    "",
    "## " + headingText + " <sub>" + MORE_TEXT.sub + "</sub>",
    "",
    "</div>"
  ].join("\n") : '<h2 align="center"><sub>' + MORE_TEXT.sub + "</sub><br>" + headingText + "</h2>";
  const rows = plugins.map(
    (plugin) => "**[" + plugin.name + "](" + pluginLink(plugin) + ")** " + MORE_TEXT.separator[lang] + " " + pickText(plugin.desc, lang)
  );
  return [
    heading,
    "",
    '<div align="left">',
    "",
    MORE_TEXT.leadIn[lang],
    "",
    rows.join("\n\n"),
    "",
    "</div>"
  ].join("\n");
}
var STAR_HISTORY_DEFAULT_ALT = "Star History Chart";
var STAR_HISTORY_VERSION = /^\d{12}$/;
var GITHUB_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
var THANKS_TEXT = {
  header: {
    zh: "| \u8D21\u732E\u8005 | \u81F4\u656C | \u8D21\u732E |",
    en: "| Contributor | Tribute | Contributions |"
  },
  separator: "| --- | --- | --- |"
};
var THANKS_TIERS = [
  [1e4, "\u{1F48E}"],
  [1e3, "\u{1F451}"],
  [100, "\u{1F3C6}"],
  [10, "\u{1F490}"],
  [1, "\u{1F339}"]
];
function requireRepo(repo, block) {
  if (!GITHUB_REPO.test(repo)) {
    throw new Error(block + ' data needs an "owner/repo" repository (got "' + repo + '")');
  }
  return repo;
}
function rawImageUrl(repo, branch, path, version) {
  const cleanPath = path.replace(/^\/+/, "");
  if (cleanPath === "" || /\s/.test(branch) || /\s/.test(cleanPath)) {
    throw new Error('invalid star-history chart path or branch ("' + branch + '", "' + path + '")');
  }
  return "https://raw.githubusercontent.com/" + repo + "/" + branch + "/" + cleanPath + "?v=" + version;
}
function renderStarHistoryBlock(options = {}) {
  const data = options.starHistory;
  if (data === void 0) {
    throw new Error("star-history block needs starHistory data (repo and minute-level version)");
  }
  const repo = requireRepo(data.repo, "star-history");
  if (!STAR_HISTORY_VERSION.test(data.version)) {
    throw new Error(
      'star-history version must be a minute-level YYYYMMDDHHmm query string (got "' + data.version + '")'
    );
  }
  if (data.width !== void 0 && (!Number.isInteger(data.width) || data.width <= 0)) {
    throw new Error('star-history width must be a positive integer (got "' + String(data.width) + '")');
  }
  const branch = data.branch ?? "main";
  const dark = rawImageUrl(repo, branch, data.darkPath ?? STAR_CHART_DEFAULT_DARK, data.version);
  const light = rawImageUrl(repo, branch, data.lightPath ?? STAR_CHART_DEFAULT_LIGHT, data.version);
  const alt = data.alt ?? STAR_HISTORY_DEFAULT_ALT;
  if (data.markdownImage === true) {
    const image = "![" + alt + "](" + light + ")";
    const linked = data.pageUrl === void 0 ? image : "[" + image + "](" + escapeAttribute(data.pageUrl) + ")";
    const markdownLines2 = ['<div align="center">', "", linked];
    if (data.note !== void 0 && data.note.trim() !== "") {
      markdownLines2.push("", "<sub>" + escapeAttribute(data.note) + "</sub>");
    }
    markdownLines2.push("", "</div>");
    return markdownLines2.join("\n");
  }
  const attributeAlt = escapeAttribute(alt);
  const img = '  <img alt="' + attributeAlt + '"' + (data.width === void 0 ? "" : ' width="' + data.width + '"') + ' src="' + light + '" />';
  const lines = ['<div align="center">', ""];
  if (data.pageUrl !== void 0) lines.push('<a href="' + escapeAttribute(data.pageUrl) + '">');
  if (dark === light) {
    lines.push(img);
  } else {
    lines.push(
      "  <picture>",
      '    <source media="(prefers-color-scheme: dark)" srcset="' + dark + '" />',
      '    <source media="(prefers-color-scheme: light)" srcset="' + light + '" />',
      img,
      "  </picture>"
    );
  }
  if (data.pageUrl !== void 0) lines.push("</a>");
  if (data.note !== void 0 && data.note.trim() !== "") {
    lines.push("", "<sub>" + escapeAttribute(data.note) + "</sub>");
  }
  lines.push("", "</div>");
  return lines.join("\n");
}
function thanksTotal(author) {
  return (author.issues?.length ?? 0) + (author.prs?.length ?? 0) + (author.discussions?.length ?? 0) + (author.comments?.length ?? 0);
}
function rosesFor(total) {
  let rest = Math.max(0, Math.floor(total));
  let out = "";
  for (const [worth, mark] of THANKS_TIERS) {
    while (rest >= worth) {
      out += mark;
      rest -= worth;
    }
  }
  return out;
}
function isSkippedThanksLogin(login, owner) {
  if (login === "" || login === owner || login === "ghost") return true;
  return login === "dependabot" || login.endsWith("[bot]");
}
function thanksLinks(author, repo) {
  const entries = [];
  for (const entry of author.issues ?? []) entries.push({ segment: 0, n: entry.n, path: "issues" });
  for (const entry of author.prs ?? []) entries.push({ segment: 1, n: entry.n, path: "pull" });
  for (const entry of author.discussions ?? []) entries.push({ segment: 2, n: entry.n, path: "discussions" });
  for (const entry of author.comments ?? []) {
    const pull = entry.thread === "pr";
    entries.push({ segment: pull ? 1 : 0, n: entry.n, path: pull ? "pull" : "issues" });
  }
  entries.sort((a, b) => a.segment !== b.segment ? a.segment - b.segment : a.n - b.n);
  return entries.map((entry) => "[#" + entry.n + "](https://github.com/" + repo + "/" + entry.path + "/" + entry.n + ")");
}
function orderedThanksLogins(authors, owner) {
  return Object.keys(authors).filter((login) => !isSkippedThanksLogin(login, owner)).sort((left, right) => {
    const totalDelta = thanksTotal(authors[right]) - thanksTotal(authors[left]);
    if (totalDelta !== 0) return totalDelta;
    const lastLeft = authors[left].lastActive ?? "";
    const lastRight = authors[right].lastActive ?? "";
    if (lastLeft !== lastRight) return lastLeft < lastRight ? 1 : -1;
    return left < right ? -1 : left > right ? 1 : 0;
  });
}
function thanksRow(login, author, repo) {
  const links = thanksLinks(author, repo).join(" ");
  return "| [@" + login + "](https://github.com/" + login + ") | " + rosesFor(thanksTotal(author)) + " | " + links + " |";
}
function renderThanksBlock(options = {}) {
  const data = options.thanks;
  if (data === void 0) throw new Error("thanks block needs thanks data (repo and author records)");
  const repo = requireRepo(data.repo, "thanks");
  const owner = repo.split("/")[0];
  const lang = resolveLang(options);
  const lines = [THANKS_TEXT.header[lang], THANKS_TEXT.separator];
  for (const login of orderedThanksLogins(data.authors, owner)) {
    lines.push(thanksRow(login, data.authors[login], repo));
  }
  return lines.join("\n");
}

// src/node/readme-sync.ts
var THANKS_ZH_MARKERS = {
  start: "<!-- THANKS-TABLE-ZH-START -->",
  end: "<!-- THANKS-TABLE-ZH-END -->"
};
var THANKS_EN_MARKERS = {
  start: "<!-- THANKS-TABLE-EN-START -->",
  end: "<!-- THANKS-TABLE-EN-END -->"
};
var BLOCK_MARKERS = {
  contact: { start: "<!-- CONTACT-START -->", end: "<!-- CONTACT-END -->" },
  more: { start: "<!-- MORE-START -->", end: "<!-- MORE-END -->" },
  starHistory: { start: "<!-- STAR-HISTORY-START -->", end: "<!-- STAR-HISTORY-END -->" },
  thanks: {
    ...THANKS_ZH_MARKERS,
    zh: THANKS_ZH_MARKERS,
    en: THANKS_EN_MARKERS
  }
};
function detectContact(raw) {
  const parsed = parseContactBlock(raw);
  const heading = parsed.heading?.text ?? "";
  const lang = /[A-Za-z]/.test(heading) ? "en" : "zh";
  const variant = parsed.variant === "markdown-heading" ? "markdown-heading" : "html-heading";
  if (variant === "markdown-heading" && parsed.heading !== null) {
    const sub = parsed.heading.sub;
    return {
      lang,
      variant,
      headingText: sub === null ? parsed.heading.text : parsed.heading.text + " <sub>" + sub + "</sub>"
    };
  }
  return { lang, variant };
}
function locateLegacyContact(markdown) {
  const lines = markdownLines(markdown);
  let fence = false;
  let headingIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].text;
    if (isFenceLine(text)) {
      fence = !fence;
      continue;
    }
    if (!fence && LEGACY_CONTACT_HEADING_LINE.test(text)) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex === -1) return null;
  let startIndex = headingIndex;
  for (let back = headingIndex - 1; back >= 0; back -= 1) {
    if (lines[back].text.trim() === "") continue;
    if (WRAPPING_DIV_LINE.test(lines[back].text)) startIndex = back;
    break;
  }
  const wrappedHeading = startIndex !== headingIndex;
  let divIndex = -1;
  if (WRAPPING_DIV_LINE.test(lines[startIndex].text)) {
    divIndex = startIndex;
  } else {
    for (let index = headingIndex + 1; index < lines.length; index += 1) {
      const text = lines[index].text;
      if (text.trim() === "") continue;
      if (WRAPPING_DIV_LINE.test(text)) divIndex = index;
      break;
    }
  }
  if (divIndex === -1) return null;
  const maxBlocks = wrappedHeading ? 2 : 1;
  let depth = 0;
  let blocks = 0;
  let endIndex = -1;
  for (let index = divIndex; index < lines.length; index += 1) {
    const text = lines[index].text;
    const trimmed = text.trim();
    if (depth === 0 && endIndex !== -1) {
      if (trimmed === "") continue;
      if (!WRAPPING_DIV_LINE.test(text)) break;
      if (blocks >= maxBlocks) break;
    }
    depth += (text.match(/<div\b/gi)?.length ?? 0) - (text.match(/<\/div\s*>/gi)?.length ?? 0);
    if (depth < 0) return null;
    if (depth === 0 && /<\/div\s*>/i.test(text)) {
      endIndex = index;
      blocks += 1;
    }
  }
  if (endIndex === -1) return null;
  return { start: lines[startIndex].start, end: lines[endIndex].end };
}
function detectMore(raw) {
  const parsed = parseMoreBlock(raw);
  const heading = parsed.heading?.text ?? "";
  if (heading === "") return {};
  const lang = /[A-Za-z]/.test(heading) ? "en" : "zh";
  const variant = parsed.variant === "markdown-heading" ? "markdown-heading" : "html-heading";
  return { lang, variant, headingText: heading };
}
var MORE_HEADING_LINE = /^(?:<h2\b[^\n]*(?:\bMORE\b|作者的其他作品|More from the author|More by the author)[^\n]*<\/h2>|##\s+[^\n]*(?:\bMORE\b|作者的其他作品|More from the author|More by the author)[^\n]*)\s*$/i;
var THANKS_HEADING_LINE = /^(?:<h2\b[^\n]*(?:\bTHANKS\b|致谢|\bThanks\b|\bContributors\b)[^\n]*<\/h2>|##\s+[^\n]*(?:\bTHANKS\b|致谢|\bThanks\b|\bContributors\b)[^\n]*)\s*$/i;
var CONTACT_HEADING_LINE = /^(?:<h2\b[^\n]*(?:CONNECT|反馈与联系|Feedback and Contact)[^\n]*<\/h2>|##\s+[^\n]*(?:CONNECT|反馈与联系|Feedback and Contact)[^\n]*)\s*$/i;
var LEGACY_CONTACT_HEADING_LINE = /^(?:<h2\b[^\n]*?(?:CONNECT|反馈与联系|Feedback and Contact)[^\n]*?|<sub>\s*CONNECT\s*<\/sub>[^\n]*?|<h2\b[^\n]*?>[^\n]*?(?:反馈与联系|Feedback and Contact)[^\n]*?>|##\s+[^\n]*(?:反馈与联系|Feedback and Contact)[^\n]*)\s*$/i;
var STAR_MARKER_LINE = /star-history[-a-z]*\.svg|star-history\.html|星标增长曲线|Star history chart/i;
var WRAPPING_DIV_LINE = /^\s*<div\b/i;
var MANAGED_MARKER_LINE = /^\s*<!--\s*(?:CONTACT|MORE|STAR-HISTORY|THANKS-TABLE-[A-Z]+)-(?:START|END)\s*-->\s*$/;
function markdownLines(markdown) {
  const lines = [];
  let offset = 0;
  for (const raw of markdown.split("\n")) {
    const text = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    lines.push({ text, start: offset, end: offset + text.length });
    offset += raw.length + 1;
  }
  return lines;
}
function isFenceLine(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("```") || trimmed.startsWith("~~~");
}
function nextManagedBlockLine(lines, from) {
  let fence = false;
  for (let index = from; index < lines.length; index += 1) {
    const text = lines[index].text;
    if (isFenceLine(text)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    if (MANAGED_MARKER_LINE.test(text)) return index;
    if (MORE_HEADING_LINE.test(text) || THANKS_HEADING_LINE.test(text) || CONTACT_HEADING_LINE.test(text)) {
      for (let back = index - 1; back >= 0; back -= 1) {
        if (lines[back].text.trim() === "") continue;
        if (WRAPPING_DIV_LINE.test(lines[back].text)) return back;
        break;
      }
      return index;
    }
    if (STAR_MARKER_LINE.test(text)) {
      for (let back = index - 1; back >= Math.max(0, index - 8); back -= 1) {
        if (WRAPPING_DIV_LINE.test(lines[back].text)) return back;
      }
      return index;
    }
  }
  return lines.length;
}
function locateLegacyMore(markdown) {
  const lines = markdownLines(markdown);
  let fence = false;
  let headingIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].text;
    if (isFenceLine(text)) {
      fence = !fence;
      continue;
    }
    if (!fence && MORE_HEADING_LINE.test(text)) {
      headingIndex = index;
      break;
    }
  }
  if (headingIndex === -1) {
    const insertion = markdown.trimEnd().length;
    return { start: insertion, end: markdown.length };
  }
  let startIndex = headingIndex;
  for (let back = headingIndex - 1; back >= 0; back -= 1) {
    if (lines[back].text.trim() === "") continue;
    if (WRAPPING_DIV_LINE.test(lines[back].text)) startIndex = back;
    break;
  }
  const boundary = nextManagedBlockLine(lines, headingIndex + 1);
  let footerIndex = -1;
  for (let index = headingIndex + 1; index < boundary; index += 1) {
    if (!/^-{3,}$/.test(lines[index].text.trim())) continue;
    for (let after = index + 1; after < boundary; after += 1) {
      if (lines[after].text.trim() !== "") {
        footerIndex = index;
        break;
      }
    }
    if (footerIndex !== -1) break;
  }
  let endIndex = footerIndex === -1 ? boundary - 1 : footerIndex - 1;
  while (endIndex >= startIndex && lines[endIndex].text.trim() === "") {
    endIndex -= 1;
  }
  if (footerIndex === -1) {
    while (endIndex >= startIndex && /^-{3,}$/.test(lines[endIndex].text.trim())) {
      endIndex -= 1;
    }
  }
  if (endIndex < startIndex) return null;
  return { start: lines[startIndex].start, end: lines[endIndex].end };
}
function locateLegacyStarHistory(markdown) {
  const lines = markdownLines(markdown);
  let fence = false;
  let markerIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].text;
    if (isFenceLine(text)) {
      fence = !fence;
      continue;
    }
    if (!fence && STAR_MARKER_LINE.test(text)) {
      markerIndex = index;
      break;
    }
  }
  if (markerIndex === -1) {
    const insertion = markdown.trimEnd().length;
    return { start: insertion, end: markdown.length };
  }
  let startIndex = markerIndex;
  for (let back = markerIndex - 1; back >= Math.max(0, markerIndex - 8); back -= 1) {
    if (WRAPPING_DIV_LINE.test(lines[back].text)) {
      startIndex = back;
      break;
    }
  }
  const closingDiv = /^\s*<\/div\b/i;
  for (let index = markerIndex + 1; index < lines.length; index += 1) {
    if (closingDiv.test(lines[index].text)) {
      return { start: lines[startIndex].start, end: lines[index].end };
    }
  }
  return { start: lines[startIndex].start, end: markdown.trimEnd().length };
}
var BLOCK_DEFINITIONS = [
  {
    name: "contact",
    label: "contact",
    markers: [{ start: BLOCK_MARKERS.contact.start, end: BLOCK_MARKERS.contact.end }],
    render: (context) => renderContactBlock(context),
    locateLegacy: locateLegacyContact,
    detect: detectContact
  },
  {
    name: "star-history",
    label: "star-history",
    markers: [{ start: BLOCK_MARKERS.starHistory.start, end: BLOCK_MARKERS.starHistory.end }],
    render: (context) => renderStarHistoryBlock(context),
    locateLegacy: locateLegacyStarHistory,
    hasData: (options) => options.starHistory !== void 0
  },
  // One marker pair per language; which pair exists tells the language of the
  // README. Only the table between the markers is managed: the surrounding
  // heading / intro / footer prose differ per repository and stay untouched.
  {
    name: "thanks",
    label: "thanks",
    markers: [
      { lang: "zh", start: THANKS_ZH_MARKERS.start, end: THANKS_ZH_MARKERS.end },
      { lang: "en", start: THANKS_EN_MARKERS.start, end: THANKS_EN_MARKERS.end }
    ],
    render: (context) => renderThanksBlock(context),
    hasData: (options) => options.thanks !== void 0
  },
  {
    name: "more",
    label: "more",
    markers: [{ start: BLOCK_MARKERS.more.start, end: BLOCK_MARKERS.more.end }],
    render: (context) => renderMoreBlock(context),
    locateLegacy: locateLegacyMore,
    detect: detectMore
  }
];
function blockDefinition(name) {
  return BLOCK_DEFINITIONS.find((definition) => definition.name === name);
}
function writeFileAtomic(filePath, content, hooks = {}) {
  const directory = dirname(filePath);
  const tempPath = join(
    directory,
    "." + basename(filePath) + "." + process.pid + "." + randomBytes(6).toString("hex") + ".tmp"
  );
  let mode;
  try {
    mode = statSync(filePath).mode & 511;
  } catch {
    mode = void 0;
  }
  try {
    writeFileSync(tempPath, content, "utf8");
    if (mode !== void 0) chmodSync(tempPath, mode);
    hooks.beforeRename?.(tempPath);
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {
    }
    throw error;
  }
}
function detectLineEnding(markdown) {
  return markdown.includes("\r\n") ? "\r\n" : "\n";
}
function markerIndexes(markdown, token) {
  const indexes = [];
  let from = 0;
  for (; ; ) {
    const index = markdown.indexOf(token, from);
    if (index === -1) return indexes;
    indexes.push(index);
    from = index + token.length;
  }
}
function renderSegment(definition, markerSet, context) {
  if (definition.render === void 0) throw new Error("block has no renderer: " + definition.name);
  return definition.render({
    ...context.options,
    lang: markerSet.lang ?? context.lang,
    variant: context.variants[definition.name] ?? context.options.variant,
    headingText: context.headings[definition.name] ?? context.options.headingText
  });
}
function applyMarkerSet(markdown, definition, markerSet, context, command) {
  const errors = [];
  const { start, end } = markerSet;
  const starts = markerIndexes(markdown, start);
  const ends = markerIndexes(markdown, end);
  const eol = detectLineEnding(markdown);
  if (starts.length === 0 && ends.length === 0) {
    if (definition.render === void 0) {
      return { markdown, changed: false, status: "skipped", errors };
    }
    if (markerSet.lang !== void 0 && markerSet.lang !== context.lang) {
      return { markdown, changed: false, status: "skipped", errors };
    }
    if (command === "sync") {
      errors.push(definition.label + " markers are missing; run readme:init first");
      return { markdown, changed: false, status: "skipped", errors };
    }
    const legacy = definition.locateLegacy?.(markdown) ?? null;
    if (legacy === null) {
      errors.push(
        "cannot locate the legacy " + definition.label + " block; add " + start + " / " + end + " markers manually"
      );
      return { markdown, changed: false, status: "skipped", errors };
    }
    const content = renderSegment(definition, markerSet, context).split(/\r?\n/).join(eol);
    const before = markdown.slice(0, legacy.start);
    let lead = "";
    if (legacy.start === legacy.end && before.length > 0) {
      if (!/(?:\r?\n){2}$/.test(before)) lead = /\n$/.test(before) ? eol : eol + eol;
    }
    const replacement = lead + start + eol + content + eol + end;
    return {
      markdown: before + replacement + markdown.slice(legacy.end),
      changed: true,
      status: "inserted",
      errors
    };
  }
  if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
    if (definition.render === void 0) {
      return { markdown, changed: false, status: "skipped", errors };
    }
    const startIndex = starts[0];
    const endIndex = ends[0];
    const inner = markdown.slice(startIndex + start.length, endIndex);
    const content = renderSegment(definition, markerSet, context).split(/\r?\n/).join(eol);
    const expectedInner = eol + content + eol;
    if (inner === expectedInner) {
      return { markdown, changed: false, status: "unchanged", errors };
    }
    const next = markdown.slice(0, startIndex + start.length) + expectedInner + markdown.slice(endIndex);
    return { markdown: next, changed: true, status: "updated", errors };
  }
  if (starts.length > 1 || ends.length > 1) {
    errors.push(
      "duplicate " + definition.label + " markers (" + start + " x" + starts.length + ", " + end + " x" + ends.length + "); refusing to guess"
    );
  } else if (starts.length !== ends.length) {
    errors.push(
      "unpaired " + definition.label + " markers (" + start + " x" + starts.length + ", " + end + " x" + ends.length + ")"
    );
  } else {
    errors.push("end marker appears before start marker for the " + definition.label + " block");
  }
  return { markdown, changed: false, status: "skipped", errors };
}
function detectContext(markdown, options) {
  let lang = options.lang;
  const variants = {};
  const headings = {};
  for (const definition of BLOCK_DEFINITIONS) {
    if (definition.detect === void 0) continue;
    let raw = null;
    for (const markerSet of definition.markers) {
      const starts = markerIndexes(markdown, markerSet.start);
      const ends = markerIndexes(markdown, markerSet.end);
      if (starts.length === 1 && ends.length === 1 && starts[0] < ends[0]) {
        raw = markdown.slice(starts[0] + markerSet.start.length, ends[0]);
        break;
      }
    }
    if (raw === null) {
      const legacy = definition.locateLegacy?.(markdown) ?? null;
      if (legacy !== null) raw = markdown.slice(legacy.start, legacy.end);
    }
    if (raw === null) continue;
    const detected = definition.detect(raw);
    lang ??= detected.lang;
    if (detected.variant !== void 0) variants[definition.name] ??= detected.variant;
    if (detected.headingText !== void 0) headings[definition.name] ??= detected.headingText;
  }
  return {
    options: {
      manifest: options.manifest,
      version: options.version,
      cdnBase: options.cdnBase,
      selfId: options.selfId,
      headingText: options.headingText,
      starHistory: options.starHistory,
      thanks: options.thanks
    },
    lang: lang ?? "zh",
    variants,
    headings
  };
}
function updateReadme(options) {
  const readmePath = resolve(options.root, options.readme ?? "README.md");
  const command = options.command ?? "sync";
  const result = {
    readmePath,
    ok: false,
    changed: false,
    written: false,
    blocks: [],
    errors: []
  };
  let markdown;
  try {
    markdown = readFileSync(readmePath, "utf8");
  } catch (error) {
    const code = error.code;
    result.errors.push(
      code === "ENOENT" ? "README not found: " + readmePath : "cannot read " + readmePath + ": " + error.message
    );
    return result;
  }
  const suspicious = findSuspiciousLines(markdown);
  if (suspicious.length > 0) {
    for (const line of suspicious) {
      result.errors.push(
        readmePath + ":" + line.line + ": suspicious merge-conflict residue (" + line.reason + '): "' + line.text + '"; refusing to modify the README, fix it manually first'
      );
    }
    return result;
  }
  const context = detectContext(markdown, options);
  let next = markdown;
  for (const definition of BLOCK_DEFINITIONS) {
    if (definition.hasData !== void 0 && !definition.hasData(context.options)) {
      result.blocks.push({ name: definition.name, status: "skipped" });
      continue;
    }
    for (const markerSet of definition.markers) {
      const applied = applyMarkerSet(next, definition, markerSet, context, command);
      next = applied.markdown;
      result.blocks.push({ name: definition.name, status: applied.status });
      for (const error of applied.errors) result.errors.push(readmePath + ": " + error);
    }
  }
  if (result.errors.length > 0) return result;
  result.changed = next !== markdown;
  if (options.check === true) {
    if (result.changed) {
      result.errors.push(
        readmePath + ": managed blocks are out of date; run readme:" + command + " to fix"
      );
      return result;
    }
    result.ok = true;
    return result;
  }
  if (result.changed) {
    writeFileAtomic(readmePath, next);
    result.written = true;
  }
  result.ok = true;
  return result;
}
function updateReadmes(options) {
  const files = options.roots.map(
    (root) => updateReadme({
      root,
      readme: options.readme,
      command: options.command ?? "sync",
      check: options.check,
      manifest: options.manifest,
      version: options.version,
      cdnBase: options.cdnBase,
      lang: options.lang,
      variant: options.variant,
      selfId: options.selfId,
      headingText: options.headingText,
      starHistory: options.starHistory,
      thanks: options.thanks
    })
  );
  return { ok: files.every((file) => file.ok), files };
}
function updateReadmeTargets(targets, options = {}) {
  const files = targets.map(
    (target) => updateReadme({
      ...target,
      command: options.command ?? "sync",
      check: options.check
    })
  );
  return { ok: files.every((file) => file.ok), files };
}

// src/node/targets.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { basename as basename2, join as join2, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
var PACKAGE_NAME = "dsh-featherhunter-plugin-base";
var OWNER = "FeatherHunter";
var THANKS_DATA_FILE = "docs/thanks-data.json";
var STAR_DATA_FILE = "docs/star-history.json";
var README_TARGETS = [
  {
    repo: "dsh-mattpocock-skills-deck",
    readme: "README.md",
    lang: "zh",
    selfId: "deck",
    star: {
      repo: OWNER + "/dsh-mattpocock-skills-deck",
      pageUrl: "https://featherhunter.github.io/dsh-mattpocock-skills-deck/star-history.html",
      alt: { zh: "Star History Chart", en: "Star History Chart" }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-mattpocock-skills-deck",
    readme: "package/README.md",
    lang: "zh",
    selfId: "deck",
    star: {
      repo: OWNER + "/dsh-mattpocock-skills-deck",
      pageUrl: "https://featherhunter.github.io/dsh-mattpocock-skills-deck/star-history.html",
      alt: { zh: "Star History Chart", en: "Star History Chart" }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-mattpocock-skills-deck",
    readme: "docs/README.en.md",
    lang: "en",
    selfId: "deck",
    star: {
      repo: OWNER + "/dsh-mattpocock-skills-deck",
      pageUrl: "https://featherhunter.github.io/dsh-mattpocock-skills-deck/star-history.html",
      alt: { zh: "Star History Chart", en: "Star History Chart" }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-opencode-palette",
    readme: "README.md",
    lang: "zh",
    selfId: "palette",
    star: {
      repo: OWNER + "/dsh-opencode-palette",
      darkPath: "docs/star-history.svg",
      lightPath: "docs/star-history.svg",
      alt: {
        zh: "\u661F\u6807\u589E\u957F\u66F2\u7EBF\uFF1A\u5DE6\u8F74\u7D2F\u8BA1\u661F\u6807\u3001\u53F3\u8F74\u6BCF\u65E5\u65B0\u589E",
        en: "Star history chart: total stars on the left axis, daily new stars on the right axis"
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-opencode-palette",
    readme: "package/README.md",
    lang: "en",
    selfId: "palette",
    star: {
      repo: OWNER + "/dsh-opencode-palette",
      darkPath: "docs/star-history.svg",
      lightPath: "docs/star-history.svg",
      alt: {
        zh: "\u661F\u6807\u589E\u957F\u66F2\u7EBF\uFF1A\u5DE6\u8F74\u7D2F\u8BA1\u661F\u6807\u3001\u53F3\u8F74\u6BCF\u65E5\u65B0\u589E",
        en: "Star history chart: total stars on the left axis, daily new stars on the right axis"
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-opencode-palette",
    readme: "docs/README.en.md",
    lang: "en",
    selfId: "palette",
    star: {
      repo: OWNER + "/dsh-opencode-palette",
      darkPath: "docs/star-history.svg",
      lightPath: "docs/star-history.svg",
      alt: {
        zh: "\u661F\u6807\u589E\u957F\u66F2\u7EBF\uFF1A\u5DE6\u8F74\u7D2F\u8BA1\u661F\u6807\u3001\u53F3\u8F74\u6BCF\u65E5\u65B0\u589E",
        en: "Star history chart: total stars on the left axis, daily new stars on the right axis"
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-im-companion",
    readme: "README.md",
    lang: "zh",
    selfId: "im",
    star: {
      repo: OWNER + "/dsh-im-companion",
      branch: "master",
      width: 720,
      alt: { zh: "Star History Chart", en: "Star History Chart" },
      note: {
        zh: "\u5DE6\u8F74\u8BFB\u603B\u661F\u6807\uFF08Total Stars\uFF09\uFF0C\u53F3\u8F74\u8BFB\u6BCF\u65E5\u65B0\u589E\uFF08Daily New\uFF09\uFF0C\u6BCF\u5929\u81EA\u52A8\u66F4\u65B0\u3002",
        en: "Left axis reads Total Stars, right axis reads Daily New. Refreshed every day."
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-im-companion",
    readme: "docs/README.en.md",
    lang: "en",
    selfId: "im",
    star: {
      repo: OWNER + "/dsh-im-companion",
      branch: "master",
      width: 720,
      alt: { zh: "Star History Chart", en: "Star History Chart" },
      note: {
        zh: "\u5DE6\u8F74\u8BFB\u603B\u661F\u6807\uFF08Total Stars\uFF09\uFF0C\u53F3\u8F74\u8BFB\u6BCF\u65E5\u65B0\u589E\uFF08Daily New\uFF09\uFF0C\u6BCF\u5929\u81EA\u52A8\u66F4\u65B0\u3002",
        en: "Left axis reads Total Stars, right axis reads Daily New. Refreshed every day."
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-prompt",
    readme: "README.md",
    lang: "zh",
    selfId: "prompt",
    star: {
      repo: OWNER + "/dsh-prompt",
      darkPath: "docs/star-history.svg",
      lightPath: "docs/star-history.svg",
      alt: {
        zh: "\u661F\u6807\u589E\u957F\u66F2\u7EBF\uFF08\u53CC\u8F74\uFF09\uFF1A\u5DE6\u8F74\u7D2F\u8BA1\u661F\u6807\uFF0C\u53F3\u8F74\u6BCF\u65E5\u65B0\u589E",
        en: "Star history chart (dual axis): total stars on the left, daily new stars on the right"
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "dsh-prompt",
    readme: "docs/README.en.md",
    lang: "en",
    selfId: "prompt",
    star: {
      repo: OWNER + "/dsh-prompt",
      darkPath: "docs/star-history.svg",
      lightPath: "docs/star-history.svg",
      alt: {
        zh: "\u661F\u6807\u589E\u957F\u66F2\u7EBF\uFF08\u53CC\u8F74\uFF09\uFF1A\u5DE6\u8F74\u7D2F\u8BA1\u661F\u6807\uFF0C\u53F3\u8F74\u6BCF\u65E5\u65B0\u589E",
        en: "Star history chart (dual axis): total stars on the left, daily new stars on the right"
      }
    },
    thanksDataFile: THANKS_DATA_FILE
  },
  {
    repo: "ilife",
    readme: "README.md",
    lang: "zh",
    selfId: "ilife",
    star: {
      repo: OWNER + "/ilife",
      branch: "master",
      alt: { zh: "Star History Chart", en: "Star History Chart" }
    },
    thanksDataFile: THANKS_DATA_FILE
  }
];
function packagedManifestPath() {
  return fileURLToPath(new URL("../../data/manifest.json", import.meta.url));
}
function readPackagedManifest() {
  const path = packagedManifestPath();
  let raw;
  try {
    raw = readFileSync2(path, "utf8");
  } catch (error) {
    throw new Error("cannot read the packaged manifest at " + path + ": " + error.message);
  }
  return parseManifest(JSON.parse(raw));
}
function readPackageVersion() {
  try {
    const url = new URL("../../package.json", import.meta.url);
    const parsed = JSON.parse(readFileSync2(url, "utf8"));
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
function starVersionFromTimestamp(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (match === null) {
    throw new Error('cannot derive a star-history version from "' + iso + '"');
  }
  return match[1] + match[2] + match[3] + match[4] + match[5];
}
function detectStarVersion(markdown) {
  const matches = [...markdown.matchAll(/[?&]v=(\d{8}|\d{12})(?![0-9])/g)].map((match) => match[1]);
  const minute = matches.find((value) => value.length === 12);
  if (minute !== void 0) return minute;
  const day = matches.find((value) => value.length === 8);
  return day === void 0 ? void 0 : day + "0000";
}
function starVersionFromDataFile(repoRoot) {
  const path = join2(repoRoot, STAR_DATA_FILE);
  if (!existsSync2(path)) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync2(path, "utf8"));
  } catch (error) {
    throw new Error("cannot parse " + path + ": " + error.message);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(path + ": star-history data must be a JSON array");
  }
  if (parsed.length === 0) return void 0;
  const last = parsed[parsed.length - 1];
  const date = typeof last === "object" && last !== null ? last.date : void 0;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(path + ': the last star-history entry needs a "date" (YYYY-MM-DD)');
  }
  return date.replace(/-/g, "") + "0000";
}
function detectStarMarkdownImage(markdown) {
  return /!\[[^\]]*\]\([^)\s]*star-history[-a-z]*\.svg[^)]*\)/i.test(markdown);
}
function starChartPaths(target) {
  return {
    dark: target.star.darkPath ?? STAR_CHART_DEFAULT_DARK,
    light: target.star.lightPath ?? STAR_CHART_DEFAULT_LIGHT
  };
}
function missingStarChartAssets(repoRoot, target) {
  const paths = starChartPaths(target);
  const missing = [];
  for (const relative of [paths.dark, paths.light]) {
    if (!existsSync2(join2(repoRoot, relative)) && !missing.includes(relative)) missing.push(relative);
  }
  return missing;
}
function buildStarHistoryData(target, markdown, manifest, repoRoot) {
  const fromData = repoRoot === void 0 ? void 0 : starVersionFromDataFile(repoRoot);
  const version = fromData ?? (markdown === void 0 ? void 0 : detectStarVersion(markdown)) ?? starVersionFromTimestamp(manifest.updatedAt);
  const data = {
    repo: target.star.repo,
    version,
    alt: pickText(target.star.alt, target.lang)
  };
  if (markdown !== void 0 && detectStarMarkdownImage(markdown)) data.markdownImage = true;
  if (target.star.branch !== void 0) data.branch = target.star.branch;
  if (target.star.darkPath !== void 0) data.darkPath = target.star.darkPath;
  if (target.star.lightPath !== void 0) data.lightPath = target.star.lightPath;
  if (target.star.pageUrl !== void 0) data.pageUrl = target.star.pageUrl;
  if (target.star.width !== void 0) data.width = target.star.width;
  if (target.star.note !== void 0) data.note = pickText(target.star.note, target.lang);
  return data;
}
function loadThanksData(repoRoot, target, repoName) {
  const relative = target.thanksDataFile ?? THANKS_DATA_FILE;
  const path = join2(repoRoot, relative);
  if (!existsSync2(path)) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync2(path, "utf8"));
  } catch (error) {
    throw new Error("cannot parse " + path + ": " + error.message);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(path + ": thanks data must be a JSON object");
  }
  const authors = parsed.authors;
  if (typeof authors !== "object" || authors === null || Array.isArray(authors)) {
    throw new Error(path + ': thanks data needs an "authors" object');
  }
  return { repo: repoName ?? OWNER + "/" + target.repo, authors };
}
function resolveTarget(root, target, manifest) {
  const readmePath = join2(root, target.readme);
  let markdown;
  try {
    markdown = readFileSync2(readmePath, "utf8");
  } catch {
    markdown = void 0;
  }
  const resolved = {
    repo: target.repo,
    root,
    readme: target.readme,
    lang: target.lang,
    selfId: target.selfId,
    star: target.star,
    manifest
  };
  if (missingStarChartAssets(root, target).length === 0) {
    resolved.starHistory = buildStarHistoryData(target, markdown, manifest, root);
  }
  const thanks = loadThanksData(root, target);
  if (thanks !== void 0) resolved.thanks = thanks;
  return resolved;
}
function resolveReadmeTargets(reposDir, options = {}) {
  const manifest = options.manifest ?? readPackagedManifest();
  const targets = options.targets ?? README_TARGETS;
  return targets.map((target) => resolveTarget(join2(reposDir, target.repo), target, manifest));
}
function readmeTargetRepos() {
  const repos = [];
  for (const target of README_TARGETS) {
    if (!repos.includes(target.repo)) repos.push(target.repo);
  }
  return repos;
}
function resolveRepoReadmeTargets(repoRoot, options = {}) {
  const repo = basename2(resolve2(repoRoot));
  const selected = README_TARGETS.filter((target) => target.repo === repo);
  if (selected.length === 0) {
    throw new Error(
      '"' + repoRoot + '" is not a managed repository directory; expected one of: ' + readmeTargetRepos().join(", ")
    );
  }
  const manifest = options.manifest ?? readPackagedManifest();
  return selected.map((target) => resolveTarget(repoRoot, target, manifest));
}
function expandReadmeTargets(reposDirs, options = {}) {
  const seen = /* @__PURE__ */ new Set();
  const expanded = [];
  for (const dir of reposDirs) {
    for (const target of resolveReadmeTargets(dir, options)) {
      const key = target.root + "|" + target.readme;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded.push(target);
    }
  }
  return expanded;
}

// src/node/doctor.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, readdirSync, statSync as statSync2 } from "node:fs";
import { basename as basename3, join as join3 } from "node:path";
var DOCTOR_TIMEOUT_MS = 1500;
var MAX_COPY_AGE_DAYS = 90;
var SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
var REMOTE_MANIFEST_URLS = [
  "https://unpkg.com/" + PACKAGE_NAME + "@latest/data/manifest.json",
  "https://cdn.jsdelivr.net/npm/" + PACKAGE_NAME + "@latest/data/manifest.json"
];
var SKIP_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "docs",
  "data",
  "assets",
  "test",
  "tests"
]);
var SOURCE_EXTENSIONS = /* @__PURE__ */ new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".html"]);
var INLINE_BANNER = /\/\*! dsh-featherhunter-plugin-base v([0-9A-Za-z.-]+) \*\//g;
var README_IMAGE_VERSION = /dsh-featherhunter-plugin-base@([^/"'\s)]+)\/data\/img\//g;
var CRON_MOUNT = /readme:sync|dsh-featherhunter-plugin-base@/;
function tryRead(path) {
  try {
    return readFileSync3(path, "utf8");
  } catch {
    return void 0;
  }
}
function tryReadJson(path) {
  const raw = tryRead(path);
  if (raw === void 0) return void 0;
  try {
    return JSON.parse(raw);
  } catch {
    return void 0;
  }
}
function listSourceFiles(directory, depth = 0) {
  if (depth > 4 || !existsSync3(directory)) return [];
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.startsWith(".") && entry !== ".github") continue;
    const path = join3(directory, entry);
    let info;
    try {
      info = statSync2(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry)) continue;
      files.push(...listSourceFiles(path, depth + 1));
    } else if (info.isFile() && info.size <= 512 * 1024 && SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) {
      files.push(path);
    }
  }
  return files;
}
function inlinedBundleVersions(repoRoot) {
  const versions = /* @__PURE__ */ new Set();
  for (const file of listSourceFiles(repoRoot)) {
    const raw = tryRead(file);
    if (raw === void 0) continue;
    for (const match of raw.matchAll(INLINE_BANNER)) versions.add(match[1]);
  }
  return [...versions];
}
function workflowFiles(repoRoot) {
  const directory = join3(repoRoot, ".github", "workflows");
  if (!existsSync3(directory)) return [];
  try {
    return readdirSync(directory).filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml")).map((entry) => join3(directory, entry));
  } catch {
    return [];
  }
}
async function fetchText(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
function ageInDays(iso, now) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return void 0;
  return Math.floor((now.getTime() - time) / (24 * 60 * 60 * 1e3));
}
function checkReadmeBlocks(targets) {
  const errors = [];
  for (const target of targets) {
    const result = updateReadme({ ...target, command: "sync", check: true });
    if (!result.ok) errors.push(...result.errors);
  }
  if (errors.length > 0) {
    return { name: "readme-blocks", ok: false, detail: errors[0] };
  }
  return { name: "readme-blocks", ok: true, detail: targets.length + " README(s) in sync" };
}
function checkReadmeImages(targets, version) {
  let count = 0;
  for (const target of targets) {
    const raw = tryRead(join3(target.root, target.readme));
    if (raw === void 0) continue;
    for (const match of raw.matchAll(README_IMAGE_VERSION)) {
      count += 1;
      const found = match[1];
      if (found !== version) {
        return {
          name: "readme-images",
          ok: false,
          detail: target.readme + " references @" + found + " (expected @" + version + ")"
        };
      }
    }
  }
  return {
    name: "readme-images",
    ok: true,
    detail: count === 0 ? "no precise-version images yet" : count + " image URL(s) at @" + version
  };
}
function checkDependencyVersion(repoRoot, version) {
  const raw = tryReadJson(join3(repoRoot, "package.json"));
  if (raw === void 0 || typeof raw !== "object" || raw === null) {
    return { name: "dependency-version", ok: false, detail: "package.json not readable" };
  }
  const doc = raw;
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const declared = doc[field]?.[PACKAGE_NAME];
    if (declared === void 0) continue;
    if (declared !== version) {
      return { name: "dependency-version", ok: false, detail: "declares " + declared + " (expected " + version + ")" };
    }
    return { name: "dependency-version", ok: true, detail: "pinned at " + version };
  }
  return { name: "dependency-version", ok: false, detail: "not declared as a dependency" };
}
function checkInlineBundleVersion(repoRoot, version) {
  const versions = inlinedBundleVersions(repoRoot);
  if (versions.length === 0) {
    return { name: "inline-bundle-version", ok: true, detail: "not inlined" };
  }
  const stale = versions.filter((candidate) => candidate !== version);
  if (stale.length > 0) {
    return {
      name: "inline-bundle-version",
      ok: false,
      detail: "inlined v" + stale.join(", v") + " (expected v" + version + "); re-inline the client bundle"
    };
  }
  return { name: "inline-bundle-version", ok: true, detail: "inlined v" + version };
}
function checkStarAssets(repoRoot, targets) {
  const missing = [];
  for (const target of targets) {
    for (const relative of missingStarChartAssets(repoRoot, target)) {
      if (!missing.includes(relative)) missing.push(relative);
    }
  }
  if (missing.length > 0) {
    return {
      name: "star-assets",
      ok: false,
      detail: "missing " + missing.join(", ") + "; generate the chart in the repository before readme:init (see docs/handover/02), or the star block is skipped"
    };
  }
  return { name: "star-assets", ok: true, detail: "chart assets present" };
}
function checkCronMounts(repoRoot, repo) {
  const files = workflowFiles(repoRoot);
  const mounted = files.filter((file) => {
    const raw = tryRead(file);
    return raw !== void 0 && CRON_MOUNT.test(raw);
  });
  if (mounted.length === 0) {
    return {
      name: "cron-mounts",
      ok: false,
      detail: "no readme:sync step in .github/workflows (see docs/handover/03)"
    };
  }
  const names = mounted.map((file) => basename3(file)).join(", ");
  if (repo === "ilife") {
    const scheduled = mounted.some((file) => /^\s*schedule:/m.test(tryRead(file) ?? ""));
    if (!scheduled) {
      return { name: "cron-mounts", ok: false, detail: "readme:sync mounted in " + names + " but no schedule: trigger" };
    }
    return { name: "cron-mounts", ok: true, detail: "mounted in " + names + " with schedule" };
  }
  return { name: "cron-mounts", ok: true, detail: "mounted in " + names };
}
function checkCopyFreshness(manifest, now) {
  const stale = [];
  let oldest;
  for (const plugin of manifest.plugins) {
    const age = ageInDays(plugin.verifiedAt + "T00:00:00Z", now);
    if (age === void 0) {
      stale.push(plugin.id + " (" + plugin.verifiedAt + " is not a date)");
      continue;
    }
    if (oldest === void 0 || age > oldest.age) oldest = { id: plugin.id, verifiedAt: plugin.verifiedAt, age };
    if (age > MAX_COPY_AGE_DAYS) stale.push(plugin.id + " (" + plugin.verifiedAt + ", " + age + " days)");
  }
  if (stale.length > 0) {
    return {
      name: "copy-freshness",
      ok: false,
      detail: "copy not verified for > " + MAX_COPY_AGE_DAYS + " days: " + stale.join(", ") + "; re-verify and publish"
    };
  }
  const summary = oldest === void 0 ? "no plugins" : "oldest " + oldest.id + " " + oldest.verifiedAt;
  return {
    name: "copy-freshness",
    ok: true,
    detail: manifest.plugins.length + " entr(ies) verified within " + MAX_COPY_AGE_DAYS + " days (" + summary + ")"
  };
}
async function checkRemoteManifest(options, version) {
  if (options.offline === true) {
    return { name: "remote-manifest", ok: true, detail: "skipped: offline" };
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return { name: "remote-manifest", ok: true, detail: "skipped: no fetch implementation" };
  }
  const timeoutMs = options.timeoutMs ?? DOCTOR_TIMEOUT_MS;
  const errors = [];
  for (const url of REMOTE_MANIFEST_URLS) {
    try {
      const raw = await fetchText(url, fetchImpl, timeoutMs);
      const manifest = parseManifest(JSON.parse(raw));
      const host = new URL(url).host;
      const note = manifest.version === version ? "matches package" : "published latest";
      return { name: "remote-manifest", ok: true, detail: host + " @latest v" + manifest.version + " (" + note + ")" };
    } catch (error) {
      errors.push(new URL(url).host + ": " + error.message);
    }
  }
  return { name: "remote-manifest", ok: false, detail: "no CDN channel reachable (" + errors.join("; ") + ")" };
}
async function runDoctor(options = {}) {
  const checks = [];
  const add = (check) => {
    checks.push(check);
  };
  const version = options.packageVersion ?? readPackageVersion();
  add({
    name: "package-version",
    ok: SEMVER.test(version),
    detail: SEMVER.test(version) ? version : 'invalid version "' + version + '"'
  });
  let manifest = options.manifest;
  let manifestError;
  if (manifest === void 0) {
    try {
      manifest = readPackagedManifest();
    } catch (error) {
      manifestError = error.message;
    }
  }
  if (manifest === void 0) {
    add({ name: "data-freshness", ok: false, detail: manifestError ?? "packaged manifest not readable" });
  } else {
    add({
      name: "data-freshness",
      ok: manifest.version === version,
      detail: manifest.version === version ? "manifest v" + manifest.version + " revision " + manifest.revision + " matches package" : "manifest v" + manifest.version + " (expected v" + version + "); run npm run build:data"
    });
    add(checkCopyFreshness(manifest, options.now ?? /* @__PURE__ */ new Date()));
  }
  add(await checkRemoteManifest(options, version));
  const grouped = /* @__PURE__ */ new Map();
  const addTargets = (targets) => {
    for (const target of targets) {
      const key = target.root + "|" + target.readme;
      const list = grouped.get(key) ?? [];
      list.push(target);
      grouped.set(key, list);
    }
  };
  if (manifest !== void 0) {
    for (const dir of options.reposDirs ?? []) addTargets(expandReadmeTargets([dir], { manifest }));
    for (const root of options.repoRoots ?? []) addTargets(resolveRepoReadmeTargets(root, { manifest }));
  }
  const byRepo = /* @__PURE__ */ new Map();
  for (const targets of grouped.values()) {
    const repo = targets[0].repo;
    const list = byRepo.get(repo) ?? [];
    list.push(...targets);
    byRepo.set(repo, list);
  }
  for (const [repo, targets] of byRepo) {
    const repoRoot = targets[0].root;
    if (!existsSync3(repoRoot)) {
      add({ name: repo + "/readme-blocks", ok: false, detail: "repository directory not found: " + repoRoot });
      continue;
    }
    for (const check of [
      checkReadmeBlocks(targets),
      checkReadmeImages(targets, version),
      checkDependencyVersion(repoRoot, version),
      checkInlineBundleVersion(repoRoot, version),
      checkStarAssets(repoRoot, targets),
      checkCronMounts(repoRoot, repo)
    ]) {
      add({ name: repo + "/" + check.name, ok: check.ok, detail: check.detail });
    }
  }
  return { ok: checks.every((check) => check.ok), checks };
}
function formatDoctorReport(result) {
  return result.checks.map((check) => (check.ok ? "ok    " : "fail  ") + check.name + "  " + check.detail).join("\n");
}

// src/node/index.ts
function verifyBlock(block, name) {
  const markers = BLOCK_MARKERS[name];
  const errors = [];
  if (!block.includes(markers.start)) errors.push(`missing start marker for ${name}`);
  if (!block.includes(markers.end)) errors.push(`missing end marker for ${name}`);
  return { ok: errors.length === 0, errors };
}
export {
  BLOCK_DEFINITIONS,
  BLOCK_MARKERS,
  CONTACT_CARD_WIDTH,
  CONTACT_TEXT,
  DEFAULT_CDN_BASE,
  DOCTOR_TIMEOUT_MS,
  MAX_COPY_AGE_DAYS,
  MORE_TEXT,
  PACKAGE_NAME,
  README_TARGETS,
  STAR_CHART_DEFAULT_DARK,
  STAR_CHART_DEFAULT_LIGHT,
  STAR_DATA_FILE,
  STAR_HISTORY_DEFAULT_ALT,
  THANKS_TEXT,
  assetName,
  blockDefinition,
  buildStarHistoryData,
  canonicalizeMarkup,
  compareBlocks,
  compareReadmeBlocks,
  contactCardCacheDate,
  contactCardUrl,
  detectStarMarkdownImage,
  detectStarVersion,
  expandReadmeTargets,
  findSuspiciousLines,
  formatDoctorReport,
  isSkippedThanksLogin,
  loadThanksData,
  locateReadmeBlocks,
  missingStarChartAssets,
  parseAttributes,
  parseContactBlock,
  parseHeading,
  parseMoreBlock,
  parseStarHistoryBlock,
  parseThanksBlock,
  pluginLink,
  readPackageVersion,
  readPackagedManifest,
  readmeTargetRepos,
  renderContactBlock,
  renderMoreBlock,
  renderStarHistoryBlock,
  renderThanksBlock,
  resolveReadmeTargets,
  resolveRepoReadmeTargets,
  rosesFor,
  runDoctor,
  starChartPaths,
  starVersionFromDataFile,
  starVersionFromTimestamp,
  thanksLinks,
  thanksRow,
  thanksTotal,
  updateReadme,
  updateReadmeTargets,
  updateReadmes,
  verifyBlock,
  writeFileAtomic
};
