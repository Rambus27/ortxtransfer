const express = require("express");
const { spawn } = require("child_process");
const cors = require("cors");
const crypto = require("crypto");
const os = require("os");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

// In-memory access tokens for password-protected shares.
// Map<accessToken, { linkToken: string, validUntil: number }>
const accessTokens = new Map();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const LINKS_DB_PATH = path.join(DATA_DIR, "links.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");

ensureAppDirs();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${uuidv4()}-${safeName}`);
  }
});

const upload = multer({ storage });

app.post("/api/upload", upload.array("files"), (req, res) => {
  try {
    const expiresAt = req.body.expiresAt;
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length === 0) {
      return res.status(400).json({ error: "No files uploaded." });
    }

    if (!expiresAt) {
      deleteFiles(uploadedFiles.map((file) => file.path));
      return res.status(400).json({ error: "Expiration date is required." });
    }

    const expiresDate = new Date(expiresAt);
    if (Number.isNaN(expiresDate.getTime()) || expiresDate <= new Date()) {
      deleteFiles(uploadedFiles.map((file) => file.path));
      return res.status(400).json({ error: "Expiration date must be in the future." });
    }

    const links = readLinks();
    const token = uuidv4();
    const files = uploadedFiles.map((file) => ({
      id: uuidv4(),
      originalName: file.originalname,
      storedName: file.filename,
      size: file.size,
      mimeType: file.mimetype
    }));

    const rawPassword = (req.body.password || "").trim();
    const rawMessage = (req.body.message || "").trim();

    links[token] = {
      token,
      files,
      createdAt: new Date().toISOString(),
      expiresAt: expiresDate.toISOString(),
      ...(rawPassword ? { passwordHash: hashPassword(rawPassword) } : {}),
      ...(rawMessage ? { message: rawMessage.slice(0, 500) } : {})
    };

    writeLinks(links);

    return res.json({
      token,
      expiresAt: links[token].expiresAt,
      shareUrl: `${req.protocol}://${req.get("host")}/f/${token}`,
      // Keep downloadUrl as share page for backward compatibility with cached clients.
      downloadUrl: `${req.protocol}://${req.get("host")}/f/${token}`
    });
  } catch (error) {
    return res.status(500).json({ error: "Upload failed.", details: error.message });
  }
});

app.post("/api/verify-password/:token", (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).json({ error: "Link not found." });
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).json({ error: "Link expired." });
  }

  if (!entry.passwordHash) {
    return res.status(400).json({ error: "Link is not password protected." });
  }

  const { password } = req.body;

  if (!password || !verifyPassword(String(password), entry.passwordHash)) {
    return res.status(401).json({ error: "Incorrect password." });
  }

  const accessToken = uuidv4();
  accessTokens.set(accessToken, {
    linkToken: req.params.token,
    validUntil: Date.now() + 60 * 60 * 1000
  });

  return res.json({ accessToken });
});

app.get("/api/link/:token", (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).json({ error: "Link not found." });
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).json({ error: "Link expired." });
  }

  if (entry.passwordHash) {
    const at = req.query.at;
    if (!checkAccessToken(at, req.params.token)) {
      return res.status(401).json({
        error: "Password required.",
        passwordProtected: true,
        expiresAt: entry.expiresAt,
        fileCount: entry.files.length
      });
    }
  }

  const primaryFile = entry.files[0];
  const atSuffix = entry.passwordHash ? `?at=${req.query.at}` : "";

  return res.json({
    fileName: primaryFile.originalName,
    size: primaryFile.size,
    mimeType: primaryFile.mimeType,
    expiresAt: entry.expiresAt,
    fileCount: entry.files.length,
    totalSize: entry.files.reduce((sum, file) => sum + file.size, 0),
    message: entry.message || null,
    downloadAllUrl: entry.files.length > 1 ? `${req.protocol}://${req.get("host")}/download-all/${req.params.token}${atSuffix}` : null,
    files: entry.files.map((file) => ({
      id: file.id,
      fileName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      previewUrl: `${req.protocol}://${req.get("host")}/preview/${req.params.token}/${file.id}${atSuffix}`,
      downloadUrl: `${req.protocol}://${req.get("host")}/download/${req.params.token}/${file.id}${atSuffix}`
    })),
    previewUrl: `${req.protocol}://${req.get("host")}/preview/${req.params.token}/${primaryFile.id}${atSuffix}`,
    downloadUrl: `${req.protocol}://${req.get("host")}/download/${req.params.token}/${primaryFile.id}${atSuffix}`
  });
});

app.get("/f/:token", (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).send("Link not found.");
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).send("Link expired.");
  }

  if (!hasAnyExistingFile(entry)) {
    delete links[req.params.token];
    writeLinks(links);
    return res.status(404).send("Files no longer exist.");
  }

  return res.sendFile(path.join(__dirname, "public", "file.html"));
});

app.get("/preview/:token/:fileId?", (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).send("Link not found.");
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).send("Link expired.");
  }

  if (entry.passwordHash && !checkAccessToken(req.query.at, req.params.token)) {
    return res.status(401).send("Password required.");
  }

  const file = getRequestedFile(entry, req.params.fileId);

  if (!file) {
    return res.status(404).send("File not found.");
  }

  const absoluteFilePath = path.join(UPLOADS_DIR, file.storedName);

  if (!fs.existsSync(absoluteFilePath)) {
    removeMissingFiles(entry);

    if (entry.files.length === 0) {
      delete links[req.params.token];
    } else {
      links[req.params.token] = entry;
    }

    writeLinks(links);
    return res.status(404).send("File no longer exists.");
  }

  res.type(file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${file.originalName}"`);
  return res.sendFile(absoluteFilePath);
});

app.get("/download/:token/:fileId?", (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).send("Link not found.");
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).send("Link expired.");
  }

  if (entry.passwordHash && !checkAccessToken(req.query.at, req.params.token)) {
    return res.status(401).send("Password required.");
  }

  const file = getRequestedFile(entry, req.params.fileId);

  if (!file) {
    return res.status(404).send("File not found.");
  }

  const absoluteFilePath = path.join(UPLOADS_DIR, file.storedName);

  if (!fs.existsSync(absoluteFilePath)) {
    removeMissingFiles(entry);

    if (entry.files.length === 0) {
      delete links[req.params.token];
    } else {
      links[req.params.token] = entry;
    }

    writeLinks(links);
    return res.status(404).send("File no longer exists.");
  }

  return res.download(absoluteFilePath, file.originalName);
});

app.get("/download-all/:token", async (req, res) => {
  const links = readLinks();
  const entry = normalizeLinkEntry(links[req.params.token]);

  if (!entry) {
    return res.status(404).send("Link not found.");
  }

  if (isExpired(entry)) {
    purgeLink(req.params.token, entry, links);
    writeLinks(links);
    return res.status(410).send("Link expired.");
  }

  if (entry.passwordHash && !checkAccessToken(req.query.at, req.params.token)) {
    return res.status(401).send("Password required.");
  }

  removeMissingFiles(entry);

  if (entry.files.length === 0) {
    delete links[req.params.token];
    writeLinks(links);
    return res.status(404).send("Files no longer exist.");
  }

  if (entry.files.length === 1) {
    const onlyFile = entry.files[0];
    const absoluteFilePath = path.join(UPLOADS_DIR, onlyFile.storedName);
    return res.download(absoluteFilePath, onlyFile.originalName);
  }

  links[req.params.token] = entry;
  writeLinks(links);

  const archiveName = `${buildArchiveBaseName(entry)}.zip`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ortx-transfer-"));
  const archivePath = path.join(tempDir, archiveName);

  try {
    await createArchiveWithPowerShell(entry.files, archivePath);
    return res.download(archivePath, archiveName, () => {
      deleteFileIfExists(archivePath);
      deleteDirectoryIfExists(tempDir);
    });
  } catch {
    deleteFileIfExists(archivePath);
    deleteDirectoryIfExists(tempDir);
    return res.status(500).send("Could not prepare archive.");
  }
});

app.listen(PORT, () => {
  console.log(`Ortx Transfer running on http://localhost:${PORT}`);
});

setInterval(() => {
  const links = readLinks();
  let changed = false;

  Object.keys(links).forEach((token) => {
    const entry = links[token];
    if (isExpired(entry)) {
      purgeLink(token, entry, links);
      changed = true;
    }
  });

  if (changed) {
    writeLinks(links);
  }
}, 60 * 1000);

function ensureAppDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  if (!fs.existsSync(LINKS_DB_PATH)) {
    fs.writeFileSync(LINKS_DB_PATH, JSON.stringify({}, null, 2));
  }
}

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function verifyPassword(password, storedHash) {
  const inputHashBuf = Buffer.from(hashPassword(password), "hex");
  const storedHashBuf = Buffer.from(storedHash, "hex");
  if (inputHashBuf.length !== storedHashBuf.length) return false;
  return crypto.timingSafeEqual(inputHashBuf, storedHashBuf);
}

function checkAccessToken(accessToken, linkToken) {
  if (!accessToken) return false;
  const session = accessTokens.get(accessToken);
  if (!session) return false;
  if (session.linkToken !== linkToken) return false;
  if (Date.now() > session.validUntil) {
    accessTokens.delete(accessToken);
    return false;
  }
  return true;
}

function readLinks() {
  try {
    const raw = fs.readFileSync(LINKS_DB_PATH, "utf-8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function writeLinks(links) {
  fs.writeFileSync(LINKS_DB_PATH, JSON.stringify(links, null, 2));
}

function isExpired(entry) {
  return new Date(entry.expiresAt) <= new Date();
}

function purgeLink(token, entry, links) {
  const normalizedEntry = normalizeLinkEntry(entry);
  deleteFiles(normalizedEntry.files.map((file) => path.join(UPLOADS_DIR, file.storedName)));
  delete links[token];
}

function normalizeLinkEntry(entry) {
  if (!entry) {
    return null;
  }

  if (Array.isArray(entry.files)) {
    return {
      ...entry,
      files: entry.files.map((file) => ({
        id: file.id || buildStableFileId(file),
        originalName: file.originalName,
        storedName: file.storedName,
        size: file.size,
        mimeType: file.mimeType
      }))
    };
  }

  return {
    token: entry.token,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    ...(entry.passwordHash ? { passwordHash: entry.passwordHash } : {}),
    ...(entry.message ? { message: entry.message } : {}),
    files: [
      {
        id: entry.id || buildStableFileId(entry),
        originalName: entry.originalName,
        storedName: entry.storedName,
        size: entry.size,
        mimeType: entry.mimeType
      }
    ]
  };
}

function getRequestedFile(entry, fileId) {
  if (!entry.files || entry.files.length === 0) {
    return null;
  }

  if (!fileId) {
    return entry.files[0];
  }

  return entry.files.find((file) => file.id === fileId) || null;
}

function hasAnyExistingFile(entry) {
  return entry.files.some((file) => fs.existsSync(path.join(UPLOADS_DIR, file.storedName)));
}

function removeMissingFiles(entry) {
  entry.files = entry.files.filter((file) => fs.existsSync(path.join(UPLOADS_DIR, file.storedName)));
}

function deleteFiles(filePaths) {
  filePaths.forEach((filePath) => {
    deleteFileIfExists(filePath);
  });
}

function buildStableFileId(file) {
  return file.storedName || file.originalName;
}

function buildArchiveBaseName(entry) {
  const firstFileName = entry.files[0]?.originalName || "ortx-transfer-files";
  const baseName = path.parse(firstFileName).name || "ortx-transfer-files";
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return entry.files.length > 1 ? `${safeBaseName}-bundle` : safeBaseName;
}

function createArchiveWithPowerShell(files, archivePath) {
  return new Promise((resolve, reject) => {
    const literalPaths = files
      .map((file) => path.join(UPLOADS_DIR, file.storedName))
      .map((filePath) => `'${escapePowerShellString(filePath)}'`)
      .join(", ");

    const command = `Compress-Archive -LiteralPath @(${literalPaths}) -DestinationPath '${escapePowerShellString(archivePath)}' -Force`;
    const powershell = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
      windowsHide: true
    });

    let stderr = "";

    powershell.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    powershell.on("error", reject);
    powershell.on("close", (code) => {
      if (code === 0 && fs.existsSync(archivePath)) {
        resolve();
        return;
      }

      reject(new Error(stderr || "Compress-Archive failed."));
    });
  });
}

function escapePowerShellString(value) {
  return String(value).replace(/'/g, "''");
}

function deleteFileIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function deleteDirectoryIfExists(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
