import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

export const app = createApp();

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE "Task", "Invitation", "ListMember", "TaskList", "User" RESTART IDENTITY CASCADE`,
  );
}

export interface TestUser {
  id: string;
  email: string;
  name: string;
  password: string;
  token: string;
}

let userCounter = 0;

export async function registerUser(overrides: Partial<{ email: string; name: string; password: string }> = {}): Promise<TestUser> {
  userCounter += 1;
  const email = overrides.email ?? `user${userCounter}-${Date.now()}@example.com`;
  const name = overrides.name ?? `User ${userCounter}`;
  const password = overrides.password ?? "password123";

  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, name, password })
    .expect(201);

  return { ...res.body.user, password, token: res.body.token as string };
}

export function auth(user: TestUser) {
  return { Authorization: `Bearer ${user.token}` };
}

export async function createList(user: TestUser, name = "My List") {
  const res = await request(app)
    .post("/api/lists")
    .set(auth(user))
    .send({ name })
    .expect(201);
  return res.body as { id: string; name: string };
}
