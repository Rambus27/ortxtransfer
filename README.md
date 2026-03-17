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
