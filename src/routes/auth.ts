import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db.js";
import { conflict, unauthorized } from "../lib/errors.js";
import { signToken } from "../lib/jwt.js";
import { assertAuth, requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const authRouter = Router();

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(254)
  .email("Invalid email address");

const registerSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1, "Name is required").max(100),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

const publicUser = (user: { id: string; email: string; name: string }) => ({
  id: user.id,
  email: user.email,
  name: user.name,
});

authRouter.post(
  "/register",
  validateBody(registerSchema),
  async (req, res, next) => {
    try {
      const { email, name, password } = req.body as z.infer<typeof registerSchema>;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw conflict("An account with this email already exists");

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({ data: { email, name, passwordHash } });

      const token = signToken(user);
      res.status(201).json({ token, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const user = await prisma.user.findUnique({ where: { email } });
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) throw unauthorized("Invalid email or password");

    const token = signToken(user);
    res.status(200).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({ user: publicUser(assertAuth(req)) });
});
