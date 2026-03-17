# Ortx Transfer App

A simple SwissTransfer/WeTransfer-style app where users can:

- Upload any file format
- Generate a shareable download link
- Choose a custom expiration date/time

## Tech Stack

- Node.js + Express
- Multer for file uploads
- Vanilla HTML/CSS/JS frontend
- Local JSON storage for link metadata

## Project Structure

- `server.js` API + static server
- `public/` frontend
- `uploads/` stored uploaded files (created automatically)
- `data/links.json` link metadata with expiration details
- `android/` Android WebView wrapper app

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start server:

```bash
npm start
```

3. Open in browser:

```text
http://localhost:3000
```

## Android APK

The `android/` directory contains a native Android WebView wrapper that connects to a running Ortx Transfer server.

### Download a Pre-built APK

Pre-built APKs are attached to every [GitHub Release](../../releases). You can also download the latest debug build from the [Actions tab](../../actions/workflows/build-apk.yml) as a workflow artifact.

### Build the APK yourself

**Prerequisites:** Android Studio or the Android SDK + JDK 17 + Gradle 8.6.

```bash
# From the android/ directory
cd android
gradle assembleDebug
# APK will be at: android/app/build/outputs/apk/debug/app-debug.apk
```

Or trigger the **Build Android APK** GitHub Actions workflow manually from the Actions tab — the resulting APK will be uploaded as a workflow artifact.

### Install on Android

1. Copy the APK to your Android device.
2. Enable **Install from unknown sources** in Settings → Security (or Settings → Apps → Special app access).
3. Open the APK file to install.
4. On first launch, enter the URL of your running Ortx Transfer server (e.g. `http://192.168.1.10:3000`).

## API Endpoints

- `POST /api/upload` multipart form:
  - `file`: uploaded file
  - `expiresAt`: ISO datetime
- `GET /api/link/:token` metadata for a share link
- `GET /f/:token` download route for the uploaded file

## Notes

- Expired links are deleted automatically every minute.
- Expired links are also cleaned up when accessed.
- This is local-storage based; for production, use object storage (S3/R2/GCS) and a real database.
