import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createList, registerUser, resetDb, type TestUser } from "./helpers.js";

describe("lists", () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
  });

  it("creates a list and returns the owner as OWNER member", async () => {
    const res = await request(app)
      .post("/api/lists")
      .set(auth(alice))
      .send({ name: "Groceries" })
      .expect(201);

    expect(res.body.name).toBe("Groceries");
    expect(res.body.myRole).toBe("OWNER");
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0].user.email).toBe("alice@example.com");
    expect(res.body.members[0].role).toBe("OWNER");
  });

  it("lists only the caller's lists", async () => {
    await createList(alice, "Alice only");

    const res = await request(app).get("/api/lists").set(auth(alice)).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Alice only");

    const bobRes = await request(app).get("/api/lists").set(auth(bob)).expect(200);
    expect(bobRes.body).toHaveLength(0);
  });

  it("denies non-members from reading a list", async () => {
    const list = await createList(alice);
    const res = await request(app)
      .get(`/api/lists/${list.id}`)
      .set(auth(bob))
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for a nonexistent list", async () => {
    await request(app).get("/api/lists/nonexistent-id").set(auth(alice)).expect(404);
  });

  it("only the owner can rename the list", async () => {
    const list = await createList(alice);

    await request(app)
      .patch(`/api/lists/${list.id}`)
      .set(auth(bob))
      .send({ name: "Hacked" })
      .expect(403);

    const res = await request(app)
      .patch(`/api/lists/${list.id}`)
      .set(auth(alice))
      .send({ name: "Renamed" })
      .expect(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("only the owner can delete the list", async () => {
    const list = await createList(alice);

    await request(app).delete(`/api/lists/${list.id}`).set(auth(bob)).expect(403);

    await request(app).delete(`/api/lists/${list.id}`).set(auth(alice)).expect(204);
    await request(app).get(`/api/lists/${list.id}`).set(auth(alice)).expect(404);
  });

  it("rejects empty list names", async () => {
    await request(app).post("/api/lists").set(auth(alice)).send({ name: "  " }).expect(400);
  });

  it("members can leave, owners cannot", async () => {
    const list = await createList(alice);

    await request(app)
      .post(`/api/lists/${list.id}/members/leave`)
      .set(auth(alice))
      .expect(403);

    await request(app)
      .post(`/api/lists/${list.id}/members/leave`)
      .set(auth(bob))
      .expect(403); // bob is not a member at all

    const invites = await request(app)
      .post(`/api/lists/${list.id}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);

    const pending = await request(app)
      .get("/api/invitations")
      .set(auth(bob))
      .expect(200);
    expect(pending.body).toHaveLength(1);

    await request(app)
      .post(`/api/invitations/${pending.body[0].id}/accept`)
      .set(auth(bob))
      .expect(200);

    await request(app)
      .post(`/api/lists/${list.id}/members/leave`)
      .set(auth(bob))
      .expect(204);

    const members = await request(app)
      .get(`/api/lists/${list.id}/members`)
      .set(auth(alice))
      .expect(200);
    expect(members.body).toHaveLength(1);
    expect(invites.body.status).toBe("PENDING");
  });

  it("owner can remove a member but not themselves", async () => {
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

    await request(app)
      .delete(`/api/lists/${list.id}/members/${alice.id}`)
      .set(auth(alice))
      .expect(400);

    await request(app)
      .delete(`/api/lists/${list.id}/members/${bob.id}`)
      .set(auth(alice))
      .expect(204);

    await request(app).get(`/api/lists/${list.id}`).set(auth(bob)).expect(403);
  });
});
