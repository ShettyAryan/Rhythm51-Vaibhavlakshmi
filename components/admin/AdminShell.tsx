"use client";

import {
  BookOpen,
  Building2,
  Compass,
  ExternalLink,
  Eye,
  Images,
  LayoutDashboard,
  LayoutPanelTop,
  LogOut,
  Menu,
  Rocket,
  Settings,
  Trees,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./client";
import { ToastProvider } from "./ui";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/settings", label: "Landing & Settings", icon: Settings },
  { href: "/admin/media", label: "Media Library", icon: Images },
  { href: "/admin/tours/rooms", label: "Rooms", icon: Compass },
  { href: "/admin/tours/amenities", label: "Amenities", icon: Trees },
  { href: "/admin/floor-plans", label: "Floor Plans", icon: LayoutPanelTop },
  { href: "/admin/documents", label: "Documents", icon: BookOpen },
  { href: "/admin/publish", label: "Preview & Publish", icon: Rocket },
];

export function AdminShell({ children, user, project }: { children: React.ReactNode; user: { email: string; name: string }; project: { name: string; status: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Admin">
      <div className="border-b border-gold/25 px-5 py-5">
        <p className="eyebrow text-gold">Tour Studio</p>
        <p className="mt-1 truncate font-display text-2xl text-ivory" title={project.name}>{project.name || "Untitled project"}</p>
        <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-ivory/50">{project.status === "published" ? "Site online" : "Site offline"}</p>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3" role="list">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 text-sm transition ${active ? "bg-ivory/12 text-gold-soft" : "text-ivory/75 hover:bg-ivory/6 hover:text-ivory"}`}
              >
                <Icon className="size-4" strokeWidth={1.5} /> {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="space-y-0.5 border-t border-gold/25 px-2 py-3 text-sm">
        <Link href="/admin/preview" className="flex items-center gap-3 px-3 py-2 text-ivory/75 hover:text-ivory" target="_blank">
          <Eye className="size-4" strokeWidth={1.5} /> Preview drafts
        </Link>
        <Link href="/" className="flex items-center gap-3 px-3 py-2 text-ivory/75 hover:text-ivory" target="_blank">
          <ExternalLink className="size-4" strokeWidth={1.5} /> View public site
        </Link>
        <Link href="/admin/projects" className="flex items-center gap-3 px-3 py-2 text-ivory/75 hover:text-ivory">
          <Building2 className="size-4" strokeWidth={1.5} /> Projects
        </Link>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-2 text-left text-ivory/75 hover:text-ivory"
          data-testid="logout"
          onClick={async () => {
            await api("POST", "/api/auth/logout").catch(() => undefined);
            router.replace("/admin/login");
            router.refresh();
          }}
        >
          <LogOut className="size-4" strokeWidth={1.5} /> Sign out
        </button>
        <p className="truncate px-3 pt-2 text-[11px] text-ivory/40">{user.email}</p>
      </div>
    </nav>
  );

  return (
    <ToastProvider>
      <div className="min-h-dvh bg-[#f6f2ea]">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-wine lg:block">{nav}</aside>
        <div className={`fixed inset-0 z-40 bg-black/40 lg:hidden ${open ? "" : "hidden"}`} onClick={() => setOpen(false)} />
        <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-wine transition-transform lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`} aria-hidden={!open} inert={!open}>
          <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-4 text-ivory" aria-label="Close menu">
            <X className="size-5" />
          </button>
          {nav}
        </aside>
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-charcoal/10 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" className="text-plum">
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg text-plum">{project.name || "Tour Studio"}</span>
        </header>
        <main className="px-4 py-6 sm:px-8 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
      </div>
    </ToastProvider>
  );
}
