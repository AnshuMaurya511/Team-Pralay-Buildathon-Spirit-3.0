# RecoverX API integration

The repository now includes an Express + TypeScript backend under `/backend` and a typed frontend API client at `src/lib/api.ts`.

## Connected UI flows
- Register/login/logout use backend endpoints and an HTTP-only session cookie.
- My Cases loads authenticated case data from PostgreSQL.
- Create New Case submits the case to the API and uploads selected evidence after case creation.
- Case detail requests its case record from the API.
- Evidence Vault selects a user's case, lists evidence from the API, uploads via `multipart/form-data`, and supports authenticated downloads/deletion.
- Tasks & Reminders loads, creates, and updates tasks through the API.

## Run locally
Terminal 1:
```bash
docker compose up -d postgres
cd backend
cp .env.example .env
# Configure PostgreSQL DATABASE_URL and JWT_SECRET
npm install
npm run db:generate
npm run db:migrate
npm run dev
```
Terminal 2, from repository root:
```bash
cp .env.example .env
npm install
npm run dev
```

Frontend API base defaults to `http://localhost:4000/api`; override with `VITE_API_BASE_URL` in the frontend `.env`.

Google Drive is optional for local development. Configure `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_DRIVE_FOLDER_ID` in `backend/.env` to store evidence in a private Drive folder. Without those variables, uploads use private local development storage.

Upload limits are enforced in both the UI and server: JPG/JPEG/PNG up to 500 KiB; PDF up to 2 MiB.
