import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const localeDirectory = resolve(root, "src/locales");
const sourceDirectory = resolve(root, "src");
const languages = ["zh-CN", "en-US", "id-ID"];

function flatten(value, prefix = "", result = new Map()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    result.set(prefix, value);
    return result;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, result);
  }
  return result;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function i18nCallLines(source) {
  const lines = new Set();
  const marker = "$i18n.t(";
  let offset = source.indexOf(marker);
  while (offset >= 0) {
    let depth = 1;
    let quote = "";
    let escaped = false;
    let cursor = offset + marker.length;
    for (; cursor < source.length && depth > 0; cursor += 1) {
      const character = source[cursor];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (quote && character === "\\") {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
      }
    }
    const startLine = source.slice(0, offset).split("\n").length;
    const endLine = source.slice(0, cursor).split("\n").length;
    for (let line = startLine; line <= endLine; line += 1) lines.add(line);
    offset = source.indexOf(marker, cursor);
  }
  return lines;
}

function fail(messages) {
  for (const message of messages) console.error(`i18n error: ${message}`);
  process.exitCode = 1;
}

const localeMaps = new Map();
const errors = [];
for (const language of languages) {
  const path = resolve(localeDirectory, `${language}.json`);
  if (!existsSync(path)) {
    errors.push(`missing locale file src/locales/${language}.json`);
    continue;
  }
  const values = JSON.parse(readFileSync(path, "utf8"));
  const flattened = flatten(values);
  for (const [key, value] of flattened) {
    if (typeof value !== "string" || !value.trim()) {
      errors.push(`${language}.${key} must be a non-empty string`);
    }
  }
  localeMaps.set(language, flattened);
}

const canonicalKeys = new Set(localeMaps.get("zh-CN")?.keys() || []);
for (const language of languages.slice(1)) {
  const keys = new Set(localeMaps.get(language)?.keys() || []);
  for (const key of canonicalKeys) {
    if (!keys.has(key)) errors.push(`${language} is missing key ${key}`);
  }
  for (const key of keys) {
    if (!canonicalKeys.has(key))
      errors.push(`${language} has extra key ${key}`);
  }
  for (const key of canonicalKeys) {
    if (!keys.has(key)) continue;
    const placeholders = (value) =>
      [...String(value).matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)]
        .map((match) => match[1])
        .sort();
    const expected = placeholders(localeMaps.get("zh-CN").get(key));
    const actual = placeholders(localeMaps.get(language).get(key));
    if (expected.join("\0") !== actual.join("\0")) {
      errors.push(
        `${language}.${key} placeholders differ: expected {${expected.join(
          ", ",
        )}}, received {${actual.join(", ")}}`,
      );
    }
  }
}

const files = sourceFiles(sourceDirectory);
const usedKeys = new Map();
function recordUsedKey(key, file) {
  const locations = usedKeys.get(key) || [];
  locations.push(relative(root, file));
  usedKeys.set(key, locations);
}

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const directPattern = /\$i18n\.t\(\s*(["'])([^"']+)\1/g;
  const objectPattern = /\$i18n\.t\(\s*\{\s*id\s*:\s*(["'])([^"']+)\1/g;
  for (const match of source.matchAll(directPattern)) {
    recordUsedKey(match[2], file);
  }
  for (const match of source.matchAll(objectPattern)) {
    recordUsedKey(match[2], file);
  }
}
for (const [key, locations] of usedKeys) {
  if (!canonicalKeys.has(key)) {
    errors.push(
      `undefined key ${key}, used by ${[...new Set(locations)].join(", ")}`,
    );
  }
}

if (errors.length) fail(errors);
else {
  console.log(
    `i18n validation passed: ${canonicalKeys.size} keys, ${languages.length} languages, ${usedKeys.size} referenced keys`,
  );
}

if (process.argv.includes("--scan")) {
  const candidates = [];
  for (const file of files) {
    const projectPath = relative(root, file);
    if (
      projectPath.includes(".test.") ||
      projectPath.includes(".typecheck.") ||
      projectPath.startsWith("src/api/") ||
      projectPath.startsWith("src/locales/")
    ) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    const translatedLines = i18nCallLines(source);
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (translatedLines.has(index + 1)) return;
      const trimmed = line.trim();
      if (!/[\u3400-\u9fff]/.test(line)) return;
      if (!/["'`]/.test(line)) return;
      if (/^(\/\/|\/\*|\*|\*\/)/.test(trimmed)) return;
      candidates.push(`${projectPath}:${index + 1}: ${trimmed}`);
    });
  }
  console.log(
    `\nPossible user-facing hardcoded Chinese (${candidates.length}):`,
  );
  for (const candidate of candidates) console.log(candidate);
  console.log(
    "\nReview candidates manually. Do not translate route values, API parameters, field names, status codes, or other runtime contracts.",
  );
}
