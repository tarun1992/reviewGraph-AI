// Loads the active domain pack selected by the DOMAIN env var (default:
// codereview). Packs live in domains/<id>/pack.js.

import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validatePack } from "./contract.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export const ACTIVE_DOMAIN = process.env.DOMAIN || "codereview";

let cached;

export async function loadDomainPack(id = ACTIVE_DOMAIN) {
  if (cached && cached.id === id) return cached.pack;
  const packPath = path.join(rootDir, "domains", id, "pack.js");
  const module = await import(pathToFileURL(packPath).href);
  const pack = module.default || module.pack;
  validatePack(pack, id);
  cached = { id, pack };
  return pack;
}
