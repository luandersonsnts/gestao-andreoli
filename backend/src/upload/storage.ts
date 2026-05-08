import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import multer from "multer";
import { getEnv } from "../config/env.js";

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return "";
}

export async function ensureUploadDir() {
  const env = getEnv();
  await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
}

export function makeMulter() {
  const env = getEnv();
  const storage = multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
        cb(null, env.UPLOAD_DIR);
      } catch (e) {
        cb(e as any, env.UPLOAD_DIR);
      }
    },
    filename: (_req: Request, file, cb) => {
      const ext = extFromMime(file.mimetype) || path.extname(file.originalname);
      const name = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;
      cb(null, name);
    }
  });

  return multer({
    storage,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (!file.mimetype.startsWith("image/")) return cb(new Error("Arquivo deve ser uma imagem"));
      return cb(null, true);
    }
  });
}
