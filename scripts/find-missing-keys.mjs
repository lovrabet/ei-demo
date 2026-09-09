import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const srcDir = resolve(root, "src");
const localePath = resolve(root, "src/locales/zh-CN.json");

const locale = JSON.parse(readFileSync(localePath, "utf8"));
const existingKeys = new Set(Object.keys(locale));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(entry.name) ? [p] : [];
  });
}

const tHelperPattern = /(?<![.\w])t\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
const directPattern = /\$i18n\.t\(\s*"([^"]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;

const missingKeys = new Map();
for (const file of walk(srcDir)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(tHelperPattern)) {
    const [, key, fallback] = match;
    if (!existingKeys.has(key)) {
      if (!missingKeys.has(key)) missingKeys.set(key, { fallback, files: [] });
      missingKeys.get(key).files.push(relative(root, file));
    }
  }
  for (const match of source.matchAll(directPattern)) {
    const [, key, fallback] = match;
    if (!existingKeys.has(key)) {
      if (!missingKeys.has(key)) missingKeys.set(key, { fallback, files: [] });
      missingKeys.get(key).files.push(relative(root, file));
    }
  }
}

console.log(`Missing keys: ${missingKeys.size}`);
for (const [key, info] of missingKeys) {
  console.log(`${key} = ${info.fallback}`);
  console.log(`  in: ${[...new Set(info.files)].slice(0, 3).join(", ")}`);
}