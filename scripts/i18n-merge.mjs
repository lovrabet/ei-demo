import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { addEntries, save, getStats } from "./i18n-bulk.mjs";

// Merge every scripts/i18n-entries/*.json into the three locale files.
// Each entries file is an array of { key, zh, en, id }.
const entriesDir = resolve(import.meta.dirname, "i18n-entries");
if (!existsSync(entriesDir)) {
  console.log("no scripts/i18n-entries directory, nothing to merge");
  process.exit(0);
}

const files = readdirSync(entriesDir).filter((name) => name.endsWith(".json"));
let total = 0;
const seen = new Map();
for (const file of files) {
  const entries = JSON.parse(
    readFileSync(resolve(entriesDir, file), "utf8"),
  );
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      const prev = seen.get(entry.key);
      if (prev.zh !== entry.zh) {
        console.error(
          `conflicting key ${entry.key}: "${prev.zh}" (${prev.file}) vs "${entry.zh}" (${file})`,
        );
        process.exitCode = 1;
      }
      continue;
    }
    seen.set(entry.key, { zh: entry.zh, file });
  }
  total += entries.length;
  console.log(`${file}: ${entries.length} entries`);
}
if (process.exitCode) {
  console.error("resolve key conflicts before merging");
  process.exit(1);
}
const added = addEntries([...seen.keys()].map((key) => {
  const { file } = seen.get(key);
  const list = JSON.parse(
    readFileSync(resolve(entriesDir, file), "utf8"),
  );
  return list.find((item) => item.key === key);
}));
save();
console.log(`merged ${files.length} files, ${total} entries, ${added} new keys`);
console.log(`stats: ${JSON.stringify(getStats())}`);
