import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Invitation, type TaskList } from "../api";
import { useAuth } from "../auth";
import CollaborateSheet from "../components/CollaborateSheet";
import ListCard from "../components/ListCard";
import Sheet, { SheetButton } from "../components/Sheet";
import { ListIcon, LogoutIcon, PlusIcon, TrashIcon, UsersIcon, XIcon } from "../components/icons";

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [lists, setLists] = useState<TaskList[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newListOpen, setNewListOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const newListFormRef = useRef<HTMLFormElement>(null);
  const [actionsFor, setActionsFor] = useState<TaskList | null>(null);
  const [collabWith, setCollabWith] = useState<TaskList | null>(null);
  const [deleteFor, setDeleteFor] = useState<TaskList | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [listData, inviteData] = await Promise.all([api.lists(), api.myInvitations()]);
      setLists(listData);
      setInvitations(inviteData);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load your lists");
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function createList(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const list = await api.createList(name);
      setLists((prev) => [list, ...prev]);
      setNewName("");
      setNewListOpen(false);
      navigate(`/lists/${list.id}`);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not create list");
    }
  }

  async function confirmDelete() {
    if (!deleteFor) return;
    try {
      await api.deleteList(deleteFor.id);
      setLists((prev) => prev.filter((l) => l.id !== deleteFor.id));
      setDeleteFor(null);
      setActionsFor(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not delete list");
    }
  }

  async function respond(id: string, action: "accept" | "decline") {
    try {
      if (action === "accept") await api.acceptInvitation(id);
      else await api.declineInvitation(id);
      await refresh();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not respond to invite");
    }
  }

  return (
    <div className="min-h-full pb-12">
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
              <ListIcon className="h-4.5 w-4.5" />
            </span>
            <h1 className="text-lg font-bold tracking-tight">Tasks</h1>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Log out"
              onClick={() => {
                logout();
                navigate("/login", { replace: true });
              }}
              className="rounded-full p-2.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogoutIcon />
            </button>
            <button
              type="button"
              aria-label="New list"
              onClick={() => setNewListOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-900 shadow active:scale-95"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        {loadError && (
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <span className="truncate">{loadError}</span>
            <button type="button" onClick={() => refresh()} className="shrink-0 font-semibold underline">
              Retry
            </button>
          </div>
        )}

        {invitations.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Invitations
            </h2>
            {invitations.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center gap-3 rounded-3xl border border-indigo-100 bg-indigo-50 p-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">
                    <span className="font-semibold">{invite.inviter.name}</span> invited you to
                  </p>
                  <p className="truncate text-sm font-bold text-slate-900">{invite.list.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => respond(invite.id, "accept")}
                  className="h-9 shrink-0 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => respond(invite.id, "decline")}
                  className="h-9 shrink-0 rounded-full bg-white px-3 text-sm font-semibold text-slate-600 shadow-sm"
                >
                  Decline
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-3xl bg-slate-200" />
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="mt-16 flex flex-col items-center text-center">
              <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-200 text-slate-500">
                <PlusIcon className="h-8 w-8" />
              </span>
              <h2 className="text-lg font-bold text-slate-900">No lists yet</h2>
              <p className="mt-1 max-w-xs text-sm text-slate-500">
                Tap the <span className="font-semibold text-slate-700">+</span> in the top right
                to create your first task list.
              </p>
            </div>
          ) : (
            lists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                onOpen={() => navigate(`/lists/${list.id}`)}
                onMenu={() => setActionsFor(list)}
              />
            ))
          )}
        </section>
      </main>

      <Sheet open={newListOpen} onClose={() => setNewListOpen(false)} title="New list">
        <form
          ref={newListFormRef}
          onSubmit={(e) => {
            e.preventDefault();
            createList(e);
          }}
        >
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="List name"
            maxLength={120}
            required
            className="mb-3 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-slate-400 focus:bg-white"
          />
          <SheetButton onClick={() => newListFormRef.current?.requestSubmit()} disabled={!newName.trim()}>
            Create list
          </SheetButton>
          <SheetButton variant="muted" onClick={() => setNewListOpen(false)}>
            Cancel
          </SheetButton>
        </form>
      </Sheet>

      <Sheet
        open={actionsFor !== null}
        onClose={() => setActionsFor(null)}
        title={actionsFor?.name}
      >
        <SheetButton
          onClick={() => {
            setCollabWith(actionsFor);
            setActionsFor(null);
          }}
        >
          <UsersIcon className="h-5 w-5" />
          Collaborate
        </SheetButton>
        {actionsFor?.myRole === "OWNER" ? (
          <SheetButton
            variant="danger"
            onClick={() => {
              setDeleteFor(actionsFor);
              setActionsFor(null);
            }}
          >
            <TrashIcon className="h-5 w-5" />
            Delete list
          </SheetButton>
        ) : null}
        <SheetButton variant="muted" onClick={() => setActionsFor(null)}>
          <XIcon className="h-5 w-5" />
          Cancel
        </SheetButton>
      </Sheet>

      <Sheet open={deleteFor !== null} onClose={() => setDeleteFor(null)} title="Delete list?">
        <p className="mb-4 text-sm text-slate-600">
          “{deleteFor?.name}” and all of its tasks will be permanently removed for everyone.
        </p>
        <SheetButton variant="danger" onClick={confirmDelete}>
          Delete
        </SheetButton>
        <SheetButton variant="muted" onClick={() => setDeleteFor(null)}>
          Cancel
        </SheetButton>
      </Sheet>

      {collabWith && (
        <CollaborateSheet
          list={lists.find((l) => l.id === collabWith.id) ?? collabWith}
          open={collabWith !== null}
          onClose={() => setCollabWith(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}
