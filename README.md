# RecoverX

Responsive React + TypeScript + Vite frontend with an Express + TypeScript API backend.

## Frontend
Requires Node.js 20+.
```bash
npm install
npm run dev
```

## Backend
Requires Node.js 20+ and PostgreSQL.
```bash
docker compose up -d postgres
cd backend
cp .env.example .env
# Set DATABASE_URL and JWT_SECRET in backend/.env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```
Backend health endpoint: `http://localhost:4000/api/health`.

Set the frontend API URL in root `.env` if needed:
`VITE_API_BASE_URL=http://localhost:4000/api`

## Evidence storage
Evidence upload limits are enforced in UI and API:
- JPG/JPEG/PNG: maximum 500 KiB per file
- PDF: maximum 2 MiB per file

Without Google Drive credentials, local development files are stored under `backend/uploads` and served only through authenticated API endpoints. To use Google Drive, configure `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_DRIVE_FOLDER_ID` in `backend/.env`. Keep the destination private.

See `backend/README.md` and `API_INTEGRATION.md` for setup and endpoints. This is a development implementation; complete production security review, malware scanning, backups, retention and deployment hardening before storing real sensitive evidence.
