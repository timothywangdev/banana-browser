const express = require("express");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const app = express();
app.use(express.json());

const secretsPath = path.join(__dirname, "dev-secrets.json");
const secrets = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));

app.post("/v1/credentials/inject", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Unauthorized" });
  }

  const { key, url } = req.body;
  if (!key) {
    return res.status(400).json({ detail: "Missing 'key' in request body" });
  }

  const secret = secrets[key];
  if (!secret) {
    return res.status(404).json({ detail: `Credential not found: ${key}` });
  }

  if (secret.allowed_domains && url) {
    try {
      const domain = new URL(url).hostname;
      if (!secret.allowed_domains.includes(domain)) {
        return res.status(403).json({ detail: `Domain ${domain} not allowed` });
      }
    } catch {
      // If URL parsing fails, skip domain check
    }
  }

  res.json({
    value: secret.value,
    credential_type: secret.type || "password",
  });
});

app.get("/v1/otp/latest", (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ detail: "Unauthorized" });
  }

  const { service } = req.query;
  if (!service) {
    return res.status(400).json({ detail: "Missing 'service' query parameter" });
  }

  res.json({
    code: "123456",
    source: "mock",
    received_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  });
});

const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`Mock AgentGate server running on http://localhost:${port}`);
});
