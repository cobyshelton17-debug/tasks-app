import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, type Task, type TaskList } from "../api";
import CollaborateSheet from "../components/CollaborateSheet";
import Sheet, { SheetButton } from "../components/Sheet";
import { BackIcon, CheckIcon, DotsIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon, XIcon } from "../components/icons";

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [list, setList] = useState<TaskList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [busy, setBusy] = useState(false);

  const [actionsOpen, setActionsOpen] = useState(false);
  const [collabOpen, setCollabOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const skipBlurSave = useRef(false);
  const addFormRef = useRef<HTMLFormElement>(null);
  const renameFormRef = useRef<HTMLFormElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.getList(id);
      setList(data);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
        navigate("/", { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load list");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editingId, draft]);

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTask.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      await api.createTask(id!, { title });
      setNewTask("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add task");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task: Task) {
    const status = task.status === "DONE" ? "TODO" : "DONE";
    setList((prev) =>
      prev
        ? { ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) }
        : prev,
    );
    try {
      await api.updateTask(task.id, { status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task");
      refresh();
    }
  }

  async function removeTask(taskId: string) {
    setList((prev) =>
      prev ? { ...prev, tasks: prev.tasks.filter((t) => t.id !== taskId) } : prev,
    );
    try {
      await api.deleteTask(taskId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete task");
      refresh();
    }
  }

  function startEdit(task: Task) {
    skipBlurSave.current = false;
    setEditingId(task.id);
    setDraft(task.title);
  }

  function cancelEdit() {
    skipBlurSave.current = true;
    setEditingId(null);
    setDraft("");
  }

  async function saveTitle(task: Task) {
    if (skipBlurSave.current) {
      skipBlurSave.current = false;
      return;
    }
    const title = draft.trim();
    setEditingId(null);
    if (!title || title === task.title) return;
    setList((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, title } : t)) } : prev,
    );
    try {
      await api.updateTask(task.id, { title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update task");
      refresh();
    }
  }

  async function submitRename(e: FormEvent) {
    e.preventDefault();
    if (!list || busy) return;
    const name = renameName.trim();
    if (!name || name === list.name) {
      setRenameOpen(false);
      return;
    }
    setBusy(true);
    try {
      await api.renameList(list.id, name);
      setRenameOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename list");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!list) return;
    try {
      await api.deleteList(list.id);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete list");
      setDeleteOpen(false);
    }
  }

  if (loading && !list) {
    return (
      <div className="flex min-h-full items-center justify-center bg-slate-100">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center">
        <p className="text-sm text-slate-600">{error ?? "List not found"}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded-2xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Back to lists
        </button>
      </div>
    );
  }

  const done = list.tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-lg items-center gap-1 px-2">
          <button
            type="button"
            aria-label="Back"
            onClick={() => navigate("/")}
            className="rounded-full p-2.5 text-slate-300 hover:bg-white/10"
          >
            <BackIcon />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold tracking-tight">{list.name}</h1>
            <p className="text-[11px] text-slate-400">
              {list.tasks.length === 0
                ? "No tasks"
                : `${done} of ${list.tasks.length} done`}
              {list.members.length > 1 ? ` · shared with ${list.members.length} people` : ""}
            </p>
          </div>
          <button
            type="button"
            aria-label="List options"
            onClick={() => setActionsOpen(true)}
            className="rounded-full p-2.5 text-slate-300 hover:bg-white/10"
          >
            <DotsIcon />
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-4 pb-28">
        {error && (
          <div className="mb-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {list.tasks.length === 0 ? (
          <div className="mt-12 text-center text-sm text-slate-500">
            Add your first task below.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.tasks.map((task) => {
              const isDone = task.status === "DONE";
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm"
                >
                  <button
                    type="button"
                    aria-label={isDone ? "Mark as not done" : "Mark as done"}
                    onClick={() => toggleTask(task)}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      isDone
                        ? "border-green-500 bg-green-500 text-white"
                        : task.status === "IN_PROGRESS"
                          ? "border-amber-400 bg-amber-100 text-amber-600"
                          : "border-slate-300 text-transparent"
                    }`}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                  {editingId === task.id ? (
                    <textarea
                      ref={editRef}
                      autoFocus
                      rows={1}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => saveTitle(task)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          saveTitle(task);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelEdit();
                        }
                      }}
                      maxLength={500}
                      className="min-w-0 flex-1 resize-none overflow-hidden rounded-xl border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 outline-none focus:border-slate-400"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => startEdit(task)}
                      className={`min-w-0 flex-1 whitespace-normal break-words text-left text-sm ${
                        isDone ? "text-slate-400 line-through" : "text-slate-800"
                      }`}
                    >
                      {task.title}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${task.title}`}
                    onClick={() => removeTask(task.id)}
                    className="-mt-1 rounded-full p-2 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-lg px-4 pt-3">
          <form ref={addFormRef} onSubmit={addTask} className="flex gap-2 pb-3">
            <input
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="Add a task"
              maxLength={500}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-slate-400 focus:bg-white"
            />
            <button
              type="submit"
              aria-label="Add task"
              disabled={busy || !newTask.trim()}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white disabled:opacity-40"
            >
              <PlusIcon />
            </button>
          </form>
        </div>
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>

      <Sheet open={actionsOpen} onClose={() => setActionsOpen(false)} title={list.name}>
        <SheetButton
          onClick={() => {
            setActionsOpen(false);
            setRenameName(list.name);
            setRenameOpen(true);
          }}
        >
          <PencilIcon className="h-5 w-5" />
          Rename list
        </SheetButton>
        <SheetButton
          onClick={() => {
            setActionsOpen(false);
            setCollabOpen(true);
          }}
        >
          <UsersIcon className="h-5 w-5" />
          Collaborate
        </SheetButton>
        {list.myRole === "OWNER" && (
          <SheetButton
            variant="danger"
            onClick={() => {
              setActionsOpen(false);
              setDeleteOpen(true);
            }}
          >
            <TrashIcon className="h-5 w-5" />
            Delete list
          </SheetButton>
        )}
        <SheetButton variant="muted" onClick={() => setActionsOpen(false)}>
          <XIcon className="h-5 w-5" />
          Cancel
        </SheetButton>
      </Sheet>

      <Sheet open={renameOpen} onClose={() => setRenameOpen(false)} title="Rename list">
        <form ref={renameFormRef} onSubmit={submitRename}>
          <input
            autoFocus
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            placeholder="List name"
            maxLength={120}
            required
            className="mb-3 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-slate-400 focus:bg-white"
          />
          <SheetButton
            onClick={() => renameFormRef.current?.requestSubmit()}
            disabled={!renameName.trim() || busy}
          >
            Save
          </SheetButton>
          <SheetButton variant="muted" onClick={() => setRenameOpen(false)}>
            Cancel
          </SheetButton>
        </form>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete list?">
        <p className="mb-4 text-sm text-slate-600">
          “{list.name}” and all of its tasks will be permanently removed for everyone.
        </p>
        <SheetButton variant="danger" onClick={confirmDelete}>
          Delete
        </SheetButton>
        <SheetButton variant="muted" onClick={() => setDeleteOpen(false)}>
          Cancel
        </SheetButton>
      </Sheet>

      <CollaborateSheet
        list={list}
        open={collabOpen}
        onClose={() => setCollabOpen(false)}
        onChanged={refresh}
      />
    </div>
  );
}
