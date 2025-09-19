import React from "react";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  title?: string;
  actions?: React.ReactNode;
};

export function Card({ className, title, actions, children, ...props }: Props) {
  return (
    <section
      className={[
        "border border-white/20 dark:border-white/10 bg-white/70 dark:bg-neutral-900/60 backdrop-blur rounded-xl p-5 shadow-lg ring-1 ring-black/5",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between">
          {title && (
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">{title}</h3>
          )}
          {actions}
        </div>
      )}
      <div className={title ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

