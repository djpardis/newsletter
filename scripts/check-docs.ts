import { readFileSync } from "node:fs";

const DOC_PATHS = [
  "README.md",
  "SETUP.md",
  "CONTRIBUTING.md",
  "DEPLOYING.md",
  "SECURITY.md",
  "examples/README.md",
];

const README_BADGES = [
  "![CI](https://github.com/djpardis/newsletter/actions/workflows/ci.yml/badge.svg)",
  "![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)",
];

/** Strip fenced and inline code so shell `&&` and command flags are not prose-checked. */
function stripCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]+`/g, "");
}

function isAmpersandInUrl(text: string, index: number): boolean {
  const before = text.lastIndexOf("(", index);
  const after = text.indexOf(")", index);
  if (before === -1 || after === -1 || after < index) return false;
  const inside = text.slice(before, after + 1);
  return /https?:\/\/[^\s)]*&/.test(inside);
}

function findProseAmpersands(text: string): number[] {
  const prose = stripCode(text);
  const hits: number[] = [];
  for (let i = 0; i < prose.length; i++) {
    if (prose[i] !== "&") continue;
    if (prose.startsWith("&amp;", i) || prose.startsWith("&#", i)) continue;
    if (!isAmpersandInUrl(prose, i)) hits.push(i);
  }
  return hits;
}

/** `[label](url)` wrapped in backticks renders as code, not a link. */
const BACKTICK_LINK_RE = /`\[[^\]]+\]\([^)]+\)`/g;

const violations: string[] = [];

for (const path of DOC_PATHS) {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    continue;
  }

  const ampersands = findProseAmpersands(text);
  if (ampersands.length > 0) {
    violations.push(
      `${path}: use "and" instead of "&" in prose (found ${ampersands.length} outside URLs/code)`,
    );
  }

  const backtickLinks = text.match(BACKTICK_LINK_RE) ?? [];
  for (const match of backtickLinks) {
    violations.push(`${path}: link wrapped in backticks (not clickable): ${match}`);
  }
}

const readme = readFileSync("README.md", "utf8");
for (const badge of README_BADGES) {
  if (!readme.includes(badge)) {
    violations.push(`README.md: missing badge line: ${badge}`);
  }
}

if (/^\[CI\]\(https:\/\/github\.com\/djpardis\/newsletter/m.test(readme)) {
  violations.push(
    'README.md: CI must use badge image syntax ![CI](.../badge.svg), not plain [CI](url)',
  );
}

if (/^\[License: MIT\]\(/m.test(readme)) {
  violations.push(
    "README.md: License must use badge image syntax ![License: MIT](.../badge.svg)",
  );
}

if (violations.length > 0) {
  console.error("Documentation check failed:\n");
  for (const v of violations) {
    console.error(`- ${v}`);
  }
  process.exit(1);
}

console.log("Documentation check passed.");

export {};
