import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "../config.js";

export function signToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as SignOptions["expiresIn"],
  });
}
