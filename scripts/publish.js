const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");

const ADDON_SLUG = "gitlab-issue-creator";
const API_BASE = "https://addons.thunderbird.net/api/v5/addons";

// --- Command line test mode ---
const TEST_MODE = process.argv[2] === "test";

/**
 * Creates a JWT for AMO authentication
 */
function createJWT() {
  const issuedAt = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: process.env.AMO_ISSUER,
      jti: Math.random().toString(),
      iat: issuedAt,
      exp: issuedAt + 60, // valid 1 minute
    },
    process.env.AMO_SECRET,
    { algorithm: "HS256" }
  );
}

/**
 * Uploads a build file and returns the UUID
 */
async function uploadBuild(buildPath) {
  const jwtToken = createJWT();
  const form = new FormData();
  form.append("upload", fs.createReadStream(buildPath));

  const res = await fetch(`${API_BASE}/upload/`, {
    method: "POST",
    headers: { Authorization: `JWT ${jwtToken}` },
    body: form,
  });

  if (!res.ok) {
    console.error("Build upload failed:", await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log("Build uploaded, UUID:", data.uuid);
  return data.uuid;
}

/**
 * Waits until the uploaded build is validated
 */
async function waitForValidation(uuid) {
  const jwtToken = createJWT();
  while (true) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${API_BASE}/upload/${uuid}/`, {
      headers: { Authorization: `JWT ${jwtToken}` },
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

/**
 * Creates a new version in AMO
 */
async function createVersion(uuid, changelog) {
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

  const res = await fetch(`${API_BASE}/addon/${ADDON_SLUG}/versions/`, {
    method: "POST",
    headers: {
      Authorization: `JWT ${jwtToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("Version creation failed:", await res.text());
    process.exit(1);
  }

  const data = await res.json();
  console.log("Version created:", data.version);
  return data.version;
}

/**
 * Uploads the source zip file
 */
async function uploadSource(versionNumber, sourcePath) {
  if (!sourcePath) return;

  const jwtToken = createJWT();
  const form = new FormData();
  form.append("source", fs.createReadStream(sourcePath));

  const res = await fetch(
    `${API_BASE}/addon/${ADDON_SLUG}/versions/${versionNumber}/`,
    {
      method: "PATCH",
      headers: { Authorization: `JWT ${jwtToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    console.error("Source upload failed:", await res.text());
    process.exit(1);
  }

  console.log("Source uploaded successfully.");
}

/**
 * Main orchestration
 */
(async () => {
  const buildsDir = path.join(process.cwd(), "builds");
  const srcDir = path.join(process.cwd(), "src_zips");

  const buildZip = fs
    .readdirSync(buildsDir)
    .filter((f) => f.endsWith(".zip") || f.endsWith(".xpi"))
    .map((f) => path.join(buildsDir, f))
    .sort()
    .pop();

  const sourceZip = fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => path.join(srcDir, f))
    .sort()
    .pop();

  if (!buildZip) {
    console.error("No build file found!");
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
