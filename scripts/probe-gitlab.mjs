#!/usr/bin/env node
/**
 * @fileoverview Probes a real GitLab instance for the facts the data-fetching
 * architecture depends on, instead of assuming them from documentation
 * alone: pagination headers, ETag/conditional-request support, per_page
 * caps, and response sizes/latency for the endpoints this add-on calls.
 *
 * Writes a timestamped JSON fixture to tests/fixtures/gitlab/ (no token
 * included) and prints a summary.
 *
 * Usage:
 *   GITLAB_URL=https://gitlab.example.com GITLAB_TOKEN=glpat-xxx node scripts/probe-gitlab.mjs
 * or create a .env file (gitignored) with those two variables — dotenv is
 * already a devDependency.
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const GITLAB_URL = process.env.GITLAB_URL;
const GITLAB_TOKEN = process.env.GITLAB_TOKEN;

if (!GITLAB_URL || !GITLAB_TOKEN) {
  console.error("Set GITLAB_URL and GITLAB_TOKEN (env vars or .env) before running this probe.");
  process.exit(1);
}

const headers = { "PRIVATE-TOKEN": GITLAB_TOKEN };
// A real Origin header is required to see the CORS-exposed headers this
// add-on actually gets as a browser extension — curl without one sees
// nothing CORS-related at all (GitLab responds `Vary: Origin`).
const originHeaders = { ...headers, Origin: "moz-extension://probe" };

async function timedFetch(url, extraHeaders = {}) {
  const start = performance.now();
  const response = await fetch(url, { headers: { ...originHeaders, ...extraHeaders } });
  const bodyText = await response.text();
  const timeMs = performance.now() - start;
  return { response, bodyText, timeMs };
}

function pickHeaders(response, names) {
  const out = {};
  for (const name of names) out[name] = response.headers.get(name);
  return out;
}

async function main() {
  const results = { probedAt: new Date().toISOString(), host: new URL(GITLAB_URL).host };

  // -- version ---------------------------------------------------------
  const versionRes = await fetch(`${GITLAB_URL}/api/v4/version`, { headers });
  results.version = await versionRes.json();

  // -- /user: ETag presence ---------------------------------------------
  const user1 = await timedFetch(`${GITLAB_URL}/api/v4/user`);
  results.user = {
    status: user1.response.status,
    timeMs: Math.round(user1.timeMs),
    sizeBytes: user1.bodyText.length,
    headers: pickHeaders(user1.response, ["etag", "cache-control"]),
  };

  // -- /projects: pagination + size + CORS exposure ----------------------
  const projectsUrl = `${GITLAB_URL}/api/v4/projects?membership=true&simple=true&per_page=100&order_by=last_activity_at`;
  const projects1 = await timedFetch(projectsUrl);
  const corsHeaders = pickHeaders(projects1.response, [
    "access-control-allow-origin",
    "access-control-expose-headers",
  ]);
  const paginationHeaders = pickHeaders(projects1.response, [
    "link",
    "x-next-page",
    "x-total",
    "x-total-pages",
    "x-per-page",
    "etag",
  ]);
  results.projectsPage = {
    status: projects1.response.status,
    timeMs: Math.round(projects1.timeMs),
    sizeBytes: projects1.bodyText.length,
    cors: corsHeaders,
    pagination: paginationHeaders,
  };

  // -- ETag revalidation: replay as If-None-Match -------------------------
  const etag = projects1.response.headers.get("etag");
  if (etag) {
    const revalidate = await timedFetch(projectsUrl, { "If-None-Match": etag });
    results.projectsEtagRevalidation = {
      status: revalidate.response.status,
      timeMs: Math.round(revalidate.timeMs),
      sizeBytes: revalidate.bodyText.length,
    };
  }

  // -- per_page cap --------------------------------------------------------
  const overLimit = await timedFetch(
    `${GITLAB_URL}/api/v4/projects?membership=true&simple=true&per_page=200`,
  );
  results.perPageCap = {
    requested: 200,
    actual: Number(overLimit.response.headers.get("x-per-page")),
  };

  // -- server-side search size/latency -------------------------------------
  const searchTerm = process.env.GITLAB_PROBE_SEARCH_TERM || "a";
  const search = await timedFetch(
    `${GITLAB_URL}/api/v4/projects?membership=true&simple=true&per_page=20&search=${encodeURIComponent(searchTerm)}`,
  );
  results.search = {
    term: searchTerm,
    timeMs: Math.round(search.timeMs),
    sizeBytes: search.bodyText.length,
    total: Number(search.response.headers.get("x-total")),
  };

  // -- assignees endpoint: pagination + ETag ------------------------------
  const projectsJson = JSON.parse(projects1.bodyText);
  const sampleProjectId = projectsJson[0]?.id;
  if (sampleProjectId) {
    const users1 = await timedFetch(
      `${GITLAB_URL}/api/v4/projects/${sampleProjectId}/users?per_page=100`,
    );
    const usersEtag = users1.response.headers.get("etag");
    let revalidation = null;
    if (usersEtag) {
      const revalidate = await timedFetch(
        `${GITLAB_URL}/api/v4/projects/${sampleProjectId}/users?per_page=100`,
        { "If-None-Match": usersEtag },
      );
      revalidation = { status: revalidate.response.status, sizeBytes: revalidate.bodyText.length };
    }
    results.sampleProjectUsers = {
      projectId: sampleProjectId,
      total: Number(users1.response.headers.get("x-total")),
      timeMs: Math.round(users1.timeMs),
      sizeBytes: users1.bodyText.length,
      etagRevalidation: revalidation,
    };
  }

  // -- write fixture (never includes the token) ---------------------------
  const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tests", "fixtures", "gitlab");
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `probe-${results.host}.json`);
  writeFileSync(outFile, JSON.stringify(results, null, 2));

  console.log(`Probe results written to ${outFile}\n`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("Probe failed:", err);
  process.exit(1);
});
