import Link from "next/link";

type Tab =
  | "review"
  | "parameters"
  | "sources"
  | "tests"
  | "users"
  | "releases"
  | "feedback"
  | "infoblasts";

export default function AdminTabs({
  active,
  staleCount = 0,
  feedbackCount = 0,
}: {
  active: Tab;
  staleCount?: number;
  feedbackCount?: number;
}) {
  const tab = (href: string, key: Tab, label: string, badge: number) => {
    const isActive = active === key;
    return (
      <Link
        href={href}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition ${
          isActive
            ? "bg-accent font-semibold text-white"
            : "font-medium text-muted hover:text-ink"
        }`}
      >
        {label}
        {badge > 0 && (
          <span
            className={`rounded-full px-1.5 text-xs ${
              isActive ? "bg-white/25 text-white" : "bg-danger text-white"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    );
  };

  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm">
      {/* Reference data & operations */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel-2 p-1">
        {tab("/admin/review", "review", "Review", 0)}
        {tab("/admin", "parameters", "Parameters", 0)}
        {tab("/admin/sources", "sources", "Sources", staleCount)}
        {tab("/admin/tests", "tests", "Tests", 0)}
        {tab("/admin/users", "users", "Users", 0)}
        {tab("/admin/releases", "releases", "Releases", 0)}
      </div>

      {/* Talking to users */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-panel-2 p-1">
        <span className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          Comms
        </span>
        {tab("/admin/infoblasts", "infoblasts", "InfoBlasts", 0)}
        {tab("/admin/feedback", "feedback", "Feedback", feedbackCount)}
      </div>
    </nav>
  );
}
