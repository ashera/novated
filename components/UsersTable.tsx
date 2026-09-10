"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/au/format";
import FlagWithBasis from "@/components/FlagWithBasis";
import type { AdminUserRow } from "@/lib/adminUsers";

export default function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? users.filter((u) => u.email.toLowerCase().includes(query)) : users),
    [users, query],
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email…"
          className="w-full max-w-sm rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent"
        />
        {query && (
          <span className="text-xs text-muted">
            {filtered.length} of {users.length}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3 text-right">Plans</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-line/60 transition hover:bg-panel-2/40">
                <td className="px-4 py-2.5">
                  <Link href={`/admin/users/${u.id}`} className="font-medium text-ink hover:text-accent">
                    {u.email}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  {u.is_admin ? (
                    <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">Admin</span>
                  ) : (
                    <span className="text-muted">User</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  {u.suspended ? (
                    <span className="rounded-full bg-danger-subtle px-2 py-0.5 text-xs font-semibold text-danger-text">Suspended</span>
                  ) : (
                    <span className="text-xs text-success-text">Active</span>
                  )}
                </td>
                <td className="px-4 py-2.5"><FlagWithBasis kind="user" id={u.id} code={u.country} /></td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{u.plan_count}</td>
                <td className="px-4 py-2.5 text-muted">{fmtDateTime(u.last_login_at)}</td>
                <td className="px-4 py-2.5 text-muted">{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No users match &ldquo;{q}&rdquo;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
