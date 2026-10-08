import { type TaskList } from "../api";
import { DotsIcon, PlusIcon } from "./icons";

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
  onOpen: () => void;
  onMenu: () => void;
};

export default function ListCard({ list, onOpen, onMenu }: Props) {
  const preview = list.tasks.slice(0, 4);
  const remaining = list.tasks.length - preview.length;
  const done = list.tasks.filter((t) => t.status === "DONE").length;
  const shared = list.members.length > 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-transform active:scale-[0.99]"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-slate-900">{list.name}</h2>
            {shared && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                Shared
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {list.tasks.length === 0
              ? "No tasks yet"
              : `${done} of ${list.tasks.length} done`}
          </p>
        </div>

        {shared && (
          <div className="flex -space-x-2">
            {list.members.slice(0, 3).map(({ user }) => (
              <span
                key={user.id}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-800 text-[10px] font-bold text-white"
              >
                {initials(user.name)}
              </span>
            ))}
          </div>
        )}

        <button
          type="button"
          aria-label={`Options for ${list.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onMenu();
          }}
          className="-mr-1 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <DotsIcon className="h-5 w-5" />
        </button>
      </div>

      {preview.length > 0 ? (
        <ul className="space-y-1.5">
          {preview.map((task) => {
            const isDone = task.status === "DONE";
            return (
              <li key={task.id} className="flex items-center gap-2.5">
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${
                    isDone
                      ? "border-green-500 bg-green-500 text-white"
                      : task.status === "IN_PROGRESS"
                        ? "border-amber-400 bg-amber-100"
                        : "border-slate-300"
                  }`}
                >
                  {isDone && (
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
                <span
                  className={`truncate text-sm ${
                    isDone ? "text-slate-400 line-through" : "text-slate-700"
                  }`}
                >
                  {task.title}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-400">
          <PlusIcon className="h-4 w-4" />
          Add your first task
        </div>
      )}

      {remaining > 0 && (
        <p className="mt-2 pl-[28px] text-xs font-medium text-slate-400">
          +{remaining} more
        </p>
      )}
    </div>
  );
}
