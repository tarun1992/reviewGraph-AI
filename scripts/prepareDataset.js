// Generic dataset runner. Asks the active domain pack to produce canonical CSV
// tables and writes them to data/processed/<domain>/ for Aura LOAD CSV import.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDomainPack, ACTIVE_DOMAIN } from "../server/domain/loader.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function csvEscape(value) {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function main() {
  const pack = await loadDomainPack();
  if (typeof pack.init === "function") await pack.init();
  const { headers, tables } = pack.ingest();
  const outDir = path.join(rootDir, "data", "processed", ACTIVE_DOMAIN);
  await fs.mkdir(outDir, { recursive: true });

  const counts = {};
  for (const [name, cols] of Object.entries(headers)) {
    const rows = tables[name] || [];
    counts[name] = rows.length;
    const csv = [cols.join(","), ...rows.map((row) => cols.map((c) => csvEscape(row[c])).join(","))].join("\n");
    await fs.writeFile(path.join(outDir, `${name}.csv`), `${csv}\n`, "utf8");
  }

  console.log(`Prepared "${ACTIVE_DOMAIN}" dataset in ${outDir}`);
  console.table(counts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
