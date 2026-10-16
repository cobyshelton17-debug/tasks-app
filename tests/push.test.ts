import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, auth, registerUser, resetDb, type TestUser } from "./helpers.js";
import { prisma } from "../src/db.js";

vi.mock("web-push", () => {
  const sendNotification = vi.fn().mockResolvedValue({ statusCode: 201 });
  const setVapidDetails = vi.fn();
  return {
    default: { sendNotification, setVapidDetails },
    sendNotification,
    setVapidDetails,
    __esModule: true,
  };
});

describe("push subscriptions", () => {
  let alice: TestUser;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
  });

  it("serves the VAPID public key to authenticated users", async () => {
    const res = await request(app).get("/api/push/public-key").set(auth(alice)).expect(200);
    expect(res.body.publicKey).toBe("test-public-key");
  });

  it("requires auth for the public key", async () => {
    await request(app).get("/api/push/public-key").expect(401);
  });

  it("stores a subscription", async () => {
    await request(app)
      .post("/api/push/subscribe")
      .set(auth(alice))
      .send({ endpoint: "https://push.example.com/alice", keys: { p256dh: "p", auth: "a" } })
      .expect(201);

    const saved = await prisma.pushSubscription.findMany({ where: { userId: alice.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.endpoint).toBe("https://push.example.com/alice");
  });

  it("reassigns a subscription endpoint to the current user on re-subscribe", async () => {
    await request(app)
      .post("/api/push/subscribe")
      .set(auth(alice))
      .send({ endpoint: "https://push.example.com/shared", keys: { p256dh: "p1", auth: "a1" } })
      .expect(201);

    const bob = await registerUser({ email: "bob@example.com", name: "Bob" });
    await request(app)
      .post("/api/push/subscribe")
      .set(auth(bob))
      .send({ endpoint: "https://push.example.com/shared", keys: { p256dh: "p2", auth: "a2" } })
      .expect(201);

    const rows = await prisma.pushSubscription.findMany({
      where: { endpoint: "https://push.example.com/shared" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(bob.id);
    expect(rows[0]?.p256dh).toBe("p2");
  });

  it("removes a subscription on unsubscribe", async () => {
    await request(app)
      .post("/api/push/subscribe")
      .set(auth(alice))
      .send({ endpoint: "https://push.example.com/alice", keys: { p256dh: "p", auth: "a" } })
      .expect(201);

    await request(app)
      .post("/api/push/unsubscribe")
      .set(auth(alice))
      .send({ endpoint: "https://push.example.com/alice" })
      .expect(204);

    expect(await prisma.pushSubscription.count()).toBe(0);
  });

  it("rejects an invalid subscription payload", async () => {
    await request(app)
      .post("/api/push/subscribe")
      .set(auth(alice))
      .send({ endpoint: "not-a-url", keys: {} })
      .expect(400);
  });
});
