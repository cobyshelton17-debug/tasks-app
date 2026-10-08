import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, registerUser, resetDb } from "./helpers.js";

describe("auth", () => {
  beforeEach(resetDb);

  it("registers a new user and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "Alice@Example.com", name: "Alice", password: "password123" })
      .expect(201);

    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.name).toBe("Alice");
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects duplicate emails with 409", async () => {
    await registerUser({ email: "dup@example.com" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "dup@example.com", name: "Other", password: "password123" })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects short passwords with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "short@example.com", name: "Short", password: "abc" })
      .expect(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("logs in with correct credentials", async () => {
    const user = await registerUser({ email: "login@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "password123" })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.id).toBe(user.id);
  });

  it("rejects wrong password with 401 and a generic message", async () => {
    await registerUser({ email: "login@example.com" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@example.com", password: "wrongpassword" })
      .expect(401);
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  it("returns the current user for GET /api/auth/me", async () => {
    const user = await registerUser();
    const res = await request(app)
      .get("/api/auth/me")
      .set({ Authorization: `Bearer ${user.token}` })
      .expect(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it("rejects requests without a token", async () => {
    await request(app).get("/api/auth/me").expect(401);
  });

  it("rejects a garbage token", async () => {
    await request(app)
      .get("/api/auth/me")
      .set({ Authorization: "Bearer not-a-real-token" })
      .expect(401);
  });
});
