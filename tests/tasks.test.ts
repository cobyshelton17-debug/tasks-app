import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, auth, createList, registerUser, resetDb, type TestUser } from "./helpers.js";

describe("tasks", () => {
  let alice: TestUser;
  let bob: TestUser;
  let listId: string;

  beforeEach(async () => {
    await resetDb();
    alice = await registerUser({ email: "alice@example.com", name: "Alice" });
    bob = await registerUser({ email: "bob@example.com", name: "Bob" });
    const list = await createList(alice, "Tasks list");
    listId = list.id;
  });

  async function shareWithBob() {
    await request(app)
      .post(`/api/lists/${listId}/invitations`)
      .set(auth(alice))
      .send({ email: bob.email })
      .expect(201);
    const pending = await request(app).get("/api/invitations").set(auth(bob)).expect(200);
    await request(app)
      .post(`/api/invitations/${pending.body[0].id}/accept`)
      .set(auth(bob))
      .expect(200);
  }

  it("creates a task and assigns incrementing positions", async () => {
    const first = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "First" })
      .expect(201);
    expect(first.body.position).toBe(0);
    expect(first.body.status).toBe("TODO");

    const second = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "Second" })
      .expect(201);
    expect(second.body.position).toBe(1);
  });

  it("rejects an empty title", async () => {
    await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "   " })
      .expect(400);
  });

  it("non-members cannot create or read tasks", async () => {
    await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(bob))
      .send({ title: "Nope" })
      .expect(403);

    await request(app).get(`/api/lists/${listId}/tasks`).set(auth(bob)).expect(403);
  });

  it("an accepted collaborator can create, read, update and delete tasks", async () => {
    await shareWithBob();

    const created = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(bob))
      .send({ title: "Written by Bob", description: "hello" })
      .expect(201);

    const list = await request(app).get(`/api/lists/${listId}`).set(auth(alice)).expect(200);
    expect(list.body.tasks).toHaveLength(1);

    const updated = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .set(auth(alice))
      .send({ status: "DONE" })
      .expect(200);
    expect(updated.body.status).toBe("DONE");
    expect(updated.body.title).toBe("Written by Bob");

    await request(app)
      .delete(`/api/tasks/${created.body.id}`)
      .set(auth(bob))
      .expect(204);
  });

  it("non-members cannot modify tasks on someone else's list", async () => {
    const created = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "Private" })
      .expect(201);

    await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .set(auth(bob))
      .send({ title: "Hijacked" })
      .expect(403);

    await request(app).delete(`/api/tasks/${created.body.id}`).set(auth(bob)).expect(403);
  });

  it("assignee must be a member of the list", async () => {
    const res = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "Assigned", assigneeId: bob.id })
      .expect(400);
    expect(res.body.error.message).toMatch(/member/i);

    await shareWithBob();
    const ok = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "Assigned", assigneeId: bob.id })
      .expect(201);
    expect(ok.body.assignee.id).toBe(bob.id);
  });

  it("clears dueDate and assignee with null", async () => {
    await shareWithBob();
    const created = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({
        title: "With extras",
        dueDate: new Date().toISOString(),
        assigneeId: bob.id,
        status: "IN_PROGRESS",
      })
      .expect(201);
    expect(created.body.dueDate).not.toBeNull();

    const cleared = await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .set(auth(bob))
      .send({ dueDate: null, assigneeId: null })
      .expect(200);
    expect(cleared.body.dueDate).toBeNull();
    expect(cleared.body.assignee).toBeNull();
  });

  it("rejects an update with no fields", async () => {
    const created = await request(app)
      .post(`/api/lists/${listId}/tasks`)
      .set(auth(alice))
      .send({ title: "Task" })
      .expect(201);

    await request(app)
      .patch(`/api/tasks/${created.body.id}`)
      .set(auth(alice))
      .send({})
      .expect(400);
  });

  it("returns 404 for a nonexistent task", async () => {
    await request(app).patch("/api/tasks/nope").set(auth(alice)).send({ title: "x" }).expect(404);
    await request(app).delete("/api/tasks/nope").set(auth(alice)).expect(404);
  });
});
