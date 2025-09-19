import React from "react";

type Variant = "primary" | "outline" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  const base = "rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes: Record<Size, string> = {
    sm: "px-2.5 py-1.5 text-sm",
    md: "px-3.5 py-2",
    lg: "px-4.5 py-2.5 text-lg",
  };
  const variants: Record<Variant, string> = {
    primary: "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900",
    outline:
      "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
    subtle: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };
  const cls = [base, sizes[size], variants[variant], className].filter(Boolean).join(" ");
  return <button className={cls} {...props} />;
}
