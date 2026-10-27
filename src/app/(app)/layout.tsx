import { Nav, type NavItem } from "@/components/nav";
import type { Role } from "@/db/schema";
import { requireViewer } from "@/server/auth/session";
import { signOutAction } from "../(auth)/login/actions";

// Every signed in page reads the session, so none of them can be prerendered.
export const dynamic = "force-dynamic";

const NAV: Record<Role, NavItem[]> = {
  director: [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/teams", label: "Teams" },
    { href: "/schedule", label: "Schedule" },
    { href: "/billing", label: "Billing" },
    { href: "/finance", label: "Finance" },
    { href: "/compliance", label: "Compliance" },
    { href: "/film", label: "Film" },
    { href: "/settings/integrations", label: "Integrations" },
  ],
  coach: [
    { href: "/teams", label: "Teams" },
    { href: "/schedule", label: "Schedule" },
    { href: "/compliance", label: "Compliance" },
    { href: "/film", label: "Film" },
  ],
  parent: [
    { href: "/family", label: "Home" },
    { href: "/schedule", label: "Schedule" },
    { href: "/film", label: "Film" },
  ],
  athlete: [
    { href: "/family", label: "Home" },
    { href: "/schedule", label: "Schedule" },
    { href: "/film", label: "Film" },
  ],
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <div className="min-h-screen md:flex">
      <aside className="flex flex-col gap-4 bg-ink px-4 py-4 text-white md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:py-6">
        <div className="px-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/50">Club OS</p>
          <p className="mt-1 text-sm font-semibold leading-snug">{viewer.club.name}</p>
        </div>
        <Nav items={NAV[viewer.role]} />
        <div className="mt-auto hidden border-t border-white/10 px-3 pt-4 md:block">
          <p className="text-sm font-medium">{viewer.user.name}</p>
          <p className="text-xs capitalize text-white/50">{viewer.role}</p>
          <form action={signOutAction}>
            <button type="submit" className="mt-2 text-xs text-white/70 underline hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <form action={signOutAction} className="mt-8 text-center md:hidden">
          <button type="submit" className="text-xs text-muted underline">
            Sign out {viewer.user.name}
          </button>
        </form>
      </main>
    </div>
  );
}
