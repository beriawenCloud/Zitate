import { createServer } from "node:http";
import { appendFile, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(__dirname, "public");
const vaultDir = resolve(process.env.VAULT_DIR || resolve(__dirname, "..", "Zitate-Archiv"));
const port = Number(process.env.PORT || 5174);
const accessCode = String(process.env.ACCESS_CODE || "").trim();
const githubToken = String(process.env.GITHUB_TOKEN || "").trim();
const githubRepo = String(process.env.GITHUB_REPO || "beriawenCloud/Zitate").trim();
const githubBranch = String(process.env.GITHUB_BRANCH || "main").trim();
const githubVaultPath = String(process.env.GITHUB_VAULT_PATH || "Zitate-Archiv").trim().replace(/^\/+|\/+$/g, "");
const storageMode = githubToken ? "github" : "local";

const categories = [
  "Humor & Ironie",
  "Liebe & Beziehungen",
  "Leben & Vergänglichkeit",
  "Gesellschaft & Kritik",
  "Macht & Kontrolle",
  "Dunkelheit & Melancholie",
  "Hoffnung & Sinn",
  "Identität & Selbstbild",
  "Philosophie & Denken",
  "Zeit & Erinnerung",
  "Wahrheit & Erkenntnis",
  "Kunst & Sprache",
  "Tod & Endlichkeit",
  "Sonstiges"
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

function toBase64Utf8(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function fromBase64Utf8(value) {
  return Buffer.from(String(value || "").replace(/\n/g, ""), "base64").toString("utf8");
}

function hasAccess(req) {
  if (!accessCode) {
    return true;
  }

  return req.headers["x-access-code"] === accessCode;
}

async function readRequestBody(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) {
      throw new Error("request-too-large");
    }
  }
  return JSON.parse(raw || "{}");
}

function cleanInline(value, fallback = "unbekannt") {
  const text = String(value || "").trim();
  return text.length ? text.replace(/\r?\n/g, " ") : fallback;
}

function cleanMultiline(value, fallback = "unbekannt") {
  const text = String(value || "").trim();
  return text.length ? text.replace(/\r\n/g, "\n") : fallback;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags;
  }

  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => tag.toLowerCase().replace(/\s+/g, "-"));
}

function formatQuoteBlock(data) {
  const tags = normalizeTags(data.tags);
  const quote = cleanMultiline(data.quote, "[Zitat]");

  return [
    "",
    "---",
    `quelle: ${cleanInline(data.source)}`,
    `medium: ${cleanInline(data.medium)}`,
    `jahr: ${cleanInline(data.year)}`,
    `sprecher: ${cleanInline(data.speaker)}`,
    `sprache: ${cleanInline(data.language)}`,
    `tags: [${tags.join(", ")}]`,
    "---",
    "",
    `"${quote}"`,
    "",
    `**Stimmung:** ${cleanInline(data.mood)}`,
    `**Warum es hängen bleibt:** ${cleanInline(data.reason)}`,
    `**Geeignet für:** ${cleanInline(data.suitableFor)}`,
    ""
  ].join("\n");
}

function getCategoryPath(category) {
  if (!categories.includes(category)) {
    return null;
  }

  return githubVaultPath ? `${githubVaultPath}/${category}.md` : `${category}.md`;
}

function getCategoryFile(category) {
  if (!categories.includes(category)) {
    return null;
  }

  const filePath = normalize(resolve(vaultDir, `${category}.md`));
  if (!filePath.startsWith(vaultDir)) {
    return null;
  }

  return filePath;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${githubToken}`,
      "user-agent": "zitate-webapp",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = body.message || `GitHub API Fehler ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

async function appendQuoteToGithub(category, block) {
  const path = getCategoryPath(category);
  if (!path) {
    throw new Error("Unbekannte Kategorie.");
  }

  const [owner, repo] = githubRepo.split("/");
  if (!owner || !repo) {
    throw new Error("GITHUB_REPO muss im Format owner/repo gesetzt sein.");
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const contentPath = `/repos/${owner}/${repo}/contents/${encodedPath}`;
  const file = await githubRequest(`${contentPath}?ref=${encodeURIComponent(githubBranch)}`);
  const current = fromBase64Utf8(file.content);
  const updated = `${current.replace(/\s*$/, "\n")}${block.trimStart()}`;

  await githubRequest(contentPath, {
    method: "PUT",
    body: JSON.stringify({
      message: `Zitat ergänzen: ${category}`,
      content: toBase64Utf8(updated),
      sha: file.sha,
      branch: githubBranch
    })
  });

  return { file: path };
}

async function appendQuoteToLocalVault(category, block) {
  const filePath = getCategoryFile(category);

  if (!filePath) {
    throw new Error("Unbekannte Kategorie.");
  }

  await appendFile(filePath, block, "utf8");
  return { file: `${category}.md` };
}

async function handleApi(req, res) {
  if (req.method === "GET" && req.url === "/api/config") {
    sendJson(res, 200, {
      accessRequired: Boolean(accessCode),
      storageMode,
      githubRepo: storageMode === "github" ? githubRepo : null,
      githubBranch: storageMode === "github" ? githubBranch : null
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/categories") {
    sendJson(res, 200, { categories });
    return;
  }

  if (req.method === "POST" && req.url === "/api/quotes") {
    if (!hasAccess(req)) {
      sendJson(res, 401, { error: "Der Zugangscode ist falsch oder fehlt." });
      return;
    }

    try {
      const data = await readRequestBody(req);
      const category = cleanInline(data.category, "");
      const quote = cleanMultiline(data.quote, "");

      if (!quote) {
        sendJson(res, 400, { error: "Das Zitat darf nicht leer sein." });
        return;
      }

      const block = formatQuoteBlock(data);
      const result = storageMode === "github"
        ? await appendQuoteToGithub(category, block)
        : await appendQuoteToLocalVault(category, block);

      sendJson(res, 201, { ok: true, category, file: result.file, storageMode });
    } catch (error) {
      const message = error.message === "request-too-large"
        ? "Die Eingabe ist zu groß."
        : error.message || "Der Eintrag konnte nicht gespeichert werden.";
      const status = error.status === 404 || error.status === 409 ? error.status : 500;
      sendJson(res, status, { error: message });
    }
    return;
  }

  sendJson(res, 404, { error: "Nicht gefunden." });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const requested = normalize(resolve(publicDir, `.${pathname}`));

  if (!requested.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const info = await stat(requested);
    if (!info.isFile()) {
      throw new Error("not-file");
    }

    const body = await readFile(requested);
    res.writeHead(200, {
      "content-type": contentTypes[extname(requested)] || "application/octet-stream",
      "content-length": body.length
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(port, () => {
  console.log(`Zitate-Webapp läuft auf http://localhost:${port}`);
  console.log(storageMode === "github" ? `GitHub: ${githubRepo}/${githubVaultPath}` : `Vault: ${vaultDir}`);
  console.log(accessCode ? "Zugangscode: aktiv" : "Zugangscode: nicht gesetzt");
});
