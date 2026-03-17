const fileNameEl = document.getElementById("fileName");
const fileMetaEl = document.getElementById("fileMeta");
const fileListEl = document.getElementById("fileList");
const previewBoxEl = document.getElementById("previewBox");
const previewLoadingEl = document.getElementById("previewLoading");
const previewEtaEl = document.getElementById("previewEta");
const downloadBtnEl = document.getElementById("downloadBtn");
const downloadAllBtnEl = document.getElementById("downloadAllBtn");
const pageStatusEl = document.getElementById("pageStatus");
const passwordGateEl = document.getElementById("passwordGate");
const passwordGateFormEl = document.getElementById("passwordGateForm");
const gatePasswordInputEl = document.getElementById("gatePasswordInput");
const gateSubmitBtnEl = document.getElementById("gateSubmitBtn");
const gateStatusEl = document.getElementById("gateStatus");
const senderMessageEl = document.getElementById("senderMessage");
const senderMessageTextEl = document.getElementById("senderMessageText");

let currentFile = null;
let sharedFiles = [];
let downloadAllUrl = "";
let previewLoadTiming = null;
let activeAccessToken = sessionStorage.getItem(`at_${window.location.pathname}`) || "";

const token = window.location.pathname.split("/").filter(Boolean).pop();

if (!token) {
  setStatus("Invalid file link.", true);
  fileNameEl.textContent = "File not found";
  downloadBtnEl.disabled = true;
} else {
  downloadBtnEl.disabled = true;
  loadFile(token);
}

// ── Password gate ─────────────────────────────────────────────────────────────
passwordGateFormEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const password = gatePasswordInputEl.value;
  if (!password) return;

  gateSubmitBtnEl.disabled = true;
  gateStatusEl.textContent = "Verifying...";
  gateStatusEl.classList.remove("error");

  try {
    const res = await fetch(`/api/verify-password/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      gateStatusEl.textContent = payload.error || "Incorrect password.";
      gateStatusEl.classList.add("error");
      gateSubmitBtnEl.disabled = false;
      return;
    }

    activeAccessToken = payload.accessToken;
    sessionStorage.setItem(`at_${window.location.pathname}`, activeAccessToken);
    passwordGateEl.classList.add("hidden");
    loadFile(token);
  } catch {
    gateStatusEl.textContent = "Network error. Try again.";
    gateStatusEl.classList.add("error");
    gateSubmitBtnEl.disabled = false;
  }
});
// ─────────────────────────────────────────────────────────────────────────────

downloadBtnEl.addEventListener("click", () => {
  if (!currentFile?.downloadUrl) {
    setStatus("Download URL not available.", true);
    return;
  }

  try {
    const a = document.createElement("a");
    a.href = currentFile.downloadUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus("File download started.");
  } catch (error) {
    setStatus("Could not start download. Try opening the link directly.", true);
    console.log("Download URL:", currentFile.downloadUrl);
  }
});

downloadAllBtnEl.addEventListener("click", () => {
  if (!downloadAllUrl) {
    setStatus("Download-all URL not available.", true);
    return;
  }

  try {
    const a = document.createElement("a");
    a.href = downloadAllUrl;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setStatus("Archive download started.");
  } catch (error) {
    setStatus("Could not start archive download. Try opening the link directly.", true);
    console.log("Download-all URL:", downloadAllUrl);
  }
});

async function loadFile(fileToken) {
  setStatus("Loading file details...");
  fileNameEl.textContent = "Loading file...";

  const url = activeAccessToken
    ? `/api/link/${fileToken}?at=${encodeURIComponent(activeAccessToken)}`
    : `/api/link/${fileToken}`;

  try {
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({}));

    if (response.status === 401 && payload.passwordProtected) {
      fileNameEl.textContent = `${payload.fileCount || ""} file${payload.fileCount !== 1 ? "s" : ""} — password required`;
      fileMetaEl.textContent = `Expires ${new Date(payload.expiresAt).toLocaleString()}`;
      setStatus("");
      passwordGateEl.classList.remove("hidden");
      return;
    }

    if (!response.ok) {
      throw new Error(payload.error || "Could not load file details.");
    }

    sharedFiles = Array.isArray(payload.files) ? payload.files : [];
    downloadAllUrl = payload.downloadAllUrl || "";

    if (sharedFiles.length === 0) {
      throw new Error("This link does not contain any files.");
    }

    fileNameEl.textContent = sharedFiles.length === 1 ? sharedFiles[0].fileName : `${sharedFiles.length} files ready`;
    fileMetaEl.textContent = `${formatBytes(payload.totalSize || payload.size)} • Expires ${new Date(payload.expiresAt).toLocaleString()}`;
    downloadBtnEl.disabled = false;
    toggleDownloadAll(sharedFiles.length > 1 && Boolean(downloadAllUrl));

    if (payload.message) {
      senderMessageTextEl.textContent = payload.message;
      senderMessageEl.classList.remove("hidden");
    }

    renderFileList(sharedFiles);
    selectFile(sharedFiles[0].id);
    setStatus("");
  } catch (error) {
    fileNameEl.textContent = "File unavailable";
    fileMetaEl.textContent = "";
    fileListEl.classList.add("hidden");
    previewBoxEl.innerHTML = '<p class="preview-placeholder">Preview unavailable.</p>';
    downloadBtnEl.disabled = true;
    toggleDownloadAll(false);
    setStatus(error.message || "Unable to load this file.", true);
  }
}

function toggleDownloadAll(shouldShow) {
  downloadAllBtnEl.classList.toggle("hidden", !shouldShow);
}

function renderFileList(files) {
  fileListEl.innerHTML = files
    .map(
      (file) => `
        <button type="button" class="file-item" data-file-id="${escapeHtml(file.id)}">
          <span class="file-item-name">${escapeHtml(file.fileName)}</span>
          <span class="file-item-meta">${formatBytes(file.size)}</span>
        </button>
      `
    )
    .join("");

  fileListEl.classList.remove("hidden");

  fileListEl.querySelectorAll(".file-item").forEach((button) => {
    button.addEventListener("click", () => {
      selectFile(button.dataset.fileId);
    });
  });
}

function selectFile(fileId) {
  const selectedFile = sharedFiles.find((file) => file.id === fileId);

  if (!selectedFile) {
    return;
  }

  currentFile = selectedFile;
  fileNameEl.textContent = selectedFile.fileName;
  fileListEl.querySelectorAll(".file-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.fileId === fileId);
  });
  renderPreview(selectedFile);
}

function renderPreview(fileInfo) {
  const mimeType = (fileInfo.mimeType || "").toLowerCase();
  const previewUrl = fileInfo.previewUrl;

  previewBoxEl.innerHTML = '<p class="preview-placeholder">Preparing preview...</p>';
  previewBoxEl.appendChild(previewLoadingEl);

  if (!previewUrl) {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">No preview available for this file.</p>';
    previewLoadingEl.classList.add("hidden");
    return;
  }

  showPreviewLoading();

  if (mimeType.startsWith("image/")) {
    loadImagePreview(previewUrl);
    return;
  }

  if (mimeType.startsWith("video/")) {
    loadVideoPreview(previewUrl);
    return;
  }

  if (mimeType.startsWith("audio/")) {
    loadAudioPreview(previewUrl);
    return;
  }

  if (mimeType === "application/pdf") {
    loadPdfPreview(previewUrl);
    return;
  }

  if (mimeType.startsWith("text/")) {
    loadTextPreview(previewUrl);
    return;
  }

  previewBoxEl.innerHTML = '<p class="preview-placeholder">This file type cannot be previewed in-browser. Use the download button.</p>';
  hidePreviewLoading();
}

function showPreviewLoading() {
  previewLoadTiming = {
    startTime: Date.now(),
    lastUpdateTime: Date.now()
  };
  previewBoxEl.appendChild(previewLoadingEl);
  previewLoadingEl.classList.remove("hidden");
  updatePreviewEta();

  // Auto-hide after 15 seconds if preview is taking too long
  setTimeout(() => {
    if (previewLoadTiming && !previewLoadingEl.classList.contains("hidden")) {
      hidePreviewLoading();
    }
  }, 15000);
}

function hidePreviewLoading() {
  previewLoadingEl.classList.add("hidden");
  previewLoadTiming = null;
}

function updatePreviewEta() {
  if (!previewLoadTiming || previewLoadingEl.classList.contains("hidden")) {
    return;
  }

  const now = Date.now();
  const elapsedMs = now - previewLoadTiming.startTime;
  const elapsedSec = Math.round(elapsedMs / 1000);

  if (elapsedSec < 1) {
    previewEtaEl.textContent = "Estimating...";
  } else if (elapsedSec < 3) {
    previewEtaEl.textContent = `${elapsedSec}s`;
  } else if (elapsedSec < 8) {
    previewEtaEl.textContent = `${elapsedSec}s (loading...)`;
  } else {
    previewEtaEl.textContent = `${elapsedSec}s (taking longer)`;
  }

  // Keep updating every 500ms
  if (previewLoadTiming && !previewLoadingEl.classList.contains("hidden")) {
    setTimeout(updatePreviewEta, 500);
  }
}

async function loadImagePreview(url) {
  try {
    const img = new Image();
    img.onload = () => {
      previewBoxEl.innerHTML = "";
      previewBoxEl.appendChild(img);
      hidePreviewLoading();
    };
    img.onerror = () => {
      previewBoxEl.innerHTML = '<p class="preview-placeholder">Image preview failed.</p>';
      hidePreviewLoading();
    };
    img.src = url;
    img.alt = "File preview";
  } catch {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">Image preview unavailable.</p>';
    hidePreviewLoading();
  }
}

async function loadVideoPreview(url) {
  try {
    const video = document.createElement("video");
    video.controls = true;
    video.onloadedmetadata = () => {
      hidePreviewLoading();
    };
    video.onerror = () => {
      previewBoxEl.innerHTML = '<p class="preview-placeholder">Video preview failed.</p>';
      hidePreviewLoading();
    };
    video.src = url;
    previewBoxEl.innerHTML = "";
    previewBoxEl.appendChild(video);
  } catch {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">Video preview unavailable.</p>';
    hidePreviewLoading();
  }
}

async function loadAudioPreview(url) {
  try {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.onloadedmetadata = () => {
      hidePreviewLoading();
    };
    audio.onerror = () => {
      previewBoxEl.innerHTML = '<p class="preview-placeholder">Audio preview failed.</p>';
      hidePreviewLoading();
    };
    audio.src = url;
    previewBoxEl.innerHTML = "";
    previewBoxEl.appendChild(audio);
  } catch {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">Audio preview unavailable.</p>';
    hidePreviewLoading();
  }
}

function loadPdfPreview(url) {
  try {
    setTimeout(() => hidePreviewLoading(), 1500);
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.title = "PDF preview";
    previewBoxEl.innerHTML = "";
    previewBoxEl.appendChild(iframe);
  } catch {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">PDF preview unavailable.</p>';
    hidePreviewLoading();
  }
}


async function loadTextPreview(url) {
  try {
    const text = await fetch(url).then((res) => {
      if (!res.ok) {
        throw new Error("Could not load text preview.");
      }
      return res.text();
    });

    const limited = text.length > 12000 ? `${text.slice(0, 12000)}\n\n...preview truncated...` : text;
    const pre = document.createElement("pre");
    pre.textContent = limited;
    previewBoxEl.innerHTML = "";
    previewBoxEl.appendChild(pre);
    hidePreviewLoading();
  } catch {
    previewBoxEl.innerHTML = '<p class="preview-placeholder">Text preview unavailable. Use download instead.</p>';
    hidePreviewLoading();
  }
}

function setStatus(message, isError = false) {
  pageStatusEl.textContent = message;
  pageStatusEl.classList.toggle("error", isError);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
