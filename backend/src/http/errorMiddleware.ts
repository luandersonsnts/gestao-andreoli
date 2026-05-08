import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "./errors.js";

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Dados inválidos",
      issues: err.issues
    });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      message: err.message,
      details: err.details ?? null
    });
  }

  return res.status(500).json({ message: "Erro interno" });
}
