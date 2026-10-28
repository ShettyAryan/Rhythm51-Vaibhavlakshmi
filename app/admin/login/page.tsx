import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Tour Studio", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
  if (await getCurrentAdmin()) redirect(safeNext);
  return (
    <main className="grid min-h-dvh place-items-center bg-wine px-4">
      <div className="w-full max-w-sm border border-gold/40 bg-ivory p-8 shadow-2xl">
        <p className="eyebrow text-gold">Tour Studio</p>
        <h1 className="mt-2 font-display text-3xl text-plum">Administrator sign in</h1>
        <div className="ornament my-5" aria-hidden>
          <span className="size-1.5 rotate-45 bg-gold" />
        </div>
        <LoginForm next={safeNext} />
      </div>
    </main>
  );
}
