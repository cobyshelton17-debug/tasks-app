import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import request from "supertest";
import { app, auth, createList, registerUser, resetDb, type TestUser } from "./helpers.js";
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

const sendNotification = vi.mocked(webpush.sendNotification);

let endpointCounter = 0;

async function subscribe(user: TestUser) {
  endpointCounter += 1;
  const endpoint = `https://push.example.com/${user.id}/${endpointCounter}`;
  await request(app)
    .post("/api/push/subscribe")
    .set(auth(user))
    .send({ endpoint, keys: { p256dh: `p-${user.id}`, auth: `a-${user.id}` } })
    .expect(201);
  return endpoint;
}

async function addMember(owner: TestUser, member: TestUser, listId: string) {
  await request(app)
    .post(`/api/lists/${listId}/invitations`)
    .set(auth(owner))
    .send({ email: member.email })
    .expect(201);
  const pending = await request(app).get("/api/invitations").set(auth(member)).expect(200);
  await request(app)
    .post(`/api/invitations/${pending.body[0].id}/accept`)
    .set(auth(member))
    .expect(200);
}

function payloadOf(call: number) {
  const body = sendNotification.mock.calls[call]?.[1];
  return typeof body === "string" ? JSON.parse(body) : body;
}

describe("push notifications", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    sendNotification.mockClear();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
  });

  it("notifies a registered invitee immediately", async () => {
    const list = await createList(alice, "Trip planning");
    const endpoint = await subscribe(bob);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0]?.[0]).toMatchObject({ endpoint });
    expect(payloadOf(0).title).toContain("Alice");
  });

  it("notifies other members of list activity", async () => {
    const list = await createList(alice, "Shared");
    await subscribe(bob);
    await addMember(alice, bob, list.id);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "Buy milk" })
      .expect(201);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(payloadOf(0).listId).toBe(list.id);
  });

  it("throttles repeated activity into a single notification per list", async () => {
    const list = await createList(alice, "Shared");
    await subscribe(bob);
    await addMember(alice, bob, list.id);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "First" })
      .expect(201);
    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "Second" })
      .expect(201);

    expect(sendNotification).toHaveBeenCalledTimes(1);
    const throttleRows = await prisma.notificationThrottle.findMany({
      where: { listId: list.id, userId: bob.id },
    });
    expect(throttleRows).toHaveLength(1);
  });

  it("re-notifies once the throttle window has elapsed", async () => {
    const list = await createList(alice, "Shared");
    await subscribe(bob);
    await addMember(alice, bob, list.id);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "First" })
      .expect(201);
    expect(sendNotification).toHaveBeenCalledTimes(1);

    await prisma.notificationThrottle.updateMany({
      where: { listId: list.id, userId: bob.id },
      data: { lastNotifiedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "Second" })
      .expect(201);
    expect(sendNotification).toHaveBeenCalledTimes(2);
  });

  it("does not notify the acting user", async () => {
    const list = await createList(alice, "Shared");
    await subscribe(alice);
    await addMember(alice, bob, list.id);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "Mine" })
      .expect(201);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("skips members who have no push subscription", async () => {
    const list = await createList(alice, "Shared");
    await addMember(alice, bob, list.id);
    sendNotification.mockClear();

    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(alice))
      .send({ title: "Nobody listening" })
      .expect(201);

    expect(sendNotification).not.toHaveBeenCalled();
    expect(await prisma.notificationThrottle.count()).toBe(0);
  });
});
