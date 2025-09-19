import { useTheme } from "../providers/ThemeProvider";

export function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="inline-flex items-center gap-2 rounded-md border border-neutral-300 dark:border-neutral-700 px-3 py-1.5 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      {dark ? "🌙 Dark" : "🌤️ Light"}
    </button>
  );
}

