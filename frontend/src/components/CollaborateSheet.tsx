import { useEffect, useState, type FormEvent } from "react";
import { api, type Invitation, type TaskList } from "../api";
import { useAuth } from "../auth";
import Sheet, { SheetButton } from "./Sheet";
import { UsersIcon, XIcon } from "./icons";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

type Props = {
  list: TaskList;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
};

export default function CollaborateSheet({ list, open, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const isOwner = list.myRole === "OWNER";

  const [email, setEmail] = useState("");
  const [pending, setPending] = useState<Invitation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !isOwner) return;
    setMessage(null);
    setError(null);
    api
      .listInvitations(list.id)
      .then((invites) => setPending(invites.filter((i) => i.status === "PENDING")))
      .catch(() => setPending([]));
  }, [open, isOwner, list.id]);

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const invite = await api.invite(list.id, email.trim().toLowerCase());
      setPending((prev) => [invite, ...prev]);
      setMessage(`Invite sent to ${invite.inviteeEmail}`);
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(invitationId: string) {
    try {
      await api.revokeInvitation(list.id, invitationId);
      setPending((prev) => prev.filter((i) => i.id !== invitationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke invite");
    }
  }

  async function removeMember(userId: string) {
    try {
      await api.removeMember(list.id, userId);
      setConfirmRemoveId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove member");
    }
  }

  async function leave() {
    try {
      await api.leaveList(list.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave list");
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Collaborate">
      <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
        <UsersIcon className="h-4 w-4" />
        Members
      </div>

      <ul className="mb-5 space-y-2">
        {list.members.map(({ user: member, role }) => (
          <li
            key={member.id}
            className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
              {initials(member.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {member.name}
                {member.id === user?.id && <span className="text-slate-400"> (you)</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">{member.email}</span>
            </span>
            {role === "OWNER" && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                Owner
              </span>
            )}
            {isOwner && role !== "OWNER" && (
              confirmRemoveId === member.id ? (
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600"
                >
                  Sure?
                </button>
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${member.name}`}
                  onClick={() => setConfirmRemoveId(member.id)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              )
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <>
          <form onSubmit={sendInvite} className="mb-3 flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Invite by email"
              required
              className="h-12 min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-slate-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="h-12 shrink-0 rounded-2xl bg-slate-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Invite
            </button>
          </form>

          {message && <p className="mb-3 text-sm text-green-600">{message}</p>}

          {pending.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-sm font-medium text-slate-500">Pending invites</div>
              <ul className="space-y-2">
                {pending.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50 px-3 py-2.5"
                  >
                    <span className="truncate text-sm text-amber-900">
                      {invite.inviteeEmail}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(invite.id)}
                      className="shrink-0 text-xs font-semibold text-amber-700 underline"
                    >
                      Revoke
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!isOwner && <SheetButton onClick={leave} variant="danger">Leave list</SheetButton>}
      <SheetButton onClick={onClose} variant="muted">
        Close
      </SheetButton>
    </Sheet>
  );
}
