import { useState } from "react";
import { isStandalone, pushSupport } from "../push";
import { BellIcon, XIcon } from "./icons";

const DISMISS_KEY = "ios-install-prompt-dismissed";

export default function InstallPrompt() {
  const [visible, setVisible] = useState(() => {
    try {
      return pushSupport() === "ios-needs-install" && localStorage.getItem(DISMISS_KEY) !== "1";
    } catch {
      return false;
    }
  });

  if (!visible || isStandalone()) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-slate-700">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
        <BellIcon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900">Turn on notifications</p>
        <p className="mt-0.5">
          On iPhone or iPad, tap <span className="font-semibold">Share</span>, choose{" "}
          <span className="font-semibold">Add to Home Screen</span>, then open the app from there to
          enable notifications.
        </p>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
