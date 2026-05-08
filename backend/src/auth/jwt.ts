import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";

export type JwtPayload = {
  sub: string;
  email: string;
};

export function signAccessToken(payload: JwtPayload): string {
  const env = getEnv();
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "12h" });
}

export function verifyAccessToken(token: string): JwtPayload {
  const env = getEnv();
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Token inválido");
  }
  const sub = (decoded as any).sub;
  const email = (decoded as any).email;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Token inválido");
  }
  return { sub, email };
}
