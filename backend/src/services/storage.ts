import { google } from "googleapis";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const uploadDir = path.resolve(process.cwd(), "uploads");
function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"]
  });
  return google.drive({ version: "v3", auth });
}
export function storageProvider() {
  return process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "google-drive" : "local-dev";
}
export async function saveEvidence(buffer: Buffer, name: string, mimeType: string) {
  const drive = driveClient();
  if (drive) {
    const result = await drive.files.create({
      requestBody: {
        name: `${Date.now()}-${name.replace(/[^\w.\- ]/g, "_")}`,
        mimeType,
        ...(process.env.GOOGLE_DRIVE_FOLDER_ID ? { parents: [process.env.GOOGLE_DRIVE_FOLDER_ID] } : {})
      },
      media: { mimeType, body: Readable.from([buffer]) },
      fields: "id,name,mimeType,size"
    });
    if (!result.data.id) throw new Error("Google Drive did not return a file ID.");
    return { provider: "google-drive", key: result.data.id };
  }
  await fs.mkdir(uploadDir, { recursive: true });
  const key = `${crypto.randomUUID()}-${name.replace(/[^\w.\-]/g, "_")}`;
  await fs.writeFile(path.join(uploadDir, key), buffer, { flag: "wx", mode: 0o600 });
  return { provider: "local-dev", key };
}
export async function readEvidence(provider: string, key: string) {
  if (provider === "google-drive") {
    const drive = driveClient();
    if (!drive) throw new Error("Google Drive credentials are not configured.");
    const result = await drive.files.get({ fileId: key, alt: "media" }, { responseType: "arraybuffer" });
    return Buffer.from(result.data as ArrayBuffer);
  }
  if (provider === "local-dev") return fs.readFile(path.join(uploadDir, path.basename(key)));
  throw new Error("Unsupported evidence storage provider.");
}
export async function deleteEvidence(provider: string, key: string) {
  if (provider === "google-drive") {
    const drive = driveClient();
    if (!drive) throw new Error("Google Drive credentials are not configured.");
    await drive.files.delete({ fileId: key });
    return;
  }
  if (provider === "local-dev") await fs.rm(path.join(uploadDir, path.basename(key)), { force: true });
}
