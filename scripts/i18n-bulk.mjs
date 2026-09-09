import { readFileSync, writeFileSync } from "node:fs";

const localeFiles = ["src/locales/zh-CN.json", "src/locales/en-US.json", "src/locales/id-ID.json"];

const localeData = {};
for (const f of localeFiles) {
  localeData[f] = JSON.parse(readFileSync(f, "utf8"));
}

/**
 * Bulk-add keys to all 3 locale files.
 * @param {Array<{key: string, zh: string, en: string, id: string}>} entries
 */
export function addEntries(entries) {
  let added = 0;
  for (const entry of entries) {
    const { key, zh, en, id } = entry;
    if (!(key in localeData["src/locales/zh-CN.json"])) {
      localeData["src/locales/zh-CN.json"][key] = zh;
      added++;
    }
    if (!(key in localeData["src/locales/en-US.json"])) {
      localeData["src/locales/en-US.json"][key] = en;
    }
    if (!(key in localeData["src/locales/id-ID.json"])) {
      localeData["src/locales/id-ID.json"][key] = id;
    }
  }
  return added;
}

export function save() {
  for (const f of localeFiles) {
    // Sort keys alphabetically for stable diffs
    const sorted = {};
    for (const k of Object.keys(localeData[f]).sort()) {
      sorted[k] = localeData[f][k];
    }
    writeFileSync(f, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  }
}

export function getStats() {
  return {
    zh: Object.keys(localeData["src/locales/zh-CN.json"]).length,
    en: Object.keys(localeData["src/locales/en-US.json"]).length,
    id: Object.keys(localeData["src/locales/id-ID.json"]).length,
  };
}