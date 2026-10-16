export type User = { id: string; email: string; name: string };
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type MemberRole = "OWNER" | "EDITOR";

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  position: number;
  dueDate: string | null;
  createdBy?: User;
  assignee?: User | null;
};

export type ListMember = {
  user: User;
  role: MemberRole;
  createdAt: string;
};

export type TaskList = {
  id: string;
  name: string;
  myRole: MemberRole;
  owner: User;
  members: ListMember[];
  tasks: Task[];
  _count: { tasks: number };
  createdAt: string;
};

export type Invitation = {
  id: string;
  inviteeEmail?: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REVOKED";
  list: { id: string; name: string };
  inviter: User;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4100/api";

function token(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && t && !path.startsWith("/auth/")) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.assign("/login");
    }
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

export const api = {
  register: (body: { email: string; name: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  lists: () => request<TaskList[]>("/lists"),

  createList: (name: string) =>
    request<TaskList>("/lists", { method: "POST", body: JSON.stringify({ name }) }),

  getList: (id: string) => request<TaskList>(`/lists/${id}`),

  renameList: (id: string, name: string) =>
    request<TaskList>(`/lists/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),

  deleteList: (id: string) => request<void>(`/lists/${id}`, { method: "DELETE" }),

  reorderLists: (order: string[]) =>
    request<void>("/lists/reorder", { method: "PATCH", body: JSON.stringify({ order }) }),

  leaveList: (id: string) => request<void>(`/lists/${id}/members/leave`, { method: "POST" }),

  removeMember: (listId: string, userId: string) =>
    request<void>(`/lists/${listId}/members/${userId}`, { method: "DELETE" }),

  invite: (listId: string, email: string) =>
    request<Invitation>(`/lists/${listId}/invitations`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  listInvitations: (listId: string) => request<Invitation[]>(`/lists/${listId}/invitations`),

  revokeInvitation: (listId: string, invitationId: string) =>
    request<void>(`/lists/${listId}/invitations/${invitationId}`, { method: "DELETE" }),

  myInvitations: () => request<Invitation[]>("/invitations"),

  acceptInvitation: (id: string) =>
    request<Invitation>(`/invitations/${id}/accept`, { method: "POST" }),

  declineInvitation: (id: string) =>
    request<Invitation>(`/invitations/${id}/decline`, { method: "POST" }),

  createTask: (
    listId: string,
    body: { title: string; description?: string; assigneeId?: string | null },
  ) =>
    request<Task>(`/lists/${listId}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTask: (
    taskId: string,
    body: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      dueDate?: string | null;
      assigneeId?: string | null;
    },
  ) => request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteTask: (taskId: string) => request<void>(`/tasks/${taskId}`, { method: "DELETE" }),

  reorderTasks: (listId: string, order: string[]) =>
    request<void>(`/lists/${listId}/tasks/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),

  pushPublicKey: () => request<{ publicKey: string }>("/push/public-key"),

  subscribePush: (subscription: PushSubscriptionJSON) =>
    request<{ ok: boolean }>("/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    }),

  unsubscribePush: (endpoint: string) =>
    request<void>("/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint }),
    }),
};
