import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createList, registerUser, resetDb, type TestUser } from "./helpers.js";

describe("invitations", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
  });

  async function invitePending(target: TestUser, email: string) {
    const list = await createList(target, "Shared");
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(target))
      .send({ email })
      .expect(201);
    const pending = await request(app).get("/api/invitations").set(auth(target)).expect(200);
    return { list, invitation: pending.body[0] as { id: string; status: string } };
  }

  it("only the owner can invite", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(bob))
      .send({ email: "charlie@example.com" })
      .expect(403);
  });

  it("creates a pending invitation", async () => {
    const list = await createList(alice);
    const res = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    expect(res.body.status).toBe("PENDING");
    expect(res.body.inviteeEmail).toBe(bob.email);
    expect(res.body.list.name).toBe("My List");
  });

  it("rejects duplicate pending invitations", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);
    const res = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("rejects inviting an existing member", async () => {
    const { list } = await invitePending(alice, bob.email);
    await request(app)
      .post(`/api/invitations/${(await request(app).get("/api/invitations").set(auth(bob)).expect(200)).body[0].id}/accept`)
      .set(auth(bob))
      .expect(200);

    const res = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(409);
    expect(res.body.error.message).toMatch(/already a member/i);
  });

  it("rejects inviting yourself", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: alice.email })
      .expect(400);
  });

  it("only the invitee can see and accept the invitation", async () => {
    const list = await createList(alice);
    const created = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: "target@example.com" })
      .expect(201);

    // a different user cannot accept it
    await registerUser({ email: "target@example.com" });
    const otherPending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    expect(otherPending.body).toHaveLength(0);

    const invitee = await request(app)
      .post(`/api/auth/register`)
      .send({ email: "target2@example.com", name: "Target", password: "password123" })
      .expect(201);

    // invitation was for target@example.com, not target2 — should 404
    await request(app)
      .post(`/api/invitations/${created.body.id}/accept`)
      .set({ Authorization: `Bearer ${invitee.body.token}` })
      .expect(404);
  });

  it("accepting an invitation shares the list with both users", async () => {
    const list = await createList(alice, "Trip planning");

    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    const pending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    expect(pending.body).toHaveLength(1);
    expect(pending.body[0].list.name).toBe("Trip planning");
    expect(pending.body[0].inviter.name).toBe("Alice");

    await request(app)
      .post(`/api/invitations/${pending.body[0].id}/accept`)
      .set(auth(bob))
      .expect(200);

    const bobLists = await request(app).get("/api/lists").set(auth(bob)).expect(200);
    expect(bobLists.body).toHaveLength(1);
    expect(bobLists.body[0].id).toBe(list.id);
    expect(bobLists.body[0].myRole).toBe("EDITOR");

    const aliceLists = await request(app).get("/api/lists").set(auth(alice)).expect(200);
    expect(aliceLists.body).toHaveLength(1);

    const members = await request(app)
      .get(`/api/lists/${list.id}/members`)
      .set(auth(bob))
      .expect(200);
    expect(members.body.map((m: { email: string }) => m.email).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
  });

  it("an invited user cannot access the list before accepting", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    await request(app).get(`/api/lists/${list.id}`).set(auth(bob)).expect(403);
    await request(app)
      .post(`/api/lists/${list.id}/tasks`)
      .set(auth(bob))
      .send({ title: "Sneaky task" })
      .expect(403);
  });

  it("declining an invitation does not share the list", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    const pending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    await request(app)
      .post(`/api/invitations/${pending.body[0].id}/decline`)
      .set(auth(bob))
      .expect(200);

    await request(app).get(`/api/lists/${list.id}`).set(auth(bob)).expect(403);

    const again = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    expect(again.body).toHaveLength(0);
  });

  it("an already accepted invitation cannot be accepted twice", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);
    const pending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);

    await request(app)
      .post(`/api/invitations/${pending.body[0].id}/accept`)
      .set(auth(bob))
      .expect(200);

    // second accept: invitation no longer visible to invitee lookup as PENDING?
    // it is still addressed to bob, but no longer pending
    const res = await request(app)
      .post(`/api/invitations/${pending.body[0].id}/accept`)
      .set(auth(bob))
      .expect(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("owner can revoke a pending invitation", async () => {
    const list = await createList(alice);
    const created = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    await request(app)
      .delete(`/api/lists/${list.id}/invitations/${created.body.id}`)
      .set(auth(alice))
      .expect(204);

    const pending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    expect(pending.body).toHaveLength(0);

    const res = await request(app)
      .post(`/api/invitations/${created.body.id}/accept`)
      .set(auth(bob))
      .expect(409);
    expect(res.body.error.message).toMatch(/no longer pending/i);
  });

  it("only pending invites for my email are listed", async () => {
    const list = await createList(alice);
    await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: "someone-else@example.com" })
      .expect(201);

    const mine = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    expect(mine.body).toHaveLength(0);
  });
});
