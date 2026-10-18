import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "./db.js";
import { clearSessionCookie, requireAuth, setSessionCookie } from "./middleware/auth.js";
import { deleteEvidence, readEvidence, saveEvidence, storageProvider } from "./services/storage.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const imageMax = 500 * 1024;
const pdfMax = 2 * 1024 * 1024;
app.disable("x-powered-by");
app.use(helmet());
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));
// Reject cross-origin browser mutations. This complements, but does not replace, auth and authorization.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin && !allowedOrigins.includes(origin)) return res.status(403).json({ error: "Origin is not allowed." });
  }
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.get("/api/health", (_req, res) => res.json({ status: "ok", service: "recoverx-api", storage: storageProvider() }));

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128)
});
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Please check your name, email and password (at least 8 characters)." });
    const email = parsed.data.email.toLowerCase();
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return res.status(409).json({ error: "An account with this email already exists." });
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.user.create({ data: { name: parsed.data.name, email, passwordHash }, select: { id: true, name: true, email: true } });
    setSessionCookie(res, user.id);
    res.status(201).json({ user });
  } catch (e) { next(e); }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const parsed = z.object({ email: z.string().email(), password: z.string().min(1).max(128) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });
    const userRecord = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
    if (!userRecord || !(await bcrypt.compare(parsed.data.password, userRecord.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
    setSessionCookie(res, userRecord.id);
    res.json({ user: { id: userRecord.id, name: userRecord.name, email: userRecord.email } });
  } catch (e) { next(e); }
});
app.post("/api/auth/logout", (_req, res) => { clearSessionCookie(res); res.status(204).end(); });
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

const caseSchema = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(5000),
  incidentDate: z.string().optional().nullable(),
  mode: z.string().max(80).optional().nullable(),
  platform: z.string().max(120).optional().nullable(),
  amount: z.coerce.number().min(0).max(1_000_000_000).default(0),
  priority: z.enum(["High", "Medium", "Low"]).default("High")
});
function caseDto(c: any) {
  return { ...c, amount: Number(c.amount), date: c.incidentDate ? new Date(c.incidentDate).toISOString().slice(0, 10) : null };
}
app.get("/api/cases", requireAuth, async (req, res, next) => {
  try {
    const cases = await prisma.fraudCase.findMany({ where: { userId: req.user!.id }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { evidence: true, timeline: true, tasks: true } } } });
    res.json({ cases: cases.map(caseDto) });
  } catch (e) { next(e); }
});
app.post("/api/cases", requireAuth, async (req, res, next) => {
  try {
    const parsed = caseSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Please check all required case fields." });
    const d = parsed.data;
    const reference = `RX-${new Date().getFullYear()}-${cryptoRandom()}`;
    const created = await prisma.fraudCase.create({
      data: {
        reference, title: d.title, type: d.type, description: d.description,
        incidentDate: d.incidentDate ? new Date(d.incidentDate) : null,
        mode: d.mode || null, platform: d.platform || null, amount: d.amount, priority: d.priority,
        userId: req.user!.id,
        timeline: { create: { title: "Case created", detail: "Case registered in RecoverX." } }
      }
    });
    res.status(201).json({ case: caseDto(created) });
  } catch (e) { next(e); }
});
app.get("/api/cases/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, include: { evidence: { orderBy: { createdAt: "desc" } }, timeline: { orderBy: { eventAt: "desc" } }, tasks: { orderBy: { createdAt: "desc" } } } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    res.json({ case: caseDto(c) });
  } catch (e) { next(e); }
});
app.patch("/api/cases/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = caseSchema.partial().extend({ status: z.enum(["In Progress", "Evidence Pending", "Under Review", "Completed"]).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid case update." });
    const existing = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: "Case not found." });
    const data: any = { ...parsed.data };
    if (data.incidentDate !== undefined) data.incidentDate = data.incidentDate ? new Date(data.incidentDate) : null;
    const updated = await prisma.fraudCase.update({ where: { id: existing.id }, data });
    if (parsed.data.status) await prisma.timelineEvent.create({ data: { caseId: existing.id, title: "Status changed", detail: `Case status updated to ${parsed.data.status}.` } });
    res.json({ case: caseDto(updated) });
  } catch (e) { next(e); }
});
app.delete("/api/cases/:id", requireAuth, async (req, res, next) => {
  try {
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    const files = await prisma.evidence.findMany({ where: { caseId: c.id } });
    for (const f of files) { try { await deleteEvidence(f.storageProvider, f.storageKey); } catch (err) { console.error("Evidence cleanup failed", f.id, err); } }
    await prisma.fraudCase.delete({ where: { id: c.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});
app.get("/api/cases/:id/timeline", requireAuth, async (req, res, next) => {
  try {
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    res.json({ events: await prisma.timelineEvent.findMany({ where: { caseId: c.id }, orderBy: { eventAt: "desc" } }) });
  } catch (e) { next(e); }
});
app.post("/api/cases/:id/timeline", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(2).max(160), detail: z.string().trim().max(2000).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a timeline title." });
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    const event = await prisma.timelineEvent.create({ data: { caseId: c.id, ...parsed.data } });
    res.status(201).json({ event });
  } catch (e) { next(e); }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: pdfMax, files: 10 } });
app.get("/api/cases/:id/evidence", requireAuth, async (req, res, next) => {
  try {
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    const files = await prisma.evidence.findMany({ where: { caseId: c.id }, orderBy: { createdAt: "desc" } });
    res.json({ evidence: files.map(f => ({ id: f.id, caseId: f.caseId, name: f.originalName, mimeType: f.mimeType, sizeBytes: f.sizeBytes, createdAt: f.createdAt, downloadUrl: `/evidence/${f.id}/download` })) });
  } catch (e) { next(e); }
});
app.post("/api/cases/:id/evidence", requireAuth, upload.array("files", 10), async (req, res, next) => {
  try {
    const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: req.params.id }, { reference: req.params.id }], userId: req.user!.id }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Case not found." });
    const files = (req.files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: "Choose at least one file." });
    const validated: Array<{ file: Express.Multer.File; mime: string }> = [];
    for (const file of files) {
      const ext = file.originalname.split(".").pop()?.toLowerCase();
      const detected = await fileTypeFromBuffer(file.buffer);
      const isImage = ["jpg", "jpeg", "png"].includes(ext || "") && ["image/jpeg", "image/png"].includes(detected?.mime || "") && file.mimetype === detected?.mime;
      const isPdf = ext === "pdf" && detected?.mime === "application/pdf" && file.mimetype === "application/pdf";
      if (!isImage && !isPdf) return res.status(415).json({ error: `${file.originalname}: only valid JPG, JPEG, PNG and PDF files are allowed.` });
      if (isImage && file.size > imageMax) return res.status(413).json({ error: `${file.originalname}: images must be 500 KB or smaller.` });
      if (isPdf && file.size > pdfMax) return res.status(413).json({ error: `${file.originalname}: PDFs must be 2 MB or smaller.` });
      validated.push({ file, mime: detected!.mime });
    }
    const created = [];
    for (const { file, mime } of validated) {
      const stored = await saveEvidence(file.buffer, file.originalname, mime);
      const record = await prisma.evidence.create({ data: { caseId: c.id, originalName: file.originalname, mimeType: mime, sizeBytes: file.size, storageProvider: stored.provider, storageKey: stored.key } });
      await prisma.timelineEvent.create({ data: { caseId: c.id, title: "Evidence uploaded", detail: `${file.originalname} added to the evidence vault.` } });
      created.push({ id: record.id, caseId: record.caseId, name: record.originalName, mimeType: record.mimeType, sizeBytes: record.sizeBytes, createdAt: record.createdAt, downloadUrl: `/evidence/${record.id}/download` });
    }
    res.status(201).json({ evidence: created, storage: storageProvider() });
  } catch (e) { next(e); }
});
app.get("/api/evidence/:id/download", requireAuth, async (req, res, next) => {
  try {
    const f = await prisma.evidence.findFirst({ where: { id: req.params.id, case: { userId: req.user!.id } } });
    if (!f) return res.status(404).json({ error: "Evidence file not found." });
    const buffer = await readEvidence(f.storageProvider, f.storageKey);
    res.setHeader("Content-Type", f.mimeType);
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(f.originalName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(buffer);
  } catch (e) { next(e); }
});
app.delete("/api/evidence/:id", requireAuth, async (req, res, next) => {
  try {
    const f = await prisma.evidence.findFirst({ where: { id: req.params.id, case: { userId: req.user!.id } } });
    if (!f) return res.status(404).json({ error: "Evidence file not found." });
    await deleteEvidence(f.storageProvider, f.storageKey);
    await prisma.evidence.delete({ where: { id: f.id } });
    await prisma.timelineEvent.create({ data: { caseId: f.caseId, title: "Evidence removed", detail: `${f.originalName} removed from the evidence vault.` } });
    res.status(204).end();
  } catch (e) { next(e); }
});

app.get("/api/tasks", requireAuth, async (req, res, next) => {
  try { res.json({ tasks: await prisma.task.findMany({ where: { userId: req.user!.id }, include: { case: { select: { id: true, reference: true, title: true } } }, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }] }) }); }
  catch (e) { next(e); }
});
app.post("/api/tasks", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(2).max(160), description: z.string().max(2000).optional(), dueDate: z.string().optional().nullable(), status: z.enum(["Pending", "Completed", "Overdue"]).default("Pending"), priority: z.enum(["High", "Medium", "Low"]).default("Medium"), caseId: z.string().optional().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Please check the task details." });
    if (parsed.data.caseId) {
      const c = await prisma.fraudCase.findFirst({ where: { OR: [{ id: parsed.data.caseId }, { reference: parsed.data.caseId }], userId: req.user!.id }, select: { id: true } });
      if (!c) return res.status(404).json({ error: "Case not found." });
      parsed.data.caseId = c.id;
    }
    const task = await prisma.task.create({ data: { ...parsed.data, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null, userId: req.user!.id } });
    res.status(201).json({ task });
  } catch (e) { next(e); }
});
app.patch("/api/tasks/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ title: z.string().trim().min(2).max(160).optional(), status: z.enum(["Pending", "Completed", "Overdue"]).optional(), priority: z.enum(["High", "Medium", "Low"]).optional(), dueDate: z.string().nullable().optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid task update." });
    const found = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user!.id }, select: { id: true } });
    if (!found) return res.status(404).json({ error: "Task not found." });
    const data: any = { ...parsed.data };
    if (data.dueDate !== undefined) data.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    res.json({ task: await prisma.task.update({ where: { id: found.id }, data }) });
  } catch (e) { next(e); }
});
app.post("/api/support/tickets", requireAuth, async (req, res, next) => {
  try {
    const parsed = z.object({ subject: z.string().trim().min(3).max(160), email: z.string().email().max(254).optional(), message: z.string().trim().min(10).max(5000) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Enter a subject and a message of at least 10 characters." });
    const ticket = await prisma.supportTicket.create({ data: { ...parsed.data, userId: req.user!.id } });
    res.status(201).json({ ticket });
  } catch (e) { next(e); }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === "LIMIT_FILE_SIZE" ? "Upload exceeds the 2 MB maximum request size. Images are limited to 500 KB and PDFs to 2 MB." : "Invalid upload request.";
    return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});
// Vercel imports this Express app as a serverless function. Local development starts a listener.
export default app;
if (!process.env.VERCEL) {
  app.listen(port, () => console.log(`RecoverX API listening on http://localhost:${port}`));
}
function cryptoRandom() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
