const uploadForm = document.getElementById("uploadForm");
const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const dropZoneFilesEl = document.getElementById("dropZoneFiles");
const expiresAtInput = document.getElementById("expiresAt");
const passwordInput = document.getElementById("passwordInput");
const messageInput = document.getElementById("messageInput");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const downloadLinkInput = document.getElementById("downloadLink");
const expiryTextEl = document.getElementById("expiryText");
const submitBtn = document.getElementById("submitBtn");
const copyBtn = document.getElementById("copyBtn");
const qrCodeBoxEl = document.getElementById("qrCodeBox");
const uploadProgressEl = document.getElementById("uploadProgress");
const uploadProgressFillEl = document.getElementById("uploadProgressFill");
const uploadProgressTextEl = document.getElementById("uploadProgressText");
const uploadEtaTextEl = document.getElementById("uploadEtaText");

let uploadTiming = null;

// ── Drag & drop ──────────────────────────────────────────────────────────────
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});

["dragleave", "dragend"].forEach((evt) =>
  dropZone.addEventListener(evt, () => dropZone.classList.remove("drag-over"))
);

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");

  if (e.dataTransfer?.files?.length) {
    const dt = new DataTransfer();
    Array.from(e.dataTransfer.files).forEach((f) => dt.items.add(f));
    fileInput.files = dt.files;
    updateDropZoneLabel(fileInput.files);
  }
});

fileInput.addEventListener("change", () => updateDropZoneLabel(fileInput.files));

function updateDropZoneLabel(files) {
  if (!files || files.length === 0) {
    dropZoneFilesEl.textContent = "";
    return;
  }
  if (files.length === 1) {
    dropZoneFilesEl.textContent = files[0].name;
  } else {
    dropZoneFilesEl.textContent = `${files.length} files selected`;
  }
}
// ─────────────────────────────────────────────────────────────────────────────

setDefaultExpiry();

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearStatus();
  resultEl.classList.add("hidden");

  const files = Array.from(fileInput.files || []);
  const expiresAt = expiresAtInput.value;

  if (files.length === 0) {
    setStatus("Please choose at least one file.", true);
    return;
  }

  if (!expiresAt) {
    setStatus("Please choose an expiration date.", true);
    return;
  }

  submitBtn.disabled = true;
  setStatus("Uploading...");
  showProgress();
  updateProgress(0);

  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  formData.append("expiresAt", new Date(expiresAt).toISOString());

  const password = passwordInput.value.trim();
  if (password) {
    formData.append("password", password);
  }

  const message = messageInput.value.trim();
  if (message) {
    formData.append("message", message);
  }

  try {
    const response = await uploadWithProgress(formData, updateProgress);

    const payload = await parseApiResponse(response);

    if (!response.ok) {
      throw new Error(payload.error || "Upload failed.");
    }

    downloadLinkInput.value = payload.shareUrl || payload.downloadUrl;
    expiryTextEl.textContent = `Expires on ${new Date(payload.expiresAt).toLocaleString()}`;
    resultEl.classList.remove("hidden");
    updateProgress(100);
    setStatus(`${files.length} file${files.length === 1 ? "" : "s"} uploaded. Link generated successfully.`);
    generateQrCode(payload.shareUrl || payload.downloadUrl);
  } catch (error) {
    setStatus(error.message || "Something went wrong.", true);
  } finally {
    submitBtn.disabled = false;
    hideProgress();
  }
});

copyBtn.addEventListener("click", async () => {
  const value = downloadLinkInput.value;
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
    setStatus("Link copied to clipboard.");
  } catch {
    setStatus("Could not copy automatically. Please copy manually.", true);
  }
});

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function clearStatus() {
  setStatus("");
}

function setDefaultExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + 2);
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  const localISO = new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
  expiresAtInput.value = localISO;
}

async function parseApiResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  const trimmed = text.trim();

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error("Server/API not reachable. Start the backend and open the app from http://localhost:3000.");
  }

  if (!response.ok) {
    throw new Error(trimmed || "Upload failed.");
  }

  throw new Error("Unexpected response from server.");
}

function showProgress() {
  uploadTiming = {
    startTime: Date.now(),
    lastLoaded: 0,
    lastTimestamp: Date.now(),
    smoothedBytesPerSecond: 0
  };

  uploadProgressEl.classList.remove("hidden");
  uploadProgressEl.setAttribute("aria-hidden", "false");
  uploadEtaTextEl.textContent = "ETA: Calculating...";
}

function hideProgress() {
  uploadProgressEl.classList.add("hidden");
  uploadProgressEl.setAttribute("aria-hidden", "true");
  uploadTiming = null;
  uploadEtaTextEl.textContent = "ETA: Calculating...";
  updateProgress(0);
}

function updateProgress(percent) {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  uploadProgressFillEl.style.width = `${clampedPercent}%`;
  uploadProgressTextEl.textContent = `${clampedPercent}%`;

  const progressTrack = uploadProgressEl.querySelector(".upload-progress-track");
  if (progressTrack) {
    progressTrack.setAttribute("aria-valuenow", String(clampedPercent));
  }
}

function updateEta(loadedBytes, totalBytes) {
  if (!uploadTiming || totalBytes <= 0) {
    uploadEtaTextEl.textContent = "ETA: Calculating...";
    return;
  }

  const now = Date.now();
  const elapsedMs = Math.max(1, now - uploadTiming.lastTimestamp);
  const bytesDelta = Math.max(0, loadedBytes - uploadTiming.lastLoaded);
  const instantaneousBytesPerSecond = (bytesDelta / elapsedMs) * 1000;

  // Smooth speed to avoid noisy ETA jumps.
  if (uploadTiming.smoothedBytesPerSecond <= 0) {
    uploadTiming.smoothedBytesPerSecond = instantaneousBytesPerSecond;
  } else {
    uploadTiming.smoothedBytesPerSecond = uploadTiming.smoothedBytesPerSecond * 0.8 + instantaneousBytesPerSecond * 0.2;
  }

  uploadTiming.lastLoaded = loadedBytes;
  uploadTiming.lastTimestamp = now;

  const bytesRemaining = Math.max(0, totalBytes - loadedBytes);
  const bytesPerSecond = uploadTiming.smoothedBytesPerSecond;

  if (bytesRemaining === 0) {
    uploadEtaTextEl.textContent = "ETA: 0s";
    return;
  }

  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 1) {
    uploadEtaTextEl.textContent = "ETA: Calculating...";
    return;
  }

  const secondsRemaining = Math.ceil(bytesRemaining / bytesPerSecond);
  uploadEtaTextEl.textContent = `ETA: ${formatEta(secondsRemaining)}`;
}

function formatEta(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function uploadWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);
    xhr.responseType = "text";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const percent = (event.loaded / event.total) * 100;
      onProgress(percent);
      updateEta(event.loaded, event.total);
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Network error while uploading."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload canceled."));
    });

    xhr.addEventListener("load", () => {
      const headers = new Headers();
      const rawHeaders = xhr.getAllResponseHeaders().trim();

      if (rawHeaders) {
        rawHeaders.split(/\r?\n/).forEach((line) => {
          const separatorIndex = line.indexOf(":");
          if (separatorIndex === -1) {
            return;
          }

          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim();
          if (key) {
            headers.append(key, value);
          }
        });
      }

      resolve(
        new Response(xhr.responseText || "", {
          status: xhr.status,
          statusText: xhr.statusText,
          headers
        })
      );
    });

    xhr.send(formData);
  });
}

function generateQrCode(url) {
  if (!url || !qrCodeBoxEl) return;
  qrCodeBoxEl.innerHTML = "";

  if (typeof QRCode === "undefined") {
    return;
  }

  const canvas = document.createElement("canvas");
  QRCode.toCanvas(canvas, url, { width: 130, margin: 1, color: { dark: "#0d1b2a", light: "#ffffff" } }, (err) => {
    if (!err) {
      qrCodeBoxEl.appendChild(canvas);
    }
  });
}
