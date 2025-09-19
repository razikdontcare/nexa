type Tab = { id: string; label: string; badge?: string };

export function NavTabs({ tabs, active, onChange }: { tabs: Tab[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-md text-sm ${
            active === t.id
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
          }`}
        >
          {t.label}
          {t.badge && (
            <span className="ml-1 text-xs px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
              {t.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

