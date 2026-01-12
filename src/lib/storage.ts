import { put, del, list } from "@vercel/blob";
import { logger } from "@/lib/logger";

const READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!READ_WRITE_TOKEN) {
  logger.warn(
    "[storage] BLOB_READ_WRITE_TOKEN is not set. Blob operations will fail at runtime."
  );
}

export interface UploadResult {
  url: string;
  pathname: string;
  downloadUrl: string;
  size: number;
  type: string;
}

export async function uploadAttachmentBlob(
  srId: string,
  file: File
): Promise<UploadResult> {
  const safeName = file.name.replace(/\s+/g, "-");
  const timestamp = Date.now();
  const pathname = `attachments/${srId}/${timestamp}-${safeName}`;

  const blob = await put(pathname, file, {
    access: "public",
    token: READ_WRITE_TOKEN,
  });

  return {
    url: blob.url,
    pathname: blob.pathname,
    downloadUrl: blob.downloadUrl ?? blob.url,
    size: file.size,
    type: file.type,
  };
}

export async function deleteAttachmentBlob(pathname: string) {
  if (!pathname) return;

  await del(pathname, {
    token: READ_WRITE_TOKEN,
  });
}

export async function listAttachmentBlobs(
  prefix: string
): Promise<Awaited<ReturnType<typeof list>> | null> {
  if (!prefix) return null;

  return list({
    prefix,
    token: READ_WRITE_TOKEN,
  });
}

