const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const ADDON_SLUG = "gitlab-issue-creator";
const API_BASE = "https://addons.thunderbird.net/api/v5/addons";
const TEST_MODE = process.argv[2] === "test";
const VALIDATION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// --- ENVIRONMENT CHECKS ---
if (!process.env.AMO_ISSUER || !process.env.AMO_SECRET) {
  console.error("AMO_ISSUER and AMO_SECRET environment variables must be set!");
  process.exit(1);
}

function createJWT() {
  const issuedAt = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: process.env.AMO_ISSUER,
      jti: Math.random().toString(36).substring(2),
      iat: issuedAt,
      exp: issuedAt + 60,
    },
    process.env.AMO_SECRET,
    { algorithm: "HS256" }
  );
}

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`Fetch failed (attempt ${i + 1}): ${err.message}. Retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

async function uploadBuild(buildPath) {
  if (!fs.existsSync(buildPath)) {
    console.error("Build file does not exist:", buildPath);
    process.exit(1);
  }

  const jwtToken = createJWT();
  const form = new FormData();
  form.append("upload", fs.createReadStream(buildPath));

  const res = await fetchWithRetry(`${API_BASE}/upload/`, {
    method: "POST",
    headers: { Authorization: `JWT ${jwtToken}` },
    body: form,
  });

  const data = await res.json();
  if (!data.uuid) {
    console.error("No UUID returned from upload:", data);
    process.exit(1);
  }

  console.log("Build uploaded, UUID:", data.uuid);
  return data.uuid;
}

async function waitForValidation(uuid) {
  const start = Date.now();
  while (true) {
    if (Date.now() - start > VALIDATION_TIMEOUT) {
      console.error("Validation timed out for UUID:", uuid);
      process.exit(1);
    }

    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetchWithRetry(`${API_BASE}/upload/${uuid}/`, {
      headers: { Authorization: `JWT ${createJWT()}` },
    });

    const data = await res.json();
    if (data.valid) {
      console.log("Validation passed.");
      return;
    }
    if (data.processed && !data.valid) {
      console.error("Validation failed:", data);
      process.exit(1);
    }

    console.log("Waiting for validation...");
  }
}

async function createVersion(uuid, changelog) {
  if (!changelog || !changelog.trim()) {
    console.error("Changelog is empty!");
    process.exit(1);
  }

  const jwtToken = createJWT();
  const body = {
    upload: uuid,
    license: "mpl-2.0",
    compatibility: ["thunderbird"],
    release_notes: { "en-US": changelog },
  };

  if (TEST_MODE) {
    body.channel = "unlisted";
    console.log("TEST MODE enabled: version will be unlisted.");
  }

  const res = await fetchWithRetry(`${API_BASE}/addon/${ADDON_SLUG}/versions/`, {
    method: "POST",
    headers: {
      Authorization: `JWT ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.version) {
    console.error("Version creation returned no version data:", data);
    process.exit(1);
  }

  console.log("Version created:", data.version);
  return data.version;
}

async function uploadSource(versionNumber, sourcePath) {
  if (!sourcePath) return;

  if (!fs.existsSync(sourcePath)) {
    console.error("Source file does not exist:", sourcePath);
    return;
  }

  const jwtToken = createJWT();
  const form = new FormData();
  form.append("source", fs.createReadStream(sourcePath));

  const res = await fetchWithRetry(
    `${API_BASE}/addon/${ADDON_SLUG}/versions/${versionNumber}/`,
    {
      method: "PATCH",
      headers: { Authorization: `JWT ${jwtToken}` },
      body: form,
    }
  );

  console.log("Source uploaded successfully.");
}

(async () => {
  const buildsDir = path.join(process.cwd(), "builds");
  const srcDir = path.join(process.cwd(), "src_zips");

  [buildsDir, srcDir].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      console.error("Directory does not exist:", dir);
      process.exit(1);
    }
  });

  const buildZip = fs
    .readdirSync(buildsDir)
    .filter((f) => f.endsWith(".zip") || f.endsWith(".xpi"))
    .map((f) => path.join(buildsDir, f))
    .sort()
    .pop();

  if (!buildZip) {
    console.error("No build file found in:", buildsDir);
    process.exit(1);
  }

  const sourceZip = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => path.join(srcDir, f))
    .sort()
    .pop();

  if (!fs.existsSync("CHANGELOG.md")) {
    console.error("CHANGELOG.md not found!");
    process.exit(1);
  }

  const changelog = fs.readFileSync("CHANGELOG.md", "utf8");

  console.log("Uploading build...");
  const uploadUuid = await uploadBuild(buildZip);

  console.log("Waiting for validation...");
  await waitForValidation(uploadUuid);

  console.log("Creating new version...");
  const versionNumber = await createVersion(uploadUuid, changelog);

  if (sourceZip) {
    console.log("Uploading source zip...");
    await uploadSource(versionNumber, sourceZip);
  }

  console.log("Publish completed successfully!");
})();
