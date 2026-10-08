import { useEffect, type ReactNode } from "react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
};

export default function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        className="absolute inset-0 h-full w-full cursor-default bg-black/40 animate-fade"
        onClick={onClose}
      />
      <div className="animate-sheet relative w-full max-w-lg rounded-t-3xl bg-white px-5 pb-6 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300" />
        {title && <h2 className="mb-4 text-lg font-semibold text-slate-900">{title}</h2>}
        <div className="[&>button]:w-full">{children}</div>
        <div style={{ height: "env(safe-area-inset-bottom)" }} />
      </div>
    </div>
  );
}

export function SheetButton({
  onClick,
  children,
  variant = "default",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  variant?: "default" | "danger" | "muted";
  disabled?: boolean;
}) {
  const styles = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    danger: "bg-red-600 text-white hover:bg-red-500",
    muted: "bg-slate-100 text-slate-700 hover:bg-slate-200",
  }[variant];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mb-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-base font-medium transition-colors disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}
