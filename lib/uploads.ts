// Shared helpers for file uploads (transaction attachments, expense attachments,
// vehicle documents). Enforces a mime-type whitelist, a size cap, and writes
// files with collision-proof UUID filenames.
//
// SERVER-SIDE ONLY — uses node:fs and node:crypto.

import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

// Whitelisted mime types for uploaded documents (receipts, PDFs, photos).
// Keep this tight — any type not listed is rejected.
export const ALLOWED_MIME_TYPES = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/jpg',   // some clients use this
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// Mime → safe extension. Falls back to whatever the filename had if the mime
// is whitelisted but not mapped here.
const MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg':      '.jpg',
  'image/jpg':       '.jpg',
  'image/png':       '.png',
  'image/webp':      '.webp',
  'image/heic':      '.heic',
  'image/heif':      '.heif',
};

export type UploadError = { status: number; message: string };

/**
 * Validate an uploaded File. Returns null on success, or an UploadError
 * describing why the file was rejected (with the appropriate HTTP status).
 */
export function validateUpload(file: File | null): UploadError | null {
  if (!file)             return { status: 400, message: 'No file provided' };
  if (file.size === 0)   return { status: 400, message: 'File is empty' };
  if (file.size > MAX_UPLOAD_SIZE) {
    return { status: 413, message: 'File too large. Maximum size is 10 MB.' };
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return { status: 415, message: 'Unsupported file type. Allowed: PDF, JPG, PNG, WebP, HEIC.' };
  }
  return null;
}

/**
 * Persist an uploaded File under `public/uploads/{subdir}/{ownerId}/` using a
 * UUID filename. Returns the public-relative path to store in the database.
 */
export async function saveUpload(
  file: File,
  subdir: string,
  ownerId: string,
): Promise<{ relPath: string }> {
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', subdir, ownerId);
  fs.mkdirSync(uploadDir, { recursive: true });

  // Prefer the whitelisted extension derived from mime type; fall back to the
  // original filename's extension only if we trust it's sane.
  const extFromMime = MIME_EXT[file.type];
  const extFromName = path.extname(file.name).toLowerCase();
  const ext         = extFromMime || (/^\.[a-z0-9]{1,8}$/.test(extFromName) ? extFromName : '');

  const safeName = `${randomUUID()}${ext}`;
  const fullPath = path.join(uploadDir, safeName);
  fs.writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()));

  return { relPath: `/uploads/${subdir}/${ownerId}/${safeName}` };
}
