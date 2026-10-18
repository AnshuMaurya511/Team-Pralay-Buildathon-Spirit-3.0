# RecoverX deployment — Vercel + Neon + Google Drive

This repository is configured for **two Vercel projects from one GitHub repository**:
- Frontend project root: repository root (`.`), Vite build output `dist`.
- API project root: `backend`, Express app detected from `src/server.ts`.
- PostgreSQL: Neon. Runtime uses `DATABASE_URL`; Prisma migrations use `DIRECT_URL`.
- Evidence: private Google Drive folder/Shared Drive. Never commit service-account credentials.

## Important: deployment is not live yet
You must connect the GitHub repo and provide your own Neon and Google Cloud credentials. Do not commit `.env` files or service-account JSON.

## 1. Push the project to GitHub
Create a private repository, extract this project, then from the project root:

```bash
git init
git add .
git commit -m "Prepare RecoverX deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

If this directory is already a Git repository, do not run `git init`; just commit and push the changes.

## 2. Create Neon database
1. Create a Neon project and database.
2. Copy the **pooled** connection string into `DATABASE_URL`.
3. Copy the **direct/unpooled** connection string into `DIRECT_URL`.
4. Keep both private. Use SSL-enabled connection strings. Do not paste credentials into chat.

## 3. Deploy API to Vercel
1. In Vercel choose **Add New → Project**, import the same GitHub repo.
2. Set **Root Directory** to `backend` and enable including files outside the root if Vercel asks (the backend is self-contained, so normally not needed).
3. Deploy after setting these Environment Variables in Project Settings → Environment Variables (Production and Preview as appropriate):
   - `DATABASE_URL` = Neon pooled URL
   - `DIRECT_URL` = Neon direct URL
   - `JWT_SECRET` = a unique random secret of 32+ characters (generate locally, e.g. `openssl rand -base64 48`)
   - `FRONTEND_ORIGIN` = the frontend Vercel URL (add it after frontend's first deploy; temporarily use your preview URL only for Preview)
   - `NODE_ENV` = `production`
   - `GOOGLE_SERVICE_ACCOUNT_JSON` = service-account JSON as one-line JSON string
   - `GOOGLE_DRIVE_FOLDER_ID` = private Drive folder ID
4. In Google Cloud, enable Drive API, create a service account, and share the destination folder with its service-account email as Editor. If using a Shared Drive, ensure the account has the required role. Keep folder private.
5. In the API Vercel project Settings → Environment Variables, set `FRONTEND_ORIGIN` to the final frontend origin and redeploy.
6. Run database migrations from your computer against Neon using the direct URL:

```bash
cd backend
npm install
# put the production DIRECT_URL and DATABASE_URL in backend/.env temporarily (never commit it)
npm run db:deploy
```

Then remove the local `.env` when finished. The migration is included at `backend/prisma/migrations/20261019000000_init`.

## 4. Deploy frontend to Vercel
1. Add another Vercel project from the same GitHub repository.
2. Set **Root Directory** to the repository root (`.`).
3. Framework: Vite; Build Command: `npm run build`; Output Directory: `dist`.
4. Deploy once to obtain the frontend URL.
5. Edit root `vercel.json`: replace `REPLACE_WITH_BACKEND_DEPLOYMENT.vercel.app` with the actual API deployment hostname (no trailing slash), commit and push. Example destination: `https://recoverx-api-yourteam.vercel.app/api/:path*`.
6. Redeploy the frontend. API requests now go through the same-origin `/api` proxy, allowing the HTTP-only session cookie to work without third-party-cookie dependence.
7. Set `FRONTEND_ORIGIN` in the API project's Production environment to the exact frontend origin, e.g. `https://recoverx-yourteam.vercel.app`, then redeploy the API.

## 5. Verify after deployment
Open `https://YOUR-API-URL/api/health`; expected JSON contains `status: "ok"` and `storage: "google-drive"`.
Then test in the frontend:
1. Register a fresh account.
2. Log out and log in again.
3. Create a fraud case; verify it appears under My Cases after refresh.
4. Upload a valid PNG/JPEG up to 500 KiB and a PDF up to 2 MiB.
5. Verify download works, then delete evidence and confirm it disappears.
6. Try an oversized image and PDF; both must be rejected with a clear message.
7. Confirm another user cannot access the first user's case or evidence.

## Current deployment notes
- `vercel.json` at the repository root has a placeholder API hostname until the API project has its first URL. Replace it before expecting production API calls to work.
- The Vercel API project uses Express serverless handling; it does not run a persistent server listener in Vercel.
- Local fallback uploads are ephemeral on serverless hosts. Configure Google Drive before testing evidence persistence in production.
- API endpoint `GET /api/health` should be checked after each deployment.
- Do not report deployment as complete until live health, auth, case CRUD, and Drive upload/download checks pass.
