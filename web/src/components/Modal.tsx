import React from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Modal({ open, onClose, title, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/20 dark:border-white/10 bg-white/95 dark:bg-neutral-900/90 backdrop-blur p-5 shadow-xl">
        {title && (
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h2>
        )}
        <div className={title ? "mt-3" : undefined}>{children}</div>
      </div>
    </div>
  );
}

