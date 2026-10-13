import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createList, registerUser, resetDb, type TestUser } from "./helpers.js";

async function inviteAndAccept(owner: TestUser, invitee: TestUser, listId: string) {
  await request(app)
    .post(`/api/lists/${listId}/invitations`)
    .set(auth(owner))
    .send({ email: invitee.email })
    .expect(201);
  const pending = await request(app).get("/api/invitations").set(auth(invitee)).expect(200);
  await request(app)
    .post(`/api/invitations/${pending.body[0].id}/accept`)
    .set(auth(invitee))
    .expect(200);
}

async function createTask(user: TestUser, listId: string, title: string) {
  const res = await request(app)
    .post(`/api/lists/${listId}/tasks`)
    .set(auth(user))
    .send({ title })
    .expect(201);
  return res.body as { id: string; title: string; position: number };
}

describe("reordering lists", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
  });

  it("persists a per-user list order", async () => {
    const a = await createList(alice, "A");
    const b = await createList(alice, "B");
    const c = await createList(alice, "C");

    await request(app)
      .patch("/api/lists/reorder")
      .set(auth(alice))
      .send({ order: [c.id, a.id, b.id] })
      .expect(204);

    const res = await request(app).get("/api/lists").set(auth(alice)).expect(200);
    expect(res.body.map((l: { name: string }) => l.name)).toEqual(["C", "A", "B"]);
  });

  it("keeps each member's order independent", async () => {
    const a = await createList(alice, "A");
    const b = await createList(alice, "B");
    await inviteAndAccept(alice, bob, a.id);
    await inviteAndAccept(alice, bob, b.id);

    await request(app)
      .patch("/api/lists/reorder")
      .set(auth(alice))
      .send({ order: [b.id, a.id] })
      .expect(204);

    const aliceLists = await request(app).get("/api/lists").set(auth(alice)).expect(200);
    expect(aliceLists.body.map((l: { name: string }) => l.name)).toEqual(["B", "A"]);

    const bobLists = await request(app).get("/api/lists").set(auth(bob)).expect(200);
    expect(bobLists.body.map((l: { name: string }) => l.name)).toEqual(["A", "B"]);
  });

  it("rejects an order that is not exactly the caller's lists", async () => {
    const a = await createList(alice, "A");
    await createList(alice, "B");

    await request(app)
      .patch("/api/lists/reorder")
      .set(auth(alice))
      .send({ order: [a.id] })
      .expect(400);
  });
});

describe("reordering tasks", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
  });

  it("rewrites task positions", async () => {
    const list = await createList(alice);
    const t1 = await createTask(alice, list.id, "One");
    const t2 = await createTask(alice, list.id, "Two");
    const t3 = await createTask(alice, list.id, "Three");

    await request(app)
      .patch(`/api/lists/${list.id}/tasks/reorder`)
      .set(auth(alice))
      .send({ order: [t3.id, t1.id, t2.id] })
      .expect(204);

    const res = await request(app).get(`/api/lists/${list.id}`).set(auth(alice)).expect(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(["Three", "One", "Two"]);
    expect(res.body.tasks.map((t: { position: number }) => t.position)).toEqual([0, 1, 2]);
  });

  it("lets any member reorder but denies non-members", async () => {
    const list = await createList(alice);
    const t1 = await createTask(alice, list.id, "One");
    const t2 = await createTask(alice, list.id, "Two");

    await request(app)
      .patch(`/api/lists/${list.id}/tasks/reorder`)
      .set(auth(bob))
      .send({ order: [t2.id, t1.id] })
      .expect(403);

    await inviteAndAccept(alice, bob, list.id);

    await request(app)
      .patch(`/api/lists/${list.id}/tasks/reorder`)
      .set(auth(bob))
      .send({ order: [t2.id, t1.id] })
      .expect(204);
  });

  it("rejects an order that is missing tasks", async () => {
    const list = await createList(alice);
    const t1 = await createTask(alice, list.id, "One");
    await createTask(alice, list.id, "Two");

    await request(app)
      .patch(`/api/lists/${list.id}/tasks/reorder`)
      .set(auth(alice))
      .send({ order: [t1.id] })
      .expect(400);
  });
});
