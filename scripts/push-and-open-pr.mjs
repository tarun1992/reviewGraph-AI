/**
 * Push a local branch and open a GitHub PR (uses GITHUB_TOKEN from ReviewGraph .env).
 * Usage: node scripts/push-and-open-pr.mjs <repoDir> <branch> <prTitle>
 */
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: resolve(root, ".env"), override: true });

const [repoDir, branch, title, ...bodyParts] = process.argv.slice(2);
const body = bodyParts.join(" ") || "Test PR for ReviewGraph AI ingest and Aura Agent review.";
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPO || "ma3u/healthgraph-agent";

if (!token) {
  console.error("GITHUB_TOKEN missing in .env");
  process.exit(1);
}
if (!repoDir || !branch || !title) {
  console.error("Usage: node scripts/push-and-open-pr.mjs <repoDir> <branch> <title> [body]");
  process.exit(1);
}

const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "ReviewGraph-AI",
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json"
};

const remoteRef = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, {
  headers
});
if (!remoteRef.ok) {
  const authHeader = `AUTHORIZATION: bearer ${token}`;
  execSync(`git push -u origin ${branch}`, {
    cwd: resolve(repoDir),
    stdio: "inherit",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: authHeader
    }
  });
}

const existing = await fetch(
  `https://api.github.com/repos/${repo}/pulls?head=ma3u:${branch}&state=open`,
  { headers }
).then((r) => r.json());

if (Array.isArray(existing) && existing.length > 0) {
  const pr = existing[0];
  console.log(JSON.stringify({ ok: true, existing: true, number: pr.number, url: pr.html_url }));
  process.exit(0);
}

const prRes = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
  method: "POST",
  headers,
  body: JSON.stringify({ title, head: branch, base: "main", body })
});

const pr = await prRes.json();
if (!prRes.ok) {
  console.error("Create PR failed:", pr.message || pr);
  if (prRes.status === 403) {
    console.error(
      "Token needs write access: fine-grained PAT → Contents + Pull requests (Read and write) on this repo, or classic PAT with repo scope."
    );
  }
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, number: pr.number, url: pr.html_url }));
