# RecoverX API

Node.js + Express + TypeScript REST API with PostgreSQL/Prisma, HTTP-only session cookie auth, and evidence storage. Google Drive is used when service-account credentials are configured; otherwise development files are stored privately in `backend/uploads`.

## Requirements
- Node.js 20+
- PostgreSQL 14+
- Google Cloud service account + Drive API enabled (optional for local development)

## Setup
```bash
cp .env.example .env
# Set DATABASE_URL, DIRECT_URL and a random JWT_SECRET (32+ characters) in .env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```
API health: `GET http://localhost:4000/api/health`

For Neon/serverless deployment, use the pooled URL for `DATABASE_URL` and the direct/unpooled URL for `DIRECT_URL`.

## Google Drive setup
1. Enable Google Drive API in a Google Cloud project.
2. Create a service account and grant it access to a dedicated private folder or Shared Drive.
3. Put the service-account JSON object into `GOOGLE_SERVICE_ACCOUNT_JSON` as a single-line JSON string (never commit it).
4. Set `GOOGLE_DRIVE_FOLDER_ID` to the private destination folder ID.
5. Restart the API. Health endpoint reports `google-drive` as the storage provider.
Keep the destination private; the API does not make uploaded evidence public.

## Main endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET/POST /api/cases`, `GET/PATCH/DELETE /api/cases/:id`
- `GET/POST /api/cases/:id/timeline`
- `GET/POST /api/cases/:id/evidence`
- `GET/DELETE /api/evidence/:id`, `GET /api/evidence/:id/download`
- `GET/POST /api/tasks`, `PATCH /api/tasks/:id`
- `POST /api/support/tickets`

## Upload policy
- JPG/JPEG/PNG: max 500 KiB (512,000 bytes) per file.
- PDF: max 2 MiB (2,097,152 bytes) per file.
- Uploads are validated by detected file signature and declared MIME type. Only case owners can access, download, or delete evidence.
- Upload API expects `multipart/form-data` with one or more `files` fields.

## Important
Local storage is for development only. For production, use HTTPS, a strong secret manager, a dedicated Google Workspace/Shared Drive policy, backups, monitoring, malware scanning, retention controls, and privacy/legal review. Review the Google Drive account's permissions and data residency needs before storing sensitive evidence.
